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

Format behavior:

- Excel product lists become deterministic master-data records without an LLM.
- PPT/PPTX files are preserved page by page, including text, lists, tables, notes, image references, and slide evidence IDs.
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
