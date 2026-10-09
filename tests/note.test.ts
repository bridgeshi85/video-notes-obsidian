import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/shared/config';
import { buildMocContent, buildNote, buildNotePaths, mocLink, normalizeLlmBody, sanitizeFileName } from '../src/shared/note';
import type { LectureMeta } from '../src/shared/types';

const meta: LectureMeta = {
  course: 'Docker & K8s: The "Complete" Guide',
  courseSlug: 'docker-and-kubernetes',
  lecture: 'Why use Docker?',
  index: '003',
  instructor: 'Stephen Grider',
  url: 'https://www.udemy.com/course/docker-and-kubernetes/learn/lecture/123',
  duration: '5:42',
};

describe('sanitizeFileName', () => {
  it('去除非法字符', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j#k^l[m]')).toBe('a b c d e f g h i j k l m');
    expect(sanitizeFileName('...')).toBe('untitled');
  });
});

describe('buildNotePaths', () => {
  it('按设计文档规则生成路径', () => {
    const p = buildNotePaths(meta, '/素材库/VideoNotes/Udemy/');
    expect(p.notePath).toBe('素材库/VideoNotes/Udemy/Docker & K8s The Complete Guide/003-Why use Docker.md');
    expect(p.mocPath).toBe('素材库/VideoNotes/Udemy/Docker & K8s The Complete Guide/Docker & K8s The Complete Guide MOC.md');
    expect(mocLink(p)).toBe('- [[003-Why use Docker]]');
  });

  it('无序号时只用标题', () => {
    expect(buildNotePaths({ ...meta, index: '' }, 'X').noteName).toBe('Why use Docker');
  });
});

describe('normalizeLlmBody', () => {
  it('去掉外层代码围栏与一级标题', () => {
    expect(normalizeLlmBody('```markdown\n# Title\n\n## 📝 核心总结\n内容\n```')).toBe('## 📝 核心总结\n内容');
  });
});

describe('buildNote', () => {
  it('生成 frontmatter + 正文 + MOC 链接', () => {
    const paths = buildNotePaths(meta, 'VN');
    const note = buildNote(meta, '## 📝 核心总结\n总结', paths, new Date(2026, 9, 8));
    expect(note).toContain('date: 2026-10-08');
    expect(note).toContain('course: "Docker & K8s: The \\"Complete\\" Guide"');
    expect(note).toContain('tags: [udemy, docker-and-kubernetes]');
    expect(note).toContain('type: video-note');
    expect(note).toContain('# Docker & K8s: The "Complete" Guide — Why use Docker?');
    expect(note).toContain('## 📝 核心总结\n总结');
    expect(note.trimEnd().endsWith('课程：[[Docker & K8s The Complete Guide MOC]]')).toBe(true);
  });

  it('MOC 模板', () => {
    expect(buildMocContent(meta)).toContain('# Docker & K8s: The "Complete" Guide MOC');
  });
});

describe('renderTemplate', () => {
  it('替换已知变量，保留未知变量', () => {
    expect(renderTemplate('{{a}}-{{b}}-{{c}}', { a: 1, b: 'x' })).toBe('1-x-{{c}}');
  });
});
