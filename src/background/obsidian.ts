import { buildMocContent, buildNotePaths, mocLink } from '../shared/note';
import type { LectureMeta, ObsidianConfig } from '../shared/types';

/** Obsidian Local REST API 客户端（https://github.com/coddingtonbear/obsidian-local-rest-api） */

function encodeVaultPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function connectionHint(restUrl: string): string {
  const hint = [
    '无法连接 Obsidian Local REST API。请确认：',
    '1) Obsidian 已打开，且已安装并启用 Local REST API 插件；',
  ];
  if (restUrl.startsWith('https')) {
    hint.push(
      `2) 自签证书未被信任：先在浏览器打开 ${restUrl} 并选择继续访问；`,
      '   或在插件设置中启用 "Non-encrypted (HTTP) Server"，并把地址改为 http://127.0.0.1:27123。',
    );
  }
  return hint.join('\n');
}

async function request(
  cfg: ObsidianConfig,
  apiKey: string,
  method: string,
  path: string,
  body?: string,
): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  if (body !== undefined) headers['Content-Type'] = 'text/markdown; charset=utf-8';
  try {
    return await fetch(`${cfg.restUrl.replace(/\/+$/, '')}${path}`, { method, headers, body });
  } catch {
    throw new Error(connectionHint(cfg.restUrl));
  }
}

async function ensureOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${action}失败：Obsidian API Key 无效（HTTP ${res.status}），请在设置页检查。`);
  }
  const text = await res.text().catch(() => '');
  throw new Error(`${action}失败（HTTP ${res.status}）：${text.slice(0, 200)}`);
}

async function readFile(cfg: ObsidianConfig, apiKey: string, path: string): Promise<string | null> {
  const res = await request(cfg, apiKey, 'GET', `/vault/${encodeVaultPath(path)}`);
  if (res.status === 404) return null;
  await ensureOk(res, '读取笔记');
  return res.text();
}

export async function noteExists(cfg: ObsidianConfig, apiKey: string, meta: LectureMeta): Promise<{ exists: boolean; path: string }> {
  const { notePath } = buildNotePaths(meta, cfg.baseFolder);
  return { exists: (await readFile(cfg, apiKey, notePath)) !== null, path: notePath };
}

/** 写入笔记（覆盖）并在课程 MOC 中追加链接（已存在则跳过） */
export async function saveToObsidian(cfg: ObsidianConfig, apiKey: string, meta: LectureMeta, note: string): Promise<string> {
  const paths = buildNotePaths(meta, cfg.baseFolder);

  const put = await request(cfg, apiKey, 'PUT', `/vault/${encodeVaultPath(paths.notePath)}`, note);
  await ensureOk(put, '写入笔记');

  const link = mocLink(paths);
  const moc = await readFile(cfg, apiKey, paths.mocPath);
  if (moc === null) {
    const res = await request(cfg, apiKey, 'PUT', `/vault/${encodeVaultPath(paths.mocPath)}`, `${buildMocContent(meta)}${link}\n`);
    await ensureOk(res, '创建课程 MOC');
  } else if (!moc.includes(`[[${paths.noteName}]]`)) {
    const prefix = moc.endsWith('\n') ? '' : '\n';
    const res = await request(cfg, apiKey, 'POST', `/vault/${encodeVaultPath(paths.mocPath)}`, `${prefix}${link}\n`);
    await ensureOk(res, '追加课程 MOC');
  }
  return paths.notePath;
}

export async function testObsidian(cfg: ObsidianConfig, apiKey: string): Promise<string> {
  const res = await request(cfg, apiKey, 'GET', '/');
  await ensureOk(res, '连接');
  const info = (await res.json().catch(() => ({}))) as { authenticated?: boolean; versions?: { obsidian?: string } };
  if (!info.authenticated) throw new Error('已连接，但 API Key 未通过认证。');
  return `连接成功（Obsidian ${info.versions?.obsidian ?? ''}）`;
}

/** 降级方案：通过 chrome.downloads 下载 .md 到默认下载目录 */
export async function downloadNote(meta: LectureMeta, note: string): Promise<string> {
  const paths = buildNotePaths(meta, 'VideoNotes/Udemy');
  const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(note)}`;
  await chrome.downloads.download({ url, filename: paths.notePath, conflictAction: 'overwrite', saveAs: false });
  return `下载目录/${paths.notePath}`;
}
