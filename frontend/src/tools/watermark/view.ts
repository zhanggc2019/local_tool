/** Returns the local image repair workspace. */
export function renderWatermarkView(): string {
  return `
    <div class="page-heading"><h1>图片去水印</h1><p>涂选水印并在本机修复；结果默认保存到原文件夹。</p></div>
    <div class="watermark-layout">
      <section class="source-panel watermark-image-panel" aria-labelledby="watermark-image-title">
        <div class="panel-heading"><h2 id="watermark-image-title">图片预览</h2><span id="watermarkFileName">JPG、PNG、WebP · 20 MB 以内</span></div>
        <label class="batch-toggle"><input id="watermarkBatch" type="checkbox" /> 批量选择图片（同位置水印）</label>
        <div class="watermark-stage" id="watermarkStage">
          <div class="empty-state" id="watermarkEmpty"><span class="photo-icon" aria-hidden="true">▧</span><strong>选择需要修复的图片</strong><p>建议先处理小块水印，再逐步修整</p><button class="pick-cta" id="watermarkChoose" type="button">选择图片</button></div>
          <div class="watermark-canvas-wrap" id="watermarkEditor" hidden><canvas id="watermarkCanvas" aria-label="图片修复画布，可涂选水印区域"></canvas></div>
        </div>
        <div id="watermarkQueue" class="batch-summary" hidden></div>
        <p class="source-tip">图片只在本机处理。复杂纹理或大面积遮挡可能需要多次修复。</p>
      </section>
      <section class="settings-panel watermark-controls" aria-labelledby="watermark-options-title">
        <div class="panel-heading"><h2 id="watermark-options-title">修复工具</h2></div>
        <div class="setting-block"><div class="setting-title"><strong>画笔大小</strong><span id="watermarkBrushValue">24 px</span></div><input id="watermarkBrush" class="photo-zoom" type="range" min="6" max="100" step="2" value="24" aria-label="画笔大小" /></div>
        <div class="watermark-actions"><button id="watermarkUndo" type="button" disabled>撤销涂选</button><button id="watermarkClear" type="button" disabled>清空涂选</button><button id="watermarkBefore" type="button" disabled>按住看原图</button></div>
        <div class="watermark-tip">用画笔覆盖水印，并略微超出其边缘。点击“修复选区”后可继续涂选其他位置。</div>
        <button id="watermarkRepair" class="convert-button" type="button" disabled>修复选区</button>
        <div class="setting-block watermark-format"><div class="setting-title"><strong>保存格式</strong></div><select id="watermarkFormat" aria-label="保存格式"><option value="png">PNG（无损）</option><option value="jpeg">JPG（文件较小）</option></select></div>
        <button id="watermarkSave" class="convert-button watermark-save" type="button" disabled>保存图片</button>
        <button id="watermarkReplace" class="manage-pick" type="button" hidden>更换图片</button>
        <div class="status-space"><div class="photo-status" id="watermarkStatus" role="status" hidden></div><div class="result" id="watermarkResult" hidden><span class="result-check">✓</span><div><strong id="watermarkResultTitle">图片已保存</strong><small id="watermarkPath"></small></div><button id="watermarkOpenFolder" type="button">打开文件夹</button></div><div class="error" id="watermarkError" role="alert" hidden></div></div>
      </section>
    </div>`;
}
