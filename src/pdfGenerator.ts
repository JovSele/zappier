import jsPDF from 'jspdf';
// @ts-ignore - AuditResult will be used in future phases
import type { AuditResult } from './types/audit-schema';

// ========================================
// EXECUTIVE AUDIT PDF GENERATOR v1.0.0
// Minimalist, professional, managerial design
// ========================================

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface PDFConfig {
  reportCode: string;
  clientName?: string;
}

export interface PdfViewModel {
  report: {
    reportId: string;
    generatedAt: string;
  };
  
  financialOverview: {
    recapturableAnnualSpend: number;
    multiplier: number;
    activeZaps: number;
    highSeverityCount: number;
    estimatedRemediationMinutes: number;
  };
  
  priorityActions: Array<{
    zapName: string;
    actionLabel: string;
    estimatedAnnualImpact: number;
    effortMinutes: number;
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
  pdf.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

  // Page number (left)
  pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Page ${pageNum}`, margin, pageHeight - 10);

  // Confidential statement (center)
  pdf.text(
    `CONFIDENTIAL AUDIT — Prepared for ${clientName}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  );

  // Privacy notice (right)
  pdf.text(
    'Data processed locally. No cloud storage.',
    pageWidth - margin,
    pageHeight - 10,
    { align: 'right' }
  );
}

// ========================================
// PAGE RENDERING FUNCTIONS
// ========================================

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
  const multiplierText = `Equivalent to ${viewModel.financialOverview.multiplier}× the cost of this audit.`;
  pdf.text(multiplierText, PAGE_MARGIN + (CONTENT_WIDTH / 2), yPos, { align: 'center' });
  
  yPos += 20;

  // ===== DIVIDER 2 =====
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
  
  yPos += 15;

  // ===== KEY STATISTICS =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');

  const stats = [
    `Active Zaps: ${viewModel.financialOverview.activeZaps}`,
    `High Priority Issues: ${viewModel.financialOverview.highSeverityCount}`,
    `Estimated Remediation Time: ${viewModel.financialOverview.estimatedRemediationMinutes} minutes`
  ];

  stats.forEach(stat => {
    pdf.text(stat, PAGE_MARGIN, yPos);
    yPos += 7;
  });
  
  yPos += 8;

  // ===== DIVIDER 3 =====
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
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
      
      // Action label (normal, indented)
      pdf.setFont('helvetica', 'normal');
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
  
  // TODO: Pages 3-5
  // - Page 3: Infrastructure Health
  // - Page 4: Plan Analysis
  // - Page 5: Safe Zone
  
  // Save
  const timestamp = new Date().toISOString().split('T')[0];
  pdf.save(`Executive_Audit_${config.reportCode}_${timestamp}.pdf`);
}

// ========================================
// TEMPORARY TEST MOCK - Remove before production
// ========================================

if (typeof window !== 'undefined') {
  (window as any).__testExecutiveAudit = () => {
    const mockViewModel: PdfViewModel = {
      report: {
        reportId: 'ZAP-2026-047',
        generatedAt: new Date().toISOString()
      },
      financialOverview: {
        recapturableAnnualSpend: 671.16,
        multiplier: 8.5,
        activeZaps: 5,
        highSeverityCount: 2,
        estimatedRemediationMinutes: 45
      },
      priorityActions: [
        {
          zapName: 'CRM → Slack',
          actionLabel: 'Merge formatters',
          estimatedAnnualImpact: 456,
          effortMinutes: 10
        },
        {
          zapName: 'Lead Filter',
          actionLabel: 'Move filter earlier',
          estimatedAnnualImpact: 214,
          effortMinutes: 5
        },
        {
          zapName: 'Email → Spreadsheet',
          actionLabel: 'Switch to instant trigger',
          estimatedAnnualImpact: 180,
          effortMinutes: 15
        }
      ],
      riskSummary: {
        highSeverityCount: 2,
        mediumSeverityCount: 3,
        inefficientLogicPatterns: 2,
        redundancyPatterns: 1,
        nonExecutingAutomations: 0
      },
      planSummary: {
        currentPlan: 'Team',
        usagePercent: 12.4,
        premiumFeaturesDetected: ['Custom Logic', 'Filters'],
        downgradeRecommended: false
      },
      safeZone: {
        optimizedZaps: []
      }
    };

    const config: PDFConfig = {
      reportCode: 'TEST-001',
      clientName: 'Test Client'
    };

    generateExecutiveAuditPDF(mockViewModel, config);
  };

  // Test function for empty state
  (window as any).__testExecutiveAuditEmpty = () => {
    const mockViewModel: PdfViewModel = {
      report: {
        reportId: 'ZAP-2026-048',
        generatedAt: new Date().toISOString()
      },
      financialOverview: {
        recapturableAnnualSpend: 0,
        multiplier: 0,
        activeZaps: 5,
        highSeverityCount: 0,
        estimatedRemediationMinutes: 0
      },
      priorityActions: [], // ← EMPTY
      riskSummary: {
        highSeverityCount: 0,
        mediumSeverityCount: 0,
        inefficientLogicPatterns: 0,
        redundancyPatterns: 0,
        nonExecutingAutomations: 0
      },
      planSummary: {
        currentPlan: 'Team',
        usagePercent: 12.4,
        premiumFeaturesDetected: [],
        downgradeRecommended: false
      },
      safeZone: {
        optimizedZaps: []
      }
    };

    const config: PDFConfig = {
      reportCode: 'TEST-002',
      clientName: 'Perfect Client'
    };

    generateExecutiveAuditPDF(mockViewModel, config);
  };
}
