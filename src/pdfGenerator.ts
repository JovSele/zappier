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

// ========================================
// PRECISE COLOR PALETTE (HEX from HTML)
// ========================================
const COLORS = {
  BLUE: { r: 37, g: 99, b: 235 },      // #2563eb
  GREEN: { r: 5, g: 150, b: 105 },     // #059669  
  RED: { r: 225, g: 29, b: 72 },       // #e11d48
  SLATE_50: { r: 248, g: 250, b: 252 },
  SLATE_200: { r: 226, g: 232, b: 240 },
  SLATE_400: { r: 148, g: 163, b: 184 },
  SLATE_600: { r: 71, g: 85, b: 105 },
  SLATE_900: { r: 15, g: 23, b: 42 }
};

// ========================================
// HELPER SECTIONS
// ========================================

/**
 * Add Data Confidence section
 */
function addDataConfidence(
  pdf: jsPDF,
  yPos: number,
  margin: number,
  contentWidth: number,
  result: ParseResult
): number {
  // Extract total runs
  let totalRuns = 150; // Default
  result.efficiency_flags.forEach(flag => {
    const match = flag.details.match(/(\d+) total runs/);
    if (match) {
      totalRuns = Math.max(totalRuns, parseInt(match[1]));
    }
  });
  
  // Card
  pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(margin, yPos, contentWidth, 22, 2, 2, 'FD');
  
  // Header
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('DATA CONFIDENCE', margin + 5, yPos + 6);
  
  yPos += 12;
  
  // Coverage
  pdf.setFillColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.circle(margin + 6, yPos - 1, 1, 'F');
  
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.text('Coverage: ', margin + 9, yPos);
  
  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text('High', margin + 30, yPos);
  
  yPos += 5;
  
  // Sample
  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.circle(margin + 6, yPos - 1, 1, 'F');
  
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.text('Sample: ', margin + 9, yPos);
  
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${totalRuns} runs`, margin + 30, yPos);
  
  yPos += 5;
  
  // Period
  pdf.setFillColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.circle(margin + 6, yPos - 1, 1, 'F');
  
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.text('Period: ', margin + 9, yPos);
  
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text('30 days', margin + 30, yPos);
  
  return yPos + 6;
}

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
  // Card
  pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(margin, yPos, contentWidth, 28, 2, 2, 'FD');
  
  // Header
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('BEFORE VS AFTER OPTIMIZATION', margin + 5, yPos + 6);
  
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'italic');
  pdf.text('Projected impact of recommended fixes', margin + 5, yPos + 10);
  
  yPos += 15;
  
  // Calculate values
  const errorFlag = result.efficiency_flags.find(f => f.flag_type === 'error_loop');
  let currentErrorRate = 0;
  if (errorFlag) {
    const match = errorFlag.details.match(/(\d+\.?\d*)% error rate/);
    if (match && match[1]) {
      currentErrorRate = Math.round(parseFloat(match[1]));
    }
  }
  
  const hasPolling = result.efficiency_flags.some(f => f.flag_type === 'polling_trigger');
  const currentCost = Math.round(result.estimated_savings * 12 * 2.5);
  const optimizedCost = Math.round(result.estimated_savings * 12 * 0.1);
  
  // Column setup
  const col1X = margin + 5;
  const col2X = margin + (contentWidth / 2) + 3;
  const rowHeight = 6;
  
  // Row 1: Error Rate & Yearly Cost
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.text('ERROR RATE', col1X, yPos);
  pdf.text('YEARLY COST', col2X, yPos);
  
  yPos += 4;
  
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.text(`${currentErrorRate}%`, col1X + 25, yPos);
  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.text('→ under 5%', col1X + 35, yPos);
  
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.text(`$${currentCost}`, col2X + 25, yPos);
  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.text(`→ under $${optimizedCost}`, col2X + 40, yPos);
  
  yPos += 2;
  
  // Horizontal line
  pdf.setDrawColor(240, 240, 240);
  pdf.setLineWidth(0.1);
  pdf.line(col1X, yPos, margin + contentWidth - 5, yPos);
  
  yPos += 4;
  
  // Row 2: Sync Speed & Maintenance  
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.text('SYNC SPEED', col1X, yPos);
  pdf.text('MAINTENANCE', col2X, yPos);
  
  yPos += 4;
  
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  const beforeSpeed = hasPolling ? 'Polling' : 'Standard';
  const afterSpeed = hasPolling ? 'Real-time' : 'Optimized';
  pdf.text(beforeSpeed, col1X + 25, yPos);
  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.text(`→ ${afterSpeed}`, col1X + 40, yPos);
  
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.text('High', col2X + 25, yPos);
  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.text('→ Automated', col2X + 35, yPos);
  
  return yPos + 8;
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
  
  // Card
  pdf.setFillColor(236, 253, 245); // emerald-50
  pdf.setDrawColor(167, 243, 208); // emerald-200
  pdf.setLineWidth(0.1);
  const cardHeight = 10 + (topFlags.length * 5);
  pdf.roundedRect(margin, yPos, contentWidth, cardHeight, 2, 2, 'FD');
  
  // Header
  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('QUICK WIN SUMMARY', margin + 5, yPos + 6);
  
  yPos += 12;
  
  topFlags.forEach((flag, i) => {
    let actionName = '';
    let resultText = '';
    
    if (flag.flag_type === 'error_loop') {
      actionName = 'Fix authentication failures';
      const errorMatch = flag.details.match(/(\d+\.?\d*)% error rate/);
      const errorRate = errorMatch ? Math.round(parseFloat(errorMatch[1])) : 0;
      resultText = `→ ${errorRate}% error reduction`;
    } else if (flag.flag_type === 'late_filter_placement') {
      actionName = 'Reposition filters earlier';
      resultText = `→ $${flag.estimated_monthly_savings.toFixed(0)}/month savings`;
    } else if (flag.flag_type === 'polling_trigger') {
      actionName = 'Replace polling triggers';
      resultText = `→ real-time + $${flag.estimated_monthly_savings.toFixed(0)}/month`;
    } else {
      actionName = flag.message.substring(0, 35);
      resultText = `→ improved efficiency`;
    }
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
    pdf.text(`${i + 1}. ${actionName}`, margin + 5, yPos);
    
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
    pdf.text(resultText, margin + 70, yPos);
    
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
  const contentWidth = 170; // Precise width
  
  let yPos = margin;
  
  const zapTitle = result.efficiency_flags.length > 0 
    ? result.efficiency_flags[0].zap_title 
    : 'Audit Report';

  const annualSavings = Math.round(result.estimated_savings * 12);  
  
  const checkPageBreak = (space: number) => {
    if (yPos + space > pageHeight - margin) {
      pdf.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };
  

  //HEADER
// ============================================================================
// PAGE HEADER (thin dark bar + light content area)
// ============================================================================

// Thin dark bar at top (10mm)
pdf.setFillColor(30, 41, 59); // slate-800 (#1e293b)
pdf.rect(0, 0, pageWidth, 10, 'F');

yPos = 18; // Start content below the bar

// LEFT: Logo + Title
// Logo square (blue)
pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
pdf.roundedRect(margin, yPos, 8, 8, 2, 2, 'F');

// Lightning icon (SVG path)
pdf.setFillColor(255, 255, 255);

const iconX = margin + 4;
const iconY = yPos + 4;

// Horný trojuholník
pdf.triangle(
  iconX - 0.6, iconY - 1.2,  // ľavý horný
  iconX + 0.4, iconY - 1.2,  // pravý horný
  iconX + 0.9, iconY + 0.3,  // pravý hrot (prekrytie)
  'F'
);

// Dolný trojuholník
pdf.triangle(
  iconX - 0.9, iconY - 0.3,  // ľavý hrot (prekrytie)
  iconX - 0.4, iconY + 1.2,  // ľavý dolný
  iconX + 0.6, iconY + 1.2,  // pravý dolný
  'F'
);

// "Lighthouse" text
pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
pdf.setFontSize(14);
pdf.setFont('helvetica', 'bold');
pdf.text('Lighthouse ', margin + 10, yPos + 6);

// "Audit" text (blue, italic)
pdf.setTextColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
pdf.setFont('helvetica', 'bolditalic');
const lighthouseWidth = pdf.getTextWidth('Lighthouse ');
pdf.text('Audit', margin + 10 + lighthouseWidth, yPos + 6);

// Subtitle
pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
pdf.setFontSize(6);
pdf.setFont('helvetica', 'bold');
pdf.setCharSpace(0.5);
pdf.text('ZAPIER AUTOMATION INTELLIGENCE REPORT', margin, yPos + 11);
pdf.setCharSpace(0);

// RIGHT: Audit Complete badge
const badgeWidth = 25;
const badgeX = pageWidth - margin - badgeWidth;
pdf.setFillColor(236, 253, 245); // emerald-50
pdf.setDrawColor(167, 243, 208); // emerald-200
pdf.setLineWidth(0.3);
pdf.roundedRect(badgeX, yPos, badgeWidth, 4.5, 2, 2, 'FD');

pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
pdf.setFontSize(6);
pdf.setFont('helvetica', 'bold');
pdf.text('Audit Complete', badgeX + badgeWidth / 2, yPos + 3, { align: 'center' });

// Date below badge
pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
pdf.setFontSize(6);
pdf.setFont('helvetica', 'italic');
const now = new Date();
const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
pdf.text(`${dateStr} • ${timeStr}`, pageWidth - margin, yPos + 7.5, { align: 'right' });

yPos += 20;

// Report ID badge (NO character spacing)
const reportIdText = 'Report ID: LHA-2026-026-00003';

pdf.setFontSize(7);
pdf.setFont('helvetica', 'bold');
pdf.setCharSpace(0); 

const textWidth = pdf.getTextWidth(reportIdText);
const idBadgePadding = 4;
const idBadgeWidth = textWidth + (idBadgePadding * 2);
const idBadgeHeight = 6;

// Box
pdf.setFillColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
pdf.roundedRect(margin, yPos, idBadgeWidth, idBadgeHeight, 3, 3, 'F');

// PERFECT CENTER TEXT
pdf.setTextColor(255, 255, 255);

pdf.text(
  reportIdText,
  margin + idBadgeWidth / 2,
  yPos + idBadgeHeight / 2,
  {
    align: 'center',
    baseline: 'middle'  
  }
);
yPos += 15;
        
  // koniec HEADER
 


  // ============================================================================
  // EFFICIENCY SCORE + DATA CONFIDENCE (2 cards side by side) - section 1
  // ============================================================================
  const cardGap = 4;
  const cardWidth = (contentWidth - cardGap) / 2;
  const cardHeight = 35;

  // LEFT CARD: Efficiency Score (modrý gradient)
  const leftCardX = margin;

  pdf.setFillColor(239, 246, 255); // blue-50
  pdf.setDrawColor(191, 219, 254); // blue-200
  pdf.setLineWidth(0.5);
  pdf.roundedRect(leftCardX, yPos, cardWidth, cardHeight, 3, 3, 'FD');

  // Header
  pdf.setTextColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('OVERALL PERFORMANCE', leftCardX + cardWidth / 2, yPos + 6, { align: 'center' });
  pdf.setCharSpace(0);

  // Score
  const scoreColor = result.efficiency_score >= 75 ? COLORS.GREEN : 
                    result.efficiency_score >= 50 ? { r: 245, g: 158, b: 11 } : COLORS.RED;
  pdf.setTextColor(scoreColor.r, scoreColor.g, scoreColor.b);
  pdf.setFontSize(32);
  pdf.text(`${result.efficiency_score}`, leftCardX + cardWidth / 2 - 8, yPos + 20);
  pdf.setFontSize(16);
  pdf.text('/100', leftCardX + cardWidth / 2 + 12, yPos + 20);

  // Label
  const scoreLabel = result.efficiency_score >= 90 ? 'EXCELLENT' :
                    result.efficiency_score >= 75 ? 'GOOD' :
                    result.efficiency_score >= 50 ? 'FAIR' : 'BELOW OPTIMAL';
  const labelColor = result.efficiency_score >= 75 ? COLORS.GREEN :
                    result.efficiency_score >= 50 ? { r: 245, g: 158, b: 11 } : { r: 217, g: 119, b: 6 };
  pdf.setTextColor(labelColor.r, labelColor.g, labelColor.b);
  pdf.setFontSize(8);
  pdf.text(scoreLabel, leftCardX + cardWidth / 2, yPos + 26, { align: 'center' });

  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(7);
  pdf.text('EFFICIENCY SCORE', leftCardX + cardWidth / 2, yPos + 31, { align: 'center' });

  // RIGHT CARD: Data Confidence (slate-50)
  const rightCardX = margin + cardWidth + cardGap;

  pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(rightCardX, yPos, cardWidth, cardHeight, 3, 3, 'FD');

  // Header
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('DATA CONFIDENCE', rightCardX + 5, yPos + 6);
  pdf.setCharSpace(0);

  // 3 bullet points
  let bulletY = yPos + 12;

  // Coverage
  pdf.setFillColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.circle(rightCardX + 6, bulletY, 1, 'F');
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.text('Coverage: ', rightCardX + 9, bulletY + 1);
  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text('High', rightCardX + 28, bulletY + 1);

  bulletY += 6;

  // Sample
  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.circle(rightCardX + 6, bulletY, 1, 'F');
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.text('Sample: ', rightCardX + 9, bulletY + 1);
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text('150 runs', rightCardX + 28, bulletY + 1);

  bulletY += 6;

  // Period
  pdf.setFillColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.circle(rightCardX + 6, bulletY, 1, 'F');
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.text('Period: ', rightCardX + 9, bulletY + 1);
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text('30 days', rightCardX + 28, bulletY + 1);

  yPos += cardHeight + 6; // Move below both cards

  //end - section 1
  
  //Anylyzed Automation section 2
  // ============================================================================
  // ZAP INFO BOX
  // ============================================================================

  pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(margin, yPos, contentWidth, 22, 3, 3, 'FD'); // ✅ vyska boxu

  // Header "ANALYZED AUTOMATION"
  pdf.setTextColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(1);
  pdf.text('ANALYZED AUTOMATION', margin + 6, yPos + 6); // ✅ yPos + 6 - mensie cislo blizsie k vrchu  poloha "ANALYZED AUTOMATION"
  pdf.setCharSpace(0);

  // Zap Title (väčší spacing pod headerom)
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(zapTitle, margin + 6, yPos + 12); // ✅ Zostáva rovnaké

  // Zap ID + Status (väčší spacing pod titulom)
  const zapId = result.efficiency_flags.length > 0 
    ? result.efficiency_flags[0].zap_id 
    : 0;

  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`ID: ${zapId} • Status: `, margin + 6, yPos + 17); // ✅ yPos + 17 (bol 16)

  // Status badge
  pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ACTIVE', margin + 41, yPos + 17); // ✅ yPos + 17 (bol 16)

  yPos += 26; // ✅ Väčší spacing po boxe 

  //end - Anylyzed Automation section 2




//EXECUTIVE VERDICT - section 3
// ============================================================================
// EXECUTIVE VERDICT (žltý box)
// ============================================================================

const boxHeight = 24;
const offset = 1;

// PRVÝ BOX (spodný, plnofarebný, menší)
pdf.setFillColor(251, 191, 36); // amber-50
pdf.setDrawColor(251, 191, 36); // amber-400
pdf.roundedRect(margin, yPos, contentWidth - offset, boxHeight, 3, 3, 'FD');

// DRUHÝ BOX (vrchný, biely výplň, farebný okraj, posunutý doprava)
pdf.setFillColor(254, 252, 232); // amber-50
pdf.setDrawColor(251, 191, 36); // amber-400
pdf.setLineWidth(0.1);
pdf.roundedRect(margin + offset, yPos, contentWidth - offset, boxHeight, 3, 3, 'FD');

// "EXECUTIVE VERDICT" label
pdf.setTextColor(217, 119, 6); // amber-600
pdf.setFontSize(7);
pdf.setFont('helvetica', 'bold');
pdf.setCharSpace(1);
pdf.text('EXECUTIVE VERDICT', margin + 6, yPos + 6);
pdf.setCharSpace(0);

// Main verdict text
pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
pdf.setFontSize(9);
pdf.setFont('helvetica', 'bold');
pdf.text('High Optimization Potential.', margin + 6, yPos + 11);

// Description text (wrapped)
pdf.setFont('helvetica', 'normal');
const verdictText = `Functional, but inefficient — approximately 2 out of 5 tasks are wasted due to architectural issues. Minor changes could save you `;
pdf.text(verdictText, margin + 6, yPos + 16, { maxWidth: contentWidth - 16 });

// Savings amount (green, bold)
pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
pdf.setFont('helvetica', 'bold');
pdf.text(`up to $${annualSavings}/year.`, margin + 45, yPos + 20);

yPos += 15; // spacing after box

// Scope text 
pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
pdf.setFontSize(9);
pdf.setFont('helvetica', 'normal');
const Text1 = `Scope: Single Zap analysis based on last 30 days of run data. Estimates may vary based on usage patterns. `;
pdf.text(Text1, margin + 6, yPos + 16, { maxWidth: contentWidth - 16 });

yPos += boxHeight + 1; // spacing after boxes

//end - EXECUTIVE VERDICT - section 3


//3 boxy - section 4
//KEY METRICS - section 5
// ============================================================================
// KEY METRICS (3 cards s farebnými bottom borders)
// ============================================================================

const metricsGap = 4;
const metricCardWidth = (contentWidth - 2 * metricsGap) / 3;
const metricCardHeight = 32;

// CARD 1: Annual Waste (rose border)

// 1. Main card (white, zaoblené rohy)
pdf.setFillColor(255, 255, 255);
pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
pdf.setLineWidth(0.1);
pdf.roundedRect(margin, yPos, metricCardWidth, metricCardHeight, 3, 3, 'FD');

// Header
pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
pdf.setFontSize(7);
pdf.setFont('helvetica', 'bold');
pdf.text('ESTIMATED ANNUAL WASTE', margin + metricCardWidth / 2, yPos + 6, { align: 'center' });

// Value
const annualWaste = Math.round(result.estimated_savings * 12 * 2.5);
pdf.setTextColor(239, 68, 68); // rose-600
pdf.setFontSize(20);
pdf.setFont('helvetica', 'bold');
pdf.text(`$${annualWaste}`, margin + metricCardWidth / 2, yPos + 16, { align: 'center' });
pdf.setFontSize(12);
pdf.text('/yr', margin + metricCardWidth / 2 + 12, yPos + 16);

// Subtitle
pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
pdf.setFontSize(6);
pdf.setFont('helvetica', 'bold');
pdf.text('PAID FOR INEFFICIENT TASKS', margin + metricCardWidth / 2, yPos + 28, { align: 'center' });

// CARD 2: Immediate Savings (emerald border)
const card2X = margin + metricCardWidth + metricsGap;

pdf.setFillColor(255, 255, 255);
pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
pdf.setLineWidth(0.1);
pdf.roundedRect(card2X, yPos, metricCardWidth, metricCardHeight, 3, 3, 'FD');

// Header
pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
pdf.setFontSize(7);
pdf.setFont('helvetica', 'bold');
pdf.text('ESTIMATED IMMEDIATE SAVINGS', card2X + metricCardWidth / 2, yPos + 6, { align: 'center' });

// Value
pdf.setTextColor(16, 185, 129); // emerald-600
pdf.setFontSize(20);
pdf.setFont('helvetica', 'bold');
pdf.text(`$${annualSavings}`, card2X + metricCardWidth / 2, yPos + 16, { align: 'center' });
pdf.setFontSize(12);
pdf.text('/yr', card2X + metricCardWidth / 2 + 12, yPos + 16);

// Subtitle
pdf.setTextColor(16, 185, 129); // emerald-500
pdf.setFontSize(6);
pdf.setFont('helvetica', 'bold');
pdf.text('LOW-HANGING FRUIT', card2X + metricCardWidth / 2, yPos + 28, { align: 'center' });

// CARD 3: Reliability (blue border)
const card3X = margin + 2 * (metricCardWidth + metricsGap);

pdf.setFillColor(255, 255, 255);
pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
pdf.setLineWidth(0.1);
pdf.roundedRect(card3X, yPos, metricCardWidth, metricCardHeight, 3, 3, 'FD');

// Header
pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
pdf.setFontSize(7);
pdf.setFont('helvetica', 'bold');
pdf.text('ESTIMATED RELIABILITY', card3X + metricCardWidth / 2, yPos + 6, { align: 'center' });

// Value
const errorFlag = result.efficiency_flags.find(f => f.flag_type === 'error_loop');
const reliability = errorFlag ? Math.round(100 - (errorFlag.error_rate || 0)) : 100;

pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
pdf.setFontSize(24);
pdf.setFont('helvetica', 'bold');
pdf.text(`${reliability}%`, card3X + metricCardWidth / 2, yPos + 18, { align: 'center' });

// Subtitle
const reliabilityColor = reliability === 100 ? { r: 16, g: 185, b: 129 } : { r: 239, g: 68, b: 68 };
const reliabilityText = reliability === 100 ? 'EXCELLENT RELIABILITY' : 'BELOW EXPECTED RELIABILITY';
pdf.setTextColor(reliabilityColor.r, reliabilityColor.g, reliabilityColor.b);
pdf.setFontSize(6);
pdf.setFont('helvetica', 'bold');
pdf.text(reliabilityText, card3X + metricCardWidth / 2, yPos + 28, { align: 'center' });

yPos += metricCardHeight + 8; // spacing after cards

//end -3 boxy - section 4


  // NEW SECTIONS
  checkPageBreak(60);
  
  yPos = addBeforeAfterComparison(pdf, yPos, margin, contentWidth, result);
  yPos = addQuickWins(pdf, yPos, margin, contentWidth, result);
  
  
  // Footer
  const totalPages = pdf.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Generated by Zapier Lighthouse | ${config.agencyName}`, 
             pageWidth / 2, pageHeight - 10, { align: 'center' });
    pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }
  
  // Save
  const sanitizedTitle = zapTitle.replace(/[^a-z0-9]/gi, '_');
  const timestamp = new Date().toISOString().split('T')[0];
  pdf.save(`Lighthouse_${sanitizedTitle}_${timestamp}.pdf`);
}
