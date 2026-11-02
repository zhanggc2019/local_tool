/** Returns the offline URL QR code generator workspace. */
export function renderQRCodeView(): string {
  return `
    <div class="page-heading"><h1>网址二维码</h1><p>输入网址，生成可扫码的二维码并保存为 PNG。</p></div>
    <div class="work-grid qr-grid">
      <section class="settings-panel qr-settings" aria-labelledby="qr-settings-title">
        <div class="panel-heading"><h2 id="qr-settings-title">二维码内容</h2><span>仅支持 HTTP / HTTPS</span></div>
        <div class="setting-block"><label class="setting-title" for="qrURL"><strong>在线网址</strong></label><input id="qrURL" class="qr-url-input" type="url" inputmode="url" placeholder="https://example.com" maxlength="1200" autocomplete="url" spellcheck="false" /><p class="qr-help">省略协议时自动使用 HTTPS；网址只写入二维码，不会发起访问。</p></div>
        <div class="setting-block"><div class="setting-title"><strong>图片尺寸</strong><span>PNG 像素</span></div><div class="choice-row qr-size-choices"><label class="choice"><input type="radio" name="qrSize" value="512" /><span><b>512</b><small>日常分享</small></span></label><label class="choice selected"><input type="radio" name="qrSize" value="1024" checked /><span><b>1024</b><small>推荐</small></span></label><label class="choice"><input type="radio" name="qrSize" value="2048" /><span><b>2048</b><small>高清印刷</small></span></label></div></div>
        <div class="qr-help qr-spec">黑色码点与白色留白，适合屏幕展示和打印。保存后建议用手机扫码核对网址。</div>
        <button id="qrGenerate" class="convert-button" type="button">生成二维码</button>
        <div class="status-space"><div id="qrError" class="error" role="alert" hidden></div></div>
      </section>
      <section class="source-panel qr-preview-panel" aria-labelledby="qr-preview-title">
        <div class="panel-heading"><h2 id="qr-preview-title">预览</h2><span id="qrPreviewSize">1024 × 1024 PNG</span></div>
        <div class="qr-preview-stage"><div class="qr-empty" id="qrEmpty"><span aria-hidden="true">▦</span><strong>等待生成</strong><small>输入网址后点击“生成二维码”</small></div><canvas id="qrCanvas" aria-label="生成的二维码" hidden></canvas></div>
        <div class="qr-preview-footer"><small id="qrEncodedURL" title="二维码编码的网址">网址将显示在这里</small><button id="qrSave" class="convert-button" type="button" disabled>保存 PNG</button></div>
        <div class="status-space"><div class="result" id="qrResult" hidden><span class="result-check">✓</span><div><strong>二维码已保存</strong><small id="qrResultPath"></small></div><button id="qrOpenFolder" type="button">打开文件夹</button></div><div id="qrSaveError" class="error" role="alert" hidden></div></div>
      </section>
    </div>`;
}
