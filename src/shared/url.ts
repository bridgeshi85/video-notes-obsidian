/** 页面 URL 识别（popup / sidepanel / storage 共用） */

export function isUdemyLearnUrl(url?: string): boolean {
  return !!url && /^https?:\/\/[^/]*udemy\.com\/course\/[^/]+\/learn\//.test(url);
}

export function youtubeVideoId(url?: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (!/(^|\.)youtube\.com$/.test(u.hostname) || u.pathname !== '/watch') return '';
    return u.searchParams.get('v') ?? '';
  } catch {
    return '';
  }
}

export function isYouTubeWatchUrl(url?: string): boolean {
  return !!youtubeVideoId(url);
}

export function isSupportedUrl(url?: string): boolean {
  return isUdemyLearnUrl(url) || isYouTubeWatchUrl(url);
}

/** 会话 key 用的规范化 URL：YouTube 只保留 v（忽略 t / list 等参数），其它去掉 query 与 hash */
export function normalizeVideoUrl(url: string): string {
  const id = youtubeVideoId(url);
  if (id) return `https://www.youtube.com/watch?v=${id}`;
  return url.split('?')[0].split('#')[0];
}

export const UNSUPPORTED_PAGE_HINT = '请在 Udemy 课程播放页或 YouTube 视频页使用';
