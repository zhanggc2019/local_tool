/** Renders the PDF password protection tool with separate encrypt/decrypt blocks. */
export function renderPDFCryptoView(): string {
  return `
    <div class="page-heading"><h1>PDF 加密 / 解密</h1><p>为 PDF 设置打开密码与权限，或解除已有密码。</p></div>
    <div class="work-grid video-grid">
      <section class="source-panel video-source-panel" aria-labelledby="crypto-source-title">
        <div class="panel-heading"><h2 id="crypto-source-title">PDF 文件</h2><span>单次处理一个 PDF</span></div>
        <button id="cryptoPick" class="manage-pick video-pick" type="button">选择 PDF</button>
        <div id="cryptoEmpty" class="video-empty"><span aria-hidden="true">▩</span><strong>尚未选择 PDF</strong><small>加密文件会显示“已加密”标记</small></div>
        <div id="cryptoFile" class="video-file" hidden></div>
        <p class="audio-help">结果保存在原 PDF 所在文件夹，源文件不会修改。</p>
      </section>
      <section class="settings-panel video-options-panel" aria-labelledby="crypto-options-title">
        <div class="panel-heading"><h2 id="crypto-options-title">密码设置</h2><span>AES-256</span></div>
        <div class="setting-block"><div class="setting-title"><strong>加密</strong><span>设置打开密码</span></div>
          <div class="crypto-fields">
            <label class="timecode-field">打开密码（4–64 字符）<input id="cryptoUser" type="password" autocomplete="new-password"/></label>
            <label class="timecode-field">所有者密码（可留空）<input id="cryptoOwner" type="password" autocomplete="new-password"/></label>
          </div>
          <div class="crypto-checks">
            <label class="batch-toggle"><input id="cryptoAllowPrint" type="checkbox" checked /> 允许打印</label>
            <label class="batch-toggle"><input id="cryptoAllowCopy" type="checkbox" checked /> 允许复制文本</label>
          </div>
          <button id="cryptoEncrypt" class="convert-button" type="button" disabled>加密并保存</button>
        </div>
        <div class="setting-block crypto-decrypt-block"><div class="setting-title"><strong>解密</strong><span>移除已有密码</span></div>
          <label class="timecode-field">当前密码<input id="cryptoPassword" type="password" autocomplete="current-password"/></label>
          <button id="cryptoDecrypt" class="page-secondary-button crypto-button" type="button" disabled>解密并保存</button>
        </div>
        <div id="cryptoHint" class="timecode-hint">加密与解密都要求输入密码；已加密的 PDF 需先解密才能重新加密。</div>
        <div id="cryptoStatus" class="photo-status" role="status" hidden></div>
        <div id="cryptoError" class="error" role="alert" hidden></div>
        <div id="cryptoResult" class="result" hidden><span class="result-check">✓</span><div><strong id="cryptoResultTitle"></strong><small id="cryptoResultPath"></small></div><button id="cryptoOpenFolder" type="button">打开文件夹</button></div>
      </section>
    </div>`;
}
