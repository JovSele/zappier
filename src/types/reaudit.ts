/**
 * Re-Audit Metadata System
 * 
 * This module provides types and utilities for managing re-audit metadata.
 * Re-audit metadata tracks critical information about generated audit reports,
 * enabling report verification, pricing snapshot preservation, and historical analysis.
 * 
 * The metadata includes:
 * - Report identification and timestamps
 * - Pricing information at the time of report generation
 * - Analyzed Zap IDs for traceability
 * - File integrity verification via SHA-256 hash
 * 
 * @module reaudit
 */

/**
 * Pricing snapshot captured at the time of report generation.
 * Preserves the pricing tier information used in the audit analysis.
 */
export interface PricingSnapshot {
  plan_type: string;
  tier_tasks: number;
  tier_price: number;
  price_per_task: number;
}

/**
 * Re-audit metadata structure for tracking audit report information.
 * This metadata is embedded in audit reports to enable future re-auditing
 * and historical analysis of Zapier account usage.
 * 
 * @interface ReAuditMetadata
 */
export interface ReAuditMetadata {
  /** Unique numeric identifier for the report */
  report_id: number;
  
  /** Human-readable report code/reference */
  report_code: string;
  
  /** ISO 8601 timestamp of when the report was generated */
  generation_timestamp: string;
  
  /** Snapshot of pricing information at report generation time */
  pricing_snapshot: PricingSnapshot;
  
  /** Array of Zap IDs that were analyzed in this report */
  zap_ids_analyzed: string[];
  
  /** SHA-256 hash of the ZIP file for integrity verification */
  file_hash: string;
  
  /** Version of the metadata schema (currently "1.0.0") */
  metadata_version: string;
}

/**
 * Generates a SHA-256 hash of the provided file data using the Web Crypto API.
 * This hash is used for file integrity verification in re-audit scenarios.
 * 
 * @param fileData - The file content as a Uint8Array
 * @returns Promise that resolves to the hex-encoded SHA-256 hash
 * 
 * @example
 * ```typescript
 * const fileData = new Uint8Array([1, 2, 3, 4, 5]);
 * const hash = await generateFileHash(fileData);
 * console.log(hash); // "74f81fe167d99b4cb41d6d0ccda82278caee9f3e2f25d5e5a3936ff3dcec60d0"
 * ```
 */
export async function generateFileHash(fileData: BufferSource): Promise<string> {
  // Use Web Crypto API to compute SHA-256 hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileData);
  
  // Convert ArrayBuffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * Serializes re-audit metadata to a JSON string.
 * 
 * @param metadata - The ReAuditMetadata object to serialize
 * @returns JSON string representation of the metadata
 * 
 * @example
 * ```typescript
 * const metadata: ReAuditMetadata = {
 *   report_id: 1,
 *   report_code: "AUDIT-2024-001",
 *   generation_timestamp: "2024-01-15T10:30:00Z",
 *   pricing_snapshot: {
 *     plan_type: "Professional",
 *     tier_tasks: 50000,
 *     tier_price: 49.99,
 *     price_per_task: 0.001
 *   },
 *   zap_ids_analyzed: ["123", "456"],
 *   file_hash: "abc123...",
 *   metadata_version: "1.0.0"
 * };
 * const json = serializeMetadata(metadata);
 * ```
 */
export function serializeMetadata(metadata: ReAuditMetadata): string {
  return JSON.stringify(metadata, null, 2);
}

/**
 * Deserializes and validates re-audit metadata from a JSON string.
 * 
 * @param jsonString - JSON string containing the metadata
 * @returns Parsed and validated ReAuditMetadata object
 * @throws Error if metadata_version is not "1.0.0"
 * @throws Error if required fields (report_code, zap_ids_analyzed) are missing
 * @throws Error if JSON parsing fails
 * 
 * @example
 * ```typescript
 * const jsonString = '{"report_id": 1, "report_code": "AUDIT-001", ...}';
 * try {
 *   const metadata = deserializeMetadata(jsonString);
 *   console.log(metadata.report_code);
 * } catch (error) {
 *   console.error("Invalid metadata:", error.message);
 * }
 * ```
 */
export function deserializeMetadata(jsonString: string): ReAuditMetadata {
  let metadata: any;
  
  try {
    metadata = JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Failed to parse metadata JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Validate metadata_version
  if (!metadata.metadata_version) {
    throw new Error('Missing required field: metadata_version');
  }
  
  if (metadata.metadata_version !== '1.0.0') {
    throw new Error(`Unsupported metadata version: ${metadata.metadata_version}. Expected "1.0.0"`);
  }
  
  // Validate required fields
  if (!metadata.report_code) {
    throw new Error('Missing required field: report_code');
  }
  
  if (!metadata.zap_ids_analyzed) {
    throw new Error('Missing required field: zap_ids_analyzed');
  }
  
  if (!Array.isArray(metadata.zap_ids_analyzed)) {
    throw new Error('Field zap_ids_analyzed must be an array');
  }
  
  return metadata as ReAuditMetadata;
}
