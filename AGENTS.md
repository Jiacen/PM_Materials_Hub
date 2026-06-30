# Product Management Workspace - Agent Guide

This workspace contains PM Material Hub and shared presentation templates.

## Product Direction

PM Material Hub is a Windows local tool for Product Managers. The product centers on local source materials, reusable cards, Microsoft PowerPoint previews, visual page assembly, and editable HTML PPT export.

Runtime behavior must work through the application, bundled/local scripts, configured model services, Microsoft PowerPoint where needed, and local files. Codex is only for development and testing.

## Repository Scope

```text
pm-material-hub/                  Next.js local app
Slides_Template/                  shared PPT style templates
Slides_Template/Scenario_Layouts/ scenario templates and preview assets
Start PM Material Hub.cmd         user-facing launcher
```

For implementation details, always read:

```text
pm-material-hub/AGENTS.md
```

## Local Green Runtime

The user-facing path is one-click local startup from the release package:

```text
Start PM Material Hub.cmd
```

These scripts should:

- find Node.js/npm or a future portable runtime under `runtime/node/`
- install dependencies on first run when `node_modules/` is missing
- start the app on `http://127.0.0.1:3001/`
- open the browser automatically

Manual PowerShell commands are acceptable for developers, but should not be the normal user path.

## Product Boundary

Do not design features that require Codex at runtime.

Do not assume source materials live inside this repository. PM source materials stay in a local workspace configured through the app.

Keep runtime assumptions local: the app should read local files, use local settings, and rely on Microsoft PowerPoint when true PPT/PPTX previews or PM-selected slide regions are needed.

## Standard Material Folders

Use these exact folder names:

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

`01_产品物料表格` is authoritative product master data. Other folders may link to MLFBs but must not silently overwrite master data.

## Local JSON Indexing

`POST /api/index/local` is deterministic local indexing and must not call the LLM.

The local JSON pipeline is implemented mainly in:

```text
pm-material-hub/src/lib/localIndexer.ts
pm-material-hub/src/lib/extractors.ts
```

Use local parsers and local Windows capabilities before any model call:

- `xlsx` `^0.18.5`, [SheetJS/sheetjs](https://github.com/SheetJS/sheetjs): Excel product master rows.
- `mammoth` `^1.12.0`, [mwilliamson/mammoth.js](https://github.com/mwilliamson/mammoth.js): `.docx` raw text.
- `pdf-parse` `^1.1.1`, [willmcpo/pdf-parse](https://github.com/willmcpo/pdf-parse): text PDFs.
- `pdfjs-dist` `^5.6.205`, [mozilla/pdf.js](https://github.com/mozilla/pdf.js): render scanned PDF pages for OCR fallback.
- `tesseract.js` `^7.0.0`, [naptha/tesseract.js](https://github.com/naptha/tesseract.js): local OCR fallback; cached language data lives under `pm-material-hub/resources/ocr/`.
- Tesseract language data, [tesseract-ocr/tessdata](https://github.com/tesseract-ocr/tessdata): currently only `eng.traineddata` is bundled.
- `@napi-rs/canvas` `^0.1.100`, [Brooooooklyn/canvas](https://github.com/Brooooooklyn/canvas): Node.js canvas for PDF page rasterization.
- `officeparser` `^7.2.1`, [harshankur/officeParser](https://github.com/harshankur/officeParser): PPT/PPTX and DOC text, tables, notes, image references, and evidence IDs.
- `sharp` `^0.35.1`, [lovell/sharp](https://github.com/lovell/sharp): image metadata, cropping, and background handling.
- `adm-zip` `^0.5.17`, [cthackers/adm-zip](https://github.com/cthackers/adm-zip): PPTX internal XML inspection.
- Microsoft PowerPoint COM automation: true PPT/PPTX PNG page previews.

Folder `03_Manual_产品技术手册` is chapter/theme based. Local indexing should split manuals by detected chapter headings and build deterministic per-chapter digests with overview lines, parameter facts, procedure rules, warnings or limits, lifecycle facts, evidence snippets, and MLFB candidates. Do not make folder 03 one-card-per-MLFB; MLFB values are only `related_mlfbs` tags filtered through folder 01 product master data.

Folder 03 must filter low-value material during both local digest generation and model-output validation: vulnerability notices, security update notifications, automatic notification options, signed firmware or firmware update notices, generic cybersecurity advisories, data/archive integrity reminders, marketing copy, copyright/trademark/disclaimer text, repeated warning boilerplate, and empty placeholders should not become cards.

The configured model should receive bounded JSON from `pm-material-hub/data/local-json-indexes/`, never raw source files directly.

## Templates

Shared templates live in:

```text
Slides_Template/
```

Scenario templates live in:

```text
Slides_Template/Scenario_Layouts/
```

When adding or changing scenario templates:

1. Keep the PPTX in `Slides_Template/Scenario_Layouts/`.
2. Create or update a clean preview/background image.
3. Configure active slots in `pm-material-hub/src/lib/scenarioTemplateLayouts.ts`.
4. Do not leave analysis annotations such as red boxes or numbers in final preview images.

## Safety

Do not commit:

- PM private source files
- generated `pm-material-hub/data/` files
- `pm-material-hub/config/settings.json`
- API keys
- `.next/`
- `node_modules/`

Do not delete user material files. If cleanup is needed, remove only one explicit generated file at a time. Do not batch delete files or directories.

## Development

Main app directory:

```powershell
cd "C:\Users\Administrator\Desktop\Product Management\pm-material-hub"
```

Developer commands:

```powershell
npm.cmd run dev
npm.cmd run build
```

Use `npm.cmd` on Windows.
