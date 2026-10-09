import type { LlmConfig, ObsidianConfig, PromptConfig, ProviderId, SyncSettings } from './types';

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  baseUrl: string;
  modelName: string;
  needsKey: boolean;
  hint?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    modelName: 'deepseek-chat',
    needsKey: true,
  },
  {
    id: 'qwen',
    label: 'Qwen（阿里云百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-plus',
    needsKey: true,
  },
  {
    id: 'glm',
    label: 'GLM（智谱）',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelName: 'glm-4-flash',
    needsKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    modelName: 'qwen2.5:7b',
    needsKey: false,
    hint: 'Ollama 默认拒绝浏览器扩展来源的请求，需以 OLLAMA_ORIGINS="chrome-extension://*" 启动 ollama serve。',
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    modelName: '',
    needsKey: true,
  },
];

export function getPreset(id: ProviderId): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? PROVIDER_PRESETS[0];
}

export const DEFAULT_MAP_PROMPT = `你是一名技术课程笔记助手。下面是视频课程《{{course}}》中「{{lecture}}」一节字幕的第 {{part}}/{{total}} 段。

请从这段字幕中提取：
1. 关键要点与核心概念（含必要解释）
2. 出现的代码、命令、配置（原样保留，使用代码块）
3. 实战步骤或操作流程
4. 讲师强调的注意事项、坑点

要求：
- 只输出要点列表，不要寒暄、不要总结全文
- 字幕可能来自自动语音识别，请修正明显的识别错误（尤其是技术术语）
- 必须使用中文输出（代码、命令、专有名词保留原文）

字幕：
"""
{{content}}
"""`;

export const DEFAULT_REDUCE_PROMPT = `你是一名技术课程笔记助手。下面是视频课程《{{course}}》中「{{lecture}}」一节的{{inputKind}}。

请整理成一篇中文结构化学习笔记，严格按以下 Markdown 结构输出（只输出这三个二级标题及其内容，不要输出一级标题、frontmatter 或其他额外内容）：

## 📝 核心总结
用 3-5 句话概括本节的核心内容。

## 🎯 关键要点
- 以列表形式列出关键概念与知识点，每条一句话说清楚，必要时附简短解释

## 💡 实战细节
本节涉及的代码、命令、配置、操作步骤（代码使用带语言标注的代码块）。若本节没有实战内容，写"本节无实战内容"。

要求：
- 字幕可能来自自动语音识别，请修正明显的识别错误（尤其是技术术语）
- 必须使用中文输出（代码、命令、专有名词保留原文）
- 不要编造字幕中没有的内容

内容：
"""
{{content}}
"""`;

export const DEFAULT_LLM: LlmConfig = {
  provider: 'deepseek',
  baseUrl: PROVIDER_PRESETS[0].baseUrl,
  modelName: PROVIDER_PRESETS[0].modelName,
  temperature: 0.3,
  maxTokens: 4096,
  chunkTokens: 6000,
};

export const DEFAULT_OBSIDIAN: ObsidianConfig = {
  mode: 'rest',
  restUrl: 'https://127.0.0.1:27124',
  baseFolder: '素材库/VideoNotes/Udemy',
};

export const DEFAULT_PROMPTS: PromptConfig = {
  map: DEFAULT_MAP_PROMPT,
  reduce: DEFAULT_REDUCE_PROMPT,
};

export const DEFAULT_SETTINGS: SyncSettings = {
  llm: DEFAULT_LLM,
  obsidian: DEFAULT_OBSIDIAN,
  prompts: DEFAULT_PROMPTS,
};

/** 简单模板渲染：{{key}} → vars[key] */
export function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, key: string) =>
    key in vars ? String(vars[key]) : m,
  );
}
