// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectPlatform } from '../src/shared/url';

vi.mock('../src/content/udemy', () => ({
  isSupportedPage: () => true,
  extract: vi.fn(async () => ({ ok: true, platform: 'udemy' })),
  readMeta: vi.fn(() => ({ platform: 'udemy' })),
}));
vi.mock('../src/content/youtube', () => ({
  isSupportedPage: () => true,
  extract: vi.fn(async () => ({ ok: true, platform: 'youtube' })),
  readMeta: vi.fn(() => ({ platform: 'youtube' })),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe('platform detection', () => {
  it.each([
    ['https://www.udemy.com/course/test/learn/lecture/1', 'udemy'],
    ['https://company.udemy.com/course/test/learn/lecture/1', 'udemy'],
    ['https://www.youtube.com/watch?v=abcdefghijk', 'youtube'],
    ['https://fakeudemy.com/course/test/learn/lecture/1', null],
    ['https://www.youtube.com/', null],
    ['https://m.youtube.com/watch?v=abcdefghijk', null],
    ['file:///watch?v=abcdefghijk', null],
  ])('%s -> %s', (url, platform) => {
    expect(detectPlatform(url)).toBe(platform);
  });
});

describe('content script dispatch', () => {
  it.each(['udemy', 'youtube'] as const)('only calls %s extractor and metadata reader', async (platform) => {
    vi.stubGlobal('location', { href: platform === 'udemy'
      ? 'https://www.udemy.com/course/test/learn/lecture/1'
      : 'https://www.youtube.com/watch?v=abcdefghijk' });
    const addListener = vi.fn();
    vi.stubGlobal('chrome', { runtime: { onMessage: { addListener } } });
    await import('../src/content/index');
    const listener = addListener.mock.calls[0][0];
    const response = vi.fn();
    expect(listener({ type: 'EXTRACT' }, {}, response)).toBe(true);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ ok: true, platform }));
    const udemy = await import('../src/content/udemy');
    const youtube = await import('../src/content/youtube');
    const selected = platform === 'udemy' ? udemy : youtube;
    const other = platform === 'udemy' ? youtube : udemy;
    expect(selected.extract).toHaveBeenCalledTimes(1);
    expect(other.extract).not.toHaveBeenCalled();
    response.mockClear();
    listener({ type: 'GET_META' }, {}, response);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ ok: true, meta: { platform } }));
    expect(other.readMeta).not.toHaveBeenCalled();
  });

  it('rejects unsupported pages without invoking any extractor', async () => {
    vi.stubGlobal('location', { href: 'https://example.com' });
    const addListener = vi.fn();
    vi.stubGlobal('chrome', { runtime: { onMessage: { addListener } } });
    await import('../src/content/index');
    const response = vi.fn();
    addListener.mock.calls[0][0]({ type: 'EXTRACT' }, {}, response);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith(expect.objectContaining({ ok: false })));
    expect((await import('../src/content/udemy')).extract).not.toHaveBeenCalled();
    expect((await import('../src/content/youtube')).extract).not.toHaveBeenCalled();
  });
});
