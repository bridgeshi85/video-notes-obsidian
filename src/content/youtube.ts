import { cleanTranscript, countChars } from '../shared/clean';
import type { ExtractResponse } from '../shared/messages';
import type { LectureMeta } from '../shared/types';
import { formatDuration, sleep, text, waitFor } from './util';
import { ytQuery, ytQueryAll } from './youtube-selectors';

const PANEL_EXPANDED = 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
const PANEL_HIDDEN = 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN';

/** 最近一次由本脚本加载文字稿时对应的视频 ID（SPA 跳转后用于判断面板是否过期） */
let loadedForVideoId: string | null = null;

document.addEventListener('yt-navigate-finish', () => {
  loadedForVideoId = null;
});

export function currentVideoId(): string {
  if (location.pathname !== '/watch') return '';
  return new URLSearchParams(location.search).get('v') ?? '';
}

export function isSupportedPage(): boolean {
  return !!currentVideoId();
}

export function canonicalWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function readMeta(): LectureMeta {
  const videoId = currentVideoId();
  const channelLink = ytQuery<HTMLAnchorElement>('channelLink');
  const channel = text(channelLink);
  const handle = channelLink?.getAttribute('href')?.match(/\/@([^/?#]+)/)?.[1] ?? '';
  const title = text(ytQuery('title')) || document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim() || videoId;
  const video = ytQuery<HTMLVideoElement>('video');

  return {
    platform: 'youtube',
    videoId,
    course: channel || 'YouTube',
    courseSlug: handle ? decodeURIComponent(handle) : '',
    lecture: title,
    index: '',
    instructor: channel,
    url: canonicalWatchUrl(videoId),
    duration: formatDuration(video?.duration ?? NaN),
  };
}

function panelEl(): HTMLElement | null {
  return ytQuery('transcriptPanel');
}

function isPanelOpen(panel: HTMLElement | null): boolean {
  return !!panel && panel.getAttribute('visibility') === PANEL_EXPANDED;
}

function closePanel(panel: HTMLElement | null): void {
  if (!panel) return;
  const btn = ytQuery<HTMLElement>('panelClose', panel);
  if (btn) btn.click();
  else panel.setAttribute('visibility', PANEL_HIDDEN);
}

async function findTranscriptButton(): Promise<HTMLElement | null> {
  let btn = ytQuery<HTMLElement>('transcriptButton');
  if (btn) return btn;
  // 文字稿按钮位于描述区，折叠时可能未渲染：展开描述后再找
  ytQuery<HTMLElement>('descriptionExpand')?.click();
  btn = await waitFor(() => ytQuery<HTMLElement>('transcriptButton'), 3000);
  return btn;
}

/** 读取片段文本；等待数量稳定（异步加载 / 旧内容替换） */
async function collectSegments(panel: HTMLElement): Promise<string[]> {
  const ready = await waitFor(() => ytQueryAll('segment', panel).length > 0 || null, 8000);
  if (!ready) return [];
  let prev = -1;
  for (let i = 0; i < 20; i++) {
    const n = ytQueryAll('segment', panel).length;
    if (n === prev) break;
    prev = n;
    await sleep(250);
  }
  const lines: string[] = [];
  for (const seg of ytQueryAll('segment', panel)) {
    const t = text(ytQuery('segmentText', seg)) || text(seg);
    if (t) lines.push(t);
  }
  return lines;
}

export async function extract(): Promise<ExtractResponse> {
  const videoId = currentVideoId();
  if (!videoId) return { ok: false, error: '当前页面不是 YouTube 视频播放页（/watch?v=...）。' };

  let panel = panelEl();
  let openedByUs = false;

  // 面板已开但可能是上一个视频的内容（SPA 跳转），则关闭后重开
  if (isPanelOpen(panel) && loadedForVideoId !== null && loadedForVideoId !== videoId) {
    closePanel(panel);
    await sleep(300);
  }

  if (!isPanelOpen(panelEl())) {
    const btn = await findTranscriptButton();
    if (!btn) {
      return { ok: false, error: '该视频没有字幕/文字稿（未找到「显示文字稿」按钮）。也可以上传 .vtt/.srt 字幕文件。' };
    }
    btn.click();
    openedByUs = true;
    panel = await waitFor(() => (isPanelOpen(panelEl()) ? panelEl() : null), 8000);
    if (!panel) {
      return { ok: false, error: '打开文字稿面板失败（页面结构可能已变化，请检查 youtube-selectors.ts）。' };
    }
  } else {
    panel = panelEl();
  }

  try {
    const lines = await collectSegments(panel!);
    if (!lines.length) return { ok: false, error: '该视频没有字幕/文字稿（文字稿面板为空）。' };
    if (currentVideoId() !== videoId) return { ok: false, error: '提取期间视频已切换，请重试。' };
    loadedForVideoId = videoId;
    const cleaned = cleanTranscript(lines);
    if (!cleaned) return { ok: false, error: '字幕清洗后为空。' };
    return {
      ok: true,
      transcript: { meta: readMeta(), text: cleaned, charCount: countChars(cleaned), source: 'dom' },
    };
  } finally {
    if (openedByUs) closePanel(panelEl());
  }
}
