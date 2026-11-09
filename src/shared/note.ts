import type { LectureMeta } from './types';

/** 去除文件名非法字符（含 Obsidian 链接中会出问题的 #^[]|） */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim();
  return (cleaned || 'untitled').slice(0, 120).trim();
}

export interface NotePaths {
  folder: string;
  noteName: string;
  notePath: string;
  mocName: string;
  mocPath: string;
  /** false 时不创建/追加 MOC，笔记也不含 MOC 链接（YouTube） */
  hasMoc: boolean;
}

export function isYouTube(meta: LectureMeta): boolean {
  return meta.platform === 'youtube';
}

/** YouTube 笔记目录：baseFolder 的上级目录 + /YouTube（默认 素材库/VideoNotes/YouTube），平铺不分频道 */
function youtubeFolder(baseFolder: string): string {
  const base = baseFolder.replace(/^\/+|\/+$/g, '');
  const idx = base.lastIndexOf('/');
  return idx > 0 ? `${base.slice(0, idx)}/YouTube` : 'YouTube';
}

export function buildNotePaths(meta: LectureMeta, baseFolder: string, suffix = ''): NotePaths {
  if (isYouTube(meta)) {
    const folder = youtubeFolder(baseFolder);
    const title = sanitizeFileName(meta.lecture);
    const id = (meta.videoId ?? '').slice(0, 6);
    const noteName = `${id ? `${title}-${id}` : title}${suffix}`;
    return { folder, noteName, notePath: `${folder}/${noteName}.md`, mocName: '', mocPath: '', hasMoc: false };
  }
  const base = baseFolder.replace(/^\/+|\/+$/g, '');
  const course = sanitizeFileName(meta.course);
  const folder = base ? `${base}/${course}` : course;
  const lecture = sanitizeFileName(meta.lecture);
  const baseName = meta.index ? `${meta.index}-${lecture}` : lecture;
  const noteName = `${baseName}${suffix}`;
  const mocName = `${course} MOC`;
  return {
    folder,
    noteName,
    notePath: `${folder}/${noteName}.md`,
    mocName,
    mocPath: `${folder}/${mocName}.md`,
    hasMoc: true,
  };
}

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function toTag(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_/-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 去掉 LLM 输出外层的 ```markdown 围栏与多余的一级标题 */
export function normalizeLlmBody(body: string): string {
  let text = body.trim();
  const fenced = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  if (fenced) text = fenced[1].trim();
  return text.replace(/^#\s+.*\n+/, '').trim();
}

function buildFrontmatter(meta: LectureMeta, type: string, extraTags: string[], date: Date): string {
  const yt = isYouTube(meta);
  const tags = [yt ? 'youtube' : 'udemy', ...extraTags, toTag(meta.courseSlug)].filter(Boolean);
  const lines = yt
    ? [
        `channel: ${yamlString(meta.course)}`,
        `title: ${yamlString(meta.lecture)}`,
        ...(meta.videoId ? [`video_id: ${yamlString(meta.videoId)}`] : []),
      ]
    : [`course: ${yamlString(meta.course)}`, `lecture: ${yamlString(meta.lecture)}`, `instructor: ${yamlString(meta.instructor)}`];
  return [
    '---',
    `date: ${formatDate(date)}`,
    ...lines,
    `source: ${yamlString(meta.url)}`,
    `duration: ${yamlString(meta.duration)}`,
    `tags: [${tags.join(', ')}]`,
    `type: ${type}`,
    '---',
  ].join('\n');
}

function heading(meta: LectureMeta): string {
  return isYouTube(meta) ? `# ${meta.lecture}` : `# ${meta.course} — ${meta.lecture}`;
}

function contextSection(meta: LectureMeta, paths: NotePaths): string {
  if (paths.hasMoc) return `\n## 🔗 上下文\n课程：[[${paths.mocName}]]\n`;
  if (isYouTube(meta)) return `\n## 🔗 上下文\n频道：${meta.course}\n视频：${meta.url}\n`;
  return '';
}

export function buildNote(meta: LectureMeta, body: string, transcript: string, paths: NotePaths, date = new Date()): string {
  const label = isYouTube(meta) ? '视频' : '课程';
  return `${buildFrontmatter(meta, 'video-note', [], date)}

${heading(meta)}

${normalizeLlmBody(body)}

## 📜 原始字幕（清洗后）

<details>
<summary>展开${label}字幕</summary>

${transcript}

</details>
${contextSection(meta, paths)}`;
}

export function buildTranscriptNote(meta: LectureMeta, transcript: string, paths: NotePaths, date = new Date()): string {
  const label = isYouTube(meta) ? '视频' : '课程';
  return `${buildFrontmatter(meta, 'video-transcript', ['transcript'], date)}

${heading(meta)}

## 📜 ${label}字幕

${transcript}
${contextSection(meta, paths)}`;
}

export function buildMocContent(meta: LectureMeta): string {
  const tags = ['udemy', 'moc', toTag(meta.courseSlug)].filter(Boolean);
  return `---
course: ${yamlString(meta.course)}
instructor: ${yamlString(meta.instructor)}
tags: [${tags.join(', ')}]
type: video-moc
---

# ${meta.course} MOC

## 📚 课程笔记
`;
}

export function mocLink(paths: NotePaths): string {
  return `- [[${paths.noteName}]]`;
}
