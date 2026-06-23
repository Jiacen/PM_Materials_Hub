import fs from 'fs';
import path from 'path';
import { llmService } from './llmService';

type Section = { id: string; label: string; type: string; items: string[] };
type MasterRecord = {
  id: string;
  productType: string;
  subType: string;
  mlfb: string;
  description: string;
  priceGroup?: string;
  listPriceRmbInclVat?: number;
};
type RawManual = {
  source: { fileName: string; folderName: string };
  chunks: Array<{ id: string; text: string }>;
};
type ManualCard = {
  id: string;
  type: 'module' | 'accessory';
  stage: 'ai';
  title: string;
  subtitle: string;
  body: string;
  sourceFile: string;
  folderName: string;
  chunkIds: string[];
  sections: Section[];
  finalizedBy: 'llm' | 'validated-fallback';
};

function normalizeMlfb(value: unknown) {
  return String(value || '').toUpperCase().replace(/\s+/g, '');
}

function safeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*]+/g, '-');
}

function loadMasterRecords(): MasterRecord[] {
  const root = path.join(process.cwd(), 'data', 'local-json-indexes');
  if (!fs.existsSync(root)) return [];
  const masterDirs = fs.readdirSync(root).filter(name => name.startsWith('01_'));
  const records: MasterRecord[] = [];
  for (const dir of masterDirs) {
    for (const file of fs.readdirSync(path.join(root, dir)).filter(name => name.endsWith('.raw.json'))) {
      const json = JSON.parse(fs.readFileSync(path.join(root, dir, file), 'utf8'));
      if (json.kind === 'product_master' && Array.isArray(json.records)) records.push(...json.records);
    }
  }
  return [...new Map(records.map(record => [normalizeMlfb(record.mlfb), record])).values()];
}

function loadManuals(folderName: string): RawManual[] {
  const dir = path.join(process.cwd(), 'data', 'local-json-indexes', folderName);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.raw.json'))
    .map(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))
    .filter(json => Array.isArray(json.chunks));
}

function descriptionParameters(description: string) {
  const values: string[] = [];
  const channel = description.match(/^\s*(DI|DQ|AI|AQ)\s*(\d+)x(.+)$/i);
  if (channel) {
    values.push(`信号类型：${channel[1].toUpperCase()}。`);
    values.push(`通道数量：${channel[2]}。`);
    values.push(`信号规格：${channel[3].trim()}。`);
  }
  const interfaceCount = description.match(/(\d+)\s*[×x]\s*RJ45/i);
  if (interfaceCount) values.push(`接口：集成 ${interfaceCount[1]} × RJ45。`);
  const maxModules = description.match(/最大支持扩展\s*(\d+)\s*个\s*I\/O\s*模块/i);
  if (maxModules) values.push(`最大扩展：${maxModules[1]} 个 I/O 模块。`);
  const rs = description.match(/RS\s*422\/485/i);
  if (rs) values.push('通信接口：RS422/485。');
  const threeWireVariants = description.match(/(\d+)-\/(\d+)-\/(\d+)-wire/i);
  const twoWireVariants = description.match(/(\d+)-\/(\d+)-wire/i);
  if (threeWireVariants) {
    values.push(`接线方式：${threeWireVariants[1]} 线制、${threeWireVariants[2]} 线制或 ${threeWireVariants[3]} 线制。`);
  } else if (twoWireVariants) {
    values.push(`接线方式：${twoWireVariants[1]} 线制或 ${twoWireVariants[2]} 线制。`);
  }
  if (/RTD/i.test(description)) values.push('测量对象：RTD/电阻温度信号。');
  if (/\bTC\b/i.test(description)) values.push('测量对象：热电偶信号。');
  return values;
}

function productKeywords(record: MasterRecord) {
  return record.description
    .replace(record.mlfb, '')
    .split(/[\s,，/()]+/)
    .filter(token => token.length >= 3)
    .filter(token => !/^(模块|备件|接口|支持|包括)$/i.test(token))
    .slice(0, 6);
}

function evidenceForRecord(record: MasterRecord, manual: RawManual) {
  const exact = manual.chunks.filter(chunk => normalizeMlfb(chunk.text).includes(normalizeMlfb(record.mlfb)));
  if (exact.length) return exact;
  const keywords = productKeywords(record);
  return manual.chunks.filter(chunk => keywords.some(keyword => chunk.text.toUpperCase().includes(keyword.toUpperCase()))).slice(0, 3);
}

function systemEvidence(manual: RawManual) {
  const patterns = [/最大机械组态/, /防护等级.*IP20/, /额定工作电压.*24\s*V\s*DC/, /安装位置/, /I&M0/, /固件更新/, /复位为出厂设置/];
  return manual.chunks.filter(chunk => patterns.some(pattern => pattern.test(chunk.text))).slice(0, 6);
}

function buildCoreCard(folderName: string, manual: RawManual, record: MasterRecord): ManualCard {
  const directEvidence = evidenceForRecord(record, manual);
  const sharedEvidence = systemEvidence(manual);
  const isSpare = record.subType === '备件';
  const hasDirectManualEvidence = directEvidence.some(chunk => normalizeMlfb(chunk.text).includes(normalizeMlfb(record.mlfb)));
  const parameters = descriptionParameters(record.description);
  const directText = directEvidence.map(chunk => chunk.text).join('\n');

  if (/IM155|接口模块/i.test(record.description)) {
    if (/24\s*V\s*DC/i.test(directText) || sharedEvidence.some(chunk => /24\s*V\s*DC/i.test(chunk.text))) {
      parameters.push('系统供电条件：额定 24 V DC，容差范围 20.4 V DC 至 28.8 V DC。');
    }
    parameters.push('系统防护等级：IP20；属于开放式设备。');
    parameters.push('安装环境：机柜、控制柜、电气操作室或干燥室内环境。');
  }

  const identityItems = [
    `订货号：${record.mlfb}。`,
    `产品名称：${record.description}。`,
    `产品分类：${record.productType} / ${record.subType}。`,
  ];
  const characteristicItems = isSpare
    ? ['该物料由 01 产品主数据定义为核心备件。']
    : [
        ...(/IM155|接口模块/i.test(record.description) ? ['ET 200BL 站最大机械组态为 16 个模块。', '支持 I&M0 至 I&M3 标识和维护数据。'] : []),
        ...(hasDirectManualEvidence ? ['当前技术手册包含该 MLFB 的直接证据。'] : ['当前技术手册未包含该 MLFB 的设备级详细章节。']),
      ];

  return {
    id: `${safeFileName(manual.source.fileName)}-${record.mlfb}`,
    type: isSpare ? 'accessory' : 'module',
    stage: 'ai',
    title: record.description,
    subtitle: record.mlfb,
    body: hasDirectManualEvidence
      ? `01 主数据中的核心产品；已关联当前手册中的直接证据。`
      : `01 主数据中的核心产品；当前系统手册未提供完整设备参数，需结合对应设备手册继续补充。`,
    sourceFile: manual.source.fileName,
    folderName,
    chunkIds: [...new Set([...directEvidence, ...(/IM155|接口模块/i.test(record.description) ? sharedEvidence : [])].map(chunk => chunk.id))],
    finalizedBy: 'validated-fallback',
    sections: [
      { id: 'identity', label: '产品身份', type: 'product_overview', items: identityItems },
      {
        id: isSpare ? 'specifications' : 'parameters',
        label: isSpare ? '规格信息' : '技术参数',
        type: 'technical_spec',
        items: parameters.length ? parameters : ['当前资料仅提供产品名称和订货号；详细技术参数需从对应设备手册补充。'],
      },
      { id: 'characteristics', label: isSpare ? '适用与使用' : '技术特性', type: 'technical_feature', items: characteristicItems },
      {
        id: 'limitations',
        label: '资料边界',
        type: 'limitation',
        items: [
          hasDirectManualEvidence
            ? '仅采用当前手册及 01 产品主数据中有证据支持的信息。'
            : '当前系统手册未直接覆盖该 MLFB；除 01 主数据字段外，不推断设备参数。',
        ],
      },
    ],
  };
}

function protectedTokens(text: string) {
  return [...new Set(text.match(/\b(?:6ES7[A-Z0-9-]+|\d+(?:[.,]\d+)?|V|DC|A|IP\d+|PROFINET|IO|RJ45|RS422|RS485|RTD|TC|I&M\d*)\b/gi) || [])];
}

function validateCard(source: ManualCard, refined: ManualCard): ManualCard {
  if (refined.subtitle !== source.subtitle || refined.sections?.length !== source.sections.length) throw new Error('Card structure changed.');
  const sections = source.sections.map((section, index) => {
    const next = refined.sections[index];
    if (next.id !== section.id || next.label !== section.label || next.type !== section.type || next.items.length !== section.items.length) throw new Error('Section structure changed.');
    return { ...section, items: section.items.map((item, itemIndex) => {
      const output = String(next.items[itemIndex] || '').trim();
      for (const token of protectedTokens(item)) if (!output.toLowerCase().includes(token.toLowerCase())) throw new Error(`Protected token changed: ${token}`);
      return output;
    }) };
  });
  return { ...source, title: refined.title || source.title, body: refined.body || source.body, sections, finalizedBy: 'llm' };
}

async function refineCardBatch(cards: ManualCard[]) {
  try {
    const result = await Promise.race([
      llmService.extractInsights(
        '仅轻度整理工业自动化卡片中文。不得新增事实、改变数值单位、MLFB、产品归属或资料边界。保持 cards 数量顺序以及 sections 的 id、label、type、顺序和条目数量。仅输出 {"cards":[...]}。',
        JSON.stringify({ cards })
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('LLM refinement timed out.')), 60000)),
    ]) as any;
    if (!Array.isArray(result?.cards) || result.cards.length !== cards.length) throw new Error('Card batch changed.');
    return cards.map((card, index) => validateCard(card, result.cards[index]));
  } catch {
    return cards;
  }
}

export async function generateManualCards(folderName: string) {
  const masterRecords = loadMasterRecords();
  if (!masterRecords.length) throw new Error('No 01 product master records are available.');
  const manuals = loadManuals(folderName);
  if (!manuals.length) throw new Error('No local manual indexes are available.');

  const results: ManualCard[] = [];
  const outputDir = path.join(process.cwd(), 'data', 'manual-cards', folderName);
  fs.mkdirSync(outputDir, { recursive: true });

  for (const manual of manuals) {
    const baseCards = masterRecords.map(record => buildCoreCard(folderName, manual, record));
    const finalized: ManualCard[] = [];
    for (let index = 0; index < baseCards.length; index += 7) finalized.push(...await refineCardBatch(baseCards.slice(index, index + 7)));
    fs.writeFileSync(
      path.join(outputDir, `${safeFileName(manual.source.fileName)}.cards.json`),
      JSON.stringify({ schemaVersion: 2, sourceFile: manual.source.fileName, masterSource: '01 product master', generatedAt: new Date().toISOString(), cards: finalized }, null, 2),
      'utf8'
    );
    results.push(...finalized);
  }
  return { cards: results };
}

export function readManualCards(folderName: string, sourceFile: string): ManualCard[] | null {
  const filePath = path.join(process.cwd(), 'data', 'manual-cards', folderName, `${safeFileName(sourceFile)}.cards.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')).cards || null;
}
