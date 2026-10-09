/** .vtt / .srt 字幕解析：只保留字幕文本行，交给 cleanTranscript 继续清洗 */

const HEADER_BLOCK = /^(WEBVTT|NOTE|STYLE|REGION)\b/;

export function parseSubtitleLines(raw: string): string[] {
  const blocks = raw
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/);

  const lines: string[] = [];
  for (const block of blocks) {
    const blockLines = block.split('\n');
    if (HEADER_BLOCK.test(blockLines[0].trim())) continue;
    const tsIndex = blockLines.findIndex((l) => l.includes('-->'));
    if (tsIndex === -1) continue;
    for (const l of blockLines.slice(tsIndex + 1)) {
      if (l.trim()) lines.push(l);
    }
  }
  return lines;
}
