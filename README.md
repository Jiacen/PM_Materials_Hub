# PM Material Hub

PM Material Hub is a local-first product material management and HTML presentation workspace for product managers.

The project is designed for PMs who need to organize scattered product materials, turn them into reusable material cards, and quickly assemble sales-ready content based on a shared presentation template.

This repository contains the application and shared template. It does not contain any individual PM's manuals, product images, generated indexes, API settings, or private workspace data.

## Core Principles

### 1. Single Source of Truth for PM Materials

PM Material Hub treats the local material workspace as the PM's daily source of truth.

Instead of letting manuals, catalogues, pictures, sales decks, FAQs, certificates, and reference cases stay scattered across folders and chat history, the app expects each PM to maintain one standard material workspace with 10 business folders.

The Git repository should therefore stay productized and clean. The user's real material library lives outside Git and is configured locally.

### 2. Fast Material Delivery for Sales

The primary workflow is not chatbot-style Q&A. The product is built around a visual material library and a multi-page workspace.

The target user experience is:

1. PM places source materials into the standard local workspace.
2. The app scans files and generates local JSON indexes.
3. Optional LLM extraction refines those indexes into cleaner material cards.
4. PM drags or adds cards into one or more presentation pages.
5. PM exports or reuses selected content for sales communication.

The long-term goal is to help PMs quickly deliver "sales bullets": a parameter, summary, product image, topology diagram, selling point, FAQ answer, or full HTML-style deck.

## Repository Scope

### Included in Git

- Application source code under `pm-material-hub/src/`
- Local indexing and utility scripts under `pm-material-hub/scripts/`
- Project configuration such as `package.json`, `package-lock.json`, `tsconfig.json`, and Next.js config
- Shared static assets under `pm-material-hub/public/`
- The baseline PowerPoint template under `Slides_Template/`
- Project documentation and agent handoff notes

### Excluded from Git

- Per-user source materials: PDF, PPTX, DOCX, XLSX, images, certificates, FAQs, etc.
- Generated JSON indexes under `pm-material-hub/data/`
- Local workspace and LLM settings under `pm-material-hub/config/settings.json`
- Environment files such as `.env`
- Dependencies such as `node_modules/`
- Build output such as `.next/`, `out/`, and `build/`

This separation is intentional. Each PM should be able to clone the application, configure their own local workspace, and generate their own indexes without polluting the shared repository.

## Product Architecture

PM Material Hub uses a lightweight file-system-first architecture.

```text
Local PM material workspace
        |
        | scan and index
        v
pm-material-hub/data/              local generated indexes, not committed
        |
        | material card API
        v
React workspace UI                 material library, pages, cards, drag/drop
        |
        | future export
        v
Standalone HTML presentation        target delivery format
```

There is no database in the current design. The system relies on the local file system plus generated JSON indexes.

## Standard Material Workspace

Each PM's actual material workspace is configured locally through `pm-material-hub/config/settings.json`.

The workspace uses these exact folders:

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

`01_产品物料表格` is processed first and acts as the authoritative product master-data source. Other folders link their material cards to these records through normalized MLFB values where possible.

### Folder-Specific Card Goals

| Folder | Primary card goals | MLFB role |
| --- | --- | --- |
| `01_产品物料表格` | Model, ordering information, SAP data, price, lifecycle | Authoritative master index |
| `02_Catalogue_产品样本` | Product family, positioning, core benefits, selection scope | Important product/model field |
| `03_Manual_产品技术手册` | Product, module, parameter, function, limitation, usage caution | Complete model coverage |
| `04_Slides_Technical&Sales` | Product story, value proposition, technical highlight, application, comparison, sales message | Related field, not the main card unit |
| `05_Sales_Reference_成功案例` | Customer pain, project background, solution, selection reason, result | Relates the case to products used |
| `06_Sales_Fighting_Guide` | Competitor, differentiation, objection, supporting evidence, sales strategy | Relates guidance to product scope |
| `07_文本资料` | Product introduction, release notice, market information | Release notices may create model cards |
| `08_产品图片素材` | Product, module, application, structure, and scenario images | Image linking and retrieval |
| `09_认证证书` | Certificate, standard, region, holder, certified scope | Stored in `covered_mlfbs` |
| `10_FAQ_常见问题集` | Question, answer, applicable object, symptom, resolution | Applicable-model filtering |

MLFB is not the universal card granularity. In particular, slides, references, and fighting guides should primarily produce reusable PM ideas and business narratives rather than one card per ordering number.

## Content Processing Model

### Standalone Runtime Requirement

Codex is only a development and testing tool for this repository. It must not participate in production card generation.

Every supported folder must be processed independently by the installed application through local parsers, indexing scripts, backend APIs, configured LLM services, deterministic validators, and persisted generated data. A new machine with the application, dependencies, workspace files, and optional model configuration must be able to rebuild the same material structure without a Codex conversation or Codex-generated intermediate files.

When no model is configured, deterministic local indexing and locally generated materials must remain available. Only model-refined cards should be unavailable.

### PPT/PPTX User Workflow

The production workflow is:

1. Put one or more presentations in the relevant material folder and click **Sync**.
2. Click **生成 / 更新本地 JSON** to create one page-level `raw.json` per presentation, true original-page PNG previews, and a lightweight folder catalog.
3. Run the advanced LLM extraction action to create one validated refined-card `meta.json` per presentation. The model reads JSON rather than opening the PPT/PPTX.
4. Use each independently collapsible presentation group in the material library.

PowerPoint processing uses three layers:

- `*.raw.json`: complete machine-readable page evidence
- `*.meta.json`: validated reusable refined cards
- `_folder.catalog.json`: lightweight routing metadata used before bounded retrieval of relevant cards and pages

Model candidates are validated before publication. Invalid giant-card merges or unsupported evidence cannot replace the current published index. Existing refined output is backed up before replacement, and a deterministic evidence-linked fallback may be used and labelled when model output fails validation.

### Local JSON First

The current implementation uses local evidence, refined cards, and a lightweight routing catalog:

1. Local indexing compresses source files into JSON.
2. Optional LLM extraction reads those JSON indexes instead of reading the original documents directly.
3. Folder catalogs route later model requests to bounded relevant files, cards, and evidence pages.

This keeps repeated extraction cheaper, faster, and easier to inspect.

The application exposes `GET /api/materials/catalog` for lightweight routing and `POST /api/materials/context` for bounded retrieval.

### Current Index Types

- `*.raw.json`: generated from documents such as PDF, Word, PowerPoint, Excel, and text-like files. These files store metadata, extracted text chunks, candidate headings, MLFB candidates, and evidence references.
- `*.image.json`: generated from image files. These files store image metadata, dimensions, format, inferred usage tags, and browser asset URLs.
- `*.meta.json`: refined or structured outputs used by the material card API.
- `_folder.catalog.json`: file-level routing index with source/index freshness, counts, topics, evidence references, preview type, and generation method.

All of these are generated local artifacts and should stay outside Git.

Extraction behavior is folder-specific and configured in `pm-material-hub/src/lib/materialProfiles.ts`.

- Excel product lists generate deterministic master-data records without requiring an LLM.
- PowerPoint files are indexed page by page, preserving slide titles, text, lists, tables, notes, image references, and slide evidence IDs.
- Original PowerPoint page previews are true PNG exports from the installed Microsoft PowerPoint application, not JSON-derived reconstructions.
- MVP preview support requires Microsoft PowerPoint. WPS Office is not supported by the current renderer.
- Multiple PowerPoint files are grouped by source file. Each file has independently collapsible refined-content and original-page sections.
- PowerPoint files do not create an extra generic raw-document candidate card because their page cards already preserve the source.
- PDFs use their embedded text layer first. Scanned PDFs automatically fall back to local Tesseract OCR.
- LLM extraction reads local JSON, not the original Office/PDF file.
- Folder-level model use should read the catalog first and retrieve bounded context through the application rather than loading every source index.
- Changed source files mark indexes stale; removed source files are marked orphaned.
- MLFB-completeness enforcement is enabled only where model-level coverage is a business requirement.

### Image Material Strategy

Images in the product image folder are treated as first-class material cards.

The project supports browser previews for common image formats and TIFF conversion through the image asset API. Product hero shots, front views, station overviews, wiring views, and accessory images should be managed as reusable material assets, not as text extraction targets.

## Current Implementation

The current app already includes:

- Next.js App Router application structure
- React and Tailwind CSS v4 UI
- File-system-first local workspace model
- Standard folder scanning
- Local JSON indexing for documents
- Image manifest indexing
- Material card API combining refined cards, raw candidates, and image cards
- TIFF image preview support through `sharp`
- Per-folder prompt storage
- LLM extraction route targeting local raw JSON
- Left material library with collapsible folders
- Center workspace with multiple pages and material blocks
- Drag/drop and add-button material placement
- Page add, delete, clear, and block remove controls

The product is still an MVP. Export and final presentation generation are not complete yet.

## Key API Routes

Inside `pm-material-hub/src/app/api/`:

- `POST /api/index/local`: generate or refresh local JSON indexes
- `GET /api/materials/cards`: convert local and refined indexes into frontend material cards
- `GET /api/assets/image`: serve local image assets and thumbnails, including TIFF conversion
- `POST /api/extract/batch`: run LLM extraction against local raw JSON
- `GET/POST /api/settings/prompts`: read and write per-folder prompt templates
- `GET /api/sync`: sync workspace folder and file status

## Tech Stack

- Framework: Next.js App Router
- Frontend: React, Tailwind CSS v4
- Backend: Next.js API routes running on Node.js
- Local parsing: `pdf-parse`, `officeparser`, `mammoth`, `xlsx`, `sharp`
- Scanned PDF OCR: `Tesseract.js`, `pdfjs-dist`, `@napi-rs/canvas`
- LLM client: OpenAI-compatible API client
- Data model: local file system plus JSON indexes

## Local Development

Open a terminal in the app directory:

```powershell
cd "C:\Users\Administrator\Desktop\Product Management\pm-material-hub"
```

Install dependencies:

```powershell
npm.cmd install
```

Start the development server:

```powershell
npm.cmd run dev
```

Build the project:

```powershell
npm.cmd run build
```

Use `npm.cmd` on Windows. This avoids PowerShell execution-policy issues with `npm.ps1`.

The development script intentionally uses webpack:

```powershell
next dev --webpack
```

This is because Turbopack dev mode previously had Windows local serving issues in this project.

## Useful Local Commands

Generate the product master-data index:

```powershell
npm.cmd run index:local -- --folder-prefix 01 --force
```

Generate technical-manual indexes:

```powershell
npm.cmd run index:local -- --folder-prefix 03 --force
```

Generate image manifests:

```powershell
npm.cmd run index:local -- --folder-prefix 08 --force
```

## Project Structure

```text
Product Management/
|-- README.md
|-- .gitignore
|-- Slides_Template/
|   `-- template_Business graphic.pptx
`-- pm-material-hub/
    |-- AGENTS.md
    |-- package.json
    |-- package-lock.json
    |-- scripts/
    |-- public/
    |-- src/
    |   |-- app/
    |   |-- lib/
    |   `-- app/api/
    `-- data/                 generated locally, ignored by Git
```

## Roadmap

### Completed

- Initialize Next.js and Tailwind application
- Establish local-first file-system architecture
- Define standard material folder model
- Configure local material workspace support
- Implement local document indexing
- Implement local image indexing
- Implement material card aggregation API
- Implement basic multi-page workspace UI
- Implement drag/drop and add-button material placement
- Implement LLM extraction route against raw JSON indexes

### In Progress / Next

- Refine folder-specific prompts and extraction quality
- Clean UI text encoding and terminology
- Improve material card ranking and filtering
- Add one-click copy/save actions for sales-ready snippets and images
- Improve page layout generation from selected material cards
- Add right-side editing controls for titles, audience, layout, and visual treatment

### Target End State

- Generate Siemens-style HTML presentation pages from selected materials
- Recommend images from the curated local image pool
- Export selected pages as a standalone HTML file
- Inline images as Base64 for portable delivery
- Support browser opening and keyboard navigation without external dependencies

## Git Hygiene

Before committing, check that the Git change list does not contain:

- `pm-material-hub/data/`
- `pm-material-hub/config/settings.json`
- `pm-material-hub/node_modules/`
- `pm-material-hub/.next/`
- user manuals, images, PPT decks, Excel files, or generated local indexes

The shared repository should represent the application and template, not a PM's private material library.

## Notes for Future Development

- Preserve the local-first, no-database architecture unless there is a strong product reason to change it.
- Keep the interaction model visual and workspace-driven rather than chatbot-first.
- Treat original PM materials as private local files.
- Treat generated JSON as rebuildable local cache.
- Keep the PowerPoint template in Git because it is part of the shared generation baseline.
- Avoid broad encoding rewrites unless the task is explicitly to clean encoding across the project.
