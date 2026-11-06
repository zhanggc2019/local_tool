export interface ToolDefinition {
  id: string;
  name: string;
  detail: string;
  mark: string;
  category: string;
  available: boolean;
}

export interface ToolCategory {
  id: string;
  label: string;
  tools: ToolDefinition[];
}

// Category order used by the sidebar; tools keep their registry order inside one category.
export const CATEGORY_ORDER = ['pdf', 'image', 'media', 'utility'] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  pdf: 'PDF 工具',
  image: '图片工具',
  media: '音视频工具',
  utility: '实用工具',
};

// Tool metadata lives in one registry so new tools can add a view and service later.
export const tools: ToolDefinition[] = [
  { id: 'pdf-image', name: 'PDF 转图片', detail: '长图合成与分页导出', mark: '▤', category: 'pdf', available: true },
  { id: 'pdf-manage', name: 'PDF 处理', detail: '合并、拆分与压缩', mark: '▦', category: 'pdf', available: true },
  { id: 'pdf-page', name: 'PDF 页面管理', detail: '旋转、删除与提取页面', mark: '▩', category: 'pdf', available: true },
  { id: 'pdf-watermark', name: 'PDF 加水印', detail: '文字水印平铺页面', mark: '▨', category: 'pdf', available: true },
  { id: 'pdf-crypto', name: 'PDF 加密/解密', detail: '密码保护与权限', mark: '⊘', category: 'pdf', available: true },
  { id: 'pdf-text', name: 'PDF 提取文本', detail: '导出文本层为 TXT', mark: '¶', category: 'pdf', available: true },
  { id: 'image-pdf', name: '图片转 PDF', detail: '多张图片合成一个 PDF', mark: '▥', category: 'pdf', available: true },
  { id: 'id-photo', name: '证件照制作', detail: '人像分割与换底色', mark: '◉', category: 'image', available: true },
  { id: 'cutout', name: '人像抠图', detail: '透明 PNG 或换纯色背景', mark: '◎', category: 'image', available: true },
  { id: 'watermark', name: '图片去水印', detail: '本地涂选修复', mark: '▧', category: 'image', available: true },
  { id: 'image-stamp', name: '图片加水印', detail: '文字水印 · 九宫格或平铺', mark: '▩', category: 'image', available: true },
  { id: 'image-stitch', name: '长图拼接', detail: '多张截图纵向拼接', mark: '▥', category: 'image', available: true },
  { id: 'image-convert', name: '图片格式转换', detail: 'JPG / PNG 互转与压缩', mark: '▫', category: 'image', available: true },
  { id: 'video-compress', name: '视频压缩', detail: '批量压小视频体积', mark: '◫', category: 'media', available: true },
  { id: 'video-trim', name: '视频剪辑', detail: '按起止时间保留片段', mark: '◧', category: 'media', available: true },
  { id: 'video-gif', name: 'GIF 制作', detail: '截取片段生成 GIF', mark: '◍', category: 'media', available: true },
  { id: 'video-frame', name: '视频截图', detail: '单帧封面或均分多张', mark: '◨', category: 'media', available: true },
  { id: 'video-convert', name: '视频格式转换', detail: 'MP4 / MKV / WebM 互转', mark: '▤', category: 'media', available: true },
  { id: 'video-merge', name: '视频合并', detail: '按顺序拼接多个视频', mark: '▥', category: 'media', available: true },
  { id: 'video-info', name: '视频信息', detail: '编码、分辨率与码率', mark: '◎', category: 'media', available: true },
  { id: 'video-speed', name: '视频倍速', detail: '加速或放慢、音调不变', mark: '◷', category: 'media', available: true },
  { id: 'audio-trim', name: '音频剪辑', detail: '按起止时间保留片段', mark: '♬', category: 'media', available: true },
  { id: 'volume-normalize', name: '音量标准化', detail: '统一到 -16 LUFS', mark: '♫', category: 'media', available: true },
  { id: 'video-audio', name: '视频转音频', detail: '批量提取 WAV / MP3', mark: '▣', category: 'media', available: true },
  { id: 'audio-denoise', name: '音频降噪', detail: 'DeepFilterNet3 · 前后试听', mark: '♫', category: 'media', available: true },
  { id: 'qr-code', name: '网址二维码', detail: '输入网址生成 PNG', mark: '▦', category: 'utility', available: true },
  { id: 'port-check', name: '端口占用', detail: '查询与结束占用进程 · Windows', mark: '⌗', category: 'utility', available: true },
];

/** Groups tools into sidebar categories; empty and unknown categories are skipped. */
export function groupToolsByCategory(all: ToolDefinition[]): ToolCategory[] {
  const grouped = new Map<string, ToolDefinition[]>();
  for (const tool of all) {
    if (!CATEGORY_ORDER.includes(tool.category as (typeof CATEGORY_ORDER)[number])) continue;
    const bucket = grouped.get(tool.category) ?? [];
    bucket.push(tool);
    grouped.set(tool.category, bucket);
  }
  return CATEGORY_ORDER
    .filter((category) => (grouped.get(category) ?? []).length > 0)
    .map((category) => ({ id: category, label: CATEGORY_LABELS[category], tools: grouped.get(category)! }));
}
