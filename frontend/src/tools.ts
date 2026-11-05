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
  { id: 'watermark', name: '图片去水印', detail: '本地涂选修复', mark: '▧', available: true },
  { id: 'qr-code', name: '网址二维码', detail: '输入网址生成 PNG', mark: '▦', available: true },
  { id: 'port-check', name: '端口占用', detail: '查询与结束占用进程 · Windows', mark: '⌗', available: true },
  { id: 'audio-denoise', name: '音频降噪', detail: 'DeepFilterNet3 · 前后试听', mark: '♫', available: true },
  { id: 'video-audio', name: '视频转音频', detail: '批量提取 WAV / MP3', mark: '▣', available: true },
];
