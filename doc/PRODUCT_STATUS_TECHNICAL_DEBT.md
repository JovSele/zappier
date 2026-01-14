# Zapier Lighthouse - Product Status & Technical Debt Report

**Generated:** 2026-01-14  
**Purpose:** Complete context snapshot for new development sessions  
**Repository:** `/workspaces/zappier`

---

## 1. EXECUTIVE SUMMARY

Zapier Lighthouse is a privacy-first audit engine that analyzes Zapier export files locally in the browser using WebAssembly (Rust). The system parses ZIP archives containing `zapfile.json` and CSV files, detects inefficiency patterns, and generates professional PDF reports.

**Current Status:** ✅ Core functionality complete | ⚠️ Awaiting real task history data for full analytics

---

## 2. ENGINE CAPABILITIES (WASM/Rust)

### 2.1 What the Engine Currently Parses

**File:** `src-wasm/src/lib.rs`

#### ✅ Fully Implemented:
1. **ZIP Archive Processing**
   - Extracts all files from user-uploaded ZIP
   - Identifies `zapfile.json` (case-insensitive)
   - Identifies all `.csv` files in the archive
   - Uses `zip` crate v0.6 with `deflate` feature

2. **zapfile.json Parsing**
   - Complete struct mapping:
     - `ZapFile` → contains metadata and array of Zaps
     - `Zap` → id, title, status, nodes, usage_stats (optional)
     - `Node` → full step details (id, type_of, action, selected_api, etc.)
     - `TripleStores` → metadata like polling_interval_override
   - Error handling with line/column reporting
   - Serde JSON deserialization

3. **CSV File Detection & Parsing**
   - Uses `csv` crate v1.3 (with `default-features = false` for WASM)
   - Reads all CSV files from ZIP
   - Identifies CSV types by header analysis
   - **Current behavior:** Detects `task_history_download_urls.csv` but does NOT download external URLs (privacy-first principle)
   - Returns `HashMap<u64, UsageStats>` for linking to Zaps

4. **Data Structures for Usage Statistics**
   ```rust
   struct UsageStats {
       total_runs: u32,
       success_count: u32,
       error_count: u32,
       error_rate: f32,      // Percentage (0-100)
       has_task_history: bool,
   }
   ```

#### ⚠️ Partially Implemented:
- CSV parsing infrastructure exists but awaits **actual task history data** in ZIP files
- Current test data (`test-data/test.zip`) only contains `task_history_download_urls.csv` with URLs, not execution data
- `attach_usage_stats()` function ready but has no real data to process yet

#### ❌ Not Implemented:
- Downloading external URLs from CSV (intentionally blocked for privacy)
- Parsing task history JSON files (e.g., from `zap_runs/` directory if included)
- Time-series analysis of execution patterns
- Cost per Zap calculations based on actual run data

### 2.2 WASM Functions Exposed to JavaScript

1. **`hello_world()`** - Health check function
2. **`parse_zapier_export(zip_data: &[u8])`** - Main entry point for ZIP processing
3. **`parse_zapfile_json(json_content: &str)`** - Direct JSON parsing (for testing)

All functions return JSON strings containing:
```json
{
  "success": bool,
  "zap_count": number,
  "total_nodes": number,
  "message": string,
  "apps": [...],
  "efficiency_flags": [...],
  "efficiency_score": number,
  "estimated_savings": number
}
```

---

## 3. HEURISTICS STATUS (Audit Rules)

### 3.1 Implemented Heuristics

#### ✅ 1. Polling Trigger Detection
**Function:** `detect_polling_trigger()`  
**Logic:** Pattern matching on `selected_api` field  
**Data Source:** Static list of polling apps (RSS, WordPress, GoogleSheets, etc.)  
**Severity:** Medium  
**Estimated Savings:** $5/month per Zap (hardcoded estimate)  
**Status:** Production-ready, uses structural analysis only

**Apps Flagged:**
- RSS, WordPress, GoogleSheets, GoogleForms, Airtable
- Excel, Dropbox, GoogleDrive, OneDrive
- MySQL, PostgreSQL, SQLServer, MongoDB
- Schedule (everyDay, everyHour, etc.)

#### ✅ 2. Late Filter Placement
**Function:** `detect_late_filter_placement()`  
**Logic:** 
- Builds ordered node chain following `parent_id` relationships
- Detects filter steps (by action name or title containing "filter")
- Flags if filter is at position >1 (not right after trigger)
- Counts action steps before filter
**Data Source:** Zap structure (nodes, parent_id chain)  
**Severity:** High  
**Estimated Savings:** $15/month per Zap (hardcoded estimate)  
**Status:** Production-ready, uses structural analysis

#### ✅ 3. Error Loop Detection
**Function:** `detect_error_loop()`  
**Logic:** Checks if `usage_stats.error_rate > 10%`  
**Data Source:** **Requires real task history data** (not yet available)  
**Severity:** High (>50% error rate) | Medium (10-50% error rate)  
**Estimated Savings:** Not yet calculated (awaiting data)  
**Status:** ⚠️ **READY BUT INACTIVE** - awaits actual execution data

**Current Behavior:** Function exists but returns `None` because test data has no usage stats.

### 3.2 Hardcoded Estimates vs. Real Data

| Heuristic | Data Source | Estimate Method | Status |
|-----------|-------------|-----------------|--------|
| Polling Trigger | Structural | $5/month fixed | ✅ Active |
| Late Filter | Structural | $15/month fixed | ✅ Active |
| Error Loop | **Task History** | TBD based on actual failures | ⚠️ Awaiting data |

### 3.3 Scoring System

**Function:** `calculate_efficiency_score()`  
**Base Score:** 100  
**Deductions:**
- Polling Trigger (medium): -10 points
- Late Filter (high): -25 points
- Error Loop: Not yet factored in

**Function:** `calculate_estimated_savings()`  
**Current:** Simple sum of fixed estimates  
**Future:** Should use actual task consumption data

---

## 4. DATA FLOW ARCHITECTURE

### 4.1 End-to-End Flow

```
User Action (Drop/Upload ZIP)
        ↓
[Frontend: src/main.ts]
  - handleFileUpload()
  - Read file as ArrayBuffer
  - Convert to Uint8Array
        ↓
[WASM Module: src-wasm/pkg/]
  - parse_zapier_export(uint8Array)
        ↓
[Rust Engine: src-wasm/src/lib.rs]
  - Create Cursor from bytes (seekable reader)
  - Open ZipArchive
  - Extract zapfile.json → String
  - Extract all .csv files → Vec<String>
        ↓
  - Parse zapfile.json → ZapFile struct
  - Parse CSV files → HashMap<u64, UsageStats>
  - Attach usage stats to Zaps
        ↓
  - Run heuristics:
    * detect_polling_trigger()
    * detect_late_filter_placement()
    * detect_error_loop()
        ↓
  - Extract app inventory
  - Calculate efficiency score
  - Calculate estimated savings
        ↓
  - Serialize to JSON string
  - Return to JavaScript
        ↓
[Frontend: src/main.ts]
  - Parse JSON response
  - displayResults()
  - Render UI with stats/flags/apps
        ↓
User Actions:
  - Copy Report (text to clipboard)
  - Download PDF (jsPDF generation)
```

### 4.2 Key Data Structures

**Rust Side:**
```rust
ZapFile {
  metadata: Metadata,
  zaps: Vec<Zap>
}

Zap {
  id: u64,
  title: String,
  status: String,
  nodes: HashMap<String, Node>,
  usage_stats: Option<UsageStats>  // ← Links to CSV data
}

UsageStats {
  total_runs: u32,
  success_count: u32,
  error_count: u32,
  error_rate: f32,
  has_task_history: bool
}
```

**JavaScript Side:**
```typescript
interface ParseResult {
  success: boolean;
  zap_count: number;
  total_nodes: number;
  message: string;
  apps: Array<AppInfo>;
  efficiency_flags: Array<EfficiencyFlag>;
  efficiency_score: number;
  estimated_savings: number;
}
```

---

## 5. MISSING PIECES & TECHNICAL DEBT

### 5.1 Data Gaps

#### 🔴 Critical: Real Task History Data
**Problem:** Test ZIP (`test-data/test.zip`) only contains `task_history_download_urls.csv` with URLs, not actual execution data.

**Impact:**
- Error loop detection cannot activate
- Cannot calculate actual task waste
- Cannot provide accurate cost savings
- Usage stats remain unpopulated

**Solution Needed:**
1. Obtain real Zapier export with task history JSON files included
2. Or create synthetic task history CSV with columns:
   ```
   zap_id,zap_name,execution_id,status,timestamp,task_count
   ```
3. Parse these files in `parse_csv_files()` function
4. Populate `UsageStats` with real counts

#### 🟡 Medium: Enhanced CSV Parsing
**Current:** Basic CSV reader with header detection  
**Needed:**
- Column mapping for different CSV formats
- Parsing task history JSON files (if gzipped in ZIP)
- Aggregation logic (count successes/errors per Zap)
- Time-series data extraction

#### 🟡 Medium: Advanced Heuristics
**Not Yet Implemented:**
- Task waste calculation (actual runs on filtered items)
- Expensive action detection (multi-step Zaps)
- Authentication failure patterns
- Zap complexity scoring
- Unused Zap detection (status="off" + no recent runs)

### 5.2 UI/UX Gaps

#### 🟡 Medium: Usage Stats Display
**Current:** UI shows efficiency flags but not per-Zap usage statistics  
**Needed:**
- Display `total_runs`, `error_rate` for each Zap
- Visual indicators for error loops
- Timeline/graph of execution patterns (if time-series data available)

#### 🟢 Low: PDF Customization
**Current:** Default white-label config (agency name only)  
**Potential:**
- UI form to customize agency name/logo before PDF generation
- Template selection
- Custom color schemes

### 5.3 Code Quality

#### ✅ Good:
- Comprehensive error handling in Rust
- Type-safe data structures
- Professional code comments
- Zero compilation warnings

#### 🟡 Can Improve:
- Add unit tests in Rust (currently no test coverage)
- Add integration tests for ZIP parsing
- Mock data for error loop testing
- TypeScript could use stricter typing (some `any` types)

---

## 6. ENVIRONMENT & BUILD

### 6.1 Project Structure
```
/workspaces/zappier/
├── src/
│   ├── main.ts          # Frontend logic
│   └── style.css        # Tailwind styles
├── src-wasm/
│   ├── Cargo.toml       # Rust dependencies
│   ├── src/
│   │   └── lib.rs       # WASM engine
│   └── pkg/             # Compiled WASM output
├── test-data/
│   ├── test.zip         # Test Zapier export
│   └── bad_example.json # Test JSON
├── index.html           # Entry point
└── package.json         # Node dependencies
```

### 6.2 Key Dependencies

#### Rust (Cargo.toml)
```toml
[dependencies]
wasm-bindgen = "0.2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
zip = { version = "0.6", default-features = false, features = ["deflate"] }
csv = { version = "1.3", default-features = false }
```

#### JavaScript (package.json)
```json
{
  "dependencies": {
    "jspdf": "^2.x.x",
    "html2canvas": "^1.x.x"
  },
  "devDependencies": {
    "typescript": "^5.x.x",
    "vite": "^5.x.x",
    "tailwindcss": "^3.x.x"
  }
}
```

### 6.3 Build Commands

#### Development
```bash
# Start dev server (automatically rebuilds on changes)
npm run dev

# Build WASM module
cd src-wasm
wasm-pack build --target web
cd ..

# Build for production
npm run build
```

#### WASM Build Details
- **Target:** `wasm32-unknown-unknown`
- **Optimization:** `opt-level = "z"` (size optimization)
- **Features:** LTO enabled, code stripped
- **Output:** `src-wasm/pkg/` directory
  - `zapier_lighthouse_wasm.js` - JS bindings
  - `zapier_lighthouse_wasm_bg.wasm` - Binary
  - `zapier_lighthouse_wasm.d.ts` - TypeScript definitions

### 6.4 Runtime Environment
- **WASM Module:** Loaded asynchronously in browser
- **No Server Required:** Pure client-side execution
- **Browser Support:** Modern browsers with WASM support
- **Privacy:** Zero network requests after initial page load

---

## 7. TESTING STATUS

### 7.1 Test Data Available

**File:** `test-data/test.zip`  
**Contents:**
- `zapfile.json` - 4 Zaps with various configurations
- `task_history_download_urls.csv` - URLs only (not actual data)
- Several empty MCP/knowledge JSON files

**Detected Issues in Test Data:**
- Zap #236364045 "Wordpress to Reddit": Polling trigger (WordPress)
- Zap #288404013 "Untitled Zap": Polling trigger (Schedule)

**File:** `test-data/bad_example.json`  
**Purpose:** Direct JSON testing without ZIP
**Contents:** 2 Zaps with known issues

### 7.2 Test Coverage

#### ✅ Tested:
- ZIP extraction
- JSON parsing
- Polling trigger detection
- Late filter detection
- App inventory extraction
- PDF generation

#### ❌ Not Tested:
- CSV parsing with real data
- Error loop detection (no data)
- Usage stats attachment
- Edge cases (malformed ZIP, corrupt JSON)
- Performance with large Zapier exports (100+ Zaps)

---

## 8. DEPLOYMENT STATUS

### 8.1 Current State
- **Local Development:** ✅ Fully functional
- **Production Build:** ✅ Works with `npm run build`
- **Hosting:** Not yet deployed
- **CI/CD:** Not configured

### 8.2 Deployment Checklist
- [ ] Choose hosting platform (Vercel, Netlify, GitHub Pages)
- [ ] Configure build pipeline
- [ ] Add environment variables (if needed)
- [ ] Test WASM loading in production
- [ ] Set up custom domain
- [ ] Add analytics (privacy-respecting)

---

## 9. DOCUMENTATION

### 9.1 Existing Docs
- ✅ `README.md` - Project overview
- ✅ `CSV_PARSING_IMPLEMENTATION.md` - Detailed CSV implementation notes
- ✅ `PRODUCT_STATUS_REPORT.md` - Previous status snapshot
- ✅ This document - Comprehensive technical reference

### 9.2 Missing Docs
- ⚠️ API documentation for WASM functions
- ⚠️ User guide / tutorial
- ⚠️ White-label customization guide
- ⚠️ Heuristics explanation for end-users

---

## 10. IMMEDIATE NEXT STEPS

### Priority 1: Get Real Data
1. Obtain actual Zapier export with task history data
2. Create synthetic task history CSV for testing
3. Update test fixtures in `test-data/`

### Priority 2: Complete Error Loop Feature
1. Test `detect_error_loop()` with real data
2. Update savings calculation to include error-related waste
3. Add UI display for per-Zap error rates

### Priority 3: Testing & Quality
1. Add Rust unit tests
2. Create integration test suite
3. Test with large exports (performance)

### Priority 4: Production Readiness
1. Deploy to hosting platform
2. Add monitoring/analytics
3. Create user documentation

---

## 11. KNOWN ISSUES & WORKAROUNDS

### Issue 1: No Real Task History Data
**Impact:** Error loop detection inactive  
**Workaround:** System still provides value with structural heuristics  
**Resolution:** Awaiting real data or synthetic test data

### Issue 2: PDF Logo Support
**Status:** Interface exists but not exposed in UI  
**Workaround:** Hardcoded agency name in PDF generation  
**Resolution:** Add UI form for customization

### Issue 3: CSV Parsing Ambiguity
**Problem:** `task_history_download_urls.csv` contains URLs, not data  
**Impact:** Cannot parse without violating privacy principle  
**Resolution:** Need task history data bundled in ZIP, not external URLs

---

## 12. GLOSSARY

- **Zap:** A workflow automation in Zapier
- **Node:** A single step in a Zap (trigger or action)
- **Trigger:** The first step that initiates a Zap (type_of: "read")
- **Action:** A step that performs work (type_of: "write")
- **Polling:** Checking for new data at intervals (vs. instant webhooks)
- **Filter:** A condition step that stops execution if criteria not met
- **Task:** Billable execution unit in Zapier
- **WASM:** WebAssembly - compiled binary format for web
- **Privacy-First:** All processing happens locally, no data sent to servers

---

## APPENDIX: Quick Reference Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build WASM (if Rust code changed)
cd src-wasm && wasm-pack build --target web && cd ..

# Build for production
npm run build

# Preview production build
npm run preview

# Test WASM directly (in Rust project)
cd src-wasm && cargo test
```

---

**End of Report**  
**Next Session Context:** Copy this entire document to preserve full understanding of project state.
