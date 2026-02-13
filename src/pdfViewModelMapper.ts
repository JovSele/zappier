import type { AuditResult } from './types/audit-schema';
import type { PdfViewModel } from './pdfGenerator';

/**
 * PDF View Model Mapper
 * Transforms WASM AuditResult (v1.0.0) into PdfViewModel for PDF generation
 * 
 * Key transformations:
 * - Calculates multiplier (annual waste / audit cost)
 * - Aggregates remediation time from ALL flags (not just top 5)
 * - Maps opportunities to priority actions with effort estimates
 * - Transforms premium feature keys to readable labels
 * - Handles empty states gracefully (no fake data)
 */

// ========================================
// CONSTANTS
// ========================================

/**
 * Effort estimates per flag code (in minutes)
 * Based on typical remediation time for each pattern
 */
const EFFORT_MAP: Record<string, number> = {
  ZOMBIE_ZAP: 2,
  LATE_FILTER: 10,
  FORMATTER_CHAIN: 15,
  INTERLEAVED_TRANSFORMATIONS: 15,
  TASK_STEP_COST_INFLATION: 20,
  PLAN_UNDERUTILIZATION: 5,
};

/**
 * Map flag codes to human-readable action labels
 */
const ACTION_LABELS: Record<string, string> = {
  ZOMBIE_ZAP: 'Deactivate unused automation',
  LATE_FILTER: 'Move filter earlier',
  FORMATTER_CHAIN: 'Merge formatting steps',
  INTERLEAVED_TRANSFORMATIONS: 'Consolidate data transformations',
  TASK_STEP_COST_INFLATION: 'Optimize task usage',
  PLAN_UNDERUTILIZATION: 'Review plan tier',
};

/**
 * Map premium feature keys to display labels
 */
const FEATURE_LABELS: Record<string, string> = {
  custom_logic: 'Custom Logic',
  filters: 'Filters',
  paths: 'Paths',
  webhooks: 'Webhooks',
  multi_step: 'Multi-Step Zaps',
};

// ========================================
// MAIN MAPPING FUNCTION
// ========================================

/**
 * Transform AuditResult from WASM into PdfViewModel for PDF generator
 */
export function mapAuditToPdfViewModel(
  auditResult: AuditResult
): PdfViewModel {
  const AUDIT_COST = 79;
  const annualWaste = auditResult.global_metrics.estimated_annual_waste_usd;

  // ===== REPORT METADATA =====
  const reportId = generateReportId(auditResult.audit_metadata.generated_at);
  
  // ===== FINANCIAL OVERVIEW =====
  const multiplier = AUDIT_COST > 0 
    ? Number((annualWaste / AUDIT_COST).toFixed(1)) 
    : 0;

  // Calculate total remediation time from ALL flags (not just top 5)
  const estimatedRemediationMinutes = auditResult.per_zap_findings
    .flatMap(zap => zap.flags)
    .reduce((acc, flag) => {
      const effort = EFFORT_MAP[flag.code] ?? 10; // Default 10 min if unknown
      return acc + effort;
    }, 0);

  // Round to nearest 5 minutes for cleaner presentation
  const roundedRemediationMinutes = Math.ceil(estimatedRemediationMinutes / 5) * 5;

  // ===== PRIORITY ACTIONS =====
  // Take top 5 opportunities and map to actionable format
  const priorityActions = auditResult.opportunities_ranked
    .slice(0, 5)
    .map(opportunity => {
      // Find the Zap by ID to get its name
      const zap = auditResult.per_zap_findings.find(z => z.zap_id === opportunity.zap_id);
      const zapName = zap?.zap_name || 'Unknown Zap';
      
      return {
        zapName,
        actionLabel: ACTION_LABELS[opportunity.flag_code] || 'Optimize automation',
        estimatedAnnualImpact: opportunity.estimated_monthly_savings_usd * 12,
        effortMinutes: EFFORT_MAP[opportunity.flag_code] ?? 10,
      };
    });

  // ===== RISK SUMMARY =====
// Count all flags by pattern type across all zaps
const allFlags = auditResult.per_zap_findings.flatMap(zap => zap.flags);

// Count flags by severity (not confidence!)
const highSeverityCount = allFlags.filter(f => 
  f.severity === 'High'
).length;

const mediumSeverityCount = allFlags.filter(f => 
  f.severity === 'Medium'
).length;

const lowSeverityCount = allFlags.filter(f => 
  f.severity === 'Low'
).length;

const inefficientLogicPatterns = allFlags.filter(f =>
  ['FORMATTER_CHAIN', 'LATE_FILTER', 'INTERLEAVED_TRANSFORMATIONS'].includes(f.code)
).length;

const redundancyPatterns = allFlags.filter(f =>
  f.code === 'TASK_STEP_COST_INFLATION'
).length;

const nonExecutingAutomations = auditResult.global_metrics.zombie_zap_count;

// ===== PLAN SUMMARY =====
const premiumFeaturesDetected = Object.entries(
  auditResult.plan_analysis.premium_features_detected
)
  .filter(([_, detected]) => detected)
  .map(([feature]) => FEATURE_LABELS[feature] || feature);

// Usage percent rounded to 1 decimal
const usagePercent = Number(
  (auditResult.plan_analysis.usage_percentile * 100).toFixed(1)
);

// ===== SAFE ZONE =====
const optimizedZaps = auditResult.per_zap_findings
  .filter(zap => zap.flags.length === 0 && !zap.is_zombie)
  .map(zap => ({ zapName: zap.zap_name }));

// ===== BUILD VIEW MODEL =====
return {
  report: {
    reportId,
    generatedAt: auditResult.audit_metadata.generated_at,
  },

  financialOverview: {
    recapturableAnnualSpend: annualWaste,
    multiplier,
    totalZaps: auditResult.global_metrics.total_zaps,       
    activeZaps: auditResult.global_metrics.active_zaps,
    highSeverityCount: auditResult.global_metrics.high_severity_flag_count,
    estimatedRemediationMinutes: roundedRemediationMinutes,
  },

  priorityActions,

  riskSummary: {
    highSeverityCount: highSeverityCount,  // ← OPRAVENÉ
    mediumSeverityCount: mediumSeverityCount,  // ← OPRAVENÉ
    inefficientLogicPatterns,
    redundancyPatterns,
    nonExecutingAutomations,
  },

  planSummary: {
    currentPlan: auditResult.plan_analysis.current_plan,
    usagePercent,
    premiumFeaturesDetected,
    downgradeRecommended: auditResult.plan_analysis.downgrade_safe,
  },

  safeZone: {
    optimizedZaps,
  },
};
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Generate stable report ID from timestamp
 * Format: ZAP-YYYY-NNN where NNN is day of year
 */
function generateReportId(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const year = date.getFullYear();
  
  // Calculate day of year (1-366)
  const start = new Date(year, 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  
  // Pad to 3 digits
  const dayPadded = dayOfYear.toString().padStart(3, '0');
  
  return `ZAP-${year}-${dayPadded}`;
}
