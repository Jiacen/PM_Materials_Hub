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

function cleanPresentationText(value: unknown): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isPresentationChrome(text: string): boolean {
  return /^Page\s+\d+$/i.test(text)
    || /^Unrestricted\s*\|/i.test(text)
    || /^©\s*Siemens/i.test(text)
    || /^Notizzettel\s+\d+$/i.test(text);
}

export async function extractPresentationStructure(filePath: string): Promise<any> {
  const ast = await officeParser.parseOffice(filePath, { extractAttachments: true });
  const slides = (Array.isArray(ast?.content) ? ast.content : [])
    .filter((node: any) => node?.type === 'slide')
    .map((slide: any, index: number) => {
      const slideNumber = Number(slide?.metadata?.slideNumber) || index + 1;
      const children = Array.isArray(slide?.children) ? slide.children : [];
      const headings = children
        .filter((item: any) => item?.type === 'heading')
        .map((item: any) => cleanPresentationText(item.text))
        .filter(Boolean);
      const textItems = children
        .filter((item: any) => ['heading', 'paragraph', 'list'].includes(item?.type))
        .map((item: any) => ({
          type: item.type,
          text: cleanPresentationText(item.text),
          level: item?.metadata?.indentation ?? item?.metadata?.level ?? null,
        }))
        .filter((item: any) => item.text && !isPresentationChrome(item.text));
      const tables = children
        .filter((item: any) => item?.type === 'table')
        .map((table: any) => (Array.isArray(table.children) ? table.children : []).map((row: any) =>
          (Array.isArray(row?.children) ? row.children : []).map((cell: any) => cleanPresentationText(cell?.text))
        ));
      const notes = (Array.isArray(slide?.notes) ? slide.notes : [])
        .flatMap((note: any) => Array.isArray(note?.children) ? note.children : [])
        .map((item: any) => cleanPresentationText(item?.text))
        .filter((text: string) => text && !isPresentationChrome(text));
      const imageRefs = children
        .filter((item: any) => item?.type === 'image')
        .map((item: any) => ({
          name: item?.metadata?.attachmentName || '',
          altText: cleanPresentationText(item?.metadata?.altText),
        }))
        .filter((item: any) => item.name);
      const allText = [
        ...textItems.map((item: any) => item.text),
        ...tables.flat(2).filter(Boolean),
        ...notes,
      ];

      return {
        id: `slide_${String(slideNumber).padStart(4, '0')}`,
        slideNumber,
        title: headings[0] || textItems[0]?.text || `Slide ${slideNumber}`,
        textItems,
        tables,
        notes,
        imageRefs,
        text: cleanPresentationText(allText.join('\n')),
      };
    });

  return {
    text: slides.map((slide: any) => `--- Slide ${slide.slideNumber}: ${slide.title} ---\n${slide.text}`).join('\n\n'),
    slides,
    stats: {
      slides: slides.length,
      images: Array.isArray(ast?.attachments) ? ast.attachments.length : 0,
      slidesWithNotes: slides.filter((slide: any) => slide.notes.length > 0).length,
      tables: slides.reduce((sum: number, slide: any) => sum + slide.tables.length, 0),
    },
  };
}

function normalizeWorkbookMlfb(value: unknown): string {
  const compact = String(value || '').toUpperCase().replace(/[^A-Z0-9*]/g, '');
  const match = compact.match(/^(6ES7\d{3})([A-Z0-9*]{5})([A-Z0-9*]{4})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

export function extractProductMasterStructure(filePath: string): any {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const records: any[] = [];

  for (const sheetName of workbook.SheetNames) {
    const rows = xlsx.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: false,
    });
    if (rows.length < 2) continue;

    let productType = '';
    let subType = '';
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      productType = String(row[0] || productType || '').trim();
      subType = String(row[1] || subType || '').trim();
      const mlfb = normalizeWorkbookMlfb(row[2]);
      if (!mlfb) continue;

      const priceText = String(row[5] || '').replace(/,/g, '').trim();
      records.push({
        id: `mlfb_${mlfb}`,
        sheetName,
        rowNumber: rowIndex + 1,
        productType,
        subType,
        mlfb,
        description: String(row[3] || '').trim(),
        priceGroup: String(row[4] || '').trim(),
        listPriceRmbInclVat: priceText && Number.isFinite(Number(priceText)) ? Number(priceText) : null,
      });
    }
  }

  return {
    records,
    stats: {
      sheets: workbook.SheetNames,
      recordCount: records.length,
    },
    text: records.map((record) => [
      record.productType,
      record.subType,
      record.mlfb,
      record.description,
      record.priceGroup ? `PG ${record.priceGroup}` : '',
      record.listPriceRmbInclVat != null ? `RMB ${record.listPriceRmbInclVat}` : '',
    ].filter(Boolean).join(' | ')).join('\n'),
  };
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
      return extractProductMasterStructure(filePath).text;
    }
    
    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer: fs.readFileSync(filePath) });
      return result.value || '';
    }

    if (ext === '.pptx' || ext === '.ppt') {
      return (await extractPresentationStructure(filePath)).text;
    }

    if (ext === '.doc') {
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
