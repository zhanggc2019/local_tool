import { COMPRESS_PRESETS } from './presets';

/** Renders a compact video selection, batch queue, and compression options. */
export function renderVideoCompressView(): string {
  const presetChoices = COMPRESS_PRESETS.map((preset, index) => `
    <label class="mode-choice ${index === 0 ? 'selected' : ''}">
      <input type="radio" name="compressPreset" value="${preset.id}" ${index === 0 ? 'checked' : ''}/>
      <span class="radio-indicator"></span>
      <span class="mode-copy"><b>${preset.label}</b><small>${preset.hint}</small></span>
    </label>`).join('');
  return `
    <div class="page-heading"><h1>视频压缩</h1><p>重新编码压小视频体积，可批量处理并保持原有画面尺寸。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="compress-source-title">
        <div class="panel-heading"><h2 id="compress-source-title">视频文件</h2><span>MP4 / MOV / MKV / AVI / WebM 等</span></div>
        <label class="batch-toggle"><input id="compressBatch" type="checkbox" /> 批量模式（最多 50 个）</label>
        <button id="compressPick" class="manage-pick video-pick" type="button">选择视频</button>
        <div id="compressEmpty" class="video-empty"><span aria-hidden="true">◫</span><strong>尚未选择视频</strong><small>压缩在本机完成，不需要网络</small></div>
        <ol id="compressFiles" class="video-file-list" aria-label="待压缩视频" hidden></ol>
        <p class="audio-help">压缩结果默认保存在原视频所在文件夹，源视频不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="compress-options-title">
        <div class="panel-heading"><h2 id="compress-options-title">压缩强度</h2><span>目标约为原体积的比例</span></div>
        <div class="setting-block"><div class="setting-title"><strong>目标体积</strong></div><div class="mode-list" id="compressPresets">${presetChoices}</div></div>
        <div class="manage-explain">按目标体积自动计算码率，音频统一转为 96 kbps AAC。已高效压缩的视频可能不会明显变小。</div>
        <button id="compressRun" class="convert-button" type="button" disabled>开始压缩</button>
        <div id="compressStatus" class="photo-status" role="status" hidden></div>
        <div id="compressError" class="error" role="alert" hidden></div>
        <div id="compressResult" class="result" hidden><span class="result-check">✓</span><div><strong id="compressResultTitle"></strong><small id="compressResultPath"></small></div><button id="compressOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
