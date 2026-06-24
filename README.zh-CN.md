# PM Material Hub 中文说明

PM Material Hub 是一个本地优先的产品物料管理与 HTML 演示页工作台，面向产品经理使用。

它的目标不是做一个普通问答机器人，而是帮助 PM 把分散在本地文件夹中的手册、样本、PPT、图片、FAQ、证书和成功案例，整理成可复用、可追溯的物料卡片，再拖拽组合成面向销售沟通的页面内容。

本仓库只保存应用代码和共享模板，不保存任何 PM 的私有资料、生成索引、API 配置或客户文件。

## 核心原则

### 1. 本地资料库是唯一物料来源

每个 PM 维护一个标准本地物料工作区。应用从这个工作区读取资料，生成本地 JSON 索引和物料卡片。

真实业务资料不进入 Git 仓库，避免把私有手册、PPT、客户案例、价格信息或证书提交到共享代码库。

### 2. 面向销售交付，而不是聊天问答

典型流程是：

1. PM 把资料放入标准本地工作区。
2. 应用扫描文件并生成本地 JSON。
3. 可选：调用配置好的大模型，把 raw JSON 精炼成更干净的物料卡片。
4. PM 将卡片拖拽或加入中间工作区页面。
5. 后续导出或复用为 HTML 风格的销售演示内容。

最终目标是快速产出“销售可用内容”：参数、卖点、总结、产品图、拓扑图、案例、FAQ 答案，或完整 HTML 演示页。

## 仓库范围

### Git 中包含

- 应用源码：`pm-material-hub/src/`
- 本地索引与工具脚本：`pm-material-hub/scripts/`
- 项目配置：`package.json`、`tsconfig.json`、Next.js 配置等
- 静态资源：`pm-material-hub/public/`
- 基础 PowerPoint 模板：`Slides_Template/`
- 项目说明与 Agent 交接文档

### Git 中不包含

- 每个 PM 的源资料：PDF、PPTX、DOCX、XLSX、图片、证书、FAQ 等
- 生成的 JSON 索引：`pm-material-hub/data/`
- 本地工作区和大模型配置：`pm-material-hub/config/settings.json`
- 环境变量文件：`.env`
- 依赖目录：`node_modules/`
- 构建输出：`.next/`、`out/`、`build/`

这个边界是有意设计的：应用代码可以共享，但每个 PM 的资料库和生成结果都留在本机。

## 产品架构

```text
本地 PM 物料工作区
        |
        | 扫描与索引
        v
pm-material-hub/data/              本地生成索引，不提交 Git
        |
        | 物料卡 API
        v
React 工作台                       物料库、页面、卡片、拖拽
        |
        | 后续导出
        v
独立 HTML 演示页
```

当前版本没有数据库，采用本地文件系统 + JSON 索引的轻量架构。

## 标准物料工作区

每个 PM 的真实物料工作区通过 `pm-material-hub/config/settings.json` 配置。

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

`01_产品物料表格` 是主数据来源，优先处理。其他文件夹中的卡片可以通过 MLFB 与主数据关联，但 MLFB 不是所有文件夹的默认卡片粒度。

| 文件夹 | 主要卡片目标 | MLFB 角色 |
| --- | --- | --- |
| `01_产品物料表格` | 型号、订货信息、SAP、价格、生命周期 | 权威主数据 |
| `02_Catalogue_产品样本` | 产品族、定位、核心利益、选型范围 | 重要产品字段 |
| `03_Manual_产品技术手册` | 产品、模块、参数、功能、限制、注意事项 | 需要尽量覆盖型号 |
| `04_Slides_Technical&Sales` | 产品故事、价值主张、技术亮点、应用、对比、销售话术 | 关联字段，不作为主粒度 |
| `05_Sales_Reference_成功案例` | 客户痛点、项目背景、方案、选择原因、结果 | 关联案例中使用的产品 |
| `06_Sales_Fighting_Guide` | 竞品、差异化、异议处理、销售策略 | 关联产品范围 |
| `07_文本资料` | 产品介绍、发布信息、市场信息 | 发布资料可生成型号卡 |
| `08_产品图片素材` | 产品图、模块图、应用图、结构图、场景图 | 用于图片关联与检索 |
| `09_认证证书` | 证书、标准、区域、持证方、覆盖范围 | 存入 covered_mlfbs |
| `10_FAQ_常见问题集` | 问题、答案、适用对象、现象、处理方法 | 用于按适用型号筛选 |

## 内容处理模型

### 独立运行要求

Codex 只用于开发和测试，不参与生产环境中的物料卡生成。

在另一台机器上，只要安装应用、依赖、本地资料和可选的大模型配置，就应能独立完成：

- 本地解析与 JSON 索引
- 确定性物料生成
- 文件夹级大模型提取与轻度整理
- 结构校验与证据校验
- 安全回退
- 卡片持久化、页面预览生成和前台加载

没有大模型配置时，本地确定性索引和本地物料仍应可用；只是大模型精炼卡片不可用。

### PPT/PPTX 用户流程

生产使用流程：

1. 把一个或多个 PPT/PPTX 放入对应物料文件夹，并点击 **Sync**。
2. 点击 **生成 / 更新本地 JSON**，为每个 PPT/PPTX 生成：
   - 页面级 `raw.json`
   - 原始页面 PNG 预览
   - 文件夹级 `_folder.catalog.json`
3. 在高级区域运行大模型提取，生成经过校验的 `meta.json` 精炼卡片。
4. 前台以每个 PPT 文件为单位分组展示：精炼内容 + 原始 PPT 页面。

PPT/PPTX 采用三层数据结构：

- `*.raw.json`：完整的页面级机器可读证据
- `*.meta.json`：经过校验的可复用精炼卡片
- `_folder.catalog.json`：轻量路由索引，用于后续按需读取有限上下文

大模型只读取 raw JSON，不直接读取 PPT/PPTX 原文件。候选结果发布前必须经过校验；无效的大卡片合并、错误证据或不支持的结果不能覆盖已发布索引。

MVP 阶段，PPT 原始页 PNG 预览依赖 Microsoft PowerPoint。当前渲染器不支持 WPS Office。

### 本地 JSON 优先

当前实现以本地 JSON 为中心：

1. 本地索引把源文件压缩成 JSON。
2. 大模型精提取读取 JSON，而不是直接读取源文件。
3. 文件夹 catalog 先做轻量路由，再通过 bounded context 获取有限文件、卡片和证据页。

这样可以降低重复提取成本，提高速度，并让结果更容易检查。

应用提供：

- `GET /api/materials/catalog`
- `POST /api/materials/context`

### 当前索引类型

- `*.raw.json`：PDF、Word、PowerPoint、Excel、文本类文件的本地索引
- `*.image.json`：图片文件的本地索引
- `*.meta.json`：大模型精炼或结构化后的物料卡结果
- `_folder.catalog.json`：文件级轻量路由索引

这些都是本地生成物，不应提交 Git。

## 当前实现状态

已完成：

- Next.js App Router 应用
- React + Tailwind CSS v4 UI
- 本地文件系统工作区
- 标准文件夹扫描
- 本地 JSON 索引
- 图片 manifest 索引
- 物料卡 API
- TIFF 图片预览
- 文件夹级 prompt 存储
- 大模型提取接口读取 raw JSON
- 左侧物料库折叠文件夹
- 中间多页工作区
- 拖拽与添加物料卡
- 页面新增、删除、清空和卡片移除
- PPT/PPTX 原始页真实 PNG 预览
- PPT/PPTX 按文件分组展示精炼卡片和原始页

MVP 仍未完成的重点：

- 最终 HTML 演示页导出
- 页面内容自动排版
- 更完整的卡片排序和过滤
- 更多文件夹的 prompt 质量验证

## 常用命令

进入应用目录：

```powershell
cd "C:\Users\Administrator\Desktop\Product Management\pm-material-hub"
```

安装依赖：

```powershell
npm.cmd install
```

启动开发服务：

```powershell
npm.cmd run dev
```

构建：

```powershell
npm.cmd run build
```

Windows 下使用 `npm.cmd`，避免 PowerShell 执行策略拦截 `npm.ps1`。

生成主数据索引：

```powershell
npm.cmd run index:local -- --folder-prefix 01 --force
```

生成技术手册索引：

```powershell
npm.cmd run index:local -- --folder-prefix 03 --force
```

生成图片索引：

```powershell
npm.cmd run index:local -- --folder-prefix 08 --force
```

## Git 注意事项

提交前确认不要包含：

- `pm-material-hub/data/`
- `pm-material-hub/config/settings.json`
- `pm-material-hub/node_modules/`
- `pm-material-hub/.next/`
- 用户手册、图片、PPT、Excel 或生成的本地索引

共享仓库只代表应用和模板，不代表某个 PM 的私有资料库。

