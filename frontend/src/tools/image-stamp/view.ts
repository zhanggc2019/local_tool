import { STAMP_ANCHORS, STAMP_COLORS } from './processor';

/** Renders the batch image watermark tool with live preview and placement grid. */
export function renderImageStampView(): string {
  const anchors = STAMP_ANCHORS.map((anchor, index) => `
    <label class="stamp-anchor ${index === 8 ? 'selected' : ''}">
      <input type="radio" name="stampAnchor" value="${anchor.value}" ${index === 8 ? 'checked' : ''}/>
      <span>${anchor.label}</span>
    </label>`).join('');
  const swatches = STAMP_COLORS.map((color, index) => `
    <label class="swatch ${index === 0 ? 'selected' : ''}" title="${color.label}">
      <input type="radio" name="stampColor" value="${color.value}" ${index === 0 ? 'checked' : ''}/>
      <span class="swatch-dot" style="background:${color.value}"></span>
      <small>${color.label}</small>
    </label>`).join('');
  return `
    <div class="page-heading"><h1>图片加水印</h1><p>在图片上叠加文字水印，支持九宫格定位或整图平铺。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="stamp-source-title">
        <div class="panel-heading"><h2 id="stamp-source-title">图片文件</h2><span>JPG / PNG / WebP · 每张 20 MB</span></div>
        <label class="batch-toggle"><input id="stampBatch" type="checkbox" checked /> 批量模式（最多 50 张）</label>
        <button id="stampPick" class="manage-pick video-pick" type="button">选择图片</button>
        <div id="stampEmpty" class="video-empty"><span aria-hidden="true">▨</span><strong>尚未选择图片</strong><small>批量时同一设置应用到全部图片</small></div>
        <div id="stampPreviewWrap" class="cutout-preview" hidden><canvas id="stampPreview" aria-label="水印预览"></canvas></div>
        <ol id="stampFiles" class="video-file-list" aria-label="待加水印图片" hidden></ol>
        <p class="audio-help">结果默认保存在各图片所在文件夹，命名为“原文件名_水印”，源图片不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="stamp-options-title">
        <div class="panel-heading"><h2 id="stamp-options-title">水印设置</h2><span>中文使用系统字体</span></div>
        <div class="setting-block"><div class="setting-title"><strong>文字</strong><span>最多 60 字</span></div>
          <input id="stampText" class="page-selection-input" type="text" value="内部资料" maxlength="60" autocomplete="off"/>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>字号</strong><span id="stampSizeValue">36 px</span></div>
          <input id="stampSize" type="range" min="12" max="160" step="2" value="36"/>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>不透明度</strong><span id="stampOpacityValue">45%</span></div>
          <input id="stampOpacity" type="range" min="5" max="100" step="5" value="45"/>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>颜色</strong></div><div class="swatch-row" id="stampColors">${swatches}</div></div>
        <div class="setting-block"><div class="setting-title"><strong>位置</strong><span>右下角默认</span></div>
          <div class="stamp-anchor-grid">${anchors}</div>
          <label class="stamp-tile"><input id="stampTile" type="checkbox" /> 整图平铺</label>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>输出格式</strong></div><div class="format-row" id="stampFormats">
          <label class="format-choice selected"><input type="radio" name="stampFormat" value="png" checked/> PNG <small>保留透明</small></label>
          <label class="format-choice"><input type="radio" name="stampFormat" value="jpeg"/> JPG <small>文件较小</small></label>
        </div></div>
        <button id="stampRun" class="convert-button" type="button" disabled>开始添加</button>
        <div id="stampStatus" class="photo-status" role="status" hidden></div>
        <div id="stampError" class="error" role="alert" hidden></div>
        <div id="stampResult" class="result" hidden><span class="result-check">✓</span><div><strong id="stampResultTitle"></strong><small id="stampResultPath"></small></div><button id="stampOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
