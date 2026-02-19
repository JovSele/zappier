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
    totalOpportunitiesCount?: number;
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
  PAGE_MARGIN: 22,
  TOP_MARGIN: 45,
  SECTION_SPACING: 32,
  LINE_SPACING: 18,
  CONTENT_WIDTH: 166  // A4 width - 2*margin
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
    `CONFIDENTIAL — Prepared exclusively for ${clientName}`,
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
 * Get Health Score benchmark category
 * Board-level classification for executive reporting
 */
function getHealthScoreCategory(score: number): string {
  if (score >= 90) return 'OPTIMAL';
  if (score >= 75) return 'STABLE';
  if (score >= 50) return 'NEEDS ATTENTION';
  return 'CRITICAL RISK';
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

  // ===== DUAL COLUMN LAYOUT: ROI + HEALTH SCORE =====
  const leftColX = PAGE_MARGIN;
  const rightColX = PAGE_MARGIN + CONTENT_WIDTH / 2 + 10;

  // Calculate box dimensions
  const boxWidth = (CONTENT_WIDTH / 2) - 5;  // wider boxes
  const boxPadding = 8;  // more internal padding
  const boxHeight = 35;  // taller boxes
  const boxY = yPos - 8;  // start higher

  // LEFT BOX: ROI
  pdf.setFillColor(250, 251, 252);  // slate-50 — very subtle background
  pdf.setDrawColor(203, 213, 225);  // slate-300 — subtle border
  pdf.setLineWidth(0.5);
  pdf.roundedRect(leftColX - boxPadding, boxY, boxWidth, boxHeight, 2, 2, 'FD');  // 'FD' = Fill + Draw

  // RIGHT BOX: Health Score
  pdf.setFillColor(250, 251, 252);  // same background
  pdf.setDrawColor(203, 213, 225);  // same border
  pdf.roundedRect(rightColX - boxPadding, boxY, boxWidth, boxHeight, 2, 2, 'FD');

  // Reset for text rendering
  pdf.setDrawColor(0, 0, 0);

  // LEFT COLUMN: Financial amount (PRIMARY METRIC — fontSize 34, centered in box)
  const spendAmount = formatCurrency(viewModel.financialOverview.recapturableAnnualSpend);
  pdf.setTextColor(COLORS.PRIMARY_RED.r, COLORS.PRIMARY_RED.g, COLORS.PRIMARY_RED.b);
  pdf.setFontSize(34);
  pdf.setFont('helvetica', 'bold');
  const spendWidth = pdf.getTextWidth(spendAmount);
  const leftCenterX = leftColX - boxPadding + (boxWidth / 2) - (spendWidth / 2);
  pdf.text(spendAmount, leftCenterX, yPos);

  // RIGHT COLUMN: Health Score (SECONDARY METRIC — fontSize 24, centered in box)
  const healthScore = calculateHealthScore(viewModel);
  const category = getHealthScoreCategory(healthScore);

  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');

  // Color based on category
  if (healthScore >= 75) pdf.setTextColor(22, 163, 74);      // green
  else if (healthScore >= 50) pdf.setTextColor(217, 119, 6); // orange
  else pdf.setTextColor(192, 57, 43);                        // red

  const scoreText = `${healthScore} / 100`;
  const scoreWidth = pdf.getTextWidth(scoreText);
  const rightCenterX = rightColX - boxPadding + (boxWidth / 2) - (scoreWidth / 2);
  pdf.text(scoreText, rightCenterX, yPos + 2);

  yPos += 10;

  // LEFT: Label (centered in box)
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  const leftLabel = 'Recapturable Annual Spend';
  const leftLabelWidth = pdf.getTextWidth(leftLabel);
  const leftLabelX = leftColX - boxPadding + (boxWidth / 2) - (leftLabelWidth / 2);
  pdf.text(leftLabel, leftLabelX, yPos);

  // RIGHT: Health Score label (centered in box)
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
  const rightLabel = `Health Score — ${category}`;
  const rightLabelWidth = pdf.getTextWidth(rightLabel);
  const rightLabelX = rightColX - boxPadding + (boxWidth / 2) - (rightLabelWidth / 2);
  pdf.text(rightLabel, rightLabelX, yPos);

  yPos += 12;

  // ROI subtext (left only)
  pdf.setFontSize(10);
  const roiMultiplier = viewModel.financialOverview.multiplier;
  
  if (roiMultiplier >= 1) {
    // Split into 3 parts: "Equivalent to " + "9.5×" + " the cost of this audit."
    const prefix = 'Equivalent to ';
    const multiplierText = `${roiMultiplier.toFixed(1)}×`;
    const suffix = ' the cost of this audit.';
    
    // Prefix (italic, normal)
    pdf.setFont('helvetica', 'italic');
    pdf.text(prefix, leftColX, yPos);
    
    // Multiplier (bold, italic)
    const prefixWidth = pdf.getTextWidth(prefix);
    pdf.setFont('helvetica', 'bolditalic');
    pdf.text(multiplierText, leftColX + prefixWidth, yPos);
    
    // Suffix (italic, normal)
    const multiplierWidth = pdf.getTextWidth(multiplierText);
    pdf.setFont('helvetica', 'italic');
    pdf.text(suffix, leftColX + prefixWidth + multiplierWidth, yPos, { 
      maxWidth: CONTENT_WIDTH / 2 - 5 - prefixWidth - multiplierWidth 
    });
  } else {
    pdf.setFont('helvetica', 'italic');
    pdf.text('Low financial leakage detected.', leftColX, yPos, { maxWidth: CONTENT_WIDTH / 2 - 5 });
  }

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

  // Total Zaps line
  stats.push(`Total Zaps Analyzed: ${totalZaps}`);

  // Status line (separate)
  if (activeZaps === 0) {
    stats.push('Status: No active automations detected');
  } else if (activeZaps === totalZaps) {
    stats.push('Status: All automations active');
  } else {
    stats.push(`Status: ${activeZaps} of ${totalZaps} automations active`);
  }

  stats.push(`High Priority Issues: ${viewModel.financialOverview.highSeverityCount}`);
  stats.push(`Estimated Remediation Time: ${viewModel.financialOverview.estimatedRemediationMinutes} minutes`);

  // Render stats with bold values
  stats.forEach(stat => {
    // Split stat into label + value using the last ": "
    const lastColonIndex = stat.lastIndexOf(': ');
    if (lastColonIndex > -1) {
      const label = stat.substring(0, lastColonIndex + 2); // Include ": "
      const value = stat.substring(lastColonIndex + 2);
      
      // Label (normal)
      pdf.setFont('helvetica', 'normal');
      pdf.text(label, PAGE_MARGIN, yPos);
      
      // Value (bold)
      const labelWidth = pdf.getTextWidth(label);
      pdf.setFont('helvetica', 'bold');
      pdf.text(value, PAGE_MARGIN + labelWidth, yPos);
    } else {
      // Fallback if no colon found
      pdf.setFont('helvetica', 'normal');
      pdf.text(stat, PAGE_MARGIN, yPos);
    }
    
    yPos += 7;
  });
  
  // Reset font
  pdf.setFont('helvetica', 'normal');
  
  yPos += 8;

  // ===== DIVIDER 3 =====
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
}

/**
 * Map flag type to Root Cause label
 */
function getRootCauseLabel(flagType: string | undefined): string {
  if (!flagType) return 'Structural Inefficiency';
  
  const map: Record<string, string> = {
    'FORMATTER_CHAIN': 'Formatter Chain Redundancy',
    'INTERLEAVED_TRANSFORMATIONS': 'Scattered Data Transformations',
    'TASK_STEP_COST_INFLATION': 'Excess Task Consumption',
    'LATE_FILTER': 'Suboptimal Filter Placement',
    'ZOMBIE_ZAP': 'Dead Workflow Branch',
    'PLAN_UNDERUTILIZATION': 'Plan Cost Inefficiency',
  };
  return map[flagType] ?? 'Structural Inefficiency';
}

/**
 * Map flag type to diagnostic description explaining the issue
 */
function getRootCauseDescription(flagType: string | undefined): string {
  if (!flagType) return 'Structural inefficiency identified — review step configuration.';
  
  const map: Record<string, string> = {
    'FORMATTER_CHAIN': 
      'Merge multiple formatting steps into a single operation to reduce task duplication.',
    'INTERLEAVED_TRANSFORMATIONS': 
      'Consolidate scattered data transformations — reduces complexity and task overhead.',
    'TASK_STEP_COST_INFLATION': 
      'Restructure step sequence to eliminate unnecessary task consumption.',
    'LATE_FILTER': 
      'Move filter earlier in workflow — prevents unnecessary execution of upstream steps.',
    'ZOMBIE_ZAP': 
      'Automation is active but not executing — deactivate to eliminate wasted plan capacity.',
    'PLAN_UNDERUTILIZATION': 
      'Current plan capacity significantly exceeds operational requirements.',
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
    // Group actions by zapName
    const groupedActions = new Map<string, typeof viewModel.priorityActions>();
    
    viewModel.priorityActions.forEach(action => {
      const existing = groupedActions.get(action.zapName) || [];
      existing.push(action);
      groupedActions.set(action.zapName, existing);
    });
    
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    // Render each Zap group
    let groupIndex = 0;
    
    groupedActions.forEach((actions, zapName) => {
      // Checkbox
      pdf.setDrawColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
      pdf.setLineWidth(0.3);
      pdf.rect(PAGE_MARGIN, yPos - 3, 4, 4);
      
      // Zap name (bold, primary color)
      pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(zapName, PAGE_MARGIN + 8, yPos);
      
      yPos += 6;
      
      // Render all flags for this Zap
      actions.forEach((action, flagIndex) => {
        // Root Cause (red, bold)
        if (safeRender(yPos, pageHeight, 15)) {
          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(192, 57, 43);
          pdf.text(`Root Cause: ${getRootCauseLabel(action.flagType)}`, PAGE_MARGIN + 8, yPos);
          yPos += 5;
        }
        
        // Root Cause Description (gray, normal)
        const pageWidth = pdf.internal.pageSize.getWidth();
        if (safeRender(yPos, pageHeight, 12)) {
          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
          pdf.text(
            getRootCauseDescription(action.flagType), 
            PAGE_MARGIN + 8, 
            yPos,
            { maxWidth: pageWidth - PAGE_MARGIN * 2 - 8 }
          );
          yPos += 6;
        }
        
        // Impact + Effort (split: gray labels, dark values)
        pdf.setFontSize(11);
        
        // LEFT: Impact
        pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
        pdf.text('Impact:', PAGE_MARGIN + 8, yPos);
        
        const impactValue = `${formatCurrency(action.estimatedAnnualImpact)}/year`;
        const impactLabelWidth = pdf.getTextWidth('Impact: ');
        pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
        pdf.text(impactValue, PAGE_MARGIN + 8 + impactLabelWidth, yPos);
        
        // RIGHT: Effort
        const impactTotalWidth = impactLabelWidth + pdf.getTextWidth(impactValue);
        const effortX = PAGE_MARGIN + 8 + impactTotalWidth + 15;
        
        pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
        pdf.text('Effort:', effortX, yPos);
        
        const effortValue = `${action.effortMinutes} min`;
        const effortLabelWidth = pdf.getTextWidth('Effort: ');
        pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
        pdf.text(effortValue, effortX + effortLabelWidth, yPos);
        
        yPos += 6;
        
        // Extra spacing between flags (if multiple flags for same Zap)
        if (flagIndex < actions.length - 1) {
          yPos += 8;  // doubled from 4 to 8 for clearer separation
        }
      });
      
      // Divider between Zap groups (except after last group)
      if (groupIndex < groupedActions.size - 1) {
        pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
        pdf.setLineWidth(0.3);
        pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
        yPos += 10;
      }
      
      groupIndex++;
    });
  }

  // ===== INFO NOTE (if more opportunities exist) =====
  const totalOpportunities = viewModel.financialOverview.totalOpportunitiesCount || 0;
  const shownActions = viewModel.priorityActions.length;

  if (totalOpportunities > shownActions) {
    yPos += 8;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(100, 116, 139); // slate-500
    const additionalCount = totalOpportunities - shownActions;
    pdf.text(
      `Note: Showing top ${shownActions} priority actions. Additional ${additionalCount} opportunit${additionalCount !== 1 ? 'ies' : 'y'} available in detailed audit.`,
      PAGE_MARGIN,
      yPos
    );
    yPos += 10;
  }

  // ===== FINAL DIVIDER =====
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);

  // ── WORKFLOW PATTERN INSIGHT ────────────────────────── (OPTIONAL)
  const pageHeight = pdf.internal.pageSize.getHeight();
  
  if (safeRender(yPos, pageHeight, 12)) {
    yPos += 8;  // smaller spacing, no divider line
    
    pdf.setFontSize(11);
    
    // Label (gray, italic)
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text('Workflow Pattern:', PAGE_MARGIN, yPos);
    
    // Value (dark, normal)
    const labelWidth = pdf.getTextWidth('Workflow Pattern: ');
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.text(deriveWorkflowPattern(viewModel), PAGE_MARGIN + labelWidth, yPos);
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
  pdf.text('Infrastructure Risk Assessment', PAGE_MARGIN, yPos);
  
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
    
    // Label (gray)
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text('High Severity:', PAGE_MARGIN + 5, yPos);
    
    // Count (red, bold)
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.PRIMARY_RED.r, COLORS.PRIMARY_RED.g, COLORS.PRIMARY_RED.b);
    pdf.text(riskSummary.highSeverityCount.toString(), PAGE_MARGIN + 60, yPos);
    
    yPos += 7;

    // Medium Severity
    // Label (gray)
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text('Medium Severity:', PAGE_MARGIN + 5, yPos);
    
    // Count (orange, bold)
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(217, 119, 6); // orange
    pdf.text(riskSummary.mediumSeverityCount.toString(), PAGE_MARGIN + 60, yPos);
    
    // Reset color to primary for next section
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    
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

  // ===== RISK ASSESSMENT INTERPRETATION ===== (OPTIONAL)
  const pageHeight = pdf.internal.pageSize.getHeight();

  if (safeRender(yPos, pageHeight, 15)) {
    yPos += 12;
    
    // Generate interpretation based on risk levels
    let interpretation = '';
    const { highSeverityCount, mediumSeverityCount } = viewModel.riskSummary;
    
    if (highSeverityCount === 0 && mediumSeverityCount === 0) {
      interpretation = 'Risk Assessment: No structural inefficiencies detected. Infrastructure operates within optimal parameters.';
    } else if (highSeverityCount === 0) {
      interpretation = 'Risk Assessment: Low-severity findings with minimal operational impact. Infrastructure remains stable.';
    } else if (highSeverityCount === 1) {
      interpretation = 'Risk Assessment: Isolated high-severity finding with minimal structural impact. Remediation recommended.';
    } else if (highSeverityCount <= 3) {
      interpretation = 'Risk Assessment: Multiple high-severity findings detected. Immediate remediation required to prevent operational degradation.';
    } else {
      interpretation = 'Risk Assessment: Systemic inefficiencies detected across infrastructure. Comprehensive remediation plan required.';
    }
    
    // Render interpretation (gray italic, professional tone)
    pdf.setFontSize(9.5);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    const pageWidth = pdf.internal.pageSize.getWidth();
    pdf.text(interpretation, PAGE_MARGIN, yPos, { 
      maxWidth: pageWidth - PAGE_MARGIN * 2 
    });
    
    yPos += 10;
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
  // Label (normal, primary color)
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.text('Task Usage:', PAGE_MARGIN, yPos);
  
  // Value (bold, color-coded by severity)
  pdf.setFont('helvetica', 'bold');
  const utilizationPct = viewModel.planSummary.usagePercent;
  const usageText = `${utilizationPct}%`;
  
  // Color logic
  if (utilizationPct < 10) {
    pdf.setTextColor(192, 57, 43); // red — critical underutilization
  } else if (utilizationPct < 30) {
    pdf.setTextColor(217, 119, 6); // orange — warning underutilization
  } else if (utilizationPct <= 70) {
    pdf.setTextColor(22, 163, 74); // green — optimal range
  } else {
    pdf.setTextColor(217, 119, 6); // orange — approaching capacity
  }
  
  pdf.text(usageText, PAGE_MARGIN + 40, yPos);
  
  // Reset to primary color
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  
  yPos += 12;

  /// ===== UTILIZATION ASSESSMENT ===== (OPTIONAL)
  const pageHeight = pdf.internal.pageSize.getHeight();
  
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

 // ===== EXECUTIVE VERDICT =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Executive Verdict:', PAGE_MARGIN, yPos);

  yPos += 7;

  // Verdict text — color-coded by severity
  pdf.setFont('helvetica', 'normal');
  
  // Color logic based on verdict content
  if (recommendedAction.includes('High Optimization Potential')) {
    pdf.setTextColor(192, 57, 43); // red — critical issue
  } else if (recommendedAction.includes('Downgrade recommended') || 
             recommendedAction.includes('Plan review recommended')) {
    pdf.setTextColor(217, 119, 6); // orange — warning
  } else if (recommendedAction.includes('appropriate') || 
             recommendedAction.includes('optimal')) {
    pdf.setTextColor(22, 163, 74); // green — all good
  } else {
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b); // default
  }
  
  pdf.text(recommendedAction, PAGE_MARGIN, yPos);
  
  // Reset color
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  
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
  const clientName = config.clientName || 'Client';
  
  // Page 1: Executive Summary
  renderPage1_ExecutiveSummary(pdf, viewModel, config);
  drawPageFooter(pdf, 1, clientName);
  
  // Page 2: Priority Actions
  pdf.addPage();
  renderPage2_PriorityActions(pdf, viewModel);
  drawPageFooter(pdf, 2, clientName);
  
  // Page 3: Infrastructure Risk Assessment
  pdf.addPage();
  renderPage3_InfrastructureHealth(pdf, viewModel);
  drawPageFooter(pdf, 3, clientName);
  
  // Page 4: Plan Analysis
  pdf.addPage();
  renderPage4_PlanAnalysis(pdf, viewModel);
  drawPageFooter(pdf, 4, clientName);
  
  // Page 5: Safe Zone
  pdf.addPage();
  renderPage5_SafeZone(pdf, viewModel);
  drawPageFooter(pdf, 5, clientName);
  
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
