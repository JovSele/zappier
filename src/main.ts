import './style.css'
import init, { hello_world, parse_zapier_export, parse_zapfile_json, parse_zap_list, parse_single_zap_audit } from '../src-wasm/pkg/zapier_lighthouse_wasm'
import { generatePDFReport, type PDFConfig, type ParseResult } from './pdfGenerator'
import { drawDebugGrid, sanitizeForPDF } from './pdfHelpers'

// NEW: Type definitions for Zap Selector
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

interface ZapListResult {
  success: boolean
  message: string
  zaps: ZapSummary[]
}

// Initialize WASM module
let wasmReady = false

// NEW: State management for cached ZIP data
let cachedZipData: Uint8Array | null = null
let zapList: ZapSummary[] = []

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
        <div class="col-span-1">
          <span class="text-xs font-bold text-slate-500 uppercase">#</span>
        </div>
        <div class="col-span-5">
          <span class="text-xs font-bold text-slate-500 uppercase">Zap Name</span>
        </div>
        <div class="col-span-2">
          <span class="text-xs font-bold text-slate-500 uppercase">Status</span>
        </div>
        <div class="col-span-2 text-center">
          <span class="text-xs font-bold text-slate-500 uppercase">Last Run</span>
        </div>
        <div class="col-span-2 text-right">
          <span class="text-xs font-bold text-slate-500 uppercase">Error Rate</span>
        </div>
      </div>
    </div>
    
    <!-- Table Rows -->
    ${filteredZaps.length > 0 ? filteredZaps.map((zap, index) => {
      const statusBadge = getStatusBadge(zap.status)
      const errorBadge = getErrorRateBadge(zap.error_rate)
      const lastRun = formatRelativeTime(zap.last_run)
      
      return `
        <div 
          class="zap-row group cursor-pointer p-6 border-b border-slate-100 last:border-0 hover:bg-blue-50 transition-all duration-200 hover:scale-[1.01]" 
          data-zap-id="${zap.id}"
          style="animation: fade-in-up 0.3s ease-out ${index * 0.05}s both;"
        >
          <div class="grid grid-cols-12 gap-4 items-center">
            <!-- Index -->
            <div class="col-span-1">
              <span class="text-slate-400 font-mono text-sm">#${index + 1}</span>
            </div>
            
            <!-- Title & Trigger -->
            <div class="col-span-5">
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
            <div class="col-span-2 text-right">
              <span class="inline-flex items-center px-3 py-1 ${errorBadge.bg} ${errorBadge.text} rounded-full text-xs font-bold border border-current">
                ${errorBadge.label}
              </span>
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
  
  // Attach click handlers to each row
  setTimeout(() => {
    const rows = document.querySelectorAll('.zap-row')
    rows.forEach(row => {
      row.addEventListener('click', () => {
        const zapId = parseInt(row.getAttribute('data-zap-id') || '0')
        handleZapSelect(zapId)
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
      
      <!-- Info Banner -->
      <div class="mt-6 stat-card bg-blue-50 border-blue-200">
        <p class="text-sm text-blue-700 flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          💡 Click on any Zap row to run a full audit and generate a detailed PDF report
        </p>
      </div>
    </div>
  `
  
  // Render the table with filtered zaps
  renderZapTable(getFilteredZaps())
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
    const resultJson = parse_single_zap_audit(cachedZipData, BigInt(zapId))
    const result = JSON.parse(resultJson)
    
    console.log('Single Zap audit result:', result)
    
    if (result.success) {
      updateStatus('success', `✅ Audit complete for "${selectedZap.title}"`)
      displayResults(result)
    } else {
      updateStatus('error', result.message)
    }
    
  } catch (error) {
    console.error('Error auditing Zap:', error)
    updateStatus('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
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
          // Generate PDF with default white-label config
          const today = new Date().toISOString().split('T')[0]
          await generatePDFReport(result, {
            agencyName: 'Zapier Lighthouse',
            clientName: 'Client',
            reportDate: today
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
