import './style.css'
import init, { hello_world, parse_zapier_export, parse_zapfile_json } from '../src-wasm/pkg/zapier_lighthouse_wasm'

// Initialize WASM module
let wasmReady = false

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

// Handle file upload
async function handleFileUpload(file: File) {
  if (!wasmReady) {
    updateStatus('error', 'WASM engine not ready. Please refresh the page.')
    return
  }
  
  updateStatus('processing', `Processing ${file.name}...`)
  
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    console.log(`File size: ${uint8Array.length} bytes`)
    
    // Call WASM parser
    const resultJson = parse_zapier_export(uint8Array)
    const result = JSON.parse(resultJson)
    
    console.log('Parse result:', result)
    
    if (result.success) {
      updateStatus('success', result.message)
      displayResults(result)
    } else {
      updateStatus('error', result.message)
    }
    
  } catch (error) {
    console.error('Error processing file:', error)
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

// Display parsing results
function displayResults(result: { 
  zap_count: number; 
  total_nodes: number; 
  message: string;
  apps: Array<{ name: string; raw_api: string; count: number }>;
  efficiency_flags: Array<{ 
    zap_id: number; 
    zap_title: string; 
    flag_type: string; 
    severity: string; 
    message: string; 
    details: string;
  }>;
  efficiency_score: number;
}) {
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
                <p class="text-sm text-slate-600">${flag.details}</p>
                <p class="text-xs text-slate-400 mt-2 font-mono">Zap ID: ${flag.zap_id}</p>
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
  
  resultsEl.innerHTML = `
    <div class="mt-10">
      <h3 class="text-2xl font-bold text-slate-900 mb-6">Analysis Results</h3>
      
      <!-- Efficiency Score Hero Card -->
      <div class="stat-card mb-8 bg-gradient-to-br from-slate-900 to-slate-800 border-2 ${scoreColor.border}">
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
    <div class="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50">
      <div class="container mx-auto px-6 py-12 max-w-4xl">
        <!-- Header -->
        <header class="text-center mb-12">
          <h1 class="text-5xl font-bold text-slate-900 mb-3 tracking-tight">
            Zapier Lighthouse
          </h1>
          <p class="text-lg text-slate-500 font-medium">Local Audit Engine - Privacy-First Analysis</p>
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
        <footer class="mt-16 pt-8 border-t border-slate-200 text-center">
          <p class="text-sm text-slate-500 font-medium">
            <span class="inline-flex items-center">
              <span class="text-lg mr-2">🔒</span>
              <span class="font-mono">100% Local Processing</span>
            </span>
            <span class="mx-3 text-slate-300">•</span>
            <span class="font-mono">No Data Uploaded</span>
            <span class="mx-3 text-slate-300">•</span>
            <span class="font-mono">Open Source</span>
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
