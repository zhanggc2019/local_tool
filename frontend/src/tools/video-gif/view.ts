import { GIF_FPS, GIF_WIDTHS } from './options';

/** Renders the GIF picker, segment inputs, and export options. */
export function renderVideoGIFView(): string {
  const widthChoices = GIF_WIDTHS.map((choice, index) => `
    <label class="choice ${index === 1 ? 'selected' : ''}"><input type="radio" name="gifWidth" value="${choice.value}" ${index === 1 ? 'checked' : ''}/><span><b>${choice.label}</b><small>px</small></span></label>`).join('');
  const fpsChoices = GIF_FPS.map((choice, index) => `
    <label class="choice ${index === 1 ? 'selected' : ''}"><input type="radio" name="gifFps" value="${choice.value}" ${index === 1 ? 'checked' : ''}/><span><b>${choice.label}</b><small>fps</small></span></label>`).join('');
  return `
    <div class="page-heading"><h1>GIF 制作</h1><p>截取视频片段生成高质量调色板 GIF，最长 60 秒。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="gif-source-title">
        <div class="panel-heading"><h2 id="gif-source-title">视频文件</h2><span>MP4 / MOV / MKV / AVI / WebM 等</span></div>
        <button id="gifPick" class="manage-pick video-pick" type="button">选择视频</button>
        <div id="gifEmpty" class="video-empty"><span aria-hidden="true">◍</span><strong>尚未选择视频</strong><small>一次转换一个视频</small></div>
        <div id="gifFile" class="video-file" hidden></div>
        <p class="audio-help">GIF 默认保存在原视频所在文件夹，源视频不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="gif-options-title">
        <div class="panel-heading"><h2 id="gif-options-title">导出设置</h2><span>时间格式：90（秒）或 1:30</span></div>
        <div class="setting-block"><div class="setting-title"><strong>片段起止</strong></div>
          <div class="timecode-row">
            <label class="timecode-field">开始<input id="gifStart" type="text" inputmode="numeric" placeholder="0" autocomplete="off"/></label>
            <label class="timecode-field">结束<input id="gifEnd" type="text" inputmode="numeric" placeholder="1:30" autocomplete="off"/></label>
          </div>
          <div id="gifHint" class="timecode-hint"></div>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>画面宽度</strong></div><div class="choice-row" id="gifWidths">${widthChoices}</div></div>
        <div class="setting-block"><div class="setting-title"><strong>帧率</strong></div><div class="choice-row" id="gifFpsList">${fpsChoices}</div></div>
        <div class="manage-explain">使用调色板优化色彩；片段越长、宽度与帧率越高，GIF 体积越大，最长 60 秒。</div>
        <button id="gifRun" class="convert-button" type="button" disabled>生成 GIF</button>
        <div id="gifStatus" class="photo-status" role="status" hidden></div>
        <div id="gifError" class="error" role="alert" hidden></div>
        <div id="gifResult" class="result" hidden><span class="result-check">✓</span><div><strong id="gifResultTitle"></strong><small id="gifResultPath"></small></div><button id="gifOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
