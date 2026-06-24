import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { getWorkspacePath } from '@/lib/fileSystem';
import { ensurePresentationPreviews, getPresentationPreviewPath } from '@/lib/presentationPreview';

const FAVORITES_DIR = path.join(process.cwd(), 'data', 'ppt-selections');
const FAVORITES_INDEX = path.join(FAVORITES_DIR, 'index.json');
const FAVORITES_IMAGE_DIR = path.join(FAVORITES_DIR, 'images');

type SelectionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TextShape = {
  text: string;
  bbox: SelectionBox;
};

function safeId(value: string) {
  return value
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function clamp01(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalizeBox(box: SelectionBox): SelectionBox {
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  const width = Math.max(0.01, Math.min(1 - x, clamp01(box.width)));
  const height = Math.max(0.01, Math.min(1 - y, clamp01(box.height)));
  return { x, y, width, height };
}

function xmlText(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function overlapRatio(a: SelectionBox, b: SelectionBox) {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const overlapWidth = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const overlapHeight = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const overlapArea = overlapWidth * overlapHeight;
  const bArea = b.width * b.height || 1;
  return overlapArea / bArea;
}

function readSlideSize(zip: AdmZip) {
  const xml = zip.getEntry('ppt/presentation.xml')?.getData().toString('utf8') || '';
  const match = xml.match(/<p:sldSz[^>]*\scx="(\d+)"[^>]*\scy="(\d+)"/);
  return {
    width: Number(match?.[1]) || 12192000,
    height: Number(match?.[2]) || 6858000,
  };
}

function extractTextShapes(pptxPath: string, slideNumber: number): TextShape[] {
  const zip = new AdmZip(pptxPath);
  const slideSize = readSlideSize(zip);
  const xml = zip.getEntry(`ppt/slides/slide${slideNumber}.xml`)?.getData().toString('utf8') || '';
  const shapes = [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)].map(match => match[0]);

  return shapes.flatMap(shapeXml => {
    if (!shapeXml.includes('<p:txBody')) return [];
    const text = [...shapeXml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
      .map(match => xmlText(match[1]))
      .filter(Boolean)
      .join(' ');
    if (!text) return [];

    const off = shapeXml.match(/<a:off[^>]*\sx="(-?\d+)"[^>]*\sy="(-?\d+)"/);
    const ext = shapeXml.match(/<a:ext[^>]*\scx="(\d+)"[^>]*\scy="(\d+)"/);
    if (!off || !ext) return [];

    return [{
      text,
      bbox: {
        x: Number(off[1]) / slideSize.width,
        y: Number(off[2]) / slideSize.height,
        width: Number(ext[1]) / slideSize.width,
        height: Number(ext[2]) / slideSize.height,
      },
    }];
  });
}

function readFavorites() {
  if (!fs.existsSync(FAVORITES_INDEX)) return [];
  const parsed = JSON.parse(fs.readFileSync(FAVORITES_INDEX, 'utf8'));
  return Array.isArray(parsed?.cards) ? parsed.cards : [];
}

function writeFavorites(cards: any[]) {
  fs.mkdirSync(FAVORITES_DIR, { recursive: true });
  fs.writeFileSync(FAVORITES_INDEX, JSON.stringify({ schemaVersion: 1, cards }, null, 2), 'utf8');
}

export function readPptSelectionCards(folderName?: string) {
  return readFavorites()
    .filter((card: any) => !folderName || card.folderName === folderName)
    .map((card: any) => ({
      ...card,
      assetUrl: `/api/assets/ppt-selection?id=${encodeURIComponent(card.id)}`,
    }));
}

export async function createPptSelectionFavorite(input: {
  folderName: string;
  sourceFile: string;
  slideNumber: number;
  slideCount?: number;
  bbox: SelectionBox;
}) {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) throw new Error('Workspace path is not configured.');

  const folderName = String(input.folderName || '');
  const sourceFile = String(input.sourceFile || '');
  const slideNumber = Number(input.slideNumber);
  const slideCount = Number(input.slideCount || 0);
  if (!folderName || !sourceFile || !Number.isInteger(slideNumber) || slideNumber < 1) {
    throw new Error('Invalid PPT selection request.');
  }

  const workspaceRoot = path.resolve(workspacePath);
  const sourcePath = path.resolve(workspacePath, folderName, sourceFile);
  if (!sourcePath.startsWith(workspaceRoot) || !fs.existsSync(sourcePath)) {
    throw new Error('Presentation source not found.');
  }

  const bbox = normalizeBox(input.bbox);
  const previewResult = await ensurePresentationPreviews(folderName, sourceFile, slideCount);
  const previewPath = getPresentationPreviewPath(folderName, sourceFile, slideNumber);
  if (!previewResult.available || !fs.existsSync(previewPath)) {
    throw new Error(previewResult.error || 'Slide preview is unavailable.');
  }

  fs.mkdirSync(FAVORITES_IMAGE_DIR, { recursive: true });
  const id = `${safeId(sourceFile)}-slide-${String(slideNumber).padStart(4, '0')}-selection-${Date.now()}`;
  const imagePath = path.join(FAVORITES_IMAGE_DIR, `${id}.png`);
  const metadata = await sharp(previewPath).metadata();
  const imageWidth = metadata.width || 1280;
  const imageHeight = metadata.height || 720;
  await sharp(previewPath)
    .extract({
      left: Math.max(0, Math.floor(bbox.x * imageWidth)),
      top: Math.max(0, Math.floor(bbox.y * imageHeight)),
      width: Math.max(1, Math.min(imageWidth, Math.round(bbox.width * imageWidth))),
      height: Math.max(1, Math.min(imageHeight, Math.round(bbox.height * imageHeight))),
    })
    .png()
    .toFile(imagePath);

  const selectedTexts = extractTextShapes(sourcePath, slideNumber)
    .filter(shape => overlapRatio(bbox, shape.bbox) >= 0.25)
    .map(shape => shape.text)
    .filter(Boolean);
  const uniqueTexts = [...new Set(selectedTexts)];
  const title = uniqueTexts[0]?.slice(0, 80) || `PPT 第 ${slideNumber} 页精选区域`;
  const body = uniqueTexts.join('\n');

  const card = {
    id,
    type: 'ppt_selection',
    stage: 'favorite',
    title,
    subtitle: `第 ${slideNumber} 页框选内容`,
    body: body || '框选区域未识别到可编辑文字，将以图片方式保留视觉内容。',
    sourceFile,
    folderName,
    chunkIds: [`slide_${String(slideNumber).padStart(4, '0')}`],
    slideNumber,
    slideCount,
    bbox,
    imagePath,
    assetUrl: `/api/assets/ppt-selection?id=${encodeURIComponent(id)}`,
    editableText: uniqueTexts,
    sections: uniqueTexts.length
      ? [{
          id: 'editable_text',
          label: '框选区域可编辑文字',
          type: 'ppt_selection',
          items: uniqueTexts,
        }]
      : [],
  };

  const cards = readFavorites().filter((item: any) => item.id !== id);
  cards.unshift(card);
  writeFavorites(cards);
  return card;
}

export function getPptSelectionImagePath(id: string) {
  const card = readFavorites().find((item: any) => item.id === id);
  if (!card?.imagePath) return null;
  const imagePath = path.resolve(card.imagePath);
  const imageRoot = path.resolve(FAVORITES_IMAGE_DIR);
  if (!imagePath.startsWith(imageRoot) || !fs.existsSync(imagePath)) return null;
  return imagePath;
}
