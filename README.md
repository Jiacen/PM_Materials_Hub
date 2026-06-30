# PM Material Hub

PM Material Hub is a local-first workspace for Product Managers. It helps PMs turn private local product materials into reusable material cards, assemble those cards visually, and generate editable HTML presentation pages.

This project is designed to run on a PM's own Windows machine. It is not currently positioned as a VPS-hosted SaaS product.

## Why Local

PM source materials often include product masters, manuals, sales decks, certificates, price references, customer cases, and internal notes. These files should stay on the user's machine.

The application also relies on Microsoft PowerPoint for true PPT/PPTX page previews and PM-selected slide regions. A typical VPS, especially Linux, does not provide that environment.

## One-Click Windows Start

After downloading and extracting a GitHub release, double-click one of these files in the repository root:

```text
启动 PM Material Hub.cmd
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

For `03_Manual_产品技术手册`, local JSON indexing only creates raw source and MLFB candidate cards. Refined per-MLFB cards are generated only after the model extraction step.

## Repository Contents

```text
pm-material-hub/                  Next.js local app
Slides_Template/                  Shared PPT style templates
Slides_Template/Scenario_Layouts/ Scenario layout templates and previews
启动 PM Material Hub.cmd           Chinese one-click launcher
Start PM Material Hub.cmd         English one-click launcher
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
