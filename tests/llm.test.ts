import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat, GenerateError, generateNoteBody } from '../src/background/llm';
import { DEFAULT_LLM, DEFAULT_PROMPTS } from '../src/shared/config';
import type { LectureMeta } from '../src/shared/types';

const meta: LectureMeta = {
  course: 'C',
  courseSlug: 'c',
  lecture: 'L',
  index: '',
  instructor: '',
  url: '',
  duration: '',
};

function reply(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

function httpError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: { message } }), { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('chat', () => {
  it('普通错误重试 1 次', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(httpError(500, 'boom')).mockResolvedValueOnce(reply('ok'));
    vi.stubGlobal('fetch', fetch);
    const p = chat(DEFAULT_LLM, 'k', 'hi');
    await vi.runAllTimersAsync();
    expect(await p).toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer k');
  });

  it('429 按 Retry-After 退避后成功', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(httpError(429, 'slow down', { 'retry-after': '1' }))
      .mockResolvedValueOnce(httpError(429, 'slow down'))
      .mockResolvedValueOnce(reply('ok'));
    vi.stubGlobal('fetch', fetch);
    const p = chat(DEFAULT_LLM, 'k', 'hi');
    await vi.runAllTimersAsync();
    expect(await p).toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('上下文超长不重试并给出提示', async () => {
    const fetch = vi.fn().mockResolvedValue(httpError(400, 'maximum context length exceeded'));
    vi.stubGlobal('fetch', fetch);
    await expect(chat(DEFAULT_LLM, 'k', 'hi')).rejects.toThrow(/更大上下文/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('无 key 时不发送 Authorization（Ollama）', async () => {
    const fetch = vi.fn().mockResolvedValue(reply('ok'));
    vi.stubGlobal('fetch', fetch);
    await chat({ ...DEFAULT_LLM, baseUrl: 'http://localhost:11434/v1/' }, '', 'hi');
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});

describe('generateNoteBody', () => {
  const long = Array(10).fill('Paragraph text about docker images and containers.').join('\n\n');

  it('短文本单次调用', async () => {
    const fetch = vi.fn().mockResolvedValue(reply('## 📝 核心总结\nx'));
    vi.stubGlobal('fetch', fetch);
    const body = await generateNoteBody(
      { meta, text: 'short', llm: DEFAULT_LLM, prompts: DEFAULT_PROMPTS, apiKey: 'k' },
      () => {},
    );
    expect(body).toContain('核心总结');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('长文本 map → reduce，reduce 收到所有要点', async () => {
    const fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const prompt = JSON.parse(init.body as string).messages[1].content as string;
      return reply(prompt.includes('分段要点') ? 'FINAL' : 'POINT');
    });
    vi.stubGlobal('fetch', fetch);
    const progress: string[] = [];
    const body = await generateNoteBody(
      { meta, text: long, llm: { ...DEFAULT_LLM, chunkTokens: 30 }, prompts: DEFAULT_PROMPTS, apiKey: 'k' },
      (p) => progress.push(`${p.stage}:${p.done}/${p.total}`),
    );
    expect(body).toBe('FINAL');
    const calls = fetch.mock.calls.length;
    expect(calls).toBeGreaterThan(2);
    const reducePrompt = JSON.parse(fetch.mock.calls[calls - 1][1].body).messages[1].content as string;
    expect(reducePrompt.match(/POINT/g)?.length).toBe(calls - 1);
    expect(progress.at(-1)).toBe(`reduce:${calls}/${calls}`);
  });

  it('map 中途失败时保留已完成要点', async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => (n++ === 0 ? reply('POINT-1') : httpError(500, 'down'))),
    );
    const p = generateNoteBody(
      { meta, text: long, llm: { ...DEFAULT_LLM, chunkTokens: 30 }, prompts: DEFAULT_PROMPTS, apiKey: 'k' },
      () => {},
    ).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = await p;
    expect(err).toBeInstanceOf(GenerateError);
    expect((err as GenerateError).partial).toContain('POINT-1');
    expect((err as GenerateError).message).toMatch(/第 2\/\d+ 段/);
  });
});
