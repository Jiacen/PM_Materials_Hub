import fs from 'fs';
import path from 'path';
import { getWorkspacePath } from '@/lib/fileSystem';

const LOCAL_ROOT = path.join(process.cwd(), 'data', 'local-json-indexes');
const REFINED_ROOT = path.join(process.cwd(), 'data', 'indexes');
const CATALOG_FILE = '_folder.catalog.json';

function resolveFolder(root: string, folderName: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, folderName);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Invalid folder path');
  }
  return resolved;
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function uniqueStrings(values: unknown[], limit = 30) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].slice(0, limit);
}

function refinedCards(ai: any) {
  return Array.isArray(ai?.products) ? ai.products : [];
}

function sourceHashFromRefined(ai: any) {
  return String(ai?._index?.sourceSha256 || '');
}

export function buildFolderCatalog(folderName: string) {
  const localDir = resolveFolder(LOCAL_ROOT, folderName);
  const refinedDir = resolveFolder(REFINED_ROOT, folderName);
  const workspacePath = getWorkspacePath();
  if (!fs.existsSync(localDir)) return null;

  const materials = fs.readdirSync(localDir)
    .filter(file => file.endsWith('.raw.json') || file.endsWith('.image.json'))
    .map(file => {
      const rawPath = path.join(localDir, file);
      const raw = readJson(rawPath);
      const sourceFile = String(raw?.source?.fileName || file.replace(/\.(raw|image)\.json$/, ''));
      const refinedFile = `${sourceFile}.meta.json`;
      const refinedPath = path.join(refinedDir, refinedFile);
      const ai = fs.existsSync(refinedPath) ? readJson(refinedPath) : null;
      const cards = refinedCards(ai);
      const sourceSha256 = String(raw?.source?.sha256 || '');
      const refinedSha256 = sourceHashFromRefined(ai);
      const sourcePath = workspacePath ? path.join(workspacePath, folderName, sourceFile) : '';
      const sourcePresent = Boolean(sourcePath && fs.existsSync(sourcePath));
      const sourceStat = sourcePresent ? fs.statSync(sourcePath) : null;
      const localIndexStatus = !sourcePresent
        ? 'orphaned'
        : sourceStat?.mtimeMs === raw?.source?.mtimeMs && sourceStat?.size === raw?.source?.size
          ? 'ready'
          : 'stale';
      const refinedStatus = !ai
        ? 'missing'
        : refinedSha256 && refinedSha256 === sourceSha256
          ? 'ready'
          : 'stale';
      const slides = Array.isArray(raw?.slides) ? raw.slides : [];

      return {
        sourceFile,
        kind: slides.length ? 'presentation' : raw?.kind || (file.endsWith('.image.json') ? 'image' : 'document'),
        extension: raw?.source?.extension || path.extname(sourceFile).toLowerCase(),
        sourceSha256,
        sourcePresent,
        localIndexStatus,
        sourceModifiedAt: raw?.source?.mtimeMs || null,
        rawIndexFile: file,
        refinedIndexFile: ai ? refinedFile : null,
        refinedStatus,
        refinedBy: ai?._index?.finalizedBy || (ai ? 'legacy-unverified' : null),
        slideCount: slides.length,
        cardCount: cards.length,
        previewKind: slides.length ? 'native-slide-png' : null,
        topics: uniqueStrings([
          ...cards.map((card: any) => card.product_name),
          ...cards.map((card: any) => card.item_type),
          ...slides.slice(0, 12).map((slide: any) => slide.title),
        ]),
        cardTypes: uniqueStrings(cards.map((card: any) => card.item_type)),
        evidenceIds: uniqueStrings(cards.flatMap((card: any) =>
          Array.isArray(card?.evidence_chunk_ids) ? card.evidence_chunk_ids : []
        ), 100),
      };
    })
    .sort((a, b) => a.sourceFile.localeCompare(b.sourceFile, 'zh-CN'));

  const catalog = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    folderName,
    materialCount: materials.length,
    totals: {
      slides: materials.reduce((sum, item) => sum + item.slideCount, 0),
      refinedCards: materials.reduce((sum, item) => sum + item.cardCount, 0),
      refinedReady: materials.filter(item => item.refinedStatus === 'ready').length,
      refinedMissing: materials.filter(item => item.refinedStatus === 'missing').length,
      refinedStale: materials.filter(item => item.refinedStatus === 'stale').length,
      localIndexStale: materials.filter(item => item.localIndexStatus === 'stale').length,
      orphaned: materials.filter(item => item.localIndexStatus === 'orphaned').length,
    },
    materials,
  };

  fs.writeFileSync(path.join(localDir, CATALOG_FILE), JSON.stringify(catalog, null, 2), 'utf8');
  return catalog;
}

export function readFolderCatalog(folderName: string) {
  const catalogPath = path.join(resolveFolder(LOCAL_ROOT, folderName), CATALOG_FILE);
  return fs.existsSync(catalogPath) ? readJson(catalogPath) : buildFolderCatalog(folderName);
}

export function readMaterialContext(options: {
  folderName: string;
  sourceFile?: string;
  evidenceIds?: string[];
  slideNumbers?: number[];
  query?: string;
  maxSlides?: number;
  maxMaterials?: number;
  maxCards?: number;
  includeRefined?: boolean;
}) {
  const {
    folderName,
    sourceFile,
    evidenceIds = [],
    slideNumbers = [],
    query = '',
    maxSlides = 8,
    maxMaterials = 3,
    maxCards = 12,
    includeRefined = true,
  } = options;
  const localDir = resolveFolder(LOCAL_ROOT, folderName);
  const refinedDir = resolveFolder(REFINED_ROOT, folderName);
  if (!fs.existsSync(localDir)) throw new Error('Folder index not found');

  const rawFiles = fs.readdirSync(localDir).filter(file => file.endsWith('.raw.json'));
  const selectedFiles = sourceFile
    ? rawFiles.filter(file => readJson(path.join(localDir, file))?.source?.fileName === sourceFile)
    : rawFiles;
  const normalizedQuery = query.trim().toLowerCase();
  const queryTerms = uniqueStrings(
    normalizedQuery
      .split(/[\s,，。；;、:：!?！？()[\]{}]+/)
      .flatMap(term => term.length > 4 && /[\u4e00-\u9fa5]/.test(term)
        ? [term, ...Array.from({ length: term.length - 1 }, (_, index) => term.slice(index, index + 2))]
        : [term]),
    20,
  );
  const evidenceSet = new Set(evidenceIds);
  const slideNumberSet = new Set(slideNumbers.map(Number));

  const workspacePath = getWorkspacePath();
  return selectedFiles.map(file => {
    const raw = readJson(path.join(localDir, file));
    const currentSourceFile = raw?.source?.fileName || file.replace(/\.raw\.json$/, '');
    const sourcePath = workspacePath ? path.join(workspacePath, folderName, currentSourceFile) : '';
    const sourcePresent = Boolean(sourcePath && fs.existsSync(sourcePath));
    const slides = Array.isArray(raw?.slides) ? raw.slides : [];
    const chunks = Array.isArray(raw?.chunks) ? raw.chunks : [];
    const candidates = slides.length ? slides : chunks;
    const ranked: any[] = candidates
      .map((item: any) => {
        const id = String(item?.id || '');
        const text = `${item?.title || ''}\n${item?.text || ''}`;
        let score = 0;
        if (evidenceSet.has(id)) score += 100;
        if (slideNumberSet.has(Number(item?.slideNumber))) score += 100;
        const normalizedText = text.toLowerCase();
        if (normalizedQuery && normalizedText.includes(normalizedQuery)) score += 30;
        score += queryTerms.filter(term => term.length >= 2 && normalizedText.includes(term)).length * 4;
        return { item, score };
      })
      .filter(({ score }: { score: number }) =>
        evidenceSet.size || slideNumberSet.size || normalizedQuery ? score > 0 : true
      )
      .sort((a: any, b: any) => b.score - a.score || Number(a.item?.slideNumber || 0) - Number(b.item?.slideNumber || 0))
      .slice(0, Math.max(1, Math.min(maxSlides, 20)))
      .map(({ item }: { item: any }) => item);

    const refinedPath = path.join(refinedDir, `${currentSourceFile}.meta.json`);
    const ai = includeRefined && fs.existsSync(refinedPath) ? readJson(refinedPath) : null;
    const sourceSha256 = String(raw?.source?.sha256 || '');
    const refinedStatus = !ai
      ? 'missing'
      : sourceHashFromRefined(ai) === sourceSha256
        ? 'ready'
        : 'stale';

    return {
      source: raw.source,
      stats: raw.stats,
      sourcePresent,
      refinedStatus,
      refinedCards: refinedStatus === 'ready' ? refinedCards(ai).slice(0, Math.max(1, Math.min(maxCards, 30))) : [],
      evidence: ranked,
      relevanceScore: ranked.reduce((sum: number, item: any) => {
        const text = `${item?.title || ''}\n${item?.text || ''}`.toLowerCase();
        return sum + queryTerms.filter(term => term.length >= 2 && text.includes(term)).length;
      }, 0),
    };
  })
    .filter(material => material.sourcePresent || Boolean(sourceFile))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, Math.max(1, Math.min(maxMaterials, 10)))
    .map(({ relevanceScore, ...material }) => material);
}
