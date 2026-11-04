// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/config';
import sidepanelHtml from '../src/sidepanel/index.html?raw';

const reply = '# Summary\n\n**Key point**\n\n[Docs](https://example.com)';

vi.mock('../src/shared/storage', () => ({
  getSettings: vi.fn(async () => DEFAULT_SETTINGS),
  getSecrets: vi.fn(async () => ({})),
  getChatSession: vi.fn(async () => ({
    turns: [
      { role: 'user', content: '**Question** <img src=x onerror=alert(1)>' },
      { role: 'assistant', content: reply, isNote: true },
    ],
  })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

it('renders AI replies safely, keeps user messages plain and copies original Markdown', async () => {
  document.body.innerHTML = sidepanelHtml;
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      onMessage: { addListener: vi.fn() },
    },
    tabs: { query: vi.fn().mockResolvedValue([]) },
  });

  await import('../src/sidepanel/sidepanel');
  await vi.waitFor(() => expect(document.querySelector('.assistant h1')?.textContent).toBe('Summary'));
  expect(document.querySelector('.assistant strong')?.textContent).toBe('Key point');
  expect(document.querySelector('.user .bubble-content')?.textContent).toContain('**Question**');
  expect(document.querySelector('.user img, .user strong')).toBeNull();
  const link = document.querySelector('.assistant a');
  expect(link?.getAttribute('target')).toBe('_blank');
  expect(link?.getAttribute('rel')).toBe('noopener noreferrer');

  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.assistant button')];
  expect(buttons.some((button) => button.textContent?.includes('保存到 Obsidian'))).toBe(true);
  buttons.find((button) => button.textContent === '复制')!.click();
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(reply));
});
