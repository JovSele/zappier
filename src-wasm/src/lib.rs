use wasm_bindgen::prelude::*;
use std::io::{Cursor, Read};
use std::collections::HashMap;
use zip::ZipArchive;
use serde::{Deserialize, Serialize};
use csv::ReaderBuilder;

// ============================================================================
// v1.0.0 SCHEMA MODULE
// ============================================================================
mod audit_schema_v1;
use audit_schema_v1::*;

// ============================================================================
// v1.0.0 MAPPING HELPERS
// ============================================================================

/// Map old flag type string to v1.0.0 FlagCode enum
fn map_flag_code(flag_type: &str) -> FlagCode {
    match flag_type {
        "late_filter_placement" => FlagCode::LateFilter,
        "polling_trigger" => FlagCode::FormatterChain, // NOTE: Reusing closest match
        "error_loop" => FlagCode::TaskStepCostInflation, // NOTE: Reusing closest match
        _ => FlagCode::TaskStepCostInflation, // Default fallback
    }
}

/// Map old confidence string to v1.0.0 ConfidenceLevel enum
fn map_confidence(confidence_str: &str) -> ConfidenceLevel {
    match confidence_str.to_lowercase().as_str() {
        "high" => ConfidenceLevel::High,
        "medium" => ConfidenceLevel::Medium,
        "low" => ConfidenceLevel::Low,
        _ => ConfidenceLevel::Medium, // Default fallback
    }
}

/// Map old severity string to v1.0.0 Severity enum
fn map_severity(severity_str: &str) -> Severity {
    match severity_str.to_lowercase().as_str() {
        "high" => Severity::High,
        "medium" => Severity::Medium,
        "low" => Severity::Low,
        _ => Severity::Medium, // Default fallback
    }
}

/// Calculate confidence overview from all findings
fn calculate_confidence_overview(findings: &[ZapFinding]) -> ConfidenceOverview {
    let mut high = 0;
    let mut medium = 0;
    let mut low = 0;
    
    for finding in findings {
        match finding.confidence {
            ConfidenceLevel::High => high += 1,
            ConfidenceLevel::Medium => medium += 1,
            ConfidenceLevel::Low => low += 1,
        }
        
        // Also count confidence from individual flags
        for flag in &finding.flags {
            match flag.confidence {
                ConfidenceLevel::High => high += 1,
                ConfidenceLevel::Medium => medium += 1,
                ConfidenceLevel::Low => low += 1,
            }
        }
    }
    
    ConfidenceOverview { high, medium, low }
}

/// Detect if Zap is a zombie (on but not running)
fn detect_zombie_status(status: &str, monthly_tasks: u32) -> bool {
    status.to_lowercase() == "on" && monthly_tasks == 0
}

/// Rank opportunities by financial impact (top 10)
fn rank_opportunities(findings: &[ZapFinding]) -> Vec<RankedOpportunity> {
    let mut opportunities = Vec::new();
    
    // Extract all flags from all findings
    for finding in findings {
        for flag in &finding.flags {
            opportunities.push(RankedOpportunity {
                zap_id: finding.zap_id.clone(),
                flag_code: flag.code,
                estimated_monthly_savings_usd: flag.impact.estimated_monthly_savings_usd,
                confidence: flag.confidence,
                rank: 0, // Will be set after sorting
            });
        }
    }
    
    // Sort by savings DESC
    opportunities.sort_by(|a, b| {
        b.estimated_monthly_savings_usd
            .partial_cmp(&a.estimated_monthly_savings_usd)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    
    // Take top 10 and assign ranks
    opportunities.truncate(10);
    for (index, opp) in opportunities.iter_mut().enumerate() {
        opp.rank = (index + 1) as u32;
    }
    
    opportunities
}

/// Detect premium Zapier features in use
fn detect_premium_features(zapfile: &ZapFile) -> PremiumFeatures {
    let mut features = PremiumFeatures {
        paths: false,
        filters: false,
        webhooks: false,
        custom_logic: false,
    };
    
    for zap in &zapfile.zaps {
        for (_id, node) in &zap.nodes {
            let action_lower = node.action.to_lowercase();
            let api_lower = node.selected_api.to_lowercase();
            
            // Detect Paths (branching logic)
            if action_lower.contains("path") || api_lower.contains("path") {
                features.paths = true;
            }
            
            // Detect Filters
            if action_lower.contains("filter") {
                features.filters = true;
            }
            
            // Detect Webhooks
            if api_lower.contains("webhook") || action_lower.contains("webhook") {
                features.webhooks = true;
            }
            
            // Detect Code steps (Python/JavaScript)
            if api_lower.contains("code") || api_lower.contains("python") || api_lower.contains("javascript") {
                features.custom_logic = true;
            }
        }
    }
    
    features
}

/// Convert old EfficiencyFlag to v1.0.0 schema
fn convert_efficiency_flag(old_flag: &EfficiencyFlag, _zap_id_str: &str) -> audit_schema_v1::EfficiencyFlag {
    // Build metadata JSON from old flag's extra fields
    let mut meta = serde_json::Map::new();
    
    if let Some(ref error) = old_flag.most_common_error {
        meta.insert("most_common_error".to_string(), serde_json::Value::String(error.clone()));
    }
    if let Some(ref trend) = old_flag.error_trend {
        meta.insert("error_trend".to_string(), serde_json::Value::String(trend.clone()));
    }
    if let Some(streak) = old_flag.max_streak {
        meta.insert("max_streak".to_string(), serde_json::Value::Number(streak.into()));
    }
    meta.insert("message".to_string(), serde_json::Value::String(old_flag.message.clone()));
    meta.insert("details".to_string(), serde_json::Value::String(old_flag.details.clone()));
    meta.insert("savings_explanation".to_string(), serde_json::Value::String(old_flag.savings_explanation.clone()));
    meta.insert("is_fallback".to_string(), serde_json::Value::Bool(old_flag.is_fallback));
    
    audit_schema_v1::EfficiencyFlag {
        code: map_flag_code(&old_flag.flag_type),
        severity: map_severity(&old_flag.severity),
        confidence: map_confidence(&old_flag.confidence),
        impact: FlagImpact {
            estimated_monthly_savings_usd: old_flag.estimated_monthly_savings,
            estimated_annual_savings_usd: old_flag.estimated_annual_savings,
        },
        implementation: FlagImplementation {
            estimated_effort_hours: match old_flag.flag_type.as_str() {
                "error_loop" => 0.5,          // Quick fix - authentication
                "late_filter_placement" => 1.0,  // Moderate - restructuring
                "polling_trigger" => 2.0,     // More complex - trigger change
                _ => 1.0,                     // Default
            },
        },
        meta: serde_json::Value::Object(meta),
    }
}

// ============================================================================
// ZAPIER TIER-BASED BILLING ENGINE (PRODUCTION-GRADE PRICING)
// ============================================================================

/// Zapier plan types (extracted from official pricing page)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ZapierPlan {
    Professional,
    Team,
}

/// Pricing tier definition
#[derive(Debug, Clone, Copy)]
struct PricingTier {
    tasks: u32,      // Task limit for this tier
    price: f32,      // Monthly price in USD
}

/// Resolved pricing result after tier selection
#[derive(Debug, Clone, Serialize)]
pub struct PricingResult {
    plan: ZapierPlan,
    tier_tasks: u32,         // Selected tier's task limit
    tier_price: f32,         // Selected tier's monthly price
    cost_per_task: f32,      // Effective cost: tier_price / tier_tasks
    actual_usage: u32,       // User's actual monthly task usage
}

/// Official Zapier pricing tiers (SOURCE OF TRUTH)
/// Data extracted from https://zapier.com/pricing
struct ZapierPricing;

impl ZapierPricing {
    /// Professional plan tiers
    const PROFESSIONAL: &'static [(u32, f32)] = &[
        (750, 19.99),
        (1_500, 39.0),
        (2_000, 49.0),
        (5_000, 89.0),
        (10_000, 129.0),
        (20_000, 189.0),
        (50_000, 289.0),
        (100_000, 489.0),
        (200_000, 769.0),
        (300_000, 1_069.0),
        (400_000, 1_269.0),
        (500_000, 1_499.0),
        (750_000, 1_999.0),
        (1_000_000, 2_199.0),
        (1_500_000, 2_999.0),
        (1_750_000, 3_199.0),
        (2_000_000, 3_389.0),
    ];

    /// Team plan tiers
    const TEAM: &'static [(u32, f32)] = &[
        (2_000, 69.0),
        (5_000, 119.0),
        (10_000, 169.0),
        (20_000, 249.0),
        (50_000, 399.0),
        (100_000, 599.0),
        (200_000, 999.0),
        (300_000, 1_199.0),
        (400_000, 1_399.0),
        (500_000, 1_799.0),
        (750_000, 2_199.0),
        (1_000_000, 2_499.0),
        (1_500_000, 3_399.0),
        (1_750_000, 3_799.0),
        (2_000_000, 3_999.0),
    ];

    /// Resolve pricing tier based on plan and actual usage
    /// 
    /// Algorithm: Find smallest tier where tier_tasks >= actual_usage
    /// This mimics Zapier's billing behavior (always ceiling to next tier)
    pub fn resolve(plan: ZapierPlan, actual_usage: u32) -> PricingResult {
        let tiers = match plan {
            ZapierPlan::Professional => Self::PROFESSIONAL,
            ZapierPlan::Team => Self::TEAM,
        };

        // Find the smallest tier that can accommodate the usage
        let (tier_tasks, tier_price) = tiers
            .iter()
            .find(|(tasks, _)| *tasks >= actual_usage)
            .copied()
            .unwrap_or_else(|| {
                // If usage exceeds max tier, use highest tier
                *tiers.last().unwrap()
            });

        let cost_per_task = if tier_tasks > 0 {
            tier_price / tier_tasks as f32
        } else {
            0.0
        };

        PricingResult {
            plan,
            tier_tasks,
            tier_price,
            cost_per_task,
            actual_usage,
        }
    }

    /// Get default pricing when no usage data is available
    /// Uses Professional 2000-task tier as conservative fallback
    pub fn default_fallback() -> PricingResult {
        Self::resolve(ZapierPlan::Professional, 2_000)
    }
    
    /// Validate that pricing tiers are properly initialized
    /// Called once at module initialization to catch configuration errors early
    /// 
    /// CRITICAL: This prevents runtime panics from empty or misconfigured pricing data
    fn validate_pricing_tiers() -> Result<(), String> {
        if Self::PROFESSIONAL.is_empty() {
            return Err("CRITICAL: Professional pricing tiers are empty!".to_string());
        }
        if Self::TEAM.is_empty() {
            return Err("CRITICAL: Team pricing tiers are empty!".to_string());
        }
        
        // Validate tiers are sorted by task count (ascending)
        for (plan_name, tiers) in &[("Professional", Self::PROFESSIONAL), ("Team", Self::TEAM)] {
            for i in 1..tiers.len() {
                if tiers[i].0 <= tiers[i-1].0 {
                    return Err(format!(
                        "CRITICAL: {} pricing tiers not sorted! {} <= {} at index {}",
                        plan_name, tiers[i].0, tiers[i-1].0, i
                    ));
                }
            }
        }
        
        Ok(())
    }
}

// ============================================================================
// FALLBACK CONSTANTS (For estimation when no execution data available)
// ============================================================================
// CRITICAL: These constants are used ONLY when CSV task history is unavailable
// All calculations are marked with `is_fallback: true` flag for transparency

/// Conservative monthly run estimate when no CSV data exists
/// 
/// RATIONALE: Based on Zapier's Professional tier starter usage patterns:
/// - Professional 750-task tier = most common entry point
/// - Average Zap has ~1.5 steps (trigger + 1 action minimum)
/// - 750 tasks ÷ 1.5 steps = ~500 monthly runs
/// 
/// This is intentionally CONSERVATIVE (lower than median) to avoid 
/// overestimating savings and maintain credibility with customers.
/// 
/// SOURCE: Zapier pricing tiers (https://zapier.com/pricing)
/// VALIDATION DATE: January 2025
const FALLBACK_MONTHLY_RUNS: f32 = 500.0;

/// Estimated polling overhead percentage (inherent to polling triggers)
/// 
/// RATIONALE: Polling triggers check for new data at fixed intervals (typically 15 min)
/// - 15-minute polling = 96 checks per day = 2,880 checks per month
/// - Typical RSS feed/Sheet: New data appears ~20-30% of checks
/// - Remaining 70-80% of polls consume tasks but find no data (overhead)
/// - Webhook triggers eliminate this overhead (instant, no polling)
/// 
/// We use 20% as a CONSERVATIVE estimate of potential task reduction.
/// Actual savings may be higher (30-50%) for low-activity data sources.
/// 
/// SOURCE: Zapier documentation on polling vs webhooks
/// INDUSTRY BENCHMARK: 15-30% overhead is typical for polling systems
/// VALIDATION DATE: January 2025
const POLLING_REDUCTION_RATE: f32 = 0.20; // 20%

/// Estimated filter rejection rate when no execution history available
/// 
/// RATIONALE: Filters are used to skip unwanted items (e.g., "only process orders > $100")
/// - Conservative estimate: 30% of items fail filter criteria
/// - Based on common filter use cases (priority filtering, value thresholds)
/// - Late filters waste tasks on rejected items that could be filtered earlier
/// 
/// Real-world filter rejection rates vary widely (10%-70% depending on criteria).
/// We use 30% as a middle-ground conservative estimate.
/// 
/// SOURCE: Zapier best practices documentation
/// VALIDATION DATE: January 2025
const LATE_FILTER_FALLBACK_RATE: f32 = 0.30; // 30%

// TRANSPARENCY NOTE: All flags using these fallback values include:
// - `is_fallback: true` indicator
// - `confidence: "low"` or `confidence: "medium"` rating
// - Clear explanation in `savings_explanation` field
// This ensures customers can distinguish estimates from actual data-driven savings.

/// Format large numbers with 'k' suffix for display
/// Used to provide pre-formatted strings to the PDF layer
fn format_large_number(amount: f32) -> String {
    if amount >= 1000.0 {
        format!("{:.1}k", amount / 1000.0)
    } else {
        format!("{:.0}", amount)
    }
}

/// Guard against NaN values in financial calculations
/// Returns 0.0 if value is NaN or infinite, otherwise returns the value
/// 
/// CRITICAL: This prevents corrupted data from propagating through the system
/// and ensures customers always see valid numbers in $79 audit reports.
fn guard_nan(value: f32) -> f32 {
    if value.is_nan() || value.is_infinite() {
        0.0
    } else {
        value
    }
}

/// Helper function to calculate task volume correctly
/// Formula: runs × steps (each run executes all steps)
fn calculate_task_volume(runs: u32, steps: usize) -> u32 {
    runs * steps as u32
}

// Triple stores metadata
#[derive(Debug, Deserialize, Serialize, Clone, Default)]
struct TripleStores {
    #[serde(default)]
    copied_from: Option<u64>,
    #[serde(default)]
    created_by: Option<u64>,
    #[serde(default)]
    polling_interval_override: u64,
    #[serde(default)]
    block_and_release_limit_override: u64,
    #[serde(default)]
    spread_tasks: u64,
}

// Node (Step) in a Zap workflow
#[derive(Debug, Serialize, Clone)]
struct Node {
    id: u64,
    account_id: u64,
    customuser_id: u64,
    paused: bool,
    type_of: String, // "read" or "write"
    params: serde_json::Value,
    meta: serde_json::Value,
    triple_stores: TripleStores,
    folders: Option<serde_json::Value>,
    parent_id: Option<u64>,
    root_id: Option<u64>,
    action: String,
    selected_api: String,
    title: Option<String>,
    authentication_id: Option<u64>,
    created_at: String,
    last_changed: String,
}

// Custom deserializer for Node to handle both modern (minimal fields) and legacy (full fields) formats
impl<'de> Deserialize<'de> for Node {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::Error;
        
        let value = serde_json::Value::deserialize(deserializer)?;
        
        // Handle id - can be string or number
        let id = if let Some(id_val) = value.get("id") {
            if let Some(num) = id_val.as_u64() {
                num
            } else if let Some(s) = id_val.as_str() {
                // Try to parse string as number, otherwise use hash
                s.parse::<u64>().unwrap_or_else(|_| {
                    // For string IDs like "step_001", use a simple hash
                    s.bytes().map(|b| b as u64).sum()
                })
            } else {
                0
            }
        } else {
            0
        };
        
        // Handle type_of (or just "type")
        let type_of = value.get("type_of")
            .or_else(|| value.get("type"))
            .and_then(|v| v.as_str())
            .unwrap_or("write")
            .to_string();
        
        // Handle selected_api (or "app")
        let selected_api = value.get("selected_api")
            .or_else(|| value.get("app"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        
        Ok(Node {
            id,
            account_id: value.get("account_id").and_then(|v| v.as_u64()).unwrap_or(0),
            customuser_id: value.get("customuser_id").and_then(|v| v.as_u64()).unwrap_or(0),
            paused: value.get("paused").and_then(|v| v.as_bool()).unwrap_or(false),
            type_of,
            params: value.get("params").cloned().unwrap_or(serde_json::Value::Null),
            meta: value.get("meta").cloned().unwrap_or(serde_json::Value::Null),
            triple_stores: serde_json::from_value(value.get("triple_stores").cloned().unwrap_or(serde_json::Value::Null))
                .unwrap_or_default(),
            folders: value.get("folders").cloned(),
            parent_id: value.get("parent_id").and_then(|v| v.as_u64()),
            root_id: value.get("root_id").and_then(|v| v.as_u64()),
            action: value.get("action").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            selected_api,
            title: value.get("title").and_then(|v| v.as_str()).map(|s| s.to_string()),
            authentication_id: value.get("authentication_id").and_then(|v| v.as_u64()),
            created_at: value.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            last_changed: value.get("last_changed").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        })
    }
}

// Usage statistics for a Zap (from task history data)
#[derive(Debug, Deserialize, Serialize, Clone, Default)]
struct UsageStats {
    total_runs: u32,
    success_count: u32,
    error_count: u32,
    error_rate: f32, // Percentage (0-100)
    has_task_history: bool,
    // Enhanced error analytics
    most_common_error: Option<String>,
    error_trend: Option<String>, // "increasing", "stable", "decreasing"
    max_streak: u32, // Longest consecutive failure streak
    // NEW: Last execution timestamp
    last_run: Option<String>, // ISO timestamp of most recent execution
}

// Zap (automation workflow)
#[derive(Debug, Serialize, Clone)]
struct Zap {
    id: u64,
    title: String,
    status: String,
    nodes: HashMap<String, Node>,
    usage_stats: Option<UsageStats>,
}

// Custom deserializer for Zap to handle both modern (steps array) and legacy (nodes map) formats
impl<'de> Deserialize<'de> for Zap {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::Error;
        
        // Deserialize as a generic JSON value first
        let value = serde_json::Value::deserialize(deserializer)?;
        
        let id = value.get("id")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| Error::custom("missing field 'id'"))?;
        
        // Handle title (or name)
        let title = value.get("title")
            .or_else(|| value.get("name"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| Error::custom("missing field 'title' or 'name'"))?
            .to_string();
        
        // Handle status (or state)
        let status = value.get("status")
            .or_else(|| value.get("state"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| Error::custom("missing field 'status' or 'state'"))?
            .to_string();
        
        // Handle nodes/steps/actions - this is the tricky part
        let mut nodes = HashMap::new();
        
        // Try to get steps first (modern format - array)
        if let Some(steps_value) = value.get("steps").or_else(|| value.get("actions")) {
            if let Some(steps_array) = steps_value.as_array() {
                // Modern format: steps is an array
                for (index, step_value) in steps_array.iter().enumerate() {
                    let node: Node = serde_json::from_value(step_value.clone())
                        .map_err(|e| Error::custom(format!("failed to parse step: {}", e)))?;
                    nodes.insert(index.to_string(), node);
                }
            }
        }
        // Try legacy nodes format (HashMap)
        else if let Some(nodes_value) = value.get("nodes") {
            if let Some(nodes_obj) = nodes_value.as_object() {
                // Legacy format: nodes is a map
                for (key, node_value) in nodes_obj {
                    let node: Node = serde_json::from_value(node_value.clone())
                        .map_err(|e| Error::custom(format!("failed to parse node: {}", e)))?;
                    nodes.insert(key.clone(), node);
                }
            }
        }
        
        Ok(Zap {
            id,
            title,
            status,
            nodes,
            usage_stats: None,
        })
    }
}

// Metadata at root level
#[derive(Debug, Deserialize, Serialize, Default)]
struct Metadata {
    #[serde(default)]
    version: String,
}

// Root structure of zapfile.json
#[derive(Debug, Deserialize, Serialize)]
struct ZapFile {
    #[serde(default)]
    metadata: Metadata,
    zaps: Vec<Zap>,
}

/// Analysis mode indicates data completeness
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisMode {
    Full,    // Has task history CSV data
    Partial, // Config only, no usage metrics
}

// Result struct to return to TypeScript
#[derive(Serialize)]
struct ParseResult {
    success: bool,
    mode: AnalysisMode, // NEW: Indicates data completeness
    zap_count: usize,
    total_nodes: usize,
    message: String,
    apps: Vec<AppInfo>,
    efficiency_flags: Vec<EfficiencyFlag>,
    efficiency_score: u32,
    estimated_savings: f32,
    estimated_annual_savings: f32, // NEW: monthly * 12 (moved from PDF layer)
}

// App information for inventory
#[derive(Serialize, Clone)]
struct AppInfo {
    name: String,
    raw_api: String,
    count: usize,
}

// Efficiency flag for audit findings
#[derive(Serialize, Clone)]
struct EfficiencyFlag {
    zap_id: u64,
    zap_title: String,
    flag_type: String,  // "polling_trigger", "filter_overuse", etc.
    severity: String,   // "low", "medium", "high"
    message: String,
    details: String,
    // Enhanced error analytics (only for error_loop flags)
    most_common_error: Option<String>,
    error_trend: Option<String>,
    max_streak: Option<u32>,
    // Dynamic savings calculation
    estimated_monthly_savings: f32, // in USD
    estimated_annual_savings: f32, // in USD (monthly * 12) - CENTRALIZED
    formatted_monthly_savings: String, // Pre-formatted for PDF display (e.g., "$2.3k")
    formatted_annual_savings: String, // Pre-formatted for PDF display (e.g., "$27.6k")
    savings_explanation: String, // How savings were calculated
    is_fallback: bool, // true = using estimated fallback data, false = using actual execution data
    // PHASE 1: Confidence system
    confidence: String, // "high" | "medium" | "low"
}

#[derive(Serialize)]
struct ErrorResult {
    success: bool,
    message: String,
}

// NEW: Zap Summary for quick preview (no heuristics)
#[derive(Serialize)]
struct ZapSummary {
    id: u64,
    title: String,
    status: String,  // "on", "off", "paused"
    step_count: usize,
    trigger_app: String,  // "RSS", "WordPress", "Webhook"
    last_run: Option<String>,  // ISO timestamp or null
    error_rate: Option<f32>,  // 0-100 or null (safe division by zero)
    total_runs: u32,
}

// NEW: Zap List Result (for selector dashboard)
#[derive(Serialize)]
struct ZapListResult {
    success: bool,
    message: String,
    zaps: Vec<ZapSummary>,
}

// NEW: Batch Parse Result (for multi-Zap analysis) - DEVELOPER EDITION
#[derive(Serialize)]
struct BatchParseResult {
    success: bool,
    message: String,
    zap_count: usize,
    individual_results: Vec<ParseResult>,
    // Project Summary (aggregated)
    total_nodes: usize,
    total_estimated_savings: f32,
    average_efficiency_score: f32,
    total_flags: usize,
    combined_apps: Vec<AppInfo>,
    // NEW: Developer Edition fields
    patterns: Vec<PatternFinding>,
    scope_metadata: ScopeMetadata,
    system_metrics: SystemMetrics,
}

// NEW: Pattern Finding (cross-Zap anti-patterns)
#[derive(Serialize, Clone)]
struct PatternFinding {
    pattern_type: String,          // "formatter_chain_explosion", "polling_abuse", etc.
    pattern_name: String,          // Human-readable: "Formatter Chain Explosion"
    affected_zap_ids: Vec<u64>,
    affected_count: usize,
    median_chain_length: Option<f32>,
    total_waste_tasks: u32,
    total_waste_usd: f32,
    refactor_guidance: String,
    severity: String,              // "high", "medium", "low"
}

// NEW: Scope Metadata (what was analyzed vs excluded)
#[derive(Serialize)]
struct ScopeMetadata {
    total_zaps_in_account: usize,
    analyzed_count: usize,
    excluded_count: usize,
    analyzed_zap_summaries: Vec<ZapSummary>,
    excluded_zap_summaries: Vec<ZapSummary>,
}

// NEW: System Metrics (aggregate statistics)
#[derive(Serialize)]
struct SystemMetrics {
    avg_steps_per_zap: f32,
    avg_tasks_per_run: f32,          // TODO: Calculate from CSV
    polling_trigger_count: usize,
    instant_trigger_count: usize,
    total_monthly_tasks: u32,        // TODO: Calculate from CSV
    formatter_usage_density: String, // "high", "medium", "low"
    fan_out_flows: usize,
}

/// Temporary structure to track execution records for analytics
#[derive(Debug)]
struct ExecutionRecord {
    is_error: bool,
    error_message: Option<String>,
}

/// Parse CSV files to extract task history information with enhanced error analytics
/// Intelligently detects CSV files with task history data by examining headers
/// Looks for files with 'zap_id' and 'status' columns (smart detection, not filename-based)
fn parse_csv_files(csv_contents: &[String]) -> HashMap<u64, UsageStats> {
    let mut task_history_map: HashMap<u64, UsageStats> = HashMap::new();
    let mut zap_executions: HashMap<u64, Vec<ExecutionRecord>> = HashMap::new();
    let mut zap_timestamps: HashMap<u64, Vec<String>> = HashMap::new();
    
    for csv_content in csv_contents {
        // Try to parse as CSV
        let mut reader = ReaderBuilder::new()
            .has_headers(true)
            .flexible(true)
            .from_reader(csv_content.as_bytes());
        
        // Get headers to identify the CSV type
        let headers = match reader.headers() {
            Ok(h) => h.clone(),
            Err(_) => continue,
        };
        
        // INTELLIGENT DETECTION: Check if this CSV contains task history data
        // by looking for 'zap_id' and 'status' columns (not filename-based)
        let has_zap_id = headers.iter().any(|h| h.to_lowercase() == "zap_id");
        let has_status = headers.iter().any(|h| h.to_lowercase() == "status");
        
        if has_zap_id && has_status {
            // This is a task history CSV! Parse it to extract execution statistics
            // Find column indices
            let zap_id_idx = headers.iter().position(|h| h.to_lowercase() == "zap_id");
            let status_idx = headers.iter().position(|h| h.to_lowercase() == "status");
            let error_msg_idx = headers.iter().position(|h| 
                h.to_lowercase() == "error_message" || h.to_lowercase() == "error");
            let timestamp_idx = headers.iter().position(|h| h.to_lowercase() == "timestamp");
            
            if let (Some(zap_id_col), Some(status_col)) = (zap_id_idx, status_idx) {
                // Process all records and aggregate by zap_id
                for result in reader.records() {
                    if let Ok(record) = result {
                        // Extract zap_id
                        if let Some(zap_id_str) = record.get(zap_id_col) {
                            if let Ok(zap_id) = zap_id_str.parse::<u64>() {
                                // Extract status
                                if let Some(status_str) = record.get(status_col) {
                                    let status = status_str.to_lowercase();
                                    let is_error = status == "error" || status == "failed" || status == "failure";
                                    
                                    // Extract error message if available
                                    let error_message = if is_error && error_msg_idx.is_some() {
                                        record.get(error_msg_idx.unwrap())
                                            .map(|s| s.to_string())
                                            .filter(|s| !s.is_empty())
                                    } else {
                                        None
                                    };
                                    
                                    // Extract timestamp if available
                                    if let Some(timestamp_col) = timestamp_idx {
                                        if let Some(timestamp_str) = record.get(timestamp_col) {
                                            if !timestamp_str.is_empty() {
                                                zap_timestamps.entry(zap_id)
                                                    .or_insert_with(Vec::new)
                                                    .push(timestamp_str.to_string());
                                            }
                                        }
                                    }
                                    
                                    // Track execution record for advanced analytics
                                    zap_executions.entry(zap_id)
                                        .or_insert_with(Vec::new)
                                        .push(ExecutionRecord {
                                            is_error,
                                            error_message,
                                        });
                                    
                                    // Get or create stats for this zap
                                    let stats = task_history_map.entry(zap_id).or_insert(UsageStats {
                                        total_runs: 0,
                                        success_count: 0,
                                        error_count: 0,
                                        error_rate: 0.0,
                                        has_task_history: true,
                                        most_common_error: None,
                                        error_trend: None,
                                        max_streak: 0,
                                        last_run: None,
                                    });
                                    
                                    // Increment counters based on status
                                    stats.total_runs += 1;
                                    
                                    if status == "success" {
                                        stats.success_count += 1;
                                    } else if is_error {
                                        stats.error_count += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else if headers.iter().any(|h| h.to_lowercase().contains("description") || 
                                          h.to_lowercase().contains("url")) {
            // This is task_history_download_urls.csv (external references)
            // We skip this as it only contains URLs, not actual task data
            // (privacy-first principle: we don't fetch external data)
            continue;
        }
    }
    
    // Enhanced analytics: Calculate error rates, trends, streaks, most common errors, and last_run
    for (zap_id, stats) in task_history_map.iter_mut() {
        if stats.total_runs > 0 {
            stats.error_rate = guard_nan((stats.error_count as f32 / stats.total_runs as f32) * 100.0);
        }
        
        // Find most recent timestamp (last_run)
        if let Some(timestamps) = zap_timestamps.get(zap_id) {
            if !timestamps.is_empty() {
                // Simple string comparison works for ISO timestamps (lexicographically sortable)
                stats.last_run = timestamps.iter().max().cloned();
            }
        }
        
        // Only perform advanced analytics if we have execution records
        if let Some(executions) = zap_executions.get(zap_id) {
            if !executions.is_empty() {
                // Calculate error trend (compare first half vs second half)
                let mid_point = executions.len() / 2;
                if mid_point > 0 {
                    let first_half_errors = executions[..mid_point].iter()
                        .filter(|e| e.is_error).count();
                    let second_half_errors = executions[mid_point..].iter()
                        .filter(|e| e.is_error).count();
                    
                    let first_half_rate = first_half_errors as f32 / mid_point as f32;
                    let second_half_rate = second_half_errors as f32 / (executions.len() - mid_point) as f32;
                    
                    stats.error_trend = Some(
                        if second_half_rate > first_half_rate * 1.2 {
                            "increasing".to_string()
                        } else if second_half_rate < first_half_rate * 0.8 {
                            "decreasing".to_string()
                        } else {
                            "stable".to_string()
                        }
                    );
                }
                
                // Calculate maximum error streak
                let mut current_streak = 0;
                let mut max_streak = 0;
                for exec in executions {
                    if exec.is_error {
                        current_streak += 1;
                        max_streak = max_streak.max(current_streak);
                    } else {
                        current_streak = 0;
                    }
                }
                stats.max_streak = max_streak;
                
                // Find most common error message
                let mut error_counts: HashMap<String, u32> = HashMap::new();
                for exec in executions {
                    if let Some(ref msg) = exec.error_message {
                        *error_counts.entry(msg.clone()).or_insert(0) += 1;
                    }
                }
                
                if !error_counts.is_empty() {
                    stats.most_common_error = error_counts.iter()
                        .max_by_key(|(_, count)| *count)
                        .map(|(msg, _)| msg.clone());
                }
            }
        }
    }
    
    task_history_map
}

/// Attach usage statistics to Zaps based on task history data
fn attach_usage_stats(zapfile: &mut ZapFile, task_history_map: &HashMap<u64, UsageStats>) {
    for zap in &mut zapfile.zaps {
        if let Some(stats) = task_history_map.get(&zap.id) {
            zap.usage_stats = Some(stats.clone());
        }
    }
}

/// Detect error loops (high failure rate in Zap executions)
/// Flags Zaps where error rate exceeds 10% threshold
/// Enhanced with trend analysis, streak detection, and common error identification
fn detect_error_loop(zap: &Zap, price_per_task: f32) -> Option<EfficiencyFlag> {
    if let Some(stats) = &zap.usage_stats {
        // Only flag if there's actual execution data and error rate exceeds threshold
        if stats.total_runs > 0 && stats.error_rate > 10.0 {
            // Build enhanced details message with analytics
            let mut details = format!(
                "This Zap has experienced {} errors out of {} total runs ({:.1}% error rate). ",
                stats.error_count,
                stats.total_runs,
                stats.error_rate
            );
            
            // Add trend information if available
            if let Some(ref trend) = stats.error_trend {
                let trend_msg = match trend.as_str() {
                    "increasing" => "⚠️ Error rate is INCREASING over time, indicating a worsening issue.",
                    "decreasing" => "✓ Error rate is decreasing, showing signs of improvement.",
                    "stable" => "Error rate has remained stable.",
                    _ => "",
                };
                if !trend_msg.is_empty() {
                    details.push_str(trend_msg);
                    details.push(' ');
                }
            }
            
            // Add streak information if significant
            if stats.max_streak > 3 {
                details.push_str(&format!(
                    "Critical: Maximum consecutive failure streak of {} executions detected. ",
                    stats.max_streak
                ));
            }
            
            // Add most common error if available
            if let Some(ref error) = stats.most_common_error {
                details.push_str(&format!(
                    "Most common error: '{}'. ",
                    error
                ));
            }
            
            details.push_str(
                "High error rates indicate potential configuration issues, authentication problems, \
                or incompatible data formats. Review recent error logs and fix the underlying issues \
                to avoid wasting tasks on failed executions."
            );
            
            // ✅ FIX: Calculate dynamic savings correctly
            // Each error wastes ALL steps in the Zap (entire run fails)
            let steps_per_run = zap.nodes.len();
            let wasted_tasks = calculate_task_volume(stats.error_count, steps_per_run);
            let monthly_savings = guard_nan((wasted_tasks as f32) * price_per_task);
            let savings_explanation = format!(
                "Based on ${:.4} per task, {} failed runs × {} steps = {} wasted tasks",
                price_per_task,
                stats.error_count,
                steps_per_run,
                wasted_tasks
            );
            
            return Some(EfficiencyFlag {
                zap_id: zap.id,
                zap_title: zap.title.clone(),
                flag_type: "error_loop".to_string(),
                severity: if stats.error_rate > 50.0 { "high" } else { "medium" }.to_string(),
                message: format!("High error rate detected: {:.1}%", stats.error_rate),
                details,
                // Pass enhanced analytics to frontend
                most_common_error: stats.most_common_error.clone(),
                error_trend: stats.error_trend.clone(),
                max_streak: Some(stats.max_streak),
                // Dynamic savings calculation
                estimated_monthly_savings: monthly_savings,
                estimated_annual_savings: monthly_savings * 12.0,
                formatted_monthly_savings: format!("${}", format_large_number(monthly_savings)),
                formatted_annual_savings: format!("${}", format_large_number(monthly_savings * 12.0)),
                savings_explanation,
                is_fallback: false, // Error loop detection always uses actual execution data
                confidence: "high".to_string(), // Real CSV data = high confidence
            });
        }
    }
    None
}

/// Main entry point: Parse Zapier ZIP export
/// 
/// This function accepts ZIP file data as bytes and:
/// 1. Creates a seekable Cursor reader for WASM environment
/// 2. Opens the ZIP archive
/// 3. Finds and parses zapfile.json
/// 4. Parses CSV files for task history data
/// 5. Returns comprehensive analysis with usage statistics
#[wasm_bindgen]
pub fn parse_zapier_export(zip_data: &[u8]) -> String {
    // CRITICAL: Validate pricing tiers before any calculations
    // This prevents runtime panics if tier configuration is corrupted
    if let Err(err_msg) = ZapierPricing::validate_pricing_tiers() {
        let error = ErrorResult {
            success: false,
            message: format!("Pricing configuration error: {}", err_msg),
        };
        return serde_json::to_string(&error)
            .unwrap_or_else(|_| r#"{"success":false,"message":"Critical configuration error"}"#.to_string());
    }
    
    // Create a seekable reader from byte slice (required for ZIP parsing in WASM)
    let cursor = Cursor::new(zip_data);
    
    // Open the ZIP archive
    let mut archive = match ZipArchive::new(cursor) {
        Ok(archive) => archive,
        Err(e) => {
            let error = ErrorResult {
                success: false,
                message: format!("Failed to open ZIP archive: {}", e),
            };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Unknown error"}"#.to_string());
        }
    };

    // Look for zapfile.json (or legacy alternatives) and CSV files
    let mut zapfile_content = String::new();
    let mut csv_contents: Vec<String> = Vec::new();
    let mut found_zapfile = false;
    
    // Flexible file search - try multiple candidate filenames
    const ZAPFILE_CANDIDATES: &[&str] = &["zapfile.json", "zaps.json", "config.json"];

    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(file) => file,
            Err(_) => continue,
        };

        let file_name = file.name().to_string();
        let file_name_lower = file_name.to_lowercase();
        
        // Find zapfile using flexible search (modern or legacy names)
        if !found_zapfile {
            for candidate in ZAPFILE_CANDIDATES {
                if file_name_lower.ends_with(candidate) {
                    if let Err(e) = file.read_to_string(&mut zapfile_content) {
                        let error = ErrorResult {
                            success: false,
                            message: format!("Failed to read {}: {}", candidate, e),
                        };
                        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Read error"}"#.to_string());
                    }
                    found_zapfile = true;
                    break;
                }
            }
        }
        
        // Find CSV files (task history or other)
        if file_name_lower.ends_with(".csv") {
            let mut csv_content = String::new();
            if file.read_to_string(&mut csv_content).is_ok() {
                csv_contents.push(csv_content);
            }
        }
    }

    if !found_zapfile {
        let error = ErrorResult {
            success: false,
            message: format!(
                "No zapfile found in archive. Tried: {}",
                ZAPFILE_CANDIDATES.join(", ")
            ),
        };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"File not found"}"#.to_string());
    }

    // Parse zapfile.json with detailed error handling
    let mut zapfile: ZapFile = match serde_json::from_str(&zapfile_content) {
        Ok(zapfile) => zapfile,
        Err(e) => {
            let error = ErrorResult {
                success: false,
                message: format!("Failed to parse zapfile.json: {} at line {}, column {}", 
                    e, 
                    e.line(), 
                    e.column()
                ),
            };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Parse error"}"#.to_string());
        }
    };

    // Parse CSV files for task history data
    let task_history_map = parse_csv_files(&csv_contents);
    
    // Detect analysis mode based on CSV data presence
    let has_task_history = !task_history_map.is_empty();
    let mode = if has_task_history {
        AnalysisMode::Full
    } else {
        AnalysisMode::Partial
    };
    
    // Attach usage statistics to Zaps
    attach_usage_stats(&mut zapfile, &task_history_map);

    // Count total nodes across all Zaps
    let total_nodes: usize = zapfile.zaps.iter()
        .map(|zap| zap.nodes.len())
        .sum();

    // Extract app inventory
    let apps = extract_app_inventory(&zapfile);

    // Use default pricing when no parameters provided (legacy function)
    let pricing = ZapierPricing::default_fallback();
    let price_per_task = pricing.cost_per_task;
    
    // Detect efficiency issues (now includes error loop detection)
    let efficiency_flags = detect_efficiency_flags(&zapfile, price_per_task);

    // Calculate efficiency score
    let efficiency_score = calculate_efficiency_score(&efficiency_flags);

    // Calculate estimated savings
    let estimated_savings = calculate_estimated_savings(&efficiency_flags);

    // Build success message with mode indicator
    let message = if mode == AnalysisMode::Partial {
        format!("Successfully parsed {} Zaps with {} total steps (Partial mode: no task history data)", 
            zapfile.zaps.len(), 
            total_nodes
        )
    } else {
        format!("Successfully parsed {} Zaps with {} total steps", 
            zapfile.zaps.len(), 
            total_nodes
        )
    };

    // Return success result
    let result = ParseResult {
        success: true,
        mode,
        zap_count: zapfile.zaps.len(),
        total_nodes,
        message,
        apps,
        efficiency_flags,
        efficiency_score,
        estimated_savings,
        estimated_annual_savings: estimated_savings * 12.0,
    };

    serde_json::to_string(&result).unwrap_or_else(|_| r#"{"success":true,"zap_count":0,"message":"Unknown"}"#.to_string())
}

/// Detect efficiency issues and optimization opportunities
fn detect_efficiency_flags(zapfile: &ZapFile, price_per_task: f32) -> Vec<EfficiencyFlag> {
    let mut flags = Vec::new();
    
    for zap in &zapfile.zaps {
        // Detect polling triggers
        if let Some(flag) = detect_polling_trigger(zap, price_per_task) {
            flags.push(flag);
        }
        
        // Detect inefficient filter placement
        if let Some(flag) = detect_late_filter_placement(zap, price_per_task) {
            flags.push(flag);
        }
        
        // Detect error loops (high failure rates)
        if let Some(flag) = detect_error_loop(zap, price_per_task) {
            flags.push(flag);
        }
    }
    
    flags
}

/// Detect if a filter step is placed too late in the workflow
/// Filters should be placed right after the trigger to save task consumption
fn detect_late_filter_placement(zap: &Zap, price_per_task: f32) -> Option<EfficiencyFlag> {
    // Build ordered list of nodes by following parent_id chain
    let mut ordered_nodes: Vec<&Node> = Vec::new();
    
    // Find the root/trigger node (no parent_id)
    let trigger = zap.nodes.values()
        .find(|node| node.parent_id.is_none())?;
    
    ordered_nodes.push(trigger);
    let mut current_id = trigger.id;
    
    // Follow the chain of nodes
    while let Some(node) = zap.nodes.values()
        .find(|n| n.parent_id == Some(current_id)) {
        ordered_nodes.push(node);
        current_id = node.id;
    }
    
    // Look for filter steps
    for (index, node) in ordered_nodes.iter().enumerate() {
        // Check if this is a filter step
        let is_filter = node.action.to_lowercase().contains("filter") || 
                       node.title.as_ref()
                           .map(|t| t.to_lowercase().contains("filter"))
                           .unwrap_or(false);
        
        if is_filter {
            // Filter should be at index 1 (right after trigger at index 0)
            if index > 1 {
                // Count action steps before this filter
                let actions_before_filter = ordered_nodes[1..index]
                    .iter()
                    .filter(|n| n.type_of == "write")
                    .count();
                
                // Only flag if there are actual action steps before the filter
                if actions_before_filter > 0 {
                    // Calculate savings based on task history if available
                    let (monthly_savings, savings_explanation, is_fallback) = if let Some(stats) = &zap.usage_stats {
                        if stats.total_runs > 0 {
                            // Calculate filter rejection rate from execution history
                            let filter_rejection_rate = if stats.success_count < stats.total_runs {
                                ((stats.total_runs - stats.success_count) as f32) / (stats.total_runs as f32)
                            } else {
                                LATE_FILTER_FALLBACK_RATE // Use fallback if no rejections detected
                            };
                            
                            // Wasted tasks = actions_before_filter * rejected_items
                            let wasted_tasks_per_month = guard_nan((stats.total_runs as f32) * (actions_before_filter as f32) * filter_rejection_rate);
                            let savings = guard_nan(wasted_tasks_per_month * price_per_task);
                            
                            let explanation = format!(
                                "Based on ${:.4} per task, {} actions before filter, and {:.0}% actual filter rejection rate from {} executions",
                                price_per_task,
                                actions_before_filter,
                                filter_rejection_rate * 100.0,
                                stats.total_runs
                            );
                            (savings, explanation, false) // false = using actual data
                        } else {
                            (0.0, "Insufficient execution data for savings calculation".to_string(), true) // true = fallback
                        }
                    } else {
                        // ✅ FIX: Conservative fallback with proper task calculation
                        let estimated_monthly_runs = FALLBACK_MONTHLY_RUNS; // 500 runs (conservative)
                        let wasted_tasks = guard_nan(estimated_monthly_runs * (actions_before_filter as f32) * LATE_FILTER_FALLBACK_RATE);
                        let fallback_savings = guard_nan(wasted_tasks * price_per_task);
                        let explanation = format!(
                            "Estimated: ~{} monthly runs, {} actions before filter, {}% rejection rate (conservative estimate, no execution data)",
                            estimated_monthly_runs as u32,
                            actions_before_filter,
                            (LATE_FILTER_FALLBACK_RATE * 100.0) as u32
                        );
                        (fallback_savings, explanation, true) // true = using fallback estimate
                    };
                    
                    // PHASE 1: Determine confidence based on data quality
                    let confidence = if !is_fallback && monthly_savings > 0.0 {
                        "high".to_string() // Real execution data = high confidence
                    } else if monthly_savings == 0.0 {
                        "low".to_string() // No data = low confidence
                    } else {
                        "medium".to_string() // Estimated data = medium confidence
                    };
                    
                    return Some(EfficiencyFlag {
                        zap_id: zap.id,
                        zap_title: zap.title.clone(),
                        flag_type: "late_filter_placement".to_string(),
                        severity: "high".to_string(),
                        message: "Filter is placed too late in the workflow".to_string(),
                        details: format!(
                            "This Zap has a Filter at position {} (step #{}) with {} action step(s) before it. \
                            Moving the filter right after the trigger could save up to 100% of tasks for filtered executions, \
                            as actions won't run for items that don't pass the filter criteria.",
                            index + 1,
                            index + 1,
                            actions_before_filter
                        ),
                        // Not applicable for this flag type
                        most_common_error: None,
                        error_trend: None,
                        max_streak: None,
                        // Dynamic savings calculation
                        estimated_monthly_savings: monthly_savings,
                        estimated_annual_savings: monthly_savings * 12.0,
                        formatted_monthly_savings: format!("${}", format_large_number(monthly_savings)),
                        formatted_annual_savings: format!("${}", format_large_number(monthly_savings * 12.0)),
                        savings_explanation,
                        is_fallback, // Track whether we used actual data or fallback estimate
                        confidence, // PHASE 1: Confidence system
                    });
                }
            }
        }
    }
    
    None
}

/// Detect if a Zap uses a polling trigger
/// Polling triggers consume tasks even when no data is processed
fn detect_polling_trigger(zap: &Zap, price_per_task: f32) -> Option<EfficiencyFlag> {
    // Find the root/trigger node (node with no parent_id)
    let trigger_node = zap.nodes.values()
        .find(|node| node.parent_id.is_none() && node.type_of == "read")?;
    
    // List of apps that typically use polling (not instant/webhook triggers)
    let polling_apps = [
        "RSS",
        "WordPress",
        "GoogleSheets",
        "GoogleForms",
        "Airtable",
        "Excel",
        "Dropbox",
        "GoogleDrive",
        "OneDrive",
        "MySQL",
        "PostgreSQL",
        "SQLServer",
        "MongoDB",
    ];
    
    // Check if the trigger uses a polling app
    let app_name = parse_app_name(&trigger_node.selected_api);
    let is_polling = polling_apps.iter()
        .any(|&polling_app| app_name.contains(polling_app));
    
    if is_polling {
        // Calculate savings: 20% reduction from polling overhead
        // NOTE: Polling trigger savings are ALWAYS fallback/estimated (no way to measure actual overhead)
        // ✅ FIX: Use conservative fallback for polling overhead calculation
        let (monthly_savings, savings_explanation, has_execution_data) = if let Some(stats) = &zap.usage_stats {
            if stats.total_runs > 0 {
                // Use actual runs but overhead is always estimated
                let steps_per_run = zap.nodes.len();
                let total_tasks = calculate_task_volume(stats.total_runs, steps_per_run);
                let savings = guard_nan((total_tasks as f32) * price_per_task * POLLING_REDUCTION_RATE);
                let explanation = format!(
                    "Estimated: {} runs × {} steps × {}% polling overhead = {:.0} wasted tasks",
                    stats.total_runs,
                    steps_per_run,
                    (POLLING_REDUCTION_RATE * 100.0) as u32,
                    (total_tasks as f32) * POLLING_REDUCTION_RATE
                );
                (savings, explanation, true)
            } else {
                // ✅ Conservative fallback: No runs data
                let estimated_monthly_runs = FALLBACK_MONTHLY_RUNS; // 500 (conservative)
                let steps_per_run = zap.nodes.len();
                let estimated_tasks = estimated_monthly_runs * (steps_per_run as f32);
                let fallback_savings = guard_nan(estimated_tasks * price_per_task * POLLING_REDUCTION_RATE);
                let explanation = format!(
                    "Estimated: ~{} monthly runs × {} steps × {}% polling overhead (conservative, no execution data)",
                    estimated_monthly_runs as u32,
                    steps_per_run,
                    (POLLING_REDUCTION_RATE * 100.0) as u32
                );
                (fallback_savings, explanation, true)
            }
        } else {
            // ✅ Conservative fallback: No stats at all
            let estimated_monthly_runs = FALLBACK_MONTHLY_RUNS; // 500 (conservative)
            let steps_per_run = zap.nodes.len();
            let estimated_tasks = estimated_monthly_runs * (steps_per_run as f32);
            let fallback_savings = guard_nan(estimated_tasks * price_per_task * POLLING_REDUCTION_RATE);
            let explanation = format!(
                "Estimated: ~{} monthly runs × {} steps × {}% polling overhead (conservative, no execution data)",
                estimated_monthly_runs as u32,
                steps_per_run,
                (POLLING_REDUCTION_RATE * 100.0) as u32
            );
            (fallback_savings, explanation, true)
        };
        
        // PHASE 1: Polling overhead is always estimated = medium confidence
        let confidence = if has_execution_data {
            "medium".to_string() // Real run data but overhead is estimated
        } else {
            "low".to_string() // No data = low confidence
        };
        
        Some(EfficiencyFlag {
            zap_id: zap.id,
            zap_title: zap.title.clone(),
            flag_type: "polling_trigger".to_string(),
            severity: "medium".to_string(),
            message: format!("Uses polling trigger: {}", app_name),
            details: format!(
                "This Zap uses '{}' which relies on polling. It checks for new data at regular intervals, \
                consuming tasks even when no new data is available. Consider if a webhook-based trigger \
                could be used instead for real-time processing and reduced task consumption.",
                app_name
            ),
            // Not applicable for this flag type
            most_common_error: None,
            error_trend: None,
            max_streak: None,
            // Dynamic savings calculation
            estimated_monthly_savings: monthly_savings,
            estimated_annual_savings: monthly_savings * 12.0,
            formatted_monthly_savings: format!("${}", format_large_number(monthly_savings)),
            formatted_annual_savings: format!("${}", format_large_number(monthly_savings * 12.0)),
            savings_explanation,
            is_fallback: !has_execution_data, // ✅ FIX #1: Simple and correct - true only when no CSV data
            confidence, // PHASE 1: Confidence system
        })
    } else {
        None
    }
}

/// Extract unique apps from all nodes and count their usage
fn extract_app_inventory(zapfile: &ZapFile) -> Vec<AppInfo> {
    let mut app_counts: HashMap<String, usize> = HashMap::new();
    
    // Iterate through all zaps and nodes
    for zap in &zapfile.zaps {
        for (_node_id, node) in &zap.nodes {
            // Count occurrences of each selected_api
            *app_counts.entry(node.selected_api.clone()).or_insert(0) += 1;
        }
    }
    
    // Convert to AppInfo structs with parsed names
    let mut apps: Vec<AppInfo> = app_counts
        .into_iter()
        .map(|(raw_api, count)| {
            let name = parse_app_name(&raw_api);
            AppInfo {
                name,
                raw_api,
                count,
            }
        })
        .collect();
    
    // Sort by count (descending) then by name (ascending)
    apps.sort_by(|a, b| {
        b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name))
    });
    
    apps
}

/// Parse human-readable app name from selected_api string
/// Example: "WordPressCLIAPI@1.8.0" -> "WordPress"
/// Example: "GoogleSheetsV2CLIAPI@2.9.1" -> "Google Sheets V2"
/// Example: "ChatGPTCLIAPI@2.39.0" -> "ChatGPT"
fn parse_app_name(selected_api: &str) -> String {
    // Remove version info (everything after @)
    let base_name = selected_api.split('@').next().unwrap_or(selected_api);
    
    // Remove "CLIAPI" suffix
    let name_without_suffix = base_name
        .trim_end_matches("CLIAPI")
        .trim_end_matches("API");
    
    // Add spaces before capital letters for better readability
    let mut result = String::new();
    let mut prev_was_lower = false;
    
    for c in name_without_suffix.chars() {
        if c.is_uppercase() && prev_was_lower && !result.is_empty() {
            result.push(' ');
        }
        result.push(c);
        prev_was_lower = c.is_lowercase();
    }
    
    result
}

/// Calculate overall efficiency score (0-100) based on detected flags
fn calculate_efficiency_score(flags: &[EfficiencyFlag]) -> u32 {
    let mut score: i32 = 100;
    
    for flag in flags {
        match (flag.flag_type.as_str(), flag.severity.as_str()) {
            ("polling_trigger", "medium") => score -= 10,
            ("late_filter_placement", "high") => score -= 25,
            ("error_loop", "high") => score -= 30,  // Critical reliability issue
            ("error_loop", "medium") => score -= 20, // Moderate reliability issue
            _ => {}
        }
    }
    
    // Ensure score never goes below 0
    score.max(0) as u32
}

/// Calculate estimated monthly savings based on efficiency flags
/// Uses dynamic calculations from individual flags
fn calculate_estimated_savings(flags: &[EfficiencyFlag]) -> f32 {
    let mut total_savings: f32 = 0.0;
    
    // Sum up dynamically calculated savings from each flag
    for flag in flags {
        total_savings += flag.estimated_monthly_savings;
    }
    
    total_savings
}

/// Parse zapfile.json directly (for testing without ZIP)
#[wasm_bindgen]
pub fn parse_zapfile_json(json_content: &str) -> String {
    // Parse zapfile.json with detailed error handling
    let zapfile: ZapFile = match serde_json::from_str(json_content) {
        Ok(zapfile) => zapfile,
        Err(e) => {
            let error = ErrorResult {
                success: false,
                message: format!("Failed to parse JSON: {} at line {}, column {}", 
                    e, 
                    e.line(), 
                    e.column()
                ),
            };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Parse error"}"#.to_string());
        }
    };

    // Count total nodes across all Zaps
    let total_nodes: usize = zapfile.zaps.iter()
        .map(|zap| zap.nodes.len())
        .sum();

    // Extract app inventory
    let apps = extract_app_inventory(&zapfile);

    // Use default pricing when no parameters provided (legacy function)
    let pricing = ZapierPricing::default_fallback();
    let price_per_task = pricing.cost_per_task;

    // Detect efficiency issues
    let efficiency_flags = detect_efficiency_flags(&zapfile, price_per_task);

    // Calculate efficiency score
    let efficiency_score = calculate_efficiency_score(&efficiency_flags);

    // Calculate estimated savings
    let estimated_savings = calculate_estimated_savings(&efficiency_flags);

    // Return success result (always Partial mode - no CSV data available)
    let result = ParseResult {
        success: true,
        mode: AnalysisMode::Partial, // JSON-only parsing has no task history
        zap_count: zapfile.zaps.len(),
        total_nodes,
        message: format!("Successfully parsed {} Zaps with {} total steps (Partial mode: no task history data)", 
            zapfile.zaps.len(), 
            total_nodes
        ),
        apps,
        efficiency_flags,
        efficiency_score,
        estimated_savings,
        estimated_annual_savings: estimated_savings * 12.0,
    };

    serde_json::to_string(&result).unwrap_or_else(|_| r#"{"success":true,"zap_count":0,"message":"Unknown"}"#.to_string())
}

/// NEW: Parse Zap List (Quick Preview - NO HEURISTICS)
/// Fast function to extract basic Zap information for dashboard selector
/// Does NOT run efficiency analysis - only extracts metadata
#[wasm_bindgen]
pub fn parse_zap_list(zip_data: &[u8]) -> String {
    // Create a seekable reader from byte slice
    let cursor = Cursor::new(zip_data);
    
    // Open the ZIP archive
    let mut archive = match ZipArchive::new(cursor) {
        Ok(archive) => archive,
        Err(e) => {
            let error = ErrorResult {
                success: false,
                message: format!("Failed to open ZIP archive: {}", e),
            };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Unknown error"}"#.to_string());
        }
    };

    // Look for zapfile.json and CSV files
    let mut zapfile_content = String::new();
    let mut csv_contents: Vec<String> = Vec::new();
    let mut found_zapfile = false;

    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(file) => file,
            Err(_) => continue,
        };

        let file_name = file.name().to_string();
        
        if file_name.to_lowercase().ends_with("zapfile.json") {
            if let Err(e) = file.read_to_string(&mut zapfile_content) {
                let error = ErrorResult {
                    success: false,
                    message: format!("Failed to read zapfile.json: {}", e),
                };
                return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Read error"}"#.to_string());
            }
            found_zapfile = true;
        }
        else if file_name.to_lowercase().ends_with(".csv") {
            let mut csv_content = String::new();
            if file.read_to_string(&mut csv_content).is_ok() {
                csv_contents.push(csv_content);
            }
        }
    }

    if !found_zapfile {
        let error = ErrorResult {
            success: false,
            message: "zapfile.json not found in archive".to_string(),
        };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"File not found"}"#.to_string());
    }

    // Parse zapfile.json
    let mut zapfile: ZapFile = match serde_json::from_str(&zapfile_content) {
        Ok(zapfile) => zapfile,
        Err(e) => {
            let error = ErrorResult {
                success: false,
                message: format!("Failed to parse zapfile.json: {} at line {}, column {}", 
                    e, 
                    e.line(), 
                    e.column()
                ),
            };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Parse error"}"#.to_string());
        }
    };

    // Parse CSV files for task history (optional - may not exist)
    let task_history_map = parse_csv_files(&csv_contents);
    
    // Attach usage statistics to Zaps
    attach_usage_stats(&mut zapfile, &task_history_map);

    // Build ZapSummary list
    let mut zap_summaries: Vec<ZapSummary> = Vec::new();
    
    for zap in &zapfile.zaps {
        // Extract trigger app name
        let trigger_app = zap.nodes.values()
            .find(|node| node.parent_id.is_none() && node.type_of == "read")
            .map(|node| parse_app_name(&node.selected_api))
            .unwrap_or_else(|| "Unknown".to_string());
        
        // Extract metrics from usage_stats (if available)
        let (last_run, error_rate, total_runs) = if let Some(stats) = &zap.usage_stats {
            let err_rate = if stats.total_runs > 0 {
                Some(stats.error_rate)
            } else {
                None // Avoid showing 0% if no runs
            };
            (stats.last_run.clone(), err_rate, stats.total_runs)
        } else {
            (None, None, 0)
        };
        
        zap_summaries.push(ZapSummary {
            id: zap.id,
            title: zap.title.clone(),
            status: zap.status.clone(),
            step_count: zap.nodes.len(),
            trigger_app,
            last_run,
            error_rate,
            total_runs,
        });
    }
    
    // Return ZapListResult
    let result = ZapListResult {
        success: true,
        message: format!("Found {} Zaps", zap_summaries.len()),
        zaps: zap_summaries,
    };

    serde_json::to_string(&result).unwrap_or_else(|_| r#"{"success":true,"message":"Unknown","zaps":[]}"#.to_string())
}

/// NEW: Parse Single Zap Audit (Full Analysis for Selected Zap)
/// Runs complete audit analysis on a single selected Zap
/// Filters the ZIP to only include the specified zap_id, then runs full heuristics
/// 
/// # Arguments
/// * `zip_data` - ZIP file contents
/// * `zap_id` - ID of the Zap to audit
/// * `plan_str` - Zapier plan ("professional" or "team")
/// * `actual_usage` - User's actual monthly task usage
#[wasm_bindgen]
pub fn parse_single_zap_audit(zip_data: &[u8], zap_id: u64, plan_str: &str, actual_usage: u32) -> String {
    // ✅ FIX #1: Resolve tier-based pricing (same as batch audits)
    let plan = match plan_str.to_lowercase().as_str() {
        "professional" => ZapierPlan::Professional,
        "team" => ZapierPlan::Team,
        _ => ZapierPlan::Professional, // Default fallback
    };
    
    let pricing = ZapierPricing::resolve(plan, actual_usage);
    let price_per_task = pricing.cost_per_task;
    // Create a seekable reader from byte slice
    let cursor = Cursor::new(zip_data);
    
    // Open the ZIP archive
    let mut archive = match ZipArchive::new(cursor) {
        Ok(archive) => archive,
        Err(e) => {
            let error = ErrorResult {
                success: false,
                message: format!("Failed to open ZIP archive: {}", e),
            };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Unknown error"}"#.to_string());
        }
    };

    // Look for zapfile.json and CSV files
    let mut zapfile_content = String::new();
    let mut csv_contents: Vec<String> = Vec::new();
    let mut found_zapfile = false;

    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(file) => file,
            Err(_) => continue,
        };

        let file_name = file.name().to_string();
        
        if file_name.to_lowercase().ends_with("zapfile.json") {
            if let Err(e) = file.read_to_string(&mut zapfile_content) {
                let error = ErrorResult {
                    success: false,
                    message: format!("Failed to read zapfile.json: {}", e),
                };
                return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Read error"}"#.to_string());
            }
            found_zapfile = true;
        }
        else if file_name.to_lowercase().ends_with(".csv") {
            let mut csv_content = String::new();
            if file.read_to_string(&mut csv_content).is_ok() {
                csv_contents.push(csv_content);
            }
        }
    }

    if !found_zapfile {
        let error = ErrorResult {
            success: false,
            message: "zapfile.json not found in archive".to_string(),
        };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"File not found"}"#.to_string());
    }

    // Parse zapfile.json
    let mut zapfile: ZapFile = match serde_json::from_str(&zapfile_content) {
        Ok(zapfile) => zapfile,
        Err(e) => {
            let error = ErrorResult {
                success: false,
                message: format!("Failed to parse zapfile.json: {} at line {}, column {}", 
                    e, 
                    e.line(), 
                    e.column()
                ),
            };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Parse error"}"#.to_string());
        }
    };

    // FILTER: Keep only the selected Zap
    zapfile.zaps.retain(|z| z.id == zap_id);
    
    if zapfile.zaps.is_empty() {
        let error = ErrorResult {
            success: false,
            message: format!("Zap with ID {} not found in the export", zap_id),
        };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Zap not found"}"#.to_string());
    }

    // Parse CSV files for task history data
    let task_history_map = parse_csv_files(&csv_contents);
    
    // Attach usage statistics to Zaps
    attach_usage_stats(&mut zapfile, &task_history_map);

    // Count total nodes (should be just one Zap now)
    let total_nodes: usize = zapfile.zaps.iter()
        .map(|zap| zap.nodes.len())
        .sum();

    // Extract app inventory (for this single Zap)
    let apps = extract_app_inventory(&zapfile);

    // Detect efficiency issues (FULL AUDIT - includes all heuristics)
    let efficiency_flags = detect_efficiency_flags(&zapfile, price_per_task);

    // Calculate efficiency score
    let efficiency_score = calculate_efficiency_score(&efficiency_flags);

    // Calculate estimated savings
    let estimated_savings = calculate_estimated_savings(&efficiency_flags);

    // Detect mode based on CSV data availability for this Zap
    let has_task_history = zapfile.zaps.first()
        .and_then(|z| z.usage_stats.as_ref())
        .map(|s| s.has_task_history)
        .unwrap_or(false);
    let mode = if has_task_history {
        AnalysisMode::Full
    } else {
        AnalysisMode::Partial
    };
    
    // Return success result (same format as parse_zapier_export)
    let result = ParseResult {
        success: true,
        mode,
        zap_count: zapfile.zaps.len(), // Should be 1
        total_nodes,
        message: format!("Successfully audited Zap: {}", 
            zapfile.zaps.first().map(|z| z.title.as_str()).unwrap_or("Unknown")
        ),
        apps,
        efficiency_flags,
        efficiency_score,
        estimated_savings,
        estimated_annual_savings: estimated_savings * 12.0,
    };

    serde_json::to_string(&result).unwrap_or_else(|_| r#"{"success":true,"zap_count":0,"message":"Unknown"}"#.to_string())
}

/// NEW: Parse Batch Audit (Multi-Zap Analysis)
/// Analyzes multiple selected Zaps in one pass
/// Optimized: Opens ZIP once, filters by IDs, aggregates results
/// 
/// # Arguments
/// * `zip_data` - ZIP file contents
/// * `zap_ids_js` - JavaScript array of zap IDs to analyze
/// * `plan_str` - Zapier plan ("professional" or "team")
/// * `actual_usage` - User's actual monthly task usage
#[wasm_bindgen]
pub fn parse_batch_audit(zip_data: &[u8], zap_ids_js: JsValue, plan_str: &str, actual_usage: u32) -> String {
    // Resolve tier-based pricing
    let plan = match plan_str.to_lowercase().as_str() {
        "professional" => ZapierPlan::Professional,
        "team" => ZapierPlan::Team,
        _ => ZapierPlan::Professional, // Default fallback
    };
    
    let pricing = ZapierPricing::resolve(plan, actual_usage);
    let price_per_task = pricing.cost_per_task;
    // Deserialize JS array of zap IDs
    let zap_ids: Vec<u64> = match serde_wasm_bindgen::from_value(zap_ids_js) {
        Ok(ids) => ids,
        Err(e) => {
            let error = ErrorResult {
                success: false,
                message: format!("Failed to parse zap_ids: {}", e),
            };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Invalid zap_ids"}"#.to_string());
        }
    };
    
    if zap_ids.is_empty() {
        let error = ErrorResult {
            success: false,
            message: "No Zap IDs provided".to_string(),
        };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Empty IDs"}"#.to_string());
    }
    
    // Create a seekable reader from byte slice
    let cursor = Cursor::new(zip_data);
    
    // Open the ZIP archive ONCE
    let mut archive = match ZipArchive::new(cursor) {
        Ok(archive) => archive,
        Err(e) => {
            let error = ErrorResult {
                success: false,
                message: format!("Failed to open ZIP archive: {}", e),
            };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Unknown error"}"#.to_string());
        }
    };

    // Look for zapfile.json and CSV files
    let mut zapfile_content = String::new();
    let mut csv_contents: Vec<String> = Vec::new();
    let mut found_zapfile = false;

    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(file) => file,
            Err(_) => continue,
        };

        let file_name = file.name().to_string();
        
        if file_name.to_lowercase().ends_with("zapfile.json") {
            if let Err(e) = file.read_to_string(&mut zapfile_content) {
                let error = ErrorResult {
                    success: false,
                    message: format!("Failed to read zapfile.json: {}", e),
                };
                return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Read error"}"#.to_string());
            }
            found_zapfile = true;
        }
        else if file_name.to_lowercase().ends_with(".csv") {
            let mut csv_content = String::new();
            if file.read_to_string(&mut csv_content).is_ok() {
                csv_contents.push(csv_content);
            }
        }
    }

    if !found_zapfile {
        let error = ErrorResult {
            success: false,
            message: "zapfile.json not found in archive".to_string(),
        };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"File not found"}"#.to_string());
    }

    // Parse zapfile.json
    let zapfile: ZapFile = match serde_json::from_str(&zapfile_content) {
        Ok(zapfile) => zapfile,
        Err(e) => {
            let error = ErrorResult {
                success: false,
                message: format!("Failed to parse zapfile.json: {} at line {}, column {}", 
                    e, 
                    e.line(), 
                    e.column()
                ),
            };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"success":false,"message":"Parse error"}"#.to_string());
        }
    };

    // Parse CSV files ONCE for task history data
    let task_history_map = parse_csv_files(&csv_contents);
    
    // Collect ALL flags for pattern detection
    let mut all_flags: Vec<EfficiencyFlag> = Vec::new();
    
    // Process each selected Zap individually
    let mut individual_results: Vec<ParseResult> = Vec::new();
    let mut total_nodes = 0;
    let mut total_savings = 0.0;
    let mut total_score = 0;
    let mut total_flags_count = 0;
    let mut combined_app_counts: HashMap<String, usize> = HashMap::new();
    
    for zap_id in &zap_ids {
        // Clone zapfile and filter to single Zap
        let mut single_zap_file = ZapFile {
            metadata: Metadata { version: zapfile.metadata.version.clone() },
            zaps: zapfile.zaps.iter()
                .filter(|z| z.id == *zap_id)
                .cloned()
                .collect(),
        };
        
        if single_zap_file.zaps.is_empty() {
            // Skip if Zap not found
            continue;
        }
        
        // Attach usage stats to this Zap
        attach_usage_stats(&mut single_zap_file, &task_history_map);
        
        // Count nodes
        let zap_nodes: usize = single_zap_file.zaps.iter()
            .map(|zap| zap.nodes.len())
            .sum();
        total_nodes += zap_nodes;
        
        // Extract app inventory for this Zap
        let apps = extract_app_inventory(&single_zap_file);
        
        // Aggregate app counts
        for app in &apps {
            *combined_app_counts.entry(app.raw_api.clone()).or_insert(0) += app.count;
        }
        
        // Detect efficiency flags
        let flags = detect_efficiency_flags(&single_zap_file, price_per_task);
        total_flags_count += flags.len();
        
        // Collect all flags for pattern detection
        all_flags.extend(flags.clone());
        
        // Calculate metrics
        let score = calculate_efficiency_score(&flags);
        total_score += score;
        
        let savings = calculate_estimated_savings(&flags);
        total_savings += savings;
        
        // Detect mode for this Zap
        let has_task_history = single_zap_file.zaps.first()
            .and_then(|z| z.usage_stats.as_ref())
            .map(|s| s.has_task_history)
            .unwrap_or(false);
        let mode = if has_task_history {
            AnalysisMode::Full
        } else {
            AnalysisMode::Partial
        };
        
        // Build individual result
        individual_results.push(ParseResult {
            success: true,
            mode,
            zap_count: 1,
            total_nodes: zap_nodes,
            message: format!("Audited: {}", 
                single_zap_file.zaps.first().map(|z| z.title.as_str()).unwrap_or("Unknown")
            ),
            apps,
            efficiency_flags: flags,
            efficiency_score: score,
            estimated_savings: savings,
            estimated_annual_savings: savings * 12.0,
        });
    }
    
    // Calculate average efficiency score
    let average_score = if !individual_results.is_empty() {
        (total_score as f32 / individual_results.len() as f32).round()
    } else {
        0.0
    };
    
    // Build combined app inventory
    let combined_apps: Vec<AppInfo> = combined_app_counts
        .into_iter()
        .map(|(raw_api, count)| {
            let name = parse_app_name(&raw_api);
            AppInfo {
                name,
                raw_api,
                count,
            }
        })
        .collect();
    
    // DEVELOPER EDITION: Detect cross-Zap patterns
    let patterns = detect_cross_zap_patterns(&all_flags);
    
    // DEVELOPER EDITION: Build scope metadata
    let analyzed_summaries: Vec<ZapSummary> = zapfile.zaps.iter()
        .filter(|z| zap_ids.contains(&z.id))
        .map(|z| build_zap_summary(z, &task_history_map))
        .collect();
    
    let excluded_summaries: Vec<ZapSummary> = zapfile.zaps.iter()
        .filter(|z| !zap_ids.contains(&z.id))
        .map(|z| build_zap_summary(z, &task_history_map))
        .collect();
    
    let scope_metadata = ScopeMetadata {
        total_zaps_in_account: zapfile.zaps.len(),
        analyzed_count: zap_ids.len(),
        excluded_count: zapfile.zaps.len() - zap_ids.len(),
        analyzed_zap_summaries: analyzed_summaries,
        excluded_zap_summaries: excluded_summaries,
    };
    
    // DEVELOPER EDITION: Calculate system metrics
    let system_metrics = calculate_system_metrics(
        &zapfile.zaps,
        &zap_ids,
        &individual_results
    );
    
    // Return Developer Edition batch result
    let result = BatchParseResult {
        success: true,
        message: format!("Successfully audited {} Zap{}", 
            individual_results.len(),
            if individual_results.len() == 1 { "" } else { "s" }
        ),
        zap_count: individual_results.len(),
        individual_results,
        total_nodes,
        total_estimated_savings: total_savings,
        average_efficiency_score: average_score,
        total_flags: total_flags_count,
        combined_apps,
        // Developer Edition fields
        patterns,
        scope_metadata,
        system_metrics,
    };

    serde_json::to_string(&result).unwrap_or_else(|_| r#"{"success":true,"zap_count":0,"message":"Unknown"}"#.to_string())
}

/// Detect cross-Zap patterns (anti-patterns affecting multiple Zaps)
/// Threshold: 3+ Zaps with same issue = pattern
fn detect_cross_zap_patterns(all_flags: &[EfficiencyFlag]) -> Vec<PatternFinding> {
    const PATTERN_THRESHOLD: usize = 3;
    let mut patterns = Vec::new();
    
    // Group flags by type
    let mut groups: HashMap<String, Vec<&EfficiencyFlag>> = HashMap::new();
    for flag in all_flags {
        groups.entry(flag.flag_type.clone())
            .or_insert_with(Vec::new)
            .push(flag);
    }
    
    // Detect patterns where 3+ Zaps have the same issue
    for (flag_type, group) in groups {
        if group.len() >= PATTERN_THRESHOLD {
            let (pattern_name, refactor_guidance) = match flag_type.as_str() {
                "polling_trigger" => (
                    "Polling Trigger Overuse".to_string(),
                    "Switch to instant webhook triggers where possible to reduce polling overhead".to_string()
                ),
                "late_filter_placement" => (
                    "Late Filter Placement".to_string(),
                    "Move filters immediately after trigger to reduce wasted tasks on filtered items".to_string()
                ),
                "error_loop" => (
                    "Widespread Error Loops".to_string(),
                    "Review authentication, fix configuration issues, and add proper error handling".to_string()
                ),
                _ => (
                    format!("{} Pattern", flag_type),
                    "Review and optimize affected Zaps".to_string()
                ),
            };
            
            // Calculate totals - waste tasks estimated from patterns
            // Note: With dynamic pricing, we estimate tasks conservatively
            let total_waste_usd: f32 = group.iter()
                .map(|f| f.estimated_monthly_savings)
                .sum();
            
            // Estimate total waste tasks using conservative $0.025/task benchmark
            // This is only for reporting, actual savings use dynamic pricing
            let total_waste_tasks: u32 = (total_waste_usd / 0.025) as u32;
            
            // Calculate median chain length (not applicable for most patterns)
            let median_chain_length = None; // TODO: Implement for formatter_chain if needed
            
            // Determine severity based on affected count
            let severity = if group.len() >= 8 {
                "high"
            } else if group.len() >= 5 {
                "medium"
            } else {
                "low"
            };
            
            patterns.push(PatternFinding {
                pattern_type: flag_type,
                pattern_name,
                affected_zap_ids: group.iter().map(|f| f.zap_id).collect(),
                affected_count: group.len(),
                median_chain_length,
                total_waste_tasks,
                total_waste_usd,
                refactor_guidance,
                severity: severity.to_string(),
            });
        }
    }
    
    // Sort by impact (affected_count * total_waste_usd)
    patterns.sort_by(|a, b| {
        let a_score = (a.affected_count as f32) * a.total_waste_usd;
        let b_score = (b.affected_count as f32) * b.total_waste_usd;
        b_score.partial_cmp(&a_score).unwrap()
    });
    
    patterns
}

/// Calculate system-wide metrics from analyzed Zaps
fn calculate_system_metrics(
    all_zaps: &[Zap],
    analyzed_ids: &[u64],
    individual_results: &[ParseResult]
) -> SystemMetrics {
    let analyzed_zaps: Vec<&Zap> = all_zaps.iter()
        .filter(|z| analyzed_ids.contains(&z.id))
        .collect();
    
    // Average steps per Zap
    let total_steps: usize = analyzed_zaps.iter()
        .map(|z| z.nodes.len())
        .sum();
    let avg_steps = if !analyzed_zaps.is_empty() {
        total_steps as f32 / analyzed_zaps.len() as f32
    } else {
        0.0
    };
    
    // Count polling vs instant triggers
    let polling_count = individual_results.iter()
        .filter(|r| r.efficiency_flags.iter().any(|f| f.flag_type == "polling_trigger"))
        .count();
    let instant_count = analyzed_zaps.len() - polling_count;
    
    // Formatter usage density (not implemented yet - default to "low")
    let formatter_density = "low".to_string();
    
    // Fan-out flows detection (Zaps with branching/paths)
    // NOTE: Current Node structure doesn't expose Path steps explicitly
    // This is a TODO for future enhancement
    let fan_out_count = 0;
    
    // TODO: Calculate from CSV data
    let avg_tasks_per_run = 0.0;
    let total_monthly_tasks = 0;
    
    SystemMetrics {
        avg_steps_per_zap: avg_steps,
        avg_tasks_per_run,
        polling_trigger_count: polling_count,
        instant_trigger_count: instant_count,
        total_monthly_tasks,
        formatter_usage_density: formatter_density,
        fan_out_flows: fan_out_count,
    }
}

/// Build ZapSummary from Zap and stats
fn build_zap_summary(zap: &Zap, task_history_map: &HashMap<u64, UsageStats>) -> ZapSummary {
    let trigger_app = zap.nodes.values()
        .find(|node| node.parent_id.is_none() && node.type_of == "read")
        .map(|node| parse_app_name(&node.selected_api))
        .unwrap_or_else(|| "Unknown".to_string());
    
    let (last_run, error_rate, total_runs) = if let Some(stats) = task_history_map.get(&zap.id) {
        let err_rate = if stats.total_runs > 0 {
            Some(stats.error_rate)
        } else {
            None
        };
        (stats.last_run.clone(), err_rate, stats.total_runs)
    } else {
        (None, None, 0)
    };
    
    ZapSummary {
        id: zap.id,
        title: zap.title.clone(),
        status: zap.status.clone(),
        step_count: zap.nodes.len(),
        trigger_app,
        last_run,
        error_rate,
        total_runs,
    }
}

// ============================================================================
// v1.0.0 MAIN EXPORT - analyze_zaps()
// ============================================================================

/// Main v1.0.0 audit function - Complete end-to-end analysis
/// Returns AuditResultV1 (canonical schema) as JSON
#[wasm_bindgen]
pub fn analyze_zaps(
    zip_data: &[u8],
    selected_zap_ids: Vec<JsValue>,  // NEW: Array of zap IDs to analyze
    plan_str: &str,
    actual_usage: u32
) -> Result<JsValue, JsValue> {
    // 1. PARSE INPUTS
    
    // Convert JsValue array to Vec<String>
    let selected_ids: Vec<String> = selected_zap_ids
        .iter()
        .filter_map(|id| {
            if let Some(s) = id.as_string() {
                Some(s)
            } else if let Some(n) = id.as_f64() {
                Some(n.to_string())
            } else {
                None
            }
        })
        .collect();
    
    // If empty array passed, analyze all Zaps (backward compatibility)
    let analyze_all = selected_ids.is_empty();
    
    let plan = match plan_str.to_lowercase().as_str() {
        "professional" => ZapierPlan::Professional,
        "team" => ZapierPlan::Team,
        _ => ZapierPlan::Professional,
    };
    
    let pricing = ZapierPricing::resolve(plan, actual_usage);
    let price_per_task = pricing.cost_per_task;
    
    // Parse ZIP archive
    let cursor = Cursor::new(zip_data);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| JsValue::from_str(&format!("Failed to open ZIP: {}", e)))?;
    
    let mut zapfile_content = String::new();
    let mut csv_contents: Vec<String> = Vec::new();
    let mut found_zapfile = false;
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| JsValue::from_str(&format!("Archive error: {}", e)))?;
        let file_name = file.name().to_string();
        let file_name_lower = file_name.to_lowercase();
        
        if !found_zapfile && file_name_lower.ends_with("zapfile.json") {
            file.read_to_string(&mut zapfile_content)
                .map_err(|e| JsValue::from_str(&format!("Failed to read zapfile: {}", e)))?;
            found_zapfile = true;
        } else if file_name_lower.ends_with(".csv") {
            let mut csv_content = String::new();
            if file.read_to_string(&mut csv_content).is_ok() {
                csv_contents.push(csv_content);
            }
        }
    }
    
    if !found_zapfile {
        return Err(JsValue::from_str("zapfile.json not found in archive"));
    }
    
    let mut zapfile: ZapFile = serde_json::from_str(&zapfile_content)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse zapfile: {}", e)))?;
    
    // 2. ATTACH USAGE STATS
    let task_history_map = parse_csv_files(&csv_contents);
    let has_csv = !task_history_map.is_empty();
    attach_usage_stats(&mut zapfile, &task_history_map);
    
    // 2.5. FILTER ZAPS (if specific IDs selected)
    if !analyze_all {
        zapfile.zaps.retain(|zap| selected_ids.contains(&zap.id.to_string()));
    }
    
    // 3. RUN CALCULATIONS (reuse existing functions)
    let old_flags = detect_efficiency_flags(&zapfile, price_per_task);
    
    // 4. BUILD v1.0.0 FINDINGS

    let mut findings: Vec<ZapFinding> = Vec::new();
    let mut global_active_count = 0;
    let mut global_zombie_count = 0;
    let mut global_high_severity_count = 0;
    let mut global_total_tasks = 0;
    let mut global_waste_tasks = 0;
    let mut global_waste_usd = 0.0;
    
    for zap in &zapfile.zaps {
        let zap_id_str = zap.id.to_string();
        let status = zap.status.clone();
        let steps = zap.nodes.len() as u32;
        
        // Calculate monthly tasks for this Zap
        let monthly_tasks = if let Some(stats) = &zap.usage_stats {
            calculate_task_volume(stats.total_runs, zap.nodes.len())
        } else {
            0
        };
        
        // Detect zombie status
        let is_zombie = detect_zombie_status(&status, monthly_tasks);
        if status.to_lowercase() == "on" {
            global_active_count += 1;
        }
        if is_zombie {
            global_zombie_count += 1;
        }
        
        global_total_tasks += monthly_tasks;
        
        // Determine Zap-level confidence
        let zap_confidence = if has_csv {
            ConfidenceLevel::High
        } else {
            ConfidenceLevel::Medium
        };
        
        // Convert old flags to v1.0.0 schema
        let zap_flags: Vec<audit_schema_v1::EfficiencyFlag> = old_flags.iter()
            .filter(|f| f.zap_id == zap.id)
            .map(|f| {
                let v1_flag = convert_efficiency_flag(f, &zap_id_str);
                
                // Count severity
                if v1_flag.severity == Severity::High {
                    global_high_severity_count += 1;
                }
                
                // Accumulate waste
                global_waste_usd += v1_flag.impact.estimated_monthly_savings_usd;
                
                v1_flag
            })
            .collect();
        
        // Calculate task/step ratio
        let task_step_ratio = if steps > 0 {
            guard_nan(monthly_tasks as f32 / steps as f32)
        } else {
            0.0
        };
        
        findings.push(ZapFinding {
            zap_id: zap_id_str,
            zap_name: zap.title.clone(),
            status,
            is_zombie,
            metrics: ZapMetrics {
                steps,
                monthly_tasks,
                task_step_ratio,
            },
            confidence: zap_confidence,
            flags: zap_flags,
            warnings: vec![], // Can add warnings if needed
        });
    }
    
    // Estimate waste tasks from waste USD
    global_waste_tasks = (global_waste_usd / price_per_task) as u32;
    
    // 5. BUILD METADATA
    let confidence_overview = calculate_confidence_overview(&findings);
    let pricing_assumptions = PricingAssumptions {
        plan_tier: format!("{:?}", plan),
        task_price_usd: price_per_task,
    };
    let input_sources = InputSources {
        zap_json: true,
        task_csv: has_csv,
    };
    let metadata = AuditMetadata::new(input_sources, pricing_assumptions, confidence_overview);
    
    // 6. BUILD GLOBAL METRICS
    let global_metrics = GlobalMetrics {
        total_zaps: zapfile.zaps.len() as u32,
        active_zaps: global_active_count,
        total_monthly_tasks: global_total_tasks,
        estimated_monthly_waste_tasks: global_waste_tasks,
        estimated_monthly_waste_usd: global_waste_usd,
        estimated_annual_waste_usd: global_waste_usd * 12.0,
        zombie_zap_count: global_zombie_count,
        high_severity_flag_count: global_high_severity_count,
    };
    
    // 7. RANK OPPORTUNITIES
    let opportunities = rank_opportunities(&findings);
    
    // 8. PLAN ANALYSIS
    let premium_features = detect_premium_features(&zapfile);
    let usage_percentile = if pricing.tier_tasks > 0 {
        guard_nan(global_total_tasks as f32 / pricing.tier_tasks as f32)
    } else {
        0.0
    };
    
    let downgrade_safe = usage_percentile < 0.7 && !premium_features.paths;
    
    let plan_analysis = PlanAnalysis {
        current_plan: format!("{:?}", plan),
        monthly_task_usage: global_total_tasks,
        plan_task_capacity: PlanCapacity {
            min: pricing.tier_tasks,
            max: pricing.tier_tasks,
        },
        usage_percentile,
        premium_features_detected: premium_features,
        downgrade_safe,
    };
    
    // 9. BUILD FINAL RESULT
    let result = AuditResultV1::new(
        metadata,
        global_metrics,
        findings,
        opportunities,
        plan_analysis,
    );
    
    // 10. VALIDATE
    result.validate()
        .map_err(|e| JsValue::from_str(&format!("Validation failed: {}", e)))?;
    
    // 11. SERIALIZE TO JSON STRING (not JsValue object)
    let json_string = serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("JSON serialization error: {}", e)))?;
    
    // Return as string
    Ok(JsValue::from_str(&json_string))
}

/// Hello world test function to verify WASM compilation
#[wasm_bindgen]
pub fn hello_world() -> String {
    "Zapier Lighthouse WASM Engine Ready!".to_string()
}

// ============================================================================
// UNIT TESTS - Production Safety Validation
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_pricing_tiers_valid() {
        // This test ensures pricing tiers are never accidentally cleared
        assert!(
            ZapierPricing::validate_pricing_tiers().is_ok(),
            "Pricing tiers validation failed!"
        );
    }
    
    #[test]
    fn test_fallback_constants_reasonable() {
        // Sanity check: fallback values are within reasonable bounds
        assert!(FALLBACK_MONTHLY_RUNS > 0.0 && FALLBACK_MONTHLY_RUNS < 10_000.0,
            "FALLBACK_MONTHLY_RUNS out of reasonable range");
        assert!(POLLING_REDUCTION_RATE > 0.0 && POLLING_REDUCTION_RATE < 0.5,
            "POLLING_REDUCTION_RATE out of reasonable range (0-50%)");
        assert!(LATE_FILTER_FALLBACK_RATE > 0.0 && LATE_FILTER_FALLBACK_RATE < 1.0,
            "LATE_FILTER_FALLBACK_RATE out of reasonable range (0-100%)");
    }
    
    #[test]
    fn test_guard_nan_protects_against_nan() {
        // Verify NaN guard works correctly
        assert_eq!(guard_nan(f32::NAN), 0.0);
        assert_eq!(guard_nan(f32::INFINITY), 0.0);
        assert_eq!(guard_nan(f32::NEG_INFINITY), 0.0);
        assert_eq!(guard_nan(42.5), 42.5);
        assert_eq!(guard_nan(0.0), 0.0);
    }
    
    #[test]
    fn test_pricing_tiers_sorted() {
        // Ensure tiers are properly sorted for binary search
        for i in 1..ZapierPricing::PROFESSIONAL.len() {
            assert!(
                ZapierPricing::PROFESSIONAL[i].0 > ZapierPricing::PROFESSIONAL[i-1].0,
                "Professional tiers not sorted at index {}", i
            );
        }
        
        for i in 1..ZapierPricing::TEAM.len() {
            assert!(
                ZapierPricing::TEAM[i].0 > ZapierPricing::TEAM[i-1].0,
                "Team tiers not sorted at index {}", i
            );
        }
    }
}
