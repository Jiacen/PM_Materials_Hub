# PM Material Hub 中文说明

PM Material Hub 是一个 Windows 本地运行的产品经理物料工作台。它把本地产品资料整理成可复用的物料卡片，让 PM 通过拖拽方式组合页面，并生成可编辑的 HTML 版本 PPT。

## 为什么适合本地运行

这个项目的核心场景天然适合放在 PM 自己的电脑上完成：

- 产品资料通常包含主数据、手册、销售材料、证书、价格参考、客户案例和内部说明，本地读取更符合资料安全边界。
- PPT/PPTX 原始页预览和框选精选需要 Microsoft PowerPoint 的真实渲染，本机 Office 环境可以保留原始页面视觉。
- PM 的主要工作流是整理、筛选、拖拽组合和导出交付件，本地应用可以直接访问资料区、缓存预览并导出独立 HTML 文件。

## 一键启动

从 GitHub release 下载并解压后，在项目根目录双击：

```text
Start PM Material Hub.cmd
```

启动器会自动完成：

- 查找本机 Node.js / npm
- 首次运行时安装依赖
- 启动本地应用
- 自动打开浏览器

默认访问地址：

```text
http://127.0.0.1:3001/
```

使用期间请保持启动窗口打开。关闭窗口会停止应用。

如果提示没有找到 Node.js，请先安装 Node.js LTS：

```text
https://nodejs.org/
```

## 首次使用流程

1. 双击启动脚本。
2. 在浏览器中配置本地资料区。
3. 配置 Kimi 或 OpenAI-compatible 模型 URL 和 API key。
4. 同步本地物料。
5. 生成本地 JSON 索引。
6. 可选：运行大模型精提取，生成精炼卡片。
7. 将卡片拖入工作区页面。
8. 选择普通布局或场景模板。
9. 生成 HTML PPT 预览。
10. 检查后导出独立 HTML 文件。

## 标准资料区

真实资料区不放在 Git 仓库里。建议路径类似：

```text
C:\Users\<User>\Documents\PM_Materials
```

应用会使用以下标准文件夹：

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

本地设置保存在：

```text
pm-material-hub/config/settings.json
```

这个文件不会提交到 Git，因为里面可能包含本机路径和 API key。

## 本地索引与精炼卡片

“生成本地 JSON”只读取本地文件，生成 raw JSON、图片 manifest、PPT 原始页预览和原始候选卡。这一步不调用大模型。

以下以 `03_Manual_产品技术手册` 为例，说明某一类资料夹可以有自己的本地 JSON 压缩策略；其他资料夹仍按各自规则处理，例如 01 读取主数据、04 保留 PPT 原始页、08 读取图片 manifest。

- 本地 JSON 阶段先按手册章节标题切分内容。
- 每个章节会先做确定性的本地 digest 压缩，提取概览句、参数事实、操作/工程规则、警告与限制、诊断维护等生命周期事实、证据摘录和 MLFB 候选。
- 这个 digest 过程不调用大模型；大模型精炼只读取压缩后的本地 JSON。
- 精炼卡片是章节主题卡，例如安装、接线、组态、调试、诊断、维护、安全说明、限制条件和技术规范。
- MLFB 只作为 `related_mlfbs` 关联标签，并用 01 产品主数据白名单过滤。
- 03 会在本地 digest 和模型输出两个阶段过滤低价值内容，例如漏洞通知、安全更新通知、自动通知选项、固件签名/固件更新、通用网络安全公告、数据/归档完整性提醒、营销话术、版权/商标/免责声明、重复安全警告模板和空白占位。

## 本地 JSON 使用的技术和思路

本地 JSON 生成主要实现在：

```text
pm-material-hub/src/lib/localIndexer.ts
pm-material-hub/src/lib/extractors.ts
```

本地解析使用的工具、来源和当前用途包括：

| 工具 | 当前版本 | 来源 | 在本项目中的用途 |
| --- | --- | --- | --- |
| `xlsx` | `^0.18.5` | [SheetJS/sheetjs](https://github.com/SheetJS/sheetjs) | 读取 01 Excel 产品主数据，解析 sheet、行、MLFB、描述和价格字段。 |
| `mammoth` | `^1.12.0` | [mwilliamson/mammoth.js](https://github.com/mwilliamson/mammoth.js) | 提取 `.docx` 原始文本，不保留复杂 Word 样式。 |
| `pdf-parse` | `^1.1.1` | [willmcpo/pdf-parse](https://github.com/willmcpo/pdf-parse) | 优先提取可复制文字型 PDF 的文本。 |
| `pdfjs-dist` | `^5.6.205` | [mozilla/pdf.js](https://github.com/mozilla/pdf.js) | 当 PDF 文本过少、疑似扫描件时，把 PDF 页面本地渲染成图片供 OCR 使用。 |
| `tesseract.js` | `^7.0.0` | [naptha/tesseract.js](https://github.com/naptha/tesseract.js) | 对扫描型 PDF 渲染图做本地 OCR。当前随项目缓存 `eng.traineddata`，路径为 `pm-material-hub/resources/ocr/eng.traineddata`。 |
| Tesseract OCR 语言数据 | `eng.traineddata` | [tesseract-ocr/tessdata](https://github.com/tesseract-ocr/tessdata) | OCR 英文模型数据。本项目目前只内置英文数据；中文扫描 PDF 的 OCR 效果取决于后续是否补充中文 traineddata。 |
| `@napi-rs/canvas` | `^0.1.100` | [Brooooooklyn/canvas](https://github.com/Brooooooklyn/canvas) | 在 Node.js 中创建 canvas，把 PDF 页渲染成图片供 OCR。 |
| `officeparser` | `^7.2.1` | [harshankur/officeParser](https://github.com/harshankur/officeParser) | 解析 PPT/PPTX、DOC 等 Office 文件，提取页面文本、表格、备注、图片引用和 slide evidence ID。 |
| `sharp` | `^0.35.1` | [lovell/sharp](https://github.com/lovell/sharp) | 读取图片尺寸、格式、透明度等 manifest 信息；裁剪 PPT 框选区域；处理图片背景。 |
| `adm-zip` | `^0.5.17` | [cthackers/adm-zip](https://github.com/cthackers/adm-zip) | 读取 PPTX zip 内部 XML，用于框选区域文字提取、模板文字和布局分析。 |
| Microsoft PowerPoint COM | 本机 Office 能力 | Microsoft Office 本地安装 | 导出真实 PPT/PPTX 页面 PNG 预览，保证原始页视觉和 PowerPoint 渲染一致。 |

OCR 触发逻辑在 `pm-material-hub/src/lib/extractors.ts`：先用 `pdf-parse` 提取 PDF 文本；如果文本长度过短，才调用 `pm-material-hub/scripts/ocr-pdf.cjs`，用 `pdfjs-dist` + `@napi-rs/canvas` + `tesseract.js` 在本地执行 OCR。

生成结果保存在：

```text
pm-material-hub/data/local-json-indexes/
```

后续大模型精炼只读取这些经过本地压缩和结构化后的 JSON；模型不会直接读取原始 PDF、Word、Excel、PPT 或图片文件。

## PPT/PPTX 能力

PPT/PPTX 有两层物料：

- 原始页层：每一页保留为可拖拽的原始页卡片，并使用 PowerPoint 真实导出的 PNG 预览。
- 精炼内容层：可选使用模型从本地 raw JSON 中生成可复用卡片。

原始页不会被精炼卡片替代。

PM 可以打开某一页 PPT 预览，拖拽框选区域并点击 Favorite，生成一张 PM 精选内容卡。

## 仓库内容

```text
pm-material-hub/                  Next.js 本地应用
Slides_Template/                  共享 PPT 风格模板
Slides_Template/Scenario_Layouts/ 场景模板和预览图
Start PM Material Hub.cmd         一键启动入口
```

## 不要提交

- PM 私有源资料
- `pm-material-hub/data/` 生成数据
- `pm-material-hub/config/settings.json`
- API key
- `.next/`
- `node_modules/`

## 开发者命令

普通用户优先使用一键启动脚本。开发者仍可手动运行：

```powershell
cd "pm-material-hub"
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

Windows PowerShell 下建议使用 `npm.cmd`，避免执行策略拦截 `npm.ps1`。
