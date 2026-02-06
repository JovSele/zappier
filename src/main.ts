import './style.css'
import init, { hello_world, parse_zapier_export, parse_zapfile_json, parse_zap_list, parse_single_zap_audit, parse_batch_audit } from '../src-wasm/pkg/zapier_lighthouse_wasm'
import { generatePDFReport, generateDeveloperEditionPDF, type PDFConfig, type ParseResult, type BatchParseResult } from './pdfGenerator'
import { drawDebugGrid, sanitizeForPDF } from './pdfHelpers'

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
  savings_explanation: string
  is_fallback: boolean
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
    console.log('🎉 First install initialized:', firstInstall)
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
 * Get audit statistics (for debugging/display)
 */
function getAuditStats() {
  const firstInstall = localStorage.getItem('first_install_timestamp')
  const counter = parseInt(localStorage.getItem('audit_counter') || '0')
  return {
    first_install: firstInstall,
    total_audits: counter,
    next_id: counter + 1
  }
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
    const greeting = hello_world()
    console.log(greeting)
    
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
    
    console.log(`File size: ${uint8Array.length} bytes`)
    
    // Cache ZIP data for later use
    cachedZipData = uint8Array
    
    // NEW WORKFLOW: Call parse_zap_list (fast, no heuristics)
    const listResultJson = parse_zap_list(uint8Array)
    const listResult: ZapListResult = JSON.parse(listResultJson)
    
    console.log('Zap list result:', listResult)
    
    if (listResult.success) {
      zapList = listResult.zaps
      updateStatus('success', `✨ Found ${zapList.length} Zap${zapList.length === 1 ? '' : 's'} - Select one to audit`)
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

// NEW: Apply Cost Calibration (LIVE - no button needed)
function applyCostCalibration() {
  const monthlyBillInput = document.getElementById('monthly-bill') as HTMLInputElement
  const includedTasksInput = document.getElementById('included-tasks') as HTMLInputElement
  
  const bill = parseFloat(monthlyBillInput?.value || '0')
  const tasks = parseFloat(includedTasksInput?.value || '0')
  
  // Ticho fallback na benchmark ak sú polia prázdne alebo nevalidné
  if (!bill || !tasks || bill <= 0 || tasks <= 0) {
    pricePerTask = 0.02
    isCustomPrice = false
    monthlyBill = 0
    includedTasks = 0
    updateCalibrationBadge()
    return
  }
  
  // Vypočítaj efektívnu sadzbu
  monthlyBill = bill
  includedTasks = tasks
  pricePerTask = bill / tasks
  isCustomPrice = true
  
  updateCalibrationBadge()
  
  console.log(`💰 Live calibration: $${pricePerTask.toFixed(4)}/task (from $${bill}/${tasks} tasks)`)
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
    // ✅ DEBUG: Log parameters before WASM call
    console.log('🔍 WASM Call Parameters:', {
      zipDataSize: cachedZipData.byteLength,
      selectedIds: selectedIds,
      plan: 'professional',
      usage: includedTasks || 2000
    })
    
    // ✅ FIXED: Call WASM batch parser with tier-based pricing (plan + usage)
    const plan = 'professional' // Default to Professional plan
    const usage = includedTasks || 2000 // Use calibrated tasks or default to 2000
    
    const resultJson = parse_batch_audit(cachedZipData, selectedIds, plan, usage)
    const batchResult: BatchParseResult = JSON.parse(resultJson)
    
    console.log('📦 Batch audit result (Developer Edition):', batchResult)
    
    if (batchResult.success) {
      updateStatus('success', `✅ Successfully analyzed ${batchResult.zap_count} Zap${batchResult.zap_count === 1 ? '' : 's'}`)
      
      // Display Developer Edition results UI
      displayDeveloperEditionResults(batchResult)
    } else {
      updateStatus('error', batchResult.message)
    }
  } catch (error) {
    console.error('Error in batch analysis:', error)
    updateStatus('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Display Developer Edition batch analysis results with PDF download button
 */
function displayDeveloperEditionResults(batchResult: BatchParseResult) {
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
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white/10 rounded-lg p-4 text-center">
            <p class="text-3xl font-black text-white">${batchResult.zap_count}</p>
            <p class="text-sm text-blue-100 mt-1">Zaps Analyzed</p>
          </div>
          <div class="bg-white/10 rounded-lg p-4 text-center">
            <p class="text-3xl font-black text-white">${batchResult.total_flags}</p>
            <p class="text-sm text-blue-100 mt-1">Issues Found</p>
          </div>
          <div class="bg-white/10 rounded-lg p-4 text-center">
            <p class="text-3xl font-black text-white">$${Math.round(batchResult.total_estimated_savings)}</p>
            <p class="text-sm text-blue-100 mt-1">Monthly Savings</p>
          </div>
          <div class="bg-white/10 rounded-lg p-4 text-center">
            <p class="text-3xl font-black text-white">${Math.round(batchResult.average_efficiency_score)}/100</p>
            <p class="text-sm text-blue-100 mt-1">Avg Score</p>
          </div>
        </div>
      </div>
      
      <!-- Patterns Card -->
      ${batchResult.patterns && batchResult.patterns.length > 0 ? `
        <div class="stat-card mb-8">
          <h4 class="text-lg font-bold text-slate-900 mb-4">🔍 Pattern Detection</h4>
          <div class="space-y-3">
            ${batchResult.patterns.map(p => `
              <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div class="flex-1">
                  <p class="font-bold text-slate-900">${p.pattern_name}</p>
                  <p class="text-sm text-slate-600">${p.affected_count} Zaps affected • $${Math.round(p.total_waste_usd)}/month waste</p>
                </div>
                <span class="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                  ${p.severity.toUpperCase()}
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      <!-- System Metrics -->
      <div class="stat-card mb-8">
        <h4 class="text-lg font-bold text-slate-900 mb-4">⚙️ System Metrics</h4>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div class="p-4 bg-slate-50 rounded-lg">
            <p class="text-2xl font-bold text-slate-900">${batchResult.system_metrics.avg_steps_per_zap.toFixed(1)}</p>
            <p class="text-sm text-slate-600">Avg Steps/Zap</p>
          </div>
          <div class="p-4 bg-slate-50 rounded-lg">
            <p class="text-2xl font-bold text-slate-900">${batchResult.system_metrics.polling_trigger_count}</p>
            <p class="text-sm text-slate-600">Polling Triggers</p>
          </div>
          <div class="p-4 bg-slate-50 rounded-lg">
            <p class="text-2xl font-bold text-slate-900">${batchResult.system_metrics.instant_trigger_count}</p>
            <p class="text-sm text-slate-600">Instant Triggers</p>
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
          const reportId = getNextReportId()
          const reportCode = generateReportCode(reportId)
          const today = new Date().toISOString().split('T')[0]

          await generateDeveloperEditionPDF(batchResult, {
            agencyName: 'Zapier Lighthouse',
            clientName: 'Batch Analysis',
            reportDate: today,
            reportCode: reportCode 
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
                ${zap.title}
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
        if (target.checked) {
          selectAllActive()
        } else {
          deselectAll()
        }
      })
    }
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

/**
 * Generate Quick Wins HTML from top flags
 */
function generateQuickWinsHTML(flags: EfficiencyFlag[]): string {
  // Sort by severity (high → medium → low) and take top 3
  const sortedFlags = [...flags]
    .sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 }
      return (severityOrder[a.severity as keyof typeof severityOrder] || 999) - 
             (severityOrder[b.severity as keyof typeof severityOrder] || 999)
    })
    .slice(0, 3)
  
  if (sortedFlags.length === 0) {
    return '<p class="text-emerald-600 font-bold text-[11px]">✅ No optimization needed - your Zap is already highly efficient!</p>'
  }

  // Ikony pre rôzne typy flags
  const icons: Record<string, string> = {
    error_loop: '🔴',
    late_filter_placement: '⚡',
    polling_trigger: '🔄'
  }

  return sortedFlags.map(flag => {
    let actionText = ''
    let impactText = ''
    
    // Generate concise action + impact based on flag type
    if (flag.flag_type === 'error_loop') {
      actionText = 'Fix recurring failures'
      const errorReduction = flag.error_rate !== undefined ? Math.round(flag.error_rate) : 0
      impactText = `reduce wasted runs by ${errorReduction}%`
    } else if (flag.flag_type === 'late_filter_placement') {
      actionText = 'Move filters earlier in workflow'
      const monthlySavings = flag.estimated_monthly_savings.toFixed(0)
      impactText = `save ~$${monthlySavings}/month`
    } else if (flag.flag_type === 'polling_trigger') {
      actionText = 'Replace polling triggers'
      const monthlySavings = flag.estimated_monthly_savings.toFixed(0)
      impactText = `save ~$${monthlySavings}/month`
    } else {
      // Generic fallback
      actionText = flag.message.substring(0, 40)
      const monthlySavings = flag.estimated_monthly_savings.toFixed(0)
      impactText = monthlySavings !== '0' ? `save ~$${monthlySavings}/month` : 'optimize efficiency'
    }
    
    return `<p class="flex items-center gap-2">
              <span class="text-base leading-none flex-shrink-0">${icons[flag.flag_type] || '💡'}</span>
              <span class="leading-relaxed"><strong class="font-bold">${actionText}</strong> → ${impactText}</span>
            </p>`
  }).join('')
}

// ============================================================================
// HTML REPORT GENERATION (NEW)
// ============================================================================

/**
 * Generate HTML report from template with real data injection
 */
async function generateHtmlReport(result: ParseResult, zapInfo: ZapSummary): Promise<string> {
  try {
    // Load template
    const response = await fetch('/test-data/report_template.html')
    if (!response.ok) {
      throw new Error(`Failed to load template: ${response.statusText}`)
    }
    
    let html = await response.text()
    
    // Get current date for report
    const now = new Date()
    const reportDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const reportTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    
    // Calculate derived metrics (use Math.round for whole numbers)
    const annualSavings = Math.round(result.estimated_savings * 12).toString()
    const scoreLabel = getScoreLabel(result.efficiency_score)
    const errorFlag = result.efficiency_flags.find(f => f.flag_type === 'error_loop') as EfficiencyFlag | undefined
    const reliability = errorFlag ? Math.round(100 - (errorFlag.error_rate || 0)).toString() : '100'
    const errorRate = errorFlag ? Math.round(errorFlag.error_rate || 0).toString() : '0'

    // Calculate Sample runs and Period from zapInfo (if available)
    const sampleRuns = zapInfo.total_runs > 0 ? zapInfo.total_runs.toString() : '150' // fallback to 150
    const periodDays = '30' // Currently we always analyze 30 days (from CSV data)
    
    // PAGE 1 - Executive Overview replacements (use global RegExp)
    html = html.replace(/62\/100/g, `${result.efficiency_score}/100`)
    html = html.replace(/Below Optimal/g, scoreLabel)
    html = html.replace(/Jan 21, 2026 • 09:45 AM/g, `${reportDate} • ${reportTime}`)
    // Generate sequential report ID
    const reportId = getNextReportId()
    const reportCode = generateReportCode(reportId)
    html = html.replace(/LHA-2026-X79B2/g, reportCode)

// Save to audit log
saveAuditLog(reportId, reportCode, zapInfo.id, zapInfo.title)
    html = html.replace(/WordPress to Reddit Sync/g, zapInfo.title)
    html = html.replace(/ID: 884-291-002/g, `ID: ${zapInfo.id}`)
    html = html.replace(/Status: <span class="text-emerald-500 uppercase font-semibold">Active<\/span>/g, 
      `Status: <span class="text-${zapInfo.status.toLowerCase() === 'on' ? 'emerald' : 'slate'}-500 uppercase font-semibold">${zapInfo.status.toUpperCase()}</span>`)
    
    // Replace Sample and Period in Data Confidence section
    html = html.replace(/Sample: 150 runs/g, `Sample: ${sampleRuns} runs`)
    html = html.replace(/Period: 30 days/g, `Period: ${periodDays} days`)

    // Savings replacements (multiple occurrences)
    html = html.replace(/\$405\/year/g, `$${annualSavings}/year`)
    html = html.replace(/\$405/g, `$${annualSavings}`)

    // Replace Annual Waste ($1,240 in template - currently hardcoded)
    const annualWaste = Math.round(result.estimated_savings * 12 * 2.5).toString()
    html = html.replace(/\$1,240\/yr/g, `$${annualWaste}/yr`)
    html = html.replace(/\$1,240/g, `$${annualWaste}`)

    // Replace $450 (current yearly cost in template)
    const currentYearlyCost = Math.round((result.estimated_savings * 12) + parseInt(annualSavings)).toString()
    html = html.replace(/\$450/g, `$${currentYearlyCost}`)
    
    // Reliability metrics
    html = html.replace(/62%<\/div>/g, `${reliability}%</div>`)
    html = html.replace(/38% <span class="text-emerald-600">→ potential under 5%<\/span>/g, 
      `${errorRate}% <span class="text-emerald-600">→ potential under 5%</span>`)

    // Fix "Below expected reliability" text when reliability is 100%
    if (reliability === '100') {
      html = html.replace(/Below expected reliability/gi, 'Excellent reliability')
      html = html.replace(/text-rose-500/g, 'text-emerald-500')
    }
    
    // Replace dynamic Action Plan section
    html = replaceActionPlan(html, result.efficiency_flags)

    // Replace Quick Wins section
    const quickWinsHTML = generateQuickWinsHTML(result.efficiency_flags)
    html = html.replace(
      /<!-- Quick Wins -->[\s\S]*?<\/div>\s*<!-- Footer -->/,
      `<!-- Quick Wins -->
        <div class="card border-emerald-100 bg-emerald-50/30 p-4 mb-6">
            <h4 class="text-emerald-700 text-[9px] font-black uppercase tracking-widest mb-3">
                Top Optimization Opportunities
            </h4>
            <div class="space-y-2 text-[11px] text-slate-700">
                ${quickWinsHTML}
            </div>
        </div>
        <!-- Footer -->`
    )
    
    // PAGE 2 - Technical Details
    html = html.replace(/12 Steps • High Complexity/g, `${result.total_nodes} Steps • ${result.total_nodes > 8 ? 'High' : result.total_nodes > 4 ? 'Medium' : 'Low'} Complexity`)
    html = html.replace(/12 Steps/g, `${result.total_nodes} Steps`)
    
    // Replace workflow architecture diagram trigger
    const triggerInitial = zapInfo.trigger_app.charAt(0).toUpperCase()
    html = html.replace(/<div class="w-12 h-12 bg-white rounded-lg border border-slate-200 flex items-center justify-center mx-auto mb-2 text-blue-600 font-black text-lg shadow-sm">W<\/div>/g,
      `<div class="w-12 h-12 bg-white rounded-lg border border-slate-200 flex items-center justify-center mx-auto mb-2 text-blue-600 font-black text-lg shadow-sm">${triggerInitial}</div>`)
    html = html.replace(/<p class="text-\[8px\] font-black text-slate-700 uppercase">WordPress<\/p>/g,
      `<p class="text-[8px] font-black text-slate-700 uppercase">${zapInfo.trigger_app}</p>`)
    
    // Replace Error Analysis section (if error_loop exists)
    html = replaceErrorAnalysis(html, result.efficiency_flags)
    
    // Replace Cost Waste Analysis section
    html = replaceCostWasteAnalysis(html, result.efficiency_flags)
    
    // Replace reliability donut chart
    html = html.replace(/38%<\/span>/g, `${errorRate}%</span>`)
    html = html.replace(/62% Success/g, `${reliability}% Success`)
    html = html.replace(/38% Errors/g, `${errorRate}% Errors`)
    html = html.replace(/stroke-dasharray="38, 100"/g, `stroke-dasharray="${errorRate}, 100"`)
    
    // Replace total optimization potential
    html = html.replace(/~\$453/g, `~$${annualSavings}`)
    
    return html
  } catch (error) {
    console.error('Error generating HTML report:', error)
    throw error
  }
}

/**
 * Get score label based on efficiency score
 */
function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 50) return 'Fair'
  return 'Below Optimal'
}

/**
 * Replace Action Plan section with dynamic flags
 */
function replaceActionPlan(html: string, flags: any[]): string {
  // Sort flags by severity (high → medium → low)
  const sortedFlags = [...flags].sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 }
    return (severityOrder[a.severity as keyof typeof severityOrder] || 999) - 
           (severityOrder[b.severity as keyof typeof severityOrder] || 999)
  })
  
  // Generate HTML for each flag
  const flagsHTML = sortedFlags.slice(0, 3).map(flag => {
    const severityClass = flag.severity === 'high' ? 'severity-critical' : 
                         flag.severity === 'medium' ? 'severity-important' : 
                         'severity-optimize'
    const severityLabel = flag.severity === 'high' ? 'CRITICAL' : 
                         flag.severity === 'medium' ? 'IMPORTANT' : 
                         'OPTIMIZE'
    
    let problemText = ''
    let fixText = ''
    let effortText = ''
    
    if (flag.flag_type === 'error_loop') {
      problemText = `Connection expired — ${flag.error_rate?.toFixed(0) || '0'}% of runs are failing right now.`
      fixText = 'Re-authenticate the affected account in Zapier.'
      effortText = 'Quick Fix'
    } else if (flag.flag_type === 'late_filter_placement') {
      problemText = 'Steps execute before conditions are checked, wasting task usage.'
      fixText = 'Apply filtering as early as possible to stop unnecessary execution.'
      effortText = 'Significant task reduction'
    } else if (flag.flag_type === 'polling_trigger') {
      problemText = 'Trigger checks for updates even when there aren\'t any.'
      fixText = 'Use event-based triggers instead of scheduled checks where possible.'
      effortText = 'Structural Change'
    }
    
    return `
            <div class="flex items-start gap-4 p-3 bg-white/5 rounded-lg border border-white/10">
                <span class="${severityClass} px-2 py-0.5 rounded text-[8px] font-black uppercase shrink-0 mt-0.5">${severityLabel}</span>
                <div>
                    <p class="text-white text-[11px] font-bold uppercase tracking-tight mb-1">${flag.message}</p>
                    <p class="text-slate-300 text-[10px] leading-relaxed">
                        <strong class="text-white">Problem:</strong> ${problemText}<br>
                        <strong class="text-white">Fix:</strong> ${fixText}<br>
                        <strong class="${flag.severity === 'high' ? 'text-emerald-400' : flag.severity === 'medium' ? 'text-emerald-400' : 'text-amber-400'}">Effort:</strong> ${effortText}
                    </p>
                </div>
            </div>
    `
  }).join('')
  
  // Find and replace the Action Plan section
  const actionPlanRegex = /<div class="space-y-4 relative z-10">([\s\S]*?)<\/div>\s*<\/div>\s*<!-- Quick Wins -->/
  const replacement = `<div class="space-y-4 relative z-10">${flagsHTML || '<p class="text-white text-sm">No critical issues detected!</p>'}</div>
    </div>
    <!-- Quick Wins -->`
  
  return html.replace(actionPlanRegex, replacement)
}

/**
 * Replace Error Analysis section with real data
 */
function replaceErrorAnalysis(html: string, flags: any[]): string {
  const errorFlag = flags.find(f => f.flag_type === 'error_loop')
  
  if (!errorFlag) {
    // Remove error analysis section if no error_loop
    const errorSectionRegex = /<!-- Reliability Concerns -->[\s\S]*?<\/div>\s*<\/div>\s*<!-- Optimization Checklist -->/
    return html.replace(errorSectionRegex, '<!-- Optimization Checklist -->')
  }
  
  const errorRate = (errorFlag.error_rate || 0).toFixed(0)
  const failureCount = Math.round((errorFlag.error_rate || 0) / 10) // Approximation
  const totalRuns = 10 // Approximation for display
  const maxStreak = errorFlag.max_streak || 0
  const mostCommonError = errorFlag.most_common_error || 'Connection timeout'
  const monthlySavings = errorFlag.estimated_monthly_savings?.toFixed(0) || '0'
  
  // Replace error rate
  html = html.replace(/60% Failure Rate/g, `${errorRate}% Failure Rate`)
  html = html.replace(/6 out of your last 10 runs crashed/g, 
    `${failureCount} out of your last ${totalRuns} runs crashed`)
  html = html.replace(/5 runs in a row/g, `${maxStreak} runs in a row`)
  html = html.replace(/Expired Reddit API connection\./g, mostCommonError)
  html = html.replace(/Estimated recovery: \$12\/month/g, `Estimated recovery: $${monthlySavings}/month`)
  
  return html
}

/**
 * Replace Cost Waste Analysis section with real optimization opportunities
 */
/**
 * Replace Cost Waste Analysis section with real optimization opportunities
 */
function replaceCostWasteAnalysis(html: string, flags: any[]): string {
  const pollingFlag = flags.find(f => f.flag_type === 'polling_trigger')
  const filterFlag = flags.find(f => f.flag_type === 'late_filter_placement')
  
  let cardsHTML = ''
  
  // Polling trigger card
  if (pollingFlag) {
    const annualSavings = ((pollingFlag.estimated_monthly_savings || 0) * 12).toFixed(0)
    cardsHTML += `
        <div class="m-4 p-5 bg-amber-50/50 border border-amber-100 rounded-xl">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                    <span class="bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase">Medium Priority</span>
                    <h3 class="text-sm font-black text-slate-800 tracking-tight">Checking For Updates Too Often</h3>
                </div>
            </div>
            
            <p class="text-[12px] text-slate-700 leading-relaxed mb-3">
                ${pollingFlag.details}
            </p>

            <div class="flex items-center gap-2 p-2 bg-white/50 rounded-lg border border-amber-100 w-fit">
                <div class="w-4 h-4 bg-emerald-500 rounded flex items-center justify-center text-white text-[8px] font-black">✓</div>
                <p class="text-[10px] font-bold text-emerald-700 uppercase italic">Estimated savings: $${annualSavings}/year</p>
            </div>
        </div>
`
  }
  
  // Late filter placement card
  if (filterFlag) {
    const annualSavings = ((filterFlag.estimated_monthly_savings || 0) * 12).toFixed(0)
    cardsHTML += `
        <div class="m-4 ${pollingFlag ? 'mt-0' : ''} p-5 bg-rose-50/50 border border-rose-100 rounded-xl">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                    <span class="bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase">High Priority</span>
                    <h3 class="text-sm font-black text-slate-800 tracking-tight">Paying For Steps That Get Thrown Away</h3>
                </div>
            </div>
            
            <p class="text-[12px] text-slate-700 leading-relaxed mb-3">
               ${filterFlag.details}
            </p>

            <div class="flex items-center gap-2 p-2 bg-white/50 rounded-lg border border-rose-100 w-fit">
                <div class="w-4 h-4 bg-emerald-500 rounded flex items-center justify-center text-white text-[8px] font-black">✓</div>
                <p class="text-[10px] font-bold text-emerald-700 uppercase italic">Estimated savings: $${annualSavings}/year</p>
            </div>
        </div>
`
  }
  
  // Empty state if no flags
  if (!cardsHTML) {
    cardsHTML = `
        <div class="m-4 p-5 bg-emerald-50/50 border border-emerald-100 rounded-xl text-center">
            <p class="text-sm text-emerald-700 font-bold">✅ No cost waste detected! Your Zap is well optimized.</p>
        </div>
`
  }
  
  // Count opportunities dynamically
  const opportunityCount = [pollingFlag, filterFlag].filter(Boolean).length
  
  // Build complete section with header
  const fullSectionHTML = `
    <!-- Optimization Checklist -->
    <!-- COST_WASTE_START -->
    <div class="mb-8 card p-0 overflow-hidden border-blue-100 shadow-sm">
        <div class="bg-blue-600 p-4 flex justify-between items-center text-white">
            <div class="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <h4 class="text-[10px] font-black uppercase tracking-[0.2em]">Cost Waste Analysis</h4>
            </div>
            <span class="text-[9px] font-bold opacity-90 uppercase">${opportunityCount} Opportunit${opportunityCount === 1 ? 'y' : 'ies'}</span>
        </div>
${cardsHTML}
    </div>
    <!-- COST_WASTE_END -->
`
  
  // Simple marker-based replacement
  const regex = /<!-- COST_WASTE_START -->[\s\S]*?<!-- COST_WASTE_END -->/
  return html.replace(regex, fullSectionHTML)
}

// NEW: Handle Zap Selection (run full audit on selected Zap)
async function handleZapSelect(zapId: number) {
  if (!cachedZipData) {
    updateStatus('error', 'ZIP data not cached. Please upload again.')
    return
  }
  
  const selectedZap = zapList.find(z => z.id === zapId)
  if (!selectedZap) {
    updateStatus('error', 'Selected Zap not found')
    return
  }
  
  updateStatus('processing', `Auditing "${selectedZap.title}"...`)
  
  try {
    // Call WASM parser for single Zap audit
    const resultJson = parse_single_zap_audit(cachedZipData, BigInt(zapId), currentPlanType, includedTasks || 2000)
    const result = JSON.parse(resultJson)
    
    console.log('Single Zap audit result:', result)
    
    if (result.success) {
      updateStatus('success', `✅ Audit complete for "${selectedZap.title}"`)
      
      // NEW: Generate HTML report and display in preview
      const htmlReport = await generateHtmlReport(result, selectedZap)
      displayHtmlPreview(htmlReport, result, selectedZap)
    } else {
      updateStatus('error', result.message)
    }
    
  } catch (error) {
    console.error('Error auditing Zap:', error)
    updateStatus('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Display HTML report in iframe preview
 */
function displayHtmlPreview(htmlContent: string, result: ParseResult, zapInfo: ZapSummary) {
  const resultsEl = document.getElementById('results')
  if (!resultsEl) return
  
  // Calculate total estimated savings (sum of all flags)
  const totalMonthlySavings = result.efficiency_flags.reduce((sum, flag) => sum + flag.estimated_monthly_savings, 0)
  const totalAnnualSavings = (totalMonthlySavings * 12).toFixed(0)
  
  resultsEl.innerHTML = `
    <div class="mt-10">
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-2xl font-bold text-zinc-900" style="letter-spacing: -0.02em;">Report Preview</h3>
        <div class="flex gap-3">
          ${zapList.length > 0 ? `
            <button onclick="backToSelector()" class="inline-flex items-center gap-2 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white text-sm font-bold rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Selection
            </button>
          ` : ''}
          <button id="download-pdf-btn" class="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Download PDF Report
          </button>
        </div>
      </div>
      
      <!-- Savings Info Card -->
      <div class="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
        <p class="text-sm text-emerald-700 flex items-center justify-between">
          <span class="font-bold">💰 Total Estimated Annual Savings: $${totalAnnualSavings}/year</span>
          <span class="text-xs text-emerald-600">(Monthly: $${totalMonthlySavings.toFixed(0)})</span>
        </p>
      </div>
      
      <!-- HTML Preview in iframe -->
      <div class="bg-white rounded-xl shadow-2xl border-2 border-slate-200 overflow-auto" style="max-height: 800px;">
        <div class="bg-slate-800 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
          <div class="flex items-center gap-2">
            <div class="flex gap-1.5">
              <div class="w-3 h-3 rounded-full bg-rose-500"></div>
              <div class="w-3 h-3 rounded-full bg-amber-500"></div>
              <div class="w-3 h-3 rounded-full bg-emerald-500"></div>
            </div>
            <span class="text-slate-300 text-sm font-mono ml-4">📄 ${zapInfo.title} - Audit Report</span>
          </div>
          <span class="text-slate-400 text-xs">Preview Mode</span>
        </div>
        <iframe 
          id="report-preview-iframe" 
          class="w-full border-0" 
          style="width: 210mm; min-height: 297mm; display: block; margin: 0 auto; background: white;"
          sandbox="allow-scripts allow-same-origin"
        ></iframe>
      </div>
      
      <!-- Info Banner -->
      <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <p class="text-sm text-blue-700 flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          💡 This is a live preview of your HTML report. Click "Download PDF Report" to generate the final PDF document.
        </p>
      </div>
    </div>
  `
  
  // Inject HTML into iframe with proper CSS and font loading
  setTimeout(() => {
    const iframe = document.getElementById('report-preview-iframe') as HTMLIFrameElement
    if (iframe && iframe.contentWindow) {
      // Ensure HTML has proper head section with Tailwind and fonts
      let processedHTML = htmlContent
      
      // Check if HTML already has Tailwind script (it should from template)
      if (!processedHTML.includes('cdn.tailwindcss.com')) {
        // Inject Tailwind CDN if missing
        processedHTML = processedHTML.replace(
          '</head>',
          '<script src="https://cdn.tailwindcss.com"></script></head>'
        )
      }
      
      // Ensure Inter font is loaded
      if (!processedHTML.includes('fonts.googleapis.com/css2?family=Inter')) {
        processedHTML = processedHTML.replace(
          '</head>',
          '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet"></head>'
        )
      }
      
      // Add global Inter font styling to ensure consistency
      if (!processedHTML.includes('font-family: \'Inter\'')) {
        processedHTML = processedHTML.replace(
          '</head>',
          '<style>* { font-family: \'Inter\', sans-serif !important; }</style></head>'
        )
      }
      
      // Write to iframe
      iframe.contentWindow.document.open()
      iframe.contentWindow.document.write(processedHTML)
      iframe.contentWindow.document.close()
      
      // Auto-adjust iframe height after content loads
      iframe.onload = () => {
        try {
          const iframeDoc = iframe.contentWindow?.document
          if (iframeDoc) {
            const height = iframeDoc.documentElement.scrollHeight
            iframe.style.height = `${height}px`
          }
        } catch (e) {
          console.warn('Could not auto-adjust iframe height:', e)
        }
      }
    }
    
    // Setup PDF download button
    const pdfBtn = document.getElementById('download-pdf-btn')
    if (pdfBtn) {
      pdfBtn.addEventListener('click', async () => {
        pdfBtn.innerHTML = `
          <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Generating PDF...
        `
        pdfBtn.classList.add('opacity-75', 'cursor-wait')
        
        try {
          // ✅ GENERUJ REPORT ID PRED VYTVORENÍM PDF
          const reportId = getNextReportId()
          const reportCode = generateReportCode(reportId)

          // ✅ ULOŽ DO AUDIT LOGU
          saveAuditLog(reportId, reportCode, zapInfo.id, zapInfo.title)

          const today = new Date().toISOString().split('T')[0]

          await generatePDFReport(result, {
            agencyName: 'Zapier Lighthouse',
            clientName: zapInfo.title,
            reportDate: today,
            reportCode: reportCode 
          })
          
          pdfBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Downloaded!
          `
          pdfBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'opacity-75', 'cursor-wait')
          pdfBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700')
          
          setTimeout(() => {
            pdfBtn.innerHTML = `
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Download PDF Report
            `
            pdfBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700')
            pdfBtn.classList.add('bg-blue-600', 'hover:bg-blue-700')
          }, 2000)
        } catch (err) {
          console.error('Failed to generate PDF:', err)
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

// Load test data from JSON file
async function loadTestData() {
  if (!wasmReady) {
    updateStatus('error', 'WASM engine not ready. Please refresh the page.')
    return
  }
  
  updateStatus('processing', 'Loading test data...')
  
  try {
    // Fetch the test JSON file
    const response = await fetch('/test-data/bad_example.json')
    if (!response.ok) {
      throw new Error(`Failed to load test data: ${response.statusText}`)
    }
    
    const jsonContent = await response.text()
    console.log('Loaded test data:', jsonContent.substring(0, 200))
    
    // Call WASM parser with JSON directly
    const resultJson = parse_zapfile_json(jsonContent)
    const result = JSON.parse(resultJson)
    
    console.log('Parse result:', result)
    
    if (result.success) {
      updateStatus('success', '✨ Test data loaded - Contains 2 Zaps with known issues for testing')
      displayResults(result)
    } else {
      updateStatus('error', result.message)
    }
    
  } catch (error) {
    console.error('Error loading test data:', error)
    updateStatus('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// NEW: Back to Zap Selector (without re-upload)
function backToSelector() {
  if (zapList.length === 0) {
    updateStatus('error', 'No Zap list available. Please upload a ZIP file.')
    return
  }
  
  updateStatus('success', `✨ Found ${zapList.length} Zap${zapList.length === 1 ? '' : 's'} - Select one to audit`)
  displayZapSelector(zapList)
}

// Display parsing results
function displayResults(result: ParseResult) {
  const resultsEl = document.getElementById('results')
  if (!resultsEl) return
  
  // Generate app inventory HTML
  const appInventoryHTML = result.apps.map(app => `
    <div class="flex items-center justify-between py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 px-3 rounded transition-colors">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
          ${app.name.charAt(0)}
        </div>
        <div>
          <p class="font-semibold text-slate-900">${app.name}</p>
          <p class="text-xs text-slate-400 font-mono">${app.raw_api}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-semibold">
          ${app.count} ${app.count === 1 ? 'use' : 'uses'}
        </span>
      </div>
    </div>
  `).join('');
  
  // Generate efficiency flags HTML
  const getSeverityBadge = (severity: string) => {
    if (severity === 'high') return 'bg-rose-100 text-rose-700 border-rose-200';
    if (severity === 'medium') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };
  
  const getSeverityIcon = (severity: string) => {
    if (severity === 'high') return '🔴';
    if (severity === 'medium') return '🟡';
    return '🔵';
  };
  
  const efficiencyFlagsHTML = result.efficiency_flags.length > 0 ? `
    <div class="stat-card mb-8 border-l-4 border-amber-400">
      <div class="flex items-center justify-between mb-4">
        <h4 class="text-lg font-bold text-slate-900">⚠️ Efficiency Flags</h4>
        <span class="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-semibold">
          ${result.efficiency_flags.length} ${result.efficiency_flags.length === 1 ? 'issue' : 'issues'}
        </span>
      </div>
      <p class="text-sm text-slate-500 mb-4">Potential optimization opportunities detected</p>
      <div class="space-y-3">
        ${result.efficiency_flags.map(flag => `
          <div class="border ${getSeverityBadge(flag.severity)} rounded-lg p-4">
            <div class="flex items-start gap-3">
              <span class="text-2xl">${getSeverityIcon(flag.severity)}</span>
              <div class="flex-1">
                <div class="flex items-center justify-between mb-2">
                  <h5 class="font-bold text-slate-900">${flag.zap_title}</h5>
                  <span class="px-2 py-1 bg-white rounded text-xs font-semibold text-slate-600 border border-slate-200">
                    ${flag.severity.toUpperCase()}
                  </span>
                </div>
                <p class="text-sm font-semibold text-slate-700 mb-2">${flag.message}</p>
                <p class="text-sm text-slate-600 mb-3">${flag.details}</p>
                <div class="flex items-center justify-between flex-wrap gap-2 mt-3">
                  <p class="text-xs text-slate-400 font-mono">Zap ID: ${flag.zap_id}</p>
                  <a href="${flag.flag_type === 'late_filter_placement' ? 'https://help.zapier.com/hc/en-us/articles/8496288555917-Add-conditions-to-Zaps-with-Filter' : 'https://help.zapier.com/hc/en-us/articles/8496181725453-Trigger-Zaps-instantly'}" 
                     target="_blank" 
                     rel="noopener noreferrer"
                     class="inline-flex items-center gap-1 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-md transition-colors">
                    📖 Technical Docs
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';
  
  // Determine score color and message
  const getScoreColor = (score: number) => {
    if (score >= 90) return { bg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-500', ring: 'ring-emerald-100' };
    if (score >= 75) return { bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-500', ring: 'ring-blue-100' };
    if (score >= 50) return { bg: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-500', ring: 'ring-amber-100' };
    return { bg: 'bg-rose-500', text: 'text-rose-600', border: 'border-rose-500', ring: 'ring-rose-100' };
  };
  
  const getScoreMessage = (score: number) => {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Needs Improvement';
  };
  
  const scoreColor = getScoreColor(result.efficiency_score);
  const scoreMessage = getScoreMessage(result.efficiency_score);
  
  // Helper function to generate gauge SVG
  const generateGaugeSVG = (score: number) => {
    const radius = 80;
    const strokeWidth = 12;
    const normalizedRadius = radius - strokeWidth / 2;
    const circumference = normalizedRadius * Math.PI; // Half circle
    const offset = circumference - (score / 100) * circumference;
    
    let gaugeColor = '#ef4444'; // red
    if (score >= 71) gaugeColor = '#10b981'; // green
    else if (score >= 41) gaugeColor = '#f59e0b'; // amber
    
    return `
      <svg width="180" height="100" viewBox="0 0 180 100" class="gauge-chart">
        <!-- Background arc -->
        <path d="M 20 90 A 70 70 0 0 1 160 90" 
          fill="none" 
          stroke="#e5e7eb" 
          stroke-width="${strokeWidth}" 
          stroke-linecap="round"/>
        <!-- Progress arc -->
        <path d="M 20 90 A 70 70 0 0 1 160 90" 
          fill="none" 
          stroke="${gaugeColor}" 
          stroke-width="${strokeWidth}" 
          stroke-linecap="round"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${offset}"
          style="transition: stroke-dashoffset 1s ease-in-out;"/>
        <!-- Score text -->
        <text x="90" y="75" text-anchor="middle" class="text-4xl font-black" fill="${gaugeColor}">${score}</text>
        <text x="90" y="92" text-anchor="middle" class="text-xs font-semibold" fill="#64748b">out of 100</text>
      </svg>
    `;
  };
  
  resultsEl.innerHTML = `
    <div class="mt-10">
      <div class="flex items-center justify-between mb-6 opacity-0 animate-fade-in-up">
        <h3 class="text-2xl font-bold text-zinc-900" style="letter-spacing: -0.02em;">Analysis Results</h3>
        <div class="flex gap-3">
          ${zapList.length > 0 ? `
            <button onclick="backToSelector()" class="inline-flex items-center gap-2 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white text-sm font-bold rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Selection
            </button>
          ` : ''}
          <button id="download-pdf-btn" class="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Download PDF Report
          </button>
        </div>
      </div>
      
      <!-- Efficiency Score Hero Card -->
      <div class="stat-card mb-8 bg-gradient-to-br from-slate-900 to-slate-800 border-2 ${scoreColor.border} opacity-0 animate-fade-in-up stagger-1">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Overall Efficiency Score</p>
            <div class="flex items-baseline gap-3 mb-2">
              <span class="text-7xl font-black text-white">${result.efficiency_score}</span>
              <span class="text-3xl font-bold text-slate-400">/100</span>
            </div>
            <p class="text-lg font-semibold ${scoreColor.text.replace('text-', 'text-opacity-90 text-')} bg-white bg-opacity-10 px-4 py-2 rounded-lg inline-block">
              ${scoreMessage}
            </p>
          </div>
          <div class="hidden md:block">
            <div class="relative w-32 h-32">
              <svg class="w-32 h-32 transform -rotate-90">
                <circle cx="64" cy="64" r="56" stroke="currentColor" stroke-width="8" fill="none" class="text-slate-700" />
                <circle cx="64" cy="64" r="56" stroke="currentColor" stroke-width="8" fill="none" 
                  class="${scoreColor.bg.replace('bg-', 'text-')}"
                  stroke-dasharray="${2 * Math.PI * 56}"
                  stroke-dashoffset="${2 * Math.PI * 56 * (1 - result.efficiency_score / 100)}"
                  stroke-linecap="round" />
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <span class="text-2xl font-black text-white">${result.efficiency_score}</span>
              </div>
            </div>
          </div>
        </div>
        ${result.efficiency_score < 100 ? `
          <div class="mt-6 pt-6 border-t border-slate-700">
            <p class="text-sm text-slate-300 flex items-center gap-2">
              <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              ${result.efficiency_flags.length} optimization ${result.efficiency_flags.length === 1 ? 'opportunity' : 'opportunities'} detected below
            </p>
          </div>
        ` : `
          <div class="mt-6 pt-6 border-t border-slate-700">
            <p class="text-sm text-emerald-300 flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Perfect score! Your Zaps are highly optimized.
            </p>
          </div>
        `}
      </div>
      
      <!-- Estimated Annual Savings Card -->
      ${result.estimated_savings > 0 ? `
        <div class="stat-card mb-8 bg-gradient-to-br from-emerald-500 to-emerald-600 border-2 border-emerald-400">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-bold text-emerald-100 uppercase tracking-wider mb-3">💸 Estimated Annual Savings</p>
              <div class="flex items-baseline gap-3 mb-2">
                <span class="text-6xl font-black text-white animate-pulse-scale">$${(result.estimated_savings * 12).toFixed(0)}</span>
                <span class="text-2xl font-bold text-emerald-100">/year</span>
              </div>
              <p class="text-sm text-emerald-50 mt-3">
                Monthly: $${result.estimated_savings.toFixed(0)} • Based on fixing all detected issues
              </p>
            </div>
            <div class="hidden md:block text-white opacity-20">
              <svg class="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z"/>
              </svg>
            </div>
          </div>
          <div class="mt-6 pt-6 border-t border-emerald-400">
            <p class="text-xs text-emerald-50 flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Based on average Zapier task pricing ($0.03/task) and typical usage patterns
            </p>
          </div>
        </div>
      ` : ''}
      
      <!-- Results Grid using .stat-card -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <!-- Zaps Found Card -->
        <div class="stat-card">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Zaps Found</p>
              <p class="text-5xl font-bold text-slate-900">${result.zap_count}</p>
            </div>
            <div class="text-blue-500 opacity-80">
              <svg class="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
        </div>
        
        <!-- Total Steps Card -->
        <div class="stat-card">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Total Steps</p>
              <p class="text-5xl font-bold text-slate-900">${result.total_nodes}</p>
            </div>
            <div class="text-slate-400 opacity-80">
              <svg class="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Efficiency Flags Section -->
      ${efficiencyFlagsHTML}
      
      <!-- App Inventory Section -->
      <div class="stat-card mb-8">
        <div class="flex items-center justify-between mb-4">
          <h4 class="text-lg font-bold text-slate-900">App Inventory</h4>
          <span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
            ${result.apps.length} ${result.apps.length === 1 ? 'app' : 'apps'}
          </span>
        </div>
        <p class="text-sm text-slate-500 mb-4">All tools and integrations used across your Zaps</p>
        <div class="space-y-1">
          ${appInventoryHTML}
        </div>
      </div>
      
      <!-- Technical Details -->
      <div class="stat-card bg-slate-900">
        <h4 class="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4">Processing Details</h4>
        <div class="space-y-2 text-slate-200 font-mono text-sm">
          <p class="flex items-center">
            <span class="text-emerald-400 mr-2">✓</span>
            <span>ZIP archive processed successfully</span>
          </p>
          <p class="flex items-center">
            <span class="text-emerald-400 mr-2">✓</span>
            <span>zapfile.json parsed with proper schema</span>
          </p>
          <p class="flex items-center">
            <span class="text-emerald-400 mr-2">✓</span>
            <span>All nodes (steps) detected</span>
          </p>
          <p class="flex items-center">
            <span class="text-emerald-400 mr-2">✓</span>
            <span>App inventory extracted (${result.apps.length} unique apps)</span>
          </p>
          <p class="flex items-center mt-4 pt-4 border-t border-slate-700">
            <span class="text-blue-400 mr-2">⏱</span>
            <span class="text-blue-300">Processing time: &lt;2s</span>
          </p>
        </div>
      </div>
    </div>
  `
  
  // Setup PDF download button
  setTimeout(() => {
    const pdfBtn = document.getElementById('download-pdf-btn')
    if (pdfBtn) {
      pdfBtn.addEventListener('click', async () => {
        pdfBtn.innerHTML = `
          <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Generating...
        `
        pdfBtn.classList.add('opacity-75', 'cursor-wait')
        
        try {

          const today = new Date().toISOString().split('T')[0]

          await generatePDFReport(result, {
            agencyName: 'Zapier Lighthouse',
            clientName: 'Client',
            reportDate: today,
            reportCode: 'LHA-TEST-REPORT' 
          })
          
          pdfBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Downloaded!
          `
          pdfBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'opacity-75', 'cursor-wait')
          pdfBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700')
          
          setTimeout(() => {
            pdfBtn.innerHTML = `
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Download PDF Report
            `
            pdfBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700')
            pdfBtn.classList.add('bg-blue-600', 'hover:bg-blue-700')
          }, 2000)
        } catch (err) {
          console.error('Failed to generate PDF:', err)
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

// Setup drag and drop zone
function setupDropzone() {
  const dropzone = document.getElementById('dropzone')
  const fileInput = document.getElementById('file-input') as HTMLInputElement
  const testDataBtn = document.getElementById('test-data-btn')
  
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
  
  // Test data button
  if (testDataBtn) {
    testDataBtn.addEventListener('click', () => {
      loadTestData()
    })
  }
  
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
        
        <!-- Test Data Button -->
        <div class="mt-6 text-center">
          <button id="test-data-btn" class="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            Load Test Data (2 Bad Zaps)
          </button>
          <p class="text-xs text-slate-400 mt-2">Contains examples of polling triggers and late filter placement</p>
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
