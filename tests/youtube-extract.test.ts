// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { extract, readMeta } from '../src/content/youtube';

const PANEL_ATTR = 'engagement-panel-searchable-transcript';

function setupPage({ withButton = true } = {}) {
  window.history.replaceState(null, '', '/watch?v=abcdefghijk&t=30s');
  document.body.innerHTML = `
    <ytd-watch-metadata>
      <h1 class="ytd-watch-metadata"><yt-formatted-string>My Video Title</yt-formatted-string></h1>
      <ytd-channel-name id="channel-name"><a href="/@SomeChannel">Some Channel</a></ytd-channel-name>
    </ytd-watch-metadata>
    ${withButton ? '<ytd-video-description-transcript-section-renderer><button id="tbtn">Show transcript</button></ytd-video-description-transcript-section-renderer>' : ''}
    <ytd-engagement-panel-section-list-renderer target-id="${PANEL_ATTR}" visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN">
      <div id="visibility-button"><button id="close"></button></div>
      <div id="segments"></div>
    </ytd-engagement-panel-section-list-renderer>`;

  const panel = document.querySelector<HTMLElement>(`[target-id="${PANEL_ATTR}"]`)!;
  document.getElementById('close')!.addEventListener('click', () => {
    panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  });
  document.getElementById('tbtn')?.addEventListener('click', () => {
    panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    setTimeout(() => {
      document.getElementById('segments')!.innerHTML = ['Hello world.', 'Hello world.', 'This is a test.']
        .map((t) => `<ytd-transcript-segment-renderer><div class="segment-timestamp">0:01</div><yt-formatted-string class="segment-text">${t}</yt-formatted-string></ytd-transcript-segment-renderer>`)
        .join('');
    }, 50);
  });
  return panel;
}

describe('youtube content script', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('readMeta 读取标题/频道/handle 并规范化 URL', () => {
    setupPage();
    const meta = readMeta();
    expect(meta).toMatchObject({
      platform: 'youtube',
      videoId: 'abcdefghijk',
      course: 'Some Channel',
      courseSlug: 'SomeChannel',
      lecture: 'My Video Title',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
    });
  });

  it('打开文字稿面板、提取字幕并关闭面板', async () => {
    const panel = setupPage();
    const res = await extract();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.transcript.text).toContain('Hello world.');
    expect(res.transcript.text).not.toContain('0:01');
    expect(res.transcript.text.match(/Hello world\./g)).toHaveLength(1);
    expect(res.transcript.meta.platform).toBe('youtube');
    expect(panel.getAttribute('visibility')).toBe('ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  });

  it('无文字稿按钮时返回明确错误', async () => {
    setupPage({ withButton: false });
    const res = await extract();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain('没有字幕');
  }, 10000);

  it('非 watch 页返回错误', async () => {
    window.history.replaceState(null, '', '/');
    const res = await extract();
    expect(res.ok).toBe(false);
  });
});
