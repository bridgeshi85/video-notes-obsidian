import { describe, expect, it } from 'vitest';
import { cleanTranscript } from '../src/shared/clean';
import { parseSubtitleLines } from '../src/shared/vtt';

const VTT = `﻿WEBVTT
Kind: captions

NOTE this is a comment

STYLE
::cue { color: red }

1
00:00:00.000 --> 00:00:02.000
<v Speaker>Welcome to the course.

00:00:02.000 --> 00:00:04.000 align:start
Welcome to the course.

00:00:04.000 --> 00:00:06.000
<00:00:04.100><c>In this lecture</c> we cover
Docker basics.
`;

const SRT = `1\r\n00:00:00,000 --> 00:00:02,000\r\n大家好\r\n\r\n2\r\n00:00:02,000 --> 00:00:04,000\r\n今天讲 Docker。\r\n`;

describe('parseSubtitleLines', () => {
  it('解析 VTT：跳过头部/NOTE/STYLE/编号/时间轴', () => {
    expect(parseSubtitleLines(VTT)).toEqual([
      '<v Speaker>Welcome to the course.',
      'Welcome to the course.',
      '<00:00:04.100><c>In this lecture</c> we cover',
      'Docker basics.',
    ]);
  });

  it('VTT 清洗后去重合并', () => {
    expect(cleanTranscript(parseSubtitleLines(VTT))).toBe('Welcome to the course. In this lecture we cover Docker basics.');
  });

  it('解析 SRT（CRLF）', () => {
    expect(cleanTranscript(parseSubtitleLines(SRT))).toBe('大家好今天讲 Docker。');
  });
});
