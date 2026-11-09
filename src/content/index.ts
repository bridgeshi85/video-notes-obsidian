import type { ContentRequest, ExtractResponse } from '../shared/messages';
import type { LectureMeta } from '../shared/types';
import { detectPlatform } from '../shared/url';

interface PlatformModule {
  isSupportedPage(): boolean;
  extract(): Promise<ExtractResponse>;
  readMeta(): LectureMeta;
}

async function getPlatform(): Promise<PlatformModule | null> {
  switch (detectPlatform(location.href)) {
    case 'udemy': return import('./udemy');
    case 'youtube': return import('./youtube');
    default: return null;
  }
}

chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
  if (msg.type === 'EXTRACT' || msg.type === 'GET_META') {
    getPlatform()
      .then(async (platform): Promise<ExtractResponse | { ok: true; meta: LectureMeta }> => {
        if (!platform || !platform.isSupportedPage()) {
          return { ok: false, error: '当前页面不是 Udemy 课程播放页或 YouTube 视频页。' };
        }
        return msg.type === 'EXTRACT' ? platform.extract() : { ok: true, meta: platform.readMeta() };
      })
      .then(sendResponse)
      .catch((e: unknown) => sendResponse({ ok: false, error: `提取失败：${(e as Error).message}` }));
    return true;
  }
  return false;
});
