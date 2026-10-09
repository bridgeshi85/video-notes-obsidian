import { describe, expect, it } from 'vitest';
import { estimateTokens, splitIntoChunks } from '../src/shared/chunk';

describe('estimateTokens', () => {
  it('中文按 1.5 字/token，英文按 4 字符/token', () => {
    expect(estimateTokens('中文中文中文')).toBe(4);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });
});

describe('splitIntoChunks', () => {
  it('未超阈值时不切分', () => {
    expect(splitIntoChunks('short text', 100)).toEqual(['short text']);
  });

  it('按段落边界切分且每块不超过阈值', () => {
    const para = 'Sentence one is here. Sentence two is here too.'; // ~12 tokens
    const text = Array(20).fill(para).join('\n\n');
    const chunks = splitIntoChunks(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(estimateTokens(c)).toBeLessThanOrEqual(50);
      expect(c.endsWith('.')).toBe(true);
    }
    expect(chunks.join('\n\n')).toBe(text);
  });

  it('超长段落按句子切分', () => {
    const text = Array(30).fill('这是一个用于测试分块的中文句子。').join('');
    const chunks = splitIntoChunks(text, 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(estimateTokens(c)).toBeLessThanOrEqual(40);
      expect(c.endsWith('。')).toBe(true);
    }
    expect(chunks.join('')).toBe(text);
  });

  it('单句超阈值时硬切', () => {
    const text = 'x'.repeat(1000);
    const chunks = splitIntoChunks(text, 50);
    expect(chunks.join('')).toBe(text);
    for (const c of chunks) expect(estimateTokens(c)).toBeLessThanOrEqual(50);
  });
});
