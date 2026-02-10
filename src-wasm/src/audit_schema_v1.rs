//! Zapier Lighthouse - Canonical Audit Schema v1.0.0
//! 
//! This module defines the complete output contract for WASM.
//! NEVER modify field names or types - only add new optional fields.
//! 
//! Schema versioning:
//! - v1.0.0: Initial production schema
//! - Breaking changes require major version bump

use serde::{Deserialize, Serialize};

// ============================================================================
// ROOT RESULT
// ============================================================================

/// Complete audit result - the ONLY output type from WASM
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditResultV1 {
    /// Schema version for backward compatibility
    pub schema_version: String,
    
    /// Metadata about audit execution
    pub audit_metadata: AuditMetadata,
    
    /// Aggregated metrics across all Zaps
    pub global_metrics: GlobalMetrics,
    
    /// Per-Zap detailed findings
    pub per_zap_findings: Vec<ZapFinding>,
    
    /// Opportunities ranked by financial impact
    pub opportunities_ranked: Vec<RankedOpportunity>,
    
    /// Zapier plan utilization analysis
    pub plan_analysis: PlanAnalysis,
}

impl AuditResultV1 {
    /// Create new audit result with current timestamp
    pub fn new(
        audit_metadata: AuditMetadata,
        global_metrics: GlobalMetrics,
        per_zap_findings: Vec<ZapFinding>,
        opportunities_ranked: Vec<RankedOpportunity>,
        plan_analysis: PlanAnalysis,
    ) -> Self {
        Self {
            schema_version: "1.0.0".to_string(),
            audit_metadata,
            global_metrics,
            per_zap_findings,
            opportunities_ranked,
            plan_analysis,
        }
    }
}

// ============================================================================
// AUDIT METADATA
// ============================================================================

/// Context about how the audit was performed
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditMetadata {
    /// ISO 8601 timestamp when audit was generated
    pub generated_at: String,
    
    /// Which data sources were available
    pub input_sources: InputSources,
    
    /// Pricing model used for cost calculations
    pub pricing_assumptions: PricingAssumptions,
    
    /// Distribution of confidence levels
    pub confidence_overview: ConfidenceOverview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputSources {
    /// Whether Zap JSON export was provided
    pub zap_json: bool,
    
    /// Whether Task History CSV was provided
    pub task_csv: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingAssumptions {
    /// Zapier plan tier (e.g., "Professional", "Team")
    pub plan_tier: String,
    
    /// Cost per task in USD
    pub task_price_usd: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfidenceOverview {
    /// Number of High confidence findings
    pub high: u32,
    
    /// Number of Medium confidence findings
    pub medium: u32,
    
    /// Number of Low confidence findings
    pub low: u32,
}

// ============================================================================
// GLOBAL METRICS
// ============================================================================

/// Aggregated metrics across all Zaps
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalMetrics {
    /// Total number of Zaps analyzed
    pub total_zaps: u32,
    
    /// Number of Zaps with status "on"
    pub active_zaps: u32,
    
    /// Total monthly task consumption
    pub total_monthly_tasks: u32,
    
    /// Estimated wasted tasks per month
    pub estimated_monthly_waste_tasks: u32,
    
    /// Estimated wasted cost per month in USD
    pub estimated_monthly_waste_usd: f32,
    
    /// Estimated wasted cost per year in USD
    pub estimated_annual_waste_usd: f32,
    
    /// Number of zombie Zaps (on but not running)
    pub zombie_zap_count: u32,
    
    /// Number of high-severity flags
    pub high_severity_flag_count: u32,
}

// ============================================================================
// PER-ZAP FINDINGS
// ============================================================================

/// Complete analysis of a single Zap
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZapFinding {
    /// Unique Zap identifier
    pub zap_id: String,
    
    /// Human-readable Zap name
    pub zap_name: String,
    
    /// Current status ("on" | "off")
    pub status: String,
    
    /// Whether this Zap is a zombie
    pub is_zombie: bool,
    
    /// Quantitative metrics
    pub metrics: ZapMetrics,
    
    /// Overall confidence for this Zap's analysis
    pub confidence: ConfidenceLevel,
    
    /// Detected efficiency issues
    pub flags: Vec<EfficiencyFlag>,
    
    /// Non-critical warnings
    pub warnings: Vec<Warning>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZapMetrics {
    /// Number of steps in this Zap
    pub steps: u32,
    
    /// Estimated monthly task consumption
    pub monthly_tasks: u32,
    
    /// Task/step ratio
    pub task_step_ratio: f32,
}

// ============================================================================
// EFFICIENCY FLAGS
// ============================================================================

/// A detected efficiency issue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EfficiencyFlag {
    /// Unique identifier for this issue type
    pub code: FlagCode,
    
    /// Technical severity
    pub severity: Severity,
    
    /// Confidence in this finding
    pub confidence: ConfidenceLevel,
    
    /// Financial impact if fixed
    pub impact: FlagImpact,
    
    /// Estimated effort to fix
    pub implementation: FlagImplementation,
    
    /// Type-specific metadata
    pub meta: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlagImpact {
    /// Estimated monthly savings in USD
    pub estimated_monthly_savings_usd: f32,
    
    /// Estimated annual savings in USD
    pub estimated_annual_savings_usd: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlagImplementation {
    /// Estimated hours to fix
    pub estimated_effort_hours: f32,
}

// ============================================================================
// WARNINGS
// ============================================================================

/// Non-critical warning about data quality or unusual patterns
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Warning {
    /// Warning type identifier
    pub code: WarningCode,
    
    /// Human-readable explanation
    pub message: String,
}

// ============================================================================
// RANKED OPPORTUNITIES
// ============================================================================

/// Opportunity ranked by financial impact
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankedOpportunity {
    /// Which Zap this belongs to
    pub zap_id: String,
    
    /// Which flag detected this
    pub flag_code: FlagCode,
    
    /// Estimated monthly savings in USD
    pub estimated_monthly_savings_usd: f32,
    
    /// Confidence in estimate
    pub confidence: ConfidenceLevel,
    
    /// Explicit ranking (1 = highest impact)
    pub rank: u32,
}

// ============================================================================
// PLAN ANALYSIS
// ============================================================================

/// Analysis of Zapier plan utilization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanAnalysis {
    /// Current Zapier plan tier
    pub current_plan: String,
    
    /// Actual monthly task usage
    pub monthly_task_usage: u32,
    
    /// Plan's task capacity range
    pub plan_task_capacity: PlanCapacity,
    
    /// Usage as percentage of max (0.0 to 1.0)
    pub usage_percentile: f32,
    
    /// Detected premium features in use
    pub premium_features_detected: PremiumFeatures,
    
    /// Whether downgrade is technically possible
    pub downgrade_safe: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanCapacity {
    /// Minimum tasks in plan
    pub min: u32,
    
    /// Maximum tasks in plan
    pub max: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PremiumFeatures {
    /// Multi-step Paths usage
    pub paths: bool,
    
    /// Filter steps usage
    pub filters: bool,
    
    /// Webhook triggers usage
    pub webhooks: bool,
    
    /// Code steps usage
    pub custom_logic: bool,
}

// ============================================================================
// ENUMS
// ============================================================================

/// Confidence level for calculations
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConfidenceLevel {
    High,
    Medium,
    Low,
}

/// Technical severity of efficiency issue
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity {
    Low,
    Medium,
    High,
}

/// Efficiency flag type identifiers (v1.0.0)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FlagCode {
    /// Multiple formatters in sequence
    FormatterChain,
    
    /// Data transformations scattered across steps
    InterleavedTransformations,
    
    /// Unnecessary steps inflating task count
    TaskStepCostInflation,
    
    /// Filter step after expensive operations
    LateFilter,
    
    /// Zap is "on" but not executing
    ZombieZap,
    
    /// Paying for unused capacity
    PlanUnderutilization,
}

/// Warning type identifiers (v1.0.0)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WarningCode {
    /// Missing CSV or partial JSON
    IncompleteData,
    
    /// Edge case requiring manual review
    UnusualPattern,
    
    /// Zap too complex for automated analysis
    HighComplexity,
}

// ============================================================================
// HELPER IMPLEMENTATIONS
// ============================================================================

impl AuditMetadata {
    /// Create metadata with current timestamp
    pub fn new(
        input_sources: InputSources,
        pricing_assumptions: PricingAssumptions,
        confidence_overview: ConfidenceOverview,
    ) -> Self {
        Self {
            generated_at: chrono::Utc::now().to_rfc3339(),
            input_sources,
            pricing_assumptions,
            confidence_overview,
        }
    }
}

impl GlobalMetrics {
    /// Create empty metrics (all zeros)
    pub fn empty() -> Self {
        Self {
            total_zaps: 0,
            active_zaps: 0,
            total_monthly_tasks: 0,
            estimated_monthly_waste_tasks: 0,
            estimated_monthly_waste_usd: 0.0,
            estimated_annual_waste_usd: 0.0,
            zombie_zap_count: 0,
            high_severity_flag_count: 0,
        }
    }
}

impl ZapFinding {
    /// Create minimal finding (for when data is incomplete)
    pub fn minimal(zap_id: String, zap_name: String) -> Self {
        Self {
            zap_id,
            zap_name,
            status: "unknown".to_string(),
            is_zombie: false,
            metrics: ZapMetrics {
                steps: 0,
                monthly_tasks: 0,
                task_step_ratio: 0.0,
            },
            confidence: ConfidenceLevel::Low,
            flags: vec![],
            warnings: vec![
                Warning {
                    code: WarningCode::IncompleteData,
                    message: "Insufficient data for complete analysis".to_string(),
                }
            ],
        }
    }
}

impl PlanAnalysis {
    /// Create default analysis when plan info unavailable
    pub fn unknown() -> Self {
        Self {
            current_plan: "Unknown".to_string(),
            monthly_task_usage: 0,
            plan_task_capacity: PlanCapacity { min: 0, max: 0 },
            usage_percentile: 0.0,
            premium_features_detected: PremiumFeatures {
                paths: false,
                filters: false,
                webhooks: false,
                custom_logic: false,
            },
            downgrade_safe: false,
        }
    }
}

// ============================================================================
// VALIDATION
// ============================================================================

impl AuditResultV1 {
    /// Validate that result has no NaN values or invalid data
    pub fn validate(&self) -> Result<(), String> {
        // Validate global metrics
        if self.global_metrics.estimated_monthly_waste_usd.is_nan() {
            return Err("Global metrics contains NaN in monthly_waste_usd".to_string());
        }
        if self.global_metrics.estimated_annual_waste_usd.is_nan() {
            return Err("Global metrics contains NaN in annual_waste_usd".to_string());
        }
        
        // Validate per-zap findings
        for finding in &self.per_zap_findings {
            if finding.metrics.task_step_ratio.is_nan() {
                return Err(format!("Zap {} has NaN in task_step_ratio", finding.zap_id));
            }
            
            // Validate flags
            for flag in &finding.flags {
                if flag.impact.estimated_monthly_savings_usd.is_nan() {
                    return Err(format!("Zap {} has flag with NaN savings", finding.zap_id));
                }
                if flag.impact.estimated_monthly_savings_usd < 0.0 {
                    return Err(format!("Zap {} has negative savings", finding.zap_id));
                }
            }
        }
        
        // Validate opportunities
        for opp in &self.opportunities_ranked {
            if opp.estimated_monthly_savings_usd.is_nan() {
                return Err("Opportunity has NaN savings".to_string());
            }
        }
        
        Ok(())
    }
}
