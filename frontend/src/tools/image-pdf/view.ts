/** Renders the image picker, ordered file list, and page layout options. */
export function renderImagePDFView(): string {
  return `
    <div class="page-heading"><h1>图片转 PDF</h1><p>把多张图片按顺序合成一个 PDF，全部在本机完成。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="imagepdf-source-title">
        <div class="panel-heading"><h2 id="imagepdf-source-title">图片文件</h2><span>JPG / PNG / WebP · 每张 20 MB</span></div>
        <button id="imagePdfPick" class="manage-pick video-pick" type="button">选择图片（可多选）</button>
        <div id="imagePdfEmpty" class="video-empty"><span aria-hidden="true">▥</span><strong>尚未选择图片</strong><small>最多 50 张，可在下方调整顺序</small></div>
        <ol id="imagePdfFiles" class="video-file-list image-pdf-list" aria-label="待合成图片" hidden></ol>
        <p class="audio-help">PDF 默认保存在第一张图片所在文件夹，源图片不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="imagepdf-options-title">
        <div class="panel-heading"><h2 id="imagepdf-options-title">页面布局</h2><span>每张图片一页</span></div>
        <div class="setting-block"><div class="setting-title"><strong>页面尺寸</strong></div><div class="mode-list" id="imagePdfModes">
          <label class="mode-choice selected"><input type="radio" name="imagePdfMode" value="fit" checked/><span class="radio-indicator"></span><span class="mode-copy"><b>适应 A4 页面</b><small>等比缩放并居中</small></span></label>
          <label class="mode-choice"><input type="radio" name="imagePdfMode" value="original"/><span class="radio-indicator"></span><span class="mode-copy"><b>保持图片原始尺寸</b><small>页面与图片同比例</small></span></label>
        </div></div>
        <div class="manage-explain">手机照片的拍摄方向按原始像素写入；旋转信息不会被自动纠正。</div>
        <button id="imagePdfRun" class="convert-button" type="button" disabled>合成 PDF</button>
        <div id="imagePdfStatus" class="photo-status" role="status" hidden></div>
        <div id="imagePdfError" class="error" role="alert" hidden></div>
        <div id="imagePdfResult" class="result" hidden><span class="result-check">✓</span><div><strong id="imagePdfResultTitle"></strong><small id="imagePdfResultPath"></small></div><button id="imagePdfOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
