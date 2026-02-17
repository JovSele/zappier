import jsPDF from 'jspdf';
import type { ReAuditMetadata } from './types/reaudit';
import { serializeMetadata } from './types/reaudit';

// ========================================
// EXECUTIVE AUDIT PDF GENERATOR v1.0.0
// ========================================
// Generates minimalist, professional 5-page Executive Automation Audit
// Design philosophy: "Informed Control" - clarity over drama
//
// Structure:
// - Page 1: Executive Summary (financial overview)
// - Page 2: Priority Actions (actionable improvements)
// - Page 3: Infrastructure Health (risk summary)
// - Page 4: Plan Analysis (cost optimization)
// - Page 5: Verified Stable Automations (psychological relief)
//
// Design system:
// - Typography: Helvetica (body), Helvetica Bold (emphasis)
// - Colors: Minimal palette (red accent for financials only)
// - Layout: 25% whitespace target, fixed positioning
// - Footer: Confidential statement + privacy notice on every page
// ========================================

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface PDFConfig {
  reportCode: string;
  clientName?: string;
  reauditMetadata?: ReAuditMetadata;
}

export interface PdfViewModel {
  report: {
    reportId: string;
    generatedAt: string;
  };
  
  financialOverview: {
    recapturableAnnualSpend: number;
    multiplier: number;
    totalZaps: number;         // ← PRIDANÉ
    activeZaps: number;
    highSeverityCount: number;
    estimatedRemediationMinutes: number;
  }
  
  priorityActions: Array<{
    zapName: string;
    actionLabel: string;
    estimatedAnnualImpact: number;
    effortMinutes: number;
    flagType?: string;
  }>;
  
  riskSummary: {
    highSeverityCount: number;
    mediumSeverityCount: number;
    inefficientLogicPatterns: number;
    redundancyPatterns: number;
    nonExecutingAutomations: number;
  };
  
  planSummary: {
    currentPlan: string;
    usagePercent: number;
    premiumFeaturesDetected: string[];
    downgradeRecommended: boolean;
  };
  
  safeZone: {
    optimizedZaps: Array<{ zapName: string }>;
  };
}

// ========================================
// DESIGN SYSTEM
// ========================================

const COLORS = {
  PRIMARY_RED: { r: 195, g: 57, b: 43 },    // #C0392B - Len pre finančné čísla
  TEXT_PRIMARY: { r: 30, g: 41, b: 59 },    // #1E293B - Slate-900
  TEXT_SECONDARY: { r: 100, g: 116, b: 139 }, // #64748B - Slate-500
  DIVIDER: { r: 229, g: 231, b: 235 },       // #E5E7EB - Gray-200
  BACKGROUND: { r: 255, g: 255, b: 255 }     // #FFFFFF
};

const LAYOUT = {
  PAGE_MARGIN: 20,
  TOP_MARGIN: 60,
  SECTION_SPACING: 40,
  LINE_SPACING: 20,
  CONTENT_WIDTH: 170  // A4 width - 2*margin
};

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Format currency - show cents only for values < $1
 */
function formatCurrency(amount: number): string {
  if (amount < 1) {
    return `$${amount.toFixed(2)}`;
  }
  return `$${Math.round(amount)}`;
}

/**
 * Check if there's enough space to safely render content above footer zone
 * @param yPos - Current Y position
 * @param pageHeight - Total page height
 * @param requiredSpace - Minimum space needed (default 10mm)
 * @returns true if safe to render, false if would overflow into footer
 */
function safeRender(
  yPos: number,
  pageHeight: number,
  requiredSpace: number = 10
): boolean {
  return yPos + requiredSpace < pageHeight - 30;
}

/**
 * Draw page footer with confidential statement
 */

function drawPageFooter(
  pdf: jsPDF,
  pageNum: number,
  clientName: string
): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = LAYOUT.PAGE_MARGIN;

  // Divider line
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);

  // Set footer text color (gray #777 = rgb(119, 119, 119))
  pdf.setTextColor(119, 119, 119);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');

  // LINE 1: Confidential statement (left only)
  pdf.text(
    `CONFIDENTIAL AUDIT — Prepared for ${clientName}`,
    margin,
    pageHeight - 13
  );

  // LINE 2: Privacy notice (left) + Page number (right)
  pdf.text(
    'Data processed locally. No cloud storage.',
    margin,
    pageHeight - 8
  );
  
  pdf.text(
    `Page ${pageNum}`,
    pageWidth - margin,
    pageHeight - 8,
    { align: 'right' }
  );
}

// ========================================
// PAGE RENDERING FUNCTIONS
// ========================================

/**
 * Calculate Health Score - Calibrated Hybrid Model
 * Combines architectural issues, remediation effort, and ROI analysis
 * Formula: 100 - (severityPenalty + effortPenalty + economicPenalty)
 * - Architectural: min(60, high * 13 + medium * 3)
 * - Effort: >60min = +2, >30min = +1
 * - Economic: ROI < 1x = +2
 * Range: 0-100 (clamped)
 */
function calculateHealthScore(vm: PdfViewModel): number {
  const high = vm.riskSummary.highSeverityCount;
  const medium = vm.riskSummary.mediumSeverityCount;
  const annualSavings = vm.financialOverview.recapturableAnnualSpend || 0;
  const remediationMinutes = vm.financialOverview.estimatedRemediationMinutes || 0;
  const AUDIT_COST = 79;

  const severityPenalty = Math.min(60, (high * 10) + (medium * 3));
  const effortPenalty = remediationMinutes > 60 ? 2 : remediationMinutes > 30 ? 1 : 0;
  const economicPenalty = annualSavings < AUDIT_COST ? 2 : 0;

  return Math.max(0, Math.min(100, 100 - severityPenalty - effortPenalty - economicPenalty));
}

/**
 * Render Page 1: Executive Summary
 * Shows financial overview and key metrics
 */
function renderPage1_ExecutiveSummary(
  pdf: jsPDF,
  viewModel: PdfViewModel,
  _config: PDFConfig
): void {
  const { PAGE_MARGIN, TOP_MARGIN, CONTENT_WIDTH } = LAYOUT;
  let yPos = TOP_MARGIN;

  // ===== HEADER =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('EXECUTIVE AUTOMATION AUDIT', PAGE_MARGIN, yPos);
  
  yPos += 8;

  // Report ID
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
  pdf.text(`Audit ID: ${viewModel.report.reportId}`, PAGE_MARGIN, yPos);
  
  yPos += 5;

  // Timestamp
  const timestamp = new Date(viewModel.report.generatedAt);
  const dateStr = timestamp.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
  const timeStr = timestamp.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: true 
  });
  pdf.text(`Generated: ${dateStr} • ${timeStr}`, PAGE_MARGIN, yPos);
  
  yPos += 15;

  // ===== DIVIDER 1 =====
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
  
  yPos += 20;

  // ===== MAIN METRIC: Recapturable Spend =====
  const spendAmount = formatCurrency(viewModel.financialOverview.recapturableAnnualSpend);
  
  pdf.setTextColor(COLORS.PRIMARY_RED.r, COLORS.PRIMARY_RED.g, COLORS.PRIMARY_RED.b);
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  
  // Center the amount
  const amountWidth = pdf.getTextWidth(spendAmount);
  const centerX = PAGE_MARGIN + (CONTENT_WIDTH / 2) - (amountWidth / 2);
  pdf.text(spendAmount, centerX, yPos);
  
  yPos += 10;

  // Label
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Recapturable Annual Spend', PAGE_MARGIN + (CONTENT_WIDTH / 2), yPos, { align: 'center' });
  
  yPos += 15;

  // Multiplier statement
  pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'italic');
  const roiMultiplier = viewModel.financialOverview.multiplier;
  const roiSubtext = roiMultiplier >= 1
    ? `Equivalent to ${roiMultiplier.toFixed(1)}× the cost of this audit.`
    : 'Low financial leakage detected.';
  pdf.text(roiSubtext, PAGE_MARGIN + (CONTENT_WIDTH / 2), yPos, { align: 'center' });
  
  yPos += 20;

  // ===== DIVIDER 2 =====
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
  
  yPos += 15;

  // ===== KEY STATISTICS =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');

  // Build stats array with dynamic Zaps label
  const stats = [];

  const totalZaps = viewModel.financialOverview.totalZaps;
  const activeZaps = viewModel.financialOverview.activeZaps;

  if (activeZaps === 0) {
    stats.push(`Total Zaps Analyzed: ${totalZaps} (all inactive)`);
  } else if (activeZaps === totalZaps) {
    stats.push(`Total Zaps Analyzed: ${totalZaps} (all active)`);
  } else {
    stats.push(`Active Zaps: ${activeZaps} of ${totalZaps}`);
  }

  stats.push(`High Priority Issues: ${viewModel.financialOverview.highSeverityCount}`);
  stats.push(`Estimated Remediation Time: ${viewModel.financialOverview.estimatedRemediationMinutes} minutes`);

  stats.forEach(stat => {
    pdf.text(stat, PAGE_MARGIN, yPos);
    yPos += 7;
  });
  
  yPos += 8;

  // ===== DIVIDER 3 =====
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);

  // ── HEALTH SCORE ────────────────────────────────────── (OPTIONAL)
  const pageHeight = pdf.internal.pageSize.getHeight();
  
  if (safeRender(yPos, pageHeight, 20)) {
    yPos += 10;
    pdf.setDrawColor(229, 231, 235);
    pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
    yPos += 8;

    const healthScore = calculateHealthScore(viewModel);
    const isGood = healthScore >= 80;
    const isMedium = healthScore >= 50 && healthScore < 80;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text('Automation Health Score', PAGE_MARGIN, yPos);

    pdf.setFont('helvetica', 'bold');
    if (isGood) pdf.setTextColor(22, 163, 74);
    else if (isMedium) pdf.setTextColor(217, 119, 6);
    else pdf.setTextColor(192, 57, 43);

    pdf.text(`${healthScore} / 100`, PAGE_MARGIN + CONTENT_WIDTH, yPos, { align: 'right' });
    yPos += 5;

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(148, 163, 184);
    const scoreLabel = isGood ? 'All systems operating within benchmarks'
      : isMedium ? 'Minor inefficiencies detected'
      : 'Immediate review recommended';
    pdf.text(scoreLabel, PAGE_MARGIN, yPos);
  }
}

/**
 * Map flag type to Root Cause label
 */
function getRootCauseLabel(flagType: string | undefined): string {
  if (!flagType) return 'Structural Inefficiency';
  
  const map: Record<string, string> = {
    'inefficient_logic': 'Excess Task Consumption',
    'redundant_step': 'Redundant Process Layer',
    'non_executing': 'Dead Workflow Branch',
    'filter_position': 'Suboptimal Filter Placement',
  };
  return map[flagType] ?? 'Structural Inefficiency';
}

/**
 * Map flag type to diagnostic description explaining the issue
 */
function getRootCauseDescription(flagType: string | undefined): string {
  if (!flagType) return 'Structural inefficiency identified — review step configuration.';
  
  const map: Record<string, string> = {
    'inefficient_logic': 
      'Merge multiple operations into a single step to eliminate task duplication.',
    'redundant_step': 
      'Remove redundant process layer — identical output achievable with fewer steps.',
    'non_executing': 
      'Dead branch detected — workflow triggers but produces no downstream output.',
    'filter_position': 
      'Filter placement causes unnecessary upstream execution before discard.',
  };
  return map[flagType] ?? 'Structural inefficiency identified — review step configuration.';
}

/**
 * Derive workflow pattern description based on audit data
 */
function deriveWorkflowPattern(vm: PdfViewModel): string {
  const highCount = vm.riskSummary.highSeverityCount;
  const zapCount = vm.financialOverview.totalZaps;

  if (highCount === 0) {
    return `${zapCount} workflow${zapCount !== 1 ? 's' : ''} — no critical branches detected`;
  }

  const redundant = vm.riskSummary.redundancyPatterns;
  const inefficient = vm.riskSummary.inefficientLogicPatterns;

  return `Linear chain with ${inefficient} conditional branch${inefficient !== 1 ? 'es' : ''}, ${redundant} redundanc${redundant !== 1 ? 'ies' : 'y'}`;
}

/**
 * Render Page 2: Priority Actions
 * Shows actionable improvements with effort estimates
 */
function renderPage2_PriorityActions(
  pdf: jsPDF,
  viewModel: PdfViewModel
): void {
  const { PAGE_MARGIN, TOP_MARGIN, CONTENT_WIDTH } = LAYOUT;
  let yPos = TOP_MARGIN;

  // ===== HEADER =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  
  // Add time estimate to header if we have actions
  const headerText = viewModel.priorityActions.length > 0 
    ? 'Priority Actions (<15 min)' 
    : 'Priority Actions';
  
  pdf.text(headerText, PAGE_MARGIN, yPos);
  
  yPos += 12;

  // ===== DIVIDER =====
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
  
  yPos += 15;

  // ===== CONTENT =====
  if (viewModel.priorityActions.length === 0) {
    // Empty state
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    
    pdf.text('No priority actions identified.', PAGE_MARGIN, yPos);
    yPos += 7;
    
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text('Current automation setup meets efficiency benchmarks.', PAGE_MARGIN, yPos);
    
    yPos += 15;
  } else {
    // Render each action
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    viewModel.priorityActions.forEach((action, index) => {
      // Checkbox
      pdf.setDrawColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
      pdf.setLineWidth(0.3);
      pdf.rect(PAGE_MARGIN, yPos - 3, 4, 4); // Empty checkbox
      
      // Zap name (bold, primary color)
      pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(action.zapName, PAGE_MARGIN + 8, yPos);
      
      yPos += 7;
      
      // Root Cause (red, bold, small) - OPTIONAL
      if (safeRender(yPos, pageHeight, 15)) {
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(192, 57, 43);
        pdf.text(`Root Cause: ${getRootCauseLabel(action.flagType)}`, PAGE_MARGIN + 12, yPos);
        yPos += 5;
      }
      
      // Root Cause Description (gray, normal, small) - OPTIONAL
      const pageWidth = pdf.internal.pageSize.getWidth();
      if (safeRender(yPos, pageHeight, 12)) {
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
        pdf.text(
          getRootCauseDescription(action.flagType), 
          PAGE_MARGIN + 12, 
          yPos,
          { maxWidth: pageWidth - PAGE_MARGIN * 2 - 12 }
        );
        yPos += 5;
      }
      
      // Action label (normal, indented)
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
      pdf.text(action.actionLabel, PAGE_MARGIN + 12, yPos);
      
      yPos += 7;
      
      // Impact (secondary color, indented)
      pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
      pdf.setFontSize(10);
      const impactText = `Impact: ${formatCurrency(action.estimatedAnnualImpact)}/year`;
      pdf.text(impactText, PAGE_MARGIN + 12, yPos);
      
      yPos += 5;
      
      // Effort (secondary color, indented)
      pdf.text(`Effort: ${action.effortMinutes} min`, PAGE_MARGIN + 12, yPos);
      
      yPos += 12;
      
      // Divider between items (except after last item)
      if (index < viewModel.priorityActions.length - 1) {
        pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
        pdf.setLineWidth(0.3);
        pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
        yPos += 12;
      }
    });
  }

  // ===== FINAL DIVIDER =====
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);

  // ── WORKFLOW PATTERN INSIGHT ────────────────────────── (OPTIONAL)
  const pageHeight = pdf.internal.pageSize.getHeight();
  
  if (safeRender(yPos, pageHeight, 12)) {
    yPos += 12;
    pdf.setDrawColor(229, 231, 235);
    pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
    yPos += 7;

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(148, 163, 184);
    pdf.text(`Workflow Pattern: ${deriveWorkflowPattern(viewModel)}`, PAGE_MARGIN, yPos);
  }
}

/**
 * Render Page 3: Infrastructure Health
 * Shows risk summary and pattern analysis
 */
function renderPage3_InfrastructureHealth(
  pdf: jsPDF,
  viewModel: PdfViewModel
): void {
  const { PAGE_MARGIN, TOP_MARGIN, CONTENT_WIDTH } = LAYOUT;
  let yPos = TOP_MARGIN;

  // ===== HEADER =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Infrastructure Health', PAGE_MARGIN, yPos);
  
  yPos += 12;

  // ===== DIVIDER =====
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
  
  yPos += 15;

  // Check if we have any risks
  const { riskSummary } = viewModel;
  const hasRisks = 
    riskSummary.highSeverityCount > 0 ||
    riskSummary.mediumSeverityCount > 0 ||
    riskSummary.inefficientLogicPatterns > 0 ||
    riskSummary.redundancyPatterns > 0 ||
    riskSummary.nonExecutingAutomations > 0;

  if (!hasRisks) {
    // ===== EMPTY STATE =====
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    
    pdf.text('No structural inefficiencies detected.', PAGE_MARGIN, yPos);
    yPos += 7;
    
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text('Infrastructure is operating within normal parameters.', PAGE_MARGIN, yPos);
    
    yPos += 15;
  } else {
    // ===== RISK SUMMARY SECTION =====
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Risk Summary', PAGE_MARGIN, yPos);
    
    yPos += 3;
    
    // Underline for section
    pdf.setLineWidth(0.5);
    const sectionUnderlineWidth = pdf.getTextWidth('Risk Summary');
    pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + sectionUnderlineWidth, yPos);
    
    yPos += 12;

    // High Severity
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text('High Severity:', PAGE_MARGIN + 5, yPos);
    
    pdf.setFont('helvetica', 'bold');
    pdf.text(riskSummary.highSeverityCount.toString(), PAGE_MARGIN + 60, yPos);
    
    yPos += 7;

    // High Severity subtext (if any high severity issues exist) - OPTIONAL
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    if (riskSummary.highSeverityCount > 0 && safeRender(yPos, pageHeight, 10)) {
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(192, 57, 43);
      pdf.text('Requires immediate attention', PAGE_MARGIN + 9, yPos);
      yPos += 4;
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    }

    // Medium Severity
    pdf.setFont('helvetica', 'normal');
    pdf.text('Medium Severity:', PAGE_MARGIN + 5, yPos);
    
    pdf.setFont('helvetica', 'bold');
    pdf.text(riskSummary.mediumSeverityCount.toString(), PAGE_MARGIN + 60, yPos);
    
    yPos += 15;

    // ===== PATTERN ANALYSIS SECTION =====
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Pattern Analysis', PAGE_MARGIN, yPos);
    
    yPos += 3;
    
    // Underline
    const patternUnderlineWidth = pdf.getTextWidth('Pattern Analysis');
    pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + patternUnderlineWidth, yPos);
    
    yPos += 12;

    // Pattern items
    const pageWidth = pdf.internal.pageSize.getWidth();
    
    // Inefficient Logic
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.text('Root Cause — Inefficient Logic:', PAGE_MARGIN, yPos);
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    const inefficientCount = riskSummary.inefficientLogicPatterns;
    pdf.text(
      `${inefficientCount} instance${inefficientCount !== 1 ? 's' : ''}`,
      pageWidth - PAGE_MARGIN,
      yPos,
      { align: 'right' }
    );
    yPos += 7;

    // Redundant Steps
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.text('Root Cause — Redundant Steps:', PAGE_MARGIN, yPos);
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    const redundantCount = riskSummary.redundancyPatterns;
    pdf.text(
      `${redundantCount} instance${redundantCount !== 1 ? 's' : ''}`,
      pageWidth - PAGE_MARGIN,
      yPos,
      { align: 'right' }
    );
    yPos += 7;

    // Non-Executing
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.text('Root Cause — Non-Executing:', PAGE_MARGIN, yPos);
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    const nonExecutingCount = riskSummary.nonExecutingAutomations;
    pdf.text(
      `${nonExecutingCount} instance${nonExecutingCount !== 1 ? 's' : ''}`,
      pageWidth - PAGE_MARGIN,
      yPos,
      { align: 'right' }
    );
    yPos += 7;
    
    yPos += 8;
  }

  // ===== FINAL DIVIDER =====
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
}

/**
 * Render Page 4: Plan Analysis
 * Shows current plan utilization and recommendations
 */
function renderPage4_PlanAnalysis(
  pdf: jsPDF,
  viewModel: PdfViewModel
): void {
  const { PAGE_MARGIN, TOP_MARGIN, CONTENT_WIDTH } = LAYOUT;
  let yPos = TOP_MARGIN;

  // ===== HEADER =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Plan Analysis', PAGE_MARGIN, yPos);
  
  yPos += 12;

  // ===== DIVIDER =====
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
  
  yPos += 15;

  // ===== CURRENT PLAN =====
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Current Plan:', PAGE_MARGIN, yPos);
  
  pdf.setFont('helvetica', 'bold');
  pdf.text(viewModel.planSummary.currentPlan, PAGE_MARGIN + 40, yPos);
  
  yPos += 7;

  // ===== TASK USAGE =====
  pdf.setFont('helvetica', 'normal');
  pdf.text('Task Usage:', PAGE_MARGIN, yPos);
  
  pdf.setFont('helvetica', 'bold');
  const usageText = `${viewModel.planSummary.usagePercent}%`;
  pdf.text(usageText, PAGE_MARGIN + 40, yPos);
  
  yPos += 12;

  /// ===== UTILIZATION ASSESSMENT ===== (OPTIONAL)
  const pageHeight = pdf.internal.pageSize.getHeight();
  const utilizationPct = viewModel.planSummary.usagePercent;
  
  // Calculate verdict and recommended action with stronger consultant tone
  let utilizationVerdict: string;
  let recommendedAction: string;

  if (utilizationPct === 0) {
    utilizationVerdict = 'Zero task consumption detected in audit window.';
    recommendedAction = 'High Optimization Potential — plan cost exceeds operational value.';
  } else if (utilizationPct < 10) {
    utilizationVerdict = 'Critical underutilization relative to plan capacity.';
    recommendedAction = 'High Optimization Potential — significant capacity available.';
  } else if (utilizationPct < 30) {
    utilizationVerdict = 
      'Current plan is functionally sufficient but economically inefficient relative to workload.';
    recommendedAction = viewModel.planSummary.downgradeRecommended
      ? 'Downgrade recommended — current tier exceeds operational requirements.'
      : 'Plan review recommended — utilization below optimal threshold.';
  } else if (utilizationPct < 70) {
    utilizationVerdict = 'Plan utilization within acceptable operational range.';
    recommendedAction = 'Current plan is appropriate.';
  } else {
    utilizationVerdict = 'High utilization — plan capacity approaching operational limits.';
    recommendedAction = 'Monitor task consumption — consider plan upgrade proactively.';
  }
  
  if (safeRender(yPos, pageHeight, 25)) {
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(utilizationVerdict, PAGE_MARGIN, yPos);
    yPos += 8;
  }

  yPos += 7;

  // ===== PREMIUM FEATURES (if any) =====
  if (viewModel.planSummary.premiumFeaturesDetected.length > 0) {
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Premium Features Detected:', PAGE_MARGIN, yPos);
    
    yPos += 7;
    
    // List features
    viewModel.planSummary.premiumFeaturesDetected.forEach(feature => {
      pdf.setFont('helvetica', 'normal');
      pdf.text(`• ${feature}`, PAGE_MARGIN + 5, yPos);
      yPos += 6;
    });
    
    yPos += 9;
  }

 // ===== RECOMMENDED ACTION =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Recommended Action:', PAGE_MARGIN, yPos);

  yPos += 7;

  pdf.setFont('helvetica', 'normal');
  pdf.text(recommendedAction, PAGE_MARGIN, yPos);
  yPos += 7;

  // ===== FINAL DIVIDER =====
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
}

/**
 * Render Page 5: Verified Stable Automations (Safe Zone)
 * Shows automations that require no action - psychological relief
 */
function renderPage5_SafeZone(
  pdf: jsPDF,
  viewModel: PdfViewModel
): void {
  const { PAGE_MARGIN, TOP_MARGIN, CONTENT_WIDTH } = LAYOUT;
  let yPos = TOP_MARGIN;

  // ===== HEADER =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Verified Stable Automations', PAGE_MARGIN, yPos);
  
  yPos += 12;

  // ===== DIVIDER =====
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
  
  yPos += 15;

  if (viewModel.safeZone.optimizedZaps.length === 0) {
    // ===== EMPTY STATE =====
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    
    pdf.text('No fully optimized automations identified.', PAGE_MARGIN, yPos);
    
    yPos += 15;
  } else {
    // ===== INTRO TEXT =====
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    
    pdf.text('The following automations require no action:', PAGE_MARGIN, yPos);
    
    yPos += 12;

    // ===== LIST OF SAFE ZAPS =====
    viewModel.safeZone.optimizedZaps.forEach(zap => {
      pdf.text(`• ${zap.zapName}`, PAGE_MARGIN + 5, yPos);
      yPos += 6;
    });
    
    yPos += 9;

    // ===== CLOSING STATEMENT =====
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text('These processes meet all efficiency benchmarks.', PAGE_MARGIN, yPos);
    
    yPos += 15;
  }

  // ===== FINAL DIVIDER =====
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
}

// ========================================
// RE-AUDIT METADATA EMBEDDING
// ========================================

/**
 * Embed re-audit metadata into PDF as custom property
 * Stored in PDF Keywords field with special prefix for later extraction
 */
function embedReAuditMetadata(pdfDoc: jsPDF, metadata: ReAuditMetadata) {
  const metadataJson = serializeMetadata(metadata);
  
  // Encode as base64 to avoid JSON parsing issues in PDF metadata
  const metadataBase64 = btoa(metadataJson);
  
  // Embed in Keywords field with special prefix
  const keywords = `REAUDIT_V1:${metadataBase64}`;
  
  pdfDoc.setProperties({
    keywords: keywords,
    subject: 'Zapier Lighthouse Audit Report - Re-Audit Enabled'
  });
  
  console.log('✅ Re-audit metadata embedded into PDF');
}

// ========================================
// MAIN ENTRY POINT
// ========================================

/**
 * Generate Executive Automation Audit PDF
 * @param viewModel - Pre-processed view model from mapping layer
 * @param config - PDF configuration
 */
export async function generateExecutiveAuditPDF(
  viewModel: PdfViewModel,
  config: PDFConfig
): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  
  // Page 1: Executive Summary
  renderPage1_ExecutiveSummary(pdf, viewModel, config);
  drawPageFooter(pdf, 1, config.clientName || 'Client');
  
  // Page 2: Priority Actions
  pdf.addPage();
  renderPage2_PriorityActions(pdf, viewModel);
  drawPageFooter(pdf, 2, config.clientName || 'Client');
  
  // Page 3: Infrastructure Health
  pdf.addPage();
  renderPage3_InfrastructureHealth(pdf, viewModel);
  drawPageFooter(pdf, 3, config.clientName || 'Client');
  
  // Page 4: Plan Analysis
  pdf.addPage();
  renderPage4_PlanAnalysis(pdf, viewModel);
  drawPageFooter(pdf, 4, config.clientName || 'Client');
  
  // Page 5: Verified Stable Automations (Safe Zone)
  pdf.addPage();
  renderPage5_SafeZone(pdf, viewModel);
  drawPageFooter(pdf, 5, config.clientName || 'Client');
  
  // ============================================================================
  // EMBED RE-AUDIT METADATA (if provided)
  // ============================================================================
  if (config.reauditMetadata) {
    embedReAuditMetadata(pdf, config.reauditMetadata);
  }
  
  // Save
  const timestamp = new Date().toISOString().split('T')[0];
  pdf.save(`Executive_Audit_${config.reportCode}_${timestamp}.pdf`);
}

// ========================================
// RE-EXPORTS
// ========================================

// Re-export mapper for convenience
export { mapAuditToPdfViewModel } from './pdfViewModelMapper';
