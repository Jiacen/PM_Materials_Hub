import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { llmService } from '@/lib/llmService';

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
    chunks: chunks.map((chunk: any) => ({
      id: chunk.id,
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
        const structuredData = normalizeStructuredData(
          await llmService.extractInsightsInChunks(systemPrompt, llmPayload)
        );

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
