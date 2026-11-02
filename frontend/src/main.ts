import { setupPdfTool } from './tools/pdf-image/ui';
import { renderPDFManageView } from './tools/pdf-manage/view';
import { setupPDFManageTool } from './tools/pdf-manage/ui';
import { renderPhotoView } from './tools/id-photo/view';
import { setupPhotoTool } from './tools/id-photo/ui';
import { renderWatermarkView } from './tools/watermark/view';
import { setupWatermarkTool } from './tools/watermark/ui';
import { renderQRCodeView } from './tools/qr-code/view';
import { setupQRCodeTool } from './tools/qr-code/ui';
import { tools } from './tools';

/** Builds a compact desktop shell from the registered tools. */
function renderShell(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('缺少应用容器');

  const navigation = tools.map((tool) => `
    <button class="nav-item ${tool.id === 'pdf-image' ? 'active' : ''}" data-tool="${tool.id}" ${tool.available ? '' : 'disabled'}
      aria-current="${tool.id === 'pdf-image' ? 'page' : 'false'}" title="${tool.detail}">
      <span class="nav-mark" aria-hidden="true">${tool.mark}</span>
      <span>${tool.name}</span>
      ${tool.available ? '' : '<small>规划中</small>'}
    </button>`).join('');

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-icon">▣</span><strong>本地工具箱</strong></div>
        <div class="nav-caption">工具</div>
        <nav class="nav-list" aria-label="工具导航">${navigation}</nav>
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
        <div class="content" id="photoView" hidden>${renderPhotoView()}</div>
        <div class="content" id="watermarkView" hidden>${renderWatermarkView()}</div>
        <div class="content" id="qrCodeView" hidden>${renderQRCodeView()}</div>
      </main>
    </div>`;
}

/** Switches between mounted tools without discarding their selected files. */
function setupNavigation(): void {
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
      document.getElementById('pdfView')!.hidden = id !== 'pdf-image';
      document.getElementById('pdfManageView')!.hidden = id !== 'pdf-manage';
      document.getElementById('photoView')!.hidden = id !== 'id-photo';
      document.getElementById('watermarkView')!.hidden = id !== 'watermark';
      document.getElementById('qrCodeView')!.hidden = id !== 'qr-code';
      document.getElementById('toolTitle')!.textContent = tool.name;
    });
  });
}

renderShell();
setupPdfTool();
setupPDFManageTool();
setupPhotoTool();
setupWatermarkTool();
setupQRCodeTool();
setupNavigation();
