/** Renders the video trim picker, time range, and strategy options. */
export function renderVideoTrimView(): string {
  return `
    <div class="page-heading"><h1>视频剪辑</h1><p>保留指定起止时间内的片段，支持无损快剪与精确剪辑。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="trim-source-title">
        <div class="panel-heading"><h2 id="trim-source-title">视频文件</h2><span>MP4 / MOV / MKV / AVI / WebM 等</span></div>
        <label class="batch-toggle"><input id="trimBatch" type="checkbox" /> 批量模式（最多 50 个）</label>
        <button id="trimPick" class="manage-pick video-pick" type="button">选择视频</button>
        <div id="trimEmpty" class="video-empty"><span aria-hidden="true">◧</span><strong>尚未选择视频</strong><small>起止时间会应用到全部所选视频</small></div>
        <ol id="trimFiles" class="video-file-list" aria-label="待剪辑视频" hidden></ol>
        <p class="audio-help">剪辑结果默认保存在原视频所在文件夹，源视频不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="trim-options-title">
        <div class="panel-heading"><h2 id="trim-options-title">剪辑设置</h2><span>时间格式：90（秒）或 1:30</span></div>
        <div class="setting-block"><div class="setting-title"><strong>起止时间</strong></div>
          <div class="timecode-row">
            <label class="timecode-field">开始<input id="trimStart" type="text" inputmode="numeric" placeholder="0" autocomplete="off"/></label>
            <label class="timecode-field">结束<input id="trimEnd" type="text" inputmode="numeric" placeholder="1:30" autocomplete="off"/></label>
          </div>
          <div id="trimHint" class="timecode-hint"></div>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>剪辑方式</strong></div><div class="mode-list" id="trimModes">
          <label class="mode-choice selected"><input type="radio" name="trimMode" value="fast" checked/><span class="radio-indicator"></span><span class="mode-copy"><b>快速剪辑</b><small>无损不重编码 · 按关键帧对齐</small></span></label>
          <label class="mode-choice"><input type="radio" name="trimMode" value="precise"/><span class="radio-indicator"></span><span class="mode-copy"><b>精确剪辑</b><small>重新编码 · 帧级准确</small></span></label>
        </div></div>
        <div class="manage-explain">快速剪辑从关键帧对齐，起止可能偏移几秒；精确剪辑转为 H.264 MP4，耗时更长。结束时间超出视频时长的视频会失败，其余继续。</div>
        <button id="trimRun" class="convert-button" type="button" disabled>开始剪辑</button>
        <div id="trimStatus" class="photo-status" role="status" hidden></div>
        <div id="trimError" class="error" role="alert" hidden></div>
        <div id="trimResult" class="result" hidden><span class="result-check">✓</span><div><strong id="trimResultTitle"></strong><small id="trimResultPath"></small></div><button id="trimOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
