# PM Material Hub - Agent Handoff

本文档同时面向后续 Codex/Agent 和人工开发者。English and Chinese are both included where helpful. Keep this file current when product behavior changes.

## Product Goal / 产品目标

PM Material Hub is a local-first Product Manager workspace. It turns local product files into reusable material cards and generates editable HTML PPT pages from a visual workspace.

PM Material Hub 是本地优先的产品经理工作台：本地资料生成物料卡，PM 拖拽组合页面，应用生成可编辑的 HTML 版本 PPT。

The product is not chatbot-first. The PM should mostly work through material cards, page slots, PPT previews, and scenario templates.

## Hard Runtime Boundary / 运行边界

Codex is a development and testing tool only. Production generation must run through application code, scripts, configured model services, and local files.

Codex 只用于开发和测试。正式使用时，物料生成、PPT 预览、PM 精选、HTML PPT 生成和导出都必须由应用、脚本、skill/模型配置和本地文件独立完成。

Do not design a feature that requires a Codex conversation at runtime.

## Workspace / 工作区

Default user material workspace:

```text
C:\Users\Administrator\Documents\PM_Materials
```

App settings:

```text
config/settings.json
```

Do not assume source materials live in this repository.

## Standard Folders / 标准文件夹

Use these exact folder names:

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

Folder behavior belongs in:

```text
src/lib/materialProfiles.ts
```

`01_产品物料表格` is authoritative product master data. Other folders may link to MLFBs but should not silently overwrite master data.

## Implemented Frontend Behavior / 已实现前台行为

The main UI supports:

- left material library with folder groups
- local index controls
- multi-page workspace
- drag/drop and add-button placement
- page add/delete/clear
- current workspace draft persistence
- latest generated HTML preview persistence
- normal layouts plus scenario template layouts
- PPT original page preview
- PPT box selection and Favorite card creation
- preview page with return and export buttons

Current normal layouts include single-card, equal columns, large-left/two-right, equal rows, and four-grid.

Scenario template layouts are now preferred for real Siemens-style fixed page designs.

## PPT/PPTX Contract / PPT 处理契约

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

For PPT favorite cards in PM-selected content, no extra “select content” button is needed. For PDF/manual/Word cards, content-selection controls should remain.

## HTML PPT Generation / HTML PPT 生成

Main route:

```text
POST /api/presentations/generate-html
```

Preview route:

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

Generation is handled in:

```text
src/lib/htmlPresentationGenerator.ts
```

Generation rules:

- Workspace cards define content and rough structure.
- Kimi/OpenAI-compatible model rewrites titles, bullets, and scenario-slot copy.
- Deterministic renderer outputs final HTML.
- Text must remain editable through `contenteditable`.
- Original full PPT pages should stay image-only.
- Internal card notes and image usage hints must not appear in final PPT.
- Generated preview metadata must remain available after returning to the main page.

## Templates / 模板

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
- For `scenario-capability-grid-2`, section titles are fixed by the renderer to avoid broken model-generated titles.

When adding a new real PPT scenario template:

1. Put the PPTX in `Slides_Template/Scenario_Layouts/`.
2. Provide or generate a clean background/preview image.
3. Define slots in `src/lib/scenarioTemplateLayouts.ts`.
4. Keep the PPT design as background and only replace active regions.
5. Build and test with generated preview.

Helper:

```text
scripts/inspect-scenario-template.cjs
```

This can inspect PPTX geometry, but complex templates still need human review.

## Image Rules / 图片规则

Image route:

```text
GET /api/assets/image
```

Normal image cards default to light-background removal through:

```text
src/lib/imageBackgroundRemoval.ts
```

Do not force background removal on full original PPT slide previews. They must preserve original slide appearance.

## Model Rules / 模型规则

The configured LLM client is OpenAI-compatible and commonly used with Moonshot/Kimi.

Model usage should:

- read local JSON or bounded context, not raw source files directly
- preserve factual IDs, MLFBs, standards, certificate numbers, prices, and dates
- write Chinese presentation copy for PM users
- avoid unsupported technical claims
- avoid exposing source filenames, chunk IDs, or internal extraction notes in final slides
- fit scenario slot sizes by shortening copy, not by dumping raw text

If the model fails, deterministic fallback is allowed, but it must be labelled internally and must not invent claims.

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

## Development Notes / 开发注意

- Use `npm.cmd`, not `npm`, on Windows PowerShell.
- `npm.cmd run dev` uses webpack because Turbopack dev had local Windows serving issues.
- `npm.cmd run build` currently passes. A Turbopack NFT tracing warning around `settings/prompts/route.ts` may still appear and has not blocked builds.
- Keep UI language non-technical and PM-oriented.
- Do not expose API keys from `config/settings.json`.
- Do not delete user source files.
- Do not commit generated `data/`, local settings, `.next/`, or `node_modules/`.
- Prefer structured parsing and deterministic validation over brittle string-only hacks.
- Keep edits scoped to the current product behavior unless the user explicitly asks for refactoring.
