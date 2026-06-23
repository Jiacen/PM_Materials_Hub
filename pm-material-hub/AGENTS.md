# PM Material Hub - Project Context for AI Agents

## 1. Product Goal

PM Material Hub is a local-first material management and HTML presentation workspace for Siemens-style Product Managers.

The intended user flow is:

1. PM puts source materials into a standard local workspace folder.
2. The app compresses source files into local JSON indexes first.
3. Optional LLM extraction refines those local JSON indexes into cleaner material cards.
4. PM drags material cards into one or more HTML PPT pages.
5. The app eventually exports a standalone HTML presentation.

The MVP priority is not a chatbot. The preferred interaction model is a visual material-card library plus a multi-page workspace.

## 2. Current Workspace

The active material workspace is:

`C:\Users\Administrator\Documents\PM_Materials`

The app setting is stored in:

`config/settings.json`

Do not assume materials are stored inside the repository. The repository stores generated local indexes under `data/`, while original user files stay in the workspace above.

## 3. Standard Folders

The folder names must match the user's actual workspace. Use these exact names:

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

The `04` folder was renamed by user request. Keep `04_Slides_Technical&Sales`.

## 3.1 PM Material Taxonomy and Card Goals

The folder name defines the intended material-card granularity. Do not use one universal extraction schema for all folders, and do not turn every detected MLFB into a primary card.

| Folder | Primary card goals | MLFB role |
| --- | --- | --- |
| `01_产品物料表格` | Product master data, model, ordering information, SAP information, price, and lifecycle | Authoritative master index |
| `02_Catalogue_产品样本` | Product family, positioning, core benefits, and selection scope | Important product/model field |
| `03_Manual_产品技术手册` | Product, module, technical parameter, function, installation limitation, and usage caution | Enforce complete model coverage |
| `04_Slides_Technical&Sales` | Product story, value proposition, technical highlight, application, comparison, and sales message | Related field only; must not dominate cards |
| `05_Sales_Reference_成功案例` | Customer pain, project background, solution, reason for selection, and implementation result | Relates the case to products used |
| `06_Sales_Fighting_Guide` | Competitor, differentiation, customer objection, evidence-based response, and sales strategy | Relates the guidance to a product scope |
| `07_文本资料` | Product introduction, release notice, and market information according to document type | Release notices may create separate model cards |
| `08_产品图片素材` | Product hero image, module image, application image, structure image, and scenario image | Used for image linking and retrieval |
| `09_认证证书` | Certificate, standard, region, certificate holder, and certified scope | Store covered models in `covered_mlfbs` |
| `10_FAQ_常见问题集` | Question, answer, applicable object, fault symptom, and resolution steps | Used to filter applicable models |

Core rules:

1. Process `01_产品物料表格` first. It is the authoritative product master-data source for normalized MLFBs, names, classifications, SAP/order information, prices, and lifecycle fields.
2. Other folders should link to the `01` master records through MLFB where possible. They must not silently overwrite master-data values.
3. MLFB-completeness enforcement is appropriate for product catalogues, technical manuals, product-master tables, and model release notices. It is not a default rule for slides, references, fighting guides, certificates, images, or FAQs.
4. For `04` through `06`, the primary card is normally a reusable PM idea or business narrative, not an individual ordering number.
5. Local parsing preserves source structure and evidence IDs. The LLM classifies and summarizes evidence into folder-specific card types.
6. Every refined card must retain evidence IDs. Unsupported claims must not be inferred from external knowledge.
7. Folder extraction behavior is configured in `src/lib/materialProfiles.ts`; keep it aligned with this taxonomy.

## 4. Tech Stack

- Framework: Next.js App Router
- Frontend: React, Tailwind CSS v4
- Backend: Next.js API routes on Node.js
- Local parsing: `pdf-parse`, `officeparser`, `mammoth`, `xlsx`, `sharp`
- LLM client: OpenAI-compatible API, currently configured for Moonshot/Kimi in `config/settings.json`
- Dev command: `npm.cmd run dev`
- Build command: `npm.cmd run build`

Important Windows note: use `npm.cmd`, not `npm`, because PowerShell may block `npm.ps1`.

The dev script intentionally uses webpack:

`next dev --webpack`

This was done because Turbopack dev had Windows local serving issues in this project.

## 5. Current Data Architecture

The project is file-system-first and has no database.

Generated local JSON indexes are stored under:

`data/local-json-indexes/<folderName>/`

Current index file types:

- `*.raw.json`: generated from PDF, Word, PPT, Excel, and text-like source documents. These contain metadata, source text chunks, candidate headings, MLFB candidates, and evidence chunk IDs.
- `*.image.json`: generated from image source files. These contain image metadata, dimensions, format, inferred tags, and usage hints.

LLM-refined extraction output is stored separately under:

`data/indexes/<folderName>/`

Current frontend material cards combine:

- refined AI cards from `data/indexes`
- raw candidate cards from `data/local-json-indexes`
- image cards from `*.image.json`

The intended rule is: raw JSON is the cheap local compression layer; LLM extraction should target the raw JSON, not the original PDF/Word/PPT.

## 6. Key Implemented APIs and Files

Important implemented APIs:

- `POST /api/index/local`: generate or refresh local JSON indexes for a selected folder.
- `GET /api/materials/cards`: convert local and AI JSON data into frontend material cards.
- `GET /api/assets/image`: safely serve local image assets and thumbnails, including TIFF conversion through `sharp`.
- `POST /api/extract/batch`: run LLM extraction against local raw JSON.
- `GET/POST /api/settings/prompts`: read/write per-folder prompt templates.
- `GET /api/sync`: sync workspace folder/file status.

Important implementation files:

- `src/lib/fileSystem.ts`: workspace and standard-folder scanning.
- `src/lib/localIndexer.ts`: local JSON index generation.
- `scripts/local-json-index.cjs`: CLI local index generator.
- `src/app/page.tsx`: main UI, library, material cards, multi-page workspace.

Useful CLI example:

`npm.cmd run index:local -- --folder-prefix 02 --force`

`npm.cmd run index:local -- --folder-prefix 08 --force`

## 7. Current Frontend State

The UI currently has:

- Left material library with collapsible folders.
- Right local JSON index panel with folder status and local index generation.
- Center workspace above material cards.
- Material cards below the workspace.
- Cards can be added by drag/drop or the small `Add` button.
- AI-refined cards are shown first.
- Raw candidate cards are grouped separately as fallback materials.
- Image material cards show thumbnails and can be added to the workspace.
- Workspace supports multiple pages.
- Each page can contain multiple material blocks.
- Users can add a page, delete the current page, clear the current page, and remove individual blocks.

The old top debug toolbar with `刷新卡片` and `AI Generate` has been hidden/removed from the user-facing UI because those controls were confusing placeholders.

## 8. Extraction and Prompt Rules

Each source folder can have its own `prompt.txt` inside the material folder.

For `03_Manual_产品技术手册`, the current design is:

1. Generate local raw JSON first.
2. Send the raw JSON chunks and candidates to the LLM.
3. Ask the LLM to produce concise, evidence-based product/module/accessory cards.
4. Do not merge unrelated MLFBs into one giant product.
5. Accessory and spare-part MLFBs should be separate `accessory` cards when appropriate.
6. The LLM must rely only on raw JSON evidence and should keep evidence chunk IDs.

Known issue to keep in mind: one earlier LLM extraction merged too many MLFBs into a single module card. The prompt was tightened, but this should be tested again when extraction is rerun.

## 9. Image Material Rule

Images in `08_产品图片素材` are treated as first-class material cards, not as text extraction targets.

An image card should represent:

- filename/title
- preview thumbnail
- format and dimensions
- inferred usage tags such as product hero, module front view, station overview, wiring/side view, or accessory
- direct asset URL for workspace preview

TIFF files are supported through the `/api/assets/image` route, which converts them for browser display.

## 10. Export Target

Final export target is still pending:

- Export selected workspace pages as one standalone HTML file.
- Images should be embedded or packaged so the output is portable.
- The export should behave like an HTML version of a PPT deck.

Do not treat export as complete yet.

## 11. Current Progress

- [x] Project initialization and Next.js/Tailwind structure.
- [x] Workspace path configured to `C:\Users\Administrator\Documents\PM_Materials`.
- [x] Standard folder mapping updated, including `04_Slides_Technical&Sales`.
- [x] Local JSON indexing for documents.
- [x] Local JSON/image manifest indexing for image folders.
- [x] LLM batch extraction route targets raw JSON instead of original documents.
- [x] Per-folder prompt storage.
- [x] Material card API for AI, raw, and image cards.
- [x] Collapsible left folder library.
- [x] Multi-page workspace with multi-block pages.
- [x] Drag/drop and small `Add` button for cards.
- [x] Page add/delete/clear and block remove controls.
- [ ] Refine prompts and validate extraction quality across more source folders.
- [ ] Build proper slide/page generation from selected material blocks.
- [ ] Implement standalone HTML export.
- [ ] Polish UI text, encoding, and final presentation layout.

## 12. Known Technical Notes

- Some UI source text may appear as mojibake in `src/app/page.tsx`; avoid broad rewrites unless intentionally cleaning encoding.
- `npm.cmd run build` passes. A Turbopack NFT tracing warning may appear around `settings/prompts/route.ts`; it has not blocked builds.
- The user may run `start-dev.cmd` manually. If the browser cannot connect to port 3001, ask the user to restart `start-dev.cmd`.
- Do not reveal or print API keys from `config/settings.json`.
- Do not delete user material files. Generated index files should also be handled carefully.

## 13. Agent Working Rules

- Keep edits scoped and practical.
- Preserve the local-first/no-database architecture.
- Prefer structured parsing and JSON generation over ad hoc string hacks.
- When adding document-category behavior, keep folder-specific prompts and schemas in mind.
- When changing the UI, keep the Siemens-style PM workflow: workspace first, material cards below, folder library on the left, local index controls on the right.
- The user prefers non-technical UI language and a visual card/workspace workflow over chatbot-style interaction.
