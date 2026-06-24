# PM Material Hub App 中文说明

这是一个本地优先的 Next.js 应用，用于把产品管理资料转化成可复用、可追溯的物料卡片，并在中间工作区组合成 HTML 风格的演示页面。

## 安装与启动

```powershell
npm.cmd install
npm.cmd run dev
```

使用项目自带启动脚本时，打开：

```text
http://localhost:3001/
```

生产构建：

```powershell
npm.cmd run build
npm.cmd run start
```

Windows 下建议使用 `npm.cmd`，避免 PowerShell 执行策略拦截 `npm.ps1`。

Linux 环境需要在 Linux 主机重新执行 `npm install`，不要复制 Windows 的 `node_modules`，因为 OCR 等依赖包含原生模块。

## 物料工作区

源资料路径配置在：

```text
config/settings.json
```

标准文件夹顺序：

1. `01_产品物料表格`：权威 MLFB、SAP、订货、价格、生命周期主数据
2. `02_Catalogue_产品样本`：产品族、定位、利益点、选型
3. `03_Manual_产品技术手册`：技术参数、功能、限制、注意事项
4. `04_Slides_Technical&Sales`：产品故事、价值主张、技术亮点、应用、对比、销售信息
5. `05_Sales_Reference_成功案例`：客户痛点、解决方案、选择原因、实施结果
6. `06_Sales_Fighting_Guide`：竞品、异议处理、销售策略
7. `07_文本资料`：产品介绍、发布信息、市场资料
8. `08_产品图片素材`：可复用视觉素材
9. `09_认证证书`：证书、标准、区域、持证方、覆盖 MLFB
10. `10_FAQ_常见问题集`：问题、答案、现象、解决方法

`01_产品物料表格` 优先处理，并作为产品主数据索引。其他文件夹可以通过标准化 MLFB 关联主数据，但不是所有文件夹都以 MLFB 作为卡片单位。

## 处理流程

1. 源文件保留在仓库外部。
2. 本地索引生成到 `data/local-json-indexes/`。
3. 可选的大模型精提取读取本地 JSON，并输出到 `data/indexes/`。
4. 物料卡 API 组合主数据、精炼主题卡、原始证据页和图片资产，供前台展示。

## PPT/PPTX 操作流程

正常使用流程：

1. 将一个或多个 PPT/PPTX 文件放入对应物料文件夹，点击 **Sync**。
2. 点击 **生成 / 更新本地 JSON**，应用会生成：
   - 每个 PPT/PPTX 一个 `*.raw.json`
   - 原始 PPT 页面 PNG 预览，缓存到 `data/slide-previews/`
   - 文件夹级 `_folder.catalog.json`
3. 打开高级提取区域，运行大模型提取。模型读取 `raw.json`，不直接读取原始 PPT/PPTX。
4. 前台按每个 PPT/PPTX 文件分组展示：精炼卡片 + 原始 PPT 页面。

PPT/PPTX 三层数据结构：

- `*.raw.json`：页面级文本、列表、表格、备注、图片引用、页码和证据 ID
- `*.meta.json`：经过校验的可复用精炼卡片
- `_folder.catalog.json`：轻量路由元数据，用于后续按需选择相关文件和证据页

`GET /api/materials/catalog` 提供路由 catalog。

`POST /api/materials/context` 返回有限数量的相关文件、卡片和证据页，避免后续模型调用一次性读取整个文件夹。

精炼输出必须先校验再发布。无效的大卡片合并、不支持的证据或错误结构不能覆盖当前已发布索引。应用会先保存候选结果，替换前备份旧结果，必要时发布明确标记的确定性兜底结果。

MVP 阶段，PPT 原始页 PNG 预览依赖 Microsoft PowerPoint。当前渲染器不支持 WPS Office。如果没有安装 PowerPoint，raw JSON 仍可生成，但原始页预览会显示不可用。

## 独立运行要求

Codex 只用于开发和测试，不是生产物料生成流程的一部分。

在另一台机器上，应用必须能独立完成：

- 每个支持文件夹和文件类型的本地解析与 JSON 索引
- 适用场景下的确定性卡片生成
- 通过配置好的模型 API 进行文件夹级大模型提取和轻度整理
- 结构校验、证据校验和安全兜底
- 卡片持久化、页面预览生成和前台加载

任何生产卡片都不应依赖 Codex 对话、Codex 生成的中间文件或 Codex 手工操作。

没有配置大模型时，确定性本地材料仍必须可用；只有模型精炼卡片不可用。

## 格式行为

- Excel 产品列表会生成确定性主数据记录，不需要大模型。
- PPT/PPTX 按页保留，包括文本、列表、表格、备注、图片引用和 slide evidence ID。
- 每个 PPT/PPTX 作为独立可折叠文件组展示，组内分为“精炼内容”和“原始页面”。
- 原始页缩略图是真实 Microsoft PowerPoint PNG 导出，不是 JSON 文本重建图。
- 未安装 PowerPoint 时，应用明确提示无法生成原生预览，不会用合成摘要图冒充原始页。
- PPT/PPTX 不生成额外的泛文档 raw card，因为原始页卡片已经完整保留来源。
- 源文件变更会标记索引 stale；源文件缺失会标记为 orphaned。
- PDF 优先使用内嵌文本；无可用文本层时自动使用本地 Tesseract OCR。
- Word 使用 Mammoth 提取 DOCX。
- 图片作为一等资产索引。

文件夹行为定义在：

```text
src/lib/materialProfiles.ts
```

更完整的产品与提取逻辑记录在：

```text
AGENTS.md
```

## 常用 API

```text
POST /api/index/local
```

为选中文件夹生成或刷新本地 JSON。

```text
GET /api/materials/cards
```

把本地索引和精炼索引转成前台物料卡。

```text
GET /api/assets/image
```

提供本地图片资产和缩略图，包括 TIFF 转换。

```text
GET /api/assets/slide-preview
```

提供 PPT/PPTX 原始页 PNG 预览。

```text
POST /api/extract/batch
```

对本地 raw JSON 执行大模型精提取。

```text
GET /api/materials/catalog
POST /api/materials/context
```

提供轻量 catalog 和有限上下文读取。

```text
GET/POST /api/settings/prompts
```

读取或保存每个文件夹的 prompt。

```text
GET /api/sync
```

同步工作区文件夹和文件状态。

## 常用命令

生成产品主数据：

```powershell
npm.cmd run index:local -- --folder-prefix 01 --force
```

生成技术手册索引：

```powershell
npm.cmd run index:local -- --folder-prefix 03 --force
```

生成销售/技术 PPT 索引：

```powershell
npm.cmd run index:local -- --folder-prefix 04 --force
```

生成图片 manifest：

```powershell
npm.cmd run index:local -- --folder-prefix 08 --force
```

构建验证：

```powershell
npm.cmd run build
```

## 数据安全

不要提交：

- `config/settings.json`
- 生成的 `data/` 索引
- PM 工作区中的源资料
- `.next/`
- `node_modules/`
- API key
- 私有客户或产品文件

