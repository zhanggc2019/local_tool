import { describe, expect, it } from 'vitest';
import { assemblePageText, joinPageTexts, previewSnippet } from './text';

describe('PDF text extraction helpers', () => {
  it('joins fragments and honors explicit line breaks', () => {
    const text = assemblePageText([
      { str: 'Hello' },
      { str: ' world' },
      { str: '', hasEOL: true },
      { str: 'Second line' },
    ]);
    expect(text).toBe('Hello world\nSecond line');
  });

  it('trims trailing spaces before newlines', () => {
    expect(assemblePageText([{ str: 'text   ', hasEOL: true }, { str: 'next' }])).toBe('text\nnext');
  });

  it('skips malformed items', () => {
    expect(assemblePageText([{ str: 'ok' }, {} as { str: string }])).toBe('ok');
  });

  it('joins pages with blank lines and drops empty pages', () => {
    expect(joinPageTexts(['  page one  ', '', 'page two'])).toBe('page one\n\npage two');
    expect(joinPageTexts(['', '   '])).toBe('');
  });

  it('truncates long previews with a marker', () => {
    expect(previewSnippet('short')).toBe('short');
    const long = 'x'.repeat(50);
    const preview = previewSnippet(long, 10);
    expect(preview.startsWith('x'.repeat(10))).toBe(true);
    expect(preview).toContain('已截断');
  });
});
