---
name: standalone-material-pipeline
description: Enforce and implement a Codex-independent material production pipeline for PM Material Hub. Use when adding or revising local indexing, folder-specific card generation, PPT page preservation, LLM extraction or refinement, validation, persistence, previews, deployment, or cross-machine reproducibility for any material folder.
---

# Standalone Material Pipeline

Treat runtime independence as a hard product requirement. Codex develops and tests the platform; Codex never produces cards in the deployed workflow.

## Implementation Contract

1. Implement reusable behavior in application code, scripts, APIs, schemas, prompts, and validators.
2. Read source files through the configured local workspace and generate rebuildable indexes under `data/`.
3. Run model work only through the application's configured OpenAI-compatible client.
4. Validate model output before persistence. On failure, keep deterministic evidence-backed output where available.
5. Persist generated artifacts so the frontend reads platform output rather than Codex-authored files.
6. Ensure a clean installation on another machine can process arbitrary new supported files without a Codex conversation.
7. Keep deterministic local materials available when the model is unconfigured; disable only model-refined output.

## Folder Rules

- Preserve folder-specific schemas and card granularity. Do not apply one universal prompt or card type.
- Treat folder `01` as authoritative product master data where MLFB membership is required.
- For PPT/PPTX, preserve every source page and separately generate reusable refined cards.
- Render original PPT/PPTX pages through a real presentation engine and cache true page PNGs. Never present JSON-derived text layouts as original slide previews.
- Group multiple PPT/PPTX files by source file. Make each file, its refined cards, and its original pages independently collapsible.
- Do not add a generic raw-document card for PPT/PPTX when page cards already preserve the complete source.
- Keep evidence IDs, source filenames, page numbers, technical values, and scope qualifiers through every stage.

## PPT/PPTX Three-Layer Workflow

Implement the user workflow in this order:

1. Sync the material workspace so the application discovers new, changed, and removed presentations.
2. Run `POST /api/index/local` from the “生成 / 更新本地 JSON” action.
3. For every PPT/PPTX, generate:
   - one independent `*.raw.json` containing slide text, lists, tables, notes, image references, page numbers, and `slide_XXXX` evidence IDs
   - true original-page PNG renders cached under `data/slide-previews/`
   - an updated folder-level `_folder.catalog.json`
4. Run `POST /api/extract/batch` from the advanced LLM extraction action.
5. Read only the PPT/PPTX `raw.json`, never the source presentation, for model extraction.
6. Generate one independent `*.meta.json` for each presentation.
7. Validate candidate cards before publishing them:
   - require valid slide evidence
   - reject one-card giant-deck merges and excessive MLFB aggregation
   - write candidates separately and back up the current published file before replacement
8. If model output fails validation, publish an evidence-linked deterministic topic fallback where supported and label it as `deterministic-fallback`.

Use `_folder.catalog.json` only as a lightweight routing index. It must reference source files, raw indexes, refined indexes, counts, topics, evidence IDs, renderer type, generation method, and `ready / missing / stale / orphaned` states without duplicating full document content.

Use `/api/materials/context` to retrieve bounded context after catalog routing. Limit the number of source files, refined cards, and evidence pages returned to the model.

Require Microsoft PowerPoint on Windows for true PPT/PPTX PNG preview generation. If unavailable, retain JSON indexing and model extraction but show preview unavailable explicitly.

## Verification

Before completion:

- Run the production build.
- Exercise the relevant application API without Codex-authored intermediate data.
- Verify generated cards load after a browser refresh.
- Verify the catalog marks source, local-index, and refined-index freshness correctly.
- Verify bounded context retrieval returns only requested files/cards/pages.
- Verify an invalid model result cannot overwrite a valid published refined index.
- Verify failure or missing-model behavior does not break deterministic local materials.
- Confirm no runtime code imports or invokes Codex-only skills, conversations, or desktop tooling.
