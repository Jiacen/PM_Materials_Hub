import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

type MaterialCard = {
  id: string;
  type: 'document' | 'mlfb' | 'evidence' | 'product' | 'module' | 'accessory' | 'image';
  stage: 'ai' | 'raw';
  title: string;
  subtitle: string;
  body: string;
  sourceFile: string;
  folderName: string;
  chunkIds: string[];
  assetUrl?: string;
  width?: number | null;
  height?: number | null;
  tags?: string[];
};

function safeId(value: string) {
  return value
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function compactText(text: string, maxLength = 240) {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function findEvidenceSnippet(chunks: any[], value: string) {
  const chunk = chunks.find((item: any) => String(item.text || '').includes(value));
  return {
    chunkId: chunk?.id,
    text: chunk?.text ? compactText(chunk.text) : '',
  };
}

function cardsFromAiJson(folderName: string, sourceFile: string, ai: any): MaterialCard[] {
  const products = Array.isArray(ai?.products) ? ai.products : [];
  return products.map((product: any, index: number) => {
    const itemType = product.item_type === 'accessory'
      ? 'accessory'
      : product.item_type === 'module'
        ? 'module'
        : 'product';
    const mlfb = Array.isArray(product.mlfb) ? product.mlfb.join(', ') : String(product.mlfb || '');
    const featureText = Array.isArray(product.key_features) ? product.key_features.join(' ') : '';
    const specText = Array.isArray(product.technical_specs) ? product.technical_specs.slice(0, 4).join(' · ') : '';

    return {
      id: `${safeId(sourceFile)}-ai-${index}-${safeId(product.product_name || mlfb || String(index))}`,
      type: itemType,
      stage: 'ai',
      title: product.product_name || mlfb || '精提取物料',
      subtitle: mlfb || (itemType === 'accessory' ? '附件/备件' : '大模型精提取'),
      body: compactText(featureText || specText || '已由大模型基于 raw JSON 规整合并。'),
      sourceFile,
      folderName,
      chunkIds: Array.isArray(product.evidence_chunk_ids) ? product.evidence_chunk_ids : [],
    };
  });
}

function cardsFromRawJson(folderName: string, fileName: string, raw: any): MaterialCard[] {
  const sourceFile = raw?.source?.fileName || fileName.replace(/\.raw\.json$/, '');
  const chunks = Array.isArray(raw?.chunks) ? raw.chunks : [];
  const mlfbCandidates = Array.isArray(raw?.extracted?.mlfbCandidates) ? raw.extracted.mlfbCandidates : [];
  const cards: MaterialCard[] = [];

  cards.push({
    id: `${safeId(sourceFile)}-document`,
    type: 'document',
    stage: 'raw',
    title: sourceFile,
    subtitle: `${raw?.stats?.chunkCount || chunks.length || 0} chunks · ${mlfbCandidates.length} MLFB 候选`,
    body: '本地 JSON 已生成。建议先执行大模型精提取，把候选订货号和证据片段规整为可交付的产品卡片。',
    sourceFile,
    folderName,
    chunkIds: chunks.slice(0, 2).map((chunk: any) => chunk.id).filter(Boolean),
  });

  for (const mlfb of mlfbCandidates.slice(0, 8)) {
    const evidence = findEvidenceSnippet(chunks, mlfb);
    cards.push({
      id: `${safeId(sourceFile)}-mlfb-${safeId(mlfb)}`,
      type: 'mlfb',
      stage: 'raw',
      title: mlfb,
      subtitle: '原始 MLFB 候选',
      body: evidence.text || '由本地规则识别，建议精提取后再用于正式交付。',
      sourceFile,
      folderName,
      chunkIds: evidence.chunkId ? [evidence.chunkId] : [],
    });
  }

  return cards;
}

function cardFromImageJson(folderName: string, imageManifest: any): MaterialCard {
  const sourceFile = imageManifest?.source?.fileName || 'image';
  const width = imageManifest?.image?.width || null;
  const height = imageManifest?.image?.height || null;
  const extension = imageManifest?.source?.extension || '';
  const size = imageManifest?.source?.size || 0;
  const sizeMb = size ? `${(size / 1024 / 1024).toFixed(1)} MB` : 'unknown size';
  const tags = Array.isArray(imageManifest?.tags) ? imageManifest.tags : [];

  return {
    id: `${safeId(sourceFile)}-image`,
    type: 'image',
    stage: 'raw',
    title: sourceFile,
    subtitle: `${width || '?'} x ${height || '?'} · ${extension.replace('.', '').toUpperCase()} · ${sizeMb}`,
    body: imageManifest?.usage || tags.join(' · ') || '图片素材',
    sourceFile,
    folderName,
    chunkIds: [],
    assetUrl: `/api/assets/image?folderName=${encodeURIComponent(folderName)}&fileName=${encodeURIComponent(sourceFile)}`,
    width,
    height,
    tags,
  };
}

function findAiIndexForSource(folderName: string, sourceFile: string) {
  const aiPath = path.join(process.cwd(), 'data', 'indexes', folderName, `${sourceFile}.meta.json`);
  if (!fs.existsSync(aiPath)) return null;
  return JSON.parse(fs.readFileSync(aiPath, 'utf8'));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const folderName = searchParams.get('folderName');
    if (!folderName) {
      return NextResponse.json({ success: false, error: 'folderName is required' }, { status: 400 });
    }

    const folderPath = path.join(process.cwd(), 'data', 'local-json-indexes', folderName);
    if (!fs.existsSync(folderPath)) {
      return NextResponse.json({ success: true, cards: [] });
    }

    const cards = fs.readdirSync(folderPath)
      .filter((file) => file.endsWith('.raw.json') || file.endsWith('.image.json'))
      .flatMap((file) => {
        const raw = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8'));
        if (file.endsWith('.image.json')) {
          return [cardFromImageJson(folderName, raw)];
        }
        const sourceFile = raw?.source?.fileName || file.replace(/\.raw\.json$/, '');
        const rawCards = cardsFromRawJson(folderName, file, raw);
        const aiIndex = findAiIndexForSource(folderName, sourceFile);
        const aiCards = aiIndex ? cardsFromAiJson(folderName, sourceFile, aiIndex) : [];
        return aiCards.length > 0 ? [...aiCards, ...rawCards] : rawCards;
      });

    return NextResponse.json({ success: true, cards });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load material cards';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
