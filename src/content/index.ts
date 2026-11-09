import type { ContentRequest, ExtractResponse } from '../shared/messages';
import type { LectureMeta } from '../shared/types';
import * as udemy from './udemy';
import * as youtube from './youtube';

interface PlatformModule {
  isSupportedPage(): boolean;
  extract(): Promise<ExtractResponse>;
  readMeta(): LectureMeta;
}

const platform: PlatformModule = /(^|\.)youtube\.com$/.test(location.hostname) ? youtube : udemy;

chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
  if (msg.type === 'EXTRACT') {
    platform
      .extract()
      .then(sendResponse)
      .catch((e: unknown) => sendResponse({ ok: false, error: `提取失败：${(e as Error).message}` }));
    return true;
  }
  if (msg.type === 'GET_META') {
    sendResponse(platform.isSupportedPage() ? { ok: true, meta: platform.readMeta() } : { ok: false, error: '非视频播放页' });
  }
  return false;
});
