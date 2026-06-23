# PM Material Hub App

Local-first Next.js workspace for converting product-management source files into reusable, evidence-backed material cards and assembling them into HTML presentation pages.

## Setup

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3001/` when using the supplied development launcher, or the URL printed by Next.js.

Production:

```powershell
npm.cmd run build
npm.cmd run start
```

On Linux, run `npm install` on the Linux host because OCR includes native dependencies. Do not copy Windows `node_modules`.

## Material Workspace

The source-material path is configured in `config/settings.json`. The standard order is:

1. `01_产品物料表格` - authoritative MLFB, SAP, ordering, price, and lifecycle master data
2. `02_Catalogue_产品样本` - product family, positioning, benefits, and selection
3. `03_Manual_产品技术手册` - technical parameters, functions, limitations, and cautions
4. `04_Slides_Technical&Sales` - product story, value, highlights, applications, comparisons, and sales messages
5. `05_Sales_Reference_成功案例` - customer pain, solution, selection reason, and results
6. `06_Sales_Fighting_Guide` - competition, objections, responses, and sales strategy
7. `07_文本资料` - product introductions, releases, and market information
8. `08_产品图片素材` - reusable visual assets
9. `09_认证证书` - certificates, standards, regions, holders, and covered MLFBs
10. `10_FAQ_常见问题集` - questions, answers, symptoms, and resolution steps

The first folder is processed first and acts as the product master index. Other folders link to it through normalized MLFB values, but MLFB is not the default card unit for every category.

## Processing

1. Source files remain outside the repository.
2. Local indexing writes rebuildable JSON under `data/local-json-indexes/`.
3. Optional KIMI extraction reads local JSON and writes refined results under `data/indexes/`.
4. The material-card API combines master data, refined theme cards, raw evidence, and image assets.

### PPT/PPTX Operating Flow

For normal use:

1. Add one or more PPT/PPTX files to the material folder and click **Sync**.
2. Click **生成 / 更新本地 JSON**. The application generates:
   - one `*.raw.json` per presentation
   - true original-slide PNG previews under `data/slide-previews/`
   - the lightweight `_folder.catalog.json`
3. Open the advanced extraction section and run the LLM extraction action. The model reads the `raw.json`, not the original presentation, and generates one validated `*.meta.json` per presentation.
4. The frontend displays each presentation as a collapsible group containing refined cards and original pages.

The three PPT/PPTX data layers are:

- `*.raw.json`: complete page-level text, lists, tables, notes, image references, page numbers, and evidence IDs
- `*.meta.json`: validated reusable refined cards
- `_folder.catalog.json`: lightweight routing metadata for selecting relevant files before bounded context retrieval

`GET /api/materials/catalog` exposes the routing catalog. `POST /api/materials/context` returns a bounded number of relevant files, cards, and evidence pages so downstream model calls do not read an entire folder unnecessarily.

Refined output is published only after validation. Invalid one-card deck merges or unsupported evidence cannot overwrite the current published index. The application stores a candidate, backs up the prior index before replacement, and may publish an explicitly labelled deterministic fallback.

## Standalone Runtime Requirement

Codex is used only to develop and test this application. It is not part of the production material pipeline.

On another machine, the application must independently perform:

- local parsing and JSON indexing for every supported folder and file type
- deterministic card generation where applicable
- folder-specific LLM extraction and light refinement through the configured model API
- structural and evidence validation with safe fallback behavior
- card persistence, page preview generation, and frontend loading

No production card may require a Codex conversation, Codex-generated intermediate file, or manual intervention by Codex. Without an LLM configuration, deterministic local materials must continue to work; only model-refined cards are unavailable.

Format behavior:

- Excel product lists become deterministic master-data records without an LLM.
- PPT/PPTX files are preserved page by page, including text, lists, tables, notes, image references, and slide evidence IDs.
- Each PPT/PPTX is displayed as an independently collapsible file group containing separate refined-content and original-page sections.
- Original-page thumbnails are real PNG exports produced by installed Microsoft PowerPoint on Windows and cached under `data/slide-previews/`. They are not reconstructed from extracted JSON.
- If PowerPoint is unavailable, the app reports that native previews cannot be generated instead of showing a synthetic summary image.
- PPT/PPTX files do not create a generic raw-document candidate card because their original-page cards already provide the complete source layer.
- Source changes mark indexes stale; missing source files are treated as orphaned. The folder catalog exposes these states.
- PDFs use embedded text first and automatically use local Tesseract OCR when no usable text layer exists.
- Word uses Mammoth for DOCX extraction.
- Images are indexed as first-class assets.

Folder behavior is defined in `src/lib/materialProfiles.ts`. The complete product and extraction rationale is documented in `AGENTS.md`.

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

Use `npm.cmd` on Windows to avoid PowerShell execution-policy issues.

## Data Safety

Do not commit:

- `config/settings.json`
- generated `data/` indexes
- source materials from the PM workspace
- `.next/` or `node_modules/`
- API keys or private customer/product files
