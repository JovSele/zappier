// PDF Generator Module for Zapier Lighthouse
// Complete functional PDF report generation

import jsPDF from 'jspdf';
import { drawDebugGrid, sanitizeForPDF } from './pdfHelpers';

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface PDFConfig {
  agencyName: string;
  agencyLogo?: string; // Base64 or URL
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
    // Enhanced error analytics (available for error_loop flags)
    most_common_error?: string;
    error_trend?: string; // "increasing", "stable", "decreasing"
    max_streak?: number;
    // Dynamic savings calculation
    estimated_monthly_savings: number; // in USD
    savings_explanation: string; // How savings were calculated
    is_fallback: boolean; // true = estimated/fallback, false = actual data
  }>;
  efficiency_score: number;
  estimated_savings: number;
}

// ========================================
// CHART GENERATION HELPERS (Canvas API)
// Professional, brand-consistent visualizations
// ========================================

// Brand Colors (consistent across all charts)
const COLORS = {
  SUCCESS: '#10b981',    // Emerald 500
  ERROR: '#ef4444',      // Red 500
  TEXT_PRIMARY: '#1f2937', // Gray 900
  TEXT_SECONDARY: '#475569', // Slate 600
  BACKGROUND: '#ffffff'
};

// Typography (consistent font family and sizes)
const FONTS = {
  TITLE: 'bold 28px Helvetica, sans-serif',
  SUBTITLE: '13px Helvetica, sans-serif',
  LABEL: 'bold 13px Helvetica, sans-serif',
  VALUE: 'bold 16px Helvetica, sans-serif'
};

function createDoughnutChart(successCount: number, errorCount: number): string {
  // UNIFIED DIMENSIONS: 400x300 (same height as bar chart)
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext('2d')!;
  
  const total = successCount + errorCount;
  if (total === 0) return ''; // No data
  
  // Chart positioning (centered)
  const centerX = 200;
  const centerY = 120;
  const outerRadius = 85;
  const innerRadius = 60; // Elegant thickness (25px ring)
  
  // Calculate angles
  const successAngle = (successCount / total) * 2 * Math.PI;
  
  // Draw success arc
  ctx.beginPath();
  ctx.arc(centerX, centerY, outerRadius, -Math.PI / 2, -Math.PI / 2 + successAngle);
  ctx.arc(centerX, centerY, innerRadius, -Math.PI / 2 + successAngle, -Math.PI / 2, true);
  ctx.closePath();
  ctx.fillStyle = COLORS.SUCCESS;
  ctx.fill();
  
  // Draw error arc
  ctx.beginPath();
  ctx.arc(centerX, centerY, outerRadius, -Math.PI / 2 + successAngle, -Math.PI / 2 + 2 * Math.PI);
  ctx.arc(centerX, centerY, innerRadius, -Math.PI / 2 + 2 * Math.PI, -Math.PI / 2 + successAngle, true);
  ctx.closePath();
  ctx.fillStyle = COLORS.ERROR;
  ctx.fill();
  
  // Center text - percentage (unified typography)
  const errorRate = ((errorCount / total) * 100).toFixed(1);
  ctx.fillStyle = COLORS.TEXT_PRIMARY;
  ctx.font = FONTS.TITLE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${errorRate}%`, centerX, centerY - 8);
  
  // Subtitle
  ctx.font = FONTS.SUBTITLE;
  ctx.fillStyle = COLORS.TEXT_SECONDARY;
  ctx.fillText('Error Rate', centerX, centerY + 12);
  
  // UNIFIED LEGEND (same style for both charts)
  const legendY = 250;
  const legendBoxSize = 12;
  const legendGap = 140;
  
  // Success legend
  ctx.fillStyle = COLORS.SUCCESS;
  ctx.fillRect(50, legendY, legendBoxSize, legendBoxSize);
  ctx.fillStyle = COLORS.TEXT_SECONDARY;
  ctx.font = FONTS.LABEL;
  ctx.textAlign = 'left';
  ctx.fillText(`Success: ${successCount}`, 68, legendY + 10);
  
  // Error legend
  ctx.fillStyle = COLORS.ERROR;
  ctx.fillRect(50 + legendGap, legendY, legendBoxSize, legendBoxSize);
  ctx.fillStyle = COLORS.TEXT_SECONDARY;
  ctx.fillText(`Errors: ${errorCount}`, 68 + legendGap, legendY + 10);
  
  return canvas.toDataURL('image/png');
}

function createSavingsBarChart(currentCost: number, optimizedCost: number): string {
  // UNIFIED DIMENSIONS: 400x300 (same height as doughnut)
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext('2d')!;
  
  // Chart dimensions (aligned with doughnut chart)
  const maxValue = Math.max(currentCost, optimizedCost);
  const barWidth = 70;
  const maxBarHeight = 140;
  const baseY = 210;
  
  // Calculate bar heights
  const currentBarHeight = (currentCost / maxValue) * maxBarHeight;
  const optimizedBarHeight = (optimizedCost / maxValue) * maxBarHeight;
  
  // Bar positions (centered)
  const bar1X = 110;
  const bar2X = 220;
  
  // Draw current cost bar
  ctx.fillStyle = COLORS.ERROR;
  ctx.fillRect(bar1X, baseY - currentBarHeight, barWidth, currentBarHeight);
  
  // Draw optimized cost bar
  ctx.fillStyle = COLORS.SUCCESS;
  ctx.fillRect(bar2X, baseY - optimizedBarHeight, barWidth, optimizedBarHeight);
  
  // UNIFIED TYPOGRAPHY
  ctx.textAlign = 'center';
  
  // Current cost value (above bar)
  ctx.fillStyle = COLORS.TEXT_PRIMARY;
  ctx.font = FONTS.VALUE;
  ctx.fillText(`$${currentCost.toFixed(0)}`, bar1X + barWidth / 2, baseY - currentBarHeight - 12);
  
  // Current cost label (below bar)
  ctx.fillStyle = COLORS.TEXT_SECONDARY;
  ctx.font = FONTS.LABEL;
  ctx.fillText('Current', bar1X + barWidth / 2, baseY + 20);
  
  // Optimized cost value (above bar)
  ctx.fillStyle = COLORS.TEXT_PRIMARY;
  ctx.font = FONTS.VALUE;
  ctx.fillText(`$${optimizedCost.toFixed(0)}`, bar2X + barWidth / 2, baseY - optimizedBarHeight - 12);
  
  // Optimized cost label (below bar)
  ctx.fillStyle = COLORS.TEXT_SECONDARY;
  ctx.font = FONTS.LABEL;
  ctx.fillText('Optimized', bar2X + barWidth / 2, baseY + 20);
  
  // Savings indicator (unified legend position)
  const savings = currentCost - optimizedCost;
  ctx.fillStyle = COLORS.SUCCESS;
  ctx.font = FONTS.VALUE;
  ctx.fillText(`Save $${savings.toFixed(0)}/year`, 200, 260);
  
  return canvas.toDataURL('image/png');
}

// ========================================
// MAIN PDF GENERATION FUNCTION
// ========================================

export async function generatePDFReport(result: ParseResult, config: PDFConfig) {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  
  pdf.setCharSpace(0);

  let yPos = margin;
  
  // Extract Zap info (for single Zap audits)
  const zapTitle = result.efficiency_flags.length > 0 
    ? result.efficiency_flags[0].zap_title 
    : result.zap_count === 1 ? 'Single Zap Audit' : 'Multi-Zap Audit';
  const zapId = result.efficiency_flags.length > 0 
    ? result.efficiency_flags[0].zap_id 
    : null;
  
  // Helper function to add a new page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (yPos + requiredSpace > pageHeight - margin) {
      pdf.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };
  
  // Header with white-label branding
  pdf.setFillColor(15, 23, 42); // slate-900
  pdf.rect(0, 0, pageWidth, 50, 'F');
  
  if (config.agencyLogo) {
    // Add agency logo (if provided)
    try {
      pdf.addImage(config.agencyLogo, 'PNG', margin, 10, 30, 30);
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
  
  yPos = 60;
  
  // ZAP IDENTIFICATION (for single Zap audits)
  if (result.zap_count === 1 && zapTitle !== 'Multi-Zap Audit') {
    pdf.setFillColor(241, 245, 249); // slate-100
    pdf.roundedRect(margin, yPos, contentWidth, 20, 2, 2, 'F');
    
    pdf.setTextColor(15, 23, 42); // slate-900
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Zap: ${zapTitle}`, margin + 5, yPos + 10);
    
    if (zapId) {
      pdf.setTextColor(100, 116, 139); // slate-500
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`ID: ${zapId}`, margin + 5, yPos + 16);
    }
    
    yPos += 25;
  }
  
  // Client information
  pdf.setTextColor(71, 85, 105); // slate-600
  pdf.setFontSize(10);
  pdf.text(`Client: ${config.clientName}`, margin, yPos);
  pdf.text(`Report Date: ${config.reportDate}`, pageWidth - margin, yPos, { align: 'right' });
  
  yPos += 15;
  
  // Executive Summary Section
  pdf.setFillColor(219, 234, 254); // ✅ #DBEAFE 
  pdf.setDrawColor(147, 197, 253); // ✅ #93C5FD 
  pdf.setLineWidth(0.1);
  pdf.roundedRect(margin, yPos, contentWidth, 15, 2, 2, 'FD');
    
  pdf.setTextColor(37, 99, 235);   // ✅ #2563EB
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('EXECUTIVE SUMMARY', margin + 5, yPos + 9.5);
  
  yPos += 20;
  
  // Key Metrics Grid
  const gap = 5;
  const metricBoxWidth = (contentWidth - 2 * gap) / 3;
  
  // Efficiency Score Box
  pdf.setFillColor(241, 245, 249);
  pdf.setDrawColor(200, 200, 200);  
  pdf.setLineWidth(0.1);   
  pdf.roundedRect(margin, yPos, metricBoxWidth, 30, 2, 2, 'FD');
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
  
  // Zaps Found Box
  pdf.setFillColor(241, 245, 249);
  pdf.setDrawColor(200, 200, 200);  
  pdf.setLineWidth(0.1);   
  pdf.roundedRect(margin + metricBoxWidth + gap, yPos, metricBoxWidth, 30, 2, 2, 'FD');
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('ZAPS ANALYZED', margin + metricBoxWidth + gap + metricBoxWidth / 2, yPos + 8, { align: 'center' });
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${result.zap_count}`, margin + metricBoxWidth + 5 + metricBoxWidth / 2, yPos + 22, { align: 'center' });
  
  // Total Steps Box
  pdf.setFillColor(241, 245, 249);
  pdf.setDrawColor(200, 200, 200);  
  pdf.setLineWidth(0.1);            
  pdf.roundedRect(margin + 2 * (metricBoxWidth + gap), yPos, metricBoxWidth, 30, 2, 2, 'FD');
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('TOTAL STEPS', margin + 2 * (metricBoxWidth + gap) + metricBoxWidth / 2, yPos + 8, { align: 'center' });
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${result.total_nodes}`, margin + 2 * (metricBoxWidth + 5) + metricBoxWidth / 2, yPos + 22, { align: 'center' });
  
  yPos += 40;
  
  // VISUAL CHARTS SECTION (if applicable data exists)
  const reliabilityFlags = result.efficiency_flags.filter(f => f.flag_type === 'error_loop');
  const hasCharts = reliabilityFlags.length > 0 || result.estimated_savings > 0;
  
  if (hasCharts) {
    checkPageBreak(60);
    
    // Calculate total runs and errors for reliability chart
    let totalRuns = 0;
    let totalErrors = 0;
    
    reliabilityFlags.forEach(flag => {
      // Extract run counts from flag details if available
      // This is a simplified extraction - in real scenario, we'd pass this data explicitly
      const match = flag.details.match(/(\d+) errors out of (\d+) total runs/);
      if (match) {
        totalErrors += parseInt(match[1]);
        totalRuns += parseInt(match[2]);
      }
    });
    
    const totalSuccess = totalRuns - totalErrors;
    const currentAnnualCost = result.estimated_savings * 12;
    const optimizedAnnualCost = 0; // After optimization
    
    // Layout: Two charts side by side
    const chartWidth = (contentWidth - 10) / 2;
    
    // Left: Reliability Gauge (if error data exists)
    if (reliabilityFlags.length > 0 && totalRuns > 0) {
      try {
        const reliabilityChart = createDoughnutChart(totalSuccess, totalErrors);
        if (reliabilityChart) {
          pdf.addImage(reliabilityChart, 'PNG', margin, yPos, chartWidth, chartWidth * 0.75);
        }
      } catch (e) {
        console.warn('Failed to generate reliability chart:', e);
      }
    }
    
    // Right: Savings Bar Chart (if savings exist)
    if (result.estimated_savings > 0) {
      try {
        const savingsChart = createSavingsBarChart(currentAnnualCost, optimizedAnnualCost);
        if (savingsChart) {
          const rightX = margin + chartWidth + 10;
          pdf.addImage(savingsChart, 'PNG', rightX, yPos, chartWidth, chartWidth * 0.625);
        }
      } catch (e) {
        console.warn('Failed to generate savings chart:', e);
      }
    }
    
    yPos += (reliabilityFlags.length > 0 ? chartWidth * 0.75 : chartWidth * 0.625) + 10;
  }
  
  // Estimated Savings Highlight (if applicable)
  if (result.estimated_savings > 0) {
    checkPageBreak(40);
    
    pdf.setFillColor(209, 250, 229); 
    pdf.setDrawColor(110, 231, 183); 
    pdf.setLineWidth(0.1);            
    pdf.roundedRect(margin, yPos, contentWidth, 40, 2, 2, 'FD');
    
    pdf.setTextColor(5, 150, 105);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ESTIMATED ANNUAL SAVINGS', margin + 5, yPos + 9.5);
    
    pdf.setFontSize(32);
    pdf.text(`$${(result.estimated_savings * 12).toFixed(0)}`, margin + 5, yPos + 25);
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Monthly: $${result.estimated_savings.toFixed(0)} - Based on optimizing all detected issues`,
             margin + 5, yPos + 32);
    
    yPos += 50;
  }
  
  // Reliability Section (if error_loop flags exist)
  if (reliabilityFlags.length > 0) {
    checkPageBreak(20);
    
    pdf.setFillColor(254, 226, 226); 
    pdf.setDrawColor(252, 165, 165); 
    pdf.setLineWidth(0.1);
    pdf.roundedRect(margin, yPos, contentWidth, 15, 2, 2, 'FD');
    
    pdf.setTextColor(220, 38, 38); 
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('[!] RELIABILITY CONCERNS', margin + 5, yPos + 9.5);
    
    pdf.setTextColor(71, 85, 105);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${reliabilityFlags.length} Zap${reliabilityFlags.length > 1 ? 's' : ''} with high error rates`, 
            pageWidth - margin - 5, yPos + 10, { align: 'right' });
    
    yPos += 20;
    
    reliabilityFlags.forEach((flag, index) => {
      // ✅ KOMPLETNÝ RESET na začiatku každého flagu
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setCharSpace(0);
      pdf.setTextColor(0, 0, 0);

    // 🔍 DEBUG - vypiš do console
      console.log('Flag details:', flag.details);
      console.log('Flag details length:', flag.details.length);
      console.log('Has extra spaces?', flag.details.includes('  '));

      // Calculate dynamic height based on content
      let estimatedHeight = 50;
      
      // Add extra space for enhanced analytics if present
      if (flag.error_trend || flag.most_common_error || (flag.max_streak && flag.max_streak > 0)) {
        estimatedHeight += 20;

        if (flag.most_common_error && flag.most_common_error.length > 50) {
          estimatedHeight += 10;
        }
      }
      
      // Auto-paging: check if we need a new page
      checkPageBreak(estimatedHeight);
      
      // Flag box - dynamic height
      const flagColor: [number, number, number] = flag.severity === 'high' ? [254, 226, 226] : 
                      flag.severity === 'medium' ? [254, 243, 199] : [219, 234, 254];

      const borderColor: [number, number, number] = flag.severity === 'high' ? [252, 165, 165] : 
                        flag.severity === 'medium' ? [252, 211, 77] : [147, 197, 253];

      pdf.setFillColor(flagColor[0], flagColor[1], flagColor[2]);
      pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]); 
      pdf.setLineWidth(0.1);                                              
      pdf.roundedRect(margin, yPos, contentWidth, estimatedHeight, 2, 2, 'FD'); 
      
      // Severity badge
      const badgeColor: [number, number, number] = flag.severity === 'high' ? [220, 38, 38] : [217, 119, 6];
      pdf.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
      pdf.roundedRect(margin + 3, yPos + 3, 20, 6, 1, 1, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.text(flag.severity.toUpperCase(), margin + 13, yPos + 7, { align: 'center' });
      
      // Flag title
      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${index + 1}. ${flag.zap_title}`, margin + 26, yPos + 7);
      
      // Flag message
      pdf.setTextColor(51, 65, 85);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setCharSpace(0);
      let detailYPos = yPos + 15;
      pdf.text(sanitizeForPDF(flag.message), margin + 5, detailYPos, {
        maxWidth: contentWidth - 15
      });

      // Calculate how many lines the message took
      const messageHeight = pdf.getTextDimensions(sanitizeForPDF(flag.message), {
        maxWidth: contentWidth - 20
      }).h;
      detailYPos += messageHeight + 2;

      // Flag details
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);
      pdf.setCharSpace(0);
      pdf.text(sanitizeForPDF(flag.details), margin + 5, detailYPos, {
        maxWidth: contentWidth - 15
      });

      // Calculate how many lines the details took
      const detailsHeight = pdf.getTextDimensions(sanitizeForPDF(flag.details), {
        maxWidth: contentWidth - 20
      }).h;
      detailYPos += detailsHeight + 5;
            

      // Savings display (if available)
      if (flag.estimated_monthly_savings > 0) {
        pdf.setFillColor(16, 185, 129);
        pdf.roundedRect(margin + 5, detailYPos - 2.5, 3, 3, 0.5, 0.5, 'F');
        
        // ✅ BOLD pre "Est. savings:" + hodnotu
        pdf.setFontSize(8);
        pdf.setTextColor(107, 114, 128);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Est. savings: `, margin + 10, detailYPos);
        
        // ✅ BOLD pre číslo
        const labelWidth = pdf.getTextWidth('Est. savings: ');
        pdf.setFont('helvetica', 'bold');
        pdf.text(`$${flag.estimated_monthly_savings.toFixed(2)}/month`, margin + 10 + labelWidth, detailYPos);
        detailYPos += 4;
        
        // ✅ TMAVOSIVÝ text pre vysvetlivku
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100); // Tmavosivá
        const explanationLines = pdf.splitTextToSize(flag.savings_explanation, contentWidth - 25);
        pdf.text(explanationLines, margin + 10, detailYPos);
        detailYPos += (explanationLines.length * 3) + 3;
      }
      
      
      // Enhanced Analytics Section (only if data exists)
      if (flag.error_trend || flag.most_common_error || (flag.max_streak && flag.max_streak > 0)) {
        // Divider line
        pdf.setDrawColor(203, 213, 225);
        pdf.line(margin + 5, detailYPos - 2, pageWidth - margin - 5, detailYPos - 2);
        
        detailYPos += 3;
        
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(71, 85, 105);
        pdf.text('ERROR ANALYTICS:', margin + 5, detailYPos);
        
        detailYPos += 5;
        
        // ✅ 2-STĹPCOVÝ LAYOUT - Trend a Max Streak vedľa seba
        const column1X = margin + 7;
        const column2X = margin + (contentWidth / 2);
        
        // Error Trend (ľavý stĺpec)
        if (flag.error_trend) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          
          let trendText = '';
          let trendColor: [number, number, number] = [71, 85, 105];
          
          if (flag.error_trend === 'increasing') {
            trendText = 'Trend: DETERIORATING';
            trendColor = [220, 38, 38];
          } else if (flag.error_trend === 'decreasing') {
            trendText = 'Trend: IMPROVING';
            trendColor = [22, 163, 74];
          } else {
            trendText = 'Trend: Stable';
          }
          
          pdf.setTextColor(trendColor[0], trendColor[1], trendColor[2]);
          pdf.setFont('helvetica', 'bold');
          pdf.text(trendText, column1X, detailYPos);
        }
        
        // Max Streak (pravý stĺpec)
        if (flag.max_streak && flag.max_streak > 0) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(71, 85, 105);
          
          // Label normal
          pdf.text('Max failures: ', column2X, detailYPos);
          
          // ✅ BOLD pre číslo
          const labelWidth = pdf.getTextWidth('Max failures: ');
          pdf.setFont('helvetica', 'bold');
          pdf.text(`${flag.max_streak}`, column2X + labelWidth, detailYPos);
        }
        
        detailYPos += 4;
        
        // Most Common Error
        if (flag.most_common_error) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(71, 85, 105);
          const errorPrefix = 'Most common error: ';
          pdf.text(errorPrefix, margin + 7, detailYPos);
          
          // Error message in italic
          pdf.setFont('helvetica', 'italic');
          pdf.setTextColor(107, 114, 128);
          pdf.setCharSpace(0); // RESET
          pdf.text(flag.most_common_error, margin + 7 + pdf.getTextWidth(errorPrefix), detailYPos, {
            maxWidth: contentWidth - 20 - pdf.getTextWidth(errorPrefix)
          });
          
          // Calculate height
          const errorHeight = pdf.getTextDimensions(flag.most_common_error, {
            maxWidth: contentWidth - 20 - pdf.getTextWidth(errorPrefix)
          }).h;
          detailYPos += errorHeight;
        }
      }
      
      yPos += estimatedHeight + 5;
    });
    
    yPos += 5;
  }
  
  // Efficiency Findings Section
  const efficiencyFlags = result.efficiency_flags.filter(f => f.flag_type !== 'error_loop');
  if (efficiencyFlags.length > 0) {
    checkPageBreak(20);
    
    pdf.setFillColor(219, 234, 254); // ✅ #DBEAFE 
    pdf.setDrawColor(147, 197, 253); // ✅ #93C5FD 
    pdf.setLineWidth(0.1);
    pdf.roundedRect(margin, yPos, contentWidth, 15, 2, 2, 'FD');
    
    pdf.setTextColor(37, 99, 235); // ✅ #2563EB
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('EFFICIENCY FINDINGS', margin + 5, yPos + 9.5);
    
    pdf.setTextColor(71, 85, 105);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${efficiencyFlags.length} optimization ${efficiencyFlags.length === 1 ? 'opportunity' : 'opportunities'}`, pageWidth - margin - 5, yPos + 10, { align: 'right' });
    
    yPos += 20;
    
    efficiencyFlags.forEach((flag, index) => {
      // Auto-paging: dynamically check space needed
      let estimatedHeight = 30; // Base height
  
      // Add height for message
      const messageLines = Math.ceil(flag.message.length / 80);
      estimatedHeight += messageLines * 5;
      
      // Add height for details
      const detailLines = Math.ceil(flag.details.length / 80);
      estimatedHeight += detailLines * 4;
      
      // Add height for savings (if present)
      if (flag.estimated_monthly_savings > 0) {
        estimatedHeight += 15;
      }
      
      checkPageBreak(estimatedHeight);
      
      // Flag box 
      const flagColor: [number, number, number] = flag.severity === 'high' ? [254, 226, 226] : 
                flag.severity === 'medium' ? [254, 243, 199] : [219, 234, 254];

      const borderColor: [number, number, number] = flag.severity === 'high' ? [252, 165, 165] : 
                        flag.severity === 'medium' ? [252, 211, 77] : [147, 197, 253];

      pdf.setFillColor(flagColor[0], flagColor[1], flagColor[2]);
      pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]); // ✅ pridaný border
      pdf.setLineWidth(0.2);                                              // ✅ tenký okraj
      pdf.roundedRect(margin, yPos, contentWidth, estimatedHeight, 2, 2, 'FD'); // ✅ 'FD'

      // Severity badge - NOVÉ FARBY
      const badgeColor: [number, number, number] = flag.severity === 'high' ? [220, 38, 38] : 
                        flag.severity === 'medium' ? [217, 119, 6] : [37, 99, 235];
      pdf.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
      pdf.roundedRect(margin + 3, yPos + 3, 20, 6, 1, 1, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.text(flag.severity.toUpperCase(), margin + 13, yPos + 7, { align: 'center' });
      
      // Flag title
      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${index + 1}. ${flag.zap_title}`, margin + 26, yPos + 7);
      
      // Flag message
      pdf.setTextColor(51, 65, 85);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      let detailYPos = yPos + 15;
      pdf.setCharSpace(0);
      pdf.text(sanitizeForPDF(flag.message), margin + 5, detailYPos, {
        maxWidth: contentWidth - 15
      });

      // Calculate how many lines the message took
      const messageHeight = pdf.getTextDimensions(sanitizeForPDF(flag.message), {
        maxWidth: contentWidth - 20
      }).h;
      detailYPos += messageHeight + 2;

      // Flag details
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);
      pdf.setCharSpace(0);
      pdf.text(sanitizeForPDF(flag.details), margin + 5, detailYPos, {
        maxWidth: contentWidth - 15
      });

      // Calculate how many lines the details took
      const detailsHeight = pdf.getTextDimensions(sanitizeForPDF(flag.details), {
        maxWidth: contentWidth - 20
      }).h;
      detailYPos += detailsHeight + 5;
      
      // Savings display (if available)
      // Savings display (Efficiency Flags) – unified style
      if (flag.estimated_monthly_savings > 0) {
        pdf.setFillColor(16, 185, 129);
        pdf.roundedRect(margin + 5, detailYPos - 2.5, 3, 3, 0.5, 0.5, 'F');

        pdf.setFontSize(8);

        // Label
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        const label = 'Est. savings: ';
        pdf.text(label, margin + 10, detailYPos);

        // Value (BOLD)
        const labelWidth = pdf.getTextWidth(label);
        pdf.setFont('helvetica', 'bold');
        pdf.text(
          `$${flag.estimated_monthly_savings.toFixed(2)}/month`,
          margin + 10 + labelWidth,
          detailYPos
        );

        detailYPos += 4;

        // Explanation (tmavosivá, nie italic)
        if (flag.savings_explanation) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7);
          pdf.setTextColor(100, 100, 100);

          const explanationLines = pdf.splitTextToSize(
            flag.savings_explanation,
            contentWidth - 25
          );

          pdf.text(explanationLines, margin + 10, detailYPos);
          detailYPos += explanationLines.length * 3 + 2;
        }
      }

      
      yPos += estimatedHeight + 5;
    });
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
    pdf.text('✓ No efficiency issues detected. Your Zaps are highly optimized!', margin, yPos);
    yPos += 15;
  }
  
  // App Inventory Section with intelligent grid layout
  checkPageBreak(20);
  
  if (yPos > pageHeight - 100 && result.apps.length > 5) {
    pdf.addPage();
    yPos = margin;
  }
  
  pdf.setFillColor(219, 234, 254); // ✅ #DBEAFE 
  pdf.setDrawColor(147, 197, 253); // ✅ #93C5FD 
  pdf.setLineWidth(0.1);
  pdf.roundedRect(margin, yPos, contentWidth, 15, 2, 2, 'FD');

  pdf.setTextColor(37, 99, 235);   // ✅ #2563EB
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('APP INVENTORY', margin + 5, yPos + 9.5);

  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${result.apps.length} unique applications detected`, 
          pageWidth - margin - 5, yPos + 10, { align: 'right' });

  yPos += 20;
  
  // INTELLIGENT GRID LAYOUT: Use columns if many apps (better scalability)
  if (result.apps.length > 15) {
    // Multi-column grid layout for better space utilization
    const numColumns = result.apps.length > 30 ? 3 : 2;
    const gap = 4;  // ✅ medzera medzi stĺpcami
    const columnWidth = (contentWidth - gap * (numColumns - 1)) / numColumns;  // ✅ presný výpočet
    const itemHeight = 7;
    let currentColumn = 0;
    
    result.apps.forEach((app, index) => {
      // Check if we need a new page
      if (yPos + itemHeight > pageHeight - margin) {
        pdf.addPage();
        yPos = margin;
        currentColumn = 0;
      }
      
      // ✅ PRESNÝ výpočet X pozície
      const xPos = margin + currentColumn * (columnWidth + gap);
      
      // Alternating background for readability
      const bgColor = index % 2 === 0 ? [226, 232, 240] : [241, 245, 249];
      pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
      pdf.setDrawColor(203, 213, 225);  // ✅ správny border color
      pdf.setLineWidth(0.2);  // ✅ správna hrúbka
      pdf.roundedRect(xPos, yPos, columnWidth, itemHeight, 2, 2, 'FD');  // ✅ presná šírka
      
      // App name (truncated if too long)
      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      const truncatedName = app.name.length > 25 ? app.name.substring(0, 22) + '...' : app.name;
      pdf.text(truncatedName, xPos + 2, yPos + 4.5);  // ✅ padding vnútri
      
      // Usage count
      pdf.setTextColor(148, 163, 184);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(`${app.count}×`, xPos + columnWidth - 2, yPos + 4.5, { align: 'right' });  // ✅ zarovnané
      
      // Move to next row or column
      currentColumn++;
      if (currentColumn >= numColumns) {
        currentColumn = 0;
        yPos += itemHeight;
      }
    });
    
    // Final yPos adjustment if not at start of new row
    if (currentColumn > 0) {
      yPos += itemHeight;
    }
  } else {
    // Single-column list layout for smaller app inventories
    result.apps.forEach((app, index) => {
      checkPageBreak(10);
      
      // Alternating background
      const bgColor = index % 2 === 0 ? [226, 232, 240] : [241, 245, 249];
      pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
      pdf.setDrawColor(203, 213, 225);  // ✅ správny border color
      pdf.setLineWidth(0.2);  // ✅ správna hrúbka
      pdf.roundedRect(margin, yPos - 2, contentWidth, 8, 2, 2, 'FD');  // ✅ PRESNE ako header
      
      // App name
      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(app.name, margin + 2, yPos + 3.5);  // ✅ +2 padding vnútri
      
      // Usage count
      pdf.setTextColor(148, 163, 184);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${app.count} ${app.count === 1 ? 'use' : 'uses'}`, pageWidth - margin - 2, yPos + 3.5, { align: 'right' });  // ✅ -2 padding
      
      yPos += 8;
    });
  }
  
  // Footer on all pages
  const totalPages = pdf.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Generated by Zapier Lighthouse | ${config.agencyName}`, 
             pageWidth / 2, pageHeight - 10, { align: 'center' });
    pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    pdf.text('Confidential', margin, pageHeight - 10);
  }
  
  // ========================================
  // DEBUG GRID: Draw AFTER all content (last thing before save)
  // ========================================
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawDebugGrid(pdf, pageWidth, pageHeight);
  }
  
  // Save PDF
  pdf.save(`Zapier_Audit_Report_${config.clientName.replace(/\s+/g, '_')}_${config.reportDate}.pdf`);
}
