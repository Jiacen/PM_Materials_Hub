import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getWorkspacePath } from '@/lib/fileSystem';

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
  const matches = text.match(/\b6ES7[\dA-Z\s*-]+(?:-[\dA-Z*-]+){0,2}\b/g) || [];
  return [...new Set(matches.map((value) => value.replace(/\s+/g, ' ').trim()))]
    .filter((value) => /^6ES7/.test(value))
    .sort();
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
    .filter((file) => file.toLowerCase() !== 'prompt.txt');

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

      const { extractRawText } = await import('@/lib/extractors');
      const rawText = normalizeText(await extractRawText(filePath));
      const promptPath = path.join(targetFolder, 'prompt.txt');
      const prompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : '';
      const chunks = chunkText(rawText);
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
        },
        extracted: {
          mlfbCandidates,
          headingCandidates: extractHeadingCandidates(rawText),
        },
        chunks,
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
