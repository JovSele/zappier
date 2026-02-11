/**
 * Runtime validation for WASM AuditResult output
 * 
 * MAINTENANCE CHECKLIST:
 * When adding new fields to v1.0.0 schema in WASM:
 * 1. Update audit_schema_v1.rs structs (Rust)
 * 2. Update src/types/audit-schema.d.ts (TypeScript types)
 * 3. Update THIS validator
 * 4. Add test case in testBrokenData()
 * 
 * MIGRATION TRIGGER:
 * When schema versioning starts (v1.1, v2.0), migrate to Zod.
 */

import type { AuditResult } from './types/audit-schema'

/**
 * Validates WASM output and throws detailed errors on failure.
 * Use TypeScript's 'asserts' return type for type narrowing.
 */
export function validateAuditResult(obj: unknown): asserts obj is AuditResult {
  // === STEP 1: Basic Structure ===
  if (!obj || typeof obj !== 'object') {
    throw new Error('Invalid audit result: not an object')
  }
  
  const result = obj as Partial<AuditResult>
  
  // === STEP 2: Schema Version ===
  if (result.schema_version !== '1.0.0') {
    throw new Error(
      `Invalid schema version: expected "1.0.0", got "${result.schema_version}"`
    )
  }
  
  // === STEP 3: Required Top-Level Fields ===
  if (!result.audit_metadata) {
    throw new Error('Missing required field: audit_metadata')
  }
  
  if (!result.global_metrics) {
    throw new Error('Missing required field: global_metrics')
  }
  
  if (!Array.isArray(result.per_zap_findings)) {
    throw new Error('per_zap_findings must be an array')
  }
  
  if (!Array.isArray(result.opportunities_ranked)) {
    throw new Error('opportunities_ranked must be an array')
  }
  
  if (!result.plan_analysis) {
    throw new Error('Missing required field: plan_analysis')
  }
  
  // === STEP 4: Critical Numeric Fields (with NaN check) ===
  const { global_metrics } = result
  
  if (typeof global_metrics.total_zaps !== 'number' || isNaN(global_metrics.total_zaps)) {
    throw new Error('total_zaps must be a valid number')
  }
  
  if (typeof global_metrics.estimated_annual_waste_usd !== 'number' || 
      isNaN(global_metrics.estimated_annual_waste_usd)) {
    throw new Error('estimated_annual_waste_usd must be a valid number (not NaN)')
  }
  
  if (typeof global_metrics.estimated_monthly_waste_usd !== 'number' ||
      isNaN(global_metrics.estimated_monthly_waste_usd)) {
    throw new Error('estimated_monthly_waste_usd must be a valid number (not NaN)')
  }
  
  // Negative check
  if (global_metrics.estimated_annual_waste_usd < 0) {
    throw new Error('estimated_annual_waste_usd cannot be negative')
  }
  
  // === STEP 5: Data Consistency Checks (CRITICAL!) ===
  
  // Check: Empty findings but total_zaps > 0 (WASM mapping bug)
  if (result.per_zap_findings.length === 0 && global_metrics.total_zaps > 0) {
    throw new Error(
      `Data Inconsistency: Found ${global_metrics.total_zaps} Zaps but per_zap_findings is empty. ` +
      `This indicates a WASM mapping bug.`
    )
  }
  
  // Check: Findings exist but total_zaps = 0
  if (result.per_zap_findings.length > 0 && global_metrics.total_zaps === 0) {
    throw new Error(
      `Data Inconsistency: per_zap_findings has ${result.per_zap_findings.length} items ` +
      `but total_zaps is 0`
    )
  }
  
  // Check: Count mismatch
  if (result.per_zap_findings.length !== global_metrics.total_zaps) {
    throw new Error(
      `Data Inconsistency: per_zap_findings has ${result.per_zap_findings.length} items ` +
      `but total_zaps is ${global_metrics.total_zaps}`
    )
  }
  
  // === STEP 6: Validate Each Finding ===
  result.per_zap_findings.forEach((finding, index) => {
    if (!finding.zap_id) {
      throw new Error(`Finding at index ${index} missing zap_id`)
    }
    
    if (!finding.zap_name) {
      throw new Error(`Finding at index ${index} (zap_id: ${finding.zap_id}) missing zap_name`)
    }
    
    if (!['High', 'Medium', 'Low'].includes(finding.confidence)) {
      throw new Error(
        `Finding at index ${index} has invalid confidence: ${finding.confidence}`
      )
    }
    
    if (!Array.isArray(finding.flags)) {
      throw new Error(`Finding at index ${index} has invalid flags (not an array)`)
    }
    
    // Validate each flag
    finding.flags.forEach((flag, flagIndex) => {
      if (typeof flag.impact?.estimated_monthly_savings_usd !== 'number' ||
          isNaN(flag.impact.estimated_monthly_savings_usd)) {
        throw new Error(
          `Finding ${index}, Flag ${flagIndex}: estimated_monthly_savings_usd is invalid`
        )
      }
      
      if (flag.impact.estimated_monthly_savings_usd < 0) {
        throw new Error(
          `Finding ${index}, Flag ${flagIndex}: negative savings (${flag.impact.estimated_monthly_savings_usd})`
        )
      }
    })
  })
  
  // === STEP 7: Pricing Assumptions (Critical for Financial Calculations) ===
  const { pricing_assumptions } = result.audit_metadata
  
  if (!pricing_assumptions) {
    throw new Error('Missing pricing_assumptions in audit_metadata')
  }
  
  if (typeof pricing_assumptions.task_price_usd !== 'number' ||
      pricing_assumptions.task_price_usd <= 0) {
    throw new Error(
      `Invalid task_price_usd: ${pricing_assumptions.task_price_usd} (must be positive number)`
    )
  }
  
  // === STEP 8: Timestamp Validation ===
  if (!result.audit_metadata.generated_at) {
    throw new Error('Missing generated_at timestamp')
  }
  
  try {
    new Date(result.audit_metadata.generated_at)
  } catch {
    throw new Error(`Invalid timestamp format: ${result.audit_metadata.generated_at}`)
  }
}

/**
 * Test function for dev console
 * Run in browser: testBrokenData()
 */
export function testBrokenData() {
  console.log('🧪 Testing validation with broken data...')
  
  let passed = 0
  let failed = 0
  
  // Test 1: Wrong schema version
  try {
    validateAuditResult({ schema_version: '2.0.0' })
    console.error('❌ TEST 1 FAILED: Should reject wrong version')
    failed++
  } catch (e) {
    console.log('✅ TEST 1 PASSED: Rejected wrong version')
    passed++
  }
  
  // Test 2: Data inconsistency
  try {
    validateAuditResult({
      schema_version: '1.0.0',
      audit_metadata: {},
      global_metrics: { total_zaps: 5, estimated_annual_waste_usd: 0, estimated_monthly_waste_usd: 0 },
      per_zap_findings: [],  // Empty but total_zaps = 5
      opportunities_ranked: [],
      plan_analysis: {}
    })
    console.error('❌ TEST 2 FAILED: Should detect inconsistency')
    failed++
  } catch (e) {
    console.log('✅ TEST 2 PASSED: Detected data inconsistency')
    passed++
  }
  
  // Test 3: NaN in savings
  try {
    validateAuditResult({
      schema_version: '1.0.0',
      audit_metadata: { pricing_assumptions: { task_price_usd: 0.01 }, generated_at: new Date().toISOString() },
      global_metrics: {
        total_zaps: 0,
        estimated_annual_waste_usd: NaN,  // Invalid!
        estimated_monthly_waste_usd: 0
      },
      per_zap_findings: [],
      opportunities_ranked: [],
      plan_analysis: {}
    })
    console.error('❌ TEST 3 FAILED: Should reject NaN')
    failed++
  } catch (e) {
    console.log('✅ TEST 3 PASSED: Rejected NaN value')
    passed++
  }
  
  console.log(`\n🎉 Validation tests complete: ${passed} passed, ${failed} failed`)
  return { passed, failed }
}
