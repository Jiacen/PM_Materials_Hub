import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import AdmZip from 'adm-zip';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const STYLE_ROOT = path.join(process.cwd(), 'data', 'template-style-index');

export type TemplateStyle = {
  id: string;
  sourceFile: string;
  slideNumber: number;
  title: string;
  textSample: string;
  layoutFamily: string;
  visualTone: 'dark' | 'light';
  imageCount: number;
  textLength: number;
  previewPath?: string;
};

export type TemplateStyleLibrary = {
  sourceFile: string;
  generatedAt: string;
  styles: TemplateStyle[];
};

function templateDir() {
  return path.resolve(process.cwd(), '..', 'Slides_Template');
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g, '-').slice(0, 120);
}

function stripXml(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSlideTexts(zip: AdmZip, slideNumber: number) {
  const entry = zip.getEntry(`ppt/slides/slide${slideNumber}.xml`);
  const xml = entry?.getData().toString('utf8') || '';
  const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
    .map(match => stripXml(match[1]))
    .filter(Boolean);
  return {
    xml,
    texts,
    text: texts.join(' '),
    title: texts.find(text => text.length >= 3) || `Template slide ${slideNumber}`,
  };
}

function countSlideImages(zip: AdmZip, slideNumber: number) {
  const relEntry = zip.getEntry(`ppt/slides/_rels/slide${slideNumber}.xml.rels`);
  const relXml = relEntry?.getData().toString('utf8') || '';
  return (relXml.match(/Target="\.\.\/media\//g) || []).length;
}

function classifyLayout(textLength: number, imageCount: number, title: string) {
  const lower = title.toLowerCase();
  if (imageCount >= 1 && textLength < 120) return 'image-focus';
  if (imageCount >= 1 && textLength < 420) return 'product-showcase';
  if (/case|案例|客户|项目|success/i.test(lower)) return 'case-story';
  if (/compare|对比|vs\.?|竞争|竞品/i.test(lower)) return 'comparison';
  if (/agenda|目录|overview|总览/i.test(lower)) return 'section-overview';
  if (textLength > 700) return 'dense-technical';
  return 'headline-bullets';
}

async function detectPreviewTone(previewPath: string): Promise<'dark' | 'light'> {
  try {
    const stats = await sharp(previewPath).resize({ width: 64, withoutEnlargement: true }).stats();
    const avg = stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
    return avg < 120 ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

async function renderTemplatePreviews(templatePath: string, outputDir: string) {
  fs.mkdirSync(outputDir, { recursive: true });
  const existing = fs.readdirSync(outputDir).filter(file => /^slide-\d+\.png$/i.test(file));
  if (existing.length > 0) return;

  if (process.platform !== 'win32') return;
  const scriptPath = path.join(process.cwd(), 'scripts', 'render-ppt-previews.ps1');
  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    '-InputPath', templatePath,
    '-OutputDirectory', outputDir,
  ], {
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
}

export async function buildTemplateStyleLibrary(force = false): Promise<TemplateStyleLibrary> {
  const dir = templateDir();
  const templateFile = fs.existsSync(dir)
    ? fs.readdirSync(dir).find(file => file.toLowerCase().endsWith('.pptx'))
    : '';
  if (!templateFile) {
    return { sourceFile: '', generatedAt: new Date().toISOString(), styles: [] };
  }

  fs.mkdirSync(STYLE_ROOT, { recursive: true });
  const indexPath = path.join(STYLE_ROOT, 'index.json');
  if (!force && fs.existsSync(indexPath)) {
    const current = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (current?.sourceFile === templateFile && Array.isArray(current?.styles)) return current;
  }

  const templatePath = path.join(dir, templateFile);
  const previewDir = path.join(STYLE_ROOT, safeSegment(templateFile));
  try {
    await renderTemplatePreviews(templatePath, previewDir);
  } catch {
    // Preview rendering is helpful, but XML-derived styles are still usable without it.
  }

  const zip = new AdmZip(templatePath);
  const slideNumbers = zip.getEntries()
    .map(entry => entry.entryName.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
    .sort((a, b) => a - b);

  const styles: TemplateStyle[] = [];
  for (const slideNumber of slideNumbers) {
    const { title, text } = extractSlideTexts(zip, slideNumber);
    const imageCount = countSlideImages(zip, slideNumber);
    const previewPath = path.join(previewDir, `slide-${slideNumber}.png`);
    const visualTone = fs.existsSync(previewPath) ? await detectPreviewTone(previewPath) : 'light';
    const textLength = text.length;
    styles.push({
      id: `template-${String(slideNumber).padStart(3, '0')}`,
      sourceFile: templateFile,
      slideNumber,
      title,
      textSample: text.slice(0, 360),
      layoutFamily: classifyLayout(textLength, imageCount, title),
      visualTone,
      imageCount,
      textLength,
      previewPath: fs.existsSync(previewPath) ? previewPath : undefined,
    });
  }

  const library = { sourceFile: templateFile, generatedAt: new Date().toISOString(), styles };
  fs.writeFileSync(indexPath, JSON.stringify(library, null, 2), 'utf8');
  return library;
}

export function pickTemplateStyles(
  library: TemplateStyleLibrary,
  options: { prefersDark?: boolean; hasImage?: boolean; itemCount?: number; wantsCase?: boolean },
) {
  const preferredTone = options.prefersDark ? 'dark' : 'light';
  const usable = library.styles.filter(style => style.visualTone === preferredTone);
  const pool = usable.length ? usable : library.styles;
  const scored = pool.map(style => {
    let score = 0;
    if (style.visualTone === preferredTone) score += 4;
    if (options.hasImage && ['product-showcase', 'image-focus'].includes(style.layoutFamily)) score += 4;
    if (options.wantsCase && style.layoutFamily === 'case-story') score += 4;
    if ((options.itemCount || 0) >= 3 && ['section-overview', 'headline-bullets'].includes(style.layoutFamily)) score += 2;
    if (style.layoutFamily === 'dense-technical') score -= 2;
    return { ...style, score };
  }).sort((a, b) => b.score - a.score || a.slideNumber - b.slideNumber);

  return scored.slice(0, 8).map(({ score, ...style }) => style);
}
