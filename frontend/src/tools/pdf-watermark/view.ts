import { WATERMARK_COLORS } from './options';

/** Renders the PDF watermark picker and appearance controls. */
export function renderPDFWatermarkView(): string {
  const swatches = WATERMARK_COLORS.map((color, index) => `
    <label class="swatch ${index === 0 ? 'selected' : ''}" title="${color.label}">
      <input type="radio" name="wmColor" value="${color.value}" ${index === 0 ? 'checked' : ''}/>
      <span class="swatch-dot" style="background:${color.value}"></span>
      <small>${color.label}</small>
    </label>`).join('');
  return `
    <div class="page-heading"><h1>PDF 加水印</h1><p>在每一页叠加半透明文字水印，适合标注“内部资料”等字样。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="wm-source-title">
        <div class="panel-heading"><h2 id="wm-source-title">PDF 文件</h2><span>单次处理一个 PDF</span></div>
        <button id="wmPick" class="manage-pick video-pick" type="button">选择 PDF</button>
        <div id="wmEmpty" class="video-empty"><span aria-hidden="true">▩</span><strong>尚未选择 PDF</strong><small>水印应用到全部页面</small></div>
        <div id="wmFile" class="video-file" hidden></div>
        <p class="audio-help">结果默认保存在原 PDF 所在文件夹，源文件不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="wm-options-title">
        <div class="panel-heading"><h2 id="wm-options-title">水印样式</h2><span>中文字体随系统渲染</span></div>
        <div class="setting-block"><div class="setting-title"><strong>文字</strong><span>最多 100 字</span></div>
          <input id="wmText" class="page-selection-input" type="text" value="内部资料" maxlength="100" autocomplete="off"/>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>字号</strong><span id="wmSizeValue">36 pt</span></div>
          <input id="wmSize" type="range" min="12" max="96" step="2" value="36"/>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>不透明度</strong><span id="wmOpacityValue">30%</span></div>
          <input id="wmOpacity" type="range" min="5" max="100" step="5" value="30"/>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>旋转</strong><span id="wmRotationValue">45°</span></div>
          <input id="wmRotation" type="range" min="-90" max="90" step="15" value="45"/>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>颜色</strong></div><div class="swatch-row" id="wmColors">${swatches}</div></div>
        <label class="batch-toggle"><input id="wmOnTop" type="checkbox" /> 显示在内容上方（默认在文字下方）</label>
        <div id="wmHint" class="timecode-hint"></div>
        <button id="wmRun" class="convert-button" type="button" disabled>添加水印</button>
        <div id="wmStatus" class="photo-status" role="status" hidden></div>
        <div id="wmError" class="error" role="alert" hidden></div>
        <div id="wmResult" class="result" hidden><span class="result-check">✓</span><div><strong id="wmResultTitle"></strong><small id="wmResultPath"></small></div><button id="wmOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
