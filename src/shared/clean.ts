/** 字幕清洗（DOM 提取与 .vtt 解析共用） */

const TAGS = /<[^>]*>/g;
const LEADING_TIMESTAMP = /^\s*\[?\(?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\)?\]?\s*/;
const NOISE =
  /[[(（【]\s*(?:music|applause|laughter|laughs|laughing|silence|inaudible|noise|background noise|音乐|掌声|笑声|笑|静音|噪音)\s*[\])）】]/gi;
const MUSIC_SYMBOLS = /[♪♫]+/g;
const SENTENCE_END = /[.!?。！？…]["'”’)）]?$/;
const CJK = /[぀-ヿ㐀-鿿가-힯＀-￯]/;

const PARAGRAPH_MIN_CHARS = 300;
const PARAGRAPH_MAX_CHARS = 1200;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&lrm;': '',
  '&rlm;': '',
};

function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp|lrm|rlm);/g, (m) => ENTITIES[m] ?? m);
}

/** 清洗单行：去标签/时间戳/噪声标记，压缩空白 */
export function cleanLine(line: string): string {
  return decodeEntities(line.replace(TAGS, ''))
    .replace(LEADING_TIMESTAMP, '')
    .replace(NOISE, '')
    .replace(MUSIC_SYMBOLS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 相邻重复去重；兼容自动字幕的"滚动"重叠（后一行包含前一行） */
export function dedupeAdjacent(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev === undefined) {
      out.push(line);
    } else if (line === prev) {
      continue;
    } else if (line.startsWith(prev) && prev.length >= 10) {
      out[out.length - 1] = line;
    } else if (prev.endsWith(line) && line.length >= 10) {
      continue;
    } else {
      out.push(line);
    }
  }
  return out;
}

function joinFragments(a: string, b: string): string {
  if (!a) return b;
  const needsSpace = !(CJK.test(a[a.length - 1]) || CJK.test(b[0]));
  return needsSpace ? `${a} ${b}` : a + b;
}

/** 把碎行合并为段落：达到最小长度且以句末标点结尾时断段 */
export function mergeParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let current = '';
  for (const line of lines) {
    current = joinFragments(current, line);
    const atSentenceEnd = SENTENCE_END.test(current);
    if ((current.length >= PARAGRAPH_MIN_CHARS && atSentenceEnd) || current.length >= PARAGRAPH_MAX_CHARS) {
      paragraphs.push(current);
      current = '';
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

/** 完整清洗流程：原始字幕行 → 段落以空行分隔的纯文本 */
export function cleanTranscript(rawLines: string[]): string {
  const lines = rawLines.map(cleanLine).filter(Boolean);
  return mergeParagraphs(dedupeAdjacent(lines)).join('\n\n');
}

/** 字数统计（不计空白） */
export function countChars(text: string): number {
  return text.replace(/\s/g, '').length;
}
