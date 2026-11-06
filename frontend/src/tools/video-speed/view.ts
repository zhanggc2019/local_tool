import { SPEED_RATES, rateLabel } from './options';

/** Renders the batch playback-rate tool. */
export function renderVideoSpeedView(): string {
  const rates = SPEED_RATES.map((rate, index) => `
    <label class="speed-choice ${index === 4 ? 'selected' : ''}">
      <input type="radio" name="speedRate" value="${rate}" ${index === 4 ? 'checked' : ''}/>
      <span>${rateLabel(rate)}</span>
    </label>`).join('');
  return `
    <div class="page-heading"><h1>视频倍速</h1><p>加速或放慢视频，音调保持不变，可批量处理。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="speed-source-title">
        <div class="panel-heading"><h2 id="speed-source-title">视频文件</h2><span>MP4 / MOV / MKV / AVI / WebM 等</span></div>
        <label class="batch-toggle"><input id="speedBatch" type="checkbox" /> 批量模式（最多 50 个）</label>
        <button id="speedPick" class="manage-pick video-pick" type="button">选择视频</button>
        <div id="speedEmpty" class="video-empty"><span aria-hidden="true">◷</span><strong>尚未选择视频</strong><small>速度会应用到全部所选视频</small></div>
        <ol id="speedFiles" class="video-file-list" aria-label="待处理视频" hidden></ol>
        <p class="audio-help">结果默认保存在原视频所在文件夹，命名为“原文件名_倍速.mp4”。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="speed-options-title">
        <div class="panel-heading"><h2 id="speed-options-title">播放速度</h2><span>音调保持不变</span></div>
        <div class="setting-block"><div class="setting-title"><strong>速度</strong></div><div class="speed-row" id="speedRates">${rates}</div></div>
        <div class="manage-explain">加速与放慢都会重新编码为 H.264 + AAC。0.5× 会把时长拉伸为两倍，4× 会压缩到四分之一。</div>
        <button id="speedRun" class="convert-button" type="button" disabled>开始处理</button>
        <div id="speedStatus" class="photo-status" role="status" hidden></div>
        <div id="speedError" class="error" role="alert" hidden></div>
        <div id="speedResult" class="result" hidden><span class="result-check">✓</span><div><strong id="speedResultTitle"></strong><small id="speedResultPath"></small></div><button id="speedOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
