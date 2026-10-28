export interface ToolDefinition {
  id: string;
  name: string;
  detail: string;
  mark: string;
  available: boolean;
}

// Tool metadata lives in one registry so new tools can add a view and service later.
export const tools: ToolDefinition[] = [
  { id: 'pdf-image', name: 'PDF 转图片', detail: '文档处理', mark: '▤', available: true },
  { id: 'pdf-manage', name: 'PDF 处理', detail: '合并、拆分与压缩', mark: '▦', available: true },
  { id: 'id-photo', name: '证件照制作', detail: '图片处理', mark: '◉', available: true },
];
