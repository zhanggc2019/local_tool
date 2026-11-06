import { STITCH_GAPS, STITCH_TARGET_WIDTHS } from './processor';

/** Renders the ordered image list, stitch size options, and output format. */
export function renderImageStitchView(): string {
  const widths = STITCH_TARGET_WIDTHS.map((choice, index) => `
    <label class="choice ${index === 0 ? 'selected' : ''}">
      <input type="radio" name="stitchWidth" value="${choice.value}" ${index === 0 ? 'checked' : ''}/>
      <span><b>${choice.label}</b><small>${choice.value === 0 ? '自动' : '统一宽度'}</small></span>
    </label>`).join('');
  const gaps = STITCH_GAPS.map((choice, index) => `
    <label class="choice ${index === 1 ? 'selected' : ''}">
      <input type="radio" name="stitchGap" value="${choice.value}" ${index === 1 ? 'checked' : ''}/>
      <span><b>${choice.label}</b><small>白色分隔</small></span>
    </label>`).join('');
  return `
    <div class="page-heading"><h1>长图拼接</h1><p>把多张截图按顺序纵向拼接成一张长图，适合聊天记录与网页截图。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="stitch-source-title">
        <div class="panel-heading"><h2 id="stitch-source-title">图片文件</h2><span>JPG / PNG / WebP · 最多 50 张</span></div>
        <button id="stitchPick" class="manage-pick video-pick" type="button">选择图片（可多选）</button>
        <div id="stitchEmpty" class="video-empty"><span aria-hidden="true">▥</span><strong>尚未选择图片</strong><small>按列表顺序从上到下拼接</small></div>
        <ol id="stitchFiles" class="video-file-list image-pdf-list" aria-label="待拼接图片" hidden></ol>
        <p class="audio-help">长图默认保存在第一张图片所在文件夹，命名为“原文件名_长图”，源图片不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="stitch-options-title">
        <div class="panel-heading"><h2 id="stitch-options-title">拼接设置</h2><span>统一宽度后纵向排列</span></div>
        <div class="setting-block"><div class="setting-title"><strong>目标宽度</strong></div><div class="choice-row" id="stitchWidths">${widths}</div></div>
        <div class="setting-block"><div class="setting-title"><strong>图片间距</strong></div><div class="choice-row" id="stitchGaps">${gaps}</div></div>
        <div class="setting-block"><div class="setting-title"><strong>输出格式</strong></div><div class="format-row" id="stitchFormats">
          <label class="format-choice selected"><input type="radio" name="stitchFormat" value="jpeg" checked/> JPG <small>文件较小</small></label>
          <label class="format-choice"><input type="radio" name="stitchFormat" value="png"/> PNG <small>无损</small></label>
        </div></div>
        <div id="stitchHint" class="timecode-hint">选择图片后显示预计长图尺寸。</div>
        <button id="stitchRun" class="convert-button" type="button" disabled>开始拼接</button>
        <div id="stitchStatus" class="photo-status" role="status" hidden></div>
        <div id="stitchError" class="error" role="alert" hidden></div>
        <div id="stitchResult" class="result" hidden><span class="result-check">✓</span><div><strong id="stitchResultTitle"></strong><small id="stitchResultPath"></small></div><button id="stitchOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
