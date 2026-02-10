/**
 * Zapier Lighthouse - Audit Schema Types v1.0.0
 * 
 * This file defines the complete contract between WASM (Rust) and UI/PDF (TypeScript).
 * 
 * ARCHITECTURE RULES:
 * - WASM generates this exact JSON structure
 * - UI/PDF consumes it read-only (never mutates)
 * - All financial calculations happen in WASM
 * - All presentation/formatting happens in UI/PDF
 * 
 * @module audit-schema
 * @version 1.0.0
 */

// ============================================================================
// ROOT SCHEMA
// ============================================================================

/**
 * Complete audit result returned by WASM analyzer.
 * This is the top-level object that contains all audit findings.
 */
export interface AuditResult {
  /** Schema version for backward compatibility */
  schema_version: string;
  
  /** Metadata about the audit execution */
  audit_metadata: AuditMetadata;
  
  /** Aggregated metrics across all Zaps */
  global_metrics: GlobalMetrics;
  
  /** Per-Zap detailed findings */
  per_zap_findings: PerZapFinding[];
  
  /** Opportunities ranked by financial impact */
  opportunities_ranked: RankedOpportunity[];
  
  /** Analysis of Zapier plan utilization */
  plan_analysis: PlanAnalysis;
}

// ============================================================================
// AUDIT METADATA
// ============================================================================

/**
 * Context about how the audit was performed.
 * Used for transparency, debugging, and legal protection.
 */
export interface AuditMetadata {
  /** ISO 8601 timestamp when audit was generated */
  generated_at: string;
  
  /** Which data sources were available for analysis */
  input_sources: InputSources;
  
  /** Pricing model used for cost calculations */
  pricing_assumptions: PricingAssumptions;
  
  /** Distribution of confidence levels across findings */
  confidence_overview: ConfidenceOverview;
}

/**
 * Available input data sources.
 * Determines what level of analysis is possible.
 */
export interface InputSources {
  /** Whether Zap JSON export was provided */
  zap_json: boolean;
  
  /** Whether Task History CSV was provided */
  task_csv: boolean;
}

/**
 * Pricing model assumptions used for financial calculations.
 * Provides transparency on how costs were estimated.
 */
export interface PricingAssumptions {
  /** Zapier plan tier (e.g., "Professional", "Team") */
  plan_tier: string;
  
  /** Cost per task in USD (derived from plan tier) */
  task_price_usd: number;
}

/**
 * Breakdown of confidence levels across all findings.
 * Gives quick overview of audit reliability.
 */
export interface ConfidenceOverview {
  /** Number of findings with High confidence */
  high: number;
  
  /** Number of findings with Medium confidence */
  medium: number;
  
  /** Number of findings with Low confidence */
  low: number;
}

// ============================================================================
// GLOBAL METRICS
// ============================================================================

/**
 * Aggregated metrics across all analyzed Zaps.
 * CFO-level numbers for executive summary.
 */
export interface GlobalMetrics {
  /** Total number of Zaps analyzed */
  total_zaps: number;
  
  /** Number of Zaps with status "on" */
  active_zaps: number;
  
  /** Total task consumption per month across all Zaps */
  total_monthly_tasks: number;
  
  /** Estimated wasted tasks per month (could be eliminated) */
  estimated_monthly_waste_tasks: number;
  
  /** Estimated wasted cost per month in USD */
  estimated_monthly_waste_usd: number;
  
  /** Estimated wasted cost per year in USD */
  estimated_annual_waste_usd: number;
  
  /** Number of zombie Zaps (on but not running) */
  zombie_zap_count: number;
  
  /** Number of high-severity efficiency flags */
  high_severity_flag_count: number;
}

// ============================================================================
// PER-ZAP FINDINGS
// ============================================================================

/**
 * Complete analysis of a single Zap.
 * Contains metrics, flags, and warnings specific to this Zap.
 */
export interface PerZapFinding {
  /** Unique Zap identifier from Zapier */
  zap_id: string;
  
  /** Human-readable Zap name */
  zap_name: string;
  
  /** Current status ("on" | "off") */
  status: string;
  
  /** Whether this Zap is a zombie (on but not executing) */
  is_zombie: boolean;
  
  /** Quantitative metrics about this Zap */
  metrics: ZapMetrics;
  
  /** Overall confidence level for this Zap's analysis */
  confidence: ConfidenceLevel;
  
  /** Detected efficiency issues */
  flags: EfficiencyFlag[];
  
  /** Non-critical warnings (edge cases, incomplete data) */
  warnings: Warning[];
}

/**
 * Quantitative metrics for a single Zap.
 * Raw numbers without interpretation.
 */
export interface ZapMetrics {
  /** Number of steps in this Zap */
  steps: number;
  
  /** Estimated monthly task consumption for this Zap */
  monthly_tasks: number;
  
  /** Task/step ratio (higher = more efficient) */
  task_step_ratio: number;
}

// ============================================================================
// EFFICIENCY FLAGS
// ============================================================================

/**
 * A detected efficiency issue.
 * Includes severity, financial impact, and implementation cost.
 */
export interface EfficiencyFlag {
  /** Unique identifier for this type of issue */
  code: FlagCode;
  
  /** Technical severity of the issue */
  severity: Severity;
  
  /** Confidence in this specific finding */
  confidence: ConfidenceLevel;
  
  /** Financial impact if this issue is fixed */
  impact: FlagImpact;
  
  /** Estimated effort to fix this issue */
  implementation: FlagImplementation;
  
  /** Type-specific metadata (varies by flag code) */
  meta: Record<string, any>;
}

/**
 * Financial impact of fixing a flag.
 * All numbers are estimates based on available data.
 */
export interface FlagImpact {
  /** Estimated monthly savings in USD if fixed */
  estimated_monthly_savings_usd: number;
  
  /** Estimated annual savings in USD if fixed */
  estimated_annual_savings_usd: number;
}

/**
 * Implementation effort estimate.
 * Based on flag type, not user skill level.
 */
export interface FlagImplementation {
  /** Estimated hours to fix (independent of hourly rate) */
  estimated_effort_hours: number;
}

// ============================================================================
// WARNINGS
// ============================================================================

/**
 * Non-critical warning about data quality or unusual patterns.
 * Not severe enough to be a flag, but worth noting.
 */
export interface Warning {
  /** Warning type identifier */
  code: WarningCode;
  
  /** Human-readable explanation */
  message: string;
}

// ============================================================================
// RANKED OPPORTUNITIES
// ============================================================================

/**
 * A single opportunity ranked by financial impact.
 * Pre-sorted by WASM for easy "Top N" display in UI/PDF.
 */
export interface RankedOpportunity {
  /** Which Zap this opportunity belongs to */
  zap_id: string;
  
  /** Which flag detected this opportunity */
  flag_code: FlagCode;
  
  /** Estimated monthly savings in USD */
  estimated_monthly_savings_usd: number;
  
  /** Confidence in this estimate */
  confidence: ConfidenceLevel;
  
  /** Explicit ranking (1 = highest impact) */
  rank: number;
}

// ============================================================================
// PLAN ANALYSIS
// ============================================================================

/**
 * Analysis of Zapier plan utilization.
 * Partial truth - never makes definitive recommendations.
 */
export interface PlanAnalysis {
  /** Current Zapier plan tier */
  current_plan: string;
  
  /** Actual monthly task usage */
  monthly_task_usage: number;
  
  /** Plan's task capacity range */
  plan_task_capacity: PlanCapacity;
  
  /** Usage as percentage of max capacity (0.0 to 1.0) */
  usage_percentile: number;
  
  /** Detected premium features in use */
  premium_features_detected: PremiumFeatures;
  
  /** Whether downgrade is technically possible (may lose features) */
  downgrade_safe: boolean;
}

/**
 * Task capacity range for current plan.
 */
export interface PlanCapacity {
  /** Minimum tasks included in plan */
  min: number;
  
  /** Maximum tasks allowed in plan */
  max: number;
}

/**
 * Detected usage of Zapier premium features.
 * Determines if plan downgrade would break functionality.
 */
export interface PremiumFeatures {
  /** Multi-step Paths usage */
  paths: boolean;
  
  /** Filter steps usage */
  filters: boolean;
  
  /** Webhook triggers usage */
  webhooks: boolean;
  
  /** Code steps (Python/JavaScript) usage */
  custom_logic: boolean;
}

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * Confidence level for calculations.
 * Based on available data sources.
 */
export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

/**
 * Technical severity of an efficiency issue.
 * Independent of financial impact.
 */
export type Severity = 'Low' | 'Medium' | 'High';

/**
 * Efficiency flag type identifiers.
 * Versioned enum - new codes can be added, existing never changed.
 * 
 * @version 1.0.0
 */
export type FlagCode =
  | 'FORMATTER_CHAIN'              // Multiple formatters in sequence
  | 'INTERLEAVED_TRANSFORMATIONS'  // Data transformations scattered across steps
  | 'TASK_STEP_COST_INFLATION'     // Unnecessary steps inflating task count
  | 'LATE_FILTER'                  // Filter step after expensive operations
  | 'ZOMBIE_ZAP'                   // Zap is "on" but not executing
  | 'PLAN_UNDERUTILIZATION';       // Paying for unused capacity

/**
 * Warning type identifiers.
 * For non-critical issues and data quality notes.
 * 
 * @version 1.0.0
 */
export type WarningCode =
  | 'INCOMPLETE_DATA'    // Missing CSV or partial JSON
  | 'UNUSUAL_PATTERN'    // Edge case requiring manual review
  | 'HIGH_COMPLEXITY';   // Zap too complex for automated analysis

// ============================================================================
// UTILITY TYPES (for UI/PDF consumption)
// ============================================================================

/**
 * Filter flags by severity level.
 * Useful for UI filtering/highlighting.
 */
export type HighSeverityFlag = EfficiencyFlag & { severity: 'High' };
export type MediumSeverityFlag = EfficiencyFlag & { severity: 'Medium' };
export type LowSeverityFlag = EfficiencyFlag & { severity: 'Low' };

/**
 * Filter flags by confidence level.
 * Useful for showing/hiding uncertain findings.
 */
export type HighConfidenceFlag = EfficiencyFlag & { confidence: 'High' };
export type MediumConfidenceFlag = EfficiencyFlag & { confidence: 'Medium' };
export type LowConfidenceFlag = EfficiencyFlag & { confidence: 'Low' };

/**
 * Zombie Zap type guard.
 * Useful for dedicated zombie detection UI.
 */
export type ZombieZap = PerZapFinding & { is_zombie: true };

/**
 * Combined data for rendering opportunity cards in UI.
 * Joins opportunity with its full Zap and flag details.
 */
export interface OpportunityCard {
  opportunity: RankedOpportunity;
  zap: PerZapFinding;
  flag: EfficiencyFlag;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Type guard to validate if an object is a valid AuditResult.
 * Use this to safely parse WASM output.
 * 
 * @param obj - Unknown object to validate
 * @returns True if obj conforms to AuditResult schema
 */
export function isValidAuditResult(obj: unknown): obj is AuditResult {
  if (!obj || typeof obj !== 'object') return false;
  
  const result = obj as Partial<AuditResult>;
  
  return (
    typeof result.schema_version === 'string' &&
    typeof result.audit_metadata === 'object' &&
    typeof result.global_metrics === 'object' &&
    Array.isArray(result.per_zap_findings) &&
    Array.isArray(result.opportunities_ranked) &&
    typeof result.plan_analysis === 'object'
  );
}

/**
 * Type guard for ConfidenceLevel.
 */
export function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return value === 'High' || value === 'Medium' || value === 'Low';
}

/**
 * Type guard for Severity.
 */
export function isSeverity(value: unknown): value is Severity {
  return value === 'Low' || value === 'Medium' || value === 'High';
}

/**
 * Type guard for FlagCode.
 */
export function isFlagCode(value: unknown): value is FlagCode {
  const validCodes: FlagCode[] = [
    'FORMATTER_CHAIN',
    'INTERLEAVED_TRANSFORMATIONS',
    'TASK_STEP_COST_INFLATION',
    'LATE_FILTER',
    'ZOMBIE_ZAP',
    'PLAN_UNDERUTILIZATION',
  ];
  return typeof value === 'string' && validCodes.includes(value as FlagCode);
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Current schema version.
 * Increment when making breaking changes to the contract.
 */
export const SCHEMA_VERSION = '1.0.0';

/**
 * All valid flag codes in v1.0.0.
 * Use this for UI dropdowns, filters, etc.
 */
export const FLAG_CODES: readonly FlagCode[] = [
  'FORMATTER_CHAIN',
  'INTERLEAVED_TRANSFORMATIONS',
  'TASK_STEP_COST_INFLATION',
  'LATE_FILTER',
  'ZOMBIE_ZAP',
  'PLAN_UNDERUTILIZATION',
] as const;

/**
 * All valid warning codes in v1.0.0.
 */
export const WARNING_CODES: readonly WarningCode[] = [
  'INCOMPLETE_DATA',
  'UNUSUAL_PATTERN',
  'HIGH_COMPLEXITY',
] as const;

/**
 * Confidence level ordering (for sorting).
 */
export const CONFIDENCE_ORDER: Record<ConfidenceLevel, number> = {
  'High': 3,
  'Medium': 2,
  'Low': 1,
};

/**
 * Severity level ordering (for sorting).
 */
export const SEVERITY_ORDER: Record<Severity, number> = {
  'High': 3,
  'Medium': 2,
  'Low': 1,
};
