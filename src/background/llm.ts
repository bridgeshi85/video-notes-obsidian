import { splitIntoChunks } from '../shared/chunk';
import { renderTemplate } from '../shared/config';
import type { LectureMeta, LlmConfig, PromptConfig } from '../shared/types';

const REQUEST_TIMEOUT_MS = 180_000;
const MAX_RATE_LIMIT_RETRIES = 5;
const SYSTEM_PROMPT = '你是严谨的中文技术学习笔记助手，始终使用简体中文输出。';

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

/** 生成失败时携带已完成部分 */
export class GenerateError extends Error {
  constructor(
    message: string,
    readonly partial: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isContextLengthError(status: number | undefined, message: string): boolean {
  return (status === 400 || status === 413) && /context|maximum|too long|token|length/i.test(message);
}

async function chatOnce(cfg: LlmConfig, apiKey: string, prompt: string, maxTokens = cfg.maxTokens): Promise<string> {
  if (!cfg.baseUrl) throw new LlmError('未配置 LLM 端点，请在设置页填写 baseUrl。');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model: cfg.modelName,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: cfg.temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    });
  } catch (e) {
    const err = e as Error;
    const reason = err.name === 'TimeoutError' ? '请求超时' : err.message;
    throw new LlmError(`无法连接 LLM 端点（${reason}）。请检查 baseUrl、网络，以及是否授予了该域名的访问权限。`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let detail = body;
    try {
      detail = JSON.parse(body)?.error?.message ?? body;
    } catch {
      /* 非 JSON 响应，保留原文 */
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new LlmError(
      `LLM 请求失败（HTTP ${res.status}）：${String(detail).slice(0, 300)}`,
      res.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    );
  }

  const json = await res.json();
  const content: unknown = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new LlmError('LLM 返回内容为空。');
  }
  return content;
}

/** 带重试的调用：429 指数退避；其他错误重试 1 次；上下文超长不重试 */
export async function chat(cfg: LlmConfig, apiKey: string, prompt: string, maxTokens?: number): Promise<string> {
  let rateLimitRetries = 0;
  let otherRetries = 0;
  for (;;) {
    try {
      return await chatOnce(cfg, apiKey, prompt, maxTokens);
    } catch (e) {
      if (!(e instanceof LlmError)) throw e;
      if (isContextLengthError(e.status, e.message)) {
        throw new LlmError(`${e.message}\n输入超出模型上下文长度：请在设置中调小"分块阈值"，或切换到更大上下文的模型。`, e.status);
      }
      if (e.status === 401 || e.status === 403) throw e;
      if (e.status === 429 && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
        await sleep(e.retryAfterMs ?? 2000 * 2 ** rateLimitRetries);
        rateLimitRetries++;
        continue;
      }
      if (e.status !== 429 && otherRetries < 1) {
        otherRetries++;
        await sleep(1500);
        continue;
      }
      throw e;
    }
  }
}

export interface GenerateInput {
  meta: LectureMeta;
  text: string;
  llm: LlmConfig;
  prompts: PromptConfig;
  apiKey: string;
}

export interface Progress {
  stage: 'map' | 'reduce';
  done: number;
  total: number;
}

/** 生成笔记正文：单块直接成文；超阈值时 map（串行）→ reduce */
export async function generateNoteBody(input: GenerateInput, onProgress: (p: Progress) => void): Promise<string> {
  const { meta, text, llm, prompts, apiKey } = input;
  const chunks = splitIntoChunks(text, llm.chunkTokens);
  const total = chunks.length === 1 ? 1 : chunks.length + 1;
  const base = { course: meta.course, lecture: meta.lecture };

  if (chunks.length === 1) {
    onProgress({ stage: 'reduce', done: 0, total });
    const body = await chat(llm, apiKey, renderTemplate(prompts.reduce, { ...base, inputKind: '字幕', content: text }));
    onProgress({ stage: 'reduce', done: 1, total });
    return body;
  }

  const points: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress({ stage: 'map', done: i, total });
    try {
      const prompt = renderTemplate(prompts.map, {
        ...base,
        part: i + 1,
        total: chunks.length,
        content: chunks[i],
      });
      points.push(`### 第 ${i + 1} 段要点\n\n${(await chat(llm, apiKey, prompt)).trim()}`);
    } catch (e) {
      throw new GenerateError(`第 ${i + 1}/${chunks.length} 段要点提取失败：${(e as Error).message}`, points.join('\n\n'));
    }
  }

  const allPoints = points.join('\n\n');
  onProgress({ stage: 'reduce', done: chunks.length, total });
  try {
    const body = await chat(
      llm,
      apiKey,
      renderTemplate(prompts.reduce, { ...base, inputKind: '分段要点（由字幕逐段提取）', content: allPoints }),
    );
    onProgress({ stage: 'reduce', done: total, total });
    return body;
  } catch (e) {
    throw new GenerateError(`汇总笔记失败：${(e as Error).message}`, allPoints);
  }
}
