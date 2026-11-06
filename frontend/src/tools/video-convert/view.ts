import { VIDEO_TARGETS } from './options';

/** Renders the batch video container converter. */
export function renderVideoConvertView(): string {
  const targetChoices = VIDEO_TARGETS.map((target, index) => `
    <label class="mode-choice ${index === 0 ? 'selected' : ''}">
      <input type="radio" name="vconvTarget" value="${target.value}" ${index === 0 ? 'checked' : ''}/>
      <span class="radio-indicator"></span>
      <span class="mode-copy"><b>${target.label}</b><small>${target.hint}</small></span>
    </label>`).join('');
  return `
    <div class="page-heading"><h1>视频格式转换</h1><p>在 MP4、MKV 与 WebM 之间批量转换，尽量保留原始画质。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="vconv-source-title">
        <div class="panel-heading"><h2 id="vconv-source-title">视频文件</h2><span>MP4 / MOV / MKV / AVI / WebM 等</span></div>
        <label class="batch-toggle"><input id="vconvBatch" type="checkbox" /> 批量模式（最多 50 个）</label>
        <button id="vconvPick" class="manage-pick video-pick" type="button">选择视频</button>
        <div id="vconvEmpty" class="video-empty"><span aria-hidden="true">▤</span><strong>尚未选择视频</strong><small>转换在本机完成，不需要网络</small></div>
        <ol id="vconvFiles" class="video-file-list" aria-label="待转换视频" hidden></ol>
        <p class="audio-help">转换结果默认保存在原视频所在文件夹，源视频不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="vconv-options-title">
        <div class="panel-heading"><h2 id="vconv-options-title">输出格式</h2><span>字幕与数据流会被移除</span></div>
        <div class="setting-block"><div class="setting-title"><strong>目标容器</strong></div><div class="mode-list" id="vconvTargets">${targetChoices}</div></div>
        <div class="manage-explain">MP4 目标仅在源文件已是 MP4 时直接复制，其他情况转为 H.264 + AAC；MKV 直接复制音视频流（最快、无损）；WebM 转为 VP9 + Opus。一个视频失败不影响其余文件。</div>
        <button id="vconvRun" class="convert-button" type="button" disabled>开始转换</button>
        <div id="vconvStatus" class="photo-status" role="status" hidden></div>
        <div id="vconvError" class="error" role="alert" hidden></div>
        <div id="vconvResult" class="result" hidden><span class="result-check">✓</span><div><strong id="vconvResultTitle"></strong><small id="vconvResultPath"></small></div><button id="vconvOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
