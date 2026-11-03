/** Returns the Windows port occupancy and process controls. */
export function renderPortCheckView(): string {
  return `
    <div class="page-heading"><h1>端口占用</h1><p>输入本机端口号，查看占用进程并按需结束它。</p></div>
    <div class="work-grid port-grid">
      <section class="settings-panel port-query-panel" aria-labelledby="port-query-title">
        <div class="panel-heading"><h2 id="port-query-title">查询端口</h2><span>仅支持 Windows</span></div>
        <label class="setting-title" for="portNumber"><strong>本地端口号</strong></label>
        <div class="port-input-row"><input id="portNumber" type="text" inputmode="numeric" maxlength="5" placeholder="例如 8080" autocomplete="off" aria-describedby="portRangeHint" /><button id="portSearch" class="convert-button" type="button">查询占用</button></div>
        <p id="portRangeHint" class="port-hint">支持 1–65535，查询 TCP 和 UDP 的本地端口。</p>
        <div id="portStatus" class="photo-status" role="status" hidden></div>
        <div id="portError" class="error" role="alert" hidden></div>
        <div id="portSuccess" class="result port-success" role="status" hidden></div>
      </section>
      <section class="source-panel port-result-panel" aria-labelledby="port-result-title">
        <div class="panel-heading"><h2 id="port-result-title">占用进程</h2><span id="portResultCount">等待查询</span></div>
        <div id="portEmpty" class="port-empty"><span aria-hidden="true">◎</span><strong>输入端口后查询</strong><small>显示进程名称、PID、程序路径和本地连接</small></div>
        <div id="portOwners" class="port-owner-list" aria-live="polite"></div>
        <p class="port-hint port-danger-note">“结束进程”会立即关闭该程序，未保存的内容可能丢失。系统关键进程和当前工具箱不可结束。</p>
      </section>
    </div>`;
}
