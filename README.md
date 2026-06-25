# PM Material Hub

PM Material Hub is a local-first product-material workspace for Product Managers. It converts local business and technical files into reusable material cards, lets PMs assemble those cards visually, and generates editable HTML-style presentation pages that follow Siemens-style templates.

The project is intentionally not a chatbot product. The primary workflow is a visual material library plus a multi-page workspace.

## What This Repository Contains

This repository contains:

- The Next.js application in `pm-material-hub/`
- Local indexing and utility scripts
- Shared presentation templates in `Slides_Template/`
- Scenario-layout template assets in `Slides_Template/Scenario_Layouts/`
- Project and agent documentation

This repository should not contain:

- Individual PM source materials
- Customer files, private manuals, certificates, price files, or generated indexes
- Local model settings or API keys
- `node_modules/`, `.next/`, or other build outputs

Each PM keeps their real source-material workspace outside Git and points the app to that workspace through local settings.

## Current Product Workflow

1. PM places files in the standard local material workspace.
2. The app scans the workspace and generates local JSON indexes.
3. Optional Kimi/OpenAI-compatible model extraction refines local JSON into reusable material cards.
4. PM reviews material cards and drags selected cards into one or more workspace pages.
5. For PPT/PPTX source pages, PM can preview a single original slide and use box selection plus **Favorite** to create a PM-selected content card.
6. PM chooses a normal layout or a scenario template layout.
7. The app generates an HTML PPT preview through scripts, deterministic renderers, and the configured model.
8. PM reviews the preview, returns to the workspace if needed, and exports the standalone HTML file.

The generated HTML presentation keeps text editable through `contenteditable` fields. It is intended as an HTML version of a PPT deck, not as a screenshot-only export.

## Independent Runtime Requirement

Codex is only used for development and testing. The production flow must work without Codex.

On a clean machine with the application, dependencies, Office/PowerPoint where needed, local materials, and model settings, the app must independently perform:

- Local parsing and JSON indexing
- PPT/PPTX native preview rendering
- PM favorite selection from original PPT pages
- Material-card loading and workspace persistence
- Kimi/OpenAI-compatible model generation
- HTML PPT preview creation
- HTML export

When no model is configured, deterministic local indexes and non-model material cards should still work. Model-refined cards and model-generated HTML copy will be unavailable.

## Standard Material Workspace

The user's source-material path is configured locally in:

```text
pm-material-hub/config/settings.json
```

The standard folders are:

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

Folder `01_产品物料表格` is the authoritative product master-data source. Other folders may link back to master records through normalized MLFB values, but MLFB is not the universal card granularity.

## PPT/PPTX Behavior

PPT/PPTX files are handled as two layers:

- Original page layer: every source slide remains available as a draggable original-page card with a real PowerPoint-rendered PNG preview.
- Refined content layer: optional model extraction creates reusable PM material cards from local `raw.json`.

The original page layer must never be replaced or hidden by refined cards.

PM-selected PPT content works through the original slide preview:

1. Open a PPT page preview.
2. Drag a rectangle over the content area to select.
3. Click **Favorite**.
4. The app creates a reusable selection card.
5. That card can be dragged into normal layouts or scenario-template slots.

If the PM drags a full original PPT page into the workspace, the generated HTML should preserve that page as an image-only original slide.

## Presentation Generation

HTML generation is implemented in the application, not by Codex.

The generation pipeline uses:

- Workspace pages and dragged cards as content structure
- `Slides_Template/template_Business graphic.pptx` as the broad style library
- Scenario templates under `Slides_Template/Scenario_Layouts/` for fixed business page layouts
- Kimi/OpenAI-compatible model calls for title, copy rewriting, condensation, and slot-aware bullet writing
- Deterministic HTML rendering and validation-oriented fallback logic
- Local image embedding and automatic light-background removal for normal image cards

The app keeps the latest generated preview metadata in the workspace draft so PMs can return from the preview page and still open or export the last generated result.

## Scenario Layout Templates

Scenario templates are fixed-layout HTML PPT pages based on real PPT designs.

Template files live in:

```text
Slides_Template/Scenario_Layouts/
```

Current scenario templates:

- `Siemens_PM_Scenario_Templates_1.pptx`
- `Siemens_PM_Scenario_Templates_2.pptx`

Each scenario template needs:

- A source PPTX file
- A preview/background image used by the HTML renderer
- A slot configuration in `pm-material-hub/src/lib/scenarioTemplateLayouts.ts`

Slots define which areas accept dragged content. A slot can be text, bullet, or image. Auto-title slots are generated by the model/rendering layer and are not draggable.

For complex real PPT templates, active regions are configured manually or semi-automatically from annotated screenshots and PPT geometry. The red or numbered annotations used during analysis must not appear in the final preview image.

## Image Behavior

Images in `08_产品图片素材` are first-class material cards.

Normal image cards are processed with light-background removal so white or light gray backgrounds become transparent before being embedded in generated HTML. Original PPT slide previews and PM-selected PPT regions are not forcibly background-removed because they may need to preserve the original slide appearance.

## Main App

See:

- English app README: `pm-material-hub/README.md`
- Chinese app README: `pm-material-hub/README.zh-CN.md`
- Agent handoff: `AGENTS.md` and `pm-material-hub/AGENTS.md`

Common commands:

```powershell
cd "C:\Users\Administrator\Desktop\Product Management\pm-material-hub"
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

Use `npm.cmd` on Windows to avoid PowerShell execution-policy issues with `npm.ps1`.
