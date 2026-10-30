# Video Notes for Obsidian — v0.2 实现计划

## 1. 提取字幕后直接下载/保存（无需 AI 总结） ✅ 已完成
- **`src/shared/note.ts`**：
  - `buildNotePaths(meta, baseFolder, suffix = '')` 支持可选文件名后缀（如 `-transcript`），避免覆盖 AI 总结笔记。
  - 新增 `buildTranscriptNote(meta, transcript, paths, date)`：生成包含标准 YAML frontmatter（`type: video-transcript`）、课程标题、`## 📜 课程字幕` 正文与 MOC 链接的 Markdown。
- **`src/shared/messages.ts` & `src/background/`**：
  - 新增 `SAVE_TRANSCRIPT { transcript, mode: 'rest' | 'download' }` 消息，调用 `saveToObsidian` 或 `downloadNote`（后缀 `-transcript`）落盘并记录历史。
- **`src/popup/`**：
  - 在 `view-preview` 预览区增加「⬇️ 下载字幕 .md」与「💾 存字幕到 Obsidian」（当写入模式为 REST 时显示）按钮，提取或拖入 `.vtt/.srt` 后可一键导出，完全不经过 LLM。

## 2. Chrome Side Panel 对话框（总结 + 多轮提问）
- **`manifest.config.ts`**：
  - 新增 `sidePanel` 权限与 `side_panel.default_path: 'src/sidepanel/index.html'`。
- **UI (`src/sidepanel/`)**：
  - 顶部栏展示当前课程小节标题，提供「提取字幕」「上传字幕」「下载字幕 .md」操作。
  - 消息列表展示 User / Assistant 气泡。
  - 快捷操作「✨ 总结笔记」复用 `GENERATE` 流程与进度，完成后在气泡内提供保存到 Obsidian / 下载按钮。
  - 底部输入框支持基于当前字幕的多轮自由提问与清空对话。
  - Popup 顶部提供「💬 对话」按钮（调用 `chrome.sidePanel.open`）。
- **通信与 LLM (`src/background/llm.ts`)**：
  - 扩展 `chat` / `chatOnce` 支持完整 `messages[]` 数组。
  - 新增 `CHAT { transcript, history, question }` 消息与 `chatWithTranscript` 函数，将清洗后的字幕作为系统上下文（按 `chunkTokens` 截断保护），携带最近 N 轮历史调用模型。
  - 会话状态按 lecture URL 缓存在 `chrome.storage.session` 中。

## 3. 设置页获取模型列表
- **`src/background/llm.ts`**：
  - 新增 `listModels(baseUrl, apiKey)`：请求 `GET {baseUrl}/models` 解析 `data[].id`；若为 Ollama 且失败则回退 `GET /api/tags` 解析 `models[].name`。
- **`src/shared/messages.ts` & `src/background/index.ts`**：
  - 新增 `LIST_MODELS { baseUrl, apiKey }` 消息，由 background 发起请求规避 CORS。
- **`src/options/`**：
  - 模型输入框关联 `<datalist id="model-list">`，旁置「🔄 获取模型」按钮；点击时先动态申请对应 `baseUrl` 的 host permission，拉取成功后填充下拉候选，同时保留手动输入能力。
