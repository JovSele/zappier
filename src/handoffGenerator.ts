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
  stepCount?: number;
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
  ORANGE_WARNING: { r: 217, g: 119, b: 6 },
  BLUE: { r: 59, g: 130, b: 246 },
  SLATE_200: { r: 226, g: 232, b: 240 },
  SLATE_700: { r: 51, g: 65, b: 85 },
  SLATE_900: { r: 15, g: 23, b: 42 },
  RED: { r: 239, g: 68, b: 68 },
  GREEN: { r: 34, g: 197, b: 94 },
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

// --- Footer with dynamic page number ---
function drawPageFooter(pdf: jsPDF, clientName: string, preparedBy: string): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = LAYOUT.PAGE_MARGIN;

  // Dynamické číslo aktuálnej stránky
  const pageNum = pdf.getCurrentPageInfo().pageNumber;

  // Footer line
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);

  // Footer text
  pdf.setTextColor(COLORS.GRAY_FOOTER.r, COLORS.GRAY_FOOTER.g, COLORS.GRAY_FOOTER.b);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');

  pdf.text(`HANDOFF REPORT — Prepared for ${clientName} by ${preparedBy}`, margin, pageHeight - 13);
  pdf.text('Data processed locally. No cloud storage.', margin, pageHeight - 8);
  pdf.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
}

// --- Main PDF generation ---
function generateHandoffPDF(viewModel: ViewModel, config: Config, clientName: string, preparedBy: string) {
  const pdf = new jsPDF();

  // Page 1: Executive Summary
  generateExecutiveSummary(pdf, viewModel, config);
  drawPageFooter(pdf, clientName, preparedBy);

  // Page 2: Per-Zap Breakdown (core value)
  pdf.addPage();
  generatePerZapBreakdown(pdf, viewModel, config);
  drawPageFooter(pdf, clientName, preparedBy);

  // Page 3: Dependency Map
  pdf.addPage();
  generateDependencyMap(pdf, viewModel, config);
  drawPageFooter(pdf, clientName, preparedBy);

  // Page 4: Troubleshooting Guide
  pdf.addPage();
  generateTroubleshootingSection(pdf, viewModel, config);
  drawPageFooter(pdf, clientName, preparedBy);

  // Page 5: Handoff Checklist
  pdf.addPage();
  generateHandoffChecklist(pdf, viewModel, config);
  drawPageFooter(pdf, clientName, preparedBy);

  // Save
  const timestamp = new Date().toISOString().split('T')[0];
  pdf.save(`Handoff_Report_${config.reportCode}_${timestamp}.pdf`);
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
  pdf.text('Infrastructure Deployment & Handoff Kit', PAGE_MARGIN, yPos);

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

  yPos += purposeLines.length * 6 + 6;

  // Executive clarity layer
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(
    COLORS.TEXT_SECONDARY.r,
    COLORS.TEXT_SECONDARY.g,
    COLORS.TEXT_SECONDARY.b
  );

  const primaryFunctionLines = pdf.splitTextToSize(
    `Failure Impact: Disruption would affect data flow across connected systems.`,
    CONTENT_WIDTH
  );
  pdf.text(primaryFunctionLines, PAGE_MARGIN, yPos);
  yPos += primaryFunctionLines.length * 5 + 12;

  // ===== KEY STATS =====
  pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
  pdf.setFontSize(12);

  const stats = [
    { label: 'Total Automations:', value: `${vm.summary.totalZaps}` },
    { label: 'Active:', value: `${vm.summary.activeZaps} of ${vm.summary.totalZaps}` },
    { label: 'Connected Apps:', value: vm.summary.connectedApps.length > 0 ? vm.summary.connectedApps.join(', ') : 'None identified in export metadata'
},
  ];

  stats.forEach(stat => {
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text(stat.label, PAGE_MARGIN, yPos);

    const labelWidth = pdf.getTextWidth(stat.label + ' ');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.text(stat.label + ' ', PAGE_MARGIN, yPos);
    pdf.text(stat.value, PAGE_MARGIN + labelWidth, yPos);

    yPos += 7;
  });

  yPos += 8;

  // ===== OWNERSHIP SUMMARY BOX =====
  yPos += 10;

  // Vypočítaj risk level
  const allInactive = vm.summary.activeZaps === 0;

  let riskLevel: 'Low' | 'Moderate' | 'High';
  let riskColor: { r: number; g: number; b: number };

  if (vm.summary.activeZaps === 0) {
    riskLevel = 'Low';
    riskColor = COLORS.GREEN_SUCCESS;
  } else if (vm.summary.activeZaps < vm.summary.totalZaps) {
    riskLevel = 'Moderate';
    riskColor = COLORS.ORANGE_WARNING;
  } else {
    riskLevel = 'High';
    riskColor = COLORS.RED;
  }

  const firstAction = allInactive
    ? 'Verify connections, then reactivate workflows one by one'
    : 'Review active workflows and confirm outputs are correct';

  // Box
  pdf.setFillColor(COLORS.BOX_BACKGROUND.r, COLORS.BOX_BACKGROUND.g, COLORS.BOX_BACKGROUND.b);
  pdf.setDrawColor(COLORS.BOX_BORDER_STRONG.r, COLORS.BOX_BORDER_STRONG.g, COLORS.BOX_BORDER_STRONG.b);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(PAGE_MARGIN, yPos, CONTENT_WIDTH, 38, 2, 2, 'FD');

  // Box header
  yPos += 7;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
  pdf.text('OWNERSHIP TRANSFER SUMMARY', PAGE_MARGIN + 4, yPos);
  yPos += 7;

  // 4 kolumny
  const col = CONTENT_WIDTH / 4;

  
  const summaryItems = [
    { label: 'Total Workflows', value: `${vm.summary.totalZaps}` },
    { label: 'Currently Active', value: `${vm.summary.activeZaps} of ${vm.summary.totalZaps}` },
    { label: 'Immediate Risk', value: riskLevel },
    { label: 'System State', value: allInactive ? 'Inactive' : 'Operational' },
  ];

  summaryItems.forEach((item, i) => {
      const x = PAGE_MARGIN + 4 + i * col;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');

      if (item.label === 'Immediate Risk') {
        pdf.setTextColor(riskColor.r, riskColor.g, riskColor.b);
      } else {
        pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
      }
      pdf.text(item.value, x, yPos);

      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
      pdf.text(item.label, x, yPos + 5);
    });

  yPos += 16;

  // Recommended first action
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
  pdf.text(`Recommended First Action: ${firstAction}`, PAGE_MARGIN + 4, yPos);

  yPos += 10;

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
    const appsText =
      zap.connectedApps && zap.connectedApps.length > 0
        ? zap.connectedApps.join(' → ')
        : 'Not identified in export metadata';
    pdf.text(appsText, PAGE_MARGIN + 4 + pdf.getTextWidth('Apps: '), yPos);
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

vm.dependencies.forEach((dep, index) => {
  const zapDesc = vm.zaps.find(z => z.zapName === dep.zapName);
  const steps = zapDesc?.stepCount ?? 2;

  const cardHeight = 50;
  const cardOffset = 1;

  // Shadow
  pdf.setFillColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setDrawColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.roundedRect(PAGE_MARGIN, yPos, CONTENT_WIDTH - cardOffset, cardHeight, 3, 3, 'FD');

  // Main box
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.setLineWidth(0.1);
  pdf.roundedRect(PAGE_MARGIN + cardOffset, yPos, CONTENT_WIDTH - cardOffset, cardHeight, 3, 3, 'FD');

  // Header
  pdf.setTextColor(COLORS.PRIMARY_BLUE.r, COLORS.PRIMARY_BLUE.g, COLORS.PRIMARY_BLUE.b);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text('WORKFLOW ARCHITECTURE', PAGE_MARGIN + cardOffset + 6, yPos + 6);
  
  // Zap name (right side of header)
  

  // Complexity
  const complexity = steps > 8 ? 'HIGH' : steps > 4 ? 'MEDIUM' : 'LOW';
  const complexityColor = steps > 8 ? COLORS.RED : steps > 4 ? COLORS.ORANGE_WARNING : COLORS.GREEN;
  const stepsText = `${steps} STEPS • `;
  const complexityText = `${complexity} COMPLEXITY`;
  const totalBadgeWidth = pdf.getTextWidth(stepsText + complexityText);
  const rightX = PAGE_MARGIN + CONTENT_WIDTH - cardOffset - 6 - totalBadgeWidth;

  yPos += 14;

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.text(stepsText, rightX, yPos - 8);
  pdf.setTextColor(complexityColor.r, complexityColor.g, complexityColor.b);
  pdf.setFont('helvetica', 'bold');
  pdf.text(complexityText, rightX + pdf.getTextWidth(stepsText), yPos - 8);

  // 3 boxy: Trigger → Logic → Action
  const boxWidth = 35;
  const boxHeight = 20;
  const boxGap = 10;
  const startX = PAGE_MARGIN + cardOffset + (CONTENT_WIDTH - cardOffset - (3 * boxWidth + 2 * boxGap)) / 2;

  const triggerApp = dep.dependsOn[0] || 'Source';
  const actionApp = dep.feedsInto[0] || 'Destination';

  // TRIGGER box
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(startX, yPos, boxWidth, boxHeight, 2, 2, 'FD');
  pdf.setFillColor(COLORS.PRIMARY_BLUE.r, COLORS.PRIMARY_BLUE.g, COLORS.PRIMARY_BLUE.b);
  pdf.roundedRect(startX + boxWidth / 2 - 4, yPos + 2, 8, 8, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text(triggerApp.charAt(0).toUpperCase(), startX + boxWidth / 2, yPos + 8, { align: 'center' });
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(6);
  pdf.text(triggerApp.toUpperCase().substring(0, 10), startX + boxWidth / 2, yPos + 14, { align: 'center' });
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(5);
  pdf.text('TRIGGER', startX + boxWidth / 2, yPos + 18, { align: 'center' });

  // Arrow 1
  const arrowY = yPos + boxHeight / 2;
  pdf.setDrawColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setLineWidth(0.5);
  pdf.line(startX + boxWidth + 2, arrowY, startX + boxWidth + boxGap - 2, arrowY);
  pdf.setFillColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.triangle(startX + boxWidth + boxGap - 4, arrowY - 1, startX + boxWidth + boxGap - 2, arrowY, startX + boxWidth + boxGap - 4, arrowY + 1, 'F');

  // LOGIC box
  const logic2X = startX + boxWidth + boxGap;
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.roundedRect(logic2X, yPos, boxWidth, boxHeight, 2, 2, 'FD');
  const logicSteps = Math.max(steps - 2, 0);
  pdf.setFillColor(COLORS.PRIMARY_BLUE.r, COLORS.PRIMARY_BLUE.g, COLORS.PRIMARY_BLUE.b);
  pdf.roundedRect(logic2X + boxWidth / 2 - 7, yPos + 2, 14, 6, 3, 3, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`+${logicSteps}`, logic2X + boxWidth / 2, yPos + 6, { align: 'center' });
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(6);
  pdf.text('LOGIC LAYER', logic2X + boxWidth / 2, yPos + 13, { align: 'center' });
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(5);
  pdf.text('FILTERS & FORMATTING', logic2X + boxWidth / 2, yPos + 17, { align: 'center' });

  // Arrow 2
  const arrow2X = logic2X + boxWidth + 2;
  pdf.setDrawColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.line(arrow2X, arrowY, arrow2X + boxGap - 4, arrowY);
  pdf.setFillColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.triangle(arrow2X + boxGap - 4, arrowY - 1, arrow2X + boxGap - 2, arrowY, arrow2X + boxGap - 4, arrowY + 1, 'F');

  // ACTION box
  const action3X = logic2X + boxWidth + boxGap;
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
  pdf.roundedRect(action3X, yPos, boxWidth, boxHeight, 2, 2, 'FD');
  pdf.setFillColor(COLORS.PRIMARY_BLUE.r, COLORS.PRIMARY_BLUE.g, COLORS.PRIMARY_BLUE.b);
  pdf.roundedRect(action3X + boxWidth / 2 - 4, yPos + 2, 8, 8, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text(actionApp.charAt(0).toUpperCase(), action3X + boxWidth / 2, yPos + 8, { align: 'center' });
  pdf.setTextColor(COLORS.SLATE_900.r, COLORS.SLATE_900.g, COLORS.SLATE_900.b);
  pdf.setFontSize(6);

  const actionLabel = actionApp.toUpperCase();
  const safeActionLabel = actionLabel.length > 12 ? actionLabel.substring(0, 12) + '…' : actionLabel;
  pdf.text(safeActionLabel, action3X + boxWidth / 2, yPos + 14, { align: 'center' });
  pdf.setTextColor(COLORS.SLATE_400.r, COLORS.SLATE_400.g, COLORS.SLATE_400.b);
  pdf.setFontSize(5);
  pdf.text('ACTION', action3X + boxWidth / 2, yPos + 18, { align: 'center' });

  yPos += boxHeight + 14;
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
function generateTroubleshootingSection(
  pdf: jsPDF,
  vm: HandoffViewModel,
  _config: HandoffConfig
): void {
  const { PAGE_MARGIN, TOP_MARGIN, CONTENT_WIDTH } = LAYOUT;
  const pageHeight = pdf.internal.pageSize.getHeight();
  let yPos = TOP_MARGIN;

  // ===== HEADER =====
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

  // ===== TROUBLESHOOTING ENTRIES =====
  for (let i = 0; i < vm.troubleshooting.length; i++) {
    const entry = vm.troubleshooting[i];

    // Estimate required space (rough but safe)
    const issueLines = pdf.splitTextToSize(
      `Issue: ${entry.commonIssue}`,
      CONTENT_WIDTH - 5
    );
    const fixLines = pdf.splitTextToSize(
      `Fix: ${entry.resolution}`,
      CONTENT_WIDTH - 5
    );

    const estimatedHeight =
      7 +                               // zap name
      issueLines.length * 5 + 4 +        // issue
      fixLines.length * 5 + 10 +         // fix
      10;                                // spacing buffer

    // Page break protection
    if (!safeRender(yPos, pageHeight, estimatedHeight)) {
      pdf.addPage();
      yPos = TOP_MARGIN;
    }

    // Zap name
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.text(entry.zapName, PAGE_MARGIN, yPos);
    yPos += 7;

    // Issue
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
    pdf.text(issueLines, PAGE_MARGIN + 5, yPos);
    yPos += issueLines.length * 5 + 4;

    // Fix
    pdf.setTextColor(COLORS.GREEN_SUCCESS.r, COLORS.GREEN_SUCCESS.g, COLORS.GREEN_SUCCESS.b);
    pdf.text(fixLines, PAGE_MARGIN + 5, yPos);
    yPos += fixLines.length * 5 + 10;

    // Divider between entries (except last)
    if (i < vm.troubleshooting.length - 1) {
      pdf.setDrawColor(COLORS.SLATE_200.r, COLORS.SLATE_200.g, COLORS.SLATE_200.b);
      pdf.setLineWidth(0.2);
      pdf.line(
        PAGE_MARGIN,
        yPos - 4,
        PAGE_MARGIN + CONTENT_WIDTH,
        yPos - 4
      );
    }
  }

  // Final divider
  pdf.setDrawColor(COLORS.DIVIDER.r, COLORS.DIVIDER.g, COLORS.DIVIDER.b);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, yPos, PAGE_MARGIN + CONTENT_WIDTH, yPos);
}

/**
 * Page 5: Handoff Checklist
 * Step-by-step for the new owner to verify everything works.
 * Categories: ACCESS, TEST, VERIFY, DOCUMENT
 */
function generateHandoffChecklist(
  pdf: jsPDF,
  vm: HandoffViewModel,
  _config: HandoffConfig
): void {
  const { PAGE_MARGIN, TOP_MARGIN, CONTENT_WIDTH } = LAYOUT;
  const pageHeight = pdf.internal.pageSize.getHeight();
  let yPos = TOP_MARGIN;

  // ===== HEADER =====
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

  const categories: Array<'ACCESS' | 'TEST' | 'VERIFY' | 'DOCUMENT'> = [
    'ACCESS',
    'TEST',
    'VERIFY',
    'DOCUMENT'
  ];

  let categoryNumber = 0;

  for (let c = 0; c < categories.length; c++) {
    const cat = categories[c];
    const items = vm.checklist.filter(i => i.category === cat);
    if (items.length === 0) continue;

    categoryNumber++;

    const categoryLabel = {
      ACCESS: 'Access & Credentials',
      TEST: 'Test Runs',
      VERIFY: 'Verify Outputs',
      DOCUMENT: 'Documentation',
    }[cat];

    // ===== ESTIMATE CATEGORY BLOCK HEIGHT =====
    let estimatedHeight = 8; // title spacing

    items.forEach(item => {
      const itemLines = pdf.splitTextToSize(item.step, CONTENT_WIDTH - 12);
      estimatedHeight += itemLines.length * 5 + 6;
    });

    estimatedHeight += 10; // buffer

    // 🔐 PAGE BREAK BEFORE CATEGORY
    if (!safeRender(yPos, pageHeight, estimatedHeight)) {
      pdf.addPage();
      yPos = TOP_MARGIN;
    }

    // ===== CATEGORY TITLE =====
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
    pdf.text(`${categoryNumber}. ${categoryLabel}`, PAGE_MARGIN, yPos);
    yPos += 8;

    // ===== ITEMS =====
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemLines = pdf.splitTextToSize(item.step, CONTENT_WIDTH - 12);

      const itemHeight = itemLines.length * 5 + 6;

      // 🔐 PAGE BREAK INSIDE CATEGORY
      if (!safeRender(yPos, pageHeight, itemHeight)) {
        pdf.addPage();
        yPos = TOP_MARGIN;
      }

      // Checkbox
      pdf.setDrawColor(COLORS.TEXT_SECONDARY.r, COLORS.TEXT_SECONDARY.g, COLORS.TEXT_SECONDARY.b);
      pdf.setLineWidth(0.3);
      pdf.rect(PAGE_MARGIN + 2, yPos - 3.5, 4, 4);

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(COLORS.TEXT_PRIMARY.r, COLORS.TEXT_PRIMARY.g, COLORS.TEXT_PRIMARY.b);
      pdf.text(itemLines, PAGE_MARGIN + 10, yPos);

      yPos += itemHeight;
    }

    yPos += 8;
  }

  // ===== FINAL DIVIDER =====
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