# PM Material Hub App 中文说明

这是 PM Material Hub 的 Next.js 应用。它负责扫描本地产品资料、生成可复用物料卡、提供多页可视化工作区，并生成可编辑的 HTML 版本 PPT 预览和导出文件。

## 安装与启动

```powershell
npm.cmd install
npm.cmd run dev
```

打开：

```text
http://localhost:3001/
```

生产构建：

```powershell
npm.cmd run build
npm.cmd run start
```

Windows 下使用 `npm.cmd`。OCR 和图片处理包含原生依赖，不要跨操作系统复制 `node_modules`。

## 运行要求

最低运行要求：

- 按 `package-lock.json` 安装 Node.js 依赖
- 在 `config/settings.json` 中配置本地 PM 物料工作区
- 可选：配置 Kimi 或 OpenAI-compatible 模型，用于精炼卡片和生成 PPT 文案

完整 PPT/PPTX 支持需要：

- Windows 环境安装 Microsoft PowerPoint
- PowerPoint COM 自动化可用，用于导出原始 PPT 页面 PNG 预览

当前原生预览渲染器不支持 WPS Office。

## 核心流程

1. 配置物料工作区。
2. 在应用中点击 **Sync**。
3. 生成或刷新本地 JSON 索引。
4. 可选：运行大模型提取，生成精炼物料卡。
5. 将卡片拖拽到工作区。
6. 选择普通布局或场景模板。
7. 点击生成预览。
8. 检查 HTML PPT 预览。
9. 需要修改时返回工作区，确认后导出 HTML 文件。

应用会保存工作区草稿和最近一次生成预览的信息，所以从预览页返回后不会丢失当前工作区或上一次生成结果。

## 标准文件夹

配置的物料工作区应包含：

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

各文件夹行为定义在：

```text
src/lib/materialProfiles.ts
```

## 本地索引

生成数据位于 `data/` 下，不应提交 Git。

重要数据层：

- `data/local-json-indexes/`：本地 raw 索引和图片 manifest
- `data/indexes/`：大模型精炼结果
- `data/manual-cards/`：技术手册卡片管线输出
- `data/slide-previews/`：PowerPoint 导出的原始页 PNG 缓存
- `data/generated-html/`：生成的 HTML 预览文件
- `data/workspace-draft.json`：当前工作区草稿和最近预览信息

## PPT/PPTX 流程

PPT/PPTX 文件会生成：

- `*.raw.json`：页面级文本、列表、表格、备注、图片引用、页码和证据 ID
- `data/slide-previews/` 下的真实原始页 PNG 预览
- 可选的 `*.meta.json` 精炼物料卡
- `_folder.catalog.json` 轻量路由索引

原始 PPT 页面会一直保留为可拖拽卡片。精炼内容不能替代或隐藏原始页面层。

### PM 精选内容

PM 可以在原始 PPT 单页预览中拖拽框选区域，并点击 **Favorite**。应用会从 PowerPoint 真实预览图中裁剪该区域，生成一个可复用的 `ppt_selection` 卡片。该卡片可以拖入文本槽或图片槽，具体取决于目标布局。

## HTML PPT 生成

生成接口：

```text
POST /api/presentations/generate-html
```

接口返回预览 ID 和 URL。预览文件保存在：

```text
data/generated-html/
```

预览路由：

```text
GET /api/presentations/preview/[id]
GET /api/presentations/preview/[id]?download=1
```

生成预览页包含“返回工作区”和“导出 HTML”按钮。导出优先使用浏览器保存位置选择器，不支持时回退到浏览器下载。

生成逻辑使用：

- 工作区页面和槽位映射作为结构来源
- Kimi 或 OpenAI-compatible 模型整理标题和文案
- `Slides_Template/template_Business graphic.pptx` 作为视觉风格库
- `Slides_Template/Scenario_Layouts/` 下的场景模板
- 确定性 HTML 渲染器
- 图片嵌入和普通图片浅色背景透明化

生成 HTML 中的文字使用 `contenteditable`，可以直接编辑。

## 场景模板

场景模板配置在：

```text
src/lib/scenarioTemplateLayouts.ts
```

模板预览接口：

```text
GET /api/assets/scenario-template?id=<templateId>
```

当前场景模板资产在应用目录外：

```text
../Slides_Template/Scenario_Layouts/
```

当前模板：

- `scenario-product-benefits-1`
- `scenario-capability-grid-2`

场景模板槽位是固定活动区域。文本槽接收模型整理后的文案，并由脚本做最终适配；图片槽接收嵌入图片；自动标题槽由模型和渲染器生成，不作为可拖拽区域。

## 图片处理

图片接口：

```text
GET /api/assets/image
```

普通图片卡默认会做浅色背景透明化，并输出 PNG。只有需要保留原始背景时才使用 `transparent=0`。

## 关键 API

- `POST /api/index/local`：生成或刷新本地 JSON 索引
- `GET /api/materials/cards`：加载前台物料卡
- `GET /api/materials/catalog`：读取轻量路由 catalog
- `POST /api/materials/context`：为模型调用读取有限上下文
- `POST /api/extract/batch`：基于本地 JSON 运行大模型提取
- `POST /api/presentations/favorite-selection`：从 PPT 页面生成 PM 精选内容
- `POST /api/presentations/generate-html`：生成 HTML PPT 预览
- `GET /api/presentations/preview/[id]`：查看或下载生成的 HTML
- `GET/POST/DELETE /api/workspace/draft`：保存工作区状态
- `GET/POST /api/settings/llm`：配置模型
- `GET/POST /api/settings/prompts`：配置文件夹 prompt

## 常用命令

```powershell
# 产品主数据
npm.cmd run index:local -- --folder-prefix 01 --force

# 技术手册
npm.cmd run index:local -- --folder-prefix 03 --force

# PPT 资料
npm.cmd run index:local -- --folder-prefix 04 --force

# 图片素材
npm.cmd run index:local -- --folder-prefix 08 --force

# 构建验证
npm.cmd run build
```

## 数据安全

不要提交：

- `config/settings.json`
- 生成的 `data/` 文件
- 用户源资料
- API key
- `.next/`
- `node_modules/`
