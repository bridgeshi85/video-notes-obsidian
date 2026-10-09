/** token 粗估与按段落边界分块 */

const CJK_GLOBAL = /[぀-ヿ㐀-鿿가-힯＀-￯]/g;

/** 中文≈1.5 字符/token，其余≈4 字符/token */
export function estimateTokens(text: string): number {
  const cjk = text.match(CJK_GLOBAL)?.length ?? 0;
  const other = text.length - cjk;
  return Math.ceil(cjk / 1.5 + other / 4);
}

function splitSentences(paragraph: string): string[] {
  return paragraph.match(/[^.!?。！？…]+(?:[.!?。！？…]+["'”’)）]?\s*|$)/g)?.filter((s) => s.trim()) ?? [paragraph];
}

/** 万不得已时按字符硬切（单句超过阈值） */
function hardSplit(text: string, maxTokens: number): string[] {
  const ratio = text.length / Math.max(1, estimateTokens(text));
  const size = Math.max(1, Math.floor(maxTokens * ratio));
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}

/** 把文本切成不超过 maxTokens 的块，优先在段落边界、其次在句子边界切 */
export function splitIntoChunks(text: string, maxTokens: number): string[] {
  if (estimateTokens(text) <= maxTokens) return [text];

  const units: { text: string; sep: string }[] = [];
  for (const para of text.split(/\n\s*\n/).filter((p) => p.trim())) {
    if (estimateTokens(para) <= maxTokens) {
      units.push({ text: para, sep: '\n\n' });
      continue;
    }
    for (const sentence of splitSentences(para)) {
      const pieces = estimateTokens(sentence) <= maxTokens ? [sentence] : hardSplit(sentence, maxTokens);
      for (const piece of pieces) units.push({ text: piece, sep: '' });
    }
  }

  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    const candidate = current ? current + unit.sep + unit.text : unit.text;
    if (current && estimateTokens(candidate) > maxTokens) {
      chunks.push(current.trim());
      current = unit.text;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
