/** Renders compact local denoising controls and before/after audio players. */
export function renderAudioDenoiseView(): string {
  return `
    <div class="page-heading"><h1>音频降噪</h1><p>使用 DeepFilterNet3 在本机 CPU 上处理人声录音，试听原音与结果。</p></div>
    <div class="work-grid audio-grid">
      <section class="source-panel audio-source-panel" aria-labelledby="audio-source-title">
        <div class="panel-heading"><h2 id="audio-source-title">音频文件</h2><span>WAV / MP3 / M4A · 最多 40 MB</span></div>
        <div class="audio-file-row"><div class="audio-file-copy"><strong id="audioFileName">尚未选择音频</strong><small id="audioFileMeta">选择一段人声录音，最长 10 分钟</small></div><button id="audioPick" class="manage-pick" type="button">选择音频</button></div>
        <div class="audio-player-block"><div class="audio-player-heading"><strong>降噪前</strong><span>原始音频</span></div><audio id="audioOriginal" controls preload="metadata" aria-label="试听原始音频"></audio></div>
        <div id="audioOriginalParams" class="audio-params" aria-label="降噪前音频参数"><span>选择文件后显示音频参数</span></div>
        <p class="audio-help">适合风声、空调声、环境底噪等人声录音。音乐和多人同时说话时请试听后判断效果。</p>
      </section>
      <section class="settings-panel audio-result-panel" aria-labelledby="audio-result-title">
        <div class="panel-heading"><h2 id="audio-result-title">降噪与试听</h2><span>离线处理 · 48 kHz</span></div>
        <div class="setting-block audio-strength-block"><div class="setting-title"><strong>降噪强度</strong><span id="audioStrengthValue">50 / 100</span></div><input id="audioStrength" type="range" min="0" max="100" step="1" value="50" aria-label="降噪强度" /><div class="audio-strength-ends"><span>轻微</span><span>强力</span></div><div class="audio-presets" aria-label="按录音场景选择强度"><button type="button" data-strength="20">安静室内 <small>20</small></button><button type="button" data-strength="50" class="selected">办公室 <small>50</small></button><button type="button" data-strength="75">户外街道 <small>75</small></button><button type="button" data-strength="95">强风噪声 <small>95</small></button></div><p id="audioStrengthHint" class="audio-help">压低持续性环境杂音；数值是试听起点，可按录音调整。</p></div>
        <div class="setting-block audio-format-block"><div class="setting-title"><strong>输出格式</strong></div><div class="format-row audio-format-choices"><label class="format-choice selected"><input type="radio" name="audioFormat" value="wav" checked /> WAV <small>未压缩</small></label><label class="format-choice"><input type="radio" name="audioFormat" value="mp3" /> MP3 <small>192 kbps</small></label></div></div>
        <button id="audioRun" class="convert-button" type="button" disabled>开始降噪</button>
        <div id="audioStatus" class="photo-status" role="status" hidden></div>
        <div id="audioError" class="error" role="alert" hidden></div>
        <div class="audio-player-block audio-after"><div class="audio-player-heading"><strong>降噪后</strong><span id="audioResultLabel">等待处理</span></div><audio id="audioProcessed" controls preload="metadata" aria-label="试听降噪音频"></audio></div>
        <div id="audioProcessedParams" class="audio-params" aria-label="降噪后音频参数"><span>处理完成后显示音频参数</span></div>
        <div id="audioResult" class="result" hidden><span class="result-check">✓</span><div><strong>降噪完成</strong><small id="audioResultPath"></small></div><button id="audioOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
