import { IMAGE_FORMATS, IMAGE_MAX_DIMENSIONS } from './options';

/** Renders the batch image converter with format, quality, and size options. */
export function renderImageConvertView(): string {
  const formatChoices = IMAGE_FORMATS.map((format, index) => `
    <label class="format-choice ${index === 0 ? 'selected' : ''}">
      <input type="radio" name="imgFormat" value="${format.value}" ${index === 0 ? 'checked' : ''}/> ${format.label} <small>${format.hint}</small>
    </label>`).join('');
  const dimensionChoices = IMAGE_MAX_DIMENSIONS.map((choice, index) => `
    <label class="choice ${index === 0 ? 'selected' : ''}">
      <input type="radio" name="imgMaxDimension" value="${choice.value}" ${index === 0 ? 'checked' : ''}/>
      <span><b>${choice.label}</b><small>${choice.value === 0 ? '保持' : '最长边'}</small></span>
    </label>`).join('');
  return `
    <div class="page-heading"><h1>图片格式转换</h1><p>批量在 JPG 与 PNG 之间转换，可压缩质量或缩小尺寸。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="imgconv-source-title">
        <div class="panel-heading"><h2 id="imgconv-source-title">图片文件</h2><span>JPG / PNG / WebP · 每张 20 MB</span></div>
        <label class="batch-toggle"><input id="imgConvertBatch" type="checkbox" /> 批量模式（最多 50 张）</label>
        <button id="imgConvertPick" class="manage-pick video-pick" type="button">选择图片</button>
        <div id="imgConvertEmpty" class="video-empty"><span aria-hidden="true">▦</span><strong>尚未选择图片</strong><small>支持 JPG、PNG 与 WebP 输入</small></div>
        <ol id="imgConvertFiles" class="video-file-list" aria-label="待转换图片" hidden></ol>
        <p class="audio-help">转换结果默认保存在各图片所在文件夹，源图片不会修改；EXIF 等元数据会在重新编码时移除。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="imgconv-options-title">
        <div class="panel-heading"><h2 id="imgconv-options-title">输出选项</h2><span>WebP 输入会转为所选格式</span></div>
        <div class="setting-block"><div class="setting-title"><strong>输出格式</strong></div><div class="format-row" id="imgConvertFormats">${formatChoices}</div></div>
        <div class="setting-block" id="imgConvertQualityBlock"><div class="setting-title"><strong>JPG 质量</strong><span id="imgQualityValue">90</span></div>
          <input id="imgConvertQuality" type="range" min="40" max="100" step="5" value="90"/>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>最大边长</strong></div><div class="choice-row" id="imgConvertDimensions">${dimensionChoices}</div></div>
        <div class="manage-explain">PNG 输出无损、体积通常更大；透明图片转 JPG 时会以白色填充背景。</div>
        <button id="imgConvertRun" class="convert-button" type="button" disabled>开始转换</button>
        <div id="imgConvertStatus" class="photo-status" role="status" hidden></div>
        <div id="imgConvertError" class="error" role="alert" hidden></div>
        <div id="imgConvertResult" class="result" hidden><span class="result-check">✓</span><div><strong id="imgConvertResultTitle"></strong><small id="imgConvertResultPath"></small></div><button id="imgConvertOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
