import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getWorkspacePath, isIgnoredWorkspaceFile } from '@/lib/fileSystem';

const OUTPUT_ROOT = path.join(process.cwd(), 'data', 'local-json-indexes');

type LocalIndexResult = {
  file: string;
  status: 'indexed' | 'skipped' | 'unsupported' | 'error';
  message?: string;
  chars?: number;
  chunks?: number;
  mlfbCandidates?: number;
  width?: number;
  height?: number;
  outputPath?: string;
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.bmp']);

function sha256(buffer: Buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function chunkText(text: string, chunkSize = 6000, overlap = 400) {
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

function extractMlfbCandidates(text: string) {
  const matches = text.toUpperCase().match(/\b6ES7\d{3}-[A-Z0-9*]{5}-[A-Z0-9*]{4}\b/g) || [];
  return [...new Set(matches.map((value) => {
    const [prefix, middle, suffixValue] = value.split('-');
    const suffix = suffixValue.split('');
    suffix[0] = suffix[0] === 'O' ? '0' : suffix[0];
    suffix[3] = suffix[3] === 'O' ? '0' : suffix[3];
    return `${prefix}-${middle}-${suffix.join('')}`;
  }))].sort();
}

function extractHeadingCandidates(text: string) {
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

function inferManualChapterType(title: string, text: string) {
  const sample = `${title}\n${text.slice(0, 600)}`;
  if (/安全|警告|危险|小心|注意/.test(sample)) return 'safety_note';
  if (/安装|装配|导轨|尺寸图|间距/.test(sample)) return 'installation';
  if (/接线|端子|连接|电缆|电源|电压|RJ45|PROFINET/i.test(sample)) return 'wiring';
  if (/组态|配置|参数|TIA|STEP\s*7|GSD/i.test(sample)) return 'configuration';
  if (/调试|启动|试运行|固件|复位/.test(sample)) return 'commissioning';
  if (/诊断|报警|中断|故障|LED|错误/.test(sample)) return 'diagnostics';
  if (/维护|更换|备份|更新|清洁/.test(sample)) return 'maintenance';
  if (/技术数据|技术规范|额定|环境条件|认证|标准|IP\d/i.test(sample)) return 'technical_spec';
  if (/限制|边界|不能|不支持|要求|条件/.test(sample)) return 'limitation';
  return 'technical_feature';
}

function uniqueByText(items: string[], limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const text = item.replace(/\s+/g, ' ').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function isLowValueManualText(value: string) {
  return /漏洞|漏洞通知|安全漏洞|安全公告|安全更新|更新通知|通知设置|自动通知|签名固件|固件签名|固件更新|补丁|补丁程序|网络安全|工业网络安全|数据完整性|归档完整性|篡改|传输错误|订阅|newsletter|notification|security update|security advisory|vulnerability|firmware update|signed firmware|patch|marketing|portfolio|brochure|contact|copyright|trademark|免责声明|商标|版权|营销|宣传|亮点|价值主张/i.test(value);
}

function hasManualEngineeringSignal(value: string) {
  return /安装|装配|接线|端子|连接|电源|电压|电流|通道|组态|配置|参数|调试|启动|诊断|报警|中断|故障|LED|维护|更换|复位|技术数据|技术规范|额定|尺寸|环境条件|温度|湿度|海拔|防护等级|PROFINET|PROFIBUS|RJ45|RS\s*485|RS\s*422|I\/O|DI|DQ|AI|AQ|RTD|TC|V\s*DC|mA|Hz|mm|IEC|EN\s*\d|UL|CE|IP\d/i.test(value);
}

function isLowValueManualChapter(title: string, text: string) {
  const sample = `${title}\n${text.slice(0, 1200)}`;
  if (!isLowValueManualText(sample)) return false;
  return !hasManualEngineeringSignal(sample);
}

function extractManualDigest(title: string, text: string) {
  const normalized = normalizeText(text);
  const units = normalized
    .split(/\n+|(?<=[。；;.!?])\s+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 8 && line.length <= 420)
    .filter((line) => !/^(page|copyright|all rights reserved|\d+)$|^[-–—_ ]+$/i.test(line))
    .filter((line) => !isLowValueManualText(line) || hasManualEngineeringSignal(line));

  const engineeringUnits = units.filter(hasManualEngineeringSignal);
  const intro = uniqueByText(engineeringUnits.slice(0, 18), 4);
  const specFacts = uniqueByText(units.filter((line) =>
    /\d|V\s*DC|mA|A\b|Hz|mm|cm|kg|IP\d|PROFINET|PROFIBUS|RJ45|RS\s*485|RS\s*422|I\/O|DI|DQ|AI|AQ|RTD|TC|IEC|EN\s*\d|UL|CE/i.test(line)
  ), 8);
  const procedureFacts = uniqueByText(units.filter((line) =>
    /step|press|select|install|connect|configure|parameter|restart|reset|mount|wire|set|enable|disable|check|步骤|选择|安装|连接|接线|组态|配置|参数|重启|复位|检查|设置/.test(line)
  ), 8);
  const warningFacts = uniqueByText(units.filter((line) =>
    /warning|caution|danger|must|shall|only|do not|not permitted|risk|警告|危险|小心|必须|不得|不能|仅|风险|限制/.test(line)
    && hasManualEngineeringSignal(line)
  ), 5);
  const keywordFacts = uniqueByText(units.filter((line) =>
    /diagnos|alarm|interrupt|fault|error|LED|maintenance|commission|startup|诊断|报警|中断|故障|错误|维护|调试/.test(line)
  ), 6);
  const mlfbCandidates = extractMlfbCandidates(normalized);
  const evidenceSnippets = uniqueByText([
    ...specFacts,
    ...procedureFacts,
    ...warningFacts,
    ...keywordFacts,
    ...intro,
  ], 24);

  const compressedText = [
    `Chapter: ${title || 'Manual chapter'}`,
    `Original chars: ${normalized.length}`,
    `Digest policy: chapter-level engineering facts only; low-value vulnerability notices, security update notifications, signed firmware notices, generic marketing text, copyright, and repeated boilerplate are excluded.`,
    mlfbCandidates.length ? `MLFB candidates: ${mlfbCandidates.join(', ')}` : '',
    intro.length ? `Overview:\n- ${intro.join('\n- ')}` : '',
    specFacts.length ? `Parameters and standards:\n- ${specFacts.join('\n- ')}` : '',
    procedureFacts.length ? `Procedures and engineering rules:\n- ${procedureFacts.join('\n- ')}` : '',
    warningFacts.length ? `Warnings and limits:\n- ${warningFacts.join('\n- ')}` : '',
    keywordFacts.length ? `Diagnostics or lifecycle facts:\n- ${keywordFacts.join('\n- ')}` : '',
  ].filter(Boolean).join('\n\n');

  return {
    originalCharCount: normalized.length,
    compressedCharCount: compressedText.length,
    compressionRatio: normalized.length ? Number((compressedText.length / normalized.length).toFixed(3)) : 1,
    mlfbCandidates,
    overview: intro,
    specFacts,
    procedureFacts,
    warningFacts,
    lifecycleFacts: keywordFacts,
    evidenceSnippets,
    compressedText,
  };
}

function buildManualChapters(text: string) {
  const lines = text.split('\n');
  const headings: Array<{ index: number; offset: number; title: string }> = [];
  let offset = 0;
  const headingPattern = /^(\d+(\.\d+){0,3}|[A-D]\.\d+)\s+\S+/;
  const namedHeadingPattern = /^(简介|系统概述|产品概述|应用规划|安装|接线|组态|配置|调试|诊断|维护|技术规范|技术数据|工业网络安全|附件\/备件|参数分配|报警|中断|尺寸图|认证|安全说明)$/;

  lines.forEach((line, index) => {
    const title = line.trim();
    if (
      title.length >= 2
      && title.length <= 100
      && (headingPattern.test(title) || namedHeadingPattern.test(title))
    ) {
      headings.push({ index, offset, title });
    }
    offset += line.length + 1;
  });

  if (headings.length < 2) {
    return chunkText(text, 9000, 600).map((chunk, index) => {
      const title = `手册内容片段 ${index + 1}`;
      const digest = extractManualDigest(title, chunk.text);
      return {
        id: `chapter_${String(index + 1).padStart(4, '0')}`,
        title,
        chapterType: inferManualChapterType('', chunk.text),
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        text: digest.compressedText,
        originalCharCount: digest.originalCharCount,
        compressedCharCount: digest.compressedCharCount,
        compressionRatio: digest.compressionRatio,
        mlfbCandidates: digest.mlfbCandidates,
        digest,
      };
    }).filter((chapter) => chapter.digest.evidenceSnippets.length > 0);
  }

  return headings.map((heading, index) => {
    const next = headings[index + 1];
    const charStart = heading.offset;
    const charEnd = next ? next.offset : text.length;
    const chapterText = text.slice(charStart, charEnd).trim();
    const digest = extractManualDigest(heading.title, chapterText);
    return {
      id: `chapter_${String(index + 1).padStart(4, '0')}`,
      title: heading.title,
      chapterType: inferManualChapterType(heading.title, chapterText),
      charStart,
      charEnd,
      text: digest.compressedText,
      originalCharCount: digest.originalCharCount,
      compressedCharCount: digest.compressedCharCount,
      compressionRatio: digest.compressionRatio,
      mlfbCandidates: digest.mlfbCandidates,
      digest,
    };
  }).filter((chapter) => (
    chapter.originalCharCount >= 80
    && chapter.digest.evidenceSnippets.length > 0
    && !isLowValueManualChapter(chapter.title, chapter.digest.compressedText)
  ));
}

function getFolderPath(folderName: string) {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) throw new Error('Workspace path not configured');

  const targetFolder = path.resolve(workspacePath, folderName);
  const workspaceRoot = path.resolve(workspacePath);
  if (!targetFolder.startsWith(workspaceRoot)) {
    throw new Error('Invalid folder path');
  }
  if (!fs.existsSync(targetFolder)) {
    throw new Error(`Folder does not exist: ${folderName}`);
  }

  return { workspacePath, targetFolder };
}

export function countLocalIndexes() {
  const counts: Record<string, number> = {};
  if (!fs.existsSync(OUTPUT_ROOT)) return counts;

  for (const entry of fs.readdirSync(OUTPUT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folderPath = path.join(OUTPUT_ROOT, entry.name);
    counts[entry.name] = fs.readdirSync(folderPath)
      .filter((file) => file.endsWith('.raw.json') || file.endsWith('.image.json'))
      .length;
  }

  return counts;
}

export async function indexFolderLocally(folderName: string, force = false): Promise<LocalIndexResult[]> {
  const { workspacePath, targetFolder } = getFolderPath(folderName);
  const files = fs.readdirSync(targetFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((file) => !isIgnoredWorkspaceFile(file));

  const outputDir = path.join(OUTPUT_ROOT, folderName);
  fs.mkdirSync(outputDir, { recursive: true });

  const results: LocalIndexResult[] = [];
  for (const file of files) {
    const filePath = path.join(targetFolder, file);
    const ext = path.extname(file).toLowerCase();
    const isImage = IMAGE_EXTENSIONS.has(ext);
    const outputPath = path.join(outputDir, `${file}${isImage ? '.image.json' : '.raw.json'}`);

    try {
      const buffer = fs.readFileSync(filePath);
      const stat = fs.statSync(filePath);
      const fileHash = sha256(buffer);

      if (!force && fs.existsSync(outputPath)) {
        const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        if (existing?.source?.sha256 === fileHash && existing?.source?.mtimeMs === stat.mtimeMs) {
          if (['.ppt', '.pptx'].includes(ext)) {
            const slideCount = Array.isArray(existing?.slides) ? existing.slides.length : 0;
            const { ensurePresentationPreviews } = await import('@/lib/presentationPreview');
            await ensurePresentationPreviews(folderName, file, slideCount, false);
          }
          results.push({ file, status: 'skipped', message: 'Already indexed', outputPath });
          continue;
        }
      }

      if (isImage) {
        const sharp = (await import('sharp')).default;
        const metadata = await sharp(buffer).metadata();
        const doc = {
          schemaVersion: 1,
          kind: 'image',
          generatedAt: new Date().toISOString(),
          source: {
            workspacePath,
            folderName,
            fileName: file,
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
          tags: inferImageTags(file),
          usage: inferImageUsage(file),
        };

        fs.writeFileSync(outputPath, JSON.stringify(doc, null, 2), 'utf8');
        results.push({
          file,
          status: 'indexed',
          width: metadata.width,
          height: metadata.height,
          outputPath,
        });
        continue;
      }

      const { extractPresentationStructure, extractProductMasterStructure, extractRawText } = await import('@/lib/extractors');
      const presentation = ['.ppt', '.pptx'].includes(ext)
        ? await extractPresentationStructure(filePath)
        : null;
      if (presentation) {
        const { ensurePresentationPreviews } = await import('@/lib/presentationPreview');
        await ensurePresentationPreviews(folderName, file, presentation.slides.length, force);
      }
      const productMaster = ['.xls', '.xlsx'].includes(ext)
        ? extractProductMasterStructure(filePath)
        : null;
      const rawText = normalizeText(presentation?.text || productMaster?.text || await extractRawText(filePath));
      const promptPath = path.join(targetFolder, 'prompt.txt');
      const prompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : '';
      const manualChapters = !presentation && !productMaster && folderName.startsWith('03_')
        ? buildManualChapters(rawText)
        : [];
      const chunks = presentation
        ? presentation.slides.map((slide: any) => ({
            id: slide.id,
            slideNumber: slide.slideNumber,
            charStart: 0,
            charEnd: slide.text.length,
            text: slide.text,
          }))
        : productMaster
          ? productMaster.records.map((record: any) => ({
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
          : manualChapters.length
            ? manualChapters.map((chapter) => ({
                id: chapter.id,
                title: chapter.title,
                chapterType: chapter.chapterType,
                charStart: chapter.charStart,
                charEnd: chapter.charEnd,
                text: chapter.text,
              }))
            : chunkText(rawText);
      const mlfbCandidates = extractMlfbCandidates(rawText);

      const doc = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        source: {
          workspacePath,
          folderName,
          fileName: file,
          extension: path.extname(file).toLowerCase(),
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          sha256: fileHash,
        },
        prompt: {
          fileName: 'prompt.txt',
          text: prompt,
        },
        stats: {
          chars: rawText.length,
          chunkCount: chunks.length,
          ...(manualChapters.length ? { chapterCount: manualChapters.length } : {}),
          ...(presentation?.stats || {}),
          ...(productMaster?.stats || {}),
        },
        extracted: {
          mlfbCandidates,
          headingCandidates: extractHeadingCandidates(rawText),
        },
        chunks,
        ...(manualChapters.length ? { chapters: manualChapters } : {}),
        ...(presentation ? { slides: presentation.slides } : {}),
        ...(productMaster ? { records: productMaster.records, kind: 'product_master' } : {}),
      };

      fs.writeFileSync(outputPath, JSON.stringify(doc, null, 2), 'utf8');
      results.push({
        file,
        status: 'indexed',
        chars: rawText.length,
        chunks: chunks.length,
        mlfbCandidates: mlfbCandidates.length,
        outputPath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to index file';
      const unsupported = message.includes('Unsupported file extension');
      results.push({ file, status: unsupported ? 'unsupported' : 'error', message });
    }
  }

  const { buildFolderCatalog } = await import('@/lib/materialCatalog');
  buildFolderCatalog(folderName);
  return results;
}

function inferImageTags(fileName: string) {
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

function inferImageUsage(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.includes('front') || fileName.includes('正面')) return '适合作为产品介绍页主图或模块识别图';
  if (lower.includes('family')) return '适合作为产品家族概览页图片';
  if (lower.includes('station')) return '适合作为系统/站点概览页图片';
  if (lower.includes('side')) return '适合作为结构或安装说明页图片';
  return '适合作为销售胶片中的产品素材图';
}
