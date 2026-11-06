import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, groupToolsByCategory, tools, type ToolDefinition } from './tools';

describe('tool registry categories', () => {
  it('groups every registered tool under its category', () => {
    const groups = groupToolsByCategory(tools);
    const grouped = groups.flatMap((group) => group.tools);
    expect(grouped).toHaveLength(tools.length);
    for (const tool of tools) {
      expect(grouped).toContain(tool);
    }
  });

  it('lists categories in sidebar order without empty groups', () => {
    const groups = groupToolsByCategory(tools);
    expect(groups.map((group) => group.id)).toEqual(['pdf', 'image', 'media', 'utility']);
    for (const group of groups) {
      expect(group.tools.length).toBeGreaterThan(0);
      expect(group.label).toBe(CATEGORY_LABELS[group.id]);
    }
  });

  it('skips unknown categories and empty groups', () => {
    const stray: ToolDefinition = { id: 'stray', name: '游离工具', detail: '未知分类', mark: 'x', category: 'unknown', available: true };
    expect(groupToolsByCategory([stray])).toEqual([]);
    expect(groupToolsByCategory([])).toEqual([]);
  });

  it('keeps registry order inside one category', () => {
    const groups = groupToolsByCategory(tools);
    const media = groups.find((group) => group.id === 'media');
    expect(media?.tools.map((tool) => tool.id)).toEqual([
      'video-compress', 'video-trim', 'video-gif', 'video-frame', 'video-convert',
      'video-merge', 'video-info', 'video-speed', 'audio-trim', 'volume-normalize',
      'video-audio', 'audio-denoise',
    ]);
    const pdf = groups.find((group) => group.id === 'pdf');
    expect(pdf?.tools.map((tool) => tool.id)).toEqual(['pdf-image', 'pdf-manage', 'pdf-page', 'pdf-watermark', 'pdf-crypto', 'pdf-text', 'image-pdf']);
    const image = groups.find((group) => group.id === 'image');
    expect(image?.tools.map((tool) => tool.id)).toEqual(['id-photo', 'cutout', 'watermark', 'image-stamp', 'image-stitch', 'image-convert']);
  });

  it('gives every tool a name, mark, and detail', () => {
    for (const tool of tools) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.mark.length).toBeGreaterThan(0);
      expect(tool.detail.length).toBeGreaterThan(0);
    }
  });
});
