/** Renders the PDF text extraction picker, preview, and save controls. */
export function renderPDFTextView(): string {
  return `
    <div class="page-heading"><h1>PDF 提取文本</h1><p>导出 PDF 的文本层为 TXT；扫描件没有文本层，需要 OCR。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="text-source-title">
        <div class="panel-heading"><h2 id="text-source-title">PDF 文件</h2><span>1–500 页 · 100 MB</span></div>
        <button id="textPick" class="manage-pick video-pick" type="button">选择 PDF</button>
        <div id="textEmpty" class="video-empty"><span aria-hidden="true">▤</span><strong>尚未选择 PDF</strong><small>文本仅在本机解析</small></div>
        <div id="textFile" class="video-file" hidden></div>
        <p class="audio-help">保存位置为原 PDF 所在文件夹，命名为“原文件名_文本.txt”。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="text-options-title">
        <div class="panel-heading"><h2 id="text-options-title">提取结果</h2><span>UTF-8 · 带 BOM</span></div>
        <div class="text-stats" id="textStats" hidden><span id="textStatsPages"></span><span id="textStatsChars"></span></div>
        <textarea id="textPreview" class="text-preview" readonly placeholder="提取后在此预览文本…" hidden></textarea>
        <div class="text-actions">
          <button id="textRun" class="convert-button" type="button" disabled>提取文本</button>
          <button id="textSave" class="page-secondary-button" type="button" disabled>保存 TXT</button>
        </div>
        <div id="textProgressHint" class="timecode-hint">提取后先预览，再决定是否保存。</div>
        <div id="textStatus" class="photo-status" role="status" hidden></div>
        <div id="textError" class="error" role="alert" hidden></div>
        <div id="textResult" class="result" hidden><span class="result-check">✓</span><div><strong id="textResultTitle"></strong><small id="textResultPath"></small></div><button id="textOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
