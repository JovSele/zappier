// PDF Generator Module for Zapier Lighthouse
// Manual rendering with precise layout control

import jsPDF from 'jspdf';
import { sanitizeForPDF } from './pdfHelpers';

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface PDFConfig {
  agencyName: string;
  agencyLogo?: string;
  clientName: string;
  reportDate: string;
  reportCode: string;
}

export interface ParseResult {
  zap_count: number;
  total_nodes: number;
  message: string;
  apps: Array<{ name: string; raw_api: string; count: number }>;
  efficiency_flags: Array<{
    zap_id: number;
    zap_title: string;
    flag_type: string;
    severity: string;
    message: string;
    details: string;
    error_rate?: number;
    most_common_error?: string;
    error_trend?: string;
    max_streak?: number;
    estimated_monthly_savings: number;
    savings_explanation: string;
    is_fallback: boolean;
  }>;
  efficiency_score: number;
  estimated_savings: number;
}

// NEW: Developer Edition interfaces for batch analysis
export interface ZapSummary {
  id: number;
  title: string;
  status: string;
  step_count: number;
  trigger_app: string;
  last_run: string | null;
  error_rate: number | null;
  total_runs: number;
}

export interface PatternFinding {
  pattern_type: string;
  pattern_name: string;
  affected_zap_ids: number[];
  affected_count: number;
  median_chain_length: number | null;
  total_waste_tasks: number;
  total_waste_usd: number;
  refactor_guidance: string;
  severity: string;
}

export interface ScopeMetadata {
  total_zaps_in_account: number;
  analyzed_count: number;
  excluded_count: number;
  analyzed_zap_summaries: ZapSummary[];
  excluded_zap_summaries: ZapSummary[];
}

export interface SystemMetrics {
  avg_steps_per_zap: number;
  avg_tasks_per_run: number;
  polling_trigger_count: number;
  instant_trigger_count: number;
  total_monthly_tasks: number;
  formatter_usage_density: string;
  fan_out_flows: number;
}

export interface BatchParseResult {
  success: boolean;
  message: string;
  zap_count: number;
  individual_results: ParseResult[];
  total_nodes: number;
  total_estimated_savings: number;
  average_efficiency_score: number;
  total_flags: number;
  combined_apps: Array<{ name: string; raw_api: string; count: number }>;
  patterns: PatternFinding[];
  scope_metadata: ScopeMetadata;
  system_metrics: SystemMetrics;
}

// ========================================
// PRECISE COLOR PALETTE (HEX from HTML)
// ========================================
const COLORS = {
  BLUE: { r: 37, g: 99, b: 235 },
  GREEN: { r: 5, g: 150, b: 105 },
  RED: { r: 225, g: 29, b: 72 },
  SLATE_50: { r: 248, g: 250, b: 252 },
  SLATE_200: { r: 226, g: 232, b: 240 },
  SLATE_300: { r: 203, g: 213, b: 225 }, 
  SLATE_400: { r: 148, g: 163, b: 184 },
  SLATE_600: { r: 71, g: 85, b: 105 },
  SLATE_700: { r: 51, g: 65, b: 85 },   
  SLATE_900: { r: 15, g: 23, b: 42 }
};

// ========================================
// HELPER FUNCTIONS
// ========================================

//FOOTER
/**
 * Draw page frame with header bar and footer
 */
function drawPageFrame(pdf: jsPDF, config: PDFConfig, pageNum: number) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;

  // Horná lišta (Slate Bar)
  pdf.setFillColor(30, 41, 59);
  pdf.rect(0, 0, pageWidth, 10, 'F');

  // ============================================================================
  // FOOTER (spodná časť)
  // ============================================================================

  // Oddeľovacia čiara (šedá, jemná)
  pdf.setDrawColor(203, 213, 225); // slate-300
  pdf.setLineWidth(0.3);
  pdf.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

  
  // Ľavo: Page number
  pdf.setTextColor(148, 163, 184); // slate-400
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Page ${pageNum}`, margin, pageHeight - 10);
  
  // Stred: Agency branding
  pdf.text(
    `Automation Intelligence Report | ${config.agencyName}`, 
    pageWidth / 2, 
    pageHeight - 10, 
    { align: 'center' }
  );
  
  // Pravo: Report ID
  pdf.setFont('helvetica', 'bold');
  pdf.text(
    `Report ID: ${config.reportCode}`, 
    pageWidth - margin, 
    pageHeight - 10, 
    { align: 'right' }
  );
}

//ERROR ANALYSIS
/**
 * Add Error Analysis section (Red card)
 */
function addErrorAnalysis(
  pdf: jsPDF,
  yPos: number,
  margin: number,
  contentWidth: number,
  result: ParseResult
): number {
  const errorFlag = result.efficiency_flags.find(f => f.flag_type === 'error_loop');
  
  if (!errorFlag) {
    return yPos; // Skip if no error_loop
  }
  
  const cardOffset = 1;
  const startY = yPos; // ✅ Zapamätaj si začiatok
  
  // ✅ NAJPRV VYKRESLÍME OBSAH, POTOM ZMERÁME VÝŠKU
  
  yPos += 6;
  
  // Header (dočasne, aby sme vedeli kde sme)
  const headerY = yPos;
  yPos += 8;
  
  // Main message
  const messageY = yPos;
  yPos += 8;
  
  // Failure details
  const errorRate = errorFlag.error_rate !== undefined ? Math.round(errorFlag.error_rate) : 0;
  const failureCount = Math.round(errorRate / 10);
  const totalRuns = 10;
  const maxStreak = errorFlag.max_streak || 5;
  
  const fullText = `${failureCount} out of your last ${totalRuns} runs crashed. The pattern is getting worse, not better. The longest streak of consecutive failures: ${maxStreak} runs in a row.`;
  
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  const textLines = pdf.splitTextToSize(fullText, contentWidth - 20);
  const textHeight = textLines.length * 4; // ✅ Výška textu (4mm na riadok)
  
  const detailsY = yPos;
  yPos += textHeight + 4;
  
  // Root Cause box
  const rootCauseY = yPos;
  const rootCauseHeight = 18;
  yPos += rootCauseHeight + 4;
  
  // Estimated recovery
  const recoveryY = yPos;
  yPos += 6;
  
  // ✅ TERAZ POZNÁME CELKOVÚ VÝŠKU
  const cardHeight = yPos - startY;
  
  // ✅ VYKRESLÍME BOXY
  // Shadow box (červený)
  pdf.setFillColor(COLORS.RED.r, COLORS.RED.g, COLORS.RED.b);
  pdf.setDrawColor(COLORS.RED.r, COLORS.RED.g, COLORS.RED.b);
  pdf.roundedRect(margin, startY, contentWidth - cardOffset, cardHeight, 3, 3, 'FD');
  
  // Main box (jemný červený odtieň)
  pdf.setFillColor(254, 242, 242); // red-50
  pdf.setDrawColor(COLORS.RED.r, COLORS.RED.g, COLORS.RED.b);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(margin + cardOffset, startY, contentWidth - cardOffset, cardHeight, 3, 3, 'FD');
  
  // ✅ TERAZ VYKRESLÍME OBSAH NA SPRÁVNE POZÍCIE
  
  // Header
  pdf.setTextColor(COLORS.RED.r, COLORS.RED.g, COLORS.RED.b);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('ERROR ANALYSIS', margin + cardOffset + 6, headerY);
  pdf.setCharSpace(0);
  
  // Failure rate badge (right side)
  const failureText = `${errorRate}% FAILURE RATE`;
  const failureWidth = pdf.getTextWidth(failureText);
  
  pdf.setFontSize(7);
  pdf.text(failureText, margin + contentWidth - cardOffset - 6 - failureWidth, headerY);
  
  // Main message
  pdf.setTextColor(220, 38, 38); // red-600
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Your automation is experiencing frequent failures', margin + cardOffset + 6, messageY);
  
  // Failure details
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(textLines, margin + cardOffset + 6, detailsY);
  
  // Root Cause box
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(margin + cardOffset + 6, rootCauseY, contentWidth - cardOffset - 16, rootCauseHeight, 2, 2, 'FD');
  
  // ROOT CAUSE label
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ROOT CAUSE', margin + cardOffset + 10, rootCauseY + 5);
  
  // Error description
  const mostCommonError = errorFlag.most_common_error || 'Timeout';
  const causeFullText = `${mostCommonError} When authentication fails, the entire workflow stops. Reconnecting your Reddit account will fix this immediately.`;
  
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(causeFullText, margin + cardOffset + 10, rootCauseY + 10, { maxWidth: contentWidth - 30 });
  
  // Estimated recovery
  const monthlySavings = errorFlag.estimated_monthly_savings?.toFixed(0) || '0';
  pdf.setFillColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.circle(margin + cardOffset + 10, recoveryY, 2, 'F');
  
  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`ESTIMATED RECOVERY: $${monthlySavings}/MONTH IN WASTED TASKS`, margin + cardOffset + 14, recoveryY + 1);
  
  return yPos + 4; // ✅ Vrátime pozíciu pod celou kartou
}

//COST WASTE ANALYSIS
/**
 * Add Cost Waste Analysis section (Blue card with opportunity cards)
 */
function addCostWasteAnalysis(
  pdf: jsPDF,
  yPos: number,
  margin: number,
  contentWidth: number,
  result: ParseResult
): number {
  const pollingFlag = result.efficiency_flags.find(f => f.flag_type === 'polling_trigger');
  const filterFlag = result.efficiency_flags.find(f => f.flag_type === 'late_filter_placement');
  
  if (!pollingFlag && !filterFlag) {
    return yPos; // Skip if no cost waste flags
  }
  
  const opportunityCount = [pollingFlag, filterFlag].filter(Boolean).length;
  
  // ✅ DYNAMICKÁ VÝŠKA - vypočítame PRED kreslením
  let totalHeight = 14; // Header
  
  // Polling card height
  if (pollingFlag) {
    pdf.setFontSize(7);
    const pollingLines = pdf.splitTextToSize(pollingFlag.details, contentWidth - 30);
    const pollingTextHeight = pollingLines.length * 3; // 3mm per line
    totalHeight += 10 + pollingTextHeight + 8; // Header + text + savings badge + padding
  }
  
  // Filter card height
  if (filterFlag) {
    pdf.setFontSize(7);
    const filterLines = pdf.splitTextToSize(filterFlag.details, contentWidth - 30);
    const filterTextHeight = filterLines.length * 3;
    totalHeight += 10 + filterTextHeight + 8;
  }
  
  totalHeight += 4; // Bottom padding
  
  const cardOffset = 1;
  
  // Shadow box (modrý)
  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setDrawColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.roundedRect(margin, yPos, contentWidth - cardOffset, totalHeight, 3, 3, 'FD');
  
  // Main box (jemný modrý odtieň)
  pdf.setFillColor(239, 246, 255); // blue-50
  pdf.setDrawColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(margin + cardOffset, yPos, contentWidth - cardOffset, totalHeight, 3, 3, 'FD');
  
  // Header
  pdf.setTextColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('COST WASTE ANALYSIS', margin + cardOffset + 6, yPos + 6);
  pdf.setCharSpace(0);
  
  // Opportunity count (right side)
  pdf.setTextColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  const oppText = `${opportunityCount} OPPORTUNIT${opportunityCount === 1 ? 'Y' : 'IES'}`;
  const oppWidth = pdf.getTextWidth(oppText);
  pdf.text(oppText, margin + contentWidth - cardOffset - 6 - oppWidth, yPos + 6);
  
  yPos += 14;
  
  // ✅ POLLING TRIGGER CARD - kompletne prepracovaný
if (pollingFlag) {
  const annualSavings = ((pollingFlag.estimated_monthly_savings || 0) * 12).toFixed(0);
  
  const cardX = margin + cardOffset + 6;
  const cardStartY = yPos;
  
  // ✅ KROK 1: Vypočítaj všetky pozície NAJPRV
  let currentY = cardStartY + 4; // Start position
  
  // Badge + Title area
  currentY += 5; // Badge/title height
  currentY += 3; // Spacing after title
  
  // Description text
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  const descLines = pdf.splitTextToSize(pollingFlag.details, contentWidth - 30);
  const descStartY = currentY;
  currentY += descLines.length * 3; // Text height
  
  // Savings badge
  currentY += 2; // Spacing before savings
  const savingsStartY = currentY;
  currentY += 4; // Savings badge height
  
  // Final card height
  currentY += 2; // Bottom padding
  const cardHeight = currentY - cardStartY;
  
  // ✅ KROK 2: Teraz nakresli box s SPRÁVNOU výškou
  pdf.setFillColor(254, 243, 199); // amber-50
  pdf.setDrawColor(251, 191, 36); // amber-400
  pdf.setLineWidth(0.3);
  pdf.roundedRect(cardX, cardStartY, contentWidth - cardOffset - 12, cardHeight, 2, 2, 'FD');
  
  // ✅ KROK 3: Vykresli obsah na PRE-VYPOČÍTANÉ pozície
  
  // Priority badge
  pdf.setFillColor(245, 158, 11); // amber-500
  pdf.roundedRect(cardX + 4, cardStartY + 4, 24, 5, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.text('MEDIUM PRIORITY', cardX + 16, cardStartY + 7.5, { align: 'center' });
  
  // Title
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Checking For Updates Too Often', cardX + 32, cardStartY + 7.5);
  
  // Description
  pdf.setTextColor(COLORS.SLATE_700.r, COLORS.SLATE_700.g, COLORS.SLATE_700.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.text(descLines, cardX + 4, descStartY);
  
  // Estimated savings badge
  pdf.setFillColor(236, 253, 245); // emerald-50
  pdf.roundedRect(cardX + 4, savingsStartY, 60, 4, 2, 2, 'F');
  
  pdf.setFillColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.circle(cardX + 6, savingsStartY + 2, 1, 'F');
  
  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`ESTIMATED SAVINGS: $${annualSavings}/YEAR`, cardX + 9, savingsStartY + 2.5);
  
  yPos += cardHeight + 2;
}

// ✅ LATE FILTER PLACEMENT CARD - rovnaký pattern
if (filterFlag) {
  const annualSavings = ((filterFlag.estimated_monthly_savings || 0) * 12).toFixed(0);
  
  const cardX = margin + cardOffset + 6;
  const cardStartY = yPos;
  
  // ✅ KROK 1: Vypočítaj všetky pozície NAJPRV
  let currentY = cardStartY + 4;
  
  // Badge + Title area
  currentY += 5;
  currentY += 3;
  
  // Description text
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  const descLines = pdf.splitTextToSize(filterFlag.details, contentWidth - 30);
  const descStartY = currentY;
  currentY += descLines.length * 3;
  
  // Savings badge
  currentY += 2;
  const savingsStartY = currentY;
  currentY += 4;
  
  // Final card height
  currentY += 2;
  const cardHeight = currentY - cardStartY;
  
  // ✅ KROK 2: Nakresli box
  pdf.setFillColor(254, 242, 242); // rose-50
  pdf.setDrawColor(251, 113, 133); // rose-400
  pdf.setLineWidth(0.3);
  pdf.roundedRect(cardX, cardStartY, contentWidth - cardOffset - 12, cardHeight, 2, 2, 'FD');
  
  // ✅ KROK 3: Vykresli obsah
  
  // Priority badge
  pdf.setFillColor(COLORS.RED.r, COLORS.RED.g, COLORS.RED.b);
  pdf.roundedRect(cardX + 4, cardStartY + 4, 20, 5, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.text('HIGH PRIORITY', cardX + 14, cardStartY + 7.5, { align: 'center' });
  
  // Title
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Paying For Steps That Get Thrown Away', cardX + 28, cardStartY + 7.5);
  
  // Description
  pdf.setTextColor(COLORS.SLATE_700.r, COLORS.SLATE_700.g, COLORS.SLATE_700.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.text(descLines, cardX + 4, descStartY);
  
  // Estimated savings badge
  pdf.setFillColor(236, 253, 245); // emerald-50
  pdf.roundedRect(cardX + 4, savingsStartY, 60, 4, 2, 2, 'F');
  
  pdf.setFillColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.circle(cardX + 6, savingsStartY + 2, 1, 'F');
  
  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`ESTIMATED SAVINGS: $${annualSavings}/YEAR`, cardX + 9, savingsStartY + 2.5);
  
  yPos += cardHeight + 2;
}
  
  return yPos + 4;
}

// TECHNICAL ANALYSIS - page3
/**
 * Add Technical Analysis section (Page 3)
 */
function addTechnicalAnalysis(
  pdf: jsPDF,
  yPos: number,
  margin: number,
  contentWidth: number,
  result: ParseResult,
  zapInfo: { trigger_app: string; step_count: number }
): number {
  // Section title (no icon needed)
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Technical Analysis', margin, yPos + 6);
  
  yPos += 18;
  
  // Workflow Architecture card
  const cardOffset = 1;
  const cardHeight = 50;
  
  // Shadow box
  pdf.setFillColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setDrawColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.roundedRect(margin, yPos, contentWidth - cardOffset, cardHeight, 3, 3, 'FD');
  
  // Main box
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(margin + cardOffset, yPos, contentWidth - cardOffset, cardHeight, 3, 3, 'FD');
  
  // Card header
  pdf.setTextColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('WORKFLOW ARCHITECTURE', margin + cardOffset + 6, yPos + 8);
  pdf.setCharSpace(0);
  
  // Complexity badge (right side)
  const complexity = zapInfo.step_count > 8 ? 'HIGH' : zapInfo.step_count > 4 ? 'MEDIUM' : 'LOW';
  const complexityColor = zapInfo.step_count > 8 ? COLORS.RED : zapInfo.step_count > 4 ? { r: 245, g: 158, b: 11 } : COLORS.GREEN;
  
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  const stepsText = `${zapInfo.step_count} STEPS • `;
  const complexityText = `${complexity} COMPLEXITY`;
  const totalWidth = pdf.getTextWidth(stepsText + complexityText);
  const rightX = margin + contentWidth - cardOffset - 6 - totalWidth;
  
  pdf.text(stepsText, rightX, yPos + 8);
  
  pdf.setTextColor(complexityColor.r, complexityColor.g, complexityColor.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text(complexityText, rightX + pdf.getTextWidth(stepsText), yPos + 8);
  
  yPos += 18;
  
  // Workflow diagram (3 boxes: Trigger → Logic → Action)
  const boxWidth = 35;
  const boxHeight = 20;
  const boxGap = 10;
  const startX = margin + cardOffset + (contentWidth - cardOffset - (3 * boxWidth + 2 * boxGap)) / 2;
  
  // TRIGGER box
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(startX, yPos, boxWidth, boxHeight, 2, 2, 'FD');
  
  // Trigger icon (letter)
  const triggerInitial = zapInfo.trigger_app.charAt(0).toUpperCase();
  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.roundedRect(startX + boxWidth / 2 - 4, yPos + 4, 8, 8, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text(triggerInitial, startX + boxWidth / 2, yPos + 9, { align: 'center' });
  
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text(zapInfo.trigger_app.toUpperCase().substring(0, 10), startX + boxWidth / 2, yPos + 15, { align: 'center' });
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.text('TRIGGER', startX + boxWidth / 2, yPos + 18, { align: 'center' });
  
  // Arrow 1
  const arrow1X = startX + boxWidth + 2;
  const arrow1Y = yPos + boxHeight / 2;
  pdf.setDrawColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setLineWidth(0.5);
  pdf.line(arrow1X, arrow1Y, arrow1X + boxGap - 4, arrow1Y);
  pdf.setFillColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.triangle(arrow1X + boxGap - 4, arrow1Y - 1, arrow1X + boxGap - 2, arrow1Y, arrow1X + boxGap - 4, arrow1Y + 1, 'F');
  
  // LOGIC LAYER box
  const logic2X = startX + boxWidth + boxGap;
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.roundedRect(logic2X, yPos, boxWidth, boxHeight, 2, 2, 'FD');
  
  // Logic badge
  const logicSteps = Math.max(zapInfo.step_count - 2, 0);
  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.roundedRect(logic2X + boxWidth / 2 - 8, yPos + 3, 16, 6, 3, 3, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`+${logicSteps}`, logic2X + boxWidth / 2, yPos + 7, { align: 'center' });
  
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('LOGIC LAYER', logic2X + boxWidth / 2, yPos + 14, { align: 'center' });
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.text('FILTERS & FORMATTING', logic2X + boxWidth / 2, yPos + 18, { align: 'center' });
  
  // Arrow 2
  const arrow2X = logic2X + boxWidth + 2;
  pdf.line(arrow2X, arrow1Y, arrow2X + boxGap - 4, arrow1Y);
  pdf.triangle(arrow2X + boxGap - 4, arrow1Y - 1, arrow2X + boxGap - 2, arrow1Y, arrow2X + boxGap - 4, arrow1Y + 1, 'F');
  
  // REDDIT (ACTION) box
  const action3X = logic2X + boxWidth + boxGap;
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.roundedRect(action3X, yPos, boxWidth, boxHeight, 2, 2, 'FD');
  
  // Action icon (R for Reddit or generic)
  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.roundedRect(action3X + boxWidth / 2 - 4, yPos + 4, 8, 8, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('R', action3X + boxWidth / 2, yPos + 9, { align: 'center' });
  
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('REDDIT', action3X + boxWidth / 2, yPos + 15, { align: 'center' });
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.text('ACTION', action3X + boxWidth / 2, yPos + 18, { align: 'center' });
  
  return yPos + boxHeight + 18;
}



// FIX TODAY SECTION
/**
 * Add What to Fix Today section
 */
function addWhatToFixToday(
  pdf: jsPDF,
  yPos: number,
  margin: number,
  contentWidth: number,
  result: ParseResult
): number {
  const topFlags = [...result.efficiency_flags]
    .sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return (severityOrder[a.severity as keyof typeof severityOrder] || 999) -
        (severityOrder[b.severity as keyof typeof severityOrder] || 999);
    })
    .slice(0, 3);

  if (topFlags.length === 0) return yPos;

  const cardSpacing = 2;
  const issueCardHeight = 24; // ✅ Zvýšené z 18 na 24mm
  const totalHeight = 18 + (topFlags.length * (issueCardHeight + cardSpacing)) + 4;
  
  // Main box (tmavý gradient)
  pdf.setFillColor(30, 41, 59); // slate-800
  pdf.setDrawColor(51, 65, 85); // slate-700
  pdf.setLineWidth(0.5);
  pdf.roundedRect(margin, yPos, contentWidth, totalHeight, 3, 3, 'FD');

  // Header
  pdf.setTextColor(96, 165, 250); // blue-400
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('WHAT TO FIX TODAY', margin + 8, yPos + 10);
  pdf.setCharSpace(0);

  // Start position for issue cards
  let cardY = yPos + 18;

  // Draw each issue card
  for (let i = 0; i < topFlags.length; i++) {
    const flag = topFlags[i];
    
    // Issue card background (svetlejší slate)
    pdf.setFillColor(51, 65, 85); // slate-700
    pdf.setDrawColor(71, 85, 105); // slate-600
    pdf.setLineWidth(0.5);
    pdf.roundedRect(margin + 6, cardY, contentWidth - 12, issueCardHeight, 2, 2, 'FD');

    // Severity badge
    let badgeText = 'CRITICAL';
    let badgeTextColor = { r: 255, g: 255, b: 255 };
    let badgeBg = { r: 220, g: 38, b: 38 };
    
    if (flag.severity === 'medium') {
      badgeText = 'IMPORTANT';
      badgeBg = { r: 245, g: 158, b: 11 };
    } else if (flag.severity === 'low') {
      badgeText = 'OPTIMIZE';
      badgeBg = { r: 34, g: 197, b: 94 };
    }

    // Badge background
    pdf.setFillColor(badgeBg.r, badgeBg.g, badgeBg.b);
    pdf.roundedRect(margin + 10, cardY + 4, 20, 5, 2.5, 2.5, 'F');
    
    // Badge text
    pdf.setTextColor(badgeTextColor.r, badgeTextColor.g, badgeTextColor.b);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text(badgeText, margin + 20, cardY + 7.5, { align: 'center' });

    // Issue title (all caps, bold, white)
    let title = flag.message.toUpperCase().substring(0, 45);
    if (flag.flag_type === 'error_loop') title = 'RECONNECT YOUR REDDIT ACCOUNT';
    if (flag.flag_type === 'late_filter_placement') title = 'MOVE FILTER EARLIER IN THE WORKFLOW';
    if (flag.flag_type === 'polling_trigger') title = 'SWITCH TO WEBHOOK TRIGGER';

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, margin + 33, cardY + 7.5);

    // Problem line (white, italic label + normal text)
    let problemText = '';
    if (flag.flag_type === 'error_loop') {
      const errorRate = flag.error_rate !== undefined ? Math.round(flag.error_rate) : 0;
      problemText = `Connection expired — ${errorRate}% of runs are failing right now.`;
    } else if (flag.flag_type === 'late_filter_placement') {
      problemText = 'Steps execute before conditions are checked, wasting task usage.';
    } else if (flag.flag_type === 'polling_trigger') {
      problemText = 'RSS checks for updates even when there aren\'t any.';
    } else {
      problemText = flag.details.substring(0, 80);
    }

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bolditalic');
    pdf.text('Problem: ', margin + 10, cardY + 13);
    
    const problemLabelWidth = pdf.getTextWidth('Problem: ');
    pdf.setFont('helvetica', 'normal');
    // ✅ Použitie maxWidth pre zalamovanie
    pdf.text(problemText, margin + 10 + problemLabelWidth, cardY + 13, { maxWidth: contentWidth - 30 });

    // Fix line (green, italic label + normal text)
    let fixText = '';
    if (flag.flag_type === 'error_loop') {
      fixText = 'Re-authenticate the affected account in Zapier.';
    } else if (flag.flag_type === 'late_filter_placement') {
      fixText = 'Apply filtering as early as possible to stop unnecessary execution.';
    } else if (flag.flag_type === 'polling_trigger') {
      fixText = 'Use event-based triggers instead of scheduled checks where possible.';
    } else {
      fixText = 'Review and optimize workflow structure.';
    }

    pdf.setTextColor(167, 243, 208);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bolditalic');
    pdf.text('Fix: ', margin + 10, cardY + 17);
    
    const fixLabelWidth = pdf.getTextWidth('Fix: ');
    pdf.setFont('helvetica', 'normal');
    // ✅ Použitie maxWidth
    pdf.text(fixText, margin + 10 + fixLabelWidth, cardY + 17, { maxWidth: contentWidth - 30 });

    // Effort/Impact line (yellow, italic)
    let effortText = '';
    if (flag.flag_type === 'error_loop') {
      effortText = 'Effort: Quick Fix';
    } else if (flag.flag_type === 'late_filter_placement') {
      effortText = 'Impact: Significant task reduction';
    } else if (flag.flag_type === 'polling_trigger') {
      effortText = 'Effort: Structural Change';
    } else {
      effortText = 'Impact: Improved efficiency';
    }

    pdf.setTextColor(234, 179, 8);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'italic');
    pdf.text(effortText, margin + 10, cardY + 21);

    cardY += issueCardHeight + cardSpacing;
  }

  return yPos + totalHeight + 8;
}


// BEFORE AFTER SECTION
/**
 * Add Before/After Comparison with horizontal lines
 */
function addBeforeAfterComparison(
  pdf: jsPDF,
  yPos: number,
  margin: number,
  contentWidth: number,
  result: ParseResult
): number {
  const cardHeight = 35;
  const innerMargin = 5;
  const cardOffset = 1;

  // Shadow box
  pdf.setFillColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.setDrawColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.roundedRect(margin, yPos, contentWidth - cardOffset, cardHeight, 3, 3, 'FD');

  // Main box
  pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
  pdf.setDrawColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(margin + cardOffset, yPos, contentWidth - cardOffset, cardHeight, 3, 3, 'FD');

  // Header
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('BEFORE VS AFTER OPTIMIZATION', margin + innerMargin + cardOffset, yPos + 6);
  pdf.setCharSpace(0);

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  pdf.text('Projected impact of recommended fixes', margin + innerMargin + cardOffset, yPos + 10);

  // Extract data
  const errorFlag = result.efficiency_flags.find(f => f.flag_type === 'error_loop');
  let currentErrorRate = 0;
  if (errorFlag && errorFlag.error_rate !== undefined) {
    currentErrorRate = Math.round(errorFlag.error_rate);
  }

  const hasPolling = result.efficiency_flags.some(f => f.flag_type === 'polling_trigger');
  const currentCost = Math.round((result.estimated_savings || 0) * 12 * 2.5);
  const optimizedCost = Math.round((result.estimated_savings || 0) * 12 * 0.1);

  // Columns
  const col1X = margin + innerMargin + cardOffset;
  const col2X = margin + (contentWidth / 2) + 2 + cardOffset;
  let currentY = yPos + 17;

  // Arrow function
  const drawArrow = (x: number, y: number) => {
    pdf.setDrawColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
    pdf.setLineWidth(0.4);
    pdf.line(x, y - 1, x + 2.5, y - 1);
    pdf.setFillColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
    pdf.triangle(x + 2.5, y - 2, x + 4, y - 1.0, x + 2.5, y - 0.0, 'F');
    return 5;
  };

  // Row function
  const drawRow = (l1: string, v1: string, n1: string, l2: string, v2: string, n2: string, isItalic = false) => {
    const labelWidth = 32;

    // COLUMN 1
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
    pdf.text(l1, col1X, currentY);

    pdf.setFontSize(9);
    pdf.setFont('helvetica', isItalic ? 'italic' : 'normal');
    pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
    const v1X = col1X + labelWidth;
    pdf.text(v1, v1X, currentY);
    const v1Width = pdf.getTextWidth(v1);

    const arrow1X = v1X + v1Width + 2;
    const arrow1Width = drawArrow(arrow1X, currentY);

    pdf.setFont('helvetica', isItalic ? 'italic' : 'bold');
    pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
    pdf.text(n1, arrow1X + arrow1Width + 1, currentY);

    // COLUMN 2
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
    pdf.text(l2, col2X, currentY);

    pdf.setFontSize(9);
    pdf.setFont('helvetica', isItalic ? 'italic' : 'normal');
    pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
    const v2X = col2X + labelWidth;
    pdf.text(v2, v2X, currentY);
    const v2Width = pdf.getTextWidth(v2);

    const arrow2X = v2X + v2Width + 2;
    const arrow2Width = drawArrow(arrow2X, currentY);

    pdf.setFont('helvetica', isItalic ? 'italic' : 'bold');
    pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
    pdf.text(n2, arrow2X + arrow2Width + 1, currentY);

    currentY += 5;
  };

  // Row 1
  drawRow(
    'ERROR RATE', `${currentErrorRate}%`, 'under 5%',
    'YEARLY COST', `$${currentCost}`, `under $${optimizedCost}`
  );

  // Divider
  currentY += -1;
  pdf.setDrawColor(240, 240, 240);
  pdf.line(col1X, currentY, margin + contentWidth - innerMargin - cardOffset, currentY);
  currentY += 7;

  // Row 2
  const speedBefore = hasPolling ? 'Polling' : 'Standard';
  const speedAfter = hasPolling ? 'Real-time' : 'Optimized';
  drawRow('SYNC SPEED', speedBefore, speedAfter, 'MAINTENANCE', 'High', 'Automated', true);

  return yPos + cardHeight + 8;
}

/**
 * Add Quick Wins section
 */
function addQuickWins(
  pdf: jsPDF,
  yPos: number,
  margin: number,
  contentWidth: number,
  result: ParseResult
): number {
  const topFlags = [...result.efficiency_flags]
    .sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return (severityOrder[a.severity as keyof typeof severityOrder] || 999) -
        (severityOrder[b.severity as keyof typeof severityOrder] || 999);
    })
    .slice(0, 3);

  if (topFlags.length === 0) return yPos;

  const cardHeight = 10 + (topFlags.length * 5) + 3;
  const offset = 1;

  // Shadow box (spodný, zelený)
  pdf.setFillColor(16, 185, 129); // emerald-500
  pdf.setDrawColor(16, 185, 129);
  pdf.roundedRect(margin, yPos, contentWidth - offset, cardHeight, 3, 3, 'FD');

  // Main box (vrchný, jemný zelený odtieň)
  pdf.setFillColor(236, 253, 245); // emerald-50
  pdf.setDrawColor(16, 185, 129); // emerald-500
  pdf.setLineWidth(0.1);
  pdf.roundedRect(margin + offset, yPos, contentWidth - offset, cardHeight, 3, 3, 'FD');

  // Header
  pdf.setTextColor(5, 150, 105); // emerald-600
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('TOP OPTIMIZATION OPPORTUNITIES', margin + offset + 5, yPos + 6);
  pdf.setCharSpace(0);

  yPos += 12;

  // Arrow drawing function
  const drawArrow = (x: number, y: number) => {
    pdf.setDrawColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
    pdf.setLineWidth(0.4);
    pdf.line(x, y - 1, x + 2.5, y - 1);
    pdf.setFillColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
    pdf.triangle(x + 2.5, y - 2, x + 4, y - 1.0, x + 2.5, y - 0.0, 'F');
    return 4; // Width of arrow
  };

  topFlags.forEach((flag, i) => {
    let actionName = '';
    let resultText = '';

    if (flag.flag_type === 'error_loop') {
      actionName = 'Fix authentication failures';
      const errorRate = flag.error_rate !== undefined ? Math.round(flag.error_rate) : 0;
      resultText = `${errorRate}% error reduction`;
    } else if (flag.flag_type === 'late_filter_placement') {
      actionName = 'Reposition filters earlier';
      resultText = `$${flag.estimated_monthly_savings.toFixed(0)}/month savings`;
    } else if (flag.flag_type === 'polling_trigger') {
      actionName = 'Replace polling triggers';
      resultText = `real-time + $${flag.estimated_monthly_savings.toFixed(0)}/month`;
    } else {
      actionName = flag.message.substring(0, 35);
      resultText = `improved efficiency`;
    }

    // Action name (bold, black)
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
    pdf.text(`${i + 1}. ${actionName}`, margin + offset + 5, yPos);

    // Draw arrow
    const arrowX = margin + offset + 70;
    const arrowWidth = drawArrow(arrowX, yPos);

    // Result text (green, normal)
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
    pdf.text(resultText, arrowX + arrowWidth + 2, yPos);

    yPos += 5;
  });

  return yPos + 3;
}


// ========================================
// MAIN PDF GENERATION
// ========================================

export async function generatePDFReport(result: ParseResult, config: PDFConfig) {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = 170;

  let currentPage = 1;
  let yPos = 20;

  // Draw frame for first page
  drawPageFrame(pdf, config, currentPage);

  // Ensure space function
  const ensureSpace = (spaceNeeded: number) => {
    if (yPos + spaceNeeded > pageHeight - margin - 15) {
      pdf.addPage();
      currentPage++;
      drawPageFrame(pdf, config, currentPage);
      yPos = 20;
      return true;
    }
    return false;
  };

  const zapTitle = result.efficiency_flags.length > 0
    ? result.efficiency_flags[0].zap_title
    : 'Audit Report';
  const annualSavings = Math.round(result.estimated_savings * 12);

  // ============================================================================
  // PAGE HEADER (Logo + Title)
  // ============================================================================

  // Logo square (blue)
  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.roundedRect(margin, yPos, 8, 8, 2, 2, 'F');

  // Lightning bolt
  pdf.setFillColor(255, 255, 255);
  const iconX = margin + 4;
  const iconY = yPos + 4;
  const startX = iconX + 0;
  const startY = iconY - 3;
  const lightningPath = [
    [-2.5, 3.6], [2.5, 0], [0, 2.4], [2.5, -3.6], [-2.5, 0], [0, -2.4]
  ];
  pdf.lines(lightningPath, startX, startY, [1, 1], 'F', true);

  // "Lighthouse" text
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Lighthouse ', margin + 10, yPos + 6);

  // "Audit" text (blue, italic)
  pdf.setTextColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setFont('helvetica', 'bolditalic');
  const lighthouseWidth = pdf.getTextWidth('Lighthouse ');
  pdf.text('Audit', margin + 10 + lighthouseWidth, yPos + 6);

  yPos += 1;

  // Subtitle
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(0.1);
  pdf.text('ZAPIER AUTOMATION INTELLIGENCE REPORT', margin, yPos + 11);
  pdf.setCharSpace(0);

  // Audit Complete badge
  const badgeWidth = 28;
  const badgeX = pageWidth - margin - badgeWidth;
  pdf.setFillColor(236, 253, 245);
  pdf.setDrawColor(167, 243, 208);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(badgeX, yPos, badgeWidth, 4.5, 2, 2, 'FD');

  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Audit Complete', badgeX + badgeWidth / 2, yPos + 3, { align: 'center' });

  // Date
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  pdf.text(`${dateStr} • ${timeStr}`, pageWidth - margin, yPos + 8.5, { align: 'right' });

  yPos += 20;

  

  yPos += 18; // ✅ SPACING PO BADGE

  // ============================================================================
  // SECTION 1: EFFICIENCY SCORE + DATA CONFIDENCE
  // ============================================================================
  ensureSpace(45);

  const cardGap = 4;
  const cardWidth = (contentWidth - cardGap) / 2;
  const cardHeight = 35;
  const cardOffsetS = 1;

  // LEFT CARD: Efficiency Score
  const leftCardX = margin;
  const leftShadowColor = result.efficiency_score >= 75 ? COLORS.GREEN :
    result.efficiency_score >= 50 ? { r: 245, g: 158, b: 11 } : COLORS.RED;
  pdf.setFillColor(leftShadowColor.r, leftShadowColor.g, leftShadowColor.b);
  pdf.setDrawColor(leftShadowColor.r, leftShadowColor.g, leftShadowColor.b);
  pdf.roundedRect(leftCardX, yPos, cardWidth - cardOffsetS, cardHeight, 3, 3, 'FD');

  const leftBgColor = result.efficiency_score >= 75 ? { r: 236, g: 253, b: 245 } :
    result.efficiency_score >= 50 ? { r: 254, g: 243, b: 199 } : { r: 255, g: 241, b: 242 };
  pdf.setFillColor(leftBgColor.r, leftBgColor.g, leftBgColor.b);
  pdf.setDrawColor(leftShadowColor.r, leftShadowColor.g, leftShadowColor.b);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(leftCardX + cardOffsetS, yPos, cardWidth - cardOffsetS, cardHeight, 3, 3, 'FD');

  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('OVERALL PERFORMANCE', leftCardX + cardWidth / 2, yPos + 6, { align: 'center' });

  const scoreColor = result.efficiency_score >= 75 ? COLORS.GREEN :
    result.efficiency_score >= 50 ? { r: 245, g: 158, b: 11 } : COLORS.RED;
  pdf.setTextColor(scoreColor.r, scoreColor.g, scoreColor.b);
  pdf.setFontSize(32);
  pdf.setFont('helvetica', 'bold');
  const scoreText = `${result.efficiency_score}`;
  const scoreWidth = pdf.getTextWidth(scoreText);
  pdf.text(scoreText, leftCardX + cardWidth / 2 - scoreWidth / 2 - 3, yPos + 19);
  pdf.setFontSize(16);
  pdf.text('/100', leftCardX + cardWidth / 2 + scoreWidth / 2 - 3, yPos + 19);

  const scoreLabel = result.efficiency_score >= 90 ? 'EXCELLENT' :
    result.efficiency_score >= 75 ? 'GOOD' :
      result.efficiency_score >= 50 ? 'FAIR' : 'BELOW OPTIMAL';
  const labelColor = result.efficiency_score >= 75 ? COLORS.GREEN :
    result.efficiency_score >= 50 ? { r: 245, g: 158, b: 11 } : { r: 217, g: 119, b: 6 };
  pdf.setTextColor(labelColor.r, labelColor.g, labelColor.b);
  pdf.setFontSize(8);
  pdf.text(scoreLabel, leftCardX + cardWidth / 2, yPos + 25, { align: 'center' });

  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(7);
  pdf.text('EFFICIENCY SCORE', leftCardX + cardWidth / 2, yPos + 30, { align: 'center' });

  // RIGHT CARD: Data Confidence
  const rightCardX = margin + cardWidth + cardGap;
  pdf.setFillColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setDrawColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.roundedRect(rightCardX, yPos, cardWidth - cardOffsetS, cardHeight, 3, 3, 'FD');

  pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
  pdf.setDrawColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(rightCardX + cardOffsetS, yPos, cardWidth - cardOffsetS, cardHeight, 3, 3, 'FD');

  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('DATA CONFIDENCE', rightCardX + cardWidth / 2, yPos + 6, { align: 'center' });

  let bulletY = yPos + 14;

  // Coverage
  pdf.setFillColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.circle(rightCardX + cardOffsetS + 8, bulletY, 1, 'F');
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.text('Coverage:', rightCardX + cardOffsetS + 12, bulletY + 1);
  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text('High', rightCardX + cardOffsetS + 32, bulletY + 1);

  bulletY += 6;

  // Sample
  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.circle(rightCardX + cardOffsetS + 8, bulletY, 1, 'F');
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.text('Sample:', rightCardX + cardOffsetS + 12, bulletY + 1);

  const totalRuns = (() => {
    let max = 150;
    result.efficiency_flags.forEach(f => {
      const m = f.details.match(/(\d+) total runs/);
      if (m) max = Math.max(max, parseInt(m[1]));
    });
    return max;
  })();

  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${totalRuns} runs`, rightCardX + cardOffsetS + 32, bulletY + 1);

  bulletY += 6;

  // Period
  pdf.setFillColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.circle(rightCardX + cardOffsetS + 8, bulletY, 1, 'F');
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.text('Period:', rightCardX + cardOffsetS + 12, bulletY + 1);
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text('30 days', rightCardX + cardOffsetS + 32, bulletY + 1);

  yPos += cardHeight + 6;

  // ============================================================================
  // SECTION 2: ANALYZED AUTOMATION
  // ============================================================================
  ensureSpace(30);

  const zapBoxHeight = 25;
  const zapBoxOffset = 1;

  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setDrawColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.roundedRect(margin, yPos, contentWidth - zapBoxOffset, zapBoxHeight, 3, 3, 'FD');

  pdf.setFillColor(239, 246, 255);
  pdf.setDrawColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(margin + zapBoxOffset, yPos, contentWidth - zapBoxOffset, zapBoxHeight, 3, 3, 'FD');

  pdf.setTextColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('ANALYZED AUTOMATION', margin + 6 + zapBoxOffset, yPos + 6);
  pdf.setCharSpace(0);

  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(zapTitle, margin + 6 + zapBoxOffset, yPos + 14);

  const zapId = result.efficiency_flags.length > 0 ? result.efficiency_flags[0].zap_id : 0;

  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`ID: ${zapId} • Status: `, margin + 6 + zapBoxOffset, yPos + 21);

  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ACTIVE', margin + 41 + zapBoxOffset, yPos + 21);

  yPos += zapBoxHeight + 5;

  // ============================================================================
  // SECTION 3: EXECUTIVE VERDICT
  // ============================================================================
  ensureSpace(30);

  const boxHeight = 26;
  const offset = 1;

  pdf.setFillColor(251, 191, 36);
  pdf.setDrawColor(251, 191, 36);
  pdf.roundedRect(margin, yPos, contentWidth - offset, boxHeight, 3, 3, 'FD');

  pdf.setFillColor(254, 252, 232);
  pdf.setDrawColor(251, 191, 36);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(margin + offset, yPos, contentWidth - offset, boxHeight, 3, 3, 'FD');

  pdf.setTextColor(217, 119, 6);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('EXECUTIVE VERDICT', margin + 6, yPos + 6);
  pdf.setCharSpace(0);

  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('High Optimization Potential.', margin + 6, yPos + 11);

  pdf.setFont('helvetica', 'normal');
  const verdictText = `Functional, but inefficient — approximately 2 out of 5 tasks are wasted due to architectural issues. Minor changes could save you `;
  pdf.text(verdictText, margin + 6, yPos + 16, { maxWidth: contentWidth - 16 });

  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`up to $${annualSavings}/year.`, margin + 45, yPos + 20);

  yPos += 11;

  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  const Text1 = `Scope: Single Zap analysis based on last 30 days of run data. Estimates may vary based on usage patterns. `;
  pdf.text(Text1, margin + 6, yPos + 22, { maxWidth: contentWidth - 16 });

  yPos += boxHeight + 1;

  // ============================================================================
  // SECTION 4: KEY METRICS (3 cards)
  // ============================================================================
  ensureSpace(40);

  const metricsGap = 4;
  const metricCardWidth = (contentWidth - 2 * metricsGap) / 3;
  const metricCardHeight = 32;
  const cardOffset = 1;

  // CARD 1: Annual Waste
  pdf.setFillColor(239, 68, 68);
  pdf.setDrawColor(239, 68, 68);
  pdf.roundedRect(margin, yPos, metricCardWidth - cardOffset, metricCardHeight, 3, 3, 'FD');

  pdf.setFillColor(255, 241, 242);
  pdf.setDrawColor(239, 68, 68);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(margin + cardOffset, yPos, metricCardWidth - cardOffset, metricCardHeight, 3, 3, 'FD');

  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ESTIMATED ANNUAL WASTE', margin + metricCardWidth / 2, yPos + 6, { align: 'center' });

  const annualWaste = Math.round(result.estimated_savings * 12 * 2.5);
  pdf.setTextColor(239, 68, 68);
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  const waste1Text = `$${annualWaste}`;
  const waste1Width = pdf.getTextWidth(waste1Text);
  pdf.text(waste1Text, margin + metricCardWidth / 2 - waste1Width / 2 - 3, yPos + 18);
  pdf.setFontSize(12);
  pdf.text('/yr', margin + metricCardWidth / 2 + waste1Width / 2 - 3, yPos + 18);

  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.text('PAID FOR INEFFICIENT TASKS', margin + metricCardWidth / 2, yPos + 28, { align: 'center' });

  // CARD 2: Immediate Savings
  const card2X = margin + metricCardWidth + metricsGap;

  pdf.setFillColor(16, 185, 129);
  pdf.setDrawColor(16, 185, 129);
  pdf.roundedRect(card2X, yPos, metricCardWidth - cardOffset, metricCardHeight, 3, 3, 'FD');

  pdf.setFillColor(236, 253, 245);
  pdf.setDrawColor(16, 185, 129);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(card2X + cardOffset, yPos, metricCardWidth - cardOffset, metricCardHeight, 3, 3, 'FD');

  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ESTIMATED IMMEDIATE SAVINGS', card2X + metricCardWidth / 2, yPos + 6, { align: 'center' });

  pdf.setTextColor(16, 185, 129);
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  const savings2Text = `$${annualSavings}`;
  const savings2Width = pdf.getTextWidth(savings2Text);
  pdf.text(savings2Text, card2X + metricCardWidth / 2 - savings2Width / 2 - 3, yPos + 18);
  pdf.setFontSize(12);
  pdf.text('/yr', card2X + metricCardWidth / 2 + savings2Width / 2 - 3, yPos + 18);

  pdf.setTextColor(16, 185, 129);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.text('LOW-HANGING FRUIT', card2X + metricCardWidth / 2, yPos + 28, { align: 'center' });

  // CARD 3: Reliability
  const card3X = margin + 2 * (metricCardWidth + metricsGap);

  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setDrawColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.roundedRect(card3X, yPos, metricCardWidth - cardOffset, metricCardHeight, 3, 3, 'FD');

  pdf.setFillColor(239, 246, 255);
  pdf.setDrawColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(card3X + cardOffset, yPos, metricCardWidth - cardOffset, metricCardHeight, 3, 3, 'FD');

  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ESTIMATED RELIABILITY', card3X + metricCardWidth / 2, yPos + 6, { align: 'center' });

  const errorFlag = result.efficiency_flags.find(f => f.flag_type === 'error_loop');
  let reliability = 100;
  if (errorFlag && errorFlag.error_rate !== undefined) {
    reliability = Math.round(100 - errorFlag.error_rate);
  }

  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${reliability}%`, card3X + metricCardWidth / 2, yPos + 18, { align: 'center' });

  const reliabilityColor = reliability === 100 ? { r: 16, g: 185, b: 129 } : { r: 239, g: 68, b: 68 };
  const reliabilityText = reliability === 100 ? 'EXCELLENT RELIABILITY' : 'BELOW EXPECTED RELIABILITY';
  pdf.setTextColor(reliabilityColor.r, reliabilityColor.g, reliabilityColor.b);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.text(reliabilityText, card3X + metricCardWidth / 2, yPos + 28, { align: 'center' });

  yPos += metricCardHeight + 8;

  yPos = addBeforeAfterComparison(pdf, yPos, margin, contentWidth, result);

  // ============================================================================
  // NEW PAGE: WHAT TO FIX TODAY + QUICK WINS
  // ============================================================================
  pdf.addPage();
  currentPage++;
  drawPageFrame(pdf, config, currentPage);
  yPos = 20;

  // WHAT TO FIX TODAY
  yPos = addWhatToFixToday(pdf, yPos, margin, contentWidth, result);
  ensureSpace(50);
  
  // QUICK WINS
  ensureSpace(30);
  yPos = addQuickWins(pdf, yPos, margin, contentWidth, result);


  // ============================================================================
  // PAGE 3: TECHNICAL ANALYSIS
  // ============================================================================
  pdf.addPage();
  currentPage++;
  drawPageFrame(pdf, config, currentPage);
  yPos = 20;

  yPos = addTechnicalAnalysis(pdf, yPos, margin, contentWidth, result, {
    trigger_app: zapTitle.split(' ')[0] || 'Webhook', // Extract first word as trigger
    step_count: result.total_nodes
  });

  ensureSpace(65);
  yPos = addErrorAnalysis(pdf, yPos, margin, contentWidth, result);

  ensureSpace(50);
  yPos = addCostWasteAnalysis(pdf, yPos, margin, contentWidth, result);

  // Save
  const sanitizedTitle = zapTitle.replace(/[^a-z0-9]/gi, '_');
  const timestamp = new Date().toISOString().split('T')[0];
  pdf.save(`Lighthouse_${sanitizedTitle}_${timestamp}.pdf`);
}

// ========================================
// DEVELOPER EDITION PDF GENERATION
// ========================================

/**
 * Generate Developer Edition PDF for batch analysis
 * Multi-Zap technical report with patterns, scope, and per-Zap breakdown
 */
export async function generateDeveloperEditionPDF(
  batchResult: BatchParseResult,
  config: PDFConfig
) {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = 170;

  let currentPage = 1;
  let yPos = 20;

  // Draw frame for first page
  drawPageFrame(pdf, config, currentPage);

  // Ensure space function
  const ensureSpace = (spaceNeeded: number) => {
    if (yPos + spaceNeeded > pageHeight - margin - 15) {
      pdf.addPage();
      currentPage++;
      drawPageFrame(pdf, config, currentPage);
      yPos = 20;
      return true;
    }
    return false;
  };

  // Calculate severity breakdown
  const severityBreakdown = { high: 0, medium: 0, low: 0 };
  batchResult.individual_results.forEach(result => {
    result.efficiency_flags.forEach(flag => {
      if (flag.severity === 'high') severityBreakdown.high++;
      else if (flag.severity === 'medium') severityBreakdown.medium++;
      else if (flag.severity === 'low') severityBreakdown.low++;
    });
  });

  // ============================================================================
  // PAGE 1: TECHNICAL COVER (Hero Page)
  // ============================================================================

  // Logo + Title
  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.roundedRect(margin, yPos, 8, 8, 2, 2, 'F');
  pdf.setFillColor(255, 255, 255);
  const iconX = margin + 4;
  const iconY = yPos + 4;
  const lightningPath = [[-2.5, 3.6], [2.5, 0], [0, 2.4], [2.5, -3.6], [-2.5, 0], [0, -2.4]];
  pdf.lines(lightningPath, iconX, iconY - 3, [1, 1], 'F', true);

  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Lighthouse ', margin + 10, yPos + 6);
  
  pdf.setTextColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setFont('helvetica', 'bolditalic');
  const lighthouseWidth = pdf.getTextWidth('Lighthouse ');
  pdf.text('Developer Edition', margin + 10 + lighthouseWidth, yPos + 6);

  yPos += 12;

  // Subtitle
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(0.1);
  pdf.text('MULTI-ZAP BATCH ANALYSIS REPORT', margin, yPos + 6);
  pdf.setCharSpace(0);

  // Report metadata (right side)
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  pdf.text(dateStr, pageWidth - margin, yPos + 6, { align: 'right' });
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Report ID: ${config.reportCode}`, pageWidth - margin, yPos + 10, { align: 'right' });

  yPos += 25;

  // PROJECT SNAPSHOT Card
  const snapshotHeight = 45;
  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.roundedRect(margin, yPos, contentWidth - 1, snapshotHeight, 3, 3, 'FD');
  pdf.setFillColor(239, 246, 255);
  pdf.roundedRect(margin + 1, yPos, contentWidth - 1, snapshotHeight, 3, 3, 'FD');

  pdf.setTextColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('PROJECT SNAPSHOT', margin + 8, yPos + 8);
  pdf.setCharSpace(0);

  // Metrics in 2x2 grid
  const snapMetrics = [
    { label: 'Zaps Analyzed', value: batchResult.zap_count.toString() },
    { label: 'Total Anti-Patterns', value: batchResult.total_flags.toString() },
    { label: 'Monthly Waste', value: `$${Math.round(batchResult.total_estimated_savings)}` },
    { label: 'Avg Efficiency', value: `${Math.round(batchResult.average_efficiency_score)}/100` }
  ];

  const gridCols = 2;
  const gridGap = 10;
  const cellWidth = (contentWidth - 20 - gridGap) / 2;
  let gridY = yPos + 16;

  snapMetrics.forEach((metric, i) => {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    const x = margin + 8 + col * (cellWidth + gridGap);
    const y = gridY + row * 12;

    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
    pdf.text(metric.value, x, y);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
    pdf.text(metric.label.toUpperCase(), x, y + 5);
  });

  yPos += snapshotHeight + 8;

  // SEVERITY BREAKDOWN Card
  ensureSpace(35);
  const sevHeight = 30;
  pdf.setFillColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.roundedRect(margin, yPos, contentWidth - 1, sevHeight, 3, 3, 'FD');
  pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
  pdf.roundedRect(margin + 1, yPos, contentWidth - 1, sevHeight, 3, 3, 'FD');

  pdf.setTextColor(COLORS.SLATE_700.r, COLORS.SLATE_700.g, COLORS.SLATE_700.b);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('SEVERITY BREAKDOWN', margin + 8, yPos + 8);
  pdf.setCharSpace(0);

  let sevY = yPos + 18;
  const sevItems = [
    { emoji: '🔴', label: 'High', count: severityBreakdown.high },
    { emoji: '🟡', label: 'Medium', count: severityBreakdown.medium },
    { emoji: '🟢', label: 'Low', count: severityBreakdown.low }
  ];

  sevItems.forEach(item => {
    pdf.setFontSize(10);
    pdf.text(item.emoji, margin + 8, sevY);
    
    pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${item.label}:`, margin + 15, sevY);
    
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${item.count} issue${item.count === 1 ? '' : 's'}`, margin + 35, sevY);
    
    sevY += 6;
  });

  yPos += sevHeight + 8;

  // ============================================================================
  // PAGE 2: SYSTEM HEALTH & SCOPE
  // ============================================================================
  pdf.addPage();
  currentPage++;
  drawPageFrame(pdf, config, currentPage);
  yPos = 20; // ✅ RESET

  // Page title
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('System Health & Scope', margin, yPos);
  yPos += 12; // ✅ Spacing after title

  // SYSTEM HEALTH OVERVIEW Card
  const healthHeight = 40;
  pdf.setFillColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.roundedRect(margin, yPos, contentWidth - 1, healthHeight, 3, 3, 'FD');
  pdf.setFillColor(236, 253, 245);
  pdf.roundedRect(margin + 1, yPos, contentWidth - 1, healthHeight, 3, 3, 'FD');

  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('SYSTEM HEALTH OVERVIEW', margin + 8, yPos + 8);
  pdf.setCharSpace(0);

  let healthY = yPos + 18;
  const metrics = batchResult.system_metrics;
  const healthItems = [
    `• Avg Steps/Zap: ${metrics.avg_steps_per_zap.toFixed(1)}`,
    `• Polling Triggers: ${metrics.polling_trigger_count}/${batchResult.zap_count} (${Math.round(metrics.polling_trigger_count / batchResult.zap_count * 100)}%)`,
    `• Instant Triggers: ${metrics.instant_trigger_count}/${batchResult.zap_count} (${Math.round(metrics.instant_trigger_count / batchResult.zap_count * 100)}%)`,
    `• Formatter Density: ${metrics.formatter_usage_density}`
  ];

  pdf.setTextColor(COLORS.SLATE_700.r, COLORS.SLATE_700.g, COLORS.SLATE_700.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  healthItems.forEach(item => {
    pdf.text(item, margin + 8, healthY);
    healthY += 5;
  });

  yPos += healthHeight + 8;

  // ANALYZED & EXCLUDED - Two Columns
  ensureSpace(100);
  
  const colWidth = (contentWidth - 4) / 2;
  
  // LEFT: Analyzed Zaps
  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.roundedRect(margin, yPos, colWidth, 80, 3, 3, 'FD');
  pdf.setFillColor(239, 246, 255);
  pdf.roundedRect(margin + 1, yPos, colWidth - 1, 80, 3, 3, 'FD');

  pdf.setTextColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text(`ANALYZED (${batchResult.scope_metadata.analyzed_count})`, margin + 6, yPos + 7);
  pdf.setCharSpace(0);

  let listY = yPos + 15;
  const analyzed = batchResult.scope_metadata.analyzed_zap_summaries.slice(0, 10);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_700.r, COLORS.SLATE_700.g, COLORS.SLATE_700.b);

  for (const zap of analyzed) {
    if (listY > yPos + 75) {
      pdf.text('...', margin + 6, listY);
      break;
    }
    const title = zap.title.substring(0, 20) + (zap.title.length > 20 ? '...' : '');
    pdf.text(`• ${title}`, margin + 6, listY);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(6);
    pdf.text(`${zap.step_count} steps`, margin + 10, listY + 3);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    listY += 7;
  }

  // RIGHT: Excluded Zaps
  const rightX = margin + colWidth + 4;
  pdf.setFillColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.roundedRect(rightX, yPos, colWidth, 80, 3, 3, 'FD');
  pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
  pdf.roundedRect(rightX + 1, yPos, colWidth - 1, 80, 3, 3, 'FD');

  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text(`EXCLUDED (${batchResult.scope_metadata.excluded_count})`, rightX + 6, yPos + 7);
  pdf.setCharSpace(0);

  listY = yPos + 15;
  const excluded = batchResult.scope_metadata.excluded_zap_summaries.slice(0, 10);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);

  for (const zap of excluded) {
    if (listY > yPos + 75) {
      pdf.text('...', rightX + 6, listY);
      break;
    }
    const title = zap.title.substring(0, 20) + (zap.title.length > 20 ? '...' : '');
    pdf.text(`• ${title}`, rightX + 6, listY);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(6);
    pdf.text(`(${zap.status})`, rightX + 10, listY + 3);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    listY += 7;
  }

  yPos += 85;

  // ============================================================================
  // PAGE 3: PATTERN-LEVEL FINDINGS
  // ============================================================================
  pdf.addPage();
  currentPage++;
  drawPageFrame(pdf, config, currentPage);
  yPos = 20; // ✅ RESET

  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Pattern-Level Findings', margin, yPos);
  yPos += 12; // ✅ Spacing after title

  // Draw pattern cards
  const patterns = batchResult.patterns.slice(0, 5); // Top 5 patterns
  
  for (const pattern of patterns) {
    ensureSpace(35);
    
    const cardHeight = 28;
    const severityColor = pattern.severity === 'high' ? COLORS.RED :
      pattern.severity === 'medium' ? { r: 245, g: 158, b: 11 } : COLORS.GREEN;
    
    pdf.setFillColor(severityColor.r, severityColor.g, severityColor.b);
    pdf.roundedRect(margin, yPos, contentWidth - 1, cardHeight, 3, 3, 'FD');
    
    const bgColor = pattern.severity === 'high' ? { r: 254, g: 242, b: 242 } :
      pattern.severity === 'medium' ? { r: 254, g: 243, b: 199 } : { r: 236, g: 253, b: 245 };
    pdf.setFillColor(bgColor.r, bgColor.g, bgColor.b);
    pdf.roundedRect(margin + 1, yPos, contentWidth - 1, cardHeight, 3, 3, 'FD');

    // Pattern header
    pdf.setTextColor(severityColor.r, severityColor.g, severityColor.b);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setCharSpace(1);
    pdf.text(pattern.pattern_name.toUpperCase(), margin + 8, yPos + 7);
    pdf.setCharSpace(0);

    // Affected count badge
    pdf.setFontSize(8);
    pdf.text(`${pattern.affected_count} Zaps`, pageWidth - margin - 20, yPos + 7, { align: 'right' });

    // Details
    let detailY = yPos + 15;
    pdf.setTextColor(COLORS.SLATE_700.r, COLORS.SLATE_700.g, COLORS.SLATE_700.b);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`• Waste: ${pattern.total_waste_tasks} tasks/month ($${Math.round(pattern.total_waste_usd)})`, margin + 8, detailY);
    
    detailY += 5;
    if (pattern.median_chain_length) {
      pdf.text(`• Avg Chain Length: ${pattern.median_chain_length.toFixed(1)} steps`, margin + 8, detailY);
      detailY += 5;
    }
    
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(7);
    const guidance = pattern.refactor_guidance.substring(0, 80) + (pattern.refactor_guidance.length > 80 ? '...' : '');
    pdf.text(`Fix: ${guidance}`, margin + 8, detailY, { maxWidth: contentWidth - 16 });

    yPos += cardHeight + 4;
  }

  // ============================================================================
  // PAGES 4+: PER-ZAP BREAKDOWN (with ASCII diagrams)
  // ============================================================================
  const topZaps = batchResult.individual_results.slice(0, 5); // Top 5 zaps with most flags
  
  for (let zapIndex = 0; zapIndex < topZaps.length; zapIndex++) {
    const result = topZaps[zapIndex];
    
    pdf.addPage();
    currentPage++;
    drawPageFrame(pdf, config, currentPage);
    yPos = 20; // ✅ RESET

    // Zap header
    const zapTitle = result.efficiency_flags.length > 0 
      ? result.efficiency_flags[0].zap_title 
      : `Zap ${zapIndex + 1}`;
    
    pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(zapTitle.substring(0, 50), margin, yPos);
    
    pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${result.total_nodes} steps • ${result.efficiency_flags.length} issues • Score: ${result.efficiency_score}/100`, margin, yPos + 6);
    
    yPos += 18; // ✅ Spacing after header

    // ASCII DIAGRAM BOX
    ensureSpace(55);
    const diagramHeight = 50;
    
    pdf.setFillColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
    pdf.roundedRect(margin, yPos, contentWidth - 1, diagramHeight, 3, 3, 'FD');
    pdf.setFillColor(30, 41, 59); // slate-800
    pdf.roundedRect(margin + 1, yPos, contentWidth - 1, diagramHeight, 3, 3, 'FD');

    // ✅ ASCII HEADER - Courier bold
    pdf.setTextColor(96, 165, 250); // blue-400
    pdf.setFontSize(8);
    pdf.setFont('courier', 'bold');
    pdf.text('WORKFLOW ARCHITECTURE', margin + 6, yPos + 6);

    // ✅ ASCII diagram - Courier normal for monospaced
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(8); // ✅ Increased from 7 to 8 for better readability
    pdf.setTextColor(229, 231, 235); // gray-200

    let diagramY = yPos + 14;
    const triggerApp = result.apps.length > 0 ? result.apps[0].name : 'Webhook';
    const actionApp = result.apps.length > 1 ? result.apps[1].name : 'Unknown';
    
    // Generate simple ASCII flow
    const asciiLines = [
      `  ┌────────────────┐`,
      `  │   ${triggerApp.substring(0, 12).padEnd(12, ' ')}   │  TRIGGER`,
      `  └────────┬───────┘`,
      `           │`,
      `           ▼`,
      `  ┌────────────────┐`,
      `  │  LOGIC LAYER   │  ${result.total_nodes - 2} steps`,
      `  │  (filters,     │`,
      `  │   formatters)  │`,
      `  └────────┬───────┘`,
      `           │`,
      `           ▼`,
      `  ┌────────────────┐`,
      `  │   ${actionApp.substring(0, 12).padEnd(12, ' ')}   │  ACTION`,
      `  └────────────────┘`
    ];

    asciiLines.forEach(line => {
      pdf.text(line, margin + 6, diagramY);
      diagramY += 4; // ✅ Increased from 3 to 4 for better spacing
    });

    // ✅ Reset font to helvetica after ASCII diagram
    pdf.setFont('helvetica', 'normal');
    
    yPos += diagramHeight + 8;

    // Issues for this Zap
    ensureSpace(30);
    pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Identified Issues', margin, yPos + 6);
    yPos += 12;

    const zapFlags = result.efficiency_flags.slice(0, 3);
    for (const flag of zapFlags) {
      ensureSpace(20);
      
      const issueHeight = 16;
      const sevColor = flag.severity === 'high' ? COLORS.RED :
        flag.severity === 'medium' ? { r: 245, g: 158, b: 11 } : COLORS.GREEN;
      
      pdf.setFillColor(sevColor.r, sevColor.g, sevColor.b);
      pdf.roundedRect(margin, yPos, contentWidth - 1, issueHeight, 2, 2, 'FD');
      
      const issueBg = flag.severity === 'high' ? { r: 254, g: 242, b: 242 } :
        flag.severity === 'medium' ? { r: 254, g: 243, b: 199 } : { r: 236, g: 253, b: 245 };
      pdf.setFillColor(issueBg.r, issueBg.g, issueBg.b);
      pdf.roundedRect(margin + 1, yPos, contentWidth - 1, issueHeight, 2, 2, 'FD');

      pdf.setTextColor(sevColor.r, sevColor.g, sevColor.b);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.text(flag.flag_type.toUpperCase().replace(/_/g, ' '), margin + 6, yPos + 6);

      pdf.setTextColor(COLORS.SLATE_700.r, COLORS.SLATE_700.g, COLORS.SLATE_700.b);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      const msg = flag.message.substring(0, 70) + (flag.message.length > 70 ? '...' : '');
      pdf.text(msg, margin + 6, yPos + 11);

      yPos += issueHeight + 3;
    }
  }

  // ============================================================================
  // TECH DEBT SCOREBOARD
  // ============================================================================
  pdf.addPage();
  currentPage++;
  drawPageFrame(pdf, config, currentPage);
  yPos = 20;

  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Tech Debt Scoreboard', margin, yPos + 6);
  yPos += 18;

  // Table header
  pdf.setFillColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.roundedRect(margin, yPos, contentWidth, 8, 2, 2, 'F');
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ZAP NAME', margin + 4, yPos + 5.5);
  pdf.text('COMPLEXITY', margin + 60, yPos + 5.5);
  pdf.text('RISK', margin + 90, yPos + 5.5);
  pdf.text('WASTE', margin + 110, yPos + 5.5);
  pdf.text('PRIORITY', margin + 140, yPos + 5.5);
  
  yPos += 10;

  // Table rows
  const scoreboardZaps = batchResult.individual_results.slice(0, 10);
  
  for (let i = 0; i < scoreboardZaps.length; i++) {
    const res = scoreboardZaps[i];
    ensureSpace(8);
    
    // Alternating row colors
    if (i % 2 === 0) {
      pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
      pdf.rect(margin, yPos, contentWidth, 6, 'F');
    }

    const zapName = res.efficiency_flags.length > 0 
      ? res.efficiency_flags[0].zap_title.substring(0, 25) 
      : `Zap ${i + 1}`;
    
    const complexity = res.total_nodes > 8 ? 'High' : res.total_nodes > 4 ? 'Med' : 'Low';
    const risk = res.efficiency_flags.length > 2 ? 'High' : res.efficiency_flags.length > 0 ? 'Med' : 'Low';
    const waste = `$${Math.round(res.estimated_savings * 12)}`;
    const priority = res.efficiency_score < 50 ? '🔴' : res.efficiency_score < 75 ? '🟡' : '🟢';

    pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.text(zapName, margin + 4, yPos + 4);
    pdf.text(complexity, margin + 60, yPos + 4);
    pdf.text(risk, margin + 90, yPos + 4);
    pdf.text(waste, margin + 110, yPos + 4);
    pdf.text(priority, margin + 140, yPos + 4);

    yPos += 6;
  }

  // ============================================================================
  // OPTIMIZATION CHECKLIST
  // ============================================================================
  yPos += 10;
  ensureSpace(40);

  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Optimization Checklist', margin, yPos + 6);
  yPos += 18;

  // Dynamic checklist based on patterns
  const checklistItems: string[] = [];
  
  batchResult.patterns.forEach(pattern => {
    if (pattern.pattern_type === 'polling_trigger') {
      checklistItems.push(`Replace ${pattern.affected_count} polling triggers with webhooks`);
    } else if (pattern.pattern_type === 'formatter_chain') {
      checklistItems.push(`Consolidate ${pattern.affected_count} formatter chains into single steps`);
    } else if (pattern.pattern_type === 'late_filter') {
      checklistItems.push(`Reposition filters earlier in ${pattern.affected_count} workflows`);
    } else {
      checklistItems.push(`Address ${pattern.pattern_name} in ${pattern.affected_count} Zaps`);
    }
  });

  // Add generic items
  checklistItems.push('Review error handling for all high-risk Zaps');
  checklistItems.push('Document complex workflows for team knowledge');
  checklistItems.push('Set up monitoring for critical automations');

  // Draw checklist
  const checklistHeight = 10 + checklistItems.length * 7;
  pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
  pdf.roundedRect(margin, yPos, contentWidth, checklistHeight, 3, 3, 'F');

  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Action Items', margin + 6, yPos + 7);

  let checkY = yPos + 15;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);

  for (const item of checklistItems) {
    // Empty checkbox
    pdf.setDrawColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
    pdf.setLineWidth(0.3);
    pdf.rect(margin + 8, checkY - 3, 3, 3);
    
    pdf.setTextColor(COLORS.SLATE_700.r, COLORS.SLATE_700.g, COLORS.SLATE_700.b);
    pdf.text(item, margin + 14, checkY);
    
    checkY += 7;
    if (checkY > pageHeight - margin - 20) break;
  }

  // Save
  const timestamp = new Date().toISOString().split('T')[0];
  pdf.save(`Lighthouse_Developer_Edition_${timestamp}.pdf`);
}
