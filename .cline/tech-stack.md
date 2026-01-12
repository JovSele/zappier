# TECH STACK & ARCHITECTURE

## Core Technologies
- **Frontend:** Vite + TypeScript (Vanilla/minimalist)
- **Engine:** Rust (compiled to WASM)
- **Glue:** wasm-bindgen / wasm-pack
- **Styling:** Tailwind CSS (utility-first)

## Architecture Principles
1. **Local-First / Privacy-First:** Data NEVER leaves the browser. No external API calls for data processing.
2. **WASM for Logic:** All heavy lifting (parsing ZIP, calculating metrics, heuristics) must be done in Rust/WASM.
3. **TypeScript for UI/IO:** TS handles File API, Drag & Drop, and rendering the report.
4. **Stateless:** The application does not store data between sessions (unless using LocalStorage for configuration).

## Development Workflow
- Rust code resides in `/src-wasm`.
- UI code resides in `/src`.
- Compilation: `wasm-pack build --target web`.

## Code Protection: 
- Pri implementácii HMAC/JWT validácie tokenov musí byť kľúčová overovacia logika vždy v Ruste (WASM), nikdy nie v čistom JavaScripte, aby sa sťažilo obchádzanie licencií.