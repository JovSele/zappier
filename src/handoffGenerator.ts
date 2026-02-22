import jsPDF from 'jspdf';

// ========================================
// CLIENT HANDOFF PDF GENERATOR v1.0.0
// ========================================
// Generates client-facing Handoff Report — separate from the Executive Audit.
// Design philosophy: "Operational Clarity" - what does this do, who owns it, what breaks
//
// Structure:
// - Page 1: Executive Summary       (stack overview, health, ownership)
// - Page 2: Per-Zap Breakdown       (plain English description per automation) ← CORE VALUE
// - Page 3: Dependency Map          (what connects to what, external services)
// - Page 4: Troubleshooting Guide   (what breaks, why, how to fix)
// - Page 5: Handoff Checklist       (step-by-step for new owner)
//
// Design system: matches pdfGenerator.ts (same COLORS, LAYOUT constants)
// ========================================

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface HandoffConfig {
  reportCode: string;
  clientName?: string;
  preparedBy?: string;
  date?: string;
}

export interface ZapDescription {
  zapName: string;
  trigger: string;            // plain English: "When X happens..."
  action: string;             // plain English: "...do Y"
  frequency: string;          // e.g. "Runs ~50x/month"
  connectedApps: string[];    // e.g. ["Gmail", "Notion", "Slack"]
  owner?: string;             // who is responsible
  notes?: string;             // edge cases, quirks
}

export interface DependencyEntry {
  zapName: string;
  dependsOn: string[];        // other zap names or external services
  feedsInto: string[];        // downstream zaps or services
}

export interface TroubleshootingEntry {
  zapName: string;
  commonIssue: string;        // "Zap stops if Gmail token expires"
  resolution: string;         // "Re-connect Gmail in Zapier settings"
}

export interface HandoffViewModel {
  report: {
    reportId: string;
    generatedAt: string;
  };

  summary: {
    totalZaps: number;
    activeZaps: number;
    connectedApps: string[];    // deduplicated list of all apps in use
    stackPurpose: string;       // plain English: what does this automation stack do overall
  };

  zaps: ZapDescription[];

  dependencies: DependencyEntry[];

  troubleshooting: TroubleshootingEntry[];

  checklist: Array<{
    step: string;               // e.g. "Verify Gmail connection is active"
    category: 'ACCESS' | 'TEST' | 'VERIFY' | 'DOCUMENT';
  }>;
}

// ========================================
// DESIGN SYSTEM (mirrors pdfGenerator.ts)
// ========================================

const COLORS = {
  PRIMARY_BLUE: { r: 37, g: 99, b: 235 },     // #2563EB - Handoff accent (vs red in audit)
  TEXT_PRIMARY: { r: 30, g: 41, b: 59 },       // #1E293B
  TEXT_SECONDARY: { r: 100, g: 116, b: 139 },  // #64748B
  DIVIDER: { r: 229, g: 231, b: 235 },         // #E5E7EB
  BACKGROUND: { r: 255, g: 255, b: 255 },      // #FFFFFF
  BLACK: { r: 0, g: 0, b: 0 },
  GRAY_FOOTER: { r: 119, g: 119, b: 119 },
  GREEN_SUCCESS: { r: 22, g: 163, b: 74 },
  BOX_BACKGROUND: { r: 250, g: 251, b: 252 },
  BOX_BORDER_LIGHT: { r: 226, g: 232, b: 240 },
  BOX_BORDER_STRONG: { r: 203, g: 213, b: 225 },
  SLATE_400: { r: 148, g: 163, b: 184 },
};

const LAYOUT = {
  PAGE_MARGIN: 22,
  TOP_MARGIN: 45,
  SECTION_SPACING: 32,
  LINE_SPACING: 18,
  CONTENT_WIDTH: 166,
};

// ========================================
// HELPER FUNCTIONS
// ========================================

function safeRender(yPos: number, pageHeight: number, requiredSpace: number = 10): boolean {
  return yPos + requiredSpace < pageHeight - 30;
}

function drawPageFooter(pdf: jsPDF, pageNum: number, clientName: string, preparedBy: string): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = LAYOUT.PAGE_MARGIN;

  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);

  pdf.setTextColor(COLORS.GRAY_FOOTER.r, COLORS.GRAY_FOOTER.g, COLORS.GRAY_FOOTER.b);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');

  pdf.text(
    `HANDOFF REPORT — Prepared for ${clientName} by ${preparedBy}`,
    margin,
    pageHeight - 13
  );

  pdf.text('Data processed locally. No cloud storage.', margin, pageHeight - 8);
  pdf.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
}

// ========================================
// PAGE RENDERING FUNCTIONS
// ========================================

/**
 * Page 1: Executive Summary
 * High-level: what the stack does, how many zaps, which apps, health snapshot
 */
function generateExecutiveSummary(pdf: jsPDF, vm: HandoffViewModel, config: HandoffConfig): void {
  const { PAGE_MARGIN, TOP_MARGIN, CONTENT_WIDTH } = LAYOUT;
  let yPos = TOP_MARGIN;

  // ===== HEADER =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('AUTOMATION HANDOFF REPORT', PAGE_MARGIN, yPos);

  yPos += 8;

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
  pdf.text(`Report ID: ${vm.report.reportId}`, PAGE_MARGIN, yPos);

  yPos += 5;

  const timestamp = new Date(vm.report.generatedAt);
  const dateStr = timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  pdf.text(`Generated: ${dateStr}`, PAGE_MARGIN, yPos);

  yPos += 15;

  // ===== DIVIDER =====
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);

  yPos += 15;

  // ===== STACK PURPOSE =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('What This Automation Stack Does', PAGE_MARGIN, yPos);

  yPos += 7;

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
  const purposeLines = pdf.splitTextToSize(vm.summary.stackPurpose, CONTENT_WIDTH);
  pdf.text(purposeLines, PAGE_MARGIN, yPos);

  yPos += purposeLines.length * 6 + 12;

  // ===== KEY STATS =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(12);

  const stats = [
    { label: 'Total Automations:', value: `${vm.summary.totalZaps}` },
    { label: 'Active:', value: `${vm.summary.activeZaps} of ${vm.summary.totalZaps}` },
    { label: 'Connected Apps:', value: vm.summary.connectedApps.join(', ') },
  ];

  stats.forEach(stat => {
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text(stat.label, PAGE_MARGIN, yPos);

    const labelWidth = pdf.getTextWidth(stat.label + ' ');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.text(stat.value, PAGE_MARGIN + labelWidth, yPos);

    yPos += 7;
  });

  yPos += 8;

  // ===== FINAL DIVIDER =====
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
}

/**
 * Page 2: Per-Zap Breakdown — CORE VALUE
 * Plain English description of every automation.
 * Rule-based generator: derives "When X → do Y" from structured ZapDescription data.
 *
 * Plain English rules (no AI needed):
 *   trigger field  → rendered as-is (already plain English from mapper)
 *   action field   → rendered as-is
 *   connectedApps  → shown as flow: App1 → App2 → App3
 *   frequency      → shown as metadata
 *   notes          → shown only if present, in gray italic
 */
function generatePerZapBreakdown(pdf: jsPDF, vm: HandoffViewModel, _config: HandoffConfig): void {
  const { PAGE_MARGIN, TOP_MARGIN, CONTENT_WIDTH } = LAYOUT;
  const pageHeight = pdf.internal.pageSize.getHeight();
  let yPos = TOP_MARGIN;

  // ===== HEADER =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Automation Breakdown', PAGE_MARGIN, yPos);

  yPos += 12;

  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);

  yPos += 15;

  if (vm.zaps.length === 0) {
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text('No automations found in export.', PAGE_MARGIN, yPos);
    return;
  }

  // ===== PER-ZAP CARDS =====
  vm.zaps.forEach((zap) => {
    // Pre-split lines for height estimation
    const triggerLines = pdf.splitTextToSize(zap.trigger, CONTENT_WIDTH - 20);
    const actionLines = pdf.splitTextToSize(zap.action, CONTENT_WIDTH - 20);
    const notesLines = zap.notes ? pdf.splitTextToSize(zap.notes, CONTENT_WIDTH - 20) : [];

    const estimatedHeight =
      8 +                                          // zap name
      triggerLines.length * 5 + 6 +               // trigger
      actionLines.length * 5 + 6 +                // action
      6 +                                          // frequency
      6 +                                          // apps
      (notesLines.length > 0 ? notesLines.length * 5 + 5 : 0) + // notes
      4;                                           // bottom padding

    // New page if needed
    if (!safeRender(yPos, pageHeight, estimatedHeight + 10)) {
      pdf.addPage();
      yPos = TOP_MARGIN;
    }

    // Card background
    pdf.setFillColor(COLORS.BOX_BACKGROUND.r, COLORS.BOX_BACKGROUND.g, COLORS.BOX_BACKGROUND.b);
    pdf.setDrawColor(COLORS.BOX_BORDER_LIGHT.r, COLORS.BOX_BORDER_LIGHT.g, COLORS.BOX_BORDER_LIGHT.b);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(PAGE_MARGIN, yPos - 5, CONTENT_WIDTH, estimatedHeight + 8, 2, 2, 'FD');
    pdf.setDrawColor(COLORS.BLACK.r, COLORS.BLACK.g, COLORS.BLACK.b);

    // Zap name
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.PRIMARY_BLUE.r, COLORS.PRIMARY_BLUE.g, COLORS.PRIMARY_BLUE.b);
    pdf.text(zap.zapName, PAGE_MARGIN + 4, yPos);
    yPos += 7;

    // TRIGGER
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text('Trigger:', PAGE_MARGIN + 4, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    const triggerLabelW = pdf.getTextWidth('Trigger: ');
    pdf.text(triggerLines[0], PAGE_MARGIN + 4 + triggerLabelW, yPos);
    for (let i = 1; i < triggerLines.length; i++) { yPos += 5; pdf.text(triggerLines[i], PAGE_MARGIN + 4 + triggerLabelW, yPos); }
    yPos += 6;

    // ACTION
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text('Action:', PAGE_MARGIN + 4, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    const actionLabelW = pdf.getTextWidth('Action: ');
    pdf.text(actionLines[0], PAGE_MARGIN + 4 + actionLabelW, yPos);
    for (let i = 1; i < actionLines.length; i++) { yPos += 5; pdf.text(actionLines[i], PAGE_MARGIN + 4 + actionLabelW, yPos); }
    yPos += 6;

    // FREQUENCY
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text('Frequency:', PAGE_MARGIN + 4, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.text(zap.frequency, PAGE_MARGIN + 4 + pdf.getTextWidth('Frequency: '), yPos);
    yPos += 6;

    // CONNECTED APPS (flow style)
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text('Apps:', PAGE_MARGIN + 4, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.text(zap.connectedApps.join(' -> '), PAGE_MARGIN + 4 + pdf.getTextWidth('Apps: '), yPos);
    yPos += 6;

    // NOTES (optional, gray italic)
    if (notesLines.length > 0) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(10);
      pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
      pdf.text(`Note: ${notesLines[0]}`, PAGE_MARGIN + 4, yPos);
      for (let i = 1; i < notesLines.length; i++) { yPos += 5; pdf.text(notesLines[i], PAGE_MARGIN + 4, yPos); }
      yPos += 5;
    }

    // Gap between cards
    yPos += 12;
  });
}

/**
 * Page 3: Dependency Map
 * What connects to what — external services, inter-zap dependencies.
 */
function generateDependencyMap(pdf: jsPDF, vm: HandoffViewModel, _config: HandoffConfig): void {
  const { PAGE_MARGIN, TOP_MARGIN, CONTENT_WIDTH } = LAYOUT;
  let yPos = TOP_MARGIN;

  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Dependency Map', PAGE_MARGIN, yPos);
  yPos += 12;

  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
  yPos += 15;

  if (vm.dependencies.length === 0) {
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text('No inter-zap dependencies detected.', PAGE_MARGIN, yPos);
    yPos += 7;
    pdf.text('All automations operate independently.', PAGE_MARGIN, yPos);
    return;
  }

  vm.dependencies.forEach(dep => {
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.PRIMARY_BLUE.r, COLORS.PRIMARY_BLUE.g, COLORS.PRIMARY_BLUE.b);
    pdf.text(dep.zapName, PAGE_MARGIN, yPos);
    yPos += 7;

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);

    if (dep.dependsOn.length > 0) {
      pdf.text(`Depends on: ${dep.dependsOn.join(', ')}`, PAGE_MARGIN + 5, yPos);
      yPos += 6;
    }
    if (dep.feedsInto.length > 0) {
      pdf.text(`Feeds into: ${dep.feedsInto.join(', ')}`, PAGE_MARGIN + 5, yPos);
      yPos += 6;
    }

    yPos += 6;
  });

  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
}

/**
 * Page 4: Troubleshooting Guide
 * Common failure modes per Zap + how to fix them.
 * Rule-based: derived from flag types and app connections (no AI needed).
 */
function generateTroubleshootingSection(pdf: jsPDF, vm: HandoffViewModel, _config: HandoffConfig): void {
  const { PAGE_MARGIN, TOP_MARGIN, CONTENT_WIDTH } = LAYOUT;
  let yPos = TOP_MARGIN;

  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Troubleshooting Guide', PAGE_MARGIN, yPos);
  yPos += 12;

  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
  yPos += 15;

  if (vm.troubleshooting.length === 0) {
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text('No known failure patterns identified.', PAGE_MARGIN, yPos);
    return;
  }

  vm.troubleshooting.forEach(entry => {
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.text(entry.zapName, PAGE_MARGIN, yPos);
    yPos += 7;

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    const issueLines = pdf.splitTextToSize(`Issue: ${entry.commonIssue}`, CONTENT_WIDTH - 5);
    pdf.text(issueLines, PAGE_MARGIN + 5, yPos);
    yPos += issueLines.length * 5 + 4;

    pdf.setTextColor(COLORS.GREEN_SUCCESS.r, COLORS.GREEN_SUCCESS.g, COLORS.GREEN_SUCCESS.b);
    const fixLines = pdf.splitTextToSize(`Fix: ${entry.resolution}`, CONTENT_WIDTH - 5);
    pdf.text(fixLines, PAGE_MARGIN + 5, yPos);
    yPos += fixLines.length * 5 + 10;
  });

  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
}

/**
 * Page 5: Handoff Checklist
 * Step-by-step for the new owner to verify everything works.
 * Categories: ACCESS, TEST, VERIFY, DOCUMENT
 */
function generateHandoffChecklist(pdf: jsPDF, vm: HandoffViewModel, _config: HandoffConfig): void {
  const { PAGE_MARGIN, TOP_MARGIN, CONTENT_WIDTH } = LAYOUT;
  let yPos = TOP_MARGIN;

  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Handoff Checklist', PAGE_MARGIN, yPos);
  yPos += 12;

  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
  yPos += 15;

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
  pdf.text('Complete each step before signing off on the handoff.', PAGE_MARGIN, yPos);
  yPos += 12;

  if (vm.checklist.length === 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.text('No checklist items generated.', PAGE_MARGIN, yPos);
    return;
  }

  const categories: Array<'ACCESS' | 'TEST' | 'VERIFY' | 'DOCUMENT'> = ['ACCESS', 'TEST', 'VERIFY', 'DOCUMENT'];
  const categoryLabels: Record<string, string> = {
    ACCESS: '1. Access & Credentials',
    TEST: '2. Test Runs',
    VERIFY: '3. Verify Outputs',
    DOCUMENT: '4. Documentation',
  };

  categories.forEach(cat => {
    const items = vm.checklist.filter(c => c.category === cat);
    if (items.length === 0) return;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.text(categoryLabels[cat], PAGE_MARGIN, yPos);
    yPos += 8;

    items.forEach(item => {
      // Checkbox (printable)
      pdf.setDrawColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
      pdf.setLineWidth(0.3);
      pdf.rect(PAGE_MARGIN + 2, yPos - 3.5, 4, 4);

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
      const itemLines = pdf.splitTextToSize(item.step, CONTENT_WIDTH - 12);
      pdf.text(itemLines, PAGE_MARGIN + 10, yPos);
      yPos += itemLines.length * 5 + 4;
    });

    yPos += 6;
  });

  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
}

// ========================================
// MAIN ENTRY POINT
// ========================================

/**
 * Generate Client Handoff PDF
 * @param viewModel - Pre-processed HandoffViewModel from handoffViewModelMapper
 * @param config - Report configuration
 */
export async function generateHandoffPDF(
  viewModel: HandoffViewModel,
  config: HandoffConfig
): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const clientName = config.clientName || 'Client';
  const preparedBy = config.preparedBy || 'Zapier Lighthouse';

  // Page 1: Executive Summary
  generateExecutiveSummary(pdf, viewModel, config);
  drawPageFooter(pdf, 1, clientName, preparedBy);

  // Page 2: Per-Zap Breakdown (core value)
  pdf.addPage();
  generatePerZapBreakdown(pdf, viewModel, config);
  drawPageFooter(pdf, 2, clientName, preparedBy);

  // Page 3: Dependency Map
  pdf.addPage();
  generateDependencyMap(pdf, viewModel, config);
  drawPageFooter(pdf, 3, clientName, preparedBy);

  // Page 4: Troubleshooting Guide
  pdf.addPage();
  generateTroubleshootingSection(pdf, viewModel, config);
  drawPageFooter(pdf, 4, clientName, preparedBy);

  // Page 5: Handoff Checklist
  pdf.addPage();
  generateHandoffChecklist(pdf, viewModel, config);
  drawPageFooter(pdf, 5, clientName, preparedBy);

  // Save
  const timestamp = new Date().toISOString().split('T')[0];
  pdf.save(`Handoff_Report_${config.reportCode}_${timestamp}.pdf`);
}