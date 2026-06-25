# PM Material Hub App

This is the Next.js application for PM Material Hub. It scans local product-management materials, creates reusable cards, supports a visual multi-page workspace, and generates editable HTML PPT previews and exports.

## Setup

```powershell
npm.cmd install
npm.cmd run dev
```

Open:

```text
http://localhost:3001/
```

Production build:

```powershell
npm.cmd run build
npm.cmd run start
```

Use `npm.cmd` on Windows. OCR and image processing use native dependencies, so do not copy `node_modules` between operating systems.

## Runtime Requirements

Minimum runtime:

- Node.js dependencies installed from `package-lock.json`
- Local PM material workspace configured in `config/settings.json`
- Optional Kimi/OpenAI-compatible model settings for refined cards and generated presentation copy

For full PPT/PPTX support on Windows:

- Microsoft PowerPoint installed
- PowerPoint COM automation available for original slide PNG previews

WPS Office is not supported by the current native preview renderer.

## Core Workflow

1. Configure the material workspace.
2. Click **Sync** in the app.
3. Generate or refresh local JSON indexes.
4. Optionally run model extraction for refined material cards.
5. Drag cards into the workspace.
6. Select a normal layout or a scenario template.
7. Click generate preview.
8. Review the HTML PPT preview.
9. Return to the workspace for edits or export the HTML file.

The app saves the workspace draft and the latest generated preview metadata, so returning from preview does not lose the current workspace or last generated output.

## Standard Folders

The configured material workspace should contain:

1. `01_产品物料表格`
2. `02_Catalogue_产品样本`
3. `03_Manual_产品技术手册`
4. `04_Slides_Technical&Sales`
5. `05_Sales_Reference_成功案例`
6. `06_Sales_Fighting_Guide`
7. `07_文本资料`
8. `08_产品图片素材`
9. `09_认证证书`
10. `10_FAQ_常见问题集`

Folder behavior is defined in `src/lib/materialProfiles.ts`.

## Local Indexes

Generated data lives under `data/` and should not be committed.

Important generated layers:

- `data/local-json-indexes/`: raw local indexes and image manifests
- `data/indexes/`: refined model output
- `data/manual-cards/`: deterministic/manual-card pipeline output
- `data/slide-previews/`: cached PowerPoint-rendered slide PNGs
- `data/generated-html/`: generated HTML preview files
- `data/workspace-draft.json`: current workspace draft and latest preview metadata

## PPT/PPTX Flow

PPT/PPTX files produce:

- `*.raw.json`: page-level text, lists, tables, notes, image references, slide numbers, and evidence IDs
- true slide PNG previews under `data/slide-previews/`
- optional `*.meta.json` refined reusable cards
- `_folder.catalog.json` for lightweight routing

Original slide pages remain available as draggable cards. Refined content never replaces the original page layer.

### PM Favorite Selection

From an original PPT page preview, the PM can drag a rectangle over a region and click **Favorite**. The app crops that region from the PowerPoint-rendered preview and creates a reusable `ppt_selection` card. This card can be dragged into text or image slots depending on the target layout.

## HTML PPT Generation

The generation API is:

```text
POST /api/presentations/generate-html
```

It returns a preview id and URL. Preview files are stored locally under `data/generated-html/`.

Preview route:

```text
GET /api/presentations/preview/[id]
GET /api/presentations/preview/[id]?download=1
```

The generated preview includes toolbar buttons for returning to the workspace and exporting HTML. Export uses the browser save picker when available, with download fallback.

Generation uses:

- workspace pages and slot mapping as the structure source
- Kimi/OpenAI-compatible model for title and copy rewriting
- `Slides_Template/template_Business graphic.pptx` as a style library
- scenario layouts from `Slides_Template/Scenario_Layouts/`
- deterministic HTML rendering
- image embedding and light-background removal for ordinary image cards

Text in generated HTML is editable via `contenteditable`.

## Scenario Templates

Scenario templates are defined in:

```text
src/lib/scenarioTemplateLayouts.ts
```

Template previews are served by:

```text
GET /api/assets/scenario-template?id=<templateId>
```

Current scenario template assets live outside the app folder:

```text
../Slides_Template/Scenario_Layouts/
```

Current templates:

- `scenario-product-benefits-1`
- `scenario-capability-grid-2`

Scenario slots are fixed active regions. Text slots receive rewritten model copy and deterministic fitting. Image slots receive embedded image content. Auto-title slots are generated and are not draggable.

## Image Handling

Image assets are served by:

```text
GET /api/assets/image
```

Normal image cards default to transparent PNG output after light-background removal. Use `transparent=0` only when the original background must be preserved.

## Key API Routes

- `POST /api/index/local`: generate or refresh local JSON indexes
- `GET /api/materials/cards`: load frontend material cards
- `GET /api/materials/catalog`: read lightweight routing catalogs
- `POST /api/materials/context`: retrieve bounded context for model calls
- `POST /api/extract/batch`: run model extraction against local JSON
- `POST /api/presentations/favorite-selection`: create a PM favorite selection from a PPT page
- `POST /api/presentations/generate-html`: generate HTML PPT preview
- `GET /api/presentations/preview/[id]`: view or download generated HTML
- `GET/POST/DELETE /api/workspace/draft`: persist workspace state
- `GET/POST /api/settings/llm`: configure model endpoint
- `GET/POST /api/settings/prompts`: configure per-folder prompts

## Commands

```powershell
# Product master data
npm.cmd run index:local -- --folder-prefix 01 --force

# Technical manuals
npm.cmd run index:local -- --folder-prefix 03 --force

# Slides
npm.cmd run index:local -- --folder-prefix 04 --force

# Image manifests
npm.cmd run index:local -- --folder-prefix 08 --force

# Build verification
npm.cmd run build
```

## Data Safety

Do not commit:

- `config/settings.json`
- generated `data/` files
- user source materials
- API keys
- `.next/`
- `node_modules/`
