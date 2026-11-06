/** Minimal text-item shape returned by PDF.js. */
export interface TextItemLike { str: string; hasEOL?: boolean }

/** Assembles one page's fragments into text, honoring explicit line breaks. */
export function assemblePageText(items: TextItemLike[]): string {
  let output = '';
  for (const item of items) {
    if (!item || typeof item.str !== 'string') continue;
    output += item.str;
    if (item.hasEOL) output += '\n';
  }
  return output.replace(/[ \t]+\n/g, '\n').trim();
}

/** Joins pages with a blank line and drops empty pages. */
export function joinPageTexts(pages: string[]): string {
  return pages.map((page) => page.trim()).filter((page) => page.length > 0).join('\n\n');
}

/** Returns the first characters of the text for the preview area. */
export function previewSnippet(text: string, limit = 4000): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n…（预览已截断）`;
}
