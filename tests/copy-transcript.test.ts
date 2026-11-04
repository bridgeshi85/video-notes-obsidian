import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/config';

vi.mock('../src/shared/storage', () => ({
  getSettings: vi.fn(async () => DEFAULT_SETTINGS),
  getSecrets: vi.fn(async () => ({})),
  getChatSession: vi.fn(async () => ({ turns: [] })),
  saveChatSession: vi.fn(async () => {}),
}));

const transcript = {
  meta: {
    course: 'Course', courseSlug: 'course', lecture: 'Lecture', index: '',
    instructor: '', url: 'https://www.udemy.com/course/course/learn/lecture/1', duration: '',
  },
  text: `${'Full subtitle text. '.repeat(30)}\n最后一行字幕。`,
  charCount: 600,
  source: 'dom',
};

function element() {
  return {
    textContent: '', className: '', title: '', value: '', disabled: false,
    classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    addEventListener: vi.fn(), appendChild: vi.fn(),
  };
}

let elements: Map<string, ReturnType<typeof element>>;
let writeText: ReturnType<typeof vi.fn>;
let extract: ReturnType<typeof vi.fn>;

function getElement(id: string) {
  if (!elements.has(id)) elements.set(id, element());
  return elements.get(id)!;
}

async function clickCopy() {
  const listener = getElement('btn-copy-transcript').addEventListener.mock.calls
    .find(([event]) => event === 'click')?.[1];
  expect(listener).toBeTypeOf('function');
  listener();
  await vi.waitFor(() => expect(getElement('message').className).toMatch(/^msg (ok|error)$/));
}

beforeEach(() => {
  vi.resetModules();
  elements = new Map();
  writeText = vi.fn().mockResolvedValue(undefined);
  extract = vi.fn().mockResolvedValue({ ok: true, transcript });
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  vi.stubGlobal('document', {
    getElementById: getElement,
    createElement: element,
  });
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      onMessage: { addListener: vi.fn() },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 1, url: transcript.meta.url }]),
      sendMessage: extract,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(['popup', 'sidepanel'] as const)('%s 复制字幕', (page) => {
  async function load() {
    if (page === 'popup') await import('../src/popup/popup');
    else await import('../src/sidepanel/sidepanel');
    await vi.waitFor(() => {
      if (page === 'popup') expect(getElement('preview-text').textContent).toContain('Full subtitle');
      else expect(getElement('lecture-bar').textContent).toContain('Course');
    });
  }

  it('复制完整字幕而非截断预览，并显示成功提示', async () => {
    await load();
    expect(getElement('btn-copy-transcript').disabled).toBe(false);
    await clickCopy();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(transcript.text);
    expect(getElement('message').textContent).toContain('已复制到剪贴板');
    expect(getElement('message').className).toBe('msg ok');
  });

  it('剪贴板写入失败时显示错误提示', async () => {
    writeText.mockRejectedValue(new Error('Permission denied'));
    await load();
    await clickCopy();
    expect(getElement('message').textContent).toContain('复制失败');
    expect(getElement('message').className).toBe('msg error');
  });
});

it('侧边栏没有字幕时禁用复制按钮', async () => {
  extract.mockResolvedValue({ ok: false, error: '没有字幕' });
  await import('../src/sidepanel/sidepanel');
  await vi.waitFor(() => expect(getElement('message').textContent).toBe('没有字幕'));
  expect(getElement('btn-copy-transcript').disabled).toBe(true);
  expect(writeText).not.toHaveBeenCalled();
});
