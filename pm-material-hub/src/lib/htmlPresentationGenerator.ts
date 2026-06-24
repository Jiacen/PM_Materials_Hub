import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { llmService } from './llmService';
import { getWorkspacePath } from './fileSystem';
import { ensurePresentationPreviews, getPresentationPreviewPath } from './presentationPreview';
import { buildTemplateStyleLibrary, pickTemplateStyles, type TemplateStyle } from './templateStyleLibrary';
import { getPptSelectionImagePath } from './pptSelectionFavorites';

type DeckItem = {
  id?: string;
  deckId?: string;
  type?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  sourceFile?: string;
  folderName?: string;
  slotId?: string | null;
  assetUrl?: string;
  slideNumber?: number;
  slideCount?: number;
  tags?: string[];
  chunkIds?: string[];
  selectedSections?: Array<{ label?: string; items?: string[] }>;
  sections?: Array<{ label?: string; items?: string[] }>;
};

type DeckPage = {
  id?: string;
  title?: string;
  layout?: string;
  items?: DeckItem[];
};

type EmbeddedItem = DeckItem & {
  imageDataUri?: string;
};

type EmbeddedPage = Omit<DeckPage, 'items'> & {
  items: EmbeddedItem[];
};

type TemplateReference = {
  fileName: string;
  colors: string[];
  note: string;
};

type GenerationBlueprint = {
  title?: string;
  pages?: Array<{
    title?: string;
    kicker?: string;
    headline?: string;
    layout?: string;
    layoutFamily?: string;
    visualTone?: 'dark' | 'light';
    referenceSlideId?: string;
    blocks?: Array<{
      deckId?: string;
      slotId?: string | null;
      title?: string;
      emphasis?: 'hero' | 'support' | 'evidence';
      bullets?: string[];
      note?: string;
    }>;
  }>;
};

type BlueprintPage = NonNullable<GenerationBlueprint['pages']>[number];
type BlueprintBlock = NonNullable<BlueprintPage['blocks']>[number];

export type HtmlPresentationResult = {
  html: string;
  fileName: string;
  finalizedBy: 'llm' | 'deterministic-fallback';
  warnings: string[];
};

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compact(value: unknown, maxLength = 2200) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function hasCjk(value: unknown) {
  return /[\u3400-\u9fff]/.test(String(value ?? ''));
}

function itemHasCjk(item: DeckItem) {
  return hasCjk([
    item.title,
    item.subtitle,
    item.body,
    ...(item.sections || []).flatMap(section => section.items || []),
    ...(item.selectedSections || []).flatMap(section => section.items || []),
  ].join(' '));
}

function preferSourceLanguage(generated: unknown, source: unknown) {
  const generatedText = compact(generated, 220);
  const sourceText = compact(source, 220);
  if (sourceText && hasCjk(sourceText) && generatedText && !hasCjk(generatedText)) return sourceText;
  return generatedText || sourceText;
}

function wantsDarkTheme(value: string) {
  return /深色|暗色|黑底|深底|dark|black background|dark background/i.test(value || '');
}

function wantsCaseStyle(value: string) {
  return /案例|客户|项目|case|success story/i.test(value || '');
}

function splitBullets(item: DeckItem) {
  const selected = Array.isArray(item.selectedSections)
    ? item.selectedSections.flatMap(section => section.items || [])
    : [];
  const structured = selected.length
    ? selected
    : Array.isArray(item.sections)
      ? item.sections.flatMap(section => section.items || []).slice(0, 8)
      : [];
  const bodyParts = String(item.body || '')
    .split(/\n|；|;| \u00b7 |\s-\s/)
    .map(part => part.trim())
    .filter(Boolean);
  return [...structured, ...bodyParts].map(part => compact(part, 180)).filter(Boolean).slice(0, 8);
}

function mergeBullets(primary: string[] | undefined, item: DeckItem, limit = 6) {
  const seen = new Set<string>();
  const merged: string[] = [];
  const sourceUsesChinese = itemHasCjk(item);
  const primarySet = new Set(primary || []);
  for (const value of [...(primary || []), ...splitBullets(item)]) {
    const text = compact(value, 180);
    if (sourceUsesChinese && primarySet.has(value) && !hasCjk(text)) continue;
    const key = text.replace(/\s+/g, '').toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    merged.push(text);
    if (merged.length >= limit) break;
  }
  return merged;
}

function normalizePages(pages: DeckPage[]) {
  return pages
    .filter(page => Array.isArray(page.items) && page.items.length > 0)
    .map((page, pageIndex) => ({
      id: page.id || `page-${pageIndex + 1}`,
      title: compact(page.title || `Page ${pageIndex + 1}`, 80),
      layout: page.layout || 'single',
      items: (page.items || []).map((item, itemIndex) => ({
        id: item.id,
        deckId: item.deckId || `${page.id || pageIndex}-${item.id || itemIndex}`,
        type: item.type || 'document',
        title: compact(item.title || `Block ${itemIndex + 1}`, 120),
        subtitle: compact(item.subtitle || '', 160),
        body: compact(item.body || '', 900),
        sourceFile: compact(item.sourceFile || '', 160),
        folderName: item.folderName || '',
        slotId: item.slotId || null,
        assetUrl: item.assetUrl || '',
        slideNumber: item.slideNumber,
        slideCount: item.slideCount,
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 8) : [],
        chunkIds: Array.isArray(item.chunkIds) ? item.chunkIds.slice(0, 8) : [],
        selectedSections: Array.isArray(item.selectedSections) ? item.selectedSections : undefined,
        sections: Array.isArray(item.sections) ? item.sections.slice(0, 8) : undefined,
      })),
    }));
}

function readTemplateReference(): TemplateReference {
  const templateDir = path.resolve(process.cwd(), '..', 'Slides_Template');
  const fallback = {
    fileName: 'template_Business graphic.pptx',
    colors: ['#009999', '#0f2d3a', '#eef3f4', '#f4a100'],
    note: 'Fallback Siemens-style business presentation palette.',
  };
  if (!fs.existsSync(templateDir)) return fallback;

  const templateFile = fs.readdirSync(templateDir).find(file => file.toLowerCase().endsWith('.pptx'));
  if (!templateFile) return fallback;

  try {
    const zip = new AdmZip(path.join(templateDir, templateFile));
    const themeEntry = zip.getEntry('ppt/theme/theme1.xml');
    const themeXml = themeEntry?.getData().toString('utf8') || '';
    const colors = [...themeXml.matchAll(/<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/g)]
      .map(match => `#${match[1].toUpperCase()}`);
    return {
      fileName: templateFile,
      colors: [...new Set(colors)].slice(0, 10),
      note: colors.length ? 'Theme colors extracted from Slides_Template.' : fallback.note,
    };
  } catch {
    return { ...fallback, fileName: templateFile };
  }
}

function contentTypeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function imageFileToDataUri(filePath: string, mode: 'image' | 'slide') {
  if (mode === 'slide') {
    const data = fs.readFileSync(filePath);
    return `data:image/png;base64,${data.toString('base64')}`;
  }

  const image = sharp(filePath, { limitInputPixels: false });
  const metadata = await image.metadata();
  const format = metadata.format === 'png' ? 'png' : 'jpeg';
  const buffer = format === 'png'
    ? await image.resize({ width: 1800, withoutEnlargement: true }).png().toBuffer()
    : await image.resize({ width: 1800, withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
  return `data:image/${format};base64,${buffer.toString('base64')}`;
}

async function embedAsset(item: DeckItem, warnings: string[]) {
  if (!item.assetUrl) return undefined;
  const url = new URL(item.assetUrl, 'http://local');

  if (url.pathname === '/api/assets/slide-preview') {
    const folderName = url.searchParams.get('folderName') || item.folderName || '';
    const sourceFile = url.searchParams.get('sourceFile') || item.sourceFile || '';
    const slideNumber = Number(url.searchParams.get('slideNumber') || item.slideNumber || 0);
    const slideCount = Number(url.searchParams.get('slideCount') || item.slideCount || 0);
    await ensurePresentationPreviews(folderName, sourceFile, slideCount);
    const previewPath = getPresentationPreviewPath(folderName, sourceFile, slideNumber);
    if (!fs.existsSync(previewPath)) {
      warnings.push(`Slide preview unavailable: ${sourceFile} #${slideNumber}`);
      return undefined;
    }
    return imageFileToDataUri(previewPath, 'slide');
  }

  if (url.pathname === '/api/assets/image') {
    const workspacePath = getWorkspacePath();
    const folderName = url.searchParams.get('folderName') || item.folderName || '';
    const fileName = url.searchParams.get('fileName') || item.sourceFile || '';
    if (!workspacePath || !folderName || !fileName) return undefined;
    const workspaceRoot = path.resolve(workspacePath);
    const filePath = path.resolve(workspacePath, folderName, fileName);
    if (!filePath.startsWith(workspaceRoot) || !fs.existsSync(filePath)) {
      warnings.push(`Image unavailable: ${fileName}`);
      return undefined;
    }
    return imageFileToDataUri(filePath, contentTypeFromPath(filePath) === 'image/png' ? 'image' : 'image');
  }

  if (url.pathname === '/api/assets/ppt-selection') {
    const id = url.searchParams.get('id') || item.id || '';
    const imagePath = getPptSelectionImagePath(id);
    if (!imagePath) {
      warnings.push(`PPT selection image unavailable: ${id}`);
      return undefined;
    }
    return imageFileToDataUri(imagePath, 'slide');
  }

  return undefined;
}

async function embedPageAssets(pages: ReturnType<typeof normalizePages>) {
  const warnings: string[] = [];
  const embeddedPages: EmbeddedPage[] = [];
  for (const page of pages) {
    const items: EmbeddedItem[] = [];
    for (const item of page.items) {
      items.push({ ...item, imageDataUri: await embedAsset(item, warnings) });
    }
    embeddedPages.push({ ...page, items });
  }
  return { pages: embeddedPages, warnings };
}

async function buildBlueprint(
  pages: EmbeddedPage[],
  template: TemplateReference,
  candidateStyles: TemplateStyle[],
  generationInstruction = '',
): Promise<{ blueprint: GenerationBlueprint; finalizedBy: 'llm' | 'deterministic-fallback'; warning?: string }> {
  const forcedTone = wantsDarkTheme(generationInstruction) ? 'dark' : undefined;
  const payload = JSON.stringify({
    template,
    candidateTemplateStyles: candidateStyles.map(style => ({
      id: style.id,
      slideNumber: style.slideNumber,
      title: style.title,
      layoutFamily: style.layoutFamily,
      visualTone: style.visualTone,
      imageCount: style.imageCount,
      textLength: style.textLength,
      textSample: style.textSample,
    })),
    generationInstruction: compact(generationInstruction, 1200),
    instructions: {
      contentSource: 'Use the workspace pages and cards as the source of truth.',
      layoutSource: 'Preserve each workspace page layout unless a minor hierarchy adjustment improves readability.',
      slideRule: 'Items with type=slide are original PPT pages. Do not rewrite their content. Keep them as full-slide image blocks.',
      styleRule: 'Choose a candidateTemplateStyles item for each generated page and return its id as referenceSlideId. Match its layoutFamily, visualTone, hierarchy, image/text balance, and content density.',
      coverageRule: 'Every input item must appear as a block unless it is explicitly merged with another block from the same page. Blocks must use an existing input deckId only.',
      densityRule: 'For module/product cards, keep 4-6 factual bullets. For certificate cards, include certificate number, report reference, issue date, holder, standards, or certification result when present. For image cards, do not include asset-management captions or usage notes.',
      output: 'Return JSON only. Do not return HTML.',
    },
    pages: pages.map(page => ({
      id: page.id,
      title: page.title,
      layout: page.layout,
      items: page.items.map(item => ({
        deckId: item.deckId,
        type: item.type,
        slotId: item.slotId,
        title: item.title,
        subtitle: item.subtitle,
        body: item.body,
        sourceFile: item.sourceFile,
        bullets: splitBullets(item),
      })),
    })),
  });

  const systemPrompt = `You are generating a business HTML presentation blueprint for product managers.
The final renderer is deterministic, so return concise JSON with this shape:
{
  "title": "deck title",
  "pages": [
    {
      "title": "short page title",
      "kicker": "optional section label",
      "headline": "one clear message",
      "layout": "single|two-columns|left-main-right-stack|two-rows|four-grid|product-showcase|image-focus|case-story|section-overview|headline-bullets",
      "layoutFamily": "one selected candidate layoutFamily",
      "visualTone": "dark|light",
      "referenceSlideId": "one id from candidateTemplateStyles",
      "blocks": [
        {
          "deckId": "must match an input item deckId",
          "slotId": "optional input slotId",
          "title": "short block title",
          "emphasis": "hero|support|evidence",
          "bullets": ["short evidence-backed bullet"]
        }
      ]
    }
  ]
}
Language rule: the final presentation is for Chinese product managers. Write all user-facing title, kicker, headline, and bullets in Simplified Chinese. Preserve product names, model numbers, certificate numbers, standards, and English brand names exactly when they are factual identifiers. Do not translate Chinese source material into English.
Reference the selected Slides_Template page as a concrete design pattern, not only as a color palette.
If the user asks for a dark background, every non-original-PPT generated page MUST use visualTone "dark".
Represent every workspace card. Do not drop low-level evidence cards such as certifications, parameters, comparisons, or customer cases.
For module/product cards, preserve enough concrete facts for a product manager to use the slide: normally 4-6 bullets.
For certificate cards, keep certificate number, report reference, issue date, holder, standards, and certification result when available.
For image cards, treat body text as internal asset guidance; do NOT place usage notes such as "suitable as sales slide product image" in any title or bullet.
Never return a block deckId that is not present in the input payload.
Do not expose source file names, chunk ids, extraction method, image dimensions, or internal card metadata in titles, kicker, body, or bullets.
Rewrite card content into concise presentation copy. Avoid repeating the same sentence as both paragraph and bullet.
Follow the user's generationInstruction when it is present, but do not invent unsupported technical claims.
Do not invent technical claims. Keep all original PPT page items as image-only blocks.`;

  try {
    const blueprint = await llmService.extractInsights(systemPrompt, payload);
    if (!Array.isArray(blueprint?.pages) || blueprint.pages.length === 0) {
      throw new Error('LLM did not return pages.');
    }
    return { blueprint, finalizedBy: 'llm' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LLM generation failed.';
    return {
      finalizedBy: 'deterministic-fallback',
      warning: message,
      blueprint: {
        title: '产品胶片生成预览',
        pages: pages.map(page => ({
          title: page.title,
          headline: page.items[0]?.title || page.title,
          layout: page.items.some(item => item.type === 'image') ? 'product-showcase' : page.layout,
          layoutFamily: page.items.some(item => item.type === 'image') ? 'product-showcase' : 'headline-bullets',
          visualTone: forcedTone || candidateStyles[0]?.visualTone || 'light',
          referenceSlideId: candidateStyles[0]?.id,
          blocks: page.items.map(item => ({
            deckId: item.deckId,
            slotId: item.slotId,
            title: item.title,
            emphasis: item.type === 'slide' ? 'hero' : 'support',
            bullets: splitBullets(item).slice(0, 5),
          })),
        })),
      },
    };
  }
}

function layoutClass(layout?: string) {
  if (layout === 'two-columns') return 'layout-two-columns';
  if (layout === 'left-main-right-stack') return 'layout-left-main-right-stack';
  if (layout === 'two-rows') return 'layout-two-rows';
  if (layout === 'four-grid') return 'layout-four-grid';
  return 'layout-single';
}

function renderTextBlock(item: EmbeddedItem, block: BlueprintBlock) {
  const bullets = (block.bullets?.length ? block.bullets : splitBullets(item)).slice(0, 6);
  return `<article class="block ${block.emphasis === 'hero' ? 'is-hero' : ''}">
    <div class="block-meta">${escapeHtml(item.subtitle || item.type || 'Material')}</div>
    <h3>${escapeHtml(block.title || item.title)}</h3>
    ${item.body ? `<p>${escapeHtml(item.body)}</p>` : ''}
    ${bullets.length ? `<ul>${bullets.map(bullet => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>` : ''}
    <footer>${escapeHtml(item.sourceFile || '')}${item.chunkIds?.length ? ` · ${escapeHtml(item.chunkIds.join(', '))}` : ''}</footer>
  </article>`;
}

function renderImageBlock(item: EmbeddedItem, block: BlueprintBlock) {
  if (item.type === 'slide') {
    return `<article class="slide-image-block">
      ${item.imageDataUri ? `<img src="${item.imageDataUri}" alt="${escapeHtml(item.title)}">` : `<div class="missing-image">Original PPT page preview unavailable</div>`}
    </article>`;
  }

  return `<article class="image-block">
    <div class="image-frame">${item.imageDataUri ? `<img src="${item.imageDataUri}" alt="${escapeHtml(item.title)}">` : `<div class="missing-image">Image unavailable</div>`}</div>
    <div>
      <div class="block-meta">${escapeHtml(item.subtitle || 'Image')}</div>
      <h3>${escapeHtml(block.title || item.title)}</h3>
      <p>${escapeHtml(item.body || '')}</p>
    </div>
  </article>`;
}

function renderPage(page: EmbeddedPage, blueprintPage: BlueprintPage, pageIndex: number) {
  const itemsByDeckId = new Map(page.items.map(item => [item.deckId, item]));
  const blocks = (blueprintPage.blocks?.length ? blueprintPage.blocks : page.items.map(item => ({ deckId: item.deckId, title: item.title, bullets: splitBullets(item) })))
    .map(block => ({ block, item: itemsByDeckId.get(block.deckId) }))
    .filter((entry): entry is { block: BlueprintBlock; item: EmbeddedItem } => Boolean(entry.item));
  const allSlides = blocks.length > 0 && blocks.every(entry => entry.item.type === 'slide');

  return `<section class="slide ${allSlides ? 'slide-native' : ''}">
    ${allSlides && blocks.length === 1
      ? renderImageBlock(blocks[0].item, blocks[0].block)
      : `<header class="slide-header">
          <div>
            <div class="kicker">${escapeHtml(blueprintPage.kicker || `Page ${pageIndex + 1}`)}</div>
            <h2>${escapeHtml(blueprintPage.headline || blueprintPage.title || page.title || `Page ${pageIndex + 1}`)}</h2>
          </div>
          <span>${escapeHtml(page.title || '')}</span>
        </header>
        <div class="content-grid ${layoutClass(blueprintPage.layout || page.layout)}">
          ${blocks.map(({ item, block }) => item.type === 'image' || item.type === 'slide' || item.type === 'ppt_selection'
            ? renderImageBlock(item, block)
            : renderTextBlock(item, block)
          ).join('')}
        </div>`}
  </section>`;
}

function layoutClassV2(layout?: string) {
  if (layout === 'product-showcase') return 'layout-product-showcase';
  if (layout === 'image-focus') return 'layout-image-focus';
  if (layout === 'case-story') return 'layout-case-story';
  if (layout === 'section-overview') return 'layout-section-overview';
  if (layout === 'headline-bullets') return 'layout-headline-bullets';
  return layoutClass(layout);
}

function renderTextBlockV2(item: EmbeddedItem, block: BlueprintBlock) {
  const limit = item.type === 'module' ? 6 : item.type === 'certificate' ? 6 : item.type === 'comparison' ? 6 : 5;
  const bullets = mergeBullets(block.bullets, item, limit);
  const title = preferSourceLanguage(block.title, item.title);
  return `<article class="block ${block.emphasis === 'hero' ? 'is-hero' : ''}">
    <h3>${escapeHtml(title)}</h3>
    ${bullets.length ? `<ul>${bullets.map(bullet => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>` : ''}
  </article>`;
}

function renderImageBlockV2(item: EmbeddedItem, block: BlueprintBlock) {
  if (item.type === 'slide') return renderImageBlock(item, block);
  const caption = item.type === 'image' ? '' : compact(item.body, 180);
  const title = preferSourceLanguage(block.title, item.title);
  return `<article class="image-block">
    <div class="image-frame">${item.imageDataUri ? `<img src="${item.imageDataUri}" alt="${escapeHtml(item.title)}">` : `<div class="missing-image">Image unavailable</div>`}</div>
    <div>
      <h3>${escapeHtml(title)}</h3>
      ${caption ? `<p>${escapeHtml(caption)}</p>` : ''}
    </div>
  </article>`;
}

function renderPageV2(page: EmbeddedPage, blueprintPage: BlueprintPage, pageIndex: number, forceDark = false) {
  const itemsByDeckId = new Map(page.items.map(item => [item.deckId, item]));
  const rawBlocks = blueprintPage.blocks?.length
    ? blueprintPage.blocks
    : page.items.map(item => ({ deckId: item.deckId, title: item.title, bullets: splitBullets(item) }));
  const mappedBlocks = rawBlocks
    .map(block => ({ block, item: itemsByDeckId.get(block.deckId) }))
    .filter((entry): entry is { block: BlueprintBlock; item: EmbeddedItem } => Boolean(entry.item));
  const usedDeckIds = new Set(mappedBlocks.map(entry => entry.item.deckId));
  const missingBlocks = page.items
    .filter(item => !usedDeckIds.has(item.deckId))
    .map(item => ({
      item,
      block: {
        deckId: item.deckId,
        slotId: item.slotId,
        title: item.title,
        emphasis: item.type === 'image' || item.type === 'slide' ? 'hero' : 'support',
        bullets: splitBullets(item),
      } satisfies BlueprintBlock,
    }));
  const blocks = mappedBlocks.length ? [...mappedBlocks, ...missingBlocks] : missingBlocks;
  const allSlides = blocks.length > 0 && blocks.every(entry => entry.item.type === 'slide');
  const visualTone = forceDark ? 'dark' : (blueprintPage.visualTone || 'light');
  const renderLayout = blueprintPage.layoutFamily || blueprintPage.layout || page.layout;

  return `<section class="slide tone-${visualTone} ${allSlides ? 'slide-native' : ''}">
    ${allSlides && blocks.length === 1
      ? renderImageBlockV2(blocks[0].item, blocks[0].block)
      : `<header class="slide-header">
          <div>
            <div class="kicker">${escapeHtml(preferSourceLanguage(blueprintPage.kicker, page.title || `Page ${pageIndex + 1}`))}</div>
            <h2>${escapeHtml(preferSourceLanguage(blueprintPage.headline || blueprintPage.title, page.title || `Page ${pageIndex + 1}`))}</h2>
          </div>
        </header>
        <div class="content-grid ${layoutClassV2(renderLayout)}">
          ${blocks.map(({ item, block }) => item.type === 'image' || item.type === 'slide' || item.type === 'ppt_selection'
            ? renderImageBlockV2(item, block)
            : renderTextBlockV2(item, block)
          ).join('')}
        </div>`}
  </section>`;
}

function renderHtml(title: string, pages: EmbeddedPage[], blueprint: GenerationBlueprint, template: TemplateReference, finalizedBy: string, warnings: string[], forceDark = false) {
  const css = `:root{--teal:#009999;--ink:#172b36;--muted:#64727c;--line:#d7e1e4;--soft:#eef3f4;--accent:#f4a100}*{box-sizing:border-box}body{margin:0;background:#dfe7ea;color:var(--ink);font-family:Arial,"Microsoft YaHei",sans-serif}.preview-toolbar{position:sticky;top:0;z-index:50;height:54px;background:rgba(255,255,255,.94);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 22px;box-shadow:0 6px 18px rgba(18,42,52,.08)}.preview-toolbar strong{font-size:14px}.preview-toolbar span{font-size:12px;color:var(--muted);margin-left:10px}.toolbar-actions{display:flex;gap:10px}.toolbar-actions a,.toolbar-actions button{border:1px solid var(--line);border-radius:6px;background:white;color:var(--ink);font-size:13px;font-weight:700;padding:8px 13px;text-decoration:none;cursor:pointer}.toolbar-actions button{background:var(--teal);border-color:var(--teal);color:white}.deck{width:100%;padding-top:10px}.slide{width:1280px;height:720px;margin:28px auto;background:#fbfdfd;position:relative;overflow:hidden;box-shadow:0 18px 45px rgba(18,42,52,.18);padding:42px 52px;page-break-after:always}.slide:before{content:"";position:absolute;left:0;top:0;width:9px;height:100%;background:var(--teal)}.slide-header{display:flex;justify-content:space-between;gap:32px;align-items:flex-start;margin-bottom:28px}.kicker{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--teal);font-weight:700}.slide-header h2{margin:6px 0 0;font-size:34px;line-height:1.12;max-width:850px}.slide-header span{font-size:13px;color:var(--muted);max-width:260px;text-align:right}.content-grid{height:560px;display:grid;gap:18px}.layout-single{grid-template-columns:1fr}.layout-two-columns{grid-template-columns:1fr 1fr}.layout-left-main-right-stack{grid-template-columns:1.18fr .82fr;grid-template-rows:1fr 1fr}.layout-left-main-right-stack>:first-child{grid-row:1/3}.layout-two-rows{grid-template-rows:1fr 1fr}.layout-four-grid{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.block,.image-block{border:1px solid var(--line);background:white;padding:22px;min-height:0;overflow:hidden;display:flex;flex-direction:column}.block.is-hero{border-top:5px solid var(--teal)}.block-meta{font-size:12px;color:var(--teal);font-weight:700;text-transform:uppercase;margin-bottom:8px}h3{font-size:24px;line-height:1.18;margin:0 0 10px}p{font-size:15px;line-height:1.5;color:#334650;margin:0 0 12px}ul{margin:4px 0 0;padding-left:20px}li{font-size:15px;line-height:1.45;margin:6px 0}footer{margin-top:auto;padding-top:12px;font-size:11px;color:#829098}.image-block{display:grid;grid-template-columns:1.1fr .9fr;gap:18px;align-items:center}.image-frame{height:100%;min-height:210px;background:var(--soft);display:flex;align-items:center;justify-content:center}.image-frame img{max-width:100%;max-height:100%;object-fit:contain}.slide-image-block{position:absolute;inset:0;background:#111;display:flex;align-items:center;justify-content:center}.slide-image-block img{width:100%;height:100%;object-fit:contain}.slide-native{padding:0}.slide-native:before{display:none}.missing-image{color:#9aa6ad;font-size:18px}.notes{width:1280px;margin:0 auto 28px;color:#667782;font-size:12px}@media print{.preview-toolbar{display:none}body{background:white}.deck{padding-top:0}.slide{margin:0;box-shadow:none}}`;
  const styleCss = `.slide.tone-dark{background:#101820;color:#f5f8f9}.slide.tone-dark:after{content:"";position:absolute;right:-120px;top:-160px;width:420px;height:420px;background:rgba(0,153,153,.2);transform:rotate(24deg)}.slide.tone-dark .slide-header h2,.slide.tone-dark h3{color:#fff}.slide.tone-dark p,.slide.tone-dark li{color:#d7e1e4}.slide.tone-dark .block,.slide.tone-dark .image-block{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.15)}.slide.tone-dark .image-frame{background:rgba(255,255,255,.08)}.layout-product-showcase{grid-template-columns:1.05fr .95fr}.layout-product-showcase .image-block{grid-column:1/3;grid-template-columns:1fr .95fr;padding:30px}.layout-image-focus{grid-template-columns:1fr}.layout-image-focus .image-block{grid-template-columns:1.3fr .7fr}.layout-case-story{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.layout-case-story .block:first-child{grid-column:1/3;background:var(--ink);color:white}.layout-case-story .block:first-child h3,.layout-case-story .block:first-child li{color:white}.layout-section-overview{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr)}.layout-headline-bullets{grid-template-columns:1fr 1fr}.block-meta,footer,.notes{display:none!important}.block{justify-content:flex-start}.block h3{font-size:26px}.block ul{padding-left:0;list-style:none}.block li{position:relative;padding-left:20px}.block li:before{content:"";position:absolute;left:0;top:.68em;width:7px;height:7px;background:var(--teal)}.slide.tone-dark .block li:before{background:#22d3d3}`;
  const pageHtml = pages.map((page, index) => renderPageV2(page, blueprint.pages?.[index] || {}, index, forceDark)).join('\n');
  const warningHtml = warnings.length ? `<div class="notes">Generated by: ${escapeHtml(finalizedBy)} · Template: ${escapeHtml(template.fileName)} · ${warnings.map(escapeHtml).join(' · ')}</div>` : `<div class="notes">Generated by: ${escapeHtml(finalizedBy)} · Template: ${escapeHtml(template.fileName)}</div>`;
  const script = `<script>
    function downloadCurrentPreview() {
      window.location.href = window.location.pathname + '?download=1';
    }
  </script>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${css}${styleCss}</style>
</head>
<body>
  <nav class="preview-toolbar">
    <div><strong>${escapeHtml(title)}</strong><span>HTML PPT preview</span></div>
    <div class="toolbar-actions">
      <a href="/">返回工作区</a>
      <button type="button" onclick="downloadCurrentPreview()">导出 HTML</button>
    </div>
  </nav>
  <main class="deck">
    ${pageHtml}
  </main>
  ${script}
</body>
</html>`;
}

export async function generateHtmlPresentation(inputPages: DeckPage[], requestedTitle?: string, generationInstruction = ''): Promise<HtmlPresentationResult> {
  const normalized = normalizePages(inputPages);
  if (!normalized.length) {
    throw new Error('No workspace pages with material blocks were provided.');
  }

  const template = readTemplateReference();
  const embedded = await embedPageAssets(normalized);
  const styleLibrary = await buildTemplateStyleLibrary();
  const forceDark = wantsDarkTheme(generationInstruction);
  const candidateStyles = pickTemplateStyles(styleLibrary, {
    prefersDark: forceDark,
    hasImage: embedded.pages.some(page => page.items.some(item => item.type === 'image' || item.imageDataUri)),
    itemCount: embedded.pages.reduce((sum, page) => sum + page.items.length, 0),
    wantsCase: wantsCaseStyle(generationInstruction) || embedded.pages.some(page => page.items.some(item => /case|案例/i.test(`${item.title} ${item.body}`))),
  });
  const { blueprint, finalizedBy, warning } = await buildBlueprint(embedded.pages, template, candidateStyles, generationInstruction);
  const renderForceDark = forceDark || Boolean(blueprint.pages?.some(page => page.visualTone === 'dark'));
  const warnings = [...embedded.warnings, ...(warning ? [`LLM fallback: ${warning}`] : [])];
  const title = requestedTitle || blueprint.title || '产品胶片生成预览';
  return {
    html: renderHtml(title, embedded.pages, blueprint, template, finalizedBy, warnings, renderForceDark),
    fileName: `${title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'presentation'}.html`,
    finalizedBy,
    warnings,
  };
}
