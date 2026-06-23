import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { llmService } from '@/lib/llmService';
import { getMaterialProfile } from '@/lib/materialProfiles';

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

function getWorkspacePath() {
  if (fs.existsSync(SETTINGS_PATH)) {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    return settings.workspacePath;
  }
  return null;
}

function buildLlmPayloadFromRawIndex(rawIndex: any) {
  const chunks = Array.isArray(rawIndex.chunks) ? rawIndex.chunks : [];
  return JSON.stringify({
    source: rawIndex.source,
    extracted: rawIndex.extracted,
    stats: rawIndex.stats,
    slides: Array.isArray(rawIndex.slides) ? rawIndex.slides : undefined,
    records: Array.isArray(rawIndex.records) ? rawIndex.records : undefined,
    chunks: chunks.map((chunk: any) => ({
      id: chunk.id,
      slideNumber: chunk.slideNumber,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
      text: chunk.text,
    })),
  });
}

function normalizeMlfb(value: unknown) {
  const compact = String(value || '').toUpperCase().replace(/\s+/g, '');
  const match = compact.match(/^(6ES7\d{3}-[A-Z0-9]{5}-)([A-Z0-9]{4})$/);
  if (!match) return compact;

  const suffix = match[2].split('');
  suffix[0] = suffix[0] === 'O' ? '0' : suffix[0];
  suffix[3] = suffix[3] === 'O' ? '0' : suffix[3];
  return `${match[1]}${suffix.join('')}`;
}

function normalizeStructuredData(data: any) {
  if (!Array.isArray(data?.products)) return data;
  return {
    ...data,
    products: data.products.map((product: any) => ({
      ...product,
      mlfb: Array.isArray(product.mlfb)
        ? product.mlfb.map(normalizeMlfb)
        : product.mlfb
          ? normalizeMlfb(product.mlfb)
          : '',
      covered_mlfbs: Array.isArray(product.covered_mlfbs)
        ? [...new Set(product.covered_mlfbs.map(normalizeMlfb).filter(Boolean))]
        : [],
    })),
  };
}

function ensureMlfbCoverage(data: any, rawIndex: any) {
  const products = Array.isArray(data?.products) ? [...data.products] : [];
  const candidates = Array.isArray(rawIndex?.extracted?.mlfbCandidates)
    ? rawIndex.extracted.mlfbCandidates.map(normalizeMlfb).filter(Boolean)
    : [];
  const existing = new Set(products.flatMap((product: any) => {
    const values = Array.isArray(product?.mlfb) ? product.mlfb : [product?.mlfb];
    return values.map(normalizeMlfb).filter(Boolean);
  }));
  const slides = Array.isArray(rawIndex?.slides) ? rawIndex.slides : [];
  const chunks = Array.isArray(rawIndex?.chunks) ? rawIndex.chunks : [];

  for (const mlfb of candidates) {
    if (existing.has(mlfb)) continue;

    const slide = slides.find((item: any) => String(item?.text || '').includes(mlfb));
    const tableRow = slide?.tables
      ?.flatMap((table: any) => Array.isArray(table) ? table : [])
      .find((row: any) => Array.isArray(row) && row.some((cell: any) => String(cell).includes(mlfb)));
    const chunk = chunks.find((item: any) => String(item?.text || '').includes(mlfb));
    const rowCells = Array.isArray(tableRow)
      ? tableRow.map((cell: any) => String(cell || '').trim()).filter(Boolean)
      : [];
    const releaseInfo = rowCells.find((cell: string) => /\b(20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(cell)) || '';
    const nameParts = rowCells.filter((cell: string) => cell !== mlfb && cell !== releaseInfo);
    const slideLines = String(slide?.text || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const lineIndex = slideLines.findIndex((line) => line.includes(mlfb));
    const evidenceLine = lineIndex >= 0 ? slideLines[lineIndex] : '';
    const cleanName = (value: string) => value
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\b6ES7\d{3}-[A-Z0-9*]{5}-[A-Z0-9*]{4}\b/gi, '')
      .replace(/\band\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[:：,，;；]+$/g, '')
      .trim();
    const isWeakName = (value: string) => !value || /^\(.*ET 200SP.*\)$/i.test(value);
    let nearbyName = cleanName(evidenceLine);
    if (isWeakName(nearbyName)) {
      for (let offset = 1; offset <= 3 && lineIndex - offset >= 0; offset += 1) {
        const candidate = cleanName(slideLines[lineIndex - offset]);
        if (!isWeakName(candidate) && !candidate.includes('附件 & 备件')) {
          nearbyName = candidate;
          break;
        }
      }
    }
    const productName = nameParts.join(' · ') || nearbyName || mlfb;
    const evidenceId = slide?.id || chunk?.id;

    products.push({
      item_type: mlfb.startsWith('6ES7193') ? 'accessory' : 'module',
      product_name: productName,
      mlfb,
      summary: productName === mlfb ? '演示文稿中明确列出的订货型号。' : `演示文稿订货信息：${productName}`,
      key_features: [],
      technical_specs: [],
      application_scenarios: [],
      release_info: releaseInfo,
      evidence_chunk_ids: evidenceId ? [evidenceId] : [],
      extraction_source: 'deterministic_mlfb_backfill',
    });
    existing.add(mlfb);
  }

  return { ...data, products };
}

export async function POST(req: Request) {
  try {
    const { folderName, prompt } = await req.json();
    
    if (!folderName || !prompt) {
      return NextResponse.json({ success: false, error: 'folderName and prompt are required' }, { status: 400 });
    }

    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return NextResponse.json({ success: false, error: 'Workspace path not configured' }, { status: 400 });
    }

    const targetFolderPath = path.join(workspacePath, folderName);
    if (!fs.existsSync(targetFolderPath)) {
      return NextResponse.json({ success: false, error: `Folder ${folderName} does not exist in workspace` }, { status: 404 });
    }

    // Prepare index storage directory
    const indexBaseDir = path.join(process.cwd(), 'data', 'indexes', folderName);
    if (!fs.existsSync(indexBaseDir)) {
      fs.mkdirSync(indexBaseDir, { recursive: true });
    }

    const localIndexDir = path.join(process.cwd(), 'data', 'local-json-indexes', folderName);
    if (!fs.existsSync(localIndexDir)) {
      return NextResponse.json({
        success: false,
        error: '请先生成本地 JSON，再执行大模型精提取。'
      }, { status: 400 });
    }

    // Precision extraction now targets local raw JSON files, not source PDF/Word/PPT files.
    const files = fs.readdirSync(localIndexDir).filter(f => f.endsWith('.raw.json'));
    
    const results = [];

    // For simplicity in Phase 1, we do sequential processing. 
    // In production with many files, we'd do controlled concurrency.
    for (const file of files) {
      const rawIndexPath = path.join(localIndexDir, file);
      const rawIndex = JSON.parse(fs.readFileSync(rawIndexPath, 'utf8'));
      const sourceFileName = rawIndex?.source?.fileName || file.replace(/\.raw\.json$/, '');
      const indexFilePath = path.join(indexBaseDir, `${sourceFileName}.meta.json`);

      // Skip if already extracted
      if (fs.existsSync(indexFilePath)) {
        results.push({ file, status: 'skipped', message: 'Already extracted' });
        continue;
      }

      try {
        console.log(`Sending local JSON index ${file} to LLM for precision extraction...`);
        // Force output to JSON
        const systemPrompt = `You are a professional product management data extractor.
You will receive a local raw JSON index generated from a source document. The raw JSON contains source metadata, heuristic candidates, headings, and text chunks.
Extract information strictly following the user's prompt.
Use only evidence present in the raw JSON. Do not use external knowledge, assumptions, or prior memory.
If a field is not supported by the raw JSON evidence, write "文档未明确说明".
You MUST output valid JSON only. Do not wrap in markdown or any other text.
User Rule: ${prompt}`;

        const llmPayload = buildLlmPayloadFromRawIndex(rawIndex);
        const normalizedData = normalizeStructuredData(
          await llmService.extractInsightsInChunks(systemPrompt, llmPayload)
        );
        const profile = getMaterialProfile(folderName);
        const structuredData = profile.enforceMlfbCoverage
          ? ensureMlfbCoverage(normalizedData, rawIndex)
          : normalizedData;

        // Save result
        fs.writeFileSync(indexFilePath, JSON.stringify(structuredData, null, 2), 'utf8');
        results.push({ file: sourceFileName, rawJson: file, status: 'success' });
        
      } catch (err: any) {
        console.error(`Failed to process ${file}:`, err);
        results.push({ file, status: 'error', error: err.message });
      }

      // Cool down between files to avoid Kimi rate limits
      console.log(`Cooling down 5s before next file...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return NextResponse.json({ success: true, results });

  } catch (err: any) {
    console.error("Batch extraction error:", err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
