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
  auditResult: AuditResult,
  reportCode: string
): PdfViewModel {
  const AUDIT_COST = 79;
  const annualWaste = auditResult.global_metrics.estimated_annual_waste_usd;

  // ===== REPORT METADATA =====
  // Use provided report code from main.ts report ID system
  
  // ===== CREATE GLOBAL ZAP NAME MAPPING =====
  // Use last 4 digits of Zapier ID for unnamed automations
  const zapNameMap = new Map<string, string>();

  auditResult.per_zap_findings.forEach(zap => {
    if (zap.zap_name === 'Untitled Zap') {
      // Extract last 4 characters from zap_id
      const shortId = zap.zap_id.slice(-4);
      zapNameMap.set(zap.zap_id, `Zap #${shortId}`);
    } else {
      zapNameMap.set(zap.zap_id, zap.zap_name);
    }
  });
  
  // Helper function to get display name
  const getDisplayName = (zapId: string): string => {
    return zapNameMap.get(zapId) || 'Unknown Automation';
  };
  
  // ===== FINANCIAL OVERVIEW =====
  const multiplier = AUDIT_COST > 0 
    ? Number((annualWaste / AUDIT_COST).toFixed(1)) 
    : 0;

  const estimatedRemediationMinutes = auditResult.per_zap_findings
    .flatMap(zap => zap.flags)
    .reduce((acc, flag) => {
      const effort = EFFORT_MAP[flag.code] ?? 10;
      return acc + effort;
    }, 0);

  const roundedRemediationMinutes = Math.ceil(estimatedRemediationMinutes / 5) * 5;

  // ===== PRIORITY ACTIONS =====
  const priorityActions = auditResult.opportunities_ranked
    .slice(0, 5)
    .map(opportunity => ({
      zapName: getDisplayName(opportunity.zap_id),
      actionLabel: ACTION_LABELS[opportunity.flag_code] || 'Optimize automation',
      estimatedAnnualImpact: opportunity.estimated_monthly_savings_usd * 12,
      effortMinutes: EFFORT_MAP[opportunity.flag_code] ?? 10,
      flagType: opportunity.flag_code,
    }));

  // ===== RISK SUMMARY =====
  const allFlags = auditResult.per_zap_findings.flatMap(zap => zap.flags);
  
  const highSeverityCount = allFlags.filter(f => 
    f.severity === 'High'
  ).length;

  const mediumSeverityCount = allFlags.filter(f => 
    f.severity === 'Medium'
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

  const usagePercent = Number(
    (auditResult.plan_analysis.usage_percentile * 100).toFixed(1)
  );

  // ===== SAFE ZONE =====
  const optimizedZaps = auditResult.per_zap_findings
    .filter(zap => zap.flags.length === 0 && !zap.is_zombie)
    .map(zap => ({ zapName: getDisplayName(zap.zap_id) }));

  // ===== BUILD VIEW MODEL =====
  return {
    report: {
      reportId: reportCode,
      generatedAt: auditResult.audit_metadata.generated_at,
    },

    financialOverview: {
      recapturableAnnualSpend: annualWaste,
      multiplier,
      totalZaps: auditResult.global_metrics.total_zaps,
      activeZaps: auditResult.global_metrics.active_zaps,
      highSeverityCount: auditResult.global_metrics.high_severity_flag_count,
      estimatedRemediationMinutes: roundedRemediationMinutes,
      totalOpportunitiesCount: auditResult.opportunities_ranked.length,
    },

    priorityActions,

    riskSummary: {
      highSeverityCount: highSeverityCount,
      mediumSeverityCount: mediumSeverityCount,
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

