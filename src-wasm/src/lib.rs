use wasm_bindgen::prelude::*;
use std::io::{Cursor, Read};
use std::collections::HashMap;
use zip::ZipArchive;
use serde::{Deserialize, Serialize};
use csv::ReaderBuilder;

// Pricing constants for savings calculations
const TASK_PRICE: f32 = 0.02; // $0.02 per task (conservative estimate)
const MONTHS_PER_YEAR: u32 = 12;

// Savings calculation constants (conservative percentages)
const POLLING_REDUCTION_RATE: f32 = 0.20; // 20% reduction from polling overhead
const LATE_FILTER_FALLBACK_RATE: f32 = 0.30; // 30% fallback if no task history

// Triple stores metadata
#[derive(Debug, Deserialize, Serialize, Clone)]
struct TripleStores {
    copied_from: Option<u64>,
    created_by: Option<u64>,
    polling_interval_override: u64,
    block_and_release_limit_override: u64,
    spread_tasks: u64,
}

// Node (Step) in a Zap workflow
#[derive(Debug, Deserialize, Serialize, Clone)]
struct Node {
    id: u64,
    account_id: u64,
    customuser_id: u64,
    paused: bool,
    type_of: String, // "read" or "write"
    params: serde_json::Value, // Dynamic params object
    meta: serde_json::Value, // Dynamic metadata
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
#[derive(Debug, Deserialize, Serialize, Clone)]
struct Zap {
    id: u64,
    title: String,
    status: String, // "on", "off", etc.
    nodes: HashMap<String, Node>, // Numeric string keys -> Node
    #[serde(skip_deserializing)]
    usage_stats: Option<UsageStats>,
}

// Metadata at root level
#[derive(Debug, Deserialize, Serialize)]
struct Metadata {
    version: String,
}

// Root structure of zapfile.json
#[derive(Debug, Deserialize, Serialize)]
struct ZapFile {
    metadata: Metadata,
    zaps: Vec<Zap>,
}

// Result struct to return to TypeScript
#[derive(Serialize)]
struct ParseResult {
    success: bool,
    zap_count: usize,
    total_nodes: usize,
    message: String,
    apps: Vec<AppInfo>,
    efficiency_flags: Vec<EfficiencyFlag>,
    efficiency_score: u32,
    estimated_savings: f32,
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
    savings_explanation: String, // How savings were calculated
    is_fallback: bool, // true = using estimated fallback data, false = using actual execution data
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
            stats.error_rate = (stats.error_count as f32 / stats.total_runs as f32) * 100.0;
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
            
            // Calculate dynamic savings: each error = wasted task
            let monthly_savings = (stats.error_count as f32) * price_per_task;
            let savings_explanation = format!(
                "Based on ${:.4} per task and eliminating {} failed executions",
                price_per_task,
                stats.error_count
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
                savings_explanation,
                is_fallback: false, // Error loop detection always uses actual execution data
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
        
        // Find zapfile.json (case-insensitive)
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
        // Find CSV files (task history or other)
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
    
    // Attach usage statistics to Zaps
    attach_usage_stats(&mut zapfile, &task_history_map);

    // Count total nodes across all Zaps
    let total_nodes: usize = zapfile.zaps.iter()
        .map(|zap| zap.nodes.len())
        .sum();

    // Extract app inventory
    let apps = extract_app_inventory(&zapfile);

    // Detect efficiency issues (now includes error loop detection)
    let efficiency_flags = detect_efficiency_flags(&zapfile, TASK_PRICE);

    // Calculate efficiency score
    let efficiency_score = calculate_efficiency_score(&efficiency_flags);

    // Calculate estimated savings
    let estimated_savings = calculate_estimated_savings(&efficiency_flags);

    // Return success result
    let result = ParseResult {
        success: true,
        zap_count: zapfile.zaps.len(),
        total_nodes,
        message: format!("Successfully parsed {} Zaps with {} total steps", 
            zapfile.zaps.len(), 
            total_nodes
        ),
        apps,
        efficiency_flags,
        efficiency_score,
        estimated_savings,
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
                            let wasted_tasks_per_month = (stats.total_runs as f32) * (actions_before_filter as f32) * filter_rejection_rate;
                            let savings = wasted_tasks_per_month * price_per_task;
                            
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
                        // Fallback calculation without task history
                        // Estimate: 100 runs/month * actions_before_filter * 30% rejection rate * $0.02/task
                        let estimated_monthly_runs = 100.0;
                        let fallback_savings = estimated_monthly_runs * (actions_before_filter as f32) * LATE_FILTER_FALLBACK_RATE * TASK_PRICE;
                        let explanation = format!(
                            "Estimated: ~{} monthly runs, {} actions before filter, {}% rejection rate (industry average, no execution data)",
                            estimated_monthly_runs as u32,
                            actions_before_filter,
                            (LATE_FILTER_FALLBACK_RATE * 100.0) as u32
                        );
                        (fallback_savings, explanation, true) // true = using fallback estimate
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
                        savings_explanation,
                        is_fallback, // Track whether we used actual data or fallback estimate
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
        let (monthly_savings, savings_explanation, has_execution_data) = if let Some(stats) = &zap.usage_stats {
    if stats.total_runs > 0 {
        let savings = (stats.total_runs as f32) * price_per_task * POLLING_REDUCTION_RATE;
        let explanation = format!(
            "Estimated using industry average {}% fallback from {} polling executions",
            (POLLING_REDUCTION_RATE * 100.0) as u32,
            stats.total_runs
        );
        (savings, explanation, true)
    } else {
        // Fallback: Zap má stats ale 0 runs
        let estimated_monthly_checks = 100.0;
        let fallback_savings = estimated_monthly_checks * price_per_task * POLLING_REDUCTION_RATE;
        let explanation = format!(
            "Estimated: ~{} monthly polling checks, {}% overhead (no execution data)",
            estimated_monthly_checks as u32,
            (POLLING_REDUCTION_RATE * 100.0) as u32
        );
        (fallback_savings, explanation, true)
    }
} else {
    // Fallback: Zap nemá žiadne stats
    let estimated_monthly_checks = 100.0;
    let fallback_savings = estimated_monthly_checks * price_per_task * POLLING_REDUCTION_RATE;
    let explanation = format!(
        "Estimated: ~{} monthly polling checks, {}% overhead (no execution data)",
        estimated_monthly_checks as u32,
        (POLLING_REDUCTION_RATE * 100.0) as u32
    );
    (fallback_savings, explanation, true)
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
            savings_explanation,
            is_fallback: !has_execution_data || monthly_savings > 0.0, // Always fallback for polling (no way to measure actual overhead)
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

    // Detect efficiency issues
    let efficiency_flags = detect_efficiency_flags(&zapfile, TASK_PRICE);

    // Calculate efficiency score
    let efficiency_score = calculate_efficiency_score(&efficiency_flags);

    // Calculate estimated savings
    let estimated_savings = calculate_estimated_savings(&efficiency_flags);

    // Return success result
    let result = ParseResult {
        success: true,
        zap_count: zapfile.zaps.len(),
        total_nodes,
        message: format!("Successfully parsed {} Zaps with {} total steps", 
            zapfile.zaps.len(), 
            total_nodes
        ),
        apps,
        efficiency_flags,
        efficiency_score,
        estimated_savings,
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
#[wasm_bindgen]
pub fn parse_single_zap_audit(zip_data: &[u8], zap_id: u64) -> String {
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
    let efficiency_flags = detect_efficiency_flags(&zapfile, TASK_PRICE);

    // Calculate efficiency score
    let efficiency_score = calculate_efficiency_score(&efficiency_flags);

    // Calculate estimated savings
    let estimated_savings = calculate_estimated_savings(&efficiency_flags);

    // Return success result (same format as parse_zapier_export)
    let result = ParseResult {
        success: true,
        zap_count: zapfile.zaps.len(), // Should be 1
        total_nodes,
        message: format!("Successfully audited Zap: {}", 
            zapfile.zaps.first().map(|z| z.title.as_str()).unwrap_or("Unknown")
        ),
        apps,
        efficiency_flags,
        efficiency_score,
        estimated_savings,
    };

    serde_json::to_string(&result).unwrap_or_else(|_| r#"{"success":true,"zap_count":0,"message":"Unknown"}"#.to_string())
}

/// NEW: Parse Batch Audit (Multi-Zap Analysis)
/// Analyzes multiple selected Zaps in one pass
/// Optimized: Opens ZIP once, filters by IDs, aggregates results
#[wasm_bindgen]
pub fn parse_batch_audit(zip_data: &[u8], zap_ids_js: JsValue, price_per_task: f32) -> String {
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
        
        // Build individual result
        individual_results.push(ParseResult {
            success: true,
            zap_count: 1,
            total_nodes: zap_nodes,
            message: format!("Audited: {}", 
                single_zap_file.zaps.first().map(|z| z.title.as_str()).unwrap_or("Unknown")
            ),
            apps,
            efficiency_flags: flags,
            efficiency_score: score,
            estimated_savings: savings,
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
            
            // Calculate totals
            let total_waste_tasks: u32 = group.iter()
                .map(|f| (f.estimated_monthly_savings / TASK_PRICE) as u32)
                .sum();
            
            let total_waste_usd: f32 = group.iter()
                .map(|f| f.estimated_monthly_savings)
                .sum();
            
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

/// Hello world test function to verify WASM compilation
#[wasm_bindgen]
pub fn hello_world() -> String {
    "Zapier Lighthouse WASM Engine Ready!".to_string()
}
