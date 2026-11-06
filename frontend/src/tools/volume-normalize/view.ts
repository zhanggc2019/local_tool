/** Renders the audio loudness normalization tool. */
export function renderVolumeNormalizeView(): string {
  return `
    <div class="page-heading"><h1>音量标准化</h1><p>把音量统一到适合分享的响度（-16 LUFS），可批量处理。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="volume-source-title">
        <div class="panel-heading"><h2 id="volume-source-title">音频文件</h2><span>MP3 / WAV / M4A / AAC / FLAC / OGG</span></div>
        <label class="batch-toggle"><input id="volumeBatch" type="checkbox" /> 批量模式（最多 50 个）</label>
        <button id="volumePick" class="manage-pick video-pick" type="button">选择音频</button>
        <div id="volumeEmpty" class="video-empty"><span aria-hidden="true">♫</span><strong>尚未选择音频</strong><small>统一响度，适合播客与录音</small></div>
        <ol id="volumeFiles" class="video-file-list" aria-label="待处理音频" hidden></ol>
        <p class="audio-help">结果默认保存在原音频所在文件夹，命名为“原文件名_标准化”，源文件不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="volume-options-title">
        <div class="panel-heading"><h2 id="volume-options-title">输出选项</h2><span>目标响度 -16 LUFS</span></div>
        <div class="setting-block"><div class="setting-title"><strong>音频格式</strong></div><div class="format-row volume-formats">
          <label class="format-choice selected"><input type="radio" name="volumeFormat" value="mp3" checked/> MP3 <small>192 kbps</small></label>
          <label class="format-choice"><input type="radio" name="volumeFormat" value="wav"/> WAV <small>48 kHz PCM</small></label>
        </div></div>
        <div class="manage-explain">采用响度标准化（loudnorm），把整体响度拉近 -16 LUFS，峰值限制在 -1.5 dBTP。音乐与电影原声可能不适合该目标。</div>
        <button id="volumeRun" class="convert-button" type="button" disabled>开始标准化</button>
        <div id="volumeStatus" class="photo-status" role="status" hidden></div>
        <div id="volumeError" class="error" role="alert" hidden></div>
        <div id="volumeResult" class="result" hidden><span class="result-check">✓</span><div><strong id="volumeResultTitle"></strong><small id="volumeResultPath"></small></div><button id="volumeOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
