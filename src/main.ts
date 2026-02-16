import './style.css'
import init, { 
  hello_world, 
  parse_zapfile_json, 
  parse_zap_list, 
  //parse_single_zap_audit, 15.2.2026
  analyze_zaps  // ✅ v1.0.0 API (replaces parse_batch_audit)
} from '../src-wasm/pkg/zapier_lighthouse_wasm'

import { PDFDocument } from 'pdf-lib'
import { 
  generateExecutiveAuditPDF,
  mapAuditToPdfViewModel,
  type PDFConfig
} from './pdfGenerator'
import type { AuditResult } from './types/audit-schema'
import { validateAuditResult } from './validation'
import type { ReAuditMetadata } from './types/reaudit'
import { 
  generateFileHash, 
  deserializeMetadata 
} from './types/reaudit'

// Keep ParseResult for legacy single-zap workflow (will be migrated later)
type ParseResult = any

// Type definitions
interface ZapSummary {
  id: number
  title: string
  status: string
  step_count: number
  trigger_app: string
  last_run: string | null
  error_rate: number | null
  total_runs: number
}

interface EfficiencyFlag {
  zap_id: number
  zap_title: string
  flag_type: string
  severity: string
  message: string
  details: string
  error_rate?: number  // Only present for error_loop flags
  most_common_error?: string
  error_trend?: string
  max_streak?: number
  estimated_monthly_savings: number
  estimated_annual_savings: number  // NEW: Centralized from WASM (monthly * 12)
  formatted_monthly_savings: string  // Pre-formatted for PDF display (e.g., "$2.3k")
  formatted_annual_savings: string  // Pre-formatted for PDF display (e.g., "$27.6k")
  savings_explanation: string
  is_fallback: boolean
  confidence: string  // "high" | "medium" | "low" - PHASE 2: Trust indicator
}

interface ZapListResult {
  success: boolean
  message: string
  zaps: ZapSummary[]
}

// ============================================================================
// REPORT ID & AUDIT LOG SYSTEM
// ============================================================================

/**
 * Get next report ID from localStorage and increment counter
 */
// ============================================================================
// REPORT ID & AUDIT LOG SYSTEM (TAMPER-RESISTANT)
// ============================================================================

/**
 * Initialize first install timestamp (cannot be reset easily)
 */
function initFirstInstall(): string {
  let firstInstall = localStorage.getItem('first_install_timestamp')
  if (!firstInstall) {
    firstInstall = new Date().toISOString()
    localStorage.setItem('first_install_timestamp', firstInstall)
    // First install timestamp initialized
  }
  return firstInstall
}

/**
 * Get next report ID from localStorage and increment counter
 */
function getNextReportId(): number {
  initFirstInstall() // Ensure first install is set
  const current = parseInt(localStorage.getItem('audit_counter') || '0')
  const next = current + 1
  localStorage.setItem('audit_counter', next.toString())
  return next
}

/**
 * Generate formatted report code with date hash
 * Format: LHA-2026-026-00007
 * Where: year-dayOfYear-counter
 */
function generateReportCode(reportId: number): string {
  const now = new Date()
  const year = now.getFullYear()
  
  // Day of year (001-366)
  const start = new Date(year, 0, 0)
  const diff = now.getTime() - start.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  const dayOfYear = Math.floor(diff / oneDay).toString().padStart(3, '0')
  
  const paddedId = reportId.toString().padStart(5, '0')
  return `LHA-${year}-${dayOfYear}-${paddedId}`
}


/**
 * Save audit entry to localStorage
 */
function saveAuditLog(reportId: number, reportCode: string, zapId: number, zapTitle: string) {
  const logs = JSON.parse(localStorage.getItem('auditLogs') || '[]')
  logs.push({
    report_id: reportId,
    report_code: reportCode,
    zap_id: zapId,
    zap_title: zapTitle,
    timestamp: new Date().toISOString(),
    report_type: 'full_audit'
  })
  localStorage.setItem('auditLogs', JSON.stringify(logs))
}

// Initialize WASM module
let wasmReady = false

// NEW: State management for cached ZIP data
let cachedZipData: Uint8Array | null = null
let zapList: ZapSummary[] = []

// NEW: Batch Selection State Management
let selectedZapIds: Set<number> = new Set()

// NEW: Cost Calibration State
let pricePerTask: number = 0.02 // Default: $0.02/task (industry benchmark)
let isCustomPrice: boolean = false // Track if user provided custom pricing
let monthlyBill: number = 0
let includedTasks: number = 0

// Pricing Tier Slider State
let currentPlanType: 'professional' | 'team' = 'professional'
let currentTierIndex: number = 0

// Exact pricing tiers from Zapier
const PRICING_TIERS = {
  professional: [
    [750, 19.99],
    [1500, 39],
    [2000, 49],
    [5000, 89],
    [10000, 129],
    [20000, 189],
    [50000, 289],
    [100000, 489],
    [200000, 769],
    [300000, 1069],
    [400000, 1269],
    [500000, 1499],
    [750000, 1999],
    [1000000, 2199],
    [1500000, 2999],
    [1750000, 3199],
    [2000000, 3389]
  ] as Array<[number, number]>,
  team: [
    [2000, 69],
    [5000, 119],
    [10000, 169],
    [20000, 249],
    [50000, 399],
    [100000, 599],
    [200000, 999],
    [300000, 1199],
    [400000, 1399],
    [500000, 1799],
    [750000, 2199],
    [1000000, 2499],
    [1500000, 3399],
    [1750000, 3799],
    [2000000, 3999]
  ] as Array<[number, number]>
}

async function initWasm() {
  try {
    await init()
    wasmReady = true
    console.log('WASM initialized successfully')
    
    // Test WASM connection
    hello_world()
    
    updateStatus('ready', 'WASM Engine Ready')
    updateWasmIndicator(true)
  } catch (error) {
    console.error('Failed to initialize WASM:', error)
    updateStatus('error', 'Failed to initialize WASM engine')
    updateWasmIndicator(false)
  }
}

// Update WASM indicator at top of page
function updateWasmIndicator(ready: boolean) {
  const indicator = document.getElementById('wasm-indicator')
  if (!indicator) return
  
  if (ready) {
    indicator.innerHTML = `
      <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
      <span class="text-sm font-medium text-slate-700">✅ WASM Engine Online</span>
    `
    indicator.className = 'inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full shadow-sm border border-emerald-200'
  } else {
    indicator.innerHTML = `
      <div class="w-2 h-2 rounded-full bg-rose-500"></div>
      <span class="text-sm font-medium text-slate-700">❌ WASM Engine Offline</span>
    `
    indicator.className = 'inline-flex items-center gap-2 px-4 py-2 bg-rose-50 rounded-full shadow-sm border border-rose-200'
  }
}

// Update status indicator
function updateStatus(type: 'ready' | 'processing' | 'success' | 'error', message: string) {
  const statusEl = document.getElementById('status')
  if (!statusEl) return
  
  let icon = ''
  let className = 'mt-6 p-4 rounded-xl text-sm font-medium shadow-sm border '
  
  switch (type) {
    case 'ready':
      icon = '✅'
      className += 'bg-emerald-50 text-emerald-700 border-emerald-200'
      break
    case 'processing':
      icon = '⏳'
      className += 'bg-amber-50 text-amber-700 border-amber-200'
      break
    case 'success':
      icon = '✅'
      className += 'bg-emerald-50 text-emerald-700 border-emerald-200'
      break
    case 'error':
      icon = '❌'
      className += 'bg-rose-50 text-rose-700 border-rose-200'
      break
  }
  
  statusEl.className = className
  statusEl.textContent = `${icon} ${message}`
}

// NEW: Helper to format relative time
function formatRelativeTime(isoTimestamp: string | null): string {
  if (!isoTimestamp) return 'Never'
  
  try {
    const timestamp = new Date(isoTimestamp)
    const now = new Date()
    const diffMs = now.getTime() - timestamp.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffSeconds < 60) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return '1d ago'
    if (diffDays < 30) return `${diffDays}d ago`
    
    const diffMonths = Math.floor(diffDays / 30)
    if (diffMonths < 12) return `${diffMonths}mo ago`
    
    const diffYears = Math.floor(diffMonths / 12)
    return `${diffYears}y ago`
  } catch {
    return 'Invalid date'
  }
}

/**
 * Extract re-audit metadata from PDF file
 */
async function extractReAuditMetadata(pdfFile: File): Promise<ReAuditMetadata | null> {
  try {
    const pdfBytes = await pdfFile.arrayBuffer()
    const pdfDoc = await PDFDocument.load(pdfBytes)
    
    // Get keywords field
    const keywords = pdfDoc.getKeywords()
    
    if (!keywords) {
      console.warn('No keywords found in PDF')
      return null
    }
    
    // Look for re-audit metadata prefix
    const match = keywords.match(/REAUDIT_V1:([A-Za-z0-9+/=]+)/)
    
    if (!match) {
      console.warn('No re-audit metadata found in PDF keywords')
      return null
    }
    
    // Decode base64 and parse JSON
    const metadataBase64 = match[1]
    const metadataJson = atob(metadataBase64)
    const metadata = deserializeMetadata(metadataJson)
    
    console.log('✅ Re-audit metadata extracted:', metadata)
    return metadata
    
  } catch (error) {
    console.error('❌ Failed to extract re-audit metadata:', error)
    return null
  }
}

/**
 * Handle PDF upload for re-audit
 */
  async function handlePDFUpload(file: File) {
    updateStatus('processing', 'Extracting re-audit metadata from PDF...')
    
    try {
      // Extract metadata
      const metadata = await extractReAuditMetadata(file)
      
      if (!metadata) {
        updateStatus('error', 'This PDF does not contain re-audit metadata. Please upload a Lighthouse PDF generated after Feb 2026.')
        return
      }
      
      // Show re-audit banner
      showReAuditBanner(metadata)  // ← TOTO SA VOLÁ, ALE POTOM...
      
    // Restore pricing settings
    const planType = metadata.pricing_snapshot.plan_type.toLowerCase()
    currentPlanType = (planType === 'team' ? 'team' : 'professional') as 'professional' | 'team'
    includedTasks = metadata.pricing_snapshot.tier_tasks
    monthlyBill = metadata.pricing_snapshot.tier_price
    pricePerTask = metadata.pricing_snapshot.price_per_task
    isCustomPrice = true
      
      // Pre-select Zaps from metadata
      selectedZapIds = new Set(metadata.zap_ids_analyzed.map(id => parseInt(id)))
      
      updateStatus('success', 'Re-audit mode activated! Now upload your ZIP file to continue.')  // ← TOTO PREPÍŠE BANNER!
      
    } catch (error) {
      console.error('Error processing PDF:', error)
      updateStatus('error', `Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

/**
 * Show re-audit banner with metadata info
 */
function showReAuditBanner(metadata: ReAuditMetadata) {
  // Find or create banner container
  let bannerContainer = document.getElementById('reaudit-banner-container')
  
  if (!bannerContainer) {
    // Create container above status element
    const statusEl = document.getElementById('status')
    if (!statusEl) return
    
    bannerContainer = document.createElement('div')
    bannerContainer.id = 'reaudit-banner-container'
    statusEl.parentNode?.insertBefore(bannerContainer, statusEl)
  }
  
  const generationDate = new Date(metadata.generation_timestamp).toLocaleDateString()
  const zapCount = metadata.zap_ids_analyzed.length
  
  bannerContainer.className = 'mb-4 p-6 rounded-xl border-2 border-purple-300 bg-purple-50 shadow-lg'
  bannerContainer.innerHTML = `
    <div class="flex items-start gap-4">
      <div class="w-12 h-12 rounded-lg bg-purple-600 flex items-center justify-center flex-shrink-0">
        <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div class="flex-1">
        <h3 class="text-lg font-black text-purple-900 mb-2">🔄 Re-Audit Mode Activated</h3>
        <div class="space-y-1 text-sm text-purple-800">
          <p><strong>Original Report:</strong> ${metadata.report_code}</p>
          <p><strong>Generated:</strong> ${generationDate}</p>
          <p><strong>Zaps Analyzed:</strong> ${zapCount}</p>
          <p><strong>Plan:</strong> ${metadata.pricing_snapshot.plan_type} (${metadata.pricing_snapshot.tier_tasks.toLocaleString()} tasks @ $${metadata.pricing_snapshot.price_per_task.toFixed(4)}/task)</p>
        </div>
        <div class="mt-3 p-3 bg-purple-100 rounded-lg border border-purple-200">
          <p class="text-sm text-purple-900">
            ✅ Settings restored! Upload your <strong>current ZIP export</strong> above to run the same analysis with fresh data.
          </p>
        </div>
      </div>
    </div>
  `
  
  // Also update status below banner
  updateStatus('success', 'Re-audit mode activated! Now upload your ZIP file to continue.')
}

// NEW: Handle file upload (updated workflow with Zap Selector)
async function handleFileUpload(file: File) {
  if (!wasmReady) {
    updateStatus('error', 'WASM engine not ready. Please refresh the page.')
    return
  }
  
  updateStatus('processing', `Scanning ${file.name}...`)
  
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    // File uploaded successfully (silent in production)
    
    // Cache ZIP data for later use
    cachedZipData = uint8Array
    
    // NEW WORKFLOW: Call parse_zap_list (fast, no heuristics)
    const listResultJson = parse_zap_list(uint8Array)
    const listResult: ZapListResult = JSON.parse(listResultJson)
    
    // Zap list parsed (silent in production)
    
    if (listResult.success) {
      zapList = listResult.zaps
      updateStatus('success', `Found ${zapList.length} Zap${zapList.length === 1 ? '' : 's'} - Select one to audit`)
      displayZapSelector(zapList)
    } else {
      updateStatus('error', listResult.message)
    }
    
  } catch (error) {
    console.error('Error processing file:', error)
    updateStatus('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// NEW: Global filter state
let currentSearchTerm = ''
let currentStatusFilter: 'all' | 'on' | 'error' = 'all'

// NEW: Filter zaps based on search and status
function getFilteredZaps(): ZapSummary[] {
  let filtered = [...zapList]
  
  // Apply search filter
  if (currentSearchTerm) {
    const search = currentSearchTerm.toLowerCase()
    filtered = filtered.filter(zap => 
      zap.title.toLowerCase().includes(search) || 
      zap.trigger_app.toLowerCase().includes(search)
    )
  }
  
  // Apply status filter
  if (currentStatusFilter === 'on') {
    filtered = filtered.filter(zap => zap.status.toLowerCase() === 'on')
  } else if (currentStatusFilter === 'error') {
    filtered = filtered.filter(zap => zap.error_rate !== null && zap.error_rate > 10)
  }
  
  // Sort: Active first, then by total_runs descending
  filtered.sort((a, b) => {
    const aIsActive = a.status.toLowerCase() === 'on'
    const bIsActive = b.status.toLowerCase() === 'on'
    
    // Active Zaps first
    if (aIsActive && !bIsActive) return -1
    if (!aIsActive && bIsActive) return 1
    
    // Within same status group, sort by total_runs descending
    return b.total_runs - a.total_runs
  })
  
  return filtered
}

// NEW: Handle search input
function filterZaps() {
  const searchInput = document.getElementById('zapSearch') as HTMLInputElement
  if (searchInput) {
    currentSearchTerm = searchInput.value
    // Split rendering: Update ONLY the table, not the entire selector
    renderZapTable(getFilteredZaps())
  }
}

// NEW: Handle status filter
function applyStatusFilter(status: 'all' | 'on' | 'error') {
  currentStatusFilter = status
  
  // Update button styles
  const buttons = document.querySelectorAll('[onclick^="applyStatusFilter"]')
  buttons.forEach(btn => {
    btn.className = 'px-3 py-1.5 rounded-md text-xs font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all'
  })
  
  const activeBtn = document.querySelector(`[onclick="applyStatusFilter('${status}')"]`)
  if (activeBtn) {
    activeBtn.className = 'px-3 py-1.5 rounded-md text-xs font-bold bg-blue-600 text-white shadow-sm transition-all'
  }
  
  // Split rendering: Update ONLY the table, not the entire selector
  renderZapTable(getFilteredZaps())
}

// NEW: Reset all filters
function resetFilters() {
  currentSearchTerm = ''
  currentStatusFilter = 'all'
  
  // Clear search input value
  const searchInput = document.getElementById('zapSearch') as HTMLInputElement
  if (searchInput) {
    searchInput.value = ''
  }
  
  // Update button styles to show 'all' as active
  const buttons = document.querySelectorAll('[onclick^="applyStatusFilter"]')
  buttons.forEach(btn => {
    btn.className = 'px-3 py-1.5 rounded-md text-xs font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all'
  })
  
  const allBtn = document.querySelector(`[onclick="applyStatusFilter('all')"]`)
  if (allBtn) {
    allBtn.className = 'px-3 py-1.5 rounded-md text-xs font-bold bg-blue-600 text-white shadow-sm transition-all'
  }
  
  // Render full unfiltered list
  renderZapTable(getFilteredZaps())
}

// Make functions globally available
;(window as any).filterZaps = filterZaps
;(window as any).applyStatusFilter = applyStatusFilter
;(window as any).resetFilters = resetFilters
;(window as any).backToSelector = backToSelector

// NEW: Batch Selection Helper Functions
function toggleZapSelection(zapId: number) {
  if (selectedZapIds.has(zapId)) {
    selectedZapIds.delete(zapId)
  } else {
    selectedZapIds.add(zapId)
  }
  renderZapTable(getFilteredZaps())
  updateAnalyzeButton()
}

function selectAllActive() {
  const filtered = getFilteredZaps()
  filtered.forEach(zap => {
    if (zap.status.toLowerCase() === 'on') {
      selectedZapIds.add(zap.id)
    }
  })
  renderZapTable(filtered)
  updateAnalyzeButton()
}

function deselectAll() {
  selectedZapIds.clear()
  renderZapTable(getFilteredZaps())
  updateAnalyzeButton()
}

function updateAnalyzeButton() {
  const analyzeBtn = document.getElementById('analyze-selected-btn')
  if (analyzeBtn) {
    const count = selectedZapIds.size
    const btnText = analyzeBtn.querySelector('.btn-text')
    const btnCount = analyzeBtn.querySelector('.btn-count')
    
    if (btnText) {
      btnText.textContent = count === 0 ? 'Select Zaps to Analyze' : 'Analyze Selected Zaps'
    }
    if (btnCount) {
      btnCount.textContent = count.toString()
    }
    
    if (count === 0) {
      analyzeBtn.classList.add('opacity-50', 'cursor-not-allowed')
      analyzeBtn.classList.remove('hover:scale-105', 'hover:shadow-lg')
    } else {
      analyzeBtn.classList.remove('opacity-50', 'cursor-not-allowed')
      analyzeBtn.classList.add('hover:scale-105', 'hover:shadow-lg')
    }
  }
}

// ============================================================================
// PHASE 2: CONFIDENCE BADGE HELPERS
// ============================================================================

/**
 * Get confidence badge color (hex codes matching PDF)
 * Returns HTML/CSS color classes for UI consistency
 */
function getConfidenceBadgeColor(confidence: string): { dot: string; hex: string } {
  const confidenceLower = confidence.toLowerCase()
  if (confidenceLower === 'high') {
    return { dot: 'bg-emerald-500', hex: '#10b981' } // Green - matches PDF COLORS.GREEN
  } else if (confidenceLower === 'medium') {
    return { dot: 'bg-amber-500', hex: '#f59e0b' } // Amber - matches PDF amber color
  } else {
    return { dot: 'bg-rose-500', hex: '#ef4444' } // Red - matches PDF COLORS.RED
  }
}

// NEW: Apply Cost Calibration (LIVE - no button needed)
// ✅ PHASE 2: Added zero-division guard
function applyCostCalibration() {
  const monthlyBillInput = document.getElementById('monthly-bill') as HTMLInputElement
  const includedTasksInput = document.getElementById('included-tasks') as HTMLInputElement
  
  const bill = parseFloat(monthlyBillInput?.value || '0')
  const tasks = parseFloat(includedTasksInput?.value || '0')
  
  // ✅ ZERO-DIVISION GUARD: Check for invalid or zero tasks
  if (!bill || !tasks || bill <= 0 || tasks <= 0) {
    pricePerTask = 0.02 // Default benchmark: $0.02/task
    isCustomPrice = false
    monthlyBill = 0
    includedTasks = 0
    updateCalibrationBadge()
    // Invalid pricing inputs - using benchmark
    return
  }
  
  // Calculate effective rate (safe division - tasks > 0 guaranteed by guard above)
  monthlyBill = bill
  includedTasks = tasks
  pricePerTask = bill / tasks
  isCustomPrice = true
  
  updateCalibrationBadge()
  
  // Cost calibration updated (silent)
}

// NEW: Update calibration badge with visual feedback
function updateCalibrationBadge() {
  const badgeEl = document.getElementById('calibration-badge')
  if (!badgeEl) return
  
  const percentDiff = ((pricePerTask - 0.02) / 0.02) * 100
  const isHigher = pricePerTask > 0.02
  const isLower = pricePerTask < 0.02
  
  // Farebné zvýraznenie podľa ceny
  let colorClass = 'bg-amber-200 text-amber-800' // Default (benchmark)
  let icon = '💰'
  
  if (isHigher) {
    colorClass = 'bg-rose-200 text-rose-800' // Vyššia cena - červená
    icon = '📈'
  } else if (isLower) {
    colorClass = 'bg-emerald-200 text-emerald-800' // Nižšia cena - zelená
    icon = '📉'
  }
  
  badgeEl.className = `ml-auto px-3 py-1 ${colorClass} text-xs font-bold rounded-full transition-all`
  badgeEl.innerHTML = `${icon} $${pricePerTask.toFixed(4)}/task ${isCustomPrice ? `(${percentDiff > 0 ? '+' : ''}${percentDiff.toFixed(1)}%)` : '(Benchmark)'}`
}

// ============================================================================
// PRICING TIER SLIDER HELPERS
// ============================================================================

function formatNumber(num: number): string {
  return num.toLocaleString('en-US')
}

function formatCurrencyDisplay(amount: number): string {
  return `$${amount.toFixed(2)}`
}

function formatRate(rate: number): string {
  return `$${rate.toFixed(4)}`
}

function getCurrentTier(): [number, number] {
  return PRICING_TIERS[currentPlanType][currentTierIndex]
}

function handlePlanToggle(newPlan: 'professional' | 'team') {
  currentPlanType = newPlan
  currentTierIndex = 0 // Reset to first tier
  updateSliderMax()
  updatePreviewCard()
  autoFillInputs()
  updateCalibrationBadge()
  
  // Update toggle buttons visually
  const profBtn = document.getElementById('plan-toggle-professional')
  const teamBtn = document.getElementById('plan-toggle-team')
  
  if (profBtn && teamBtn) {
    if (newPlan === 'professional') {
      profBtn.className = 'flex-1 px-4 py-3 bg-amber-500 text-white font-bold rounded-lg transition-all duration-200'
      teamBtn.className = 'flex-1 px-4 py-3 bg-white text-slate-600 font-bold rounded-lg border-2 border-slate-200 transition-all duration-200'
    } else {
      profBtn.className = 'flex-1 px-4 py-3 bg-white text-slate-600 font-bold rounded-lg border-2 border-slate-200 transition-all duration-200'
      teamBtn.className = 'flex-1 px-4 py-3 bg-blue-500 text-white font-bold rounded-lg transition-all duration-200'
    }
  }
}

function handleSliderChange(value: number) {
  currentTierIndex = value
  updatePreviewCard()
  autoFillInputs()
  updateCalibrationBadge()
}

function updateSliderMax() {
  const slider = document.getElementById('pricing-tier-slider') as HTMLInputElement
  if (slider) {
    slider.max = (PRICING_TIERS[currentPlanType].length - 1).toString()
    slider.value = currentTierIndex.toString()
  }
}

function autoFillInputs() {
  const [tasks, price] = getCurrentTier()
  const billInput = document.getElementById('monthly-bill') as HTMLInputElement
  const tasksInput = document.getElementById('included-tasks') as HTMLInputElement
  
  if (billInput) billInput.value = price.toFixed(2)
  if (tasksInput) tasksInput.value = tasks.toString()
  
  // Update state
  monthlyBill = price
  includedTasks = tasks
  pricePerTask = price / tasks
  isCustomPrice = true
}

function updatePreviewCard() {
  const [tasks, price] = getCurrentTier()
  const rate = price / tasks
  
  const card = document.getElementById('tier-preview-card')
  if (!card) return
  
  const borderColor = currentPlanType === 'professional' ? 'border-l-amber-500' : 'border-l-blue-500'
  
  card.className = `p-4 bg-white rounded-lg border-l-4 ${borderColor} shadow-sm`
  card.setAttribute('aria-live', 'polite')
  card.innerHTML = `
    <div class="text-sm font-bold text-slate-600 mb-1">
      ${currentPlanType === 'professional' ? 'Professional' : 'Team'} Plan
    </div>
    <div class="text-2xl font-black text-slate-900 mb-1">
      ${formatNumber(tasks)} tasks/month
    </div>
    <div class="text-lg font-bold text-slate-700">
      ${formatCurrencyDisplay(price)}/month
    </div>
    <div class="text-sm text-slate-500 mt-2">
      ≈ ${formatRate(rate)} per task
    </div>
  `
}

// Make functions globally available
;(window as any).applyCostCalibration = applyCostCalibration
;(window as any).updateCalibrationBadge = updateCalibrationBadge
;(window as any).handlePlanToggle = handlePlanToggle
;(window as any).handleSliderChange = handleSliderChange

async function handleAnalyzeSelected() {
  if (selectedZapIds.size === 0) {
    return
  }
  
  if (!cachedZipData) {
    updateStatus('error', 'ZIP data not cached. Please upload again.')
    return
  }
  
  const selectedIds = Array.from(selectedZapIds)
  updateStatus('processing', `Analyzing ${selectedIds.length} Zap${selectedIds.length === 1 ? '' : 's'}...`)
  
  try {
    // WASM call prepared (parameters validated)
    
    // ✅ Use slider state for both plan and usage (synced with UI)
    const plan = currentPlanType // Use selected plan from slider
    const usage = includedTasks || 2000 // Use calibrated tasks from slider or default

    // 🔥 Call v1.0.0 analyze_zaps with selected IDs
    const selectedIdsArray = Array.from(selectedZapIds).map(id => id.toString())
    const resultJson = analyze_zaps(cachedZipData, selectedIdsArray, plan, usage)
    const rawResult = JSON.parse(resultJson)

    // 🔥 VALIDATE before using (throws on invalid data)
    try {
      validateAuditResult(rawResult)
    } catch (validationError) {
      console.error('❌ Validation Error:', validationError)
      const errorMsg = validationError instanceof Error 
        ? validationError.message 
        : 'Unknown validation error'
      updateStatus('error', `Data validation failed: ${errorMsg}`)
      return  // Stop processing
    }

    // TypeScript now KNOWS it's valid AuditResult
    const auditResult: AuditResult = rawResult
    // Audit result validated successfully

    // 🔍 DEBUG: PER-ZAP STATUS
    console.log('🚨 PER-ZAP STATUS:', auditResult.per_zap_findings.map(z => ({
      id: z.zap_id,
      name: z.zap_name,
      status: z.status,
      is_zombie: z.is_zombie,
    })))

    // WASM already filtered - validate result
    if (auditResult.global_metrics.total_zaps !== selectedIds.length) {
      console.warn(`Expected ${selectedIds.length} Zaps, got ${auditResult.global_metrics.total_zaps}`)
    }

    // Display results (WASM already filtered by selected IDs)
    displayDeveloperEditionResults(auditResult)
    
  } catch (error) {
    console.error('Error analyzing Zaps:', error)
    updateStatus('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Display Developer Edition results
function displayDeveloperEditionResults(auditResult: AuditResult) {
  const avgScore = auditResult.per_zap_findings.length > 0
    ? auditResult.per_zap_findings.reduce((sum, zap) => {
        const zapScore = 100 - (zap.flags.length * 10);
        return sum + Math.max(0, zapScore);
      }, 0) / auditResult.per_zap_findings.length
    : 100;
  
  updateStatus('success', `Analysis complete for ${auditResult.global_metrics.total_zaps} Zap${auditResult.global_metrics.total_zaps === 1 ? '' : 's'}`)
  
  const resultsEl = document.getElementById('results')
  if (!resultsEl) return
  
  resultsEl.innerHTML = `
    <div class="mt-10">
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-2xl font-bold text-zinc-900" style="letter-spacing: -0.02em;">Developer Edition Results</h3>
        <div class="flex gap-3">
          <button onclick="backToSelector()" class="inline-flex items-center gap-2 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white text-sm font-bold rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Selection
          </button>
          <button id="download-dev-pdf-btn" class="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-bold rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Download Developer Edition PDF
          </button>
        </div>
      </div>
      
      <!-- Project Summary Card -->
      <div class="stat-card mb-8 bg-gradient-to-br from-blue-600 to-blue-700 border-2 border-blue-500">
        <h4 class="text-white text-xl font-black mb-4">📊 PROJECT SUMMARY</h4>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div class="bg-white/10 rounded-lg p-4 text-center">
            <p class="text-3xl font-black text-white">${auditResult.global_metrics.total_zaps}</p>
            <p class="text-sm text-blue-100 mt-1">Zaps Analyzed</p>
          </div>
          <div class="bg-white/10 rounded-lg p-4 text-center">
            <p class="text-3xl font-black text-white">${auditResult.global_metrics.high_severity_flag_count}</p>
            <p class="text-sm text-blue-100 mt-1">High Priority Issues</p>
          </div>
          <div class="bg-white/10 rounded-lg p-4 text-center">
            <p class="text-3xl font-black text-white">$${Math.round(auditResult.global_metrics.estimated_monthly_waste_usd)}</p>
            <p class="text-sm text-blue-100 mt-1">Monthly Waste</p>
          </div>
          <div class="bg-white/10 rounded-lg p-4 text-center">
            <p class="text-3xl font-black text-white">$${Math.round(auditResult.global_metrics.estimated_annual_waste_usd)}</p>
            <p class="text-sm text-blue-100 mt-1">Annual Waste</p>
          </div>
          <div class="bg-white/10 rounded-lg p-4 text-center">
            <p class="text-3xl font-black text-white">${Math.round(avgScore)}/100</p>
            <p class="text-sm text-blue-100 mt-1">Avg Score</p>
          </div>
        </div>
      </div>



      <!-- Top Opportunities Card -->
      ${auditResult.opportunities_ranked && auditResult.opportunities_ranked.length > 0 ? `
        <div class="stat-card mb-8">
          <h4 class="text-lg font-bold text-slate-900 mb-4">🎯 Top Opportunities</h4>
          <div class="space-y-3">
            ${auditResult.opportunities_ranked.slice(0, 5).map(opp => {
              const zapFinding = auditResult.per_zap_findings.find(z => z.zap_id === opp.zap_id);
              
              // Use same logic as PDF mapper - show last 4 digits for "Untitled Zap"
              let displayName = zapFinding?.zap_name || 'Unknown Zap';
              if (displayName === 'Untitled Zap') {
                const shortId = opp.zap_id.slice(-4);
                displayName = `Zap #${shortId}`;
              }
              
              return `
              <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div class="flex-1">
                  <p class="font-bold text-slate-900">${displayName}</p>
                  <p class="text-sm text-slate-600">${opp.flag_code.replace(/_/g, ' ')} • $${Math.round(opp.estimated_monthly_savings_usd)}/month</p>
                </div>
                <span class="px-3 py-1 ${opp.confidence === 'High' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} rounded-full text-xs font-bold">
                  ${opp.confidence.toUpperCase()}
                </span>
              </div>
            `}).join('')}
          </div>
        </div>
      ` : ''}
      
      <!-- System Metrics -->
      <div class="stat-card mb-8">
        <h4 class="text-lg font-bold text-slate-900 mb-4">⚙️ System Metrics</h4>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div class="p-4 bg-slate-50 rounded-lg">
            <p class="text-2xl font-bold text-slate-900">${auditResult.global_metrics.total_monthly_tasks.toLocaleString()}</p>
            <p class="text-sm text-slate-600">Monthly Tasks</p>
          </div>
          <div class="p-4 bg-slate-50 rounded-lg">
            <p class="text-2xl font-bold text-slate-900">${auditResult.global_metrics.active_zaps}</p>
            <p class="text-sm text-slate-600">Active Zaps</p>
          </div>
          <div class="p-4 bg-slate-50 rounded-lg">
            <p class="text-2xl font-bold text-slate-900">${auditResult.global_metrics.zombie_zap_count}</p>
            <p class="text-sm text-slate-600">Zombie Zaps</p>
          </div>
        </div>
      </div>
      
      <!-- Info Banner -->
      <div class="stat-card bg-blue-50 border-blue-200">
        <p class="text-sm text-blue-700 flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          💡 Click "Download Developer Edition PDF" to generate a comprehensive multi-Zap technical report with patterns, ASCII diagrams, and optimization checklist.
        </p>
      </div>
    </div>
  `
  
  // Setup Developer Edition PDF download button
  setTimeout(() => {
    const pdfBtn = document.getElementById('download-dev-pdf-btn')
    if (pdfBtn) {
      pdfBtn.addEventListener('click', async () => {
        pdfBtn.innerHTML = `
          <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Generating Developer Edition PDF...
        `
        pdfBtn.classList.add('opacity-75', 'cursor-wait')
        
        try {
          // Generate report ID and code
          const reportId = getNextReportId()
          const reportCode = generateReportCode(reportId)

          // Generate file hash for verification (re-audit capability)
          const fileHash = await generateFileHash(cachedZipData! as BufferSource)

          // Build re-audit metadata (allows users to restore settings from PDF)
          const reauditMetadata: ReAuditMetadata = {
            report_id: reportId,
            report_code: reportCode,
            generation_timestamp: new Date().toISOString(),
            pricing_snapshot: {
              plan_type: currentPlanType,
              tier_tasks: includedTasks,
              tier_price: monthlyBill,
              price_per_task: pricePerTask
            },
            zap_ids_analyzed: Array.from(selectedZapIds).map(id => id.toString()),
            file_hash: fileHash,
            metadata_version: '1.0.0'
          }

          // Transform WASM result → PDF view model
          const viewModel = mapAuditToPdfViewModel(auditResult, reportCode)

          // Generate PDF with embedded re-audit metadata
          await generateExecutiveAuditPDF(viewModel, {
            reportCode: reportCode,
            clientName: 'Batch Analysis',
            reauditMetadata: reauditMetadata
          })
          
          pdfBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Downloaded!
          `
          pdfBtn.classList.remove('opacity-75', 'cursor-wait')
          pdfBtn.classList.remove('from-blue-600', 'to-blue-700')
          pdfBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700')
          
          setTimeout(() => {
            pdfBtn.innerHTML = `
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Download Developer Edition PDF
            `
            pdfBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700')
            pdfBtn.classList.add('bg-gradient-to-r', 'from-blue-600', 'to-blue-700')
          }, 2000)
        } catch (err) {
          console.error('Failed to generate Developer Edition PDF:', err)
          pdfBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Error
          `
          pdfBtn.classList.remove('opacity-75', 'cursor-wait')
          pdfBtn.classList.add('bg-rose-600')
        }
      })
    }
  }, 100)
}

// Make batch functions globally available
;(window as any).toggleZapSelection = toggleZapSelection
;(window as any).selectAllActive = selectAllActive
;(window as any).deselectAll = deselectAll
;(window as any).handleAnalyzeSelected = handleAnalyzeSelected

// NEW: Render only table content (optimized for filtering)
function renderZapTable(filteredZaps: ZapSummary[]) {
  const tableContainer = document.getElementById('zap-table-container')
  if (!tableContainer) return
  
  // Helper functions for badges
  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase()
    if (statusLower === 'on') return { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', icon: '🟢' }
    if (statusLower === 'off') return { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', icon: '🔴' }
    return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', icon: '🟡' }
  }
  
  const getErrorRateBadge = (errorRate: number | null) => {
    if (errorRate === null) return { bg: 'bg-slate-100', text: 'text-slate-500', label: 'N/A' }
    if (errorRate > 10) return { bg: 'bg-rose-100', text: 'text-rose-700', label: `🔴 ${errorRate.toFixed(1)}%` }
    if (errorRate > 5) return { bg: 'bg-amber-100', text: 'text-amber-700', label: `🟡 ${errorRate.toFixed(1)}%` }
    return { bg: 'bg-emerald-100', text: 'text-emerald-700', label: `🟢 ${errorRate.toFixed(1)}%` }
  }
  
  tableContainer.innerHTML = `
    <!-- Table Header -->
    <div class="bg-slate-50 px-6 py-3 border-b border-slate-200">
      <div class="grid grid-cols-12 gap-4 items-center">
        <div class="col-span-1 flex items-center gap-2">
          <input 
            type="checkbox" 
            id="select-all-checkbox"
            class="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
          />
          <span class="text-xs font-bold text-slate-500 uppercase">#</span>
        </div>
        <div class="col-span-4">
          <span class="text-xs font-bold text-slate-500 uppercase">Zap Name</span>
        </div>
        <div class="col-span-2">
          <span class="text-xs font-bold text-slate-500 uppercase">Status</span>
        </div>
        <div class="col-span-2 text-center">
          <span class="text-xs font-bold text-slate-500 uppercase">Last Run</span>
        </div>
        <div class="col-span-2 text-center">
          <span class="text-xs font-bold text-slate-500 uppercase">Error Rate</span>
        </div>
        <div class="col-span-1 text-center">
          <span class="text-xs font-bold text-slate-500 uppercase">Runs</span>
        </div>
      </div>
    </div>
    
    <!-- Table Rows -->
    ${filteredZaps.length > 0 ? filteredZaps.map((zap, index) => {
    const statusBadge = getStatusBadge(zap.status)
    const errorBadge = getErrorRateBadge(zap.error_rate)
    const lastRun = formatRelativeTime(zap.last_run)
    const isSelected = selectedZapIds.has(zap.id)
    
    return `
      <div 
        class="zap-row group p-6 border-b border-slate-100 last:border-0 transition-all duration-200 ${isSelected ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50'}" 
        data-zap-id="${zap.id}"
        style="animation: fade-in-up 0.3s ease-out ${index * 0.05}s both;"
      >
        <div class="grid grid-cols-12 gap-4 items-center">
          <!-- Checkbox + Index -->
          <div class="col-span-1 flex items-center gap-2">
            <input 
              type="checkbox" 
              class="zap-checkbox w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
              data-zap-id="${zap.id}"
              ${isSelected ? 'checked' : ''}
              onclick="event.stopPropagation(); toggleZapSelection(${zap.id})"
            />
            <span class="text-slate-400 font-mono text-sm">#${index + 1}</span>
          </div>
          
          <!-- Title & Trigger -->
          <div class="col-span-4">
            <h3 class="font-bold text-slate-900 group-hover:text-blue-600 transition-colors mb-1">
              ${zap.title === 'Untitled Zap' ? `Zap #${zap.id.toString().slice(-4)}` : zap.title}
            </h3>
            <p class="text-xs text-slate-500">
              <span class="font-mono bg-slate-100 px-2 py-0.5 rounded">${zap.trigger_app}</span>
              <span class="mx-2">•</span>
              <span>${zap.step_count} step${zap.step_count === 1 ? '' : 's'}</span>
            </p>
          </div>
          
          <!-- Status -->
          <div class="col-span-2">
            <span class="inline-flex items-center gap-1 px-3 py-1 ${statusBadge.bg} ${statusBadge.text} rounded-full text-xs font-semibold border ${statusBadge.border}">
              ${statusBadge.icon} ${zap.status.toUpperCase()}
            </span>
          </div>
          
          <!-- Last Run -->
          <div class="col-span-2 text-center">
            <span class="text-sm text-slate-600">${lastRun}</span>
          </div>
          
          <!-- Error Rate -->
          <div class="col-span-2 text-center">
            <span class="inline-flex items-center px-3 py-1 ${errorBadge.bg} ${errorBadge.text} rounded-full text-xs font-bold border border-current">
              ${errorBadge.label}
            </span>
          </div>
          
          <!-- Total Runs -->
          <div class="col-span-1 text-center">
            <span class="text-sm font-mono text-slate-700">${zap.total_runs}</span>
          </div>
        </div>
      </div>
    `
  }).join('') : `
    <!-- Empty State -->
      <!-- Empty State with Reset -->
      <div class="p-12 text-center">
        <svg class="w-20 h-20 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 class="text-xl font-bold text-slate-600 mb-3">No Zaps Found</h3>
        <p class="text-slate-500 mb-6">
          ${currentSearchTerm 
            ? `No results matching "<span class="font-semibold text-slate-700">${currentSearchTerm}</span>"` 
            : 'No Zaps match the selected filter'}
        </p>
        ${currentSearchTerm || currentStatusFilter !== 'all' ? `
          <button 
            onclick="resetFilters()" 
            class="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-all hover:scale-105"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset All Filters
          </button>
        ` : ''}
      </div>
    `}
  `
  
  // Setup "Select All" checkbox handler
  setTimeout(() => {
    const selectAllCheckbox = document.getElementById('select-all-checkbox') as HTMLInputElement
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement
        const checkboxes = document.querySelectorAll<HTMLInputElement>('.zap-checkbox')
        
        if (target.checked) {
          // Select ALL (not just active)
          checkboxes.forEach(checkbox => {
            checkbox.checked = true
            const zapId = parseInt(checkbox.dataset.zapId || '0')
            selectedZapIds.add(zapId)
          })
        } else {
          // Deselect all
          checkboxes.forEach(checkbox => {
            checkbox.checked = false
          })
          selectedZapIds.clear()
        }
        
        updateAnalyzeButton()
      })
    }
    
    // Individual checkbox handlers - update master checkbox state
    const checkboxes = document.querySelectorAll<HTMLInputElement>('.zap-checkbox')
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const zapId = parseInt(checkbox.dataset.zapId || '0')
        if (checkbox.checked) {
          selectedZapIds.add(zapId)
        } else {
          selectedZapIds.delete(zapId)
        }
        
        // Update master checkbox state
        const selectAllCheckbox = document.getElementById('select-all-checkbox') as HTMLInputElement
        if (selectAllCheckbox) {
          const totalCheckboxes = checkboxes.length
          const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length
          
          if (checkedCount === 0) {
            selectAllCheckbox.checked = false
            selectAllCheckbox.indeterminate = false
          } else if (checkedCount === totalCheckboxes) {
            selectAllCheckbox.checked = true
            selectAllCheckbox.indeterminate = false
          } else {
            selectAllCheckbox.checked = false
            selectAllCheckbox.indeterminate = true
          }
        }
        
        updateAnalyzeButton()
      })
    })
  }, 100)
}

// NEW: Display Zap Selector Dashboard (initial render)
function displayZapSelector(zaps: ZapSummary[]) {
  const resultsEl = document.getElementById('results')
  if (!resultsEl) return
  
  // Count stats for filters
  const activeCount = zaps.filter(z => z.status.toLowerCase() === 'on').length
  const errorCount = zaps.filter(z => z.error_rate !== null && z.error_rate > 10).length
  
  resultsEl.innerHTML = `
    <div class="mt-10">
      <!-- Cost Calibration Panel (LIVE UPDATE) -->
      <div class="mb-6 p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl shadow-sm">
        <div class="flex items-center gap-3 mb-4">
          <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 class="text-lg font-black text-amber-900">Cost Calibration (Optional)</h3>
          <span id="calibration-badge" class="ml-auto px-3 py-1 bg-amber-200 text-amber-800 text-xs font-bold rounded-full transition-all">💰 $${pricePerTask.toFixed(4)}/task (Benchmark)</span>
        </div>
        <p class="text-sm text-amber-700 mb-4">💡 Start typing to see live calculation. We'll use your actual costs for precise financial projections.</p>
        <div class="flex flex-col md:flex-row gap-3 items-stretch mb-3">
          <div class="flex-1">
            <label class="block text-xs font-bold text-amber-800 mb-1">Monthly Zapier Bill ($)</label>
            <input 
              type="number" 
              id="monthly-bill" 
              placeholder="e.g., 49.99" 
              step="0.01"
              oninput="applyCostCalibration()"
              class="w-full px-4 py-2 border-2 border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-slate-900 transition-all"
            />
          </div>
          <div class="flex-1">
            <label class="block text-xs font-bold text-amber-800 mb-1">Included Tasks in Plan</label>
            <input 
              type="number" 
              id="included-tasks" 
              placeholder="e.g., 750" 
              step="1"
              oninput="applyCostCalibration()"
              class="w-full px-4 py-2 border-2 border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-slate-900 transition-all"
            />
          </div>
        </div>
         
        <!-- Plan Toggle -->
        <div class="mb-4">
          <p class="text-xs font-bold text-amber-800 mb-2">Select Your Zapier Plan:</p>
          <div class="flex gap-2">
            <button 
              id="plan-toggle-professional"
              onclick="handlePlanToggle('professional')"
              class="flex-1 px-4 py-3 bg-amber-500 text-white font-bold rounded-lg transition-all duration-200"
            >
              Professional
            </button>
            <button 
              id="plan-toggle-team"
              onclick="handlePlanToggle('team')"
              class="flex-1 px-4 py-3 bg-white text-slate-600 font-bold rounded-lg border-2 border-slate-200 transition-all duration-200"
            >
              Team
            </button>
          </div>
        </div>
        
        <!-- Live Preview Card -->
        <div id="tier-preview-card" class="p-4 bg-white rounded-lg border-l-4 border-l-amber-500 shadow-sm mb-4" aria-live="polite">
          <div class="text-sm font-bold text-slate-600 mb-1">Professional Plan</div>
          <div class="text-2xl font-black text-slate-900 mb-1">750 tasks/month</div>
          <div class="text-lg font-bold text-slate-700">$19.99/month</div>
          <div class="text-sm text-slate-500 mt-2">≈ $0.0266 per task</div>
        </div>
        
        <!-- Range Slider -->
        <div class="mb-4">
          <input 
            type="range" 
            id="pricing-tier-slider"
            min="0"
            max="16"
            value="0"
            aria-label="Select pricing tier"
            oninput="handleSliderChange(parseInt(this.value))"
            class="w-full h-3 bg-gradient-to-r from-amber-200 to-amber-500 rounded-lg appearance-none cursor-pointer"
            style="accent-color: #f59e0b;"
          />
          <div class="flex justify-between text-xs text-slate-400 mt-1">
            <span>750</span>
            <span>5K</span>
            <span>50K</span>
            <span>200K</span>
            <span>2M</span>
          </div>
        </div>
        
        <!-- Help Link -->
        <p class="text-xs text-amber-700">
          💡 Don't know your plan details? 
          <a 
            href="https://zapier.com/app/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            class="text-amber-900 font-bold underline hover:text-amber-950 transition-colors"
          >
            Find them in your Zapier Billing Settings →
          </a>
        </p>
      </div>

      <!-- Dashboard Header -->
      <div class="mb-8">
        <h2 class="text-3xl font-black text-zinc-900 mb-2" style="letter-spacing: -0.02em;">
          Select Zap to Audit
        </h2>
        <p class="text-slate-600 text-lg">
          📊 Found <span class="font-bold text-blue-600">${zaps.length}</span> Zap${zaps.length === 1 ? '' : 's'} • Click any row to generate detailed PDF audit
        </p>
      </div>
      
      <!-- Control Panel -->
      <div class="flex flex-col md:flex-row gap-4 mb-6 items-center justify-between bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
        <div class="relative w-full md:w-96">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="2" stroke-linecap="round"/></svg>
          </span>
          <input 
            type="text" 
            id="zapSearch" 
            placeholder="Search Zaps by name or app..." 
            value="${currentSearchTerm}"
            class="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
            oninput="filterZaps()"
          >
        </div>

        <div class="flex gap-2 w-full md:w-auto overflow-x-auto">
          <button onclick="applyStatusFilter('all')" class="px-3 py-1.5 rounded-md text-xs font-bold ${currentStatusFilter === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'} transition-all">All (${zaps.length})</button>
          <button onclick="applyStatusFilter('on')" class="px-3 py-1.5 rounded-md text-xs font-bold ${currentStatusFilter === 'on' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'} transition-all">Active (${activeCount})</button>
          <button onclick="applyStatusFilter('error')" class="px-3 py-1.5 rounded-md text-xs font-bold ${currentStatusFilter === 'error' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'} transition-all">High Errors (${errorCount})</button>
        </div>
      </div>
      
      <!-- Zap Table/Grid Container -->
      <div id="zap-table-container" class="stat-card p-0 overflow-hidden">
        <!-- Table content will be rendered by renderZapTable() -->
      </div>
      
      <!-- Bulk Actions & Analyze Button -->
      <div class="mt-6 flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
        <!-- Bulk Action Buttons -->
        <div class="flex gap-3 w-full md:w-auto">
          <button 
            onclick="selectAllActive()" 
            class="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-lg border border-slate-300 transition-all hover:scale-105 shadow-sm"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Select All Active
          </button>
          <button 
            onclick="deselectAll()" 
            class="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-lg border border-slate-300 transition-all hover:scale-105 shadow-sm"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Deselect All
          </button>
        </div>
        
        <!-- Main Analyze Button -->
        <button 
          id="analyze-selected-btn"
          onclick="handleAnalyzeSelected()"
          class="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-lg font-black rounded-xl shadow-lg transition-all hover:scale-105 hover:shadow-xl opacity-50 cursor-not-allowed w-full md:w-auto justify-center"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <div class="flex flex-col items-start">
            <span class="btn-text">Select Zaps to Analyze</span>
            <span class="text-xs font-normal opacity-90">
              <span class="btn-count font-bold">0</span> Zap${selectedZapIds.size === 1 ? '' : 's'} selected
            </span>
          </div>
        </button>
      </div>
      
      <!-- Info Banner -->
      <div class="mt-6 stat-card bg-blue-50 border-blue-200">
        <p class="text-sm text-blue-700 flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          💡 Select one or more Zaps using checkboxes, then click the Analyze button to generate reports
        </p>
      </div>
    </div>
  `
  
  // Render the table with filtered zaps
  renderZapTable(getFilteredZaps())

// Initialize pricing tier slider after render
  setTimeout(() => {
    updatePreviewCard()
    updateSliderMax()
  }, 100)
}

// NEW: Test v1.0.0 API with analyze_zaps()
async function testV1API() {
  if (!wasmReady) {
    updateStatus('error', 'WASM engine not ready. Please refresh the page.')
    return
  }
  
  if (!cachedZipData) {
    updateStatus('error', 'No ZIP data cached. Please upload a file first.')
    return
  }
  
  updateStatus('processing', 'Testing v1.0.0 API (analyze_zaps)...')
  
  try {
    // 🔥 Call WASM with empty array (analyze all Zaps)
    const resultJson = analyze_zaps(
      cachedZipData,
      [], // Empty array = analyze all Zaps
      currentPlanType, 
      includedTasks || 2000
    )
    const auditResult: AuditResult = JSON.parse(resultJson)
    
    console.log('✅ v1.0.0 Audit Result:', auditResult)
    
    // Validate schema version
    if (auditResult.schema_version !== '1.0.0') {
      throw new Error(`Invalid schema version: ${auditResult.schema_version}`)
    }
    
    updateStatus('success', `v1.0.0 API works! Found ${auditResult.per_zap_findings.length} Zaps with ${auditResult.global_metrics.total_monthly_tasks} monthly tasks`)
    
    // Log key metrics
    console.log('📊 Global Metrics:', auditResult.global_metrics)
    console.log('🔍 Findings:', auditResult.per_zap_findings.length)
    console.log('💰 Opportunities:', auditResult.opportunities_ranked.length)
    
  } catch (error) {
    console.error('❌ v1.0.0 API test failed:', error)
    updateStatus('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}


// Make test function globally available
;(window as any).testV1API = testV1API

// NEW: Back to Zap Selector (without re-upload)
function backToSelector() {
  if (zapList.length === 0) {
    updateStatus('error', 'No Zap list available. Please upload a ZIP file.')
    return
  }
  
  updateStatus('success', `Found ${zapList.length} Zap${zapList.length === 1 ? '' : 's'} - Select one to audit`)
  displayZapSelector(zapList)
}

// Setup drag and drop zone
function setupDropzone() {
  const dropzone = document.getElementById('dropzone')
  const fileInput = document.getElementById('file-input') as HTMLInputElement
    
  if (!dropzone || !fileInput) return
  
  // Click to upload
  dropzone.addEventListener('click', () => {
    fileInput.click()
  })
  
  // File input change
  fileInput.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement
    if (target.files && target.files[0]) {
      handleFileUpload(target.files[0])
    }
  })
  
  // Drag and drop handlers
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropzone.classList.add('border-blue-500', 'bg-blue-50')
  })
  
  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault()
    dropzone.classList.remove('border-blue-500', 'bg-blue-50')
  })
  
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropzone.classList.remove('border-blue-500', 'bg-blue-50')
    
    const files = e.dataTransfer?.files
    if (files && files[0]) {
      handleFileUpload(files[0])
    }
  })
  
  // PDF upload handler for re-audit
  const pdfInput = document.getElementById('pdf-upload') as HTMLInputElement
  if (pdfInput) {
    pdfInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement
      if (target.files && target.files[0]) {
        handlePDFUpload(target.files[0])
      }
    })
  }
}

// Render UI
function renderUI() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  
  app.innerHTML = `
    <div class="min-h-screen bg-[#fafafa]">
      <div class="container mx-auto px-6 py-12 max-w-4xl">
        <!-- Header -->
        <header class="text-center mb-12">
          <h1 class="text-5xl font-black text-zinc-900 mb-3" style="letter-spacing: -0.02em;">
            Zapier Lighthouse
          </h1>
          <p class="text-lg text-zinc-500 font-medium">Local Audit Engine • Privacy-First Analysis</p>
        </header>
        
        <!-- WASM Status Indicator -->
        <div class="mb-8 flex items-center justify-center">
          <div id="wasm-indicator" class="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-200">
            <div class="w-2 h-2 rounded-full bg-slate-300 animate-pulse"></div>
            <span class="text-sm font-medium text-slate-600">Initializing WASM Engine...</span>
          </div>
        </div>
        
        <!-- Dropzone with class -->
        <div id="dropzone" class="dropzone shadow-lg">
          <div class="bg-blue-100 rounded-full p-5 mb-5 inline-flex">
            <svg class="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 class="text-2xl font-bold text-slate-900 mb-2">Drop Zapier Export ZIP</h3>
          <p class="text-base text-slate-500 mb-1">or click to browse files</p>
          <p class="text-sm text-slate-400 font-mono mt-4 bg-slate-100 px-4 py-2 rounded-lg inline-block">
            🔒 All processing happens locally in your browser
          </p>
          <input type="file" id="file-input" accept=".zip" class="hidden" />
        </div>
        
        <!-- OR Divider -->
        <div class="relative my-8">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-slate-300"></div>
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="px-4 bg-[#fafafa] text-slate-500 font-bold">OR</span>
          </div>
        </div>

        <!-- PDF Re-Audit Upload -->
        <div class="text-center">
          <h3 class="text-xl font-bold text-slate-900 mb-3">Re-Audit from Previous Report</h3>
          <p class="text-slate-600 mb-4">Upload a Lighthouse PDF to re-run the same analysis</p>
          
          <label for="pdf-upload" class="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg cursor-pointer transition-all hover:scale-105 shadow-md">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Upload Previous PDF
          </label>
          <input type="file" id="pdf-upload" accept=".pdf,application/pdf" class="hidden" />
          
          <p class="text-xs text-slate-500 mt-2">
            💡 This will restore your previous settings and Zap selection
          </p>
        </div>
        
        <!-- Status -->
        <div id="status" class="mt-6 p-4 rounded-xl text-sm font-medium bg-slate-100 text-slate-600 border border-slate-200 shadow-sm">
          Initializing WASM engine...
        </div>
        
        <!-- Results -->
        <div id="results"></div>
        
        <!-- Footer -->
        <footer class="mt-16 pt-8 border-t border-zinc-200 text-center">
          <p class="text-sm text-zinc-500 font-medium">
            Zapier Lighthouse • Privacy-First Audit • Built with Rust & WASM
          </p>
        </footer>
      </div>
    </div>
  `
  
  setupDropzone()
}

// Initialize application
renderUI()
initWasm()

// Development tools (accessible via browser console)
if (import.meta.env.DEV) {
  import('./validation').then(({ testBrokenData }) => {
    (window as any).testBrokenData = testBrokenData
    console.log('💡 Dev tool available: testBrokenData()')
  })
}
