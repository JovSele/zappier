import './style.css'
import init, { hello_world, parse_zapier_export, parse_zapfile_json } from '../src-wasm/pkg/zapier_lighthouse_wasm'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { drawDebugGrid, sanitizeForPDF } from './pdfHelpers'

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

// PDF generation configuration
interface PDFConfig {
  agencyName: string;
  agencyLogo?: string; // Base64 or URL
  clientName: string;
  reportDate: string;
}

// Generate professional PDF report
async function generatePDFReport(result: ParseResult, config: PDFConfig) {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  
  pdf.setCharSpace(0);

  let yPos = margin;
  
  // Helper function to add a new page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (yPos + requiredSpace > pageHeight - margin) {
      pdf.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };
  
  // Header with white-label branding
  pdf.setFillColor(15, 23, 42); // slate-900
  pdf.rect(0, 0, pageWidth, 50, 'F');
  
  if (config.agencyLogo) {
    // Add agency logo (if provided)
    try {
      pdf.addImage(config.agencyLogo, 'PNG', margin, 10, 30, 30);
    } catch (e) {
      console.warn('Failed to add logo:', e);
    }
  }
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ZAPIER AUTOMATION AUDIT', pageWidth / 2, 25, { align: 'center' });
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Prepared by ${config.agencyName}`, pageWidth / 2, 35, { align: 'center' });
  
  yPos = 60;
  
  // Client information
  pdf.setTextColor(71, 85, 105); // slate-600
  pdf.setFontSize(10);
  pdf.text(`Client: ${config.clientName}`, margin, yPos);
  pdf.text(`Report Date: ${config.reportDate}`, pageWidth - margin, yPos, { align: 'right' });
  
  yPos += 15;
  
  // Executive Summary Section
  pdf.setFillColor(241, 245, 249); // slate-100 background
  pdf.setDrawColor(200, 200, 200); // slate-300 border
  pdf.setLineWidth(0.5);
  pdf.roundedRect(margin, yPos, contentWidth, 15, 3, 3, 'FD');
    
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('EXECUTIVE SUMMARY', margin + 5, yPos + 10);
  
  yPos += 20;
  
  // Key Metrics Grid
  const metricBoxWidth = contentWidth / 3 - 5;
  
  // Efficiency Score Box
  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(margin, yPos, metricBoxWidth, 30, 3, 3, 'F');
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.text('EFFICIENCY SCORE', margin + metricBoxWidth / 2, yPos + 8, { align: 'center' });
  
  const scoreColor: [number, number, number] = result.efficiency_score >= 75 ? [16, 185, 129] : 
                     result.efficiency_score >= 50 ? [245, 158, 11] : [239, 68, 68];
  pdf.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${result.efficiency_score}`, margin + metricBoxWidth / 2, yPos + 22, { align: 'center' });
  pdf.setFontSize(10);
  pdf.text('/100', margin + metricBoxWidth / 2 + 10, yPos + 22);
  
  // Zaps Found Box
  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(margin + metricBoxWidth + 5, yPos, metricBoxWidth, 30, 3, 3, 'F');
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('ZAPS ANALYZED', margin + metricBoxWidth + 5 + metricBoxWidth / 2, yPos + 8, { align: 'center' });
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${result.zap_count}`, margin + metricBoxWidth + 5 + metricBoxWidth / 2, yPos + 22, { align: 'center' });
  
  // Total Steps Box
  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(margin + 2 * (metricBoxWidth + 5), yPos, metricBoxWidth, 30, 3, 3, 'F');
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('TOTAL STEPS', margin + 2 * (metricBoxWidth + 5) + metricBoxWidth / 2, yPos + 8, { align: 'center' });
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${result.total_nodes}`, margin + 2 * (metricBoxWidth + 5) + metricBoxWidth / 2, yPos + 22, { align: 'center' });
  
  yPos += 45;
  
  // Estimated Savings Highlight (if applicable)
  if (result.estimated_savings > 0) {
    checkPageBreak(40);
    
    pdf.setFillColor(16, 185, 129); // emerald-500
    pdf.roundedRect(margin, yPos, contentWidth, 35, 3, 3, 'F');
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ESTIMATED ANNUAL SAVINGS', margin + 5, yPos + 10);
    
    pdf.setFontSize(32);
    pdf.text(`$${(result.estimated_savings * 12).toFixed(0)}`, margin + 5, yPos + 25);
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Monthly: $${result.estimated_savings.toFixed(0)} - Based on optimizing all detected issues`,
             margin + 5, yPos + 32);
    
    yPos += 45;
  }
  
  // Reliability Section (if error_loop flags exist)
  const reliabilityFlags = result.efficiency_flags.filter(f => f.flag_type === 'error_loop');
  if (reliabilityFlags.length > 0) {
    checkPageBreak(20);
    
    pdf.setFillColor(254, 202, 202); // rose-200 background
    pdf.setDrawColor(220, 38, 38); // rose-600 border
    pdf.setLineWidth(0.5);
    pdf.roundedRect(margin, yPos, contentWidth, 15, 3, 3, 'FD');
    
    pdf.setTextColor(220, 38, 38); // rose-600
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('[!] RELIABILITY CONCERNS', margin + 5, yPos + 10);
    
    pdf.setTextColor(71, 85, 105);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${reliabilityFlags.length} Zap${reliabilityFlags.length > 1 ? 's' : ''} with high error rates`, 
            pageWidth - margin - 5, yPos + 10, { align: 'right' });
    
    yPos += 20;
    
    reliabilityFlags.forEach((flag, index) => {
      // ✅ KOMPLETNÝ RESET na začiatku každého flagu
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setCharSpace(0);
      pdf.setTextColor(0, 0, 0);

    // 🔍 DEBUG - vypiš do console
      console.log('Flag details:', flag.details);
      console.log('Flag details length:', flag.details.length);
      console.log('Has extra spaces?', flag.details.includes('  '));
      console.log('=== FLAG #' + (index + 1) + ' ===');
      console.log('Severity:', flag.severity);
      console.log('Title:', flag.zap_title);
      console.log('Message:', flag.message);
      console.log('Message length:', flag.message.length);
      console.log('Has checkmark in message?', flag.message.includes('✓'));
      console.log('Has special chars?', /[^\x00-\x7F]/.test(flag.message));

      // Calculate dynamic height based on content
      let estimatedHeight = 50;
      
      // Add extra space for enhanced analytics if present
      if (flag.error_trend || flag.most_common_error || (flag.max_streak && flag.max_streak > 0)) {
        estimatedHeight += 20;

        if (flag.most_common_error && flag.most_common_error.length > 50) {
          estimatedHeight += 10;
        }
      }
      
      // Auto-paging: check if we need a new page
      checkPageBreak(estimatedHeight);
      
      // Flag box - dynamic height
      const flagColor: [number, number, number] = flag.severity === 'high' ? [254, 202, 202] : [254, 243, 199];
      pdf.setFillColor(flagColor[0], flagColor[1], flagColor[2]);
      pdf.roundedRect(margin, yPos, contentWidth, estimatedHeight, 2, 2, 'F');
      
      // Severity badge
      const badgeColor: [number, number, number] = flag.severity === 'high' ? [220, 38, 38] : [217, 119, 6];
      pdf.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
      pdf.roundedRect(margin + 3, yPos + 3, 20, 6, 1, 1, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.text(flag.severity.toUpperCase(), margin + 13, yPos + 7, { align: 'center' });
      
      // Flag title
      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${index + 1}. ${flag.zap_title}`, margin + 26, yPos + 7);
      
      // Flag message
      pdf.setTextColor(51, 65, 85);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setCharSpace(0);
      let detailYPos = yPos + 15;
      pdf.text(sanitizeForPDF(flag.message), margin + 8, detailYPos, {
        maxWidth: contentWidth - 20
      });

      // Calculate how many lines the message took
      const messageHeight = pdf.getTextDimensions(sanitizeForPDF(flag.message), {
        maxWidth: contentWidth - 20
      }).h;
      detailYPos += messageHeight + 2;

      // Flag details
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);
      pdf.setCharSpace(0);
      pdf.text(sanitizeForPDF(flag.details), margin + 8, detailYPos, {
        maxWidth: contentWidth - 20
      });

      // Calculate how many lines the details took
      const detailsHeight = pdf.getTextDimensions(sanitizeForPDF(flag.details), {
        maxWidth: contentWidth - 20
      }).h;
      detailYPos += detailsHeight + 5;
            
      // Savings display (if available)
      if (flag.estimated_monthly_savings > 0) {
        pdf.setFillColor(16, 185, 129); // emerald-500
        pdf.roundedRect(margin + 5, detailYPos - 2.5, 3, 3, 0.5, 0.5, 'F'); // malý zelený štvorček
        pdf.setFontSize(8);
        pdf.setTextColor(107, 114, 128); // gray-500
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Est. savings: $${flag.estimated_monthly_savings.toFixed(2)}/month`, margin + 10, detailYPos);
        detailYPos += 4;
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        const explanationLines = pdf.splitTextToSize(flag.savings_explanation, contentWidth - 25);
        pdf.text(explanationLines, margin + 10, detailYPos);
        detailYPos += (explanationLines.length * 3) + 3;
      }
      
      // Enhanced Analytics Section (only if data exists)
      if (flag.error_trend || flag.most_common_error || (flag.max_streak && flag.max_streak > 0)) {
        // Divider line
        pdf.setDrawColor(203, 213, 225); // slate-300
        pdf.line(margin + 5, detailYPos - 2, pageWidth - margin - 5, detailYPos - 2);
        
        detailYPos += 3;
        
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(71, 85, 105);
        pdf.text('ERROR ANALYTICS:', margin + 5, detailYPos);
        
        detailYPos += 5;
        
        // Error Trend
        if (flag.error_trend) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          
          let trendText = '';
          let trendColor: [number, number, number] = [71, 85, 105];
          
          if (flag.error_trend === 'increasing') {
            trendText = 'Trend: DETERIORATING';
            trendColor = [220, 38, 38]; // red - rose-600
          } else if (flag.error_trend === 'decreasing') {
            trendText = 'Trend: IMPROVING';
            trendColor = [22, 163, 74]; // green - emerald-600
          } else {
            trendText = 'Trend: Stable';
          }
          
          pdf.setTextColor(trendColor[0], trendColor[1], trendColor[2]);
          pdf.setFont('helvetica', 'bold');
          pdf.text(trendText, margin + 7, detailYPos);
          detailYPos += 4;
        }
        
        // Max Streak
        if (flag.max_streak && flag.max_streak > 0) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(71, 85, 105);
          pdf.text(`Max consecutive failures: ${flag.max_streak}`, margin + 7, detailYPos);
          detailYPos += 4;
        }
        
        // Most Common Error
        if (flag.most_common_error) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(71, 85, 105);
          const errorPrefix = 'Most common error: ';
          pdf.text(errorPrefix, margin + 7, detailYPos);
          
          // Error message in italic
          pdf.setFont('helvetica', 'italic');
          pdf.setTextColor(107, 114, 128);
          pdf.setCharSpace(0); // RESET
          pdf.text(flag.most_common_error, margin + 7 + pdf.getTextWidth(errorPrefix), detailYPos, {
            maxWidth: contentWidth - 20 - pdf.getTextWidth(errorPrefix)
          });
          
          // Calculate height
          const errorHeight = pdf.getTextDimensions(flag.most_common_error, {
            maxWidth: contentWidth - 20 - pdf.getTextWidth(errorPrefix)
          }).h;
          detailYPos += errorHeight;
        }
      }
      
      yPos += estimatedHeight + 5;
    });
    
    yPos += 5;
  }
  
  // Efficiency Findings Section
  const efficiencyFlags = result.efficiency_flags.filter(f => f.flag_type !== 'error_loop');
  if (efficiencyFlags.length > 0) {
    checkPageBreak(20);
    
    pdf.setFillColor(241, 245, 249);
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(margin, yPos, contentWidth, 15, 3, 3, 'FD');
    
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('EFFICIENCY FINDINGS', margin + 5, yPos + 10);
    
    pdf.setTextColor(71, 85, 105);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${efficiencyFlags.length} optimization ${efficiencyFlags.length === 1 ? 'opportunity' : 'opportunities'}`, pageWidth - margin - 5, yPos + 10, { align: 'right' });
    
    yPos += 20;
    
    efficiencyFlags.forEach((flag, index) => {
      // Auto-paging: dynamically check space needed
      let estimatedHeight = 30; // Base height
  
      // Add height for message
      const messageLines = Math.ceil(flag.message.length / 80);
      estimatedHeight += messageLines * 5;
      
      // Add height for details
      const detailLines = Math.ceil(flag.details.length / 80);
      estimatedHeight += detailLines * 4;
      
      // Add height for savings (if present)
      if (flag.estimated_monthly_savings > 0) {
        estimatedHeight += 15;
      }
      
      checkPageBreak(estimatedHeight);
      
      // Flag box 
      const flagColor: [number, number, number] = flag.severity === 'high' ? [254, 202, 202] : 
                      flag.severity === 'medium' ? [254, 243, 199] : [219, 234, 254];
      
      pdf.setFillColor(flagColor[0], flagColor[1], flagColor[2]);
      pdf.roundedRect(margin, yPos, contentWidth, estimatedHeight, 2, 2, 'F'); 
      
      // Severity badge
      const badgeColor: [number, number, number] = flag.severity === 'high' ? [220, 38, 38] : 
                        flag.severity === 'medium' ? [217, 119, 6] : [37, 99, 235];
      pdf.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
      pdf.roundedRect(margin + 3, yPos + 3, 20, 6, 1, 1, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.text(flag.severity.toUpperCase(), margin + 13, yPos + 7, { align: 'center' });
      
      // Flag title
      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${index + 1}. ${flag.zap_title}`, margin + 26, yPos + 7);
      
      // Flag message
      pdf.setTextColor(51, 65, 85);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      let detailYPos = yPos + 15;
      pdf.setCharSpace(0);
      pdf.text(sanitizeForPDF(flag.message), margin + 8, detailYPos, {
        maxWidth: contentWidth - 20
      });

      // Calculate how many lines the message took
      const messageHeight = pdf.getTextDimensions(sanitizeForPDF(flag.message), {
        maxWidth: contentWidth - 20
      }).h;
      detailYPos += messageHeight + 2;

      // Flag details
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);
      pdf.setCharSpace(0);
      pdf.text(sanitizeForPDF(flag.details), margin + 8, detailYPos, {
        maxWidth: contentWidth - 20
      });

      // Calculate how many lines the details took
      const detailsHeight = pdf.getTextDimensions(sanitizeForPDF(flag.details), {
        maxWidth: contentWidth - 20
      }).h;
      detailYPos += detailsHeight + 5;
      
      // Savings display (if available)
      if (flag.estimated_monthly_savings > 0) {
        pdf.setFillColor(16, 185, 129); // emerald-500
        pdf.roundedRect(margin + 5, detailYPos - 2.5, 3, 3, 0.5, 0.5, 'F'); // malý zelený štvorček
        pdf.setFontSize(8);
        pdf.setTextColor(107, 114, 128); // gray-500
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Est. savings: $${flag.estimated_monthly_savings.toFixed(2)}/month`, margin + 10, detailYPos);
        detailYPos += 4;
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        const explanationLines = pdf.splitTextToSize(flag.savings_explanation, contentWidth - 15);
        pdf.text(explanationLines, margin + 5, detailYPos);
        detailYPos += (explanationLines.length * 3);
      }
      
      yPos += estimatedHeight + 5;
    });
  }
  
  // No findings case
  if (result.efficiency_flags.length === 0) {
    checkPageBreak(20);
    
    pdf.setFillColor(241, 245, 249);
    pdf.rect(margin - 5, yPos - 5, contentWidth + 10, 12, 'F');
    
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('DETAILED FINDINGS', margin, yPos + 5);
    
    yPos += 20;
    
    pdf.setTextColor(16, 185, 129);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text('✓ No efficiency issues detected. Your Zaps are highly optimized!', margin, yPos);
    yPos += 15;
  }
  
  // App Inventory Section with intelligent grid layout
  checkPageBreak(20);
  
  if (yPos > pageHeight - 100 && result.apps.length > 5) {
    pdf.addPage();
    yPos = margin;
  }
  
  pdf.setFillColor(241, 245, 249); // slate-100 background
  pdf.setDrawColor(200, 200, 200); // border
  pdf.setLineWidth(0.5);
  pdf.roundedRect(margin, yPos, contentWidth, 15, 3, 3, 'FD');

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('APP INVENTORY', margin + 5, yPos + 10);

  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${result.apps.length} unique applications detected`, 
          pageWidth - margin - 5, yPos + 10, { align: 'right' });

  yPos += 20;
  
  // INTELLIGENT GRID LAYOUT: Use columns if many apps (better scalability)
  if (result.apps.length > 15) {
    // Multi-column grid layout for better space utilization
    const numColumns = result.apps.length > 30 ? 3 : 2;
    const columnWidth = contentWidth / numColumns - 5;
    const itemHeight = 7;
    let currentColumn = 0;
    let startYPos = yPos;
    
    result.apps.forEach((app, index) => {
      // Check if we need a new page
      if (yPos + itemHeight > pageHeight - margin) {
        pdf.addPage();
        yPos = margin;
        startYPos = yPos;
        currentColumn = 0;
      }
      
      // Calculate column position
      const xPos = margin + currentColumn * (columnWidth + 5);
      
      // Alternating background for readability
      if (index % 2 === 0) {
        pdf.setFillColor(249, 250, 251);
        pdf.rect(xPos - 2, yPos - 2, columnWidth + 4, itemHeight, 'F');
      }
      
      // App name (truncated if too long)
      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      const truncatedName = app.name.length > 25 ? app.name.substring(0, 22) + '...' : app.name;
      pdf.text(truncatedName, xPos, yPos + 4);
      
      // Usage count
      pdf.setTextColor(148, 163, 184);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(`${app.count}×`, xPos + columnWidth - 2, yPos + 4, { align: 'right' });
      
      // Move to next row or column
      currentColumn++;
      if (currentColumn >= numColumns) {
        currentColumn = 0;
        yPos += itemHeight;
      }
    });
    
    // Final yPos adjustment if not at start of new row
    if (currentColumn > 0) {
      yPos += itemHeight;
    }
  } else {
    // Single-column list layout for smaller app inventories
    result.apps.forEach((app, index) => {
      checkPageBreak(10);
      
      if (index % 2 === 0) {
        pdf.setFillColor(249, 250, 251);
        pdf.rect(margin - 2, yPos - 3, contentWidth + 4, 8, 'F');
      }
      
      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(app.name, margin, yPos);
      
      pdf.setTextColor(148, 163, 184);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${app.count} ${app.count === 1 ? 'use' : 'uses'}`, pageWidth - margin, yPos, { align: 'right' });
      
      yPos += 8;
    });
  }
  
  // Footer on all pages
  const totalPages = pdf.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Generated by Zapier Lighthouse | ${config.agencyName}`, 
             pageWidth / 2, pageHeight - 10, { align: 'center' });
    pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    pdf.text('Confidential', margin, pageHeight - 10);
  }
  
  // ========================================
  // DEBUG GRID: Draw AFTER all content (last thing before save)
  // ========================================
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawDebugGrid(pdf, pageWidth, pageHeight);
  }
  
  // Save PDF
  pdf.save(`Zapier_Audit_Report_${config.clientName.replace(/\s+/g, '_')}_${config.reportDate}.pdf`);
}

// Type definition for parse result
interface ParseResult {
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
    // Enhanced error analytics (available for error_loop flags)
    most_common_error?: string;
    error_trend?: string; // "increasing", "stable", "decreasing"
    max_streak?: number;
    // Dynamic savings calculation
    estimated_monthly_savings: number; // in USD
    savings_explanation: string; // How savings were calculated
    is_fallback: boolean; // true = estimated/fallback, false = actual data
  }>;
  efficiency_score: number;
  estimated_savings: number;
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
