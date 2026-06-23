const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const pdf = require('pdf-parse');
const officeParser = require('officeparser');
const mammoth = require('mammoth');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');
const { createWorker } = require('tesseract.js');

const projectRoot = path.resolve(__dirname, '..');
const settingsPath = path.join(projectRoot, 'config', 'settings.json');
const outputRoot = path.join(projectRoot, 'data', 'local-json-indexes');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    args.set(arg.slice(2), process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true');
  }
}

const folderPrefix = args.get('folder-prefix') || args.get('folderPrefix');
const force = args.get('force') === 'true';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.bmp']);

function readSettings() {
  if (!fs.existsSync(settingsPath)) {
    throw new Error(`Missing settings file: ${settingsPath}`);
  }
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function chunkText(text, chunkSize = 6000, overlap = 400) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push({
      id: `chunk_${String(chunks.length + 1).padStart(4, '0')}`,
      charStart: start,
      charEnd: end,
      text: text.slice(start, end),
    });
    if (end === text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

function extractMlfbCandidates(text) {
  const matches = text.toUpperCase().match(/\b6ES7\d{3}-[A-Z0-9*]{5}-[A-Z0-9*]{4}\b/g) || [];
  return [...new Set(matches.map((value) => {
    const [prefix, middle, suffixValue] = value.split('-');
    const suffix = suffixValue.split('');
    suffix[0] = suffix[0] === 'O' ? '0' : suffix[0];
    suffix[3] = suffix[3] === 'O' ? '0' : suffix[3];
    return `${prefix}-${middle}-${suffix.join('')}`;
  }))].sort();
}

function extractHeadingCandidates(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 2 && line.length <= 80)
    .filter((line) => (
      /^\d+(\.\d+){0,3}\s+\S+/.test(line)
      || /^[A-D]\.\d+\s+\S+/.test(line)
      || /^(简介|系统概述|应用规划|安装|接线|组态|调试|维护|技术规范|工业网络安全|附件\/备件)$/.test(line)
    ))
    .slice(0, 300);
}

function officeParserResultToText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result.toText === 'function') return result.toText();
  return String(result.content || '');
}

function cleanPresentationText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isPresentationChrome(text) {
  return /^Page\s+\d+$/i.test(text)
    || /^Unrestricted\s*\|/i.test(text)
    || /^©\s*Siemens/i.test(text)
    || /^Notizzettel\s+\d+$/i.test(text);
}

async function extractPresentationStructure(filePath) {
  const ast = await officeParser.parseOffice(filePath, { extractAttachments: true });
  const slides = (Array.isArray(ast?.content) ? ast.content : [])
    .filter((node) => node?.type === 'slide')
    .map((slide, index) => {
      const slideNumber = Number(slide?.metadata?.slideNumber) || index + 1;
      const children = Array.isArray(slide?.children) ? slide.children : [];
      const headings = children
        .filter((item) => item?.type === 'heading')
        .map((item) => cleanPresentationText(item.text))
        .filter(Boolean);
      const textItems = children
        .filter((item) => ['heading', 'paragraph', 'list'].includes(item?.type))
        .map((item) => ({
          type: item.type,
          text: cleanPresentationText(item.text),
          level: item?.metadata?.indentation ?? item?.metadata?.level ?? null,
        }))
        .filter((item) => item.text && !isPresentationChrome(item.text));
      const tables = children
        .filter((item) => item?.type === 'table')
        .map((table) => (Array.isArray(table.children) ? table.children : []).map((row) =>
          (Array.isArray(row?.children) ? row.children : []).map((cell) => cleanPresentationText(cell?.text))
        ));
      const notes = (Array.isArray(slide?.notes) ? slide.notes : [])
        .flatMap((note) => Array.isArray(note?.children) ? note.children : [])
        .map((item) => cleanPresentationText(item?.text))
        .filter((text) => text && !isPresentationChrome(text));
      const imageRefs = children
        .filter((item) => item?.type === 'image')
        .map((item) => ({
          name: item?.metadata?.attachmentName || '',
          altText: cleanPresentationText(item?.metadata?.altText),
        }))
        .filter((item) => item.name);
      const allText = [
        ...textItems.map((item) => item.text),
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
    text: slides.map((slide) => `--- Slide ${slide.slideNumber}: ${slide.title} ---\n${slide.text}`).join('\n\n'),
    slides,
    stats: {
      slides: slides.length,
      images: Array.isArray(ast?.attachments) ? ast.attachments.length : 0,
      slidesWithNotes: slides.filter((slide) => slide.notes.length > 0).length,
      tables: slides.reduce((sum, slide) => sum + slide.tables.length, 0),
    },
  };
}

function normalizeWorkbookMlfb(value) {
  const compact = String(value || '').toUpperCase().replace(/[^A-Z0-9*]/g, '');
  const match = compact.match(/^(6ES7\d{3})([A-Z0-9*]{5})([A-Z0-9*]{4})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function extractProductMasterStructure(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const records = [];

  for (const sheetName of workbook.SheetNames) {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: false,
    });
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
    stats: { sheets: workbook.SheetNames, recordCount: records.length },
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

async function extractScannedPdfText(fileBuffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({
    data: new Uint8Array(fileBuffer),
    disableWorker: true,
  }).promise;
  const cachePath = path.join(projectRoot, 'resources', 'ocr');
  const worker = await createWorker('eng', undefined, {
    cachePath,
    cacheMethod: 'readOnly',
  });
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
      }).promise;
      const result = await worker.recognize(canvas.toBuffer('image/png'));
      pages.push(`--- Page ${pageNumber} ---\n${result.data.text || ''}`);
      page.cleanup();
    }
  } finally {
    await worker.terminate();
    await document.destroy();
  }

  return pages.join('\n\n');
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    const fileBuffer = fs.readFileSync(filePath);
    const data = await pdf(fileBuffer);
    const extractedText = normalizeText(data.text || '');
    if (extractedText.length > 20) {
      return {
        text: extractedText,
        stats: { pages: data.numpages || null, ocrApplied: false },
      };
    }
    return {
      text: await extractScannedPdfText(fileBuffer),
      stats: { pages: data.numpages || null, ocrApplied: true, ocrLanguage: 'eng' },
    };
  }
  if (ext === '.xlsx' || ext === '.xls') {
    return extractProductMasterStructure(filePath);
  }
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer: fs.readFileSync(filePath) });
    return {
      text: result.value || '',
      stats: {},
    };
  }
  if (['.pptx', '.ppt'].includes(ext)) {
    return extractPresentationStructure(filePath);
  }
  if (ext === '.doc') {
    return {
      text: officeParserResultToText(await officeParser.parseOffice(filePath)),
      stats: {},
    };
  }
  if (['.txt', '.md', '.csv'].includes(ext)) {
    return { text: fs.readFileSync(filePath, 'utf8'), stats: {} };
  }
  return null;
}

async function indexFile(workspacePath, folderName, fileName) {
  const filePath = path.join(workspacePath, folderName, fileName);
  const fileBuffer = fs.readFileSync(filePath);
  const stat = fs.statSync(filePath);
  const fileHash = sha256(fileBuffer);
  const safeOutputDir = path.join(outputRoot, folderName);
  const ext = path.extname(fileName).toLowerCase();
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const outputPath = path.join(safeOutputDir, `${fileName}${isImage ? '.image.json' : '.raw.json'}`);

  if (!force && fs.existsSync(outputPath)) {
    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    if (existing?.source?.sha256 === fileHash && existing?.source?.mtimeMs === stat.mtimeMs) {
      return { fileName, status: 'skipped', outputPath };
    }
  }

  if (isImage) {
    const metadata = await sharp(fileBuffer).metadata();
    const doc = {
      schemaVersion: 1,
      kind: 'image',
      generatedAt: new Date().toISOString(),
      source: {
        workspacePath,
        folderName,
        fileName,
        extension: ext,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        sha256: fileHash,
      },
      image: {
        width: metadata.width || null,
        height: metadata.height || null,
        format: metadata.format || ext.replace('.', ''),
        space: metadata.space || null,
        hasAlpha: Boolean(metadata.hasAlpha),
        density: metadata.density || null,
      },
      tags: inferImageTags(fileName),
      usage: inferImageUsage(fileName),
    };
    fs.mkdirSync(safeOutputDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(doc, null, 2), 'utf8');
    return {
      fileName,
      status: 'indexed',
      outputPath,
      width: metadata.width,
      height: metadata.height,
    };
  }

  const extracted = await extractText(filePath);
  if (!extracted) {
    return { fileName, status: 'unsupported' };
  }

  const text = normalizeText(extracted.text);
  const slides = Array.isArray(extracted.slides) ? extracted.slides : null;
  const records = Array.isArray(extracted.records) ? extracted.records : null;
  const promptPath = path.join(workspacePath, folderName, 'prompt.txt');
  const prompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : '';

  const doc = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      workspacePath,
      folderName,
      fileName,
      extension: path.extname(fileName).toLowerCase(),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      sha256: fileHash,
    },
    prompt: {
      fileName: 'prompt.txt',
      text: prompt,
    },
    stats: {
      ...extracted.stats,
      chars: text.length,
      chunkCount: slides ? slides.length : records ? records.length : Math.ceil(text.length / 5600),
    },
    extracted: {
      mlfbCandidates: extractMlfbCandidates(text),
      headingCandidates: extractHeadingCandidates(text),
    },
    chunks: slides
      ? slides.map((slide) => ({
          id: slide.id,
          slideNumber: slide.slideNumber,
          charStart: 0,
          charEnd: slide.text.length,
          text: slide.text,
        }))
      : records
        ? records.map((record) => ({
            id: record.id,
            charStart: 0,
            charEnd: record.description.length,
            text: [
              record.productType,
              record.subType,
              record.mlfb,
              record.description,
              record.priceGroup ? `PG ${record.priceGroup}` : '',
              record.listPriceRmbInclVat != null ? `RMB ${record.listPriceRmbInclVat}` : '',
            ].filter(Boolean).join(' | '),
          }))
        : chunkText(text),
    ...(slides ? { slides } : {}),
    ...(records ? { records, kind: 'product_master' } : {}),
  };

  fs.mkdirSync(safeOutputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(doc, null, 2), 'utf8');
  return { fileName, status: 'indexed', outputPath, chars: text.length, chunks: doc.chunks.length, mlfbCandidates: doc.extracted.mlfbCandidates.length };
}

function inferImageTags(fileName) {
  const lower = fileName.toLowerCase();
  const tags = ['图片素材'];
  if (lower.includes('front') || fileName.includes('正面')) tags.push('正面图');
  if (lower.includes('side') || fileName.includes('侧')) tags.push('侧视图');
  if (lower.includes('station')) tags.push('站点图');
  if (lower.includes('family')) tags.push('产品家族');
  if (lower.includes('rail')) tags.push('导轨安装');
  if (lower.includes('接口模块') || lower.includes('im')) tags.push('接口模块');
  if (lower.includes('ai')) tags.push('AI 模块');
  if (lower.includes('aq')) tags.push('AQ 模块');
  if (lower.includes('di')) tags.push('DI 模块');
  if (lower.includes('dq')) tags.push('DQ 模块');
  return [...new Set(tags)];
}

function inferImageUsage(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.includes('front') || fileName.includes('正面')) return '适合作为产品介绍页主图或模块识别图';
  if (lower.includes('family')) return '适合作为产品家族概览页图片';
  if (lower.includes('station')) return '适合作为系统/站点概览页图片';
  if (lower.includes('side')) return '适合作为结构或安装说明页图片';
  return '适合作为销售胶片中的产品素材图';
}

async function main() {
  const settings = readSettings();
  const workspacePath = settings.workspacePath;
  if (!workspacePath || !fs.existsSync(workspacePath)) {
    throw new Error(`Workspace path does not exist: ${workspacePath}`);
  }

  const folders = fs.readdirSync(workspacePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !folderPrefix || name.startsWith(folderPrefix));

  const results = [];
  for (const folderName of folders) {
    const folderPath = path.join(workspacePath, folderName);
    const files = fs.readdirSync(folderPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.toLowerCase() !== 'prompt.txt');

    for (const fileName of files) {
      results.push(await indexFile(workspacePath, folderName, fileName));
    }
  }

  console.log(JSON.stringify({ workspacePath, folderPrefix: folderPrefix || null, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
