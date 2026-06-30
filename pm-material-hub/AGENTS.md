# PM Material Hub - Agent Handoff

This document is for Codex/agents and human developers working on the app.

## Product Goal

PM Material Hub is a Windows local Product Manager workspace. It turns local product files into reusable material cards and generates editable HTML PPT pages from a visual workspace.

PMs should primarily work through material cards, page slots, PPT previews, Favorite selections, and scenario templates.

## Runtime Boundary

Codex is a development and testing tool only. Production behavior must run through application code, local scripts, configured model services, Microsoft PowerPoint where needed, and local files.

Do not design runtime features that require a Codex conversation.

## User-Facing Startup

Release packages should be usable through one-click Windows launchers:

```text
../Start PM Material Hub.cmd
start-dev.cmd
```

The launcher should:

- find Node.js/npm or a future portable runtime under `runtime/node/`
- install dependencies on first run when `node_modules/` is absent
- start the app on `http://127.0.0.1:3001/`
- open the browser automatically

Developer commands remain available, but should not be required from ordinary users.

## Workspace

Default example material workspace:

```text
C:\Users\<User>\Documents\PM_Materials
```

App settings:

```text
config/settings.json
```

Do not assume source materials live in this repository.

## Standard Folders

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

Folder behavior belongs in:

```text
src/lib/materialProfiles.ts
```

`01_产品物料表格` is authoritative product master data. Other folders may link to MLFBs but should not silently overwrite master data.

## Local Indexing Contract

`POST /api/index/local` is deterministic local indexing. It must not call the LLM.

Local indexing may create:

- raw document cards
- MLFB candidate cards
- image manifest cards
- original PPT page cards and native slide previews
- deterministic manual chapter digests for folder 03

Local indexing must not create refined cards or hard-coded pilot cards.

For `03_Manual_产品技术手册`, local indexing is chapter based. It should split manuals by detected chapter headings and create a deterministic digest per chapter without calling the LLM. The digest should preserve overview lines, parameter facts, procedure rules, warnings or limits, lifecycle facts, evidence snippets, and MLFB candidates. LLM refinement should read these bounded digests, not full manual chapters.

Do not implement folder 03 as one refined card per MLFB. Folder 03 refined cards are chapter/theme cards such as installation, wiring, configuration, commissioning, diagnostics, maintenance, safety notes, limitations, and technical specifications. MLFB values may appear only as `related_mlfbs` tags filtered through the folder 01 product master data.

Folder 03 must filter low-value material during both local digest generation and model-output validation: vulnerability notices, security update notifications, automatic notification options, signed firmware or firmware update notices, generic cybersecurity advisories, data/archive integrity reminders, marketing copy, copyright/trademark/disclaimer text, repeated warning boilerplate, and empty placeholders should not become cards.

## Refined Card Contract

Refined cards are generated from local raw JSON or bounded context through the configured model service.

For folders where MLFB coverage is enforced, such as folder 02 catalogue extraction, the target is one reusable card per whitelisted MLFB when the source evidence supports it. If the model merges multiple MLFB values into one card, server-side logic should split or backfill coverage without inventing unsupported facts.

Folder 03 is the exception: it is chapter/theme based and must not use MLFB coverage backfill.

Refined cards must preserve factual IDs, MLFBs, standards, certificate numbers, prices, and dates.

## PPT/PPTX Contract

PPT/PPTX has two independent material layers:

1. Original slide pages as draggable `slide` cards with true PowerPoint-rendered PNG previews.
2. Refined reusable cards generated from local `raw.json` by the configured model.

Never let refined cards replace or hide original slide cards.

Native previews:

- rendered with installed Microsoft PowerPoint on Windows
- cached under `data/slide-previews/`
- not reconstructed from JSON
- WPS Office is not supported

If native rendering is unavailable, show explicit preview-unavailable UI. Do not fake an original slide.

PM Favorite selection:

- implemented through `POST /api/presentations/favorite-selection`
- uses the original slide preview image
- crops the user-selected rectangle
- creates a reusable `ppt_selection` card

## HTML PPT Generation

Main route:

```text
POST /api/presentations/generate-html
```

Preview routes:

```text
GET /api/presentations/preview/[id]
GET /api/presentations/preview/[id]?download=1
```

Generated files:

```text
data/generated-html/
```

Workspace draft:

```text
GET/POST/DELETE /api/workspace/draft
data/workspace-draft.json
```

Generation rules:

- Workspace cards define content and rough structure.
- Kimi/OpenAI-compatible model rewrites titles, bullets, and scenario-slot copy.
- Deterministic renderer outputs final HTML.
- Text must remain editable through `contenteditable`.
- Original full PPT pages stay image-only.
- Internal card notes, source filenames, chunk IDs, and image usage hints must not appear in final PPT.
- Generated preview metadata must remain available after returning to the main page.

## Templates

Broad style library:

```text
../Slides_Template/template_Business graphic.pptx
```

Scenario layouts:

```text
../Slides_Template/Scenario_Layouts/
src/lib/scenarioTemplateLayouts.ts
```

Current scenario templates:

- `scenario-product-benefits-1`
- `scenario-capability-grid-2`

Scenario template rules:

- Slots are fixed active regions.
- Auto-title slots are not draggable.
- Text slots accept document/manual/refined/PPT-selection cards and render rewritten text.
- Image slots accept image/slide/PPT-selection cards and render embedded images.
- Red boxes or numbers used in annotated screenshots are analysis marks only and must not appear in final preview assets.

## Image Rules

Image route:

```text
GET /api/assets/image
```

Normal image cards default to light-background removal through:

```text
src/lib/imageBackgroundRemoval.ts
```

Do not force background removal on full original PPT slide previews. They must preserve original slide appearance.

## Model Rules

The configured LLM client is OpenAI-compatible and commonly used with Moonshot/Kimi.

Model usage should:

- read local JSON or bounded context, not raw source files directly
- preserve factual IDs, MLFBs, standards, certificate numbers, prices, and dates
- write Chinese presentation copy for PM users
- avoid unsupported technical claims
- avoid exposing source filenames, chunk IDs, or internal extraction notes in final slides
- fit scenario slot sizes by shortening copy, not by dumping raw text

If the model fails, deterministic fallback is allowed, but it must be labelled internally and must not invent claims.

## Local JSON Technology Notes

Local JSON generation is implemented mainly in:

```text
src/lib/localIndexer.ts
src/lib/extractors.ts
```

Use local deterministic parsers before model calls:

- `xlsx` for Excel product master rows
- `mammoth` for Word `.docx` raw text
- `pdf-parse` for PDF text
- presentation extraction helpers for PPT/PPTX text, tables, notes, slide numbers, and evidence IDs
- `sharp` for image metadata and image manifests
- Microsoft PowerPoint COM automation only for true PPT/PPTX PNG page previews

The configured model should receive bounded JSON from `data/local-json-indexes/`, never raw source files directly.

## Important API Routes

- `POST /api/index/local`
- `GET /api/materials/cards`
- `GET /api/materials/catalog`
- `POST /api/materials/context`
- `POST /api/extract/batch`
- `GET /api/assets/image`
- `GET /api/assets/slide-preview`
- `GET /api/assets/scenario-template`
- `POST /api/presentations/favorite-selection`
- `POST /api/presentations/generate-html`
- `GET /api/presentations/preview/[id]`
- `GET/POST/DELETE /api/workspace/draft`
- `GET/POST /api/settings/llm`
- `GET/POST /api/settings/prompts`

## Development Notes

- Use `npm.cmd`, not `npm`, on Windows PowerShell.
- `npm.cmd run dev` uses webpack because Turbopack dev had local Windows serving issues.
- `npm.cmd run build` currently passes. A Turbopack NFT tracing warning around `settings/prompts/route.ts` may still appear and has not blocked builds.
- Keep UI language non-technical and PM-oriented.
- Do not expose API keys from `config/settings.json`.
- Do not delete user source files.
- Do not commit generated `data/`, local settings, `.next/`, or `node_modules/`.
- Prefer structured parsing and deterministic validation over brittle string-only hacks.
- Keep edits scoped to current product behavior unless the user explicitly asks for refactoring.
