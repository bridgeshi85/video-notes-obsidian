import { describe, expect, it } from 'vitest';
import { cleanLine, cleanTranscript, countChars, dedupeAdjacent, mergeParagraphs } from '../src/shared/clean';

describe('cleanLine', () => {
  it('去除标签、行首时间戳、噪声标记与实体', () => {
    expect(cleanLine('00:01:02.500 <c>Hello</c> &amp; welcome [Music]')).toBe('Hello & welcome');
    expect(cleanLine('[Applause]')).toBe('');
    expect(cleanLine('（音乐）大家好')).toBe('大家好');
    expect(cleanLine('♪ ♪')).toBe('');
  });

  it('保留正文中的时间表达', () => {
    expect(cleanLine('Set the ratio to 16:9 here')).toBe('Set the ratio to 16:9 here');
  });
});

describe('dedupeAdjacent', () => {
  it('去掉相邻重复行', () => {
    expect(dedupeAdjacent(['a', 'a', 'b', 'a'])).toEqual(['a', 'b', 'a']);
  });

  it('处理自动字幕滚动重叠', () => {
    expect(dedupeAdjacent(['so today we will', 'so today we will learn docker', 'will learn docker'])).toEqual([
      'so today we will learn docker',
    ]);
    // 短行不做后缀去重，避免误删 "yes." 之类的独立短句
    expect(dedupeAdjacent(['I said yes.', 'yes.'])).toEqual(['I said yes.', 'yes.']);
  });
});

describe('mergeParagraphs', () => {
  it('英文碎行用空格拼接，中文直接拼接', () => {
    expect(mergeParagraphs(['Hello', 'world.'])).toEqual(['Hello world.']);
    expect(mergeParagraphs(['大家好', '今天讲容器。'])).toEqual(['大家好今天讲容器。']);
  });

  it('达到长度且句末时断段', () => {
    const sentence = 'This is a reasonably long sentence about containers and images.';
    const paragraphs = mergeParagraphs(Array(12).fill(sentence));
    expect(paragraphs.length).toBeGreaterThan(1);
    for (const p of paragraphs) expect(p.endsWith('.')).toBe(true);
  });
});

describe('cleanTranscript', () => {
  it('完整流程输出段落文本', () => {
    const text = cleanTranscript(['[Music]', 'Hello', 'Hello', 'everyone.', '']);
    expect(text).toBe('Hello everyone.');
    expect(countChars(text)).toBe(14);
  });
});
