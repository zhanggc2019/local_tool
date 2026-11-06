/** Renders the portrait cutout picker, background choices, and save actions. */
export function renderCutoutView(): string {
  return `
    <div class="page-heading"><h1>人像抠图</h1><p>识别人物并移除背景，导出透明 PNG 或换纯色背景。</p></div>
    <div class="work-grid cutout-grid">
      <section class="source-panel" aria-labelledby="cutout-source-title">
        <div class="panel-heading"><h2 id="cutout-source-title">图片文件</h2><span>JPG / PNG / WebP · 20 MB</span></div>
        <label class="batch-toggle"><input id="cutoutBatch" type="checkbox" /> 批量模式（最多 50 张）</label>
        <button id="cutoutPick" class="manage-pick" type="button">选择图片</button>
        <div id="cutoutPreview" class="cutout-preview" hidden>
          <canvas id="cutoutCanvas" aria-label="抠图结果预览"></canvas>
        </div>
        <div id="cutoutEmpty" class="video-empty"><span aria-hidden="true">◎</span><strong>尚未选择图片</strong><small>处理在本机完成，不需要网络</small></div>
        <ol id="cutoutFiles" class="video-file-list" aria-label="待处理图片" hidden></ol>
        <p class="audio-help">抠图结果默认保存在原图片所在文件夹，源文件不会修改。</p>
      </section>
      <section class="settings-panel" aria-labelledby="cutout-options-title">
        <div class="panel-heading"><h2 id="cutout-options-title">输出选项</h2><span>人像分割 · 本机处理</span></div>
        <div class="setting-block"><div class="setting-title"><strong>背景</strong></div><div class="choice-row cutout-backgrounds" id="cutoutBackgrounds">
          <label class="choice"><input type="radio" name="cutoutBackground" value="transparent" checked/><span><b>透明</b><small>PNG</small></span></label>
          <label class="choice"><input type="radio" name="cutoutBackground" value="white"/><span><b>白底</b><small></small></span></label>
          <label class="choice"><input type="radio" name="cutoutBackground" value="blue"/><span><b>蓝底</b><small></small></span></label>
          <label class="choice"><input type="radio" name="cutoutBackground" value="red"/><span><b>红底</b><small></small></span></label>
          <label class="choice"><input type="radio" name="cutoutBackground" value="green"/><span><b>绿底</b><small></small></span></label>
        </div></div>
        <div class="setting-block"><div class="setting-title"><strong>图片格式</strong></div><div class="format-row cutout-formats">
          <label class="format-choice selected"><input type="radio" name="cutoutFormat" value="png" checked /> PNG <small>保留透明</small></label>
          <label class="format-choice"><input type="radio" name="cutoutFormat" value="jpeg" /> JPG <small>文件较小</small></label>
        </div></div>
        <div class="manage-explain">透明背景会自动使用 PNG。人像边缘在复杂背景下可能有痕迹，请检查预览。</div>
        <button id="cutoutRun" class="convert-button" type="button" disabled>开始抠图</button>
        <div id="cutoutStatus" class="photo-status" role="status" hidden></div>
        <div id="cutoutError" class="error" role="alert" hidden></div>
        <div id="cutoutResult" class="result" hidden><span class="result-check">✓</span><div><strong id="cutoutResultTitle"></strong><small id="cutoutResultPath"></small></div><button id="cutoutOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
