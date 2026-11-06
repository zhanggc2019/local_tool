/** Renders the video metadata inspector with a definition grid. */
export function renderVideoInfoView(): string {
  return `
    <div class="page-heading"><h1>视频信息</h1><p>查看视频的容器、编码、分辨率、码率与音轨参数。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="info-source-title">
        <div class="panel-heading"><h2 id="info-source-title">视频文件</h2><span>MP4 / MOV / MKV / AVI / WebM 等</span></div>
        <button id="infoPick" class="manage-pick video-pick" type="button">选择视频</button>
        <div id="infoEmpty" class="video-empty"><span aria-hidden="true">◎</span><strong>尚未选择视频</strong><small>读取在本机完成，不会上传文件</small></div>
        <div id="infoFile" class="video-file" hidden></div>
        <p class="audio-help">信息来自随应用打包的 FFmpeg 探测结果。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="info-options-title">
        <div class="panel-heading"><h2 id="info-options-title">媒体信息</h2><span>只读</span></div>
        <dl id="infoGrid" class="info-grid" hidden>
          <div><dt>容器</dt><dd id="infoContainer">—</dd></div>
          <div><dt>时长</dt><dd id="infoDuration">—</dd></div>
          <div><dt>文件大小</dt><dd id="infoSize">—</dd></div>
          <div><dt>总码率</dt><dd id="infoBitrate">—</dd></div>
          <div><dt>视频编码</dt><dd id="infoVideoCodec">—</dd></div>
          <div><dt>分辨率</dt><dd id="infoResolution">—</dd></div>
          <div><dt>帧率</dt><dd id="infoFPS">—</dd></div>
          <div><dt>视频码率</dt><dd id="infoVideoBitrate">—</dd></div>
          <div><dt>音频编码</dt><dd id="infoAudioCodec">—</dd></div>
          <div><dt>采样率</dt><dd id="infoSampleRate">—</dd></div>
          <div><dt>声道</dt><dd id="infoChannels">—</dd></div>
          <div><dt>音频码率</dt><dd id="infoAudioBitrate">—</dd></div>
        </dl>
        <div id="infoHint" class="manage-explain">选择视频后显示完整信息。</div>
        <div id="infoStatus" class="photo-status" role="status" hidden></div>
        <div id="infoError" class="error" role="alert" hidden></div>
      </section>
    </div>`;
}
