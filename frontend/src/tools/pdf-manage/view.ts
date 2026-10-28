/** Returns the PDF merge, split, and compression workspace. */
export function renderPDFManageView(): string {
  return `
    <div class="page-heading"><h1>PDF 合并/拆分/压缩</h1><p>选择操作，处理本机 PDF 并保存结果。</p></div>
    <div class="manage-tabs" role="tablist" aria-label="PDF 操作">
      <button class="manage-tab active" type="button" data-mode="merge" role="tab" aria-selected="true">合并 PDF</button>
      <button class="manage-tab" type="button" data-mode="split" role="tab" aria-selected="false">拆分 PDF</button>
      <button class="manage-tab" type="button" data-mode="compress" role="tab" aria-selected="false">压缩 PDF</button>
    </div>
    <div class="work-grid manage-grid">
      <section class="source-panel" aria-labelledby="manage-source-title">
        <div class="panel-heading"><h2 id="manage-source-title">PDF 文件</h2><span id="manageSourceHint">选择至少两个 PDF</span></div>
        <div class="manage-source">
          <div class="empty-state" id="manageEmpty"><span class="pdf-icon" aria-hidden="true">PDF</span><strong>选择 PDF 文件</strong><p>文件只在本机处理</p></div>
          <ol class="manage-file-list" id="manageFiles" hidden></ol>
        </div>
        <button class="manage-pick" id="managePick" type="button">选择 PDF 文件</button>
        <p class="source-tip" id="manageSourceTip">合并时可调整文件顺序。</p>
      </section>
      <section class="settings-panel manage-settings" aria-labelledby="manage-settings-title">
        <div class="panel-heading"><h2 id="manage-settings-title">处理选项</h2></div>
        <div class="manage-explain" id="manageExplain">按左侧顺序将所有 PDF 合并为一个文件。</div>
        <div class="setting-block" id="manageSplitSettings" hidden><div class="setting-title"><strong>每份页数</strong><span>至少 1 页</span></div><input id="manageSpan" class="manage-number" type="number" min="1" value="1" /><p class="manage-hint">设为 1 时逐页拆分；设为 2 时每两页保存一份。</p></div>
        <div class="manage-hint" id="manageCompressHint" hidden>压缩会优化 PDF 内部结构和重复资源。图片较多或已经优化的文件可能不会明显变小。</div>
        <button id="manageRun" class="convert-button" type="button" disabled>合并并保存</button>
        <div class="status-space"><div class="photo-status" id="manageStatus" role="status" hidden></div><div class="result" id="manageResult" hidden><span class="result-check">✓</span><div><strong id="manageResultTitle"></strong><small id="manageResultPath"></small></div><button id="manageOpenFolder" type="button">打开文件夹</button></div><div class="error" id="manageError" role="alert" hidden></div></div>
      </section>
    </div>`;
}
