import { afterEach, expect, it, vi } from 'vitest';
import { getChatSession } from '../src/shared/storage';

afterEach(() => vi.unstubAllGlobals());

const youtubeUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
const udemyUrl = 'https://www.udemy.com/course/docker/learn/lecture/123';

it.each([[youtubeUrl, udemyUrl], [udemyUrl, youtubeUrl]])('does not restore %s subtitles on %s', async (previous, current) => {
  vi.stubGlobal('chrome', { storage: { session: { get: vi.fn(async () => ({
    'chat_session:latest': { transcript: { meta: { url: previous } }, turns: [{ role: 'user', content: 'Old video' }] },
  })) } } });
  expect(await getChatSession(current)).toEqual({ turns: [] });
});

it('restores a matching video session despite timestamp parameters', async () => {
  const session = { transcript: { meta: { url: youtubeUrl } }, turns: [] };
  vi.stubGlobal('chrome', { storage: { session: { get: vi.fn(async () => ({ 'chat_session:latest': session })) } } });
  expect(await getChatSession(`${youtubeUrl}&t=30`)).toEqual(session);
});
