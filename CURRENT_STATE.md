# CURRENT_STATE.md
## Zapier Lighthouse - Complete Implementation Audit

**Generated:** 2026-02-01  
**Purpose:** Dokumentácia aktuálneho stavu kódu pre implementáciu Batch Selection a Disclaimeru

---

## 1. AKTUÁLNA IMPLEMENTÁCIA VÝBERU (Selection Logic)

### 1.1 Workflow
```
1. User uploadne ZIP súbor
2. WASM volá parse_zap_list(zip_data) → rýchle získanie metadát BEZ heuristík
3. UI zobrazí Zap Selector Dashboard (displayZapSelector())
4. User klikne na jeden Zap
5. WASM volá parse_single_zap_audit(zip_data, zap_id) → plná analýza vybraného Zapu
6. UI zobrazí HTML/PDF report preview
```

### 1.2 Obmedzenie: Single Zap Selection Only
**Kľúčový fakt:** Aktuálne je možné vybrať len **JEDEN** konkrétny Zap na analýzu.

**Dôkaz v kóde:**
- `main.ts:handleZapSelect(zapId: number)` - prijíma JEDEN zap_id
- `lib.rs:parse_single_zap_audit(zip_data: &[u8], zap_id: u64)` - filtruje na JEDEN Zap
- UI renderuje report pre jeden Zap (`displayHtmlPreview()`)

**Implementované funkcie:**
- ✅ Search filtering (filterZaps() - podľa názvu/app)
- ✅ Status filtering (applyStatusFilter() - all/on/error)
- ✅ Reset filters (resetFilters())
- ✅ Back to selector (backToSelector())

### 1.3 Metadata Zobrazované v UI

**ZapSummary interface** (main.ts, lines 28-36):
```typescript
interface ZapSummary {
  id: number
  title: string
  status: string              // "on" / "off"
  step_count: number          // Počet krokov
  trigger_app: string         // Napr. "RSS", "WordPress"
  last_run: string | null     // ISO timestamp z CSV
  error_rate: number | null   // 0-100% alebo null
  total_runs: number          // Celkový počet spustení z CSV
}
```

**Zobrazené v tabuľke:**
- Index (#1, #2, ...)
- Zap Name + Trigger App (badge) + Step count
- Status badge (🟢 ON / 🔴 OFF)
- Last Run (formátované: "5m ago", "2d ago")
- Error Rate badge (🟢 <5% / 🟡 5-10% / 🔴 >10% / N/A)

**Parser funkcia:** `lib.rs:parse_zap_list()` (lines 749-844)
- Parsuje zapfile.json + CSV súbory
- **ŽIADNE heuristiky** - len metadata extraction
- Rýchle načítanie (< 500ms)

---

## 2. STAV PDF GENERÁTORA (pdfGenerator.ts)

### 2.1 Štruktúra súboru
- **Veľkosť:** ~2000 riadkov
- **Framework:** jsPDF s manuálnym renderingom
- **Formát:** A4 portrait (210mm × 297mm)
- **Margins:** 20mm, contentWidth: 170mm

### 2.2 Implementované Sekcie

#### PAGE 1: Executive Overview
1. **Page Header** (drawPageFrame - lines 41-86)
   - Horná slate lišta (10mm)
   - Logo + "Lighthouse Audit" text
   - "Audit Complete" badge
   - Datum a čas
   - Footer: Page number, Agency branding, Report ID

2. **Efficiency Score + Data Confidence** (lines 592-698)
   - Dvojica kariet (50/50 split)
   - Gauge score visualization (0-100)
   - Coverage/Sample/Period bullets
   - Dynamic colors (green ≥75, amber 50-74, red <50)

3. **Analyzed Automation** (lines 700-729)
   - Blue card s Zap title, ID, status

4. **Executive Verdict** (lines 731-771)
   - Amber/yellow card
   - "High Optimization Potential" message
   - Dynamic savings text: "up to $XXX/year"
   - Scope disclaimer

5. **Key Metrics** (lines 773-860)
   - Tri karty: Annual Waste (red), Immediate Savings (green), Reliability (blue)
   - Dynamic výpočty z `result.estimated_savings`
   - Reliability = 100 - error_rate

6. **Before/After Comparison** (lines 423-543)
   - Horizontal dual-column layout
   - Arrow indicators (→ green arrows)
   - Error Rate / Yearly Cost / Sync Speed / Maintenance
   - Dynamic hodnoty z flags

#### PAGE 2: Action Plan
7. **What to Fix Today** (lines 288-388)
   - Dark slate card (tmavý gradient)
   - Top 3 flags sorted by severity
   - Per-flag cards:
     - Severity badge (CRITICAL/IMPORTANT/OPTIMIZE)
     - Problem/Fix/Effort lines
     - Dynamic text based on flag_type
   - **Výška karty:** 24mm (zvýšené z 18mm pre text wrapping)

8. **Quick Wins** (lines 390-421)
   - Emerald green card
   - Top 3 optimizations
   - Numbered list s arrow → result
   - Format: "1. Action name → result"

#### PAGE 3: Technical Analysis
9. **Workflow Architecture** (lines 545-659)
   - White card with diagram
   - 3 boxes: TRIGGER → LOGIC LAYER → ACTION
   - Initial letters v kruhoch
   - Complexity badge (HIGH/MEDIUM/LOW)
   - Arrow connectors

10. **Error Analysis** (lines 88-172, conditional)
    - **Podmienka:** Zobrazí sa IBA ak existuje `error_loop` flag
    - Red card
    - Failure rate badge
    - Root Cause box
    - Estimated recovery savings
    - **Dynamická výška** - vypočítaná pred renderingom

11. **Cost Waste Analysis** (lines 174-286, conditional)
    - **Podmienka:** Zobrazí sa ak existuje `polling_trigger` ALEBO `late_filter_placement`
    - Blue header card
    - Vnorené opportunity cards:
      - Amber card pre polling (MEDIUM PRIORITY)
      - Rose card pre late filter (HIGH PRIORITY)
    - **Dynamická výška** - vypočítaná pred renderingom
    - Savings badges na spodku každej karty

### 2.3 Stránkovanie a Vykresľovanie

**ensureSpace(spaceNeeded) funkcia:**
```typescript
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
```

**Pattern:**
- Každá sekcia volá `ensureSpace()` pred renderingom
- `yPos` tracker pre vertikálnu pozíciu
- `pageHeight - margin - 15` = spodná hranica (footer space)

**drawPageFrame():**
- Volané na začiatku každej stránky
- Horná lišta (slate bar)
- Footer (delimiter + page number + branding + report ID)

### 2.4 Shadow Box Pattern
**Použité všade:**
```typescript
// Shadow (spodný, tmavší)
pdf.setFillColor(COLORS.BLUE.r, COLORS.BLUE.g, COLORS.BLUE.b);
pdf.roundedRect(margin, yPos, contentWidth - offset, height, 3, 3, 'FD');

// Main box (vrchný, svetlejší)
pdf.setFillColor(239, 246, 255); // blue-50
pdf.roundedRect(margin + offset, yPos, contentWidth - offset, height, 3, 3, 'FD');
```
- `offset = 1mm` - posun shadow boxu
- `roundedRect()` s radius 3mm

---

## 3. DÁTOVÝ MODEL (Current Interfaces)

### 3.1 TypeScript Interfaces (main.ts)

#### ParseResult (lines 10-27 v pdfGenerator.ts)
```typescript
export interface ParseResult {
  zap_count: number
  total_nodes: number
  message: string
  apps: Array<{ name: string; raw_api: string; count: number }>
  efficiency_flags: Array<EfficiencyFlag>
  efficiency_score: number        // 0-100
  estimated_savings: number        // Monthly USD
}
```

#### EfficiencyFlag (main.ts lines 18-31)
```typescript
interface EfficiencyFlag {
  zap_id: number
  zap_title: string
  flag_type: string              // "error_loop" | "late_filter_placement" | "polling_trigger"
  severity: string               // "low" | "medium" | "high"
  message: string
  details: string
  
  // Error analytics (len pre error_loop)
  error_rate?: number            // 0-100
  most_common_error?: string
  error_trend?: string           // "increasing" | "stable" | "decreasing"
  max_streak?: number            // Longest consecutive failure streak
  
  // Savings
  estimated_monthly_savings: number
  savings_explanation: string
  is_fallback: boolean           // true = estimated, false = actual data
}
```

### 3.2 Rust Structs (lib.rs)

**Kompletné struktury:**
```rust
struct UsageStats {
    total_runs: u32,
    success_count: u32,
    error_count: u32,
    error_rate: f32,              // 0-100
    has_task_history: bool,
    most_common_error: Option<String>,
    error_trend: Option<String>,
    max_streak: u32,
    last_run: Option<String>,     // ISO timestamp
}

struct ZapSummary {
    id: u64,
    title: String,
    status: String,
    step_count: usize,
    trigger_app: String,
    last_run: Option<String>,
    error_rate: Option<f32>,
    total_runs: u32,
}
```

### 3.3 Tok Dát

```
1. ZIP Upload → WASM
2. parse_zap_list(zip) → ZapListResult { zaps: Vec<ZapSummary> }
3. UI → Zap Selector Dashboard
4. User klikne → handleZapSelect(zapId)
5. parse_single_zap_audit(zip, zapId) → ParseResult
6. generatePDFReport(result, config) → PDF súbor
```

**CSV Parsing:**
- `parse_csv_files()` (lib.rs:282-407)
- Inteligentná detekcia: hľadá `zap_id` a `status` columns
- Agreguje execution records pre error analytics
- Nájde `last_run` timestamp (max timestamp)

---

## 4. VIZUÁLNE A FUNKČNÉ PRVKY

### 4.1 Farebná Paleta (pdfGenerator.ts lines 29-38)

```typescript
const COLORS = {
  BLUE: { r: 37, g: 99, b: 235 },       // #2563EB
  GREEN: { r: 5, g: 150, b: 105 },      // #059669
  RED: { r: 225, g: 29, b: 72 },        // #E11D48
  SLATE_50: { r: 248, g: 250, b: 252 },
  SLATE_200: { r: 226, g: 232, b: 240 },
  SLATE_300: { r: 203, g: 213, b: 225 },
  SLATE_400: { r: 148, g: 163, b: 184 },
  SLATE_600: { r: 71, g: 85, b: 105 },
  SLATE_700: { r: 51, g: 65, b: 85 },
  SLATE_900: { r: 15, g: 23, b: 42 }
}
```

**Použitie:**
- **BLUE:** Primary branding, headers, badges
- **GREEN:** Success, savings, improvements
- **RED:** Errors, critical issues, warnings
- **SLATE:** Backgrounds, text, borders

### 4.2 Komponenty

#### Shadow Box Pattern
- **Offset:** 1mm
- **Radius:** 3mm (všetky rounded rectangles)
- **Použité:** All cards (Executive Verdict, Metrics, Error Analysis, etc.)

#### Severity Badges
```typescript
// High severity
bg: RED, text: "CRITICAL", textColor: white

// Medium severity
bg: amber-500, text: "IMPORTANT", textColor: white

// Low severity
bg: GREEN, text: "OPTIMIZE", textColor: white
```

#### Arrow Indicators
```typescript
// Green arrow (for improvements)
pdf.line(x, y, x + 2.5, y);
pdf.triangle(x + 2.5, y - 2, x + 4, y - 1, x + 2.5, y, 'F');
// Color: COLORS.GREEN
```

**Použité v:**
- Before/After Comparison
- Quick Wins section

### 4.3 Typography

**Font:** Helvetica (built-in jsPDF font)

**Sizes:**
- Headers: 16pt (Technical Analysis), 10pt (section headers)
- Body: 9pt (normal text), 7pt (labels)
- Large numbers: 32pt (Efficiency Score), 24pt (Reliability)
- Small: 6pt (footers)

**Styles:**
- **bold** - headers, labels, numbers
- **normal** - body text
- **italic** - secondary info
- **bolditalic** - "Problem:", "Fix:" labels

---

## 5. HARDCODED HODNOTY

### 5.1 V PDF Generátore (pdfGenerator.ts)

**Metrics výpočty:**
```typescript
// Annual waste (line 817)
const annualWaste = Math.round(result.estimated_savings * 12 * 2.5);

// Optimized cost (line 818)
const optimizedCost = Math.round((result.estimated_savings || 0) * 12 * 0.1);

// Current yearly cost (v HTML template replacement)
const currentYearlyCost = Math.round((result.estimated_savings * 12) + annualSavings);
```

**Before/After defaults:**
```typescript
// Fallback values ak nie sú flags
const speedBefore = hasPolling ? 'Polling' : 'Standard';
const speedAfter = hasPolling ? 'Real-time' : 'Optimized';
```

**Sample runs fallback (line 648):**
```typescript
const totalRuns = (() => {
  let max = 150; // DEFAULT
  result.efficiency_flags.forEach(f => {
    const m = f.details.match(/(\d+) total runs/);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return max;
})();
```

### 5.2 V WASM Parseri (lib.rs)

**Pricing constants (lines 7-12):**
```rust
const TASK_PRICE: f32 = 0.02;  // $0.02 per task
const MONTHS_PER_YEAR: u32 = 12;
const POLLING_REDUCTION_RATE: f32 = 0.20;  // 20% overhead
const LATE_FILTER_FALLBACK_RATE: f32 = 0.30; // 30% rejection rate
```

**Thresholds:**
```rust
// Error loop detection (line 450)
if stats.total_runs > 0 && stats.error_rate > 10.0 {
  // Flag if > 10%
  severity: if stats.error_rate > 50.0 { "high" } else { "medium" }
}

// Error trend detection (lines 369-383)
if second_half_rate > first_half_rate * 1.2 { "increasing" }
else if second_half_rate < first_half_rate * 0.8 { "decreasing" }
else { "stable" }

// Significant streak (line 462)
if stats.max_streak > 3 { // Flag if > 3 consecutive failures
```

**Fallback estimates:**
```rust
// Late filter placement (line 621)
let estimated_monthly_runs = 100.0; // Default ak nie sú stats

// Polling trigger (line 713)
let estimated_monthly_checks = 100.0; // Default ak nie sú stats
```

### 5.3 V UI (main.ts)

**Report ID generation (lines 54-66):**
```typescript
function generateReportCode(reportId: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const dayOfYear = Math.floor(diff / oneDay).toString().padStart(3, '0');
  const paddedId = reportId.toString().padStart(5, '0');
  return `LHA-${year}-${dayOfYear}-${paddedId}`;
}
// Example: LHA-2026-032-00007
```

**Period constant:**
```typescript
const periodDays = '30'; // Currently hardcoded, always 30 days
```

---

## 6. LOGIKA ANALÝZY (Parser)

### 6.1 Efficiency Flags (Detekované Chyby)

#### 6.1.1 ERROR_LOOP (lib.rs:438-486)
**Trigger:**
- `stats.error_rate > 10.0`
- `stats.total_runs > 0` (musí mať execution data)

**Severity:**
- `error_rate > 50.0` → "high"
- Inak → "medium"

**Detaily:**
- Most common error message
- Error trend (increasing/stable/decreasing)
- Max consecutive failure streak
- Total errors / total runs

**Savings calculation:**
```rust
let monthly_savings = (stats.error_count as f32) * TASK_PRICE;
```

**Vždy používa ACTUAL data** (is_fallback = false)

#### 6.1.2 LATE_FILTER_PLACEMENT (lib.rs:537-641)
**Trigger:**
- Filter step na pozícii > 1 (nie hneď za triggerom)
- Existujú action steps PRED filterom

**Severity:** "high"

**Detaily:**
- Position of filter
- Number of action steps before filter
- Wasted task calculation

**Savings calculation:**
```rust
// S execution data:
let filter_rejection_rate = (total_runs - success_count) / total_runs;
let wasted_tasks = total_runs * actions_before_filter * rejection_rate;
let savings = wasted_tasks * TASK_PRICE;

// Bez data (fallback):
let estimated_monthly_runs = 100.0;
let fallback_savings = 100.0 * actions_before_filter * 0.30 * TASK_PRICE;
```

**is_fallback:** true ak nie sú stats, false ak sú actual data

#### 6.1.3 POLLING_TRIGGER (lib.rs:643-727)
**Trigger:**
- Trigger node používa polling app (RSS, WordPress, Google Sheets, atď.)

**Severity:** "medium"

**Polling apps list (lines 654-669):**
```rust
["RSS", "WordPress", "GoogleSheets", "GoogleForms", "Airtable", 
 "Excel", "Dropbox", "GoogleDrive", "OneDrive", "MySQL", 
 "PostgreSQL", "SQLServer", "MongoDB"]
```

**Detaily:**
- App name
- Polling vs webhook explanation

**Savings calculation:**
```rust
// VŽDY fallback/estimate (nie je spôsob zmerať polling overhead)
let savings = total_runs * TASK_PRICE * 0.20; // 20% reduction
```

**is_fallback:** Vždy true (nemožno zmerať actual overhead)

### 6.2 Efficiency Score (lib.rs:772-788)

```rust
fn calculate_efficiency_score(flags: &[EfficiencyFlag]) -> u32 {
    let mut score: i32 = 100;
    
    for flag in flags {
        match (flag.flag_type.as_str(), flag.severity.as_str()) {
            ("polling_trigger", "medium") => score -= 10,
            ("late_filter_placement", "high") => score -= 25,
            ("error_loop", "high") => score -= 30,
            ("error_loop", "medium") => score -= 20,
            _ => {}
        }
    }
    
    score.max(0) as u32
}
```

**Penalties:**
- Polling trigger: -10
- Late filter: -25
- Error loop (high): -30
- Error loop (medium): -20

### 6.3 CSV Parsing Intelligence (lib.rs:282-407)

**Inteligentná detekcia:**
```rust
let has_zap_id = headers.iter().any(|h| h.to_lowercase() == "zap_id");
let has_status = headers.iter().any(|h| h.to_lowercase() == "status");

if has_zap_id && has_status {
  // This is task history CSV!
}
```

**NIE filename-based** - hľadá columns

**Extracted columns:**
- `zap_id` (required)
- `status` (required)
- `error_message` (optional)
- `timestamp` (optional - pre last_run)

**Analytics:**
- Error count / Success count
- Error trend (first half vs second half)
- Max consecutive failure streak
- Most common error message
- Last run timestamp (max of all timestamps)

---

## 7. ZNÁME OBMEDZENIA A CHÝBAJÚCE FUNKCIE

### 7.1 OBMEDZENIA

1. **Single Zap Selection Only**
   - Aktuálne NIE JE možné vybrať viacero Zapov naraz
   - `parse_single_zap_audit()` prijíma len jeden `zap_id`
   - UI nemá checkboxy ani batch selection

2. **Žiadny Disclaimer**
   - Report nemá sekciu s právnym disclaimerom
   - Chýba vysvetlenie metodológie
   - Chýba "not official Zapier" notice

3. **Hardcoded estimáty**
   - Task price: $0.02 (môže sa líšiť podľa plánu)
   - Period: 30 days (nie je konfigurovateľné)
   - Fallback rates: 20%, 30% (industry estimates)

4. **HTML Template Dependencies**
   - Niektoré sekcie HTML reportu používajú template (`report_template.html`)
   - PDF používa iba programmatický rendering (žiadny template)

### 7.2 FUNKČNÉ, ALE LIMITOVANÉ

1. **CSV Parsing**
   - ✅ Funguje inteligentne (column detection)
   - ❌ Nepodporuje iné formáty (JSON task history)
   - ❌ Nemá validáciu dátumov (len string comparison)

2. **Error Analytics**
   - ✅ Trend detection funguje
   - ❌ Len simple first-half vs second-half comparison
   - ❌ Žiadne time-series visualization

3. **Savings Calculations**
   - ✅ Dynamické podľa actual data
   - ❌ Fallback estimates môžu byť nepresné
   - ❌ Žiadna confidence interval

---

## 8. SÚHRN PRE BATCH SELECTION IMPLEMENTÁCIU

### Čo funguje a môže sa použiť:
✅ Zap Selector Dashboard UI (search, filter, table rendering)  
✅ CSV parsing a usage stats extraction  
✅ Efficiency flags detection (3 typy)  
✅ PDF generation infrastructure (ensureSpace, drawPageFrame)  
✅ Report ID generation system  

### Čo treba upraviť pre Batch:
🔧 `handleZapSelect()` - prijímať `zapId[]` namiesto `zapId`  
🔧 `parse_single_zap_audit()` - nová funkcia `parse_batch_audit(zap_ids[])`  
🔧 UI checkboxes v Zap Selector table  
🔧 Aggregate report generation (multiple Zaps v jednom PDF)  
🔧 Batch summary section (overview všetkých vybraných Zapov)  

### Čo treba pridať pre Disclaimer:
➕ Nová PDF sekcia: Legal Disclaimer (Page 4 alebo footer)  
➕ Metodológia vysvetlenie (ako sú počítané savings)  
➕ "Not affiliated with Zapier" notice  
➕ Data privacy statement  

---

## 9. TECHNICKÉ POZNÁMKY

### 9.1 WASM Build
- Rust toolchain: stable
- Target: `wasm32-unknown-unknown`
- Build: `wasm-pack build --target web`
- Output: `src-wasm/pkg/`

### 9.2 Dependencies
- **Frontend:** Vite, TypeScript, Tailwind CSS, jsPDF
- **WASM:** wasm-bindgen, serde, zip, csv

### 9.3 File Structure
```
src/
  main.ts           - UI logic, selection, event handlers
  pdfGenerator.ts   - PDF rendering (2000 lines)
  pdfHelpers.ts     - Utility functions
src-wasm/
  src/lib.rs        - Parser, heuristics, CSV parsing
test-data/
  bad_example.json  - Test file with known issues
  real_history.csv  - Sample execution data
```

---

## 10. ODPORÚČANIA PRE ĎALŠÍ VÝVOJ

### Priorita 1: Batch Selection
1. Pridať UI checkboxes do Zap table
2. Vytvoriť `parse_batch_audit()` v lib.rs
3. Upraviť PDF generator pre aggregate report
4. Implementovať batch summary section

### Priorita 2: Disclaimer
1. Vytvoriť Legal Disclaimer section
2. Pridať na koniec PDF (Page 4)
3. Zahrnúť:
   - Methodology explanation
   - Not affiliated with Zapier
   - Estimates disclaimer
   - Data privacy notice

### Priorita 3: Vylepšenia
1. Konfigurovateľný task price
2. Confidence intervals pre savings
3. Time-series error visualization
4. Export to JSON (raw data)

---

**Koniec auditu. Tento dokument obsahuje REALITU v kóde k dátumu 2026-02-01.**
