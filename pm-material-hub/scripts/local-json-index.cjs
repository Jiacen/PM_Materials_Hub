const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const pdf = require('pdf-parse');
const officeParser = require('officeparser');
const sharp = require('sharp');

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
  const matches = text.match(/\b6ES7[\dA-Z\s*-]+(?:-[\dA-Z*-]+){0,2}\b/g) || [];
  return [...new Set(matches.map((value) => value.replace(/\s+/g, ' ').trim()))]
    .filter((value) => /^6ES7/.test(value))
    .sort();
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

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    const data = await pdf(fs.readFileSync(filePath));
    return {
      text: data.text || '',
      stats: { pages: data.numpages || null },
    };
  }
  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = xlsx.readFile(filePath);
    let text = '';
    for (const sheetName of workbook.SheetNames) {
      const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
      text += `\n\n--- Sheet: ${sheetName} ---\n`;
      text += rows.map((row) => row.join(' | ')).join('\n');
    }
    return { text, stats: { sheets: workbook.SheetNames } };
  }
  if (['.docx', '.doc', '.pptx', '.ppt'].includes(ext)) {
    return {
      text: await officeParser.parseOfficeAsync(filePath),
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
      chunkCount: Math.ceil(text.length / 5600),
    },
    extracted: {
      mlfbCandidates: extractMlfbCandidates(text),
      headingCandidates: extractHeadingCandidates(text),
    },
    chunks: chunkText(text),
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
