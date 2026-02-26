/* tslint:disable */
/* eslint-disable */

/**
 * Main v1.0.0 audit function - Complete end-to-end analysis
 * Returns AuditResultV1 (canonical schema) as JSON
 */
export function analyze_zaps(zip_data: Uint8Array, selected_zap_ids: any[], plan_str: string, actual_usage: number): any;

/**
 * Hello world test function to verify WASM compilation
 */
export function hello_world(): string;

/**
 * NEW: Parse Zap List (Quick Preview - NO HEURISTICS)
 * Fast function to extract basic Zap information for dashboard selector
 * Does NOT run efficiency analysis - only extracts metadata
 */
export function parse_zap_list(zip_data: Uint8Array): string;

/**
 * Parse zapfile.json directly (for testing without ZIP)
 */
export function parse_zapfile_json(json_content: string): string;

/**
 * Main entry point: Parse Zapier ZIP export
 * 
 * This function accepts ZIP file data as bytes and:
 * 1. Creates a seekable Cursor reader for WASM environment
 * 2. Opens the ZIP archive
 * 3. Finds and parses zapfile.json
 * 4. Parses CSV files for task history data
 * 5. Returns comprehensive analysis with usage statistics
 */
export function parse_zapier_export(zip_data: Uint8Array): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly analyze_zaps: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly hello_world: (a: number) => void;
  readonly parse_zap_list: (a: number, b: number, c: number) => void;
  readonly parse_zapfile_json: (a: number, b: number, c: number) => void;
  readonly parse_zapier_export: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export: (a: number, b: number) => number;
  readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
