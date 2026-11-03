import { PortService, type PortOwner } from '../../../bindings/example.com/pdf-desktop';

let busy = false;
let activePort = 0;

/** Returns a required port-tool element. */
function portElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少端口工具界面元素：${id}`);
  return node as T;
}

/** Converts native errors into readable Chinese text. */
function portErrorText(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : '操作失败，请重试';
}

/** Validates the requested port before calling Windows. */
function readPort(): number {
  const value = portElement<HTMLInputElement>('portNumber').value.trim();
  if (!/^\d{1,5}$/.test(value)) throw new Error('请输入 1 到 65535 之间的端口号');
  const port = Number(value);
  if (port < 1 || port > 65535) throw new Error('端口号必须在 1 到 65535 之间');
  return port;
}

/** Shows an operation error without using untrusted HTML. */
function showPortError(error: unknown): void {
  const box = portElement<HTMLDivElement>('portError');
  box.textContent = portErrorText(error);
  box.hidden = false;
}

/** Updates busy controls while a Windows call is running. */
function setPortBusy(value: boolean, message = ''): void {
  busy = value;
  portElement<HTMLInputElement>('portNumber').disabled = value;
  portElement<HTMLButtonElement>('portSearch').disabled = value;
  const status = portElement<HTMLDivElement>('portStatus');
  status.textContent = message;
  status.hidden = !message;
  portElement<HTMLDivElement>('portOwners').querySelectorAll<HTMLButtonElement>('button').forEach((button) => { button.disabled = value || activePort === 0 || button.dataset.allowed !== 'true'; });
}

/** Builds one process card with its bindings and termination action. */
function ownerCard(owner: PortOwner): HTMLElement {
  const card = document.createElement('article');
  card.className = 'port-owner';
  const header = document.createElement('div');
  header.className = 'port-owner-head';
  const identity = document.createElement('div');
  identity.className = 'port-owner-identity';
  const name = document.createElement('strong');
  name.textContent = owner.name;
  const pid = document.createElement('span');
  pid.textContent = `PID ${owner.pid}`;
  identity.append(name, pid);
  const kill = document.createElement('button');
  kill.type = 'button';
  kill.className = 'port-kill';
  kill.textContent = '结束进程';
  kill.dataset.allowed = String(owner.canTerminate);
  kill.title = owner.canTerminate ? `结束 ${owner.name}` : owner.reason;
  kill.disabled = !owner.canTerminate || busy;
  if (owner.canTerminate) kill.addEventListener('click', () => void terminateOwner(owner));
  header.append(identity, kill);
  card.append(header);
  const path = document.createElement('small');
  path.className = 'port-process-path';
  path.textContent = owner.path || owner.reason;
  path.title = owner.path || owner.reason;
  card.append(path);
  if (!owner.canTerminate && owner.path) {
    const reason = document.createElement('small');
    reason.className = 'port-blocked';
    reason.textContent = owner.reason;
    card.append(reason);
  }
  const endpoints = document.createElement('div');
  endpoints.className = 'port-endpoints';
  for (const endpoint of owner.endpoints ?? []) {
    const badge = document.createElement('span');
    badge.textContent = `${endpoint.protocol} · ${endpoint.local}${endpoint.state ? ` · ${endpoint.state}` : ''}`;
    endpoints.append(badge);
  }
  card.append(endpoints);
  return card;
}

/** Replaces the result list after every query or termination. */
function renderOwners(owners: PortOwner[], port: number): void {
  const list = portElement<HTMLDivElement>('portOwners');
  list.replaceChildren(...owners.map(ownerCard));
  portElement<HTMLElement>('portResultCount').textContent = `端口 ${port} · ${owners.length} 个进程`;
  const empty = portElement<HTMLDivElement>('portEmpty');
  empty.hidden = owners.length > 0;
  empty.querySelector('strong')!.textContent = owners.length ? '' : '未发现占用进程';
  empty.querySelector('small')!.textContent = owners.length ? '' : '该本地端口当前没有 TCP/UDP 占用记录';
}

/** Queries live Windows port bindings and displays process identities. */
async function queryPort(): Promise<void> {
  if (busy) return;
  portElement<HTMLDivElement>('portError').hidden = true;
  portElement<HTMLDivElement>('portSuccess').hidden = true;
  let port: number;
  try { port = readPort(); }
  catch (error) { showPortError(error); return; }
  activePort = 0;
  portElement<HTMLDivElement>('portOwners').replaceChildren();
  portElement<HTMLElement>('portResultCount').textContent = '正在查询';
  portElement<HTMLDivElement>('portEmpty').hidden = true;
  setPortBusy(true, '正在查询本机端口…');
  try {
    const owners = await PortService.QueryPort(port);
    activePort = port;
    renderOwners(owners ?? [], port);
  } catch (error) { showPortError(error); portElement<HTMLElement>('portResultCount').textContent = '查询失败'; const empty = portElement<HTMLDivElement>('portEmpty'); empty.hidden = false; empty.querySelector('strong')!.textContent = '查询失败'; empty.querySelector('small')!.textContent = '请检查端口后重试'; }
  finally { setPortBusy(false); }
}

/** Ends one still-matching process and refreshes the current port. */
async function terminateOwner(owner: PortOwner): Promise<void> {
  if (busy || !activePort || !owner.canTerminate) return;
  portElement<HTMLDivElement>('portError').hidden = true;
  portElement<HTMLDivElement>('portSuccess').hidden = true;
  setPortBusy(true, `正在结束 ${owner.name}（PID ${owner.pid}）…`);
  try {
    await PortService.KillPortProcess(activePort, owner.pid, owner.started);
    const success = portElement<HTMLDivElement>('portSuccess');
    success.textContent = `已结束 ${owner.name}（PID ${owner.pid}）`;
    success.hidden = false;
    try { renderOwners((await PortService.QueryPort(activePort)) ?? [], activePort); }
    catch (error) { activePort = 0; showPortError(`进程已结束，但刷新端口失败：${portErrorText(error)}`); }
  } catch (error) { activePort = 0; showPortError(error); }
  finally { setPortBusy(false); }
}

/** Connects query, enter-key, and stale-result invalidation controls. */
export function setupPortCheckTool(): void {
  const input = portElement<HTMLInputElement>('portNumber');
  input.addEventListener('input', () => {
    activePort = 0;
    portElement<HTMLDivElement>('portOwners').replaceChildren();
    portElement<HTMLElement>('portResultCount').textContent = '等待查询';
    portElement<HTMLDivElement>('portEmpty').hidden = false;
    portElement<HTMLDivElement>('portEmpty').querySelector('strong')!.textContent = '输入端口后查询';
    portElement<HTMLDivElement>('portEmpty').querySelector('small')!.textContent = '显示进程名称、PID、程序路径和本地连接';
    portElement<HTMLDivElement>('portError').hidden = true;
    portElement<HTMLDivElement>('portSuccess').hidden = true;
  });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') void queryPort(); });
  portElement<HTMLButtonElement>('portSearch').addEventListener('click', () => void queryPort());
}
