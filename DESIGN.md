# Video Notes for Obsidian — 设计文档 v0.1

> 状态：设计阶段，未实现
> 更新日期：2026-10-08

## 1. 产品定位

BYOK（Bring Your Own Key）视频学习笔记 Chrome 插件：从视频课程页面提取转录字幕，用用户自己的 LLM 生成中文结构化笔记，保存到本地 Obsidian vault。

## 2. MVP 范围（v0.1）

| 范围 | 决策 |
|------|------|
| 平台 | 仅 Udemy 课程播放页 |
| 提取粒度 | **仅当前正在看的一节（lecture）** |
| 字幕来源 | 路线 A：页面 Transcript 面板 DOM 提取（首选）；路线 B：用户手动下载 .vtt 拖入插件（兜底） |
| 无字幕处理 | 直接提示"该节课程无字幕"，不预留 ASR（v0.2 再议） |
| 笔记语言 | **固定中文** |
| 不做 | 批量全课程、时间戳定位、YouTube/Bilibili、Udemy API 逆向 |

## 3. 核心流程

```
用户在 Udemy 播放页点击插件图标
  → content script 检测页面（是否 course 播放页）
  → 读取当前 lecture 字幕（Transcript 面板 DOM）
  → 清洗（去时间戳/噪声标记，合并断句为段落）
  → popup 显示预览（字数 + 前 200 字）→ 用户确认
  → background 调用 LLM（BYOK，长文本 map-reduce 分块）
  → 生成结构化笔记
  → 写入 Obsidian vault
```

## 4. 技术架构（Manifest V3）

### 4.1 组件划分

| 组件 | 职责 | 权限 |
|------|------|------|
| **content script** | 注入 `*.udemy.com/course/*/learn/*`；检测页面状态；提取 Transcript DOM；读取课程名/节标题/讲师/时长等元数据 | DOM 读取 |
| **popup** | 主交互界面：状态显示、字幕预览、确认按钮、进度反馈、错误提示 | — |
| **background (service worker)** | LLM API 调用（避免 content script 的 CORS 限制）；分块编排；笔记组装；Obsidian 写入 | `host_permissions`: LLM 端点 + Obsidian 写入端点 |
| **options page** | LLM 配置（端点/模型/API Key/provider 预设）；Obsidian 写入方式配置；Prompt 模板编辑 | `storage` |

### 4.2 消息流

```
content script ──(字幕+元数据)──> popup
popup ──(生成请求)──> background
background ──(fetch LLM)──> 用户配置的 API 端点
background ──(写入请求)──> Obsidian
background ──(进度/结果)──> popup
```

- content script 与 popup 通过 `chrome.tabs.sendMessage` 通信
- popup 与 background 通过 `chrome.runtime.sendMessage` 通信
- LLM 调用只在 background 发起（content script 发跨域请求会被 CORS 拦截）

### 4.3 字幕提取设计（content script）

**路线 A：Transcript 面板**
- Udemy 播放页右侧 Transcript 面板逐句渲染字幕（含时间戳）
- 提取策略：读取面板全部字幕句节点 → 拼接文本
- 风险点：Transcript 面板可能懒加载（只渲染可视区域），需要滚动面板触发全量渲染后再提取——实现时需验证 Udemy 的虚拟滚动行为
- 元数据提取：页面标题区（课程名、节标题）、播放器状态（时长）

**路线 B：.vtt 解析**
- popup 提供文件拖放区
- 解析器：去掉 WEBVTT 头、时间戳行、`<c>` 标签，合并重复行（字幕常见同一句出现两次，时间轴重叠）

**清洗规则（A/B 共用）：**
1. 去除时间戳与 HTML/VTTE 标签
2. 去除 `[Music]` `[Applause]` 类噪声标记
3. 相邻重复行去重
4. 按句号/语义合并碎行为段落
5. 输出纯文本 + 字数统计

### 4.4 LLM 调用设计（BYOK）

**配置模型（OpenAI 兼容格式）：**
```
provider 预设: DeepSeek / Qwen(百炼) / GLM / Ollama(本地) / 自定义
字段: baseUrl, modelName, apiKey, temperature, maxTokens
```
- 预设只是填充默认 baseUrl 和推荐模型，本质都是 OpenAI Chat Completions 兼容接口
- Ollama: `http://localhost:11434/v1`，无需 key

**长文本 map-reduce 分块：**
```
估算 token 数（中文≈1.5字符/token，英文≈4字符/token 粗估）
  ↓ 超过单块阈值（默认 6000 token）
按段落边界切块（不切断句子）
  ↓
Map: 每块 → 要点列表（并行或串行，受 rate limit 约束默认串行）
  ↓
Reduce: 所有要点 → 最终结构化笔记
```

**Prompt 模板（默认，用户可在 options 编辑）：**
- Map prompt：提取本段关键要点、概念、代码/命令、实战步骤
- Reduce prompt：合并要点为固定结构的中文笔记（核心总结/关键要点/实战细节）
- 输出语言硬约束：中文

**错误处理：**
- API 失败：重试 1 次 → 仍失败则报错并保留已生成部分
- rate limit（429）：指数退避
- 超长单块：提示用户切换更大上下文的模型

### 4.5 Obsidian 写入设计（关键决策点）

Chrome 插件无法直接写本地文件。三个候选方案：

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| **① Obsidian Local REST API 插件**（推荐） | 用户装社区插件 Local REST API，插件 POST 到 `https://127.0.0.1:27124` | 直接写入 vault 任意路径；可追加/覆盖；生态成熟 | 需要用户额外装一个 Obsidian 插件 + 配置 API key |
| ② 下载 .md 文件 | `chrome.downloads` API 下载到 vault 目录 | 零依赖 | 下载目录受限、会有下载提示、无法追加已有文件 |
| ③ Native Messaging Host | 注册本地小程序中转写文件 | 能力最强 | 安装复杂（要注册 native host），MVP 成本过高 |

**MVP 决策：方案 ①**，方案 ② 作为降级备选（用户不想装 REST API 插件时）。

**笔记路径规则：**
```
<vault>/素材库/VideoNotes/Udemy/<课程名>/<序号>-<节标题>.md
<vault>/素材库/VideoNotes/Udemy/<课程名>/<课程名> MOC.md   ← 课程索引页（追加链接）
```
- 文件名清洗：去除 `/\:*?"<>|` 非法字符
- 已存在同名笔记：默认覆盖前提示（popup 内确认）

### 4.6 笔记格式

```markdown
---
date: YYYY-MM-DD
course: <课程名>
lecture: <节标题>
instructor: <讲师>
source: <lecture URL>
duration: <时长>
tags: [udemy, <课程主题>]
type: video-note
---

# <课程名> — <节标题>

## 📝 核心总结
<3-5 句>

## 🎯 关键要点
- ...

## 💡 实战细节
<代码/命令/步骤>

## 🔗 上下文
课程：[[<课程名> MOC]]
```

### 4.7 存储设计

| 存储区 | 内容 |
|--------|------|
| `chrome.storage.sync` | LLM 配置（**不含 apiKey**）、Obsidian 配置、Prompt 模板 |
| `chrome.storage.local` | apiKey（不同步防泄露）、生成历史（课程/节/时间/状态）、草稿 |

### 4.8 权限清单（manifest）

```
permissions: storage, activeTab, downloads(降级方案用)
host_permissions:
  - *://*.udemy.com/*          (content script)
  - http://localhost:11434/*   (Ollama)
  - https://127.0.0.1:27124/*  (Obsidian Local REST API)
  - 用户自定义 LLM 端点 → optional_host_permissions 动态申请
```

## 5. 技术栈

- TypeScript + Vite（CRXJS 插件支持 MV3 HMR）
- 无框架或 Preact（popup 界面简单，避免重量级依赖）
- 无后端，所有调用直连用户配置的端点

## 6. 风险与待验证项

1. **Transcript 面板虚拟滚动**：是否懒加载？需要实现前手动验证 DOM 结构（打开一门有字幕的课，检查 transcript 容器是否一次性渲染全部句子）
2. **Udemy DOM 改版风险**：选择器需集中管理（一个 `selectors.ts`），失效时给出明确报错而不是静默失败
3. **Local REST API 的 HTTPS 自签证书**：fetch 自签证书端点可能被浏览器拦截，需验证（该插件默认同时开 27123 HTTP 端口，可降级）
4. **中文字幕课程**：部分中文课程字幕是自动生成的，质量差 → 清洗规则需容忍错别字，prompt 中提示 LLM 修正明显语音识别错误

## 7. 里程碑

| 阶段 | 内容 | 验收标准 |
|------|------|---------|
| M1 | 项目脚手架 + manifest + content script 提取字幕 | 在真实 Udemy 课程页能拿到完整清洗后文本 |
| M2 | background LLM 调用 + 分块 + 笔记生成 | 配置 DeepSeek 后能生成合格中文笔记（popup 内预览） |
| M3 | Obsidian Local REST API 写入 + MOC 索引 | 笔记落盘到 vault 正确路径，MOC 自动追加 |
| M4 | options 页 + provider 预设 + .vtt 兜底 | 四个预设 provider 可切换；.vtt 拖入可解析 |
| v0.2 | 时间戳定位、章节批量、Prompt 模板市场 | — |
| v0.3 | YouTube / Bilibili | — |
