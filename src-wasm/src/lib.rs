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
#[derive(Debug, Deserialize, Serialize)]
struct TripleStores {
    copied_from: Option<u64>,
    created_by: Option<u64>,
    polling_interval_override: u64,
    block_and_release_limit_override: u64,
    spread_tasks: u64,
}

// Node (Step) in a Zap workflow
#[derive(Debug, Deserialize, Serialize)]
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
}

// Zap (automation workflow)
#[derive(Debug, Deserialize, Serialize)]
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
    
    // Enhanced analytics: Calculate error rates, trends, streaks, and most common errors
    for (zap_id, stats) in task_history_map.iter_mut() {
        if stats.total_runs > 0 {
            stats.error_rate = (stats.error_count as f32 / stats.total_runs as f32) * 100.0;
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
fn detect_error_loop(zap: &Zap) -> Option<EfficiencyFlag> {
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
            let monthly_savings = (stats.error_count as f32) * TASK_PRICE;
            let savings_explanation = format!(
                "Based on ${:.2} per task and eliminating {} failed executions",
                TASK_PRICE,
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
    let efficiency_flags = detect_efficiency_flags(&zapfile);

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
fn detect_efficiency_flags(zapfile: &ZapFile) -> Vec<EfficiencyFlag> {
    let mut flags = Vec::new();
    
    for zap in &zapfile.zaps {
        // Detect polling triggers
        if let Some(flag) = detect_polling_trigger(zap) {
            flags.push(flag);
        }
        
        // Detect inefficient filter placement
        if let Some(flag) = detect_late_filter_placement(zap) {
            flags.push(flag);
        }
        
        // Detect error loops (high failure rates)
        if let Some(flag) = detect_error_loop(zap) {
            flags.push(flag);
        }
    }
    
    flags
}

/// Detect if a filter step is placed too late in the workflow
/// Filters should be placed right after the trigger to save task consumption
fn detect_late_filter_placement(zap: &Zap) -> Option<EfficiencyFlag> {
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
                            let savings = wasted_tasks_per_month * TASK_PRICE;
                            
                            let explanation = format!(
                                "Based on ${:.2} per task, {} actions before filter, and {:.0}% actual filter rejection rate from {} executions",
                                TASK_PRICE,
                                actions_before_filter,
                                filter_rejection_rate * 100.0,
                                stats.total_runs
                            );
                            (savings, explanation, false) // false = using actual data
                        } else {
                            (0.0, "Insufficient execution data for savings calculation".to_string(), true) // true = fallback
                        }
                    } else {
                        // Fallback calculation without task history (30% conservative estimate)
                        let explanation = format!(
                            "Estimated using industry average {}% fallback (no execution data available)",
                            (LATE_FILTER_FALLBACK_RATE * 100.0) as u32
                        );
                        (0.0, explanation, true) // true = using fallback estimate
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
fn detect_polling_trigger(zap: &Zap) -> Option<EfficiencyFlag> {
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
                let savings = (stats.total_runs as f32) * TASK_PRICE * POLLING_REDUCTION_RATE;
                let explanation = format!(
                    "Estimated using industry average {}% fallback from {} polling executions",
                    (POLLING_REDUCTION_RATE * 100.0) as u32,
                    stats.total_runs
                );
                (savings, explanation, true) // has execution count, but savings % is still estimate
            } else {
                (0.0, "Insufficient execution data for savings calculation".to_string(), false)
            }
        } else {
            (0.0, "Insufficient execution data for savings calculation".to_string(), false)
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
    let efficiency_flags = detect_efficiency_flags(&zapfile);

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

/// Hello world test function to verify WASM compilation
#[wasm_bindgen]
pub fn hello_world() -> String {
    "Zapier Lighthouse WASM Engine Ready!".to_string()
}
