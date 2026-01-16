// PDF Generator Module for Zapier Lighthouse
// Modular, maintainable PDF report generation

import jsPDF from 'jspdf';
import { sanitizeForPDF, drawDebugGrid } from './pdfHelpers';

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
// MAIN ORCHESTRATOR FUNCTION
// ========================================

export async function generatePDFReport(result: ParseResult, config: PDFConfig): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  
  pdf.setCharSpace(0);
  
  let yPos = margin;
  
  // Helper function for page breaks
  const checkPageBreak = (requiredSpace: number): boolean => {
    if (yPos + requiredSpace > pageHeight - margin) {
      pdf.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };
  
  // Header with white-label branding
  renderHeader(pdf, config, pageWidth);
  yPos = 60;
  
  // Client information
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.text(`Client: ${config.clientName}`, margin, yPos);
  pdf.text(`Report Date: ${config.reportDate}`, pageWidth - margin, yPos, { align: 'right' });
  yPos += 15;
  
  // Executive Summary
  yPos = renderExecutiveSummary(pdf, result, margin, contentWidth, pageWidth, yPos);
  
  // Reliability Section (if applicable)
  const reliabilityFlags = result.efficiency_flags.filter(f => f.flag_type === 'error_loop');
  if (reliabilityFlags.length > 0) {
    yPos = renderReliabilitySection(pdf, reliabilityFlags, margin, contentWidth, pageWidth, pageHeight, yPos, checkPageBreak);
  }
  
  // Efficiency Findings Section
  const efficiencyFlags = result.efficiency_flags.filter(f => f.flag_type !== 'error_loop');
  if (efficiencyFlags.length > 0) {
    yPos = renderEfficiencySection(pdf, efficiencyFlags, margin, contentWidth, pageWidth, pageHeight, yPos, checkPageBreak);
  }
  
  // No findings case
  if (result.efficiency_flags.length === 0) {
    checkPageBreak(20);
    pdf.setFillColor(241, 245, 249);
    pdf.rect(margin - 5, yPos - 5, contentWidth + 10, 12, 'F');
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('DETAILED FINDINGS', margin, yPos + 5);
    yPos += 20;
    pdf.setTextColor(16, 185, 129);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(sanitizeForPDF('No efficiency issues detected. Your Zaps are highly optimized!'), margin, yPos);
    yPos += 15;
  }
  
  // App Inventory
  yPos = renderAppInventory(pdf, result.apps, margin, contentWidth, pageWidth, pageHeight, yPos, checkPageBreak);
  
  // Footer on all pages
  renderFooter(pdf, config, pageWidth, pageHeight, margin);
  
  // Debug grid (if enabled)
  const totalPages = pdf.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawDebugGrid(pdf, pageWidth, pageHeight);
  }
  
  // Save PDF
  pdf.save(`Zapier_Audit_Report_${config.clientName.replace(/\s+/g, '_')}_${config.reportDate}.pdf`);
}

// ========================================
// SECTION: HEADER
// ========================================

function renderHeader(pdf: jsPDF, config: PDFConfig, pageWidth: number): void {
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, pageWidth, 50, 'F');
  
  if (config.agencyLogo) {
    try {
      pdf.addImage(config.agencyLogo, 'PNG', 20, 10, 30, 30);
    } catch (e) {
      console.warn('Failed to add logo:', e);
    }
  }
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ZAPIER AUTOMATION AUDIT', pageWidth / 2, 25, { align: 'center' });
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Prepared by ${config.agencyName}`, pageWidth / 2, 35, { align: 'center' });
}

// ========================================
// SECTION: EXECUTIVE SUMMARY
// ========================================

function renderExecutiveSummary(
  pdf: jsPDF,
  result: ParseResult,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  yPos: number
): number {
  // Section Header
  pdf.setFillColor(241, 245, 249);
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(margin, yPos, contentWidth, 15, 3, 3, 'FD');
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('EXECUTIVE SUMMARY', margin + 5, yPos + 10);
  yPos += 20;
  
  // Key Metrics Grid
  const metricBoxWidth = contentWidth / 3 - 5;
  
  // Efficiency Score Box
  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(margin, yPos, metricBoxWidth, 30, 3, 3, 'F');
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.text('EFFICIENCY SCORE', margin + metricBoxWidth / 2, yPos + 8, { align: 'center' });
  
  const scoreColor: [number, number, number] = result.efficiency_score >= 75 ? [16, 185, 129] : 
                     result.efficiency_score >= 50 ? [245, 158, 11] : [239, 68, 68];
  pdf.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${result.efficiency_score}`, margin + metricBoxWidth / 2, yPos + 22, { align: 'center' });
  pdf.setFontSize(10);
  pdf.text('/100', margin + metricBoxWidth / 2 + 10, yPos + 22);
  
  // Zaps Analyzed Box
  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(margin + metricBoxWidth + 5, yPos, metricBoxWidth, 30, 3, 3, 'F');
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('ZAPS ANALYZED', margin + metricBoxWidth + 5 + metricBoxWidth / 2, yPos + 8, { align: 'center' });
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${result.zap_count}`, margin + metricBoxWidth + 5 + metricBoxWidth / 2, yPos + 22, { align: 'center' });
  
  // Total Steps Box
  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(margin + 2 * (metricBoxWidth + 5), yPos, metricBoxWidth, 30, 3, 3, 'F');
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('TOTAL STEPS', margin + 2 * (metricBoxWidth + 5) + metricBoxWidth / 2, yPos + 8, { align: 'center' });
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${result.total_nodes}`, margin + 2 * (metricBoxWidth + 5) + metricBoxWidth / 2, yPos + 22, { align: 'center' });
  
  yPos += 45;
  
  // Estimated Savings Highlight
  if (result.estimated_savings > 0) {
    pdf.setFillColor(16, 185, 129);
    pdf.roundedRect(margin, yPos, contentWidth, 35, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ESTIMATED ANNUAL SAVINGS', margin + 5, yPos + 10);
    pdf.setFontSize(32);
    pdf.text(`$${(result.estimated_savings * 12).toFixed(0)}`, margin + 5, yPos + 25);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      `Monthly: $${result.estimated_savings.toFixed(0)} - Based on optimizing all detected issues`,
      margin + 5,
      yPos + 32
    );
    yPos += 45;
  }
  
  return yPos;
}

// ========================================
// SECTION: RELIABILITY (Error Loop Flags)
// ========================================

function renderReliabilitySection(
  pdf: jsPDF,
  flags: ParseResult['efficiency_flags'],
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number,
  yPos: number,
  checkPageBreak: (space: number) => boolean
): number {
  checkPageBreak(20);
  
  // Section Header
  pdf.setFillColor(254, 202, 202);
  pdf.setDrawColor(220, 38, 38);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(margin, yPos, contentWidth, 15, 3, 3, 'FD');
  pdf.setTextColor(220, 38, 38);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('[!] RELIABILITY CONCERNS', margin + 5, yPos + 10);
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    `${flags.length} Zap${flags.length > 1 ? 's' : ''} with high error rates`,
    pageWidth - margin - 5,
    yPos + 10,
    { align: 'right' }
  );
  yPos += 20;
  
  // Render each flag
  flags.forEach((flag, index) => {
    yPos = renderFlagCard(pdf, flag, index, margin, contentWidth, pageWidth, pageHeight, yPos, checkPageBreak);
  });
  
  yPos += 5;
  return yPos;
}

// ========================================
// SECTION: EFFICIENCY FINDINGS
// ========================================

function renderEfficiencySection(
  pdf: jsPDF,
  flags: ParseResult['efficiency_flags'],
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number,
  yPos: number,
  checkPageBreak: (space: number) => boolean
): number {
  checkPageBreak(20);
  
  // Section Header
  pdf.setFillColor(241, 245, 249);
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(margin, yPos, contentWidth, 15, 3, 3, 'FD');
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('EFFICIENCY FINDINGS', margin + 5, yPos + 10);
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    `${flags.length} optimization ${flags.length === 1 ? 'opportunity' : 'opportunities'}`,
    pageWidth - margin - 5,
    yPos + 10,
    { align: 'right' }
  );
  yPos += 20;
  
  // Render each flag
  flags.forEach((flag, index) => {
    yPos = renderFlagCard(pdf, flag, index, margin, contentWidth, pageWidth, pageHeight, yPos, checkPageBreak);
  });
  
  yPos += 5;
  return yPos;
}

// ========================================
// HELPER: RENDER FLAG CARD (Modular)
// ========================================

function renderFlagCard(
  pdf: jsPDF,
  flag: ParseResult['efficiency_flags'][0],
  index: number,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number,
  yPos: number,
  checkPageBreak: (space: number) => boolean
): number {
  // Check page break
  checkPageBreak(80);
  
  const boxStartY = yPos;
  const boxPadding = 5;
  
  // Reset graphics state
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setCharSpace(0);
  pdf.setTextColor(0, 0, 0);
  
  let contentY = yPos + 15;
  
  // Measure all content heights
  const messageHeight = pdf.getTextDimensions(sanitizeForPDF(flag.message), {
    maxWidth: contentWidth - 20
  }).h;
  
  const detailsHeight = pdf.getTextDimensions(sanitizeForPDF(flag.details), {
    maxWidth: contentWidth - 20
  }).h;
  
  let savingsHeight = 0;
  if (flag.estimated_monthly_savings > 0) {
    const explanationLines = pdf.splitTextToSize(sanitizeForPDF(flag.savings_explanation), contentWidth - 25);
    savingsHeight = 4 + (explanationLines.length * 3) + 3;
  }
  
  let analyticsHeight = 0;
  if (flag.error_trend || flag.most_common_error || (flag.max_streak && flag.max_streak > 0)) {
    analyticsHeight = 15; // Base analytics section height
    if (flag.most_common_error) {
      const errorHeight = pdf.getTextDimensions(sanitizeForPDF(flag.most_common_error), {
        maxWidth: contentWidth - 40
      }).h;
      analyticsHeight += errorHeight;
    }
  }
  
  // Calculate total box height
  const actualHeight = 15 + messageHeight + 2 + detailsHeight + 5 + savingsHeight + analyticsHeight + boxPadding;
  
  // Draw box
  const flagColor: [number, number, number] = flag.severity === 'high' ? [254, 202, 202] :
                      flag.severity === 'medium' ? [254, 243, 199] : [219, 234, 254];
  pdf.setFillColor(flagColor[0], flagColor[1], flagColor[2]);
  pdf.setDrawColor(flagColor[0] - 30, flagColor[1] - 30, flagColor[2] - 30);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(margin, boxStartY, contentWidth, actualHeight, 2, 2, 'FD');
  
  // Draw badge
  const badgeColor: [number, number, number] = flag.severity === 'high' ? [220, 38, 38] :
                        flag.severity === 'medium' ? [217, 119, 6] : [37, 99, 235];
  pdf.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
  pdf.roundedRect(margin + 3, boxStartY + 3, 20, 6, 1, 1, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text(flag.severity.toUpperCase(), margin + 13, boxStartY + 7, { align: 'center' });
  
  // Draw title
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text(sanitizeForPDF(`${index + 1}. ${flag.zap_title}`), margin + 26, boxStartY + 7);
  
  // Draw content
  contentY = boxStartY + 15;
  
  // Message
  pdf.setTextColor(51, 65, 85);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setCharSpace(0);
  pdf.text(sanitizeForPDF(flag.message), margin + 8, contentY, { maxWidth: contentWidth - 20 });
  contentY += messageHeight + 2;
  
  // Details
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  pdf.text(sanitizeForPDF(flag.details), margin + 8, contentY, { maxWidth: contentWidth - 20 });
  contentY += detailsHeight + 5;
  
  // Savings
  if (flag.estimated_monthly_savings > 0) {
    pdf.setFillColor(16, 185, 129);
    pdf.roundedRect(margin + 8, contentY - 2.5, 3, 3, 0.5, 0.5, 'F');
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Est. savings: ', margin + 13, contentY);
    
    const savingsLabel = 'Est. savings: ';
    const savingsLabelWidth = pdf.getTextWidth(savingsLabel);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`$${flag.estimated_monthly_savings.toFixed(2)}/month`, margin + 13 + savingsLabelWidth, contentY);
    contentY += 4;
    
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 100, 100);
    const explanationLines = pdf.splitTextToSize(sanitizeForPDF(flag.savings_explanation), contentWidth - 25);
    pdf.text(explanationLines, margin + 13, contentY);
    contentY += (explanationLines.length * 3) + 3;
  }
  
  // Error Analytics (2-column layout)
  if (flag.error_trend || flag.most_common_error || (flag.max_streak && flag.max_streak > 0)) {
    pdf.setDrawColor(203, 213, 225);
    pdf.line(margin + 8, contentY - 2, pageWidth - margin - 8, contentY - 2);
    contentY += 3;
    
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text('ERROR ANALYTICS:', margin + 8, contentY);
    contentY += 5;
    
    // Two-column layout
    const col1X = margin + 10;
    const col2X = margin + contentWidth / 2;
    const analyticsY = contentY;
    
    // Column 1: Trend
    if (flag.error_trend) {
      const trendText = 'Trend: ';
      let trendValue = '';
      let trendColor: [number, number, number] = [71, 85, 105];
      
      if (flag.error_trend === 'increasing') {
        trendValue = 'DETERIORATING';
        trendColor = [220, 38, 38];
      } else if (flag.error_trend === 'decreasing') {
        trendValue = 'IMPROVING';
        trendColor = [22, 163, 74];
      } else {
        trendValue = 'Stable';
      }
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(71, 85, 105);
      pdf.text(trendText, col1X, analyticsY);
      
      const trendLabelWidth = pdf.getTextWidth(trendText);
      pdf.setTextColor(trendColor[0], trendColor[1], trendColor[2]);
      pdf.setFont('helvetica', 'bold');
      pdf.text(trendValue, col1X + trendLabelWidth, analyticsY);
    }
    
    // Column 2: Max Streak
    if (flag.max_streak && flag.max_streak > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(71, 85, 105);
      pdf.text('Max failures: ', col2X, analyticsY);
      
      const streakLabel = 'Max failures: ';
      const streakLabelWidth = pdf.getTextWidth(streakLabel);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${flag.max_streak}`, col2X + streakLabelWidth, analyticsY);
    }
    
    contentY = analyticsY + 4;
    
    // Most Common Error
    if (flag.most_common_error) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(71, 85, 105);
      const errorPrefix = 'Most common error: ';
      pdf.text(errorPrefix, margin + 10, contentY);
      
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(107, 114, 128);
      pdf.setCharSpace(0);
      pdf.text(
        sanitizeForPDF(flag.most_common_error),
        margin + 10 + pdf.getTextWidth(errorPrefix),
        contentY,
        { maxWidth: contentWidth - 20 - pdf.getTextWidth(errorPrefix) }
      );
      
      const errorHeight = pdf.getTextDimensions(sanitizeForPDF(flag.most_common_error), {
        maxWidth: contentWidth - 20 - pdf.getTextWidth(errorPrefix)
      }).h;
      contentY += errorHeight;
    }
  }
  
  return boxStartY + actualHeight + 5;
}

// ========================================
// SECTION: APP INVENTORY
// ========================================

function renderAppInventory(
  pdf: jsPDF,
  apps: ParseResult['apps'],
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number,
  yPos: number,
  checkPageBreak: (space: number) => boolean
): number {
  checkPageBreak(20);
  
  if (yPos > pageHeight - 100 && apps.length > 5) {
    pdf.addPage();
    yPos = margin;
  }
  
  // Section Header
  pdf.setFillColor(241, 245, 249);
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(margin, yPos, contentWidth, 15, 3, 3, 'FD');
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('APP INVENTORY', margin + 5, yPos + 10);
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    `${apps.length} unique applications detected`,
    pageWidth - margin - 5,
    yPos + 10,
    { align: 'right' }
  );
  yPos += 20;
  
  // Render apps
  if (apps.length > 15) {
    // Multi-column layout
    const numColumns = apps.length > 30 ? 3 : 2;
    const columnWidth = contentWidth / numColumns - 5;
    const itemHeight = 7;
    let currentColumn = 0;
    
    apps.forEach((app, index) => {
      if (yPos + itemHeight > pageHeight - margin) {
        pdf.addPage();
        yPos = margin;
        currentColumn = 0;
      }
      
      const xPos = margin + currentColumn * (columnWidth + 5);
      
      if (index % 2 === 0) {
        pdf.setFillColor(249, 250, 251);
        pdf.rect(xPos - 2, yPos - 2, columnWidth + 4, itemHeight, 'F');
      }
      
      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      const truncatedName = app.name.length > 25 ? app.name.substring(0, 22) + '...' : app.name;
      pdf.text(truncatedName, xPos, yPos + 4);
      
      pdf.setTextColor(148, 163, 184);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(`${app.count}x`, xPos + columnWidth - 2, yPos + 4, { align: 'right' });
      
      currentColumn++;
      if (currentColumn >= numColumns) {
        currentColumn = 0;
        yPos += itemHeight;
      }
    });
    
    if (currentColumn > 0) {
      yPos += itemHeight;
    }
  } else {
    // Single column layout
    apps.forEach((app, index) => {
      checkPageBreak(10);
      
      if (index % 2 === 0) {
        pdf.setFillColor(249, 250, 251);
        pdf.rect(margin - 2, yPos - 3, contentWidth + 4, 8, 'F');
      }
      
      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(app.name, margin, yPos);
      
      pdf.setTextColor(148, 163, 184);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${app.count} ${app.count === 1 ? 'use' : 'uses'}`, pageWidth - margin, yPos, { align: 'right' });
      
      yPos += 8;
    });
  }
  
  return yPos;
}

// ========================================
// SECTION: FOOTER
// ========================================

function renderFooter(
  pdf: jsPDF,
  config: PDFConfig,
  pageWidth: number,
  pageHeight: number,
  margin: number
): void {
  const totalPages = pdf.internal.pages.length - 1;
  
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      `Generated by Zapier Lighthouse | ${config.agencyName}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
    pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    pdf.text('Confidential', margin, pageHeight - 10);
  }
}
