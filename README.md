# PM Material Hub

PM Material Hub is a Windows local workspace for Product Managers. It helps PMs turn private local product materials into reusable material cards, assemble those cards visually, and generate editable HTML presentation pages.

## Why Local

PM source materials often include product masters, manuals, sales decks, certificates, price references, customer cases, and internal notes. These files should stay on the user's machine.

The application also relies on Microsoft PowerPoint for true PPT/PPTX page previews and PM-selected slide regions. A local Office environment preserves the original slide appearance and supports PM-selected visual regions.

The main workflow is personal material organization, card selection, page assembly, preview generation, and standalone HTML export, all of which fit naturally with direct access to local files.

## One-Click Windows Start

After downloading and extracting a GitHub release, double-click this file in the repository root:

```text
Start PM Material Hub.cmd
```

The launcher will:

- find local Node.js / npm
- install dependencies on first run if `node_modules/` is missing
- start the local app on `http://127.0.0.1:3001/`
- open the browser automatically

Keep the launcher window open while using the app. Closing it stops the local server.

If Node.js is not installed, install Node.js LTS from:

```text
https://nodejs.org/
```

## Runtime Scope

The app should independently support:

- first-run local workspace setup
- Kimi/OpenAI-compatible LLM URL and API key configuration
- local file sync
- local raw JSON indexing
- image material cards
- PPT/PPTX original page previews through Microsoft PowerPoint
- PM favorite selection from PPT pages
- LLM-refined reusable cards
- HTML PPT preview generation
- standalone HTML export

Codex is only for development and testing. Runtime behavior must be handled by the app, scripts, configured model services, and local files.

## Standard Material Workspace

The real PM material workspace lives outside this repository. A common location is:

```text
C:\Users\<User>\Documents\PM_Materials
```

The app creates and uses these standard folders:

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

Local app settings are stored in:

```text
pm-material-hub/config/settings.json
```

This file is intentionally not committed because it may contain local paths and API keys.

## Product Workflow

1. Start the app locally.
2. Configure the material workspace.
3. Configure the LLM endpoint and API key if refined cards or generated copy are needed.
4. Sync local materials.
5. Generate local JSON indexes. This step does not call the model.
6. Optionally run model extraction to create refined cards.
7. Drag cards into the workspace.
8. Choose a normal layout or scenario template.
9. Generate an editable HTML PPT preview.
10. Export the standalone HTML file.

As one folder-specific example, `03_Manual_产品技术手册` uses a chapter-based local compression strategy. Other folders keep their own rules, such as folder 01 product master parsing, folder 04 original PPT page preservation, and folder 08 image manifests.

- The app first splits manuals by detected chapter headings.
- It creates a deterministic local digest for each chapter by extracting overview lines, parameter facts, procedure rules, warnings or limits, lifecycle facts, evidence snippets, and MLFB candidates.
- This digest is generated locally without the LLM and becomes the bounded input for model refinement.
- Folder 03 refined cards are reusable chapter/theme cards such as installation, wiring, configuration, commissioning, diagnostics, maintenance, safety notes, limitations, and technical specifications.
- MLFB values are only optional `related_mlfbs` tags and are filtered against the folder 01 product master whitelist.
- Folder 03 filters low-value content during both local digest generation and model-output validation, including vulnerability notices, security update notifications, automatic notification options, signed firmware or firmware update notices, generic cybersecurity advisories, data/archive integrity reminders, marketing copy, copyright/trademark/disclaimer text, repeated warning boilerplate, and empty placeholders.

## Local JSON Technology

Local JSON generation is implemented in `pm-material-hub/src/lib/localIndexer.ts` and extractor helpers under `pm-material-hub/src/lib/extractors.ts`.

The pipeline uses local tools and libraries:

| Tool | Current version | Source | Use in this project |
| --- | --- | --- | --- |
| `xlsx` | `^0.18.5` | [SheetJS/sheetjs](https://github.com/SheetJS/sheetjs) | Reads folder 01 Excel product masters, sheets, rows, MLFBs, descriptions, and price fields. |
| `mammoth` | `^1.12.0` | [mwilliamson/mammoth.js](https://github.com/mwilliamson/mammoth.js) | Extracts raw text from `.docx` files without preserving complex Word styling. |
| `pdf-parse` | `^1.1.1` | [willmcpo/pdf-parse](https://github.com/willmcpo/pdf-parse) | Extracts text from copyable text PDFs first. |
| `pdfjs-dist` | `^5.6.205` | [mozilla/pdf.js](https://github.com/mozilla/pdf.js) | Renders PDF pages locally when the PDF appears scanned and text extraction is too short. |
| `tesseract.js` | `^7.0.0` | [naptha/tesseract.js](https://github.com/naptha/tesseract.js) | Performs local OCR on rendered scanned-PDF pages. The release caches `eng.traineddata` under `pm-material-hub/resources/ocr/eng.traineddata`. |
| Tesseract OCR language data | `eng.traineddata` | [tesseract-ocr/tessdata](https://github.com/tesseract-ocr/tessdata) | English OCR model data. The current project only bundles English data; Chinese scanned-PDF OCR depends on adding Chinese traineddata later. |
| `@napi-rs/canvas` | `^0.1.100` | [Brooooooklyn/canvas](https://github.com/Brooooooklyn/canvas) | Creates a Node.js canvas so PDF pages can be rendered to images for OCR. |
| `officeparser` | `^7.2.1` | [harshankur/officeParser](https://github.com/harshankur/officeParser) | Parses PPT/PPTX and DOC files for slide text, tables, notes, image references, and slide evidence IDs. |
| `sharp` | `^0.35.1` | [lovell/sharp](https://github.com/lovell/sharp) | Reads image metadata, crops PPT favorite selections, and processes image backgrounds. |
| `adm-zip` | `^0.5.17` | [cthackers/adm-zip](https://github.com/cthackers/adm-zip) | Reads PPTX internal XML for favorite-selection text extraction and template analysis. |
| Microsoft PowerPoint COM | local Office capability | Microsoft Office local installation | Exports true PPT/PPTX page PNG previews so original slide rendering matches PowerPoint. |

OCR is only used as a fallback. `pm-material-hub/src/lib/extractors.ts` first tries `pdf-parse`; if the extracted text is too short, it calls `pm-material-hub/scripts/ocr-pdf.cjs`, which combines `pdfjs-dist`, `@napi-rs/canvas`, and `tesseract.js` locally.

The generated JSON lives under `pm-material-hub/data/local-json-indexes/`. Model extraction reads this bounded local JSON; the model does not read the original PDF, Word, Excel, PPT, or image files directly.

## Repository Contents

```text
pm-material-hub/                  Next.js local app
Slides_Template/                  Shared PPT style templates
Slides_Template/Scenario_Layouts/ Scenario layout templates and previews
Start PM Material Hub.cmd         one-click launcher
```

## Do Not Commit

- PM private source files
- generated `pm-material-hub/data/`
- `pm-material-hub/config/settings.json`
- API keys
- `.next/`
- `node_modules/`

## Developer Commands

The one-click launcher is preferred for user testing. Developers can still run:

```powershell
cd "pm-material-hub"
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

Use `npm.cmd` on Windows PowerShell to avoid execution-policy issues with `npm.ps1`.
