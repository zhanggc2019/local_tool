import { setupPdfTool } from './tools/pdf-image/ui';
import { renderPDFManageView } from './tools/pdf-manage/view';
import { setupPDFManageTool } from './tools/pdf-manage/ui';
import { renderPDFPageView } from './tools/pdf-page/view';
import { setupPDFPageTool } from './tools/pdf-page/ui';
import { renderPDFWatermarkView } from './tools/pdf-watermark/view';
import { setupPDFWatermarkTool } from './tools/pdf-watermark/ui';
import { renderPDFCryptoView } from './tools/pdf-crypto/view';
import { setupPDFCryptoTool } from './tools/pdf-crypto/ui';
import { renderPDFTextView } from './tools/pdf-text/view';
import { setupPDFTextTool } from './tools/pdf-text/ui';
import { renderPhotoView } from './tools/id-photo/view';
import { setupPhotoTool } from './tools/id-photo/ui';
import { renderWatermarkView } from './tools/watermark/view';
import { setupWatermarkTool } from './tools/watermark/ui';
import { renderQRCodeView } from './tools/qr-code/view';
import { setupQRCodeTool } from './tools/qr-code/ui';
import { renderPortCheckView } from './tools/port-check/view';
import { setupPortCheckTool } from './tools/port-check/ui';
import { renderAudioDenoiseView } from './tools/audio-denoise/view';
import { setupAudioDenoiseTool } from './tools/audio-denoise/ui';
import { renderVideoAudioView } from './tools/video-audio/view';
import { setupVideoAudioTool } from './tools/video-audio/ui';
import { renderVideoCompressView } from './tools/video-compress/view';
import { setupVideoCompressTool } from './tools/video-compress/ui';
import { renderVideoTrimView } from './tools/video-trim/view';
import { setupVideoTrimTool } from './tools/video-trim/ui';
import { renderVideoGIFView } from './tools/video-gif/view';
import { setupVideoGIFTool } from './tools/video-gif/ui';
import { renderVideoFrameView } from './tools/video-frame/view';
import { setupVideoFrameTool } from './tools/video-frame/ui';
import { renderVideoConvertView } from './tools/video-convert/view';
import { setupVideoConvertTool } from './tools/video-convert/ui';
import { renderImageConvertView } from './tools/image-convert/view';
import { setupImageConvertTool } from './tools/image-convert/ui';
import { renderImageStampView } from './tools/image-stamp/view';
import { setupImageStampTool } from './tools/image-stamp/ui';
import { renderImageStitchView } from './tools/image-stitch/view';
import { setupImageStitchTool } from './tools/image-stitch/ui';
import { renderVideoMergeView } from './tools/video-merge/view';
import { setupVideoMergeTool } from './tools/video-merge/ui';
import { renderVideoInfoView } from './tools/video-info/view';
import { setupVideoInfoTool } from './tools/video-info/ui';
import { renderVideoSpeedView } from './tools/video-speed/view';
import { setupVideoSpeedTool } from './tools/video-speed/ui';
import { renderVolumeNormalizeView } from './tools/volume-normalize/view';
import { setupVolumeNormalizeTool } from './tools/volume-normalize/ui';
import { renderAudioTrimView } from './tools/audio-trim/view';
import { setupAudioTrimTool } from './tools/audio-trim/ui';
import { renderImagePDFView } from './tools/image-pdf/view';
import { setupImagePDFTool } from './tools/image-pdf/ui';
import { renderCutoutView } from './tools/cutout/view';
import { setupCutoutTool } from './tools/cutout/ui';
import { tools, groupToolsByCategory } from './tools';
import { NAV_COLLAPSE_KEY, allCategoriesCollapsed, defaultCollapsedCategories, parseCollapsedCategories, serializeCollapsedCategories, toggleCategory } from './nav-collapse';

// Maps each tool to the container that renders it inside the workspace.
const TOOL_VIEWS: Record<string, string> = {
  'pdf-image': 'pdfView',
  'pdf-manage': 'pdfManageView',
  'pdf-page': 'pdfPageView',
  'pdf-watermark': 'pdfWatermarkView',
  'pdf-crypto': 'pdfCryptoView',
  'pdf-text': 'pdfTextView',
  'image-pdf': 'imagePdfView',
  'id-photo': 'photoView',
  'cutout': 'cutoutView',
  'watermark': 'watermarkView',
  'image-stamp': 'imageStampView',
  'image-stitch': 'imageStitchView',
  'image-convert': 'imageConvertView',
  'video-compress': 'videoCompressView',
  'video-trim': 'videoTrimView',
  'video-gif': 'videoGIFView',
  'video-frame': 'videoFrameView',
  'video-convert': 'videoConvertView',
  'video-merge': 'videoMergeView',
  'video-info': 'videoInfoView',
  'video-speed': 'videoSpeedView',
  'audio-trim': 'audioTrimView',
  'volume-normalize': 'volumeNormalizeView',
  'video-audio': 'videoAudioView',
  'audio-denoise': 'audioDenoiseView',
  'qr-code': 'qrCodeView',
  'port-check': 'portCheckView',
};

/** Reads the persisted collapse state; without saved state only the first group stays open. */
function readCollapsedCategories(categories: string[]): string[] {
  try {
    const raw = localStorage.getItem(NAV_COLLAPSE_KEY);
    if (raw === null) return defaultCollapsedCategories(categories);
    // Drop stale entries so a renamed category cannot hide a group forever.
    return parseCollapsedCategories(raw).filter((category) => categories.includes(category));
  } catch {
    return defaultCollapsedCategories(categories);
  }
}

/** Persists the collapsed categories, ignoring unavailable storage. */
function persistCollapsedCategories(categories: string[]): void {
  try {
    localStorage.setItem(NAV_COLLAPSE_KEY, serializeCollapsedCategories(categories));
  } catch {
    // Navigation still works without persistence.
  }
}

/** Builds a compact desktop shell from the registered tools. */
function renderShell(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('缺少应用容器');

  const groups = groupToolsByCategory(tools);
  const categoryIds = groups.map((section) => section.id);
  const collapsed = readCollapsedCategories(categoryIds);
  const navigation = groups.map((section) => {
    const isCollapsed = collapsed.includes(section.id);
    return `
    <div class="nav-section ${isCollapsed ? 'collapsed' : ''}" data-category="${section.id}">
      <button class="nav-caption nav-toggle" type="button" aria-expanded="${String(!isCollapsed)}" aria-controls="nav-${section.id}"
        title="${isCollapsed ? '展开' : '折叠'}${section.label}">
        <span>${section.label}</span><small>${section.tools.length}</small><i class="nav-chevron" aria-hidden="true">▾</i>
      </button>
      <nav class="nav-list" id="nav-${section.id}" aria-label="${section.label}">${
        section.tools.map((tool) => `
          <button class="nav-item ${tool.id === 'pdf-image' ? 'active' : ''}" data-tool="${tool.id}" ${tool.available ? '' : 'disabled'}
            aria-current="${tool.id === 'pdf-image' ? 'page' : 'false'}" title="${tool.detail}">
            <span class="nav-mark" aria-hidden="true">${tool.mark}</span>
            <span>${tool.name}</span>
            ${tool.available ? '' : '<small>规划中</small>'}
          </button>`).join('')
      }</nav>
    </div>`;
  }).join('');

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-icon">▣</span><strong>本地工具箱</strong></div>
        <div class="nav-scroll">
          <div class="nav-toolbar"><button id="navToggleAll" class="nav-toggle-all" type="button">全部折叠</button></div>
          ${navigation}
        </div>
        <div class="sidebar-note">所有文件只在本机处理</div>
      </aside>
      <main class="workspace">
        <header class="topbar"><strong id="toolTitle">PDF 转图片</strong><span class="offline"><i></i>本地运行</span></header>
        <div class="content" id="pdfView">
          <div class="page-heading"><h1>PDF 转图片</h1><p>选择 PDF，设置导出方式；图片默认保存到原文件夹。</p></div>
          <div class="work-grid">
            <section class="source-panel" aria-labelledby="source-title">
              <div class="panel-heading"><h2 id="source-title">PDF 文件</h2><span>支持最多 500 页 · 100 MB</span></div>
              <label class="batch-toggle"><input id="pdfBatch" type="checkbox" /> 批量选择 PDF</label>
              <div class="dropzone" id="dropzone" role="button" tabindex="0" aria-label="选择 PDF 文件">
                <div id="emptyState" class="empty-state"><span class="pdf-icon" aria-hidden="true">PDF</span><div class="dropzone-copy"><strong>选择 PDF 文件</strong><p>点击浏览本机文件</p></div><span class="pick-cta">选择文件</span></div>
                <div id="loadedState" class="loaded-state" hidden><div class="preview-sheet"><canvas id="previewCanvas" aria-label="PDF 首页预览"></canvas></div><div class="file-info"><span>已选择</span><strong id="fileName"></strong><small id="fileMeta"></small><em>点击更换文件</em></div></div>
              </div>
              <div id="pdfQueue" class="batch-summary" hidden></div>
              <p class="source-tip">PDF 内容仅在本机读取和转换。</p>
            </section>
            <section class="settings-panel" aria-labelledby="settings-title">
              <div class="panel-heading"><h2 id="settings-title">导出选项</h2></div>
              <div class="setting-block"><div class="setting-title"><strong>图片宽度</strong><span>像素</span></div><div class="choice-row" id="sizeChoices"><label class="choice"><input type="radio" name="size" value="900"/><span><b>小</b><small>900</small></span></label><label class="choice selected"><input type="radio" name="size" value="1400" checked/><span><b>中</b><small>1400</small></span></label><label class="choice"><input type="radio" name="size" value="2000"/><span><b>大</b><small>2000</small></span></label></div></div>
              <div class="setting-block"><div class="setting-title"><strong>多页 PDF</strong></div><div class="mode-list" id="modeChoices"><label class="mode-choice selected"><input type="radio" name="mode" value="single" checked/><span class="radio-indicator"></span><span class="mode-copy"><b>合成一张图片</b><small>按页纵向排列</small></span></label><label class="mode-choice"><input type="radio" name="mode" value="split"/><span class="radio-indicator"></span><span class="mode-copy"><b>每页一张图片</b><small>保存到原文件夹</small></span></label></div></div>
              <div class="setting-block format-block"><div class="setting-title"><strong>图片格式</strong></div><div class="format-row" id="formatChoices"><label class="format-choice selected"><input type="radio" name="format" value="jpeg" checked/>JPG <small>文件较小</small></label><label class="format-choice"><input type="radio" name="format" value="png"/>PNG</label></div></div>
              <div class="estimate" id="estimate"><span id="estimateText">选择文件后显示预计尺寸</span></div>
              <button id="convertButton" class="convert-button" disabled>开始转换</button>
              <div class="status-space">
                <div id="progress" class="progress" hidden><div class="progress-head"><span id="progressText">准备中…</span><span id="progressPercent">0%</span></div><div class="progress-track"><div id="progressBar"></div></div></div>
                <div id="result" class="result" hidden><span class="result-check">✓</span><div><strong id="resultTitle">转换完成</strong><small id="resultPath"></small></div><button id="openFolder" type="button">打开文件夹</button></div>
                <div id="error" class="error" role="alert" hidden></div>
              </div>
            </section>
          </div>
        </div>
        <div class="content" id="pdfManageView" hidden>${renderPDFManageView()}</div>
        <div class="content" id="pdfPageView" hidden>${renderPDFPageView()}</div>
        <div class="content" id="pdfWatermarkView" hidden>${renderPDFWatermarkView()}</div>
        <div class="content" id="pdfCryptoView" hidden>${renderPDFCryptoView()}</div>
        <div class="content" id="pdfTextView" hidden>${renderPDFTextView()}</div>
        <div class="content" id="imagePdfView" hidden>${renderImagePDFView()}</div>
        <div class="content" id="photoView" hidden>${renderPhotoView()}</div>
        <div class="content" id="cutoutView" hidden>${renderCutoutView()}</div>
        <div class="content" id="watermarkView" hidden>${renderWatermarkView()}</div>
        <div class="content" id="imageStampView" hidden>${renderImageStampView()}</div>
        <div class="content" id="imageStitchView" hidden>${renderImageStitchView()}</div>
        <div class="content" id="imageConvertView" hidden>${renderImageConvertView()}</div>
        <div class="content" id="videoCompressView" hidden>${renderVideoCompressView()}</div>
        <div class="content" id="videoTrimView" hidden>${renderVideoTrimView()}</div>
        <div class="content" id="videoGIFView" hidden>${renderVideoGIFView()}</div>
        <div class="content" id="videoFrameView" hidden>${renderVideoFrameView()}</div>
        <div class="content" id="videoConvertView" hidden>${renderVideoConvertView()}</div>
        <div class="content" id="videoMergeView" hidden>${renderVideoMergeView()}</div>
        <div class="content" id="videoInfoView" hidden>${renderVideoInfoView()}</div>
        <div class="content" id="videoSpeedView" hidden>${renderVideoSpeedView()}</div>
        <div class="content" id="audioTrimView" hidden>${renderAudioTrimView()}</div>
        <div class="content" id="volumeNormalizeView" hidden>${renderVolumeNormalizeView()}</div>
        <div class="content" id="videoAudioView" hidden>${renderVideoAudioView()}</div>
        <div class="content" id="audioDenoiseView" hidden>${renderAudioDenoiseView()}</div>
        <div class="content" id="qrCodeView" hidden>${renderQRCodeView()}</div>
        <div class="content" id="portCheckView" hidden>${renderPortCheckView()}</div>
      </main>
    </div>`;
}

/** Applies one collapse state to a section and its toggle button. */
function setSectionCollapsed(section: HTMLElement, isCollapsed: boolean): void {
  section.classList.toggle('collapsed', isCollapsed);
  const toggle = section.querySelector<HTMLButtonElement>('.nav-toggle');
  if (!toggle) return;
  toggle.setAttribute('aria-expanded', String(!isCollapsed));
  const label = toggle.querySelector('span')?.textContent ?? '';
  toggle.title = `${isCollapsed ? '展开' : '折叠'}${label}`;
}

/** Keeps the "全部折叠/全部展开" label in sync with the sections. */
function syncToggleAllLabel(): void {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.nav-section'));
  const collapsed = sections.filter((section) => section.classList.contains('collapsed')).map((section) => section.dataset.category ?? '');
  const button = document.getElementById('navToggleAll');
  if (button) button.textContent = allCategoriesCollapsed(collapsed, sections.map((section) => section.dataset.category ?? '')) ? '全部展开' : '全部折叠';
}

/** Switches between mounted tools without discarding their selected files. */
function setupNavigation(): void {
  /** Lists the categories currently rendered in the sidebar. */
  const categoryIds = (): string[] => Array.from(document.querySelectorAll<HTMLElement>('.nav-section'))
    .map((section) => section.dataset.category ?? '')
    .filter((category) => category.length > 0);

  document.querySelectorAll<HTMLButtonElement>('.nav-item[data-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.tool;
      const tool = tools.find((candidate) => candidate.id === id && candidate.available);
      if (!tool) return;
      document.querySelectorAll<HTMLButtonElement>('.nav-item[data-tool]').forEach((item) => {
        const active = item.dataset.tool === id;
        item.classList.toggle('active', active);
        item.setAttribute('aria-current', active ? 'page' : 'false');
      });
      for (const [toolId, viewId] of Object.entries(TOOL_VIEWS)) {
        const view = document.getElementById(viewId);
        if (view) view.hidden = toolId !== id;
      }
      if (id !== 'audio-denoise') document.querySelectorAll<HTMLAudioElement>('#audioDenoiseView audio').forEach((player) => player.pause());
      document.getElementById('toolTitle')!.textContent = tool.name;
    });
  });

  // Collapsing a category keeps its state across launches.
  document.querySelectorAll<HTMLButtonElement>('.nav-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const section = button.closest<HTMLElement>('.nav-section');
      if (!section) return;
      const category = section.dataset.category ?? '';
      const isCollapsed = !section.classList.contains('collapsed');
      setSectionCollapsed(section, isCollapsed);
      persistCollapsedCategories(toggleCategory(readCollapsedCategories(categoryIds()), category, isCollapsed));
      syncToggleAllLabel();
    });
  });

  document.getElementById('navToggleAll')?.addEventListener('click', () => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.nav-section'));
    const collapseAll = !allCategoriesCollapsed(
      sections.filter((section) => section.classList.contains('collapsed')).map((section) => section.dataset.category ?? ''),
      sections.map((section) => section.dataset.category ?? ''),
    );
    sections.forEach((section) => setSectionCollapsed(section, collapseAll));
    persistCollapsedCategories(collapseAll ? sections.map((section) => section.dataset.category ?? '') : []);
    syncToggleAllLabel();
  });

  // The initially active tool must stay reachable in the sidebar.
  const activeTool = tools.find((tool) => tool.id === 'pdf-image');
  const activeSection = activeTool ? document.querySelector<HTMLElement>(`.nav-section[data-category="${activeTool.category}"]`) : null;
  if (activeSection?.classList.contains('collapsed')) {
    setSectionCollapsed(activeSection, false);
    persistCollapsedCategories(toggleCategory(readCollapsedCategories(categoryIds()), activeTool!.category, false));
  }
  syncToggleAllLabel();
}

renderShell();
setupPdfTool();
setupPDFManageTool();
setupPDFPageTool();
setupPDFWatermarkTool();
setupPDFCryptoTool();
setupPDFTextTool();
setupImagePDFTool();
setupPhotoTool();
setupCutoutTool();
setupWatermarkTool();
setupImageStampTool();
setupImageStitchTool();
setupImageConvertTool();
setupVideoCompressTool();
setupVideoTrimTool();
setupVideoGIFTool();
setupVideoFrameTool();
setupVideoConvertTool();
setupVideoMergeTool();
setupVideoInfoTool();
setupVideoSpeedTool();
setupAudioTrimTool();
setupVolumeNormalizeTool();
setupVideoAudioTool();
setupAudioDenoiseTool();
setupQRCodeTool();
setupPortCheckTool();
setupNavigation();
