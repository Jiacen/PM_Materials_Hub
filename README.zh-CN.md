# PM Material Hub 中文说明

PM Material Hub 是一个本地优先的产品物料工作台，面向产品经理使用。它把本地业务资料和技术资料整理成可复用的物料卡片，让 PM 通过拖拽方式组合页面，并生成符合西门子风格的 HTML 版本 PPT。

这个项目不是聊天机器人。核心交互是“左侧物料库 + 中间工作区 + 生成预览 + 导出 HTML”。

## 仓库包含什么

本仓库包含：

- `pm-material-hub/` 下的 Next.js 应用
- 本地索引和工具脚本
- `Slides_Template/` 下的共享 PPT 模板
- `Slides_Template/Scenario_Layouts/` 下的场景模板素材
- 项目说明和 Agent 交接文档

本仓库不应包含：

- PM 个人源资料
- 客户文件、私有手册、证书、价格文件或生成索引
- 本地模型配置或 API key
- `node_modules/`、`.next/` 等依赖和构建输出

每个 PM 的真实资料库保留在 Git 仓库外部，通过本地设置指向应用。

## 当前产品流程

1. PM 将资料放入标准本地物料工作区。
2. 应用扫描文件并生成本地 JSON 索引。
3. 可选：调用 Kimi 或 OpenAI-compatible 模型，把本地 JSON 精炼成可复用物料卡。
4. PM 查看物料卡，并把需要的卡片拖拽到一个或多个工作区页面。
5. 对 PPT/PPTX 原始页面，PM 可以在单页预览中框选内容，并点击 **Favorite** 生成“PM 精选内容”卡片。
6. PM 选择普通布局或场景模板布局。
7. 应用基于脚本、确定性渲染器和配置好的模型生成 HTML PPT 预览。
8. PM 在预览页检查效果，需要调整时返回工作区；确认后导出独立 HTML 文件。

生成的 HTML PPT 中，文字区域是 `contenteditable`，可以直接编辑。它的目标是 HTML 版本的 PPT，而不是纯截图导出。

## 独立运行要求

Codex 只用于开发和测试，不属于生产流程。

在一台只安装应用、依赖、必要 Office/PowerPoint、本地资料和模型配置的电脑上，应用必须能独立完成：

- 本地解析和 JSON 索引
- PPT/PPTX 原始页预览渲染
- PM 对原始 PPT 页面的框选精选
- 物料卡加载和工作区保存
- Kimi 或 OpenAI-compatible 模型生成
- HTML PPT 预览生成
- HTML 导出

没有配置大模型时，本地确定性索引和非模型物料仍应可用；模型精炼卡片和模型生成文案不可用。

## 标准物料工作区

用户真实源资料路径配置在：

```text
pm-material-hub/config/settings.json
```

标准文件夹为：

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

`01_产品物料表格` 是权威产品主数据来源。其他文件夹可以通过标准化 MLFB 关联主数据，但 MLFB 不是所有资料的通用卡片粒度。

## PPT/PPTX 处理逻辑

PPT/PPTX 文件分为两层：

- 原始页面层：每一页源 PPT 都保留为可拖拽的原始页卡片，并使用 PowerPoint 真实导出的 PNG 预览。
- 精炼内容层：可选的大模型提取会基于本地 `raw.json` 生成可复用 PM 物料卡。

原始页面层不能被精炼卡片替代或隐藏。

PM 精选内容流程：

1. 打开某一页 PPT 的单页预览。
2. 在预览图上拖拽框选需要的内容。
3. 点击 **Favorite**。
4. 应用生成一个可复用的精选内容卡片。
5. 该卡片可以拖到普通布局或场景模板的活动区域中。

如果 PM 直接拖入完整原始 PPT 页面，生成 HTML 时应完整保留该页面为图片型原始页。

## PPT 生成逻辑

HTML 生成由应用完成，不依赖 Codex。

生成链路使用：

- 工作区页面和拖拽卡片作为内容与结构来源
- `Slides_Template/template_Business graphic.pptx` 作为整体视觉风格库
- `Slides_Template/Scenario_Layouts/` 下的场景模板作为固定业务页面布局
- Kimi 或 OpenAI-compatible 模型负责标题、文案整理、压缩和槽位适配
- 确定性 HTML 渲染器和兜底逻辑负责最终输出
- 本地图片嵌入和普通图片浅色背景透明化

应用会保存最近一次生成结果的预览信息。PM 从预览页返回主页面后，仍可以重新打开或导出上一次生成的 HTML。

## 场景模板

场景模板是基于真实 PPT 设计的固定布局 HTML PPT 页面。

模板文件目录：

```text
Slides_Template/Scenario_Layouts/
```

当前已有：

- `Siemens_PM_Scenario_Templates_1.pptx`
- `Siemens_PM_Scenario_Templates_2.pptx`

每个场景模板需要：

- 源 PPTX 文件
- HTML 渲染使用的预览/背景图
- `pm-material-hub/src/lib/scenarioTemplateLayouts.ts` 中的槽位配置

槽位定义哪些区域可拖拽物料。槽位可以是文本、要点或图片。自动标题区域由模型和渲染器生成，不作为可拖拽物料区。

对于结构复杂的真实 PPT 模板，活动区域通过标注截图和 PPT 坐标进行人工或半自动配置。用于分析的红框、数字标注不能出现在最终预览图中。

## 图片行为

`08_产品图片素材` 中的图片是一等物料卡。

普通图片卡在生成 HTML 时会自动进行浅色背景透明化，让产品图放到深色模板上时不突兀。原始 PPT 页面预览和 PPT 框选内容不会强制去背景，因为它们可能需要保留原始页面视觉。

## 应用入口

更多说明见：

- 英文应用说明：`pm-material-hub/README.md`
- 中文应用说明：`pm-material-hub/README.zh-CN.md`
- Agent 交接文档：`AGENTS.md` 和 `pm-material-hub/AGENTS.md`

常用命令：

```powershell
cd "C:\Users\Administrator\Desktop\Product Management\pm-material-hub"
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

Windows 下使用 `npm.cmd`，避免 PowerShell 执行策略拦截 `npm.ps1`。
