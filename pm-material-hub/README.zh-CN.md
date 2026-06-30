# PM Material Hub 应用说明

本目录是 PM Material Hub 的本地 Next.js 应用。

普通用户不需要进入 PowerShell 输入 npm 命令。下载并解压 release 后，在项目根目录双击：

```text
Start PM Material Hub.cmd
```

也可以在当前目录双击：

```text
start-dev.cmd
```

启动脚本会在首次运行时安装依赖，启动应用，并自动打开：

```text
http://127.0.0.1:3001/
```

## 本地运行要求

必需：

- Windows
- Node.js LTS，除非未来 release 内置 `runtime/node/` 便携运行时
- 本地 PM 源资料目录

完整 PPT/PPTX 能力需要：

- Microsoft PowerPoint
- 可用的 PowerPoint COM 自动化能力

当前不支持 WPS Office 作为 PPT 原生预览渲染器。

可选：

- Kimi 或 OpenAI-compatible 模型 base URL 和 API key

## 产品定位

PM Material Hub 是 Windows 本地运行的 PM 物料工作台。它围绕本地资料区、物料卡片、PPT 预览、拖拽工作区和 HTML PPT 导出展开。

它支持：

- 本地资料区初始化
- 本地文件同步
- 本地 raw JSON 索引
- 图片素材卡
- PPT/PPTX 原始页预览
- PPT 页面框选 Favorite
- 大模型精炼卡片
- 多页可视化工作区
- 普通布局和场景模板
- 可编辑 HTML PPT 预览生成
- 独立 HTML 导出

## 标准文件夹

配置后的本地资料区应包含：

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

文件夹行为定义在：

```text
src/lib/materialProfiles.ts
```

## 数据层

生成数据保存在 `data/` 下，不要提交到 Git。

主要数据层：

- `data/local-json-indexes/`：本地 raw JSON 和图片 manifest
- `data/indexes/`：大模型精炼结果
- `data/manual-cards/`：明确触发后的手册卡片生成结果
- `data/slide-previews/`：PowerPoint 渲染的 PPT 页 PNG 缓存
- `data/generated-html/`：生成的 HTML 预览
- `data/workspace-draft.json`：当前工作区草稿和最近生成记录

本地设置保存在：

```text
config/settings.json
```

该文件可能包含本机路径和 API key，不要提交。

## 本地索引与大模型精炼

本地 JSON 生成是确定性流程，不调用大模型。它只应生成原始文档卡、MLFB 候选卡、图片 manifest 和 PPT 原始页卡。

精炼卡片只应在大模型提取步骤或明确的手册卡片生成流程后出现。

对于 `03_Manual_产品技术手册`，本地索引采用“章节主题”逻辑。应用会先识别手册章节标题，再对每个章节做一次确定性的本地 digest 压缩：提取章节概览句、参数事实、操作/工程规则、警告与限制、诊断维护等生命周期事实、证据摘录和 MLFB 候选。这个过程不调用大模型。

03 的大模型精炼只读取这些本地章节 digest，不直接读取原始 PDF/Word 文件。期望输出是安装、接线、组态、调试、诊断、维护、安全说明、限制条件、技术规范等章节主题卡。MLFB 只作为 `related_mlfbs` 关联标签，并会用 01 产品主数据白名单过滤。

03 会在本地 digest 和模型输出两个阶段过滤低价值内容，例如漏洞通知、安全更新通知、自动通知选项、固件签名/固件更新、通用网络安全公告、数据/归档完整性提醒、营销话术、版权/商标/免责声明、重复安全警告模板和空白占位。

## 本地 JSON 使用的技术和思路

本地 JSON 流程主要实现在：

```text
src/lib/localIndexer.ts
src/lib/extractors.ts
```

本地解析使用的工具和能力包括：

- `xlsx`：读取 Excel 产品主数据
- `mammoth`：提取 Word `.docx` 原始文本
- `pdf-parse`：提取 PDF 文本
- PPT/PPTX 本地解析辅助逻辑：提取页面文本、表格、备注、页码和证据 ID
- `sharp`：读取图片尺寸、格式、透明度等 manifest 信息
- Microsoft PowerPoint COM 自动化：导出真实 PPT/PPTX 页面 PNG 预览

生成结果保存在：

```text
data/local-json-indexes/
```

后续大模型精炼只读取这些经过本地压缩和结构化后的 JSON；模型不会直接读取原始 PDF、Word、Excel、PPT 或图片文件。

## PPT/PPTX 流程

PPT/PPTX 文件会产生：

- 页面文本、表格、备注、页码和证据 ID 的 raw JSON
- Microsoft PowerPoint 真实导出的 PNG 预览
- 可拖拽的原始页卡片
- 可选的大模型精炼卡片

原始页层不能被精炼卡片替代或隐藏。

PM 可以打开原始 PPT 页预览，拖拽框选区域并点击 **Favorite**，应用会裁剪 PowerPoint 渲染图并生成一张 `ppt_selection` 精选卡。

## HTML PPT 生成

生成接口：

```text
POST /api/presentations/generate-html
```

预览接口：

```text
GET /api/presentations/preview/[id]
GET /api/presentations/preview/[id]?download=1
```

生成文件保存在：

```text
data/generated-html/
```

生成后的 HTML 中，文字区域通过 `contenteditable` 保持可编辑。

## 开发者命令

仅开发时需要：

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

面向用户的启动方式应保持为一键启动脚本，而不是手动输入 PowerShell 命令。

## 安全要求

不要提交：

- `config/settings.json`
- 生成的 `data/` 文件
- 用户源资料
- API key
- `.next/`
- `node_modules/`
