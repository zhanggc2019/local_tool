import { FRAME_COUNTS, FRAME_MODES } from './options';

/** Renders the frame capture picker, mode, and count options. */
export function renderVideoFrameView(): string {
  const modeChoices = FRAME_MODES.map((mode, index) => `
    <label class="mode-choice ${index === 0 ? 'selected' : ''}">
      <input type="radio" name="frameMode" value="${mode.value}" ${index === 0 ? 'checked' : ''}/>
      <span class="radio-indicator"></span>
      <span class="mode-copy"><b>${mode.label}</b><small>${mode.hint}</small></span>
    </label>`).join('');
  const countChoices = FRAME_COUNTS.map((count, index) => `
    <label class="choice ${index === 1 ? 'selected' : ''}"><input type="radio" name="frameCount" value="${count}" ${index === 1 ? 'checked' : ''}/><span><b>${count} 张</b><small>均分</small></span></label>`).join('');
  return `
    <div class="page-heading"><h1>视频截图</h1><p>截取指定时间点的画面，或把整段视频均分成多张截图。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="frame-source-title">
        <div class="panel-heading"><h2 id="frame-source-title">视频文件</h2><span>MP4 / MOV / MKV / AVI / WebM 等</span></div>
        <button id="framePick" class="manage-pick video-pick" type="button">选择视频</button>
        <div id="frameEmpty" class="video-empty"><span aria-hidden="true">◨</span><strong>尚未选择视频</strong><small>一次处理一个视频</small></div>
        <div id="frameFile" class="video-file" hidden></div>
        <p class="audio-help">截图默认保存在原视频所在文件夹，源视频不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="frame-options-title">
        <div class="panel-heading"><h2 id="frame-options-title">截图设置</h2><span>输出 JPG</span></div>
        <div class="setting-block"><div class="setting-title"><strong>截图方式</strong></div><div class="mode-list" id="frameModes">${modeChoices}</div></div>
        <div class="setting-block" id="frameTimeBlock"><div class="setting-title"><strong>截图时间</strong></div>
          <div class="timecode-row">
            <label class="timecode-field">时间点<input id="frameTime" type="text" inputmode="numeric" placeholder="1:30" autocomplete="off"/></label>
          </div>
          <div id="frameHint" class="timecode-hint">时间格式：90（秒）或 1:30</div>
        </div>
        <div class="setting-block" id="frameCountBlock" hidden><div class="setting-title"><strong>截图数量</strong></div><div class="choice-row" id="frameCounts">${countChoices}</div></div>
        <div class="manage-explain">均分模式自动避开片头片尾；截图按 1、2、3 编号保存。</div>
        <button id="frameRun" class="convert-button" type="button" disabled>开始截图</button>
        <div id="frameStatus" class="photo-status" role="status" hidden></div>
        <div id="frameError" class="error" role="alert" hidden></div>
        <div id="frameResult" class="result" hidden><span class="result-check">✓</span><div><strong id="frameResultTitle"></strong><small id="frameResultPath"></small></div><button id="frameOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
