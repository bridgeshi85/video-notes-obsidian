import { cleanTranscript, countChars } from '../shared/clean';
import type { ContentRequest, ExtractResponse } from '../shared/messages';
import type { LectureMeta } from '../shared/types';
import { query, queryAll } from './selectors';

const WAIT_TIMEOUT_MS = 6000;
const SCROLL_SETTLE_MS = 150;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | null | undefined, timeout = WAIT_TIMEOUT_MS): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = fn();
    if (v) return v;
    await sleep(150);
  }
  return null;
}

function text(el: Element | null): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function isCoursePlayerPage(): boolean {
  return /^\/course\/[^/]+\/learn\//.test(location.pathname);
}

function readMeta(): LectureMeta {
  const slug = location.pathname.match(/^\/course\/([^/]+)/)?.[1] ?? '';
  const lectureId = location.pathname.match(/\/lecture\/(\d+)/)?.[1] ?? '';

  const course = text(query('courseTitle')) || document.title.replace(/\s*\|\s*Udemy\s*$/i, '').trim() || slug;

  // 节标题一般形如 "12. Intro to X"，序号从标题前缀解析
  const rawLecture = text(query('currentLectureTitle'));
  const numbered = rawLecture.match(/^(\d+)\.\s*(.+)$/);
  const lecture = numbered ? numbered[2] : rawLecture || `Lecture ${lectureId}`;
  const index = numbered ? numbered[1].padStart(3, '0') : '';

  const video = query<HTMLVideoElement>('video');

  return {
    course,
    courseSlug: slug,
    lecture,
    index,
    instructor: text(query('instructor')),
    url: location.origin + location.pathname,
    duration: formatDuration(video?.duration ?? NaN),
  };
}

function findScrollContainer(from: HTMLElement): HTMLElement {
  let el: HTMLElement | null = from;
  while (el && el !== document.body) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return from;
}

function cueText(cue: HTMLElement): string {
  return text(query('cueText', cue)) || text(cue);
}

/**
 * 读取 Transcript 面板全部字幕句。
 * 面板可能是虚拟滚动（只渲染可视区域）：逐屏滚动，以 (offsetTop, 文本) 去重后按位置排序。
 */
async function collectCues(panel: HTMLElement): Promise<string[]> {
  const firstCue = queryAll('transcriptCue', panel)[0];
  if (!firstCue) return [];
  const scroller = findScrollContainer(firstCue.parentElement ?? panel);
  const originalTop = scroller.scrollTop;

  const seen = new Map<string, { top: number; text: string }>();
  const collect = () => {
    for (const cue of queryAll('transcriptCue', panel)) {
      const t = cueText(cue);
      if (!t) continue;
      const top = cue.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      seen.set(`${Math.round(top)}|${t}`, { top, text: t });
    }
  };

  if (scroller.scrollHeight <= scroller.clientHeight + 5) {
    collect();
  } else {
    scroller.scrollTop = 0;
    await sleep(SCROLL_SETTLE_MS);
    const step = Math.max(50, scroller.clientHeight * 0.8);
    for (let guard = 0; guard < 2000; guard++) {
      collect();
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) break;
      scroller.scrollTop += step;
      await sleep(SCROLL_SETTLE_MS);
    }
    collect();
    scroller.scrollTop = originalTop;
  }

  return [...seen.values()].sort((a, b) => a.top - b.top).map((c) => c.text);
}

async function extract(): Promise<ExtractResponse> {
  if (!isCoursePlayerPage()) {
    return { ok: false, error: '当前页面不是 Udemy 课程播放页。' };
  }

  let panel = query('transcriptPanel');
  let openedByUs = false;
  if (!panel) {
    const toggle = await waitFor(() => query<HTMLElement>('transcriptToggle'), 3000);
    if (!toggle) {
      return { ok: false, error: '该节课程无字幕（未找到 Transcript 按钮）。也可以手动下载 .vtt 拖入插件。' };
    }
    toggle.click();
    openedByUs = true;
    panel = await waitFor(() => query<HTMLElement>('transcriptPanel'));
    if (!panel) {
      return { ok: false, error: '打开 Transcript 面板失败（页面结构可能已变化，请检查 selectors.ts）。' };
    }
  }

  try {
    const hasCues = await waitFor(() => queryAll('transcriptCue', panel!).length > 0 || null);
    if (!hasCues) {
      return { ok: false, error: '该节课程无字幕（Transcript 面板为空）。' };
    }
    const cues = await collectCues(panel);
    const cleaned = cleanTranscript(cues);
    if (!cleaned) return { ok: false, error: '字幕清洗后为空。' };
    return {
      ok: true,
      transcript: { meta: readMeta(), text: cleaned, charCount: countChars(cleaned), source: 'dom' },
    };
  } finally {
    if (openedByUs) query('transcriptToggle')?.click();
  }
}

chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
  if (msg.type === 'EXTRACT') {
    extract()
      .then(sendResponse)
      .catch((e: unknown) => sendResponse({ ok: false, error: `提取失败：${(e as Error).message}` }));
    return true;
  }
  if (msg.type === 'GET_META') {
    sendResponse(isCoursePlayerPage() ? { ok: true, meta: readMeta() } : { ok: false, error: '非课程播放页' });
  }
  return false;
});
