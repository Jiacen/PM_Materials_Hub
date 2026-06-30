import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { llmService } from '@/lib/llmService';
import { getMaterialProfile } from '@/lib/materialProfiles';
import { buildFolderCatalog } from '@/lib/materialCatalog';

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

type MasterRecord = {
  productType?: string;
  subType?: string;
  mlfb: string;
  description?: string;
  priceGroup?: string;
  listPriceRmbInclVat?: number | null;
};

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
    chapters: Array.isArray(rawIndex.chapters) ? rawIndex.chapters.map((chapter: any) => ({
      id: chapter.id,
      title: chapter.title,
      chapterType: chapter.chapterType,
      charStart: chapter.charStart,
      charEnd: chapter.charEnd,
      mlfbCandidates: chapter.mlfbCandidates,
      text: chapter.text,
    })) : undefined,
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

function loadMasterRecordMap() {
  const root = path.join(process.cwd(), 'data', 'local-json-indexes');
  const records = new Map<string, MasterRecord>();
  if (!fs.existsSync(root)) return records;

  for (const dir of fs.readdirSync(root).filter(name => name.startsWith('01_'))) {
    const dirPath = path.join(root, dir);
    for (const file of fs.readdirSync(dirPath).filter(name => name.endsWith('.raw.json'))) {
      const json = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf8'));
      if (!Array.isArray(json?.records)) continue;
      for (const record of json.records) {
        const mlfb = normalizeMlfb(record?.mlfb);
        if (mlfb) records.set(mlfb, { ...record, mlfb });
      }
    }
  }
  return records;
}

function masterItemType(record: MasterRecord) {
  const text = `${record.subType || ''} ${record.description || ''}`;
  return /备件|附件|端子|盖板|标签|色标|连接器|接插件|插头|电缆/.test(text) ? 'accessory' : 'module';
}

function masterPromptContext(masterRecords: Map<string, MasterRecord>) {
  return [...masterRecords.values()]
    .map(record => [
      record.mlfb,
      record.productType,
      record.subType,
      record.description,
      record.priceGroup ? `PG ${record.priceGroup}` : '',
    ].filter(Boolean).join(' | '))
    .join('\n');
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
      related_mlfbs: Array.isArray(product.related_mlfbs)
        ? [...new Set(product.related_mlfbs.map(normalizeMlfb).filter(Boolean))]
        : [],
    })),
  };
}

function validateRefinedOutput(data: any, rawIndex: any) {
  const products = Array.isArray(data?.products) ? data.products : [];
  const slides = Array.isArray(rawIndex?.slides) ? rawIndex.slides : [];
  if (!products.length) return { valid: false, reason: 'No refined cards returned' };
  if (!slides.length) return { valid: true, reason: '' };

  const validEvidence = new Set(slides.map((slide: any) => String(slide?.id || '')).filter(Boolean));
  const minimumCards = slides.length >= 12 ? 3 : slides.length >= 5 ? 2 : 1;
  if (products.length < minimumCards) {
    return { valid: false, reason: `Presentation refinement returned ${products.length} cards; minimum is ${minimumCards}` };
  }

  const usedEvidence = new Set<string>();
  for (const product of products) {
    const evidenceIds = Array.isArray(product?.evidence_chunk_ids) ? product.evidence_chunk_ids.map(String) : [];
    if (!evidenceIds.length || evidenceIds.some((id: string) => !validEvidence.has(id))) {
      return { valid: false, reason: 'A refined card has missing or invalid slide evidence' };
    }
    evidenceIds.forEach((id: string) => usedEvidence.add(id));
    if (evidenceIds.length > Math.max(10, Math.ceil(slides.length * 0.6))) {
      return { valid: false, reason: 'A refined card merges too many presentation pages' };
    }
    const mlfbValues = Array.isArray(product?.mlfb)
      ? product.mlfb
      : String(product?.mlfb || '').split(',');
    if (mlfbValues.filter(Boolean).length > 4 && !['module', 'accessory'].includes(product?.item_type)) {
      return { valid: false, reason: 'A narrative card aggregates too many MLFB values' };
    }
  }
  if (usedEvidence.size < minimumCards) {
    return { valid: false, reason: 'Refined cards do not cover enough distinct slide evidence' };
  }
  return { valid: true, reason: '' };
}

function compact(value: unknown, maxLength = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function mlfbValuesFromProduct(product: any) {
  const rawValues = Array.isArray(product?.mlfb)
    ? product.mlfb
    : String(product?.mlfb || '').split(/[,，、;；]/);
  return [...new Set(rawValues.map(normalizeMlfb).filter(Boolean))] as string[];
}

function normalizeProductToMaster(product: any, record: MasterRecord, evidenceIds: string[] = []) {
  const mlfb = normalizeMlfb(record.mlfb);
  const masterSpecs = [
    record.priceGroup ? `价格组：${record.priceGroup}` : '',
    record.listPriceRmbInclVat != null ? `含税列表价 RMB ${Number(record.listPriceRmbInclVat).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` : '',
  ].filter(Boolean);

  return {
    ...product,
    item_type: masterItemType(record),
    product_name: record.description || product?.product_name || mlfb,
    mlfb,
    covered_mlfbs: [mlfb],
    summary: product?.summary || `${record.productType || '产品'} / ${record.subType || '模块'}：${record.description || mlfb}`,
    technical_specs: [
      ...(Array.isArray(product?.technical_specs) ? product.technical_specs : []),
      ...masterSpecs,
    ].filter(Boolean),
    evidence_chunk_ids: Array.isArray(product?.evidence_chunk_ids) && product.evidence_chunk_ids.length
      ? product.evidence_chunk_ids
      : evidenceIds,
  };
}

function expandProductsToSingleMlfb(products: any[]) {
  return products.flatMap((product) => {
    const mlfbs = mlfbValuesFromProduct(product);
    if (mlfbs.length <= 1) return [{ ...product, mlfb: mlfbs[0] || product?.mlfb || '' }];
    return mlfbs.map((mlfb) => ({
      ...product,
      mlfb,
      covered_mlfbs: [mlfb],
      product_name: product?.product_name && !String(product.product_name).includes(mlfb)
        ? `${product.product_name} · ${mlfb}`
        : product?.product_name || mlfb,
      extraction_source: product?.extraction_source || 'mlfb_split',
    }));
  });
}

function filterRelatedMlfbs(data: any, masterRecords: Map<string, MasterRecord>) {
  if (!Array.isArray(data?.products) || masterRecords.size === 0) return data;
  return {
    ...data,
    products: data.products.map((product: any) => ({
      ...product,
      mlfb: '',
      covered_mlfbs: [],
      related_mlfbs: Array.isArray(product?.related_mlfbs)
        ? product.related_mlfbs.map(normalizeMlfb).filter((mlfb: string) => masterRecords.has(mlfb))
        : [],
    })),
  };
}

function evidenceFacts(text: string, mlfb: string) {
  const lines = text
    .split(/\r?\n|[。；;]/)
    .map(line => compact(line, 140))
    .filter(Boolean);
  const direct = lines.filter(line => line.includes(mlfb));
  const technical = lines.filter(line => (
    /\d|V\s*DC|PROFINET|RJ45|IP\d|RTD|TC|RS\s*422|RS\s*485|I\/O|DI|DQ|AI|AQ/i.test(line)
    && !line.includes(mlfb)
  ));
  return [...new Set([...direct, ...technical])].slice(0, 5);
}

function deterministicPresentationFallback(rawIndex: any) {
  const slides = Array.isArray(rawIndex?.slides) ? rawIndex.slides : [];
  const excluded = /^(thank|thanks|目录|议程|挑战和机会|发现更多|常用链接)/i;
  const usable = slides.filter((slide: any) => {
    const title = String(slide?.title || '').trim();
    const text = String(slide?.text || '');
    return title && !excluded.test(title) && text.length >= 40;
  });
  const rules = [
    { type: 'product', pattern: /定位|概览|baseline|产品组合|特点/i, limit: 1 },
    { type: 'value_proposition', pattern: /价值|亮点|降低|成本|经济|可靠|高标准/i, limit: 2 },
    { type: 'application', pattern: /应用|场景|行业|传送|输送/i, limit: 1 },
    { type: 'comparison', pattern: /比较|对比|vs\.?|区别/i, limit: 1 },
    { type: 'sales_message', pattern: /挑战|机会|异议|复杂度|投资/i, limit: 1 },
  ];
  const selectedIds = new Set<string>();
  const products: any[] = [];

  for (const rule of rules) {
    const matches = usable.filter((slide: any) =>
      !selectedIds.has(slide.id) && rule.pattern.test(`${slide.title}\n${slide.text}`)
    ).sort((a: any, b: any) => {
      const titleScoreA = rule.pattern.test(String(a.title || '')) ? 1 : 0;
      const titleScoreB = rule.pattern.test(String(b.title || '')) ? 1 : 0;
      return titleScoreB - titleScoreA || Number(a.slideNumber || 0) - Number(b.slideNumber || 0);
    }).slice(0, rule.limit);
    for (const slide of matches) {
      selectedIds.add(slide.id);
      const textItems = Array.isArray(slide?.textItems) ? slide.textItems : [];
      const facts = textItems
        .map((item: any) => compact(item?.text, 100))
        .filter((text: string) => text && text !== compact(slide.title, 100))
        .slice(0, 4);
      const specs = facts.filter((text: string) => /\d|PROFINET|RJ45|IRT|IP\d/i.test(text)).slice(0, 4);
      products.push({
        item_type: rule.type,
        product_name: compact(slide.title, 90),
        mlfb: '',
        summary: compact(slide.text, 160),
        key_features: facts.slice(0, 4),
        technical_specs: specs,
        application_scenarios: rule.type === 'application' ? facts.slice(0, 4) : [],
        release_info: '',
        evidence_chunk_ids: [slide.id],
        extraction_source: 'deterministic_presentation_fallback',
      });
    }
  }

  for (const slide of usable) {
    if (products.length >= 4 || selectedIds.has(slide.id)) continue;
    selectedIds.add(slide.id);
    products.push({
      item_type: 'technical_feature',
      product_name: compact(slide.title, 90),
      mlfb: '',
      summary: compact(slide.text, 160),
      key_features: [],
      technical_specs: [],
      application_scenarios: [],
      release_info: '',
      evidence_chunk_ids: [slide.id],
      extraction_source: 'deterministic_presentation_fallback',
    });
  }

  return { products };
}

function ensureMlfbCoverage(data: any, rawIndex: any, masterRecords?: Map<string, MasterRecord>) {
  const products = Array.isArray(data?.products) ? expandProductsToSingleMlfb(data.products) : [];
  const candidates = Array.isArray(rawIndex?.extracted?.mlfbCandidates)
    ? rawIndex.extracted.mlfbCandidates.map(normalizeMlfb).filter(Boolean)
    : [];
  const allowedMlfbs = masterRecords?.size ? new Set(masterRecords.keys()) : null;
  const masterScopedProducts = allowedMlfbs
    ? products
        .map(product => {
          const matchedMlfb = mlfbValuesFromProduct(product).find(mlfb => allowedMlfbs.has(mlfb));
          const record = matchedMlfb ? masterRecords?.get(matchedMlfb) : null;
          return record ? normalizeProductToMaster(product, record) : null;
        })
        .filter(Boolean)
    : products;
  const existing = new Set(masterScopedProducts.flatMap(mlfbValuesFromProduct));
  const slides = Array.isArray(rawIndex?.slides) ? rawIndex.slides : [];
  const chunks = Array.isArray(rawIndex?.chunks) ? rawIndex.chunks : [];

  for (const mlfb of candidates) {
    if (allowedMlfbs && !allowedMlfbs.has(mlfb)) continue;
    if (existing.has(mlfb)) continue;
    const masterRecord = masterRecords?.get(mlfb);

    const slide = slides.find((item: any) => String(item?.text || '').includes(mlfb));
    const tableRow = slide?.tables
      ?.flatMap((table: any) => Array.isArray(table) ? table : [])
      .find((row: any) => Array.isArray(row) && row.some((cell: any) => String(cell).includes(mlfb)));
    const chunk = chunks.find((item: any) => String(item?.text || '').includes(mlfb));
    const evidenceText = String(slide?.text || chunk?.text || '');
    const facts = evidenceFacts(evidenceText, mlfb);
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

    masterScopedProducts.push(normalizeProductToMaster({
      item_type: masterRecord ? masterItemType(masterRecord) : (mlfb.startsWith('6ES7193') ? 'accessory' : 'module'),
      product_name: masterRecord?.description || productName,
      mlfb,
      summary: productName === mlfb ? '资料中明确列出的订货型号。' : `资料中的订货信息：${productName}`,
      key_features: facts.slice(0, 3),
      technical_specs: facts.filter((text: string) => /\d|V\s*DC|PROFINET|RJ45|IP\d|RTD|TC|RS/i.test(text)).slice(0, 4),
      application_scenarios: [],
      release_info: releaseInfo,
      evidence_chunk_ids: evidenceId ? [evidenceId] : [],
      extraction_source: 'deterministic_mlfb_backfill',
    }, masterRecord || { mlfb, description: productName }, evidenceId ? [evidenceId] : []));
    existing.add(mlfb);
  }

  return { ...data, products: masterScopedProducts };
}

export async function POST(req: Request) {
  try {
    const { folderName, prompt, force } = await req.json();
    
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

      if (!force && fs.existsSync(indexFilePath)) {
        const existing = JSON.parse(fs.readFileSync(indexFilePath, 'utf8'));
        if (existing?._index?.sourceSha256 === rawIndex?.source?.sha256) {
          results.push({ file, status: 'skipped', message: 'Already extracted from current source index' });
          continue;
        }
      }

      try {
        console.log(`Sending local JSON index ${file} to LLM for precision extraction...`);
        const profile = getMaterialProfile(folderName);
        const shouldUseMasterContext = !folderName.startsWith('01_')
          && (profile.enforceMlfbCoverage || folderName.startsWith('03_'));
        const masterRecords = shouldUseMasterContext
          ? loadMasterRecordMap()
          : new Map<string, MasterRecord>();
        if (profile.enforceMlfbCoverage && !folderName.startsWith('01_') && masterRecords.size === 0) {
          results.push({
            file: sourceFileName,
            rawJson: file,
            status: 'error',
            error: '01 产品物料表格尚未生成本地 JSON，无法按主数据白名单精提取。',
          });
          continue;
        }

        const masterContext = masterRecords.size
          ? folderName.startsWith('03_')
            ? `\nAuthoritative 01 product master whitelist. For folder 03, do not create cards per MLFB. Use this whitelist only to validate related_mlfbs; discard non-whitelisted terminals, color labels, connectors, accessories, or product codes:\n${masterPromptContext(masterRecords)}\n`
            : `\nAuthoritative 01 product master whitelist. Only create refined product cards for these MLFB values. Use their product names and subtypes as the source of truth:\n${masterPromptContext(masterRecords)}\n`
          : '';

        // Force output to JSON
        let systemPrompt = `You are a professional product management data extractor.
You will receive a local raw JSON index generated from a source document. The raw JSON contains source metadata, heuristic candidates, headings, and text chunks.
Extract information strictly following the user's prompt.
Use only evidence present in the raw JSON. Do not use external knowledge, assumptions, or prior memory.
If a field is not supported by the raw JSON evidence, write "文档未明确说明".
For a multi-page presentation, create multiple reusable topic cards when the source contains distinct themes. Do not collapse the entire deck into one giant product card.
When extracted.mlfbCandidates contains MLFB values, create one reusable product card per MLFB. Do not merge multiple MLFB values into one card unless the user explicitly asks for a family-level summary.
If an authoritative 01 product master whitelist is provided, discard any MLFB, accessory, terminal, color label, spare part, or product code that is not in that whitelist. Do not create refined cards for non-whitelisted material.
You MUST output valid JSON only. Do not wrap in markdown or any other text.
${masterContext}
User Rule: ${prompt}`;
        if (folderName.startsWith('03_')) {
          systemPrompt = `You are a professional technical manual chapter extractor.
You will receive a local raw JSON index generated from a technical manual. Prefer the chapters array as the evidence boundary. Each chapter has id, title, chapterType, text, and optional mlfbCandidates.
Extract reusable chapter/theme cards strictly following the user's prompt.
Use only evidence present in the raw JSON. Do not use external knowledge, assumptions, or prior memory.
Do not create one card per MLFB for folder 03. MLFB values are only optional related_mlfbs tags when directly evidenced and whitelisted.
Keep system-level installation, wiring, configuration, commissioning, diagnostics, maintenance, safety, limitation, and technical-spec content as chapter/theme cards even when no MLFB is present.
If a field is not supported by the raw JSON evidence, write "文档未明确说明".
You MUST output valid JSON only. Do not wrap in markdown or any other text.
${masterContext}
User Rule: ${prompt}`;
        }

        const llmPayload = buildLlmPayloadFromRawIndex(rawIndex);
        const normalizedData = normalizeStructuredData(
          await llmService.extractInsightsInChunks(systemPrompt, llmPayload)
        );
        const structuredData = profile.enforceMlfbCoverage
          ? ensureMlfbCoverage(normalizedData, rawIndex, masterRecords.size ? masterRecords : undefined)
          : folderName.startsWith('03_')
            ? filterRelatedMlfbs(normalizedData, masterRecords)
            : normalizedData;

        let publishData = structuredData;
        let validation = validateRefinedOutput(publishData, rawIndex);
        let finalizedBy = 'llm';
        if (!validation.valid && Array.isArray(rawIndex?.slides)) {
          publishData = deterministicPresentationFallback(rawIndex);
          validation = validateRefinedOutput(publishData, rawIndex);
          finalizedBy = 'deterministic-fallback';
        }
        const persistedData = {
          ...publishData,
          _index: {
            schemaVersion: 1,
            sourceFile: sourceFileName,
            sourceSha256: rawIndex?.source?.sha256 || '',
            rawGeneratedAt: rawIndex?.generatedAt || null,
            refinedAt: new Date().toISOString(),
            finalizedBy,
          },
        };
        const candidatePath = `${indexFilePath}.candidate.json`;
        fs.writeFileSync(candidatePath, JSON.stringify(persistedData, null, 2), 'utf8');
        if (!validation.valid) {
          results.push({
            file: sourceFileName,
            rawJson: file,
            status: 'rejected',
            error: validation.reason,
            candidate: path.basename(candidatePath),
          });
          buildFolderCatalog(folderName);
          continue;
        }
        if (fs.existsSync(indexFilePath)) {
          fs.copyFileSync(indexFilePath, `${indexFilePath}.backup.${Date.now()}.json`);
        }
        fs.writeFileSync(indexFilePath, JSON.stringify(persistedData, null, 2), 'utf8');
        results.push({ file: sourceFileName, rawJson: file, status: 'success' });
        buildFolderCatalog(folderName);
        
      } catch (err: any) {
        console.error(`Failed to process ${file}:`, err);
        results.push({ file, status: 'error', error: err.message });
      }

      // Cool down between files to avoid Kimi rate limits
      console.log(`Cooling down 5s before next file...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    buildFolderCatalog(folderName);
    return NextResponse.json({ success: true, results });

  } catch (err: any) {
    console.error("Batch extraction error:", err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
