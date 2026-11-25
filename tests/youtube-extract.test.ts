// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    document.dispatchEvent(new Event('yt-navigate-finish'));
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

  function modernTranscript() {
    return `<yt-section-list-renderer data-target-id="PAmodern_transcript_view" panel-content-visible>
      <div class="ytSectionListRendererHeader"><textarea placeholder="搜索转写内容"></textarea></div>
      <div class="ytSectionListRendererContents">
        ${['Hi guys, welcome back.', 'Automation that you define in markdown.'].map((line, i) => `
          <yt-item-section-renderer aria-busy="false">
            <div id="header"><timeline-chapter-view-model><h3>Chapter ${i + 1}</h3></timeline-chapter-view-model></div>
            <div id="contents"><macro-markers-panel-item-view-model><timeline-item-view-model>
              <transcript-segment-view-model>
                <div aria-hidden="true" class="ytwTranscriptSegmentViewModelTimestamp">${i}:00</div>
                <div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">${i}分钟</div>
                <span class="ytAttributedStringHost" role="text">${line}</span>
              </transcript-segment-view-model>
            </timeline-item-view-model></macro-markers-panel-item-view-model></div>
          </yt-item-section-renderer>`).join('')}
        <transcript-segment-view-model><div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">99分钟</div></transcript-segment-view-model>
      </div>
      <div class="ytSectionListRendererSyncContainer"><button><span role="text">与视频时间同步</span></button></div>
    </yt-section-list-renderer>`;
  }

  it('读取已打开的新版分章节文字稿，不包含时间戳、章节或按钮文字', async () => {
    setupPage({ withButton: false });
    // 页面中可以同时保留一个隐藏的旧面板。
    document.body.insertAdjacentHTML('beforeend', `<div id="content">${modernTranscript()}</div>`);
    const res = await extract();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.transcript.text).toContain('Hi guys, welcome back.');
    expect(res.transcript.text).toContain('Automation that you define in markdown.');
    expect(res.transcript.text).not.toMatch(/Chapter|分钟|0:00|1:00|与视频时间同步/);
    expect(document.querySelector('[data-target-id="PAmodern_transcript_view"]')?.hasAttribute('panel-content-visible')).toBe(true);
  });

  it('打开新版面板后使用外层关闭按钮恢复状态', async () => {
    setupPage();
    document.querySelector(`[target-id="${PANEL_ATTR}"]`)!.remove();
    document.getElementById('tbtn')!.replaceWith(document.createElement('button'));
    const button = document.querySelector('ytd-video-description-transcript-section-renderer button')!;
    const close = vi.fn();
    button.addEventListener('click', () => {
      const container = document.createElement('ytd-engagement-panel-section-list-renderer');
      container.setAttribute('target-id', 'modern-panel');
      container.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
      container.innerHTML = `<div id="visibility-button"><button></button></div><div id="content">${modernTranscript()}</div>`;
      container.querySelector('button')!.addEventListener('click', () => {
        close();
        container.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
      });
      document.body.appendChild(container);
    });
    const res = await extract();
    expect(res.ok).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[target-id="modern-panel"]')?.getAttribute('visibility')).toBe('ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  });

  it('不会读取隐藏外层面板中残留的新版字幕', async () => {
    setupPage({ withButton: false });
    document.getElementById('segments')!.innerHTML = modernTranscript();
    const res = await extract();
    expect(res.ok).toBe(false);
  }, 10000);

  it('非 watch 页返回错误', async () => {
    window.history.replaceState(null, '', '/');
    const res = await extract();
    expect(res.ok).toBe(false);
  });
});
