# PM Material Hub App

This folder contains the local Next.js app used by PM Material Hub.

Normal users should start the product from the repository root by double-clicking:

```text
Start PM Material Hub.cmd
```

The app-level launcher is also available:

```text
start-dev.cmd
```

It installs dependencies on first run, starts the app on `http://127.0.0.1:3001/`, and opens the browser automatically.

## Local Runtime Requirements

Required:

- Windows
- Node.js LTS, unless a future release includes a portable Node runtime under `runtime/node/`
- local PM source materials outside the repository

For full PPT/PPTX support:

- Microsoft PowerPoint installed
- PowerPoint COM automation available

WPS Office is not supported by the current native preview renderer.

Optional:

- Kimi/OpenAI-compatible model base URL and API key for refined cards and generated presentation copy

## Product Scope

PM Material Hub is a Windows local PM material workspace. The product centers on local source materials, reusable cards, PowerPoint previews, visual page assembly, and editable HTML PPT export.

The app supports:

- local workspace setup
- local file sync
- raw JSON indexing
- image material cards
- PPT/PPTX original page previews
- PM favorite selections from PPT pages
- LLM-refined reusable cards
- visual multi-page workspace editing
- normal layouts and scenario templates
- editable HTML PPT preview generation
- standalone HTML export

## Standard Folders

The configured material workspace should contain:

```text
01_产品物料表格
02_Catalogue_产品样本
03_Manual_产品技术手册
04_Slides_Technical&Sales
05_Sales_Reference_成功案例
06_Sales_Fighting_Guide
07_文本资料
08_产品图片素材
09_认证证书
10_FAQ_常见问题集
```

Folder behavior is defined in:

```text
src/lib/materialProfiles.ts
```

## Data Layers

Generated data lives under `data/` and should not be committed.

Important generated layers:

- `data/local-json-indexes/`: raw local indexes and image manifests
- `data/indexes/`: model-refined output
- `data/manual-cards/`: manual-card generation output, only after explicit generation
- `data/slide-previews/`: PowerPoint-rendered slide PNG cache
- `data/generated-html/`: generated HTML previews
- `data/workspace-draft.json`: current workspace draft and latest preview metadata

Local settings live in:

```text
config/settings.json
```

This file may contain local paths and API keys and must not be committed.

## Local Index Versus Model Refinement

Local JSON generation is deterministic and does not call the LLM. It should only create raw document cards, MLFB candidates, image manifests, and original PPT page cards.

Refined material cards are generated only after the model extraction step or an explicit manual-card generation workflow.

For `03_Manual_产品技术手册`, local indexing is chapter based. The app first splits manuals by detected chapter headings. It then creates a deterministic local digest for each chapter by extracting overview lines, parameter facts, procedure rules, warnings or limits, lifecycle facts, evidence snippets, and MLFB candidates. This digest is generated locally without the LLM and becomes the bounded input for model refinement.

The expected refined output for folder 03 is reusable chapter/theme cards such as installation, wiring, configuration, commissioning, diagnostics, maintenance, safety notes, limitations, and technical specifications. MLFB values are only optional `related_mlfbs` tags and are filtered against the folder 01 product master whitelist.

Folder 03 filters low-value content during both local digest generation and model-output validation, including vulnerability notices, security update notifications, automatic notification options, signed firmware or firmware update notices, generic cybersecurity advisories, data/archive integrity reminders, marketing copy, copyright/trademark/disclaimer text, repeated warning boilerplate, and empty placeholders.

## Local JSON Technology

The local JSON pipeline is implemented in `src/lib/localIndexer.ts` and extractor helpers under `src/lib/extractors.ts`.

It uses local Node.js libraries and Windows capabilities:

- `xlsx` for Excel product master parsing
- `mammoth` for Word `.docx` raw text extraction
- `pdf-parse` for PDF text extraction
- `pptxgenjs` / local presentation parsing helpers for PPT/PPTX text, tables, notes, and slide evidence IDs
- `sharp` for image metadata and image manifest generation
- Microsoft PowerPoint COM automation for true PPT/PPTX PNG page previews

The local indexer writes bounded JSON under `data/local-json-indexes/`. This JSON is the only source sent to the configured model during refined extraction; the model does not read original PDF, Word, Excel, PPT, or image files directly.

## PPT/PPTX Flow

PPT/PPTX files produce:

- local raw JSON with page text, tables, notes, slide numbers, and evidence IDs
- true slide PNG previews from Microsoft PowerPoint
- original slide cards that remain draggable
- optional model-refined reusable cards

The original page layer must never be replaced or hidden by refined cards.

PM-selected PPT content is created by opening an original slide preview, selecting a rectangle, and clicking **Favorite**. The app crops the PowerPoint-rendered preview and creates a reusable `ppt_selection` card.

## HTML PPT Generation

Generation API:

```text
POST /api/presentations/generate-html
```

Preview routes:

```text
GET /api/presentations/preview/[id]
GET /api/presentations/preview/[id]?download=1
```

Generated previews are stored in:

```text
data/generated-html/
```

Text in generated HTML is editable through `contenteditable`.

## Developer Commands

For development only:

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

The user-facing path should remain the one-click launcher, not manual PowerShell commands.

## Data Safety

Do not commit:

- `config/settings.json`
- generated `data/` files
- user source materials
- API keys
- `.next/`
- `node_modules/`
