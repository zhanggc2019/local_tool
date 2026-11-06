/** Renders PDF page selection, rotation, deletion, and extraction controls. */
export function renderPDFPageView(): string {
  return `
    <div class="page-heading"><h1>PDF 页面管理</h1><p>旋转、删除或提取指定页面，源文件保持不变。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="page-source-title">
        <div class="panel-heading"><h2 id="page-source-title">PDF 文件</h2><span>单次处理一个 PDF</span></div>
        <button id="pagePick" class="manage-pick video-pick" type="button">选择 PDF</button>
        <div id="pageEmpty" class="video-empty"><span aria-hidden="true">▤</span><strong>尚未选择 PDF</strong><small>支持旋转、删除与提取页面</small></div>
        <div id="pageFile" class="video-file" hidden></div>
        <p class="audio-help">结果默认保存在原 PDF 所在文件夹，源文件不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="page-options-title">
        <div class="panel-heading"><h2 id="page-options-title">页面设置</h2><span>例如 1-3,5,偶数页</span></div>
        <div class="setting-block"><div class="setting-title"><strong>页码</strong></div>
          <input id="pageSelection" class="page-selection-input" type="text" placeholder="留空表示全部页面" autocomplete="off"/>
          <div class="page-quick-row">
            <button type="button" data-preset="全部">全部</button>
            <button type="button" data-preset="奇数页">奇数页</button>
            <button type="button" data-preset="偶数页">偶数页</button>
            <button type="button" data-preset="">清空</button>
          </div>
          <div id="pageHint" class="timecode-hint">旋转留空表示全部页面；删除与提取需要明确页码。</div>
        </div>
        <div class="setting-block"><div class="setting-title"><strong>旋转方向</strong><span>顺时针</span></div><div class="choice-row" id="pageAngles">
          <label class="choice selected"><input type="radio" name="pageAngle" value="90" checked/><span><b>90°</b><small></small></span></label>
          <label class="choice"><input type="radio" name="pageAngle" value="180"/><span><b>180°</b><small></small></span></label>
          <label class="choice"><input type="radio" name="pageAngle" value="270"/><span><b>270°</b><small></small></span></label>
        </div></div>
        <div class="page-action-row">
          <button id="pageRotate" class="convert-button" type="button" disabled>旋转所选页</button>
          <button id="pageDelete" class="page-secondary-button" type="button" disabled>删除所选页</button>
          <button id="pageExtract" class="page-secondary-button" type="button" disabled>提取所选页</button>
        </div>
        <div class="manage-explain">提取会为每一页生成单独的 PDF，保存在新文件夹中。删除全部页面会被拒绝。</div>
        <div id="pageStatus" class="photo-status" role="status" hidden></div>
        <div id="pageError" class="error" role="alert" hidden></div>
        <div id="pageResult" class="result" hidden><span class="result-check">✓</span><div><strong id="pageResultTitle"></strong><small id="pageResultPath"></small></div><button id="pageOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
