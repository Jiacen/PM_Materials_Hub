import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getMaterialProfile } from '@/lib/materialProfiles';
import { readManualCards } from '@/lib/manualCardGenerator';

type MaterialCard = {
  id: string;
  type: 'document' | 'slide' | 'mlfb' | 'evidence' | 'product' | 'module' | 'accessory' | 'certificate'
    | 'product_master' | 'product_overview' | 'technical_feature' | 'technical_spec' | 'limitation'
    | 'value_proposition' | 'application' | 'comparison' | 'case_study' | 'customer_pain'
    | 'solution' | 'business_result' | 'sales_message' | 'objection_handling' | 'competitive_claim'
    | 'release_notice' | 'faq' | 'troubleshooting' | 'image';
  stage: 'ai' | 'master' | 'source' | 'raw';
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
  if (!folderName.startsWith('04_') || !Array.isArray(raw?.slides)) return [];

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

function buildManualPilotCard(folderName: string, sourceFile: string): MaterialCard | null {
  if (!folderName.startsWith('03_') || sourceFile !== 'et200bl_system_manual_zh-CHS_zh-CHS.pdf') {
    return null;
  }

  return {
    id: `${safeId(sourceFile)}-pilot-6ES7155-8AR00-0AN0`,
    type: 'module',
    stage: 'ai',
    title: 'IM 155-8 PN 接口模块',
    subtitle: '6ES7155-8AR00-0AN0 · MLFB 试点卡',
    body: 'ET 200BL 的 PROFINET IO 接口模块。当前内容仅整理系统手册中可直接核实的信息；模块自身的完整电气与通信参数仍应以接口模块设备手册为准。',
    sourceFile,
    folderName,
    chunkIds: ['chunk_0006', 'chunk_0009', 'chunk_0010', 'chunk_0011'],
    sections: [
      {
        id: 'identity',
        label: '产品身份',
        type: 'product_overview',
        items: [
          '订货号：6ES7155-8AR00-0AN0。',
          '产品名称：IM 155-8 PN 接口模块。',
          '用途：将 ET 200BL 分布式 I/O 系统作为 PROFINET IO 设备连接到 IO 控制器。',
        ],
      },
      {
        id: 'parameters',
        label: '技术参数',
        type: 'technical_spec',
        items: [
          '额定工作电压：24 V DC；容差范围：20.4 V DC 至 28.8 V DC（系统手册给出的 ET 200BL 系统供电条件）。',
          '防护等级：IP20；属于开放式设备。',
          '安装环境：机柜、控制柜、电气操作室或干燥室内环境。',
          '安装位置：允许任意安装位置；建议优先采用水平安装。',
          '安装方式：安装在标准安装导轨或 SIMATIC 系统导轨上。',
          '通信接口：PROFINET IO。',
          '尺寸、PROFINET 端口数量、通信速率以及 RT/IRT 支持：本系统手册未给出该 MLFB 的明确数值，需从接口模块设备手册补充。',
        ],
      },
      {
        id: 'system-conditions',
        label: '技术特性',
        type: 'technical_spec',
        items: [
          'ET 200BL 站最大机械组态为 16 个模块；这是系统级组态上限，不是接口模块设备手册中的完整性能参数。',
          '地址空间取决于所用 CPU 和接口模块；本系统手册未给出该 MLFB 的完整地址空间数值。',
          '支持 I&M0 至 I&M3 标识和维护数据，可用于检查设备组态、定位硬件更改和纠正设备错误。',
          '可通过用户程序、STEP 7/HMI 或 CPU Web 服务器读取 I&M 数据。',
          '支持通过 STEP 7 在线诊断或 MFCT 更新固件。',
          '支持通过 STEP 7 或 MFCT 复位为出厂设置。',
        ],
      },
      {
        id: 'commissioning',
        label: '调试要点',
        type: 'technical_feature',
        items: [
          '作为 PROFINET IO 设备调试前，接口模块应处于出厂设置状态或已复位为出厂设置。',
          '调试流程包括安装、连接电源与 PROFINET IO、组态 IO 控制器、下载组态、切换至 RUN、检查 LED 并测试输入输出。',
        ],
      },
      {
        id: 'limitations',
        label: '限制与注意事项',
        type: 'limitation',
        items: [
          '复位为出厂设置前，应确保接口模块在线可访问且未连接到 CPU。',
          '复位为出厂设置可能导致总线段上的下游站发生故障。',
          '复位后已安装的 I/O 模块处于未组态状态，接口模块不获取输入数据，也不输出数据。',
          '系统手册明确指出：各模块的完整技术规范应查阅对应模块设备手册。',
        ],
      },
    ],
  };
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
        const isPresentation = Array.isArray(raw?.slides);
        const rawCards = isPresentation ? [] : cardsFromRawJson(folderName, file, raw);
        const slideCards = cardsFromPresentationSlides(folderName, sourceFile, raw);
        const generatedManualCards = readManualCards(folderName, sourceFile);
        if (generatedManualCards?.length) {
          return [...generatedManualCards, ...rawCards];
        }
        const aiIndex = findAiIndexForSource(folderName, sourceFile);
        const aiCards = aiIndex ? cardsFromAiJson(folderName, sourceFile, aiIndex) : [];
        const pilotCard = buildManualPilotCard(folderName, sourceFile);
        if (pilotCard) {
          return [pilotCard, ...rawCards];
        }
        return aiCards.length > 0 ? [...aiCards, ...slideCards, ...rawCards] : [...slideCards, ...rawCards];
      });

    return NextResponse.json({ success: true, cards });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load material cards';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
