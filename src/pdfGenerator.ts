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
  pdf.setLineWidth(0.5);
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
  pdf.setLineWidth(0.5);
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
    let result = '';
    
    if (flag.flag_type === 'error_loop') {
      actionName = 'Fix authentication failures';
      const errorMatch = flag.details.match(/(\d+\.?\d*)% error rate/);
      const errorRate = errorMatch ? Math.round(parseFloat(errorMatch[1])) : 0;
      result = `→ ${errorRate}% error reduction`;
    } else if (flag.flag_type === 'late_filter_placement') {
      actionName = 'Reposition filters earlier';
      result = `→ $${flag.estimated_monthly_savings.toFixed(0)}/month savings`;
    } else if (flag.flag_type === 'polling_trigger') {
      actionName = 'Replace polling triggers';
      result = `→ real-time + $${flag.estimated_monthly_savings.toFixed(0)}/month`;
    } else {
      actionName = flag.message.substring(0, 35);
      result = `→ improved efficiency`;
    }
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
    pdf.text(`${i + 1}. ${actionName}`, margin + 5, yPos);
    
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
    pdf.text(result, margin + 70, yPos);
    
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

// Lightning icon (white Z as placeholder)
pdf.setTextColor(255, 255, 255);
pdf.setFontSize(12);
pdf.setFont('helvetica', 'bold');
pdf.text('⚡', margin + 2, yPos + 6);

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

  
  
  // Executive Summary
  pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
  pdf.roundedRect(margin, yPos, contentWidth, 12, 2, 2, 'F');
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('EXECUTIVE SUMMARY', margin + 5, yPos + 7.5);
  
  yPos += 17;
  
  // Metrics Grid
  const gap = 5;
  const boxWidth = (contentWidth - 2 * gap) / 3;
  
  // Score
  pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(margin, yPos, boxWidth, 25, 2, 2, 'FD');
  
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.setFontSize(9);
  pdf.text('EFFICIENCY SCORE', margin + boxWidth / 2, yPos + 6, { align: 'center' });
  
  const scoreColor = result.efficiency_score >= 75 ? COLORS.GREEN : 
                     result.efficiency_score >= 50 ? { r: 245, g: 158, b: 11 } : COLORS.RED;
  pdf.setTextColor(scoreColor.r, scoreColor.g, scoreColor.b);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${result.efficiency_score}`, margin + boxWidth / 2, yPos + 18, { align: 'center' });
  
  // Zaps
  pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
  pdf.roundedRect(margin + boxWidth + gap, yPos, boxWidth, 25, 2, 2, 'FD');
  
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text('ZAPS ANALYZED', margin + boxWidth + gap + boxWidth / 2, yPos + 6, { align: 'center' });
  
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${result.zap_count}`, margin + boxWidth + gap + boxWidth / 2, yPos + 18, { align: 'center' });
  
  // Steps
  pdf.setFillColor(COLORS.SLATE_50.r, COLORS.SLATE_50.g, COLORS.SLATE_50.b);
  pdf.roundedRect(margin + 2 * (boxWidth + gap), yPos, boxWidth, 25, 2, 2, 'FD');
  
  pdf.setTextColor(COLORS.SLATE_600.r, COLORS.SLATE_600.g, COLORS.SLATE_600.b);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text('TOTAL STEPS', margin + 2 * (boxWidth + gap) + boxWidth / 2, yPos + 6, { align: 'center' });
  
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${result.total_nodes}`, margin + 2 * (boxWidth + gap) + boxWidth / 2, yPos + 18, { align: 'center' });
  
  yPos += 32;
  
  // NEW SECTIONS
  checkPageBreak(60);
  yPos = addDataConfidence(pdf, yPos, margin, contentWidth, result);
  yPos = addBeforeAfterComparison(pdf, yPos, margin, contentWidth, result);
  yPos = addQuickWins(pdf, yPos, margin, contentWidth, result);
  
  // Savings
  if (result.estimated_savings > 0) {
    checkPageBreak(35);
    
    pdf.setFillColor(209, 250, 229);
    pdf.setDrawColor(110, 231, 183);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(margin, yPos, contentWidth, 32, 2, 2, 'FD');
    
    pdf.setTextColor(COLORS.GREEN.r, COLORS.GREEN.g, COLORS.GREEN.b);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ESTIMATED ANNUAL SAVINGS', margin + 5, yPos + 8);
    
    pdf.setFontSize(28);
    pdf.text(`$${(result.estimated_savings * 12).toFixed(0)}`, margin + 5, yPos + 22);
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Monthly: $${result.estimated_savings.toFixed(0)}`, margin + 5, yPos + 28);
    
    yPos += 38;
  }
  
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
