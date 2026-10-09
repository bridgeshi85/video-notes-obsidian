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
}

export function buildNotePaths(meta: LectureMeta, baseFolder: string): NotePaths {
  const base = baseFolder.replace(/^\/+|\/+$/g, '');
  const course = sanitizeFileName(meta.course);
  const folder = base ? `${base}/${course}` : course;
  const lecture = sanitizeFileName(meta.lecture);
  const noteName = meta.index ? `${meta.index}-${lecture}` : lecture;
  const mocName = `${course} MOC`;
  return {
    folder,
    noteName,
    notePath: `${folder}/${noteName}.md`,
    mocName,
    mocPath: `${folder}/${mocName}.md`,
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

export function buildNote(meta: LectureMeta, body: string, paths: NotePaths, date = new Date()): string {
  const tags = ['udemy', toTag(meta.courseSlug)].filter(Boolean);
  const frontmatter = [
    '---',
    `date: ${formatDate(date)}`,
    `course: ${yamlString(meta.course)}`,
    `lecture: ${yamlString(meta.lecture)}`,
    `instructor: ${yamlString(meta.instructor)}`,
    `source: ${yamlString(meta.url)}`,
    `duration: ${yamlString(meta.duration)}`,
    `tags: [${tags.join(', ')}]`,
    'type: video-note',
    '---',
  ].join('\n');

  return `${frontmatter}

# ${meta.course} — ${meta.lecture}

${normalizeLlmBody(body)}

## 🔗 上下文
课程：[[${paths.mocName}]]
`;
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
