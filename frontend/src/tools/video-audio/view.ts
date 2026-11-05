/** Renders a compact video selection, batch queue, and audio extraction options. */
export function renderVideoAudioView(): string {
  return `
    <div class="page-heading"><h1>视频转音频</h1><p>从视频中提取音轨，可批量保存为 MP3 或 WAV。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="video-source-title">
        <div class="panel-heading"><h2 id="video-source-title">视频文件</h2><span>MP4 / MOV / MKV / AVI / WebM 等</span></div>
        <label class="batch-toggle"><input id="videoBatch" type="checkbox" /> 批量模式（最多 50 个）</label>
        <button id="videoPick" class="manage-pick video-pick" type="button">选择视频</button>
        <div id="videoEmpty" class="video-empty"><span aria-hidden="true">▣</span><strong>尚未选择视频</strong><small>支持单个视频，也可开启批量模式</small></div>
        <ol id="videoFiles" class="video-file-list" aria-label="待提取视频" hidden></ol>
        <p class="audio-help">每个音频默认保存在对应视频的原文件夹，源视频不会改变。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="video-options-title">
        <div class="panel-heading"><h2 id="video-options-title">输出选项</h2><span>提取首条音轨 · 本机处理</span></div>
        <div class="setting-block"><div class="setting-title"><strong>音频格式</strong></div><div class="format-row video-formats"><label class="format-choice selected"><input type="radio" name="videoAudioFormat" value="mp3" checked /> MP3 <small>192 kbps · 文件较小</small></label><label class="format-choice"><input type="radio" name="videoAudioFormat" value="wav" /> WAV <small>PCM · 未压缩</small></label></div></div>
        <div class="manage-explain">输出采样率为 48 kHz。没有音轨的视频会显示失败原因，其余文件继续处理。</div>
        <button id="videoRun" class="convert-button" type="button" disabled>提取音频</button>
        <div id="videoStatus" class="photo-status" role="status" hidden></div>
        <div id="videoError" class="error" role="alert" hidden></div>
        <div id="videoResult" class="result" hidden><span class="result-check">✓</span><div><strong id="videoResultTitle"></strong><small id="videoResultPath"></small></div><button id="videoOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
