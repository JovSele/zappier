// PDF Helper Functions for Zapier Lighthouse
// Contains utility functions for precise PDF rendering

import jsPDF from 'jspdf'

/**
 * Draw debug grid on PDF page for precise element positioning
 * Grid has major lines every 10mm and minor marks every 5mm
 */
export function drawDebugGrid(pdf: jsPDF, pageWidth: number, pageHeight: number): void {
  // Save current graphics state
  const currentDrawColor = pdf.getDrawColor()
  const currentLineWidth = pdf.getLineWidth()
  
  // Set grid color 
  pdf.setDrawColor(240, 240, 240)
  pdf.setLineWidth(0.5)
  
  // Draw vertical lines
  for (let x = 0; x <= pageWidth; x += 5) {
    if (x % 10 === 0) {
      // Major line (every 10mm) - slightly thicker
      pdf.setLineWidth(0.2)
      pdf.line(x, 0, x, pageHeight)
      pdf.setLineWidth(0.1)
      
      // Add coordinate label at top and bottom
      pdf.setFontSize(6)
      pdf.setTextColor(150, 150, 150)
      pdf.text(`${x}`, x - 2, 5)
      pdf.text(`${x}`, x - 2, pageHeight - 2)
    } else {
      // Minor line (every 5mm)
      pdf.line(x, 0, x, pageHeight)
    }
  }
  
  // Draw horizontal lines
  for (let y = 0; y <= pageHeight; y += 5) {
    if (y % 10 === 0) {
      // Major line (every 10mm)
      pdf.setLineWidth(0.2)
      pdf.line(0, y, pageWidth, y)
      pdf.setLineWidth(0.1)
      
      // Add coordinate label at left and right
      pdf.setFontSize(6)
      pdf.setTextColor(150, 150, 150)
      pdf.text(`${y}`, 2, y + 2)
      pdf.text(`${y}`, pageWidth - 8, y + 2)
    } else {
      // Minor line (every 5mm)
      pdf.line(0, y, pageWidth, y)
    }
  }
  
  // Restore graphics state
  pdf.setDrawColor(currentDrawColor)
  pdf.setLineWidth(currentLineWidth)
}

/**
 * Calculate darker shade for stroke color (30% darker)
 * @param r Red component (0-255)
 * @param g Green component (0-255)
 * @param b Blue component (0-255)
 * @returns Tuple of [R, G, B] for stroke color
 */
export function calculateStrokeColor(r: number, g: number, b: number): [number, number, number] {
  return [
    Math.round(r * 0.7),
    Math.round(g * 0.7),
    Math.round(b * 0.7)
  ]
}

/**
 * Draw section header with algorithmically centered text and dynamic stroke
 * @param pdf jsPDF instance
 * @param x X position of rectangle
 * @param y Y position of rectangle
 * @param width Width of rectangle
 * @param height Height of rectangle
 * @param text Header text
 * @param fillColor RGB tuple for fill color
 * @param textColor RGB tuple for text color
 * @param fontSize Font size in points
 * @param padding Horizontal padding in mm (default 5mm)
 */
export function drawSectionHeader(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  fillColor: [number, number, number],
  textColor: [number, number, number],
  fontSize: number,
  padding: number = 5
): void {
  // Calculate stroke color (30% darker)
  const strokeColor = calculateStrokeColor(fillColor[0], fillColor[1], fillColor[2])
  
  // Set fill and stroke colors
  pdf.setFillColor(fillColor[0], fillColor[1], fillColor[2])
  pdf.setDrawColor(strokeColor[0], strokeColor[1], strokeColor[2])
  pdf.setLineWidth(0.5)
  
  // Draw rounded rectangle with fill and stroke ('FD')
  pdf.roundedRect(x, y, width, height, 2, 2, 'FD')
  
  // Calculate vertical center position for text
  // Formula: textY = y + (rectHeight / 2) + (fontSizeInMm / 3)
  // 1 pt ≈ 0.35 mm
  const fontSizeInMm = fontSize * 0.35
  const textY = y + (height / 2) + (fontSizeInMm / 3)
  
  // Calculate horizontal position with padding
  const textX = x + padding
  
  // Set text properties
  pdf.setTextColor(textColor[0], textColor[1], textColor[2])
  pdf.setFontSize(fontSize)
  pdf.setFont('helvetica', 'bold')
  
  // Draw text
  pdf.text(text, textX, textY)
}

/**
 * Draw section header with right-aligned secondary text
 */
export function drawSectionHeaderWithSecondary(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  primaryText: string,
  secondaryText: string,
  fillColor: [number, number, number],
  primaryTextColor: [number, number, number],
  secondaryTextColor: [number, number, number],
  primaryFontSize: number,
  secondaryFontSize: number,
  padding: number = 5
): void {
  // Calculate stroke color (30% darker)
  const strokeColor = calculateStrokeColor(fillColor[0], fillColor[1], fillColor[2])
  
  // Set fill and stroke colors
  pdf.setFillColor(fillColor[0], fillColor[1], fillColor[2])
  pdf.setDrawColor(strokeColor[0], strokeColor[1], strokeColor[2])
  pdf.setLineWidth(0.5)
  
  // Draw rounded rectangle with fill and stroke ('FD')
  pdf.roundedRect(x, y, width, height, 2, 2, 'FD')
  
  // Calculate vertical center position for primary text
  const primaryFontSizeInMm = primaryFontSize * 0.35
  const textY = y + (height / 2) + (primaryFontSizeInMm / 3)
  
  // Draw primary text (left-aligned with padding)
  pdf.setTextColor(primaryTextColor[0], primaryTextColor[1], primaryTextColor[2])
  pdf.setFontSize(primaryFontSize)
  pdf.setFont('helvetica', 'bold')
  pdf.text(primaryText, x + padding, textY)
  
  // Draw secondary text (right-aligned with padding)
  const secondaryFontSizeInMm = secondaryFontSize * 0.35
  const secondaryTextY = y + (height / 2) + (secondaryFontSizeInMm / 3)
  
  pdf.setTextColor(secondaryTextColor[0], secondaryTextColor[1], secondaryTextColor[2])
  pdf.setFontSize(secondaryFontSize)
  pdf.setFont('helvetica', 'normal')
  pdf.text(secondaryText, x + width - padding, secondaryTextY, { align: 'right' })
}
/**
 * Sanitize text for PDF rendering
 * Removes/replaces special characters that cause rendering issues in jsPDF
 * @param text Original text string
 * @returns Sanitized text safe for PDF rendering
 */
export function sanitizeForPDF(text: string): string {
  return text
    .replace(/✓/g, '√')      // Checkmark → square root (similar looking)
    .replace(/✗/g, 'x')      // X mark → lowercase x
    .replace(/⚠️/g, '!')     // Warning emoji → exclamation
    .replace(/'/g, "'")      // Curly single quote (left)
    .replace(/'/g, "'")      // Curly single quote (right)
    .replace(/"/g, '"')      // Curly double quote (left)
    .replace(/"/g, '"')      // Curly double quote (right)
    .replace(/—/g, '-')      // Em dash
    .replace(/–/g, '-')      // En dash
    .replace(/…/g, '...')    // Ellipsis
    .replace(/&/g, '&');     // Ampersand HTML entity
}