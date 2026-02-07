# Zapier Test Fixtures - Popis

Vytvorené: 2026-02-07

## Obsah

Tento balík obsahuje 4 testovacie ZIP súbory pre testing kompatibility Zapier parsera.

---

## 1. standard.zip ✅ (Baseline)

**Formát:** Moderný Zapier export (2024+)

**Obsah:**
- `zapfile.json` - 10 Zapov s modernými field names (title, state, steps)
- `task_history/` - 3 CSV súbory s task execution history

**Zaps:**
- Gmail → Sheets (normálna success rate)
- RSS → Slack (polling trigger, vysoká frekvencia)
- Facebook → CRM (formatter chain)
- Test Zap 2022 (zombie - žiadne runy)
- Invoice Processor (late filter + formatters)
- WordPress → Twitter (paused)
- Typeform → Email (nový Zap)
- Broken Auth Test (100% error rate)
- Zombie Campaign (starý, nepoužívaný)
- Complex Formatter Chain (12 formatters)

**Expected behavior:** Mal by fungovať OK s current toolom

**Účel:** Baseline pre verifikáciu, že nič sme nerozbili

---

## 2. legacy.zip ⚠️ (Starý formát)

**Formát:** Starý Zapier export (2020-2023)

**Odlišnosti od standard.zip:**
- `zaps.json` namiesto `zapfile.json`
- `history/` namiesto `task_history/`
- CSV súbory: `12345.csv` namiesto `zap_12345_history.csv`
- JSON fields: `name` namiesto `title`, `status` namiesto `state`, `actions` namiesto `steps`
- CSV headers: `id,result,timestamp,error` namiesto `task_id,status,started_at,error_message`

**Expected behavior:** Crashne bez flexible path search a serde aliases

**Účel:** Test backward compatibility

---

## 3. partial.zip ⚠️ (Config only)

**Formát:** Export bez task history

**Obsah:**
- `zapfile.json` - iba konfigurácia Zapov
- ŽIADNY `task_history/` adresár

**Expected behavior:** Crashne ak tool vyžaduje CSV data

**Účel:** Test graceful degradation - tool by mal vygenerovať partial report s warningom

---

## 4. urlonly.zip ⚠️ (URL links)

**Formát:** Export s len download linkami (veľké accounty)

**Obsah:**
- `zapfile.json` - konfigurácia
- `task_history/task_history_download_urls.csv` - CSV s URL linkami na download

**Expected behavior:** Rovnaké ako partial.zip (žiadne skutočné CSV data)

**Účel:** Test handling URL-only exports (common pre 100+ Zap accounts)

---

## Test Scenáre

### Scenár 1: Current State
Upload všetky 4 ZIPy do current toolu a dokumentuj:
- Ktoré fungujú ✅
- Ktoré crashnú ❌
- Aké error messages

### Scenár 2: Po implementácii flexible paths (P0)
- `standard.zip` - still works ✅
- `legacy.zip` - now works ✅
- `partial.zip` - still crashes (expected)
- `urlonly.zip` - still crashes (expected)

### Scenár 3: Po implementácii serde aliases (P1)
- All JSON parsing works ✅
- Legacy format fully supported ✅

### Scenár 4: Po implementácii partial mode (P2)
- `partial.zip` - generates limited report with warning ✅
- `urlonly.zip` - generates limited report with warning ✅
- No crashes ✅

---

## Ako použiť

1. Skopíruj všetky 4 ZIPy do `/test-fixtures/` tvojho projektu
2. Vytvor test harness (Prompt 0)
3. Spusti testy: `cargo test compatibility_tests -- --nocapture`
4. Dokumentuj results
5. Implementuj fixes postupne (Prompt 1, 2, 3...)
6. Verify po každom fixe

---

## Očakávané výsledky po všetkých fixoch

| ZIP | Parse zapfile | Parse CSV | Generate PDF | Notes |
|-----|--------------|-----------|--------------|-------|
| standard.zip | ✅ | ✅ | ✅ Full report | Baseline |
| legacy.zip | ✅ | ✅ | ✅ Full report | After aliases |
| partial.zip | ✅ | N/A | ✅ Partial + warning | Config only |
| urlonly.zip | ✅ | N/A | ✅ Partial + warning | URLs ignored |

---

Úspech = 4/4 ZIPy handled gracefully (no crashes, professional output)
