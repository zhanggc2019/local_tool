/** Returns the independent ID photo tool view for the desktop shell. */
export function renderPhotoView(): string {
  return `
    <div class="page-heading"><h1>证件照制作</h1><p>选择正面人像，调整构图；结果默认保存到原文件夹。</p></div>
    <div class="work-grid photo-grid">
      <section class="source-panel" aria-labelledby="photo-source-title">
        <div class="panel-heading"><h2 id="photo-source-title">人像照片</h2><span class="photo-source-actions"><span id="photoFileName">JPG、PNG 或 WebP · 20 MB 以内</span><button id="photoReplace" type="button" hidden>更换照片</button></span></div>
        <label class="batch-toggle"><input id="photoBatch" type="checkbox" /> 批量选择照片（同一构图）</label>
        <div class="photo-stage" id="photoStage">
          <div class="empty-state" id="photoEmpty"><span class="photo-icon" aria-hidden="true">▣</span><strong>选择一张正面人像</strong><p>建议头肩完整、光线均匀、背景简单</p><button type="button" class="pick-cta" id="photoPick">选择照片</button></div>
          <div class="photo-editor" id="photoEditor" hidden><canvas id="photoCanvas" aria-label="证件照预览，可拖动调整位置"></canvas><div class="photo-drag-tip">拖动照片调整位置</div></div>
        </div>
        <div id="photoQueue" class="batch-summary" hidden></div>
        <p class="source-tip">人像抠图在本机完成；复杂头发和背景请检查预览边缘。</p>
      </section>
      <section class="settings-panel photo-settings" aria-labelledby="photo-settings-title">
        <div class="panel-heading"><h2 id="photo-settings-title">照片规格</h2></div>
        <div class="setting-block"><div class="setting-title"><strong>尺寸</strong><span>300 DPI</span></div><div class="photo-size-list">
          <label class="photo-size-choice selected"><input type="radio" name="photoSize" value="one" checked/><span class="radio-indicator"></span><b>1 寸</b><small>25 × 35 mm · 295 × 413 px</small></label>
          <label class="photo-size-choice"><input type="radio" name="photoSize" value="two"/><span class="radio-indicator"></span><b>2 寸</b><small>35 × 49 mm · 413 × 579 px</small></label>
        </div></div>
        <div class="setting-block"><div class="setting-title"><strong>背景颜色</strong></div><div class="photo-color-list">
          <label class="photo-color-choice selected"><input type="radio" name="photoColor" value="blue" checked/><i class="swatch blue"></i><span>蓝底</span></label>
          <label class="photo-color-choice"><input type="radio" name="photoColor" value="red"/><i class="swatch red"></i><span>红底</span></label>
          <label class="photo-color-choice"><input type="radio" name="photoColor" value="white"/><i class="swatch white"></i><span>白底</span></label>
        </div></div>
        <div class="setting-block"><div class="setting-title"><strong>缩放</strong><span id="photoZoomValue">100%</span></div><input class="photo-zoom" id="photoZoom" type="range" min="100" max="400" step="5" value="100" disabled aria-label="证件照缩放" /></div>
        <div class="photo-hint">照片会按所选比例裁切；拖动预览可移动人像。</div>
        <button id="photoSave" class="convert-button" disabled>保存证件照</button>
        <div class="status-space"><div id="photoStatus" class="photo-status" role="status" hidden></div><div id="photoResult" class="result" hidden><span class="result-check">✓</span><div><strong>已保存证件照</strong><small id="photoResultPath"></small></div><button id="photoOpenFolder" type="button">打开文件夹</button></div><div id="photoError" class="error" role="alert" hidden></div></div>
      </section>
    </div>`;
}
