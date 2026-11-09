# Video Notes for Obsidian

BYOK 视频学习笔记 Chrome 插件：提取视频课程字幕 → 用你自己的 LLM 生成中文笔记 → 保存到本地 Obsidian vault。

- **MVP 平台**：Udemy（当前正在看的一节）
- **BYOK**：DeepSeek / Qwen / GLM / Ollama 或任何 OpenAI 兼容端点
- **设计文档**：见 [DESIGN.md](./DESIGN.md)

> 状态：v0.1 已实现（M1–M4），Udemy DOM 选择器待真实页面验证 🧪

## 开发

```bash
npm install
npm run dev        # 开发模式（HMR），输出到 dist/
npm run build      # 类型检查 + 生产构建
npm test           # 单元测试（清洗 / VTT 解析 / 分块 / 笔记格式 / LLM 重试）
```

在 Chrome 打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist/` 目录。

## 首次配置

安装后会自动打开设置页：

1. **LLM**：选择服务商预设，填写 API Key，点「测试连接」。
   - 自定义端点保存时会动态申请该域名的访问权限。
   - Ollama 需以 `OLLAMA_ORIGINS="chrome-extension://*" ollama serve` 启动，否则会被拒绝。
2. **Obsidian**（推荐 Local REST API）：
   - 在 Obsidian 安装社区插件 **Local REST API**，复制其 API Key 填入设置页。
   - HTTPS 端口（27124）是自签证书：先在浏览器访问 <https://127.0.0.1:27124> 选择继续访问；或在插件里启用 HTTP 端口，并把地址改为 `http://127.0.0.1:27123`。
   - 不想装插件可选「下载 .md 文件」降级方案。

## 使用

1. 打开 Udemy 课程播放页（`udemy.com/course/<课程>/learn/lecture/<id>`）。
2. 点击插件图标 → 自动读取当前节 Transcript（会临时打开/滚动面板）→ 预览字数与开头 200 字，可修改课程名/序号/节标题。
3. 「生成笔记」→ 后台调用 LLM（长字幕自动 map-reduce 分块），期间可关闭 popup。
4. 预览、可直接编辑 → 「保存到 Obsidian」（同名笔记会提示覆盖），同时在 `<课程名> MOC.md` 追加链接。

没有 Transcript 的课程，可从其他渠道获取 `.vtt` / `.srt` 字幕，拖入 popup 底部的拖放区。

### YouTube

1. 打开视频页（`youtube.com/watch?v=...`）。
2. 点击插件图标或打开侧边栏 →「提取字幕」：插件会自动展开描述区、点击「显示文字稿」面板读取字幕，读完后关闭面板。使用页面当前显示的字幕语言。
3. 总结 / 对话问答 / 保存与 Udemy 一致。
4. 笔记平铺保存在「基础目录」的同级 `YouTube/` 目录下（默认 `素材库/VideoNotes/YouTube/`），文件名为 `<标题>-<视频ID前6位>.md`，**不生成 MOC**。frontmatter 使用 `channel` / `title` / `video_id`，标签为 `youtube`。

注意：
- 视频没有字幕/文字稿时会提示「该视频没有字幕」，可自行准备 `.vtt` / `.srt` 上传。
- 暂不支持 Shorts、直播。
- 对话问答只把前 `chunkTokens × 2` 的字幕放入上下文；长视频提问超出范围时可能不准确（总结使用 map-reduce，不受影响）。

## 目录结构

```
src/
├── content/      # 页面脚本：index.ts 按域名分发到 udemy.ts / youtube.ts；选择器在 selectors.ts / youtube-selectors.ts
├── background/   # service worker：llm.ts（重试/退避/map-reduce）、obsidian.ts（REST API / 下载）
├── popup/        # 主交互：预览 → 生成 → 保存
├── options/      # 设置页：LLM / Obsidian / Prompt 模板 / 历史
└── shared/       # 纯逻辑：清洗、VTT 解析、分块、笔记格式、存储、类型
tests/            # vitest 单元测试
```

## Udemy / YouTube 改版怎么办

提取失败时 popup 会给出明确报错。所有选择器在 [src/content/selectors.ts](src/content/selectors.ts)，每项是按顺序尝试的候选列表，改这一个文件即可。YouTube 选择器在 [src/content/youtube-selectors.ts](src/content/youtube-selectors.ts)（只依赖标签/结构，不依赖界面语言文案）。
