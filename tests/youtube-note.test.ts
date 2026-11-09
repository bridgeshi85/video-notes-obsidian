import { describe, expect, it } from 'vitest';
import { describeSource } from '../src/shared/config';
import { buildNote, buildNotePaths, buildTranscriptNote } from '../src/shared/note';
import type { LectureMeta } from '../src/shared/types';
import { isSupportedUrl, normalizeVideoUrl, youtubeVideoId } from '../src/shared/url';

const meta: LectureMeta = {
  platform: 'youtube',
  videoId: 'dQw4w9WgXcQ',
  course: 'Fireship',
  courseSlug: 'Fireship',
  lecture: 'Docker in 100 Seconds: why?',
  index: '',
  instructor: 'Fireship',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  duration: '2:07',
};

describe('YouTube note paths', () => {
  it('平铺到 baseFolder 同级的 YouTube 目录，文件名带视频 ID 前缀', () => {
    const p = buildNotePaths(meta, '素材库/VideoNotes/Udemy');
    expect(p.notePath).toBe('素材库/VideoNotes/YouTube/Docker in 100 Seconds why-dQw4w9.md');
    expect(p.hasMoc).toBe(false);
  });

  it('baseFolder 无上级时用 YouTube', () => {
    expect(buildNotePaths(meta, 'Udemy').folder).toBe('YouTube');
  });

  it('支持后缀', () => {
    expect(buildNotePaths(meta, 'A/B', '-transcript').noteName).toBe('Docker in 100 Seconds why-dQw4w9-transcript');
  });
});

describe('YouTube notes', () => {
  it('frontmatter 与无 MOC 链接', () => {
    const paths = buildNotePaths(meta, 'VN/Udemy');
    const note = buildNote(meta, '## 📝 核心总结\n总结', 'Text.', paths, new Date(2026, 10, 9));
    expect(note).toContain('channel: "Fireship"');
    expect(note).toContain('video_id: "dQw4w9WgXcQ"');
    expect(note).toContain('tags: [youtube, fireship]');
    expect(note).toContain('# Docker in 100 Seconds: why?\n');
    expect(note).not.toContain('MOC');
    expect(note).not.toContain('course:');
    expect(note).toContain('视频：https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('纯字幕笔记', () => {
    const paths = buildNotePaths(meta, 'VN/Udemy', '-transcript');
    const note = buildTranscriptNote(meta, 'Line.', paths, new Date(2026, 10, 9));
    expect(note).toContain('tags: [youtube, transcript, fireship]');
    expect(note).toContain('## 📜 视频字幕\n\nLine.');
    expect(note).not.toContain('MOC');
  });

  it('prompt source 描述', () => {
    expect(describeSource(meta)).toBe('YouTube 频道「Fireship」的视频「Docker in 100 Seconds: why?」');
    expect(describeSource({ course: 'C', lecture: 'L' })).toBe('视频课程《C》中「L」一节');
  });
});

describe('url helpers', () => {
  it('识别支持的页面', () => {
    expect(isSupportedUrl('https://www.youtube.com/watch?v=abc&t=10s')).toBe(true);
    expect(isSupportedUrl('https://www.youtube.com/')).toBe(false);
    expect(isSupportedUrl('https://www.youtube.com/shorts/abc')).toBe(false);
    expect(isSupportedUrl('https://www.udemy.com/course/x/learn/lecture/1')).toBe(true);
    expect(isSupportedUrl(undefined)).toBe(false);
  });

  it('规范化会话 URL', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=abc&list=PL1')).toBe('abc');
    expect(normalizeVideoUrl('https://www.youtube.com/watch?list=PL&v=abc&t=5')).toBe('https://www.youtube.com/watch?v=abc');
    expect(normalizeVideoUrl('https://www.udemy.com/course/x/learn/lecture/1?start=0#notes')).toBe('https://www.udemy.com/course/x/learn/lecture/1');
  });
});
