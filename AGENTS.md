# Product Management Workspace - Agent Guide

本文档是主目录 Agent 规则。子应用还有更详细的文档：

```text
pm-material-hub/AGENTS.md
```

## Scope / 范围

This workspace contains the PM Material Hub project and shared presentation templates.

当前主目录包含：

- `pm-material-hub/`：Next.js 应用
- `Slides_Template/`：共享 PPT 风格模板和场景模板
- `README.md` / `README.zh-CN.md`：项目说明

## Product Boundary / 产品边界

Codex is only for development and testing. Production behavior must run through the application, local scripts, configured model services, and local files.

Codex 只用于开发和测试。正式运行时不能依赖 Codex 对话；必须依赖应用代码、脚本、配置好的 Kimi/OpenAI-compatible 模型和本地文件。

## Runtime Goal / 运行目标

The app should work on a clean PM machine with:

- the project files
- installed dependencies
- local PM source materials
- Microsoft Office/PowerPoint when PPT previews are needed
- optional Kimi/OpenAI-compatible model settings

It should support local indexing, material cards, PPT favorite selection, HTML PPT preview generation, and HTML export without Codex.

## Template Rules / 模板规则

Shared templates live in:

```text
Slides_Template/
```

Scenario templates live in:

```text
Slides_Template/Scenario_Layouts/
```

`template_Business graphic.pptx` is the broad visual/style reference. Real scene-specific designs should be added as scenario templates with fixed active regions.

When adding or changing scenario templates:

1. Keep the PPTX in `Slides_Template/Scenario_Layouts/`.
2. Create or update a clean preview/background image.
3. Configure active slots in `pm-material-hub/src/lib/scenarioTemplateLayouts.ts`.
4. Do not leave analysis annotations such as red boxes or numbers in final preview images.

## Safety / 安全

Do not commit:

- PM private source files
- generated `pm-material-hub/data/` files
- `pm-material-hub/config/settings.json`
- API keys
- `.next/`
- `node_modules/`

Do not delete user material files. If cleanup is needed, remove only one explicit generated file at a time and avoid batch deletion.

## Development / 开发

Main app directory:

```powershell
cd "C:\Users\Administrator\Desktop\Product Management\pm-material-hub"
```

Common commands:

```powershell
npm.cmd run dev
npm.cmd run build
```

Use `npm.cmd` on Windows.

For implementation details, always read:

```text
pm-material-hub/AGENTS.md
```
