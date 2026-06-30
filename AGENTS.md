# Product Management Workspace - Agent Guide

This workspace contains PM Material Hub and shared presentation templates.

## Product Direction

PM Material Hub is a local-first Windows tool for Product Managers. The current product direction is not VPS-first and not SaaS-first.

Runtime behavior must work through the application, bundled/local scripts, configured model services, Microsoft PowerPoint where needed, and local files. Codex is only for development and testing.

## Repository Scope

```text
pm-material-hub/                  Next.js local app
Slides_Template/                  shared PPT style templates
Slides_Template/Scenario_Layouts/ scenario templates and preview assets
启动 PM Material Hub.cmd           user-facing Chinese launcher
Start PM Material Hub.cmd         user-facing English launcher
```

For implementation details, always read:

```text
pm-material-hub/AGENTS.md
```

## Local Green Runtime

The user-facing path is one-click local startup from the release package:

```text
启动 PM Material Hub.cmd
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

Do not optimize for VPS deployment unless the user explicitly reopens that direction. VPS environments normally lack Microsoft PowerPoint, which is required for true PPT/PPTX page previews and PM-selected slide regions.

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
