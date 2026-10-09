/**
 * Udemy DOM 选择器集中管理。
 * 每项是候选列表，按顺序尝试；Udemy 改版时只需改这里。
 */
export const SELECTORS = {
  transcriptToggle: [
    'button[data-purpose="transcript-toggle"]',
    'button[aria-label*="Transcript" i]',
    'button[aria-label*="字幕记录"]',
  ],
  transcriptPanel: [
    '[data-purpose="transcript-panel"]',
    '[class*="transcript--transcript-panel"]',
    '[class*="transcript-panel"]',
  ],
  transcriptCue: [
    '[data-purpose="transcript-cue"], [data-purpose="transcript-cue-active"]',
    '[class*="transcript--cue-container"]',
  ],
  cueText: ['[data-purpose="cue-text"]', '[class*="transcript--underline-cue"]'],
  courseTitle: [
    '[data-purpose="course-header-title"]',
    'header a[href*="/course/"]',
    'h1[data-purpose="lead-title"]',
  ],
  currentLectureTitle: [
    'li[aria-current="true"] [data-purpose="item-title"]',
    '[data-purpose="curriculum-item-viewer-title"]',
    '[class*="curriculum-item-link--is-current"] [data-purpose="item-title"]',
  ],
  instructor: [
    '[data-purpose="instructor-name-top"] a',
    '[data-purpose="instructor-name-top"]',
    'a[href*="/user/"] [class*="instructor"]',
    '[class*="instructor--instructor__title"] a',
  ],
  video: ['video'],
} as const;

export type SelectorKey = keyof typeof SELECTORS;

export function query<T extends Element = HTMLElement>(key: SelectorKey, root: ParentNode = document): T | null {
  for (const sel of SELECTORS[key]) {
    const el = root.querySelector<T>(sel);
    if (el) return el;
  }
  return null;
}

export function queryAll<T extends Element = HTMLElement>(key: SelectorKey, root: ParentNode = document): T[] {
  for (const sel of SELECTORS[key]) {
    const els = root.querySelectorAll<T>(sel);
    if (els.length) return Array.from(els);
  }
  return [];
}
