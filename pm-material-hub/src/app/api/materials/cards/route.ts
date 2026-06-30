import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getMaterialProfile } from '@/lib/materialProfiles';
import { readManualCards } from '@/lib/manualCardGenerator';
import { readPptSelectionCards } from '@/lib/pptSelectionFavorites';

type MaterialCard = {
  id: string;
  type: 'document' | 'slide' | 'ppt_selection' | 'mlfb' | 'evidence' | 'product' | 'module' | 'accessory' | 'certificate'
    | 'product_master' | 'product_overview' | 'technical_feature' | 'technical_spec' | 'limitation'
    | 'value_proposition' | 'application' | 'comparison' | 'case_study' | 'customer_pain'
    | 'solution' | 'business_result' | 'sales_message' | 'objection_handling' | 'competitive_claim'
    | 'release_notice' | 'faq' | 'troubleshooting' | 'image';
  stage: 'ai' | 'master' | 'source' | 'raw' | 'favorite';
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
  slideNumber?: number;
  slideCount?: number;
  sections?: Array<{
    id: string;
    label: string;
    type: string;
    items: string[];
  }>;
};

function cardsFromPresentationSlides(folderName: string, sourceFile: string, raw: any): MaterialCard[] {
  if (!Array.isArray(raw?.slides)) return [];

  const slideCount = raw.slides.length;
  return raw.slides.map((slide: any, index: number) => {
    const slideNumber = Number(slide?.slideNumber) || index + 1;
    const title = String(slide?.title || `第 ${slideNumber} 页`).trim();
    const textItems = Array.isArray(slide?.textItems) ? slide.textItems : [];
    const body = textItems
      .map((item: any) => String(item?.text || '').trim())
      .filter((text: string) => text && text !== title)
      .slice(0, 4)
      .join(' · ');
    const assetUrl = `/api/assets/slide-preview?folderName=${encodeURIComponent(folderName)}&sourceFile=${encodeURIComponent(sourceFile)}&slideNumber=${slideNumber}&slideCount=${slideCount}`;

    return {
      id: `${safeId(sourceFile)}-slide-${String(slideNumber).padStart(4, '0')}`,
      type: 'slide',
      stage: 'source',
      title,
      subtitle: `第 ${slideNumber} / ${slideCount} 页`,
      body: compactText(body || String(slide?.text || '') || '原始 PPT 页面'),
      sourceFile,
      folderName,
      chunkIds: [slide?.id || `slide_${String(slideNumber).padStart(4, '0')}`],
      assetUrl,
      slideNumber,
      slideCount,
      tags: ['原始PPT页'],
    };
  });
}

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

function isUsefulText(value: unknown) {
  const text = String(value || '').trim();
  return Boolean(text) && !text.includes('文档未明确') && !text.includes('文档未涉及');
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
  const finalizedBy = String(ai?._index?.finalizedBy || 'llm');
  return products.map((product: any, index: number) => {
    const supportedTypes = new Set([
      'product', 'module', 'accessory', 'certificate', 'value_proposition',
      'product_overview', 'technical_feature', 'technical_spec', 'limitation',
      'application', 'comparison', 'case_study', 'customer_pain', 'solution',
      'business_result', 'sales_message', 'objection_handling', 'competitive_claim',
      'release_notice', 'faq', 'troubleshooting',
    ]);
    const itemType = supportedTypes.has(product.item_type) ? product.item_type : 'product';
    const mlfb = Array.isArray(product.mlfb) ? product.mlfb.join(', ') : String(product.mlfb || '');
    const featureText = Array.isArray(product.key_features) ? product.key_features.join(' ') : '';
    const specText = Array.isArray(product.technical_specs) ? product.technical_specs.slice(0, 4).join(' · ') : '';
    const certificateText = itemType === 'certificate'
      ? [
          product.issue_date ? `签发日期：${product.issue_date}` : '',
          product.issued_to ? `持证单位：${product.issued_to}` : '',
          Array.isArray(product.standards) && product.standards.length
            ? `认证标准：${product.standards.join('；')}`
            : '',
        ].filter(Boolean).join(' ')
      : '';
    const summaryText = String(product.summary || product.body || '');
    const sections = [
      {
        id: 'overview',
        label: '产品概述',
        type: 'product_overview',
        items: [summaryText].filter(Boolean),
      },
      {
        id: 'features',
        label: '核心功能',
        type: 'technical_feature',
        items: Array.isArray(product.key_features) ? product.key_features.filter(Boolean) : [],
      },
      {
        id: 'specs',
        label: '技术参数',
        type: 'technical_spec',
        items: Array.isArray(product.technical_specs) ? product.technical_specs.filter(Boolean) : [],
      },
      {
        id: 'differences',
        label: '型号差异',
        type: 'comparison',
        items: product.model_differences && !String(product.model_differences).includes('未明确')
          ? [String(product.model_differences)]
          : [],
      },
      {
        id: 'applications',
        label: '适用场景',
        type: 'application',
        items: [
          product.target_industry,
          ...(Array.isArray(product.application_scenarios) ? product.application_scenarios : []),
        ].filter(isUsefulText).map(String),
      },
      {
        id: 'issues',
        label: '限制与注意事项',
        type: 'limitation',
        items: Array.isArray(product.common_issues) ? product.common_issues.filter(Boolean) : [],
      },
    ].filter(section => section.items.length > 0);

    return {
      id: `${safeId(sourceFile)}-ai-${index}-${safeId(product.product_name || mlfb || String(index))}`,
      type: itemType,
      stage: 'ai',
      title: product.product_name || mlfb || '精提取物料',
      subtitle: itemType === 'certificate'
        ? String(product.certificate_number || '认证证书')
        : mlfb || (itemType === 'accessory'
          ? '附件/备件'
          : finalizedBy === 'deterministic-fallback' ? '规则兜底提取' : '大模型精提取'),
      body: compactText(certificateText || summaryText || featureText || specText || '已由大模型基于 raw JSON 规整合并。'),
      sourceFile,
      folderName,
      chunkIds: Array.isArray(product.evidence_chunk_ids) ? product.evidence_chunk_ids : [],
      sections,
    };
  });
}

function cardsFromRawJson(folderName: string, fileName: string, raw: any): MaterialCard[] {
  const sourceFile = raw?.source?.fileName || fileName.replace(/\.raw\.json$/, '');
  const chunks = Array.isArray(raw?.chunks) ? raw.chunks : [];
  const mlfbCandidates = Array.isArray(raw?.extracted?.mlfbCandidates) ? raw.extracted.mlfbCandidates : [];
  const cards: MaterialCard[] = [];
  const profile = getMaterialProfile(folderName);

  if (raw?.kind === 'product_master' && Array.isArray(raw?.records)) {
    return raw.records.map((record: any) => ({
      id: `${safeId(sourceFile)}-master-${safeId(record.mlfb)}`,
      type: 'product_master',
      stage: 'master',
      title: record.description || record.mlfb,
      subtitle: record.mlfb,
      body: compactText([
        record.productType,
        record.subType,
        record.priceGroup ? `价格组 ${record.priceGroup}` : '',
        record.listPriceRmbInclVat != null ? `含税列表价 RMB ${Number(record.listPriceRmbInclVat).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` : '',
      ].filter(Boolean).join(' · ')),
      sourceFile,
      folderName,
      chunkIds: record.id ? [record.id] : [],
    }));
  }

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

  if (!profile.showRawMlfbCards) return cards;

  for (const mlfb of mlfbCandidates) {
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
    const favoriteCards = readPptSelectionCards(folderName);
    if (!fs.existsSync(folderPath)) {
      return NextResponse.json({ success: true, cards: favoriteCards });
    }

    const cards = fs.readdirSync(folderPath)
      .filter((file) => file.endsWith('.raw.json') || file.endsWith('.image.json'))
      .flatMap((file) => {
        const raw = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8'));
        if (file.endsWith('.image.json')) {
          return [cardFromImageJson(folderName, raw)];
        }
        const sourceFile = raw?.source?.fileName || file.replace(/\.raw\.json$/, '');
        const isPresentation = Array.isArray(raw?.slides);
        const rawCards = isPresentation ? [] : cardsFromRawJson(folderName, file, raw);
        const slideCards = cardsFromPresentationSlides(folderName, sourceFile, raw);
        const generatedManualCards = readManualCards(folderName, sourceFile);
        if (generatedManualCards?.length) {
          return [...generatedManualCards, ...rawCards];
        }
        const aiIndex = findAiIndexForSource(folderName, sourceFile);
        const aiCards = aiIndex ? cardsFromAiJson(folderName, sourceFile, aiIndex) : [];
        return aiCards.length > 0 ? [...aiCards, ...slideCards, ...rawCards] : [...slideCards, ...rawCards];
      });

    return NextResponse.json({ success: true, cards: [...favoriteCards, ...cards] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load material cards';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
