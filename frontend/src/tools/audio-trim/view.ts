/** Renders the audio trim tool with time range and strategy options. */
export function renderAudioTrimView(): string {
  return `
    <div class="page-heading"><h1>音频剪辑</h1><p>保留指定起止时间内的音频片段，支持快速复制与精确重编码。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="atrim-source-title">
        <div class="panel-heading"><h2 id="atrim-source-title">音频文件</h2><span>MP3 / WAV / M4A / AAC / FLAC / OGG</span></div>
        <label class="batch-toggle"><input id="atrimBatch" type="checkbox" /> 批量模式（最多 50 个）</label>
        <button id="atrimPick" class="manage-pick video-pick" type="button">选择音频</button>
        <div id="atrimEmpty" class="video-empty"><span aria-hidden="true">♬</span><strong>尚未选择音频</strong><small>起止时间应用到全部所选音频</small></div>
        <ol id="atrimFiles" class="video-file-list" aria-label="待剪辑音频" hidden></ol>
        <p class="audio-help">结果默认保存在原音频所在文件夹，命名为“原文件名_剪辑”，源文件不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="atrim-options-title">
        <div class="panel-heading"><h2 id="atrim-options-title">剪辑设置</h2><span>时间格式：90（秒）或 1:30</span></div>
        <div class="setting-block"><div class="setting-title"><strong>起止时间</strong></div>
          <div class="timecode-row">
            <label class="timecode-field">开始<input id="atrimStart" type="text" inputmode="numeric" placeholder="0" autocomplete="off"/></label>
            <label class="timecode-field">结束<input id="atrimEnd" type="text" inputmode="numeric" placeholder="1:30" autocomplete="off"/></label>
          </div>
          <div id="atrimHint" class="timecode-hint"></div>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>剪辑方式</strong></div><div class="mode-list" id="atrimModes">
          <label class="mode-choice selected"><input type="radio" name="atrimMode" value="fast" checked/><span class="radio-indicator"></span><span class="mode-copy"><b>快速剪辑</b><small>直接复制 · 保持原格式</small></span></label>
          <label class="mode-choice"><input type="radio" name="atrimMode" value="precise"/><span class="radio-indicator"></span><span class="mode-copy"><b>精确剪辑</b><small>重新编码为 MP3 192 kbps</small></span></label>
        </div></div>
        <div class="manage-explain">快速剪辑不重新编码、速度最快；精确剪辑对 MP3/WAV 等格式统一转为 MP3。结束时间超出音频时长的文件会失败，其余继续。</div>
        <button id="atrimRun" class="convert-button" type="button" disabled>开始剪辑</button>
        <div id="atrimStatus" class="photo-status" role="status" hidden></div>
        <div id="atrimError" class="error" role="alert" hidden></div>
        <div id="atrimResult" class="result" hidden><span class="result-check">✓</span><div><strong id="atrimResultTitle"></strong><small id="atrimResultPath"></small></div><button id="atrimOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
