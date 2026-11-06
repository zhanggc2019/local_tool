import { MERGE_MODES } from './options';

/** Renders the ordered video list, merge strategy, and result panel. */
export function renderVideoMergeView(): string {
  const modes = MERGE_MODES.map((mode, index) => `
    <label class="mode-choice ${index === 0 ? 'selected' : ''}">
      <input type="radio" name="mergeMode" value="${mode.value}" ${index === 0 ? 'checked' : ''}/>
      <span class="radio-indicator"></span>
      <span class="mode-copy"><b>${mode.label}</b><small>${mode.hint}</small></span>
    </label>`).join('');
  return `
    <div class="page-heading"><h1>视频合并</h1><p>把多个视频按顺序拼接成一个文件，可选择无损快合或兼容重编码。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="merge-source-title">
        <div class="panel-heading"><h2 id="merge-source-title">视频文件</h2><span>至少两个 · 最多 50 个</span></div>
        <button id="mergePick" class="manage-pick video-pick" type="button">选择视频（可多选）</button>
        <div id="mergeEmpty" class="video-empty"><span aria-hidden="true">▤</span><strong>尚未选择视频</strong><small>按列表顺序从上到下拼接</small></div>
        <ol id="mergeFiles" class="video-file-list image-pdf-list" aria-label="待合并视频" hidden></ol>
        <p class="audio-help">合并结果默认保存在第一个视频所在文件夹，命名为“原文件名_合并”，源视频不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="merge-options-title">
        <div class="panel-heading"><h2 id="merge-options-title">合并方式</h2><span>顺序可在左侧调整</span></div>
        <div class="setting-block"><div class="mode-list" id="mergeModes">${modes}</div></div>
        <div class="manage-explain">快速合并要求各视频的编码、分辨率一致，否则会失败并提示改用兼容合并。兼容合并以第一个视频的分辨率与帧率为准，缺少音轨的视频会补静音。</div>
        <button id="mergeRun" class="convert-button" type="button" disabled>开始合并</button>
        <div id="mergeStatus" class="photo-status" role="status" hidden></div>
        <div id="mergeError" class="error" role="alert" hidden></div>
        <div id="mergeResult" class="result" hidden><span class="result-check">✓</span><div><strong id="mergeResultTitle"></strong><small id="mergeResultPath"></small></div><button id="mergeOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
