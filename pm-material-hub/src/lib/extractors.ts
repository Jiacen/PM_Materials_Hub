import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Polyfills required for pdf-parse (pdf.js) in Node.js 18+ / Next.js
if (typeof (global as any).DOMMatrix === 'undefined') {
  (global as any).DOMMatrix = class {};
}
if (typeof (global as any).ImageData === 'undefined') {
  (global as any).ImageData = class {};
}
if (typeof (global as any).Path2D === 'undefined') {
  (global as any).Path2D = class {};
}

const pdf = require('pdf-parse');
const officeParser = require('officeparser');
const mammoth = require('mammoth');

function officeParserResultToText(result: any): string {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result.toText === 'function') return result.toText();
  return String(result.content || '');
}

async function extractScannedPdfText(filePath: string): Promise<string> {
  const ocrScript = path.join(process.cwd(), 'scripts', 'ocr-pdf.cjs');
  const { stdout } = await promisify(execFile)(process.execPath, [ocrScript, filePath], {
    maxBuffer: 20 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  return stdout;
}

/**
 * Extracts raw text from various file formats.
 */
export async function extractRawText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      let pdfParser = pdf;
      if (typeof pdf !== 'function') {
        if (typeof pdf.default === 'function') pdfParser = pdf.default;
        else if (pdf.default && typeof pdf.default.default === 'function') pdfParser = pdf.default.default;
        else {
          console.error("PDF module shape:", pdf);
          throw new Error("pdf-parse did not return a function");
        }
      }
      const data = await pdfParser(dataBuffer);
      const extractedText = String(data.text || '').trim();
      return extractedText.length > 20
        ? extractedText
        : extractScannedPdfText(filePath);
    } 
    
    if (ext === '.xlsx' || ext === '.xls') {
      const workbook = xlsx.readFile(filePath);
      let text = '';
      for (const sheetName of workbook.SheetNames) {
        text += `\n--- Sheet: ${sheetName} ---\n`;
        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        // Convert rows to basic CSV-like text
        const sheetText = sheetData.map((row: any) => row.join(' | ')).join('\n');
        text += sheetText;
      }
      return text;
    }
    
    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer: fs.readFileSync(filePath) });
      return result.value || '';
    }

    if (ext === '.pptx' || ext === '.ppt' || ext === '.doc') {
      return officeParserResultToText(await officeParser.parseOffice(filePath));
    }
    
    if (ext === '.txt' || ext === '.md' || ext === '.csv') {
      return fs.readFileSync(filePath, 'utf8');
    }

    throw new Error(`Unsupported file extension: ${ext}`);
  } catch (err) {
    console.error(`Error extracting text from ${filePath}:`, err);
    throw err;
  }
}
