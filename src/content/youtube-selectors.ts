/**
 * YouTube DOM 选择器集中管理（只用结构/标签，不依赖 UI 语言文案）。
 * 每项是候选列表，按顺序尝试；YouTube 改版时只需改这里。
 */
export const YT_SELECTORS = {
  /** 描述区里的「显示文字稿」按钮 */
  transcriptButton: [
    'ytd-video-description-transcript-section-renderer button',
    'ytd-video-description-transcript-section-renderer ytd-button-renderer',
  ],
  /** 描述区展开按钮（文字稿按钮在折叠描述中可能未渲染） */
  descriptionExpand: ['ytd-watch-metadata #description-inline-expander #expand', 'tp-yt-paper-button#expand', '#expand'],
  transcriptPanel: [
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
    'ytd-engagement-panel-section-list-renderer[target-id*="transcript"]',
  ],
  panelClose: ['#visibility-button button', '#visibility-button ytd-button-renderer', 'button[aria-label][class*="close" i]'],
  segment: ['ytd-transcript-segment-renderer', 'transcript-segment-view-model'],
  segmentText: ['.segment-text', 'yt-formatted-string', 'span[role="text"]'],
  title: ['h1.ytd-watch-metadata yt-formatted-string', 'ytd-watch-metadata h1', 'h1.title'],
  channelLink: ['ytd-watch-metadata ytd-channel-name#channel-name a', 'ytd-video-owner-renderer ytd-channel-name a', '#owner #channel-name a'],
  video: ['#movie_player video', 'video.html5-main-video', 'video'],
} as const;

export type YtSelectorKey = keyof typeof YT_SELECTORS;

export function ytQuery<T extends Element = HTMLElement>(key: YtSelectorKey, root: ParentNode = document): T | null {
  for (const sel of YT_SELECTORS[key]) {
    const el = root.querySelector<T>(sel);
    if (el) return el;
  }
  return null;
}

export function ytQueryAll<T extends Element = HTMLElement>(key: YtSelectorKey, root: ParentNode = document): T[] {
  for (const sel of YT_SELECTORS[key]) {
    const els = root.querySelectorAll<T>(sel);
    if (els.length) return Array.from(els);
  }
  return [];
}
