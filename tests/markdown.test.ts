// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/shared/markdown';

function render(text: string) {
  const container = document.createElement('div');
  container.innerHTML = renderMarkdown(text);
  return container;
}

describe('Markdown rendering', () => {
  it('renders headings, emphasis, lists, quotes and line breaks', () => {
    const result = render('# Title\n\n**bold** and *italic*\nnext line\n\n- first\n- second\n\n> quote');
    expect(result.querySelector('h1')?.textContent).toBe('Title');
    expect(result.querySelector('strong')?.textContent).toBe('bold');
    expect(result.querySelector('em')?.textContent).toBe('italic');
    expect(result.querySelectorAll('li')).toHaveLength(2);
    expect(result.querySelector('blockquote')?.textContent).toContain('quote');
    expect(result.querySelector('br')).not.toBeNull();
  });

  it('renders fenced code literally without executing HTML', () => {
    const result = render('```html\n<script>alert(1)</script>\n```\n\nUse `npm test`.');
    expect(result.querySelector('pre code')?.textContent).toBe('<script>alert(1)</script>\n');
    expect(result.querySelector('p code')?.textContent).toBe('npm test');
    expect(result.querySelector('script')).toBeNull();
  });

  it('renders GFM tables and safe links', () => {
    const result = render('| Name | Value |\n| --- | --- |\n| A | B |\n\n[Docs](https://example.com "Documentation")');
    expect(result.querySelectorAll('th')).toHaveLength(2);
    expect(result.querySelectorAll('td')).toHaveLength(2);
    expect(result.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
  });

  it('removes scripts, event handlers, unsafe URLs and remote images', () => {
    const result = render([
      '<script>alert(1)</script>',
      '<p onclick="alert(1)" style="color:red">Text</p>',
      '<iframe src="https://example.com"></iframe>',
      '<a href="javascript:alert(1)">unsafe</a>',
      '[unsafe](javascript:alert%281%29)',
      '<img src="https://example.com/tracking" onerror="alert(1)">',
      '![tracking](https://example.com/tracking)',
    ].join('\n\n'));
    expect(result.querySelector('script, iframe, img, [onclick], [onerror], [style]')).toBeNull();
    expect([...result.querySelectorAll('a')].every((link) => !link.hasAttribute('href'))).toBe(true);
  });
});
