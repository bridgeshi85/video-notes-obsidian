/** 当前 lecture 的元数据（content script 从页面读取） */
export interface LectureMeta {
  course: string;
  /** 课程 URL slug，用作主题 tag */
  courseSlug: string;
  lecture: string;
  /** 节序号（如 "012"），取不到时为空串 */
  index: string;
  instructor: string;
  url: string;
  /** 时长，格式 mm:ss 或 h:mm:ss，取不到时为空串 */
  duration: string;
}

export interface Transcript {
  meta: LectureMeta;
  /** 清洗后的纯文本（段落以空行分隔） */
  text: string;
  charCount: number;
  source: 'dom' | 'vtt';
}

export type ProviderId = 'deepseek' | 'qwen' | 'glm' | 'ollama' | 'custom';

export interface LlmConfig {
  provider: ProviderId;
  baseUrl: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  /** 单块 token 阈值，超过则 map-reduce 分块 */
  chunkTokens: number;
}

export type ObsidianMode = 'rest' | 'download';

export interface ObsidianConfig {
  mode: ObsidianMode;
  /** Local REST API 地址，默认 https://127.0.0.1:27124 */
  restUrl: string;
  /** vault 内的根目录 */
  baseFolder: string;
}

export interface PromptConfig {
  /** Map 阶段：每块字幕 → 要点 */
  map: string;
  /** Reduce / 单块阶段：字幕或要点 → 最终笔记正文 */
  reduce: string;
}

/** chrome.storage.sync 中的设置（不含任何密钥） */
export interface SyncSettings {
  llm: LlmConfig;
  obsidian: ObsidianConfig;
  prompts: PromptConfig;
}

/** chrome.storage.local 中的密钥（不同步） */
export interface Secrets {
  llmApiKey: string;
  obsidianApiKey: string;
}

export type JobStage = 'idle' | 'map' | 'reduce' | 'done' | 'error';

export interface Job {
  id: string;
  meta: LectureMeta;
  stage: JobStage;
  /** 已完成 / 总 LLM 调用次数 */
  done: number;
  total: number;
  /** 最终笔记（完整 markdown，含 frontmatter） */
  note?: string;
  /** 失败时已生成的部分（map 阶段要点） */
  partial?: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface HistoryEntry {
  course: string;
  lecture: string;
  url: string;
  time: number;
  status: 'generated' | 'saved' | 'error';
  path?: string;
}
