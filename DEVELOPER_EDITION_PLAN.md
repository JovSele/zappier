# Developer Edition PDF Generator - Implementation Plan

## Overview
Nová funkcia `generateDeveloperEditionPDF()` pre multi-Zap batch analysis reports.

## Input Interface (TypeScript)
```typescript
interface BatchParseResult {
  success: boolean;
  message: string;
  zap_count: number;
  individual_results: ParseResult[];
  
  // Aggregated Project Summary
  total_nodes: number;
  total_estimated_savings: number;
  average_efficiency_score: number;
  total_flags: number;
  combined_apps: AppInfo[];
  
  // Developer Edition fields
  patterns: PatternFinding[];
  scope_metadata: ScopeMetadata;
  system_metrics: SystemMetrics;
}

interface PatternFinding {
  pattern_type: string;          // "polling_trigger", "late_filter_placement", etc.
  pattern_name: string;          // "Polling Trigger Overuse"
  affected_zap_ids: number[];
  affected_count: number;
  median_chain_length?: number;
  total_waste_tasks: number;
  total_waste_usd: number;
  refactor_guidance: string;
  severity: string;              // "high", "medium", "low"
}

interface ScopeMetadata {
  total_zaps_in_account: number;
  analyzed_count: number;
  excluded_count: number;
  analyzed_zap_summaries: ZapSummary[];
  excluded_zap_summaries: ZapSummary[];
}

interface SystemMetrics {
  avg_steps_per_zap: number;
  avg_tasks_per_run: number;
  polling_trigger_count: number;
  instant_trigger_count: number;
  total_monthly_tasks: number;
  formatter_usage_density: string;  // "high", "medium", "low"
  fan_out_flows: number;
}
```

## Page Structure

### PAGE 1: Technical Cover (Hero Page)
**Purpose:** Executive snapshot pre developers/architects

**Layout:**
```
┌─────────────────────────────────────────────┐
│ LIGHTHOUSE DEVELOPER EDITION                │
│ Project: Multi-Zap Batch Analysis          │
│ Report ID: LHA-2026-033-00042               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  PROJECT SNAPSHOT                           │
│                                             │
│  [3] Zaps Analyzed                         │
│  [12] Total Anti-Patterns Detected         │
│  [$456] Monthly Waste Identified           │
│  [72/100] Average Efficiency Score         │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  SEVERITY BREAKDOWN                         │
│  🔴 High:     5 issues                     │
│  🟡 Medium:   4 issues                     │
│  🟢 Low:      3 issues                     │
└─────────────────────────────────────────────┘
```

**Data Sources:**
- `batch_result.zap_count`
- `batch_result.total_flags`
- `batch_result.total_estimated_savings`
- `batch_result.average_efficiency_score`
- Count flags by severity from `individual_results[].efficiency_flags`

---

### PAGE 2: System Health & Scope
**Purpose:** Technical context + analyzed vs excluded Zaps

**Layout:**
```
┌─────────────────────────────────────────────┐
│ SYSTEM HEALTH OVERVIEW                      │
│                                             │
│ • Avg Steps/Zap: 8.3                       │
│ • Polling Triggers: 2/3 (66%)              │
│ • Instant Triggers: 1/3 (33%)              │
│ • Formatter Density: Medium                 │
└─────────────────────────────────────────────┘

┌──────────────────┬──────────────────────────┐
│ ANALYZED (3)     │ EXCLUDED (12)            │
├──────────────────┼──────────────────────────┤
│ • Zap #1         │ • Inactive Zap A         │
│   8 steps        │   (off)                  │
│   Score: 62/100  │                          │
│                  │ • Test Workflow B        │
│ • Zap #2         │   (paused)               │
│   12 steps       │                          │
│   Score: 85/100  │ • Legacy System C        │
│                  │   (archived)             │
│ • Zap #3         │   ...                    │
│   5 steps        │                          │
│   Score: 70/100  │                          │
└──────────────────┴──────────────────────────┘
```

**Data Sources:**
- `system_metrics.avg_steps_per_zap`
- `system_metrics.polling_trigger_count`
- `system_metrics.instant_trigger_count`
- `system_metrics.formatter_usage_density`
- `scope_metadata.analyzed_zap_summaries`
- `scope_metadata.excluded_zap_summaries`

---

### PAGE 3: Pattern-Level Findings
**Purpose:** Cross-Zap anti-patterns (affects multiple Zaps)

**Layout:**
```
┌─────────────────────────────────────────────┐
│ 🔴 PATTERN: Polling Trigger Overuse        │
│ Severity: HIGH                              │
│                                             │
│ Affected Zaps: 5                           │
│ IDs: #1043, #1055, #1089, #1123, #1145    │
│                                             │
│ Total Waste: 2,450 tasks/month             │
│ Cost Impact: $49/month                     │
│                                             │
│ Refactor Guidance:                         │
│ Switch to instant webhook triggers where   │
│ possible to reduce polling overhead and    │
│ improve real-time responsiveness.          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 🟡 PATTERN: Late Filter Placement          │
│ Severity: MEDIUM                            │
│                                             │
│ Affected Zaps: 3                           │
│ IDs: #1043, #1089, #1123                   │
│                                             │
│ Total Waste: 890 tasks/month               │
│ Cost Impact: $18/month                     │
│                                             │
│ Refactor Guidance:                         │
│ Move filters immediately after trigger to  │
│ reduce wasted tasks on filtered items.     │
└─────────────────────────────────────────────┘
```

**Data Sources:**
- `patterns[]` array
- For each pattern:
  - `pattern_name`
  - `severity`
  - `affected_count`
  - `affected_zap_ids`
  - `total_waste_tasks`
  - `total_waste_usd`
  - `refactor_guidance`

---

### PAGE 4: Per-Zap Breakdown
**Purpose:** Individual technical deep-dive cards s ASCII diagramami

**Layout (per Zap):**
```
┌─────────────────────────────────────────────┐
│ ZAP #1043: WordPress to Reddit Sync        │
│ Status: ACTIVE • Score: 62/100 • 8 steps  │
└─────────────────────────────────────────────┘

ASCII WORKFLOW DIAGRAM:
┌──────────────────────────────────────────────┐
│                                              │
│  [RSS] ──→ [Filter?] ──→ [Format] ──→ [🔴] │
│  Polling    ❌ Late      3 steps     Reddit │
│  15min                                       │
│                                              │
│  Issues:                                     │
│  • Polling trigger (20% overhead)           │
│  • Filter at step 3 (should be step 1)     │
│  • 3 formatter steps (chain explosion?)     │
└──────────────────────────────────────────────┘

FLAGS:
🔴 Late Filter Placement (HIGH)
   $12/month waste • Move filter to step 1

🟡 Polling Trigger (MEDIUM)
   $8/month waste • Switch to webhook
```

**Technical Requirements:**
- **Font:** Courier (monospaced) pre ASCII diagramy
- **Box drawing:** Použiť ASCII characters: `┌─┐│└┘├┤┬┴┼`
- **Arrows:** `→ ← ↑ ↓` alebo `-->`
- **Emoji pre urgency:** 🔴 🟡 🟢

**Data Sources:**
- `individual_results[]` array
- For each Zap:
  - `zap_title`, `zap_id`, `status`
  - `efficiency_score`, `total_nodes`
  - `efficiency_flags[]` (issues per Zap)
  - Generate ASCII diagram from `apps[]` (trigger → actions)

---

### PAGE 5: Tech Debt Scoreboard
**Purpose:** Sumárna tabuľka pre prioritizáciu

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│ TECH DEBT SCOREBOARD                                   │
├─────┬────────────────┬──────────┬───────┬───────┬──────┤
│ ID  │ Zap Name       │ Complex. │ Risk  │ Waste │ Pri. │
├─────┼────────────────┼──────────┼───────┼───────┼──────┤
│1043 │ WP → Reddit    │ HIGH     │ 🔴 8  │ $20   │ 🔥🔥│
│1055 │ Sheets → Slack │ MEDIUM   │ 🟡 5  │ $12   │ 🔥  │
│1089 │ Gmail → Trello │ LOW      │ 🟢 2  │ $4    │ ⚡  │
└─────┴────────────────┴──────────┴───────┴───────┴──────┘

LEGEND:
Complexity: Based on step count (HIGH >8, MEDIUM 4-8, LOW <4)
Risk Score: Sum of severity weights (HIGH=3, MEDIUM=2, LOW=1)
Waste: Monthly $ from estimated_monthly_savings
Priority: 🔥🔥 Critical | 🔥 High | ⚡ Medium | ✓ Low
```

**Calculation Logic:**
```typescript
// Complexity
const complexity = zap.total_nodes > 8 ? "HIGH" : 
                   zap.total_nodes > 4 ? "MEDIUM" : "LOW";

// Risk Score (sum of severity weights)
let risk = 0;
zap.efficiency_flags.forEach(flag => {
  if (flag.severity === "high") risk += 3;
  if (flag.severity === "medium") risk += 2;
  if (flag.severity === "low") risk += 1;
});

// Priority emoji
const priority = risk >= 6 ? "🔥🔥" : 
                 risk >= 4 ? "🔥" : 
                 risk >= 2 ? "⚡" : "✓";
```

---

### PAGE 6: Optimization Checklist
**Purpose:** Actionable TODO list pre devs

**Layout:**
```
┌─────────────────────────────────────────────┐
│ OPTIMIZATION CHECKLIST                      │
│                                             │
│ HIGH PRIORITY (Do First)                    │
│ [ ] Fix Zap #1043: Move filter to step 1   │
│     Impact: $12/month savings               │
│                                             │
│ [ ] Fix Zap #1055: Replace polling trigger │
│     Impact: $8/month savings                │
│                                             │
│ MEDIUM PRIORITY                             │
│ [ ] Review formatter chains in Zap #1089   │
│     Impact: $4/month savings                │
│                                             │
│ [ ] Re-authenticate Reddit account         │
│     Impact: Eliminate 38% error rate        │
│                                             │
│ LOW PRIORITY (Nice to Have)                │
│ [ ] Consolidate duplicate Zaps             │
│     Impact: Simplified maintenance          │
│                                             │
│ [ ] Add error notifications                │
│     Impact: Faster incident response        │
└─────────────────────────────────────────────┘
```

**Checklist Generation Logic:**
1. **Group by severity:** HIGH → MEDIUM → LOW
2. **Sort within group:** By `estimated_monthly_savings` (descending)
3. **Format:** `[ ] Action text`
4. **Impact line:** Show savings or benefit

**Data Sources:**
- Flatten all `efficiency_flags[]` from `individual_results[]`
- Sort by severity + savings
- Generate actionable text per flag type

---

## Function Signature

```typescript
export async function generateDeveloperEditionPDF(
  batchResult: BatchParseResult,
  config: PDFConfig
): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  // ... implementation
}
```

## Integration with main.ts

**Current code (line ~560):**
```typescript
console.log('📦 Batch audit result (Developer Edition):', batchResult)
alert(alertMsg)
```

**New code:**
```typescript
// Generate Developer Edition PDF
await generateDeveloperEditionPDF(batchResult, {
  agencyName: 'Zapier Lighthouse',
  clientName: 'Batch Analysis',
  reportDate: new Date().toISOString().split('T')[0],
  reportCode: generateReportCode(getNextReportId())
})
```

## Technical Implementation Notes

### 1. ASCII Diagram Rendering
```typescript
// Set monospaced font for ASCII art
pdf.setFont('courier', 'normal');
pdf.setFontSize(8);

const asciiDiagram = `
┌──────────────────────────────────┐
│ [RSS] → [Filter?] → [Format] → [Reddit] │
└──────────────────────────────────┘
`;

pdf.text(asciiDiagram, margin, yPos);
```

### 2. Two-Column Layout (Scope page)
```typescript
const col1Width = contentWidth / 2 - 2;
const col2X = margin + col1Width + 4;

// Left column: Analyzed
renderZapList(analyzed_zap_summaries, margin, yPos, col1Width);

// Right column: Excluded
renderZapList(excluded_zap_summaries, col2X, yPos, col1Width);
```

### 3. Pattern Cards with Severity Colors
```typescript
const severityColors = {
  high: COLORS.RED,
  medium: { r: 245, g: 158, b: 11 }, // amber
  low: COLORS.GREEN
};

const color = severityColors[pattern.severity] || COLORS.SLATE_400;
```

### 4. Table Rendering (Scoreboard)
```typescript
function drawTable(headers: string[], rows: string[][], yPos: number) {
  // Draw header row
  // Draw data rows
  // Auto-adjust column widths
}
```

## File Structure Changes

**New exports in pdfGenerator.ts:**
```typescript
// Existing
export { generatePDFReport }

// New
export { generateDeveloperEditionPDF }
export type { BatchParseResult, PatternFinding, ScopeMetadata, SystemMetrics }
```

## Testing Plan

1. **Test s 1 Zapom** - overiť že všetky sekcie sa správne renderujú
2. **Test s 3 Zapmi** - overiť pagination + scope rozdiel
3. **Test s patterns** - overiť že pattern detection funguje
4. **Test s empty patterns** - overiť graceful handling
5. **Test ASCII rendering** - overiť že sa nerozpadajú boxy

## Priority Implementation Order

1. ✅ **Phase 1 (DONE):** WASM batch parser hotový
2. 🔨 **Phase 2 (NOW):** Developer Edition PDF generator
   - [ ] Create function signature + basic structure
   - [ ] Implement Page 1: Technical Cover
   - [ ] Implement Page 2: System Health & Scope
   - [ ] Implement Page 3: Pattern-Level Findings
   - [ ] Implement Page 4: Per-Zap Breakdown (s ASCII)
   - [ ] Implement Page 5: Tech Debt Scoreboard
   - [ ] Implement Page 6: Optimization Checklist
   - [ ] Wire up button in main.ts
3. 🎯 **Phase 3 (NEXT):** Testing + refinement

## Notes

- **Reuse existing helpers:** `drawPageFrame()`, `ensureSpace()`, `COLORS`
- **ASCII fonts:** Courier je jediný monospaced font v jsPDF
- **Emoji support:** jsPDF podporuje Unicode emoji (🔴🟡🟢🔥⚡✓)
- **Performance:** Batch of 10 Zaps = ~6-8 pages = <2s render time
