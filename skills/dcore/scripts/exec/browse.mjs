// dcore-browse — real browser execution with evidence, dependency-free.
// Launches an installed Chromium-family browser (Chrome / Edge / Chromium / Brave, or $DCORE_BROWSER) headless with a
// throwaway profile and drives it over the Chrome DevTools Protocol using Node's built-in WebSocket. Every step is
// executed for real; results come from the live page. If no browser is available the run is BLOCKED (never PASS).
// Secrets: typed values come from env vars (`valueEnv`) and are redacted everywhere; password-field values are never
// recorded; inspection never captures input values. confirm() dialogs are dismissed unless a step accepts them.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { report, check, redact } from './evidence.mjs';

// ---- browser discovery ---------------------------------------------------------------------------------------
export function browserCandidates(platform = process.platform, env = process.env) {
  const c = [];
  if (env.DCORE_BROWSER) c.push(env.DCORE_BROWSER);
  if (platform === 'win32') {
    for (const base of [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean)) {
      c.push(join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), join(base, 'Chromium', 'Application', 'chrome.exe'), join(base, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'));
    }
  } else if (platform === 'darwin') {
    c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', join(homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'));
  } else {
    for (const d of ['/usr/bin', '/usr/local/bin', '/snap/bin', '/opt/google/chrome']) for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser', 'chrome']) c.push(join(d, n));
  }
  return c;
}
export function findBrowser(platform, env) { return browserCandidates(platform, env).find((p) => p && existsSync(p)) ?? null; }

// ---- minimal CDP client (flattened sessions over one WebSocket) ----------------------------------------------
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []; ws.addEventListener('message', (ev) => this.#onMessage(ev)); }
  static connect(url, timeoutMs = 10_000) {
    return new Promise((ok, fail) => {
      if (typeof WebSocket === 'undefined') { fail(new Error('this Node.js has no global WebSocket (need Node >= 22)')); return; }
      const ws = new WebSocket(url);
      const t = setTimeout(() => fail(new Error('CDP connect timeout')), timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(t); ok(new CDP(ws)); });
      ws.addEventListener('error', () => { clearTimeout(t); fail(new Error('CDP connect error')); });
    });
  }
  #onMessage(ev) {
    let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString()); } catch { return; }
    if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.fail(new Error(`${p.method}: ${m.error.message}`)) : p.ok(m.result); return; }
    if (m.method) for (const h of this.handlers) h(m);
  }
  send(method, params = {}, sessionId, timeoutMs = 30_000) {
    const id = ++this.id;
    return new Promise((ok, fail) => {
      const t = setTimeout(() => { this.pending.delete(id); fail(new Error(`${method}: CDP timeout`)); }, timeoutMs);
      this.pending.set(id, { method, ok: (r) => { clearTimeout(t); ok(r); }, fail: (e) => { clearTimeout(t); fail(e); } });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(fn) { this.handlers.push(fn); }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

function launch(exe, { userDir, headed, timeoutMs = 20_000 }) {
  return new Promise((ok, fail) => {
    const args = ['--remote-debugging-port=0', `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-background-networking', '--disable-default-apps', '--disable-component-update', '--mute-audio', '--window-size=1366,900', ...(headed ? [] : ['--headless=new']), 'about:blank'];
    let proc;
    try { proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }); } catch (e) { fail(e); return; }
    let buf = '';
    const t = setTimeout(() => fail(new Error('browser did not expose a DevTools endpoint in time')), timeoutMs);
    proc.on('error', (e) => { clearTimeout(t); fail(e); });
    proc.stderr.on('data', (d) => { buf += d.toString(); const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); ok({ proc, wsUrl: m[1] }); } });
    proc.on('exit', (code) => { clearTimeout(t); fail(new Error(`browser exited early (code ${code})`)); });
  });
}

// ---- in-page helpers (serialized into the page; read-only DOM queries) ---------------------------------------
const PAGE_HELPERS = String.raw`(() => {
  if (window.__dcore) return;
  const vis = (el) => { if (!el || !el.isConnected) return false; const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const nameOf = (el) => {
    if (!el) return '';
    const al = el.getAttribute('aria-label'); if (al) return norm(al);
    const lb = el.getAttribute('aria-labelledby'); if (lb) return norm(lb.split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' '));
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return norm(l.innerText); }
    const wrap = el.closest('label'); if (wrap) return norm(wrap.innerText);
    if (el.tagName === 'IMG') return norm(el.getAttribute('alt'));
    if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type)) return norm(el.value);
    const t = norm(el.innerText || el.textContent); if (t) return t.slice(0, 80);
    return norm(el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('name') || '');
  };
  const sel = (el) => {
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return '#' + el.id;
    for (const a of ['data-testid', 'data-test', 'data-cy', 'name', 'aria-label', 'placeholder']) { const v = el.getAttribute(a); if (v && v.length < 60) { const s = el.tagName.toLowerCase() + '[' + a + '="' + v.replace(/"/g, '\\"') + '"]'; if (document.querySelectorAll(s).length === 1) return s; } }
    const parts = []; let n = el;
    while (n && n.nodeType === 1 && parts.length < 5) { let p = n.tagName.toLowerCase(); const par = n.parentElement; if (par) { const sib = [...par.children].filter((c) => c.tagName === n.tagName); if (sib.length > 1) p += ':nth-of-type(' + (sib.indexOf(n) + 1) + ')'; } parts.unshift(p); if (n.id && /^[A-Za-z][\w-]*$/.test(n.id)) { parts[0] = '#' + n.id; break; } n = par; }
    return parts.join(' > ');
  };
  const CLICKABLE = 'a,button,input,select,textarea,summary,label,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[role=switch],[role=combobox],[onclick],[tabindex]:not([tabindex="-1"]),li,td,th,span,div';
  const find = (loc) => {
    let c = [];
    if (loc.selector) { try { c = [...document.querySelectorAll(loc.selector)]; } catch (e) { return { error: 'invalid selector: ' + loc.selector }; } }
    else if (loc.testid) c = [...document.querySelectorAll('[data-testid="' + loc.testid + '"],[data-test="' + loc.testid + '"],[data-cy="' + loc.testid + '"]')];
    else if (loc.placeholder) c = [...document.querySelectorAll('[placeholder]')].filter((e) => norm(e.getAttribute('placeholder')).toLowerCase().includes(loc.placeholder.toLowerCase()));
    else if (loc.label) { const want = loc.label.toLowerCase(); c = [...document.querySelectorAll('input,select,textarea,[contenteditable=true],[role=textbox],[role=combobox]')].filter((e) => nameOf(e).toLowerCase().includes(want)); }
    else if (loc.text) {
      const want = norm(loc.text).toLowerCase();
      const all = [...document.querySelectorAll(loc.role ? '[role="' + loc.role + '"],' + (loc.role === 'button' ? 'button,input[type=submit],input[type=button]' : loc.role === 'link' ? 'a' : loc.role) : CLICKABLE)];
      const exact = all.filter((e) => nameOf(e).toLowerCase() === want);
      c = exact.length ? exact : (loc.exact ? [] : all.filter((e) => nameOf(e).toLowerCase().includes(want)));
      // prefer the innermost match (a span inside a button resolves to the button-or-span closest to the text)
      c = c.filter((e) => !c.some((o) => o !== e && e.contains(o) && vis(o)));
    }
    const visible = c.filter(vis);
    const el = visible[loc.index || 0] || (loc.allowHidden ? c[loc.index || 0] : null);
    if (!el) return { found: c.length, visible: visible.length };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { found: c.length, visible: visible.length, x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName.toLowerCase(), type: el.type || null, name: nameOf(el).slice(0, 80), selector: sel(el) };
  };
  const element = (loc) => { const r = find(loc); if (!r.selector) return null; return document.querySelector(r.selector); };
  const inspect = (max) => {
    const els = [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=combobox],summary')].filter(vis);
    return {
      url: location.href, title: document.title,
      headings: [...document.querySelectorAll('h1,h2,h3')].filter(vis).slice(0, 30).map((h) => h.tagName.toLowerCase() + ': ' + norm(h.innerText).slice(0, 100)),
      interactive: els.slice(0, max).map((e) => ({ tag: e.tagName.toLowerCase(), type: e.type || undefined, role: e.getAttribute('role') || undefined, name: nameOf(e).slice(0, 80), selector: sel(e), disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' || undefined, href: e.tagName === 'A' ? (e.getAttribute('href') || '').slice(0, 120) : undefined })),
      interactive_total: els.length,
      forms: [...document.forms].map((f) => ({ selector: sel(f), fields: [...f.elements].filter((x) => x.name || x.id).slice(0, 30).map((x) => ({ name: x.name || x.id, type: x.type, label: nameOf(x).slice(0, 60), required: x.required || undefined })) })),
      tables: [...document.querySelectorAll('table,[role=grid],[role=table]')].filter(vis).slice(0, 10).map((t) => ({ selector: sel(t), headers: [...t.querySelectorAll('th,[role=columnheader]')].map((h) => norm(h.innerText)).filter(Boolean).slice(0, 25), rows: t.querySelectorAll('tbody tr,[role=row]').length })),
      alerts: [...document.querySelectorAll('[role=alert],[role=status],.alert,.toast,.error,.invalid-feedback,.ant-message,.MuiAlert-root')].filter(vis).slice(0, 10).map((a) => norm(a.innerText).slice(0, 200)).filter(Boolean),
      iframes: document.querySelectorAll('iframe').length,
    };
  };
  const a11y = () => {
    const out = {};
    const sample = (list) => list.slice(0, 8).map(sel);
    out.lang = { ok: !!document.documentElement.getAttribute('lang') };
    out.title = { ok: !!norm(document.title) };
    const imgs = [...document.querySelectorAll('img')].filter((i) => vis(i) && !i.hasAttribute('alt') && i.getAttribute('role') !== 'presentation');
    out.img_alt = { ok: imgs.length === 0, count: imgs.length, samples: sample(imgs) };
    const fields = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea')].filter((f) => vis(f) && !nameOf(f));
    out.form_labels = { ok: fields.length === 0, count: fields.length, samples: sample(fields) };
    const ctrls = [...document.querySelectorAll('button,a[href],[role=button],[role=link]')].filter((b) => vis(b) && !nameOf(b));
    out.control_names = { ok: ctrls.length === 0, count: ctrls.length, samples: sample(ctrls) };
    const ids = {}; for (const e of document.querySelectorAll('[id]')) ids[e.id] = (ids[e.id] || 0) + 1;
    const dup = Object.entries(ids).filter(([, n]) => n > 1).map(([k]) => k);
    out.duplicate_ids = { ok: dup.length === 0, count: dup.length, samples: dup.slice(0, 8) };
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis).map((h) => Number(h.tagName[1]));
    let skip = 0; for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) skip++;
    out.heading_order = { ok: skip === 0, count: skip, h1: hs.filter((h) => h === 1).length };
    const pos = [...document.querySelectorAll('[tabindex]')].filter((e) => Number(e.getAttribute('tabindex')) > 0);
    out.positive_tabindex = { ok: pos.length === 0, count: pos.length, samples: sample(pos) };
    const hiddenFocusable = [...document.querySelectorAll('[aria-hidden=true] a[href],[aria-hidden=true] button,[aria-hidden=true] input')];
    out.aria_hidden_focusable = { ok: hiddenFocusable.length === 0, count: hiddenFocusable.length, samples: sample(hiddenFocusable) };
    return out;
  };
  const perf = () => { const n = performance.getEntriesByType('navigation')[0]; if (!n) return null; return { ttfb_ms: Math.round(n.responseStart - n.requestStart), dom_content_loaded_ms: Math.round(n.domContentLoadedEventEnd), load_ms: Math.round(n.loadEventEnd), transfer_bytes: n.transferSize, resources: performance.getEntriesByType('resource').length }; };
  window.__dcore = { find, element, inspect, a11y, perf, vis, norm, nameOf };
})()`;

const KEYS = { Enter: [13, '\r'], Tab: [9, ''], Escape: [27, ''], Backspace: [8, ''], ArrowDown: [40, ''], ArrowUp: [38, ''], ArrowLeft: [37, ''], ArrowRight: [39, ''], Space: [32, ' '], Home: [36, ''], End: [35, ''], PageDown: [34, ''], PageUp: [33, ''] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripQuery = (u) => { try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return `${x.protocol}${x.pathname.slice(0, 40)}${x.pathname.length > 40 ? '…' : ''}`; return x.origin + x.pathname + (x.search ? '?…' : ''); } catch { return String(u).slice(0, 200); } };

// ---- session ------------------------------------------------------------------------------------------------
class Session {
  constructor(cdp, sessionId, outDir, secrets) {
    Object.assign(this, { cdp, sessionId, outDir, secrets });
    this.console = []; this.pageErrors = []; this.network = []; this.http4xx = []; this.downloads = []; this.dialogs = [];
    this.inflight = new Map(); this.loadFired = false; this.dialogPolicy = 'dismiss';
  }
  send(m, p, t) { return this.cdp.send(m, p, this.sessionId, t); }
  async init() {
    this.cdp.on((m) => {
      if (m.sessionId !== this.sessionId && !m.method.startsWith('Browser.')) return;
      const p = m.params ?? {};
      switch (m.method) {
        case 'Page.loadEventFired': this.loadFired = true; break;
        case 'Network.requestWillBeSent': if (!['WebSocket', 'EventSource'].includes(p.type)) this.inflight.set(p.requestId, p.request.url); break;
        case 'Network.loadingFinished': this.inflight.delete(p.requestId); break;
        case 'Network.loadingFailed': this.inflight.delete(p.requestId); if (!p.canceled && !/ERR_ABORTED/.test(p.errorText)) this.network.push({ kind: 'failed', error: p.errorText, type: p.type }); break;
        case 'Network.responseReceived': if (p.response.status >= 400) (p.response.status >= 500 ? this.network : this.http4xx).push({ kind: 'http', status: p.response.status, url: stripQuery(p.response.url), type: p.type }); break;
        case 'Runtime.consoleAPICalled': if (['error', 'assert'].includes(p.type)) this.console.push((p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)); break;
        case 'Runtime.exceptionThrown': this.pageErrors.push(String(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? 'exception').split('\n')[0].slice(0, 300)); break;
        case 'Log.entryAdded': if (p.entry.level === 'error' && p.entry.source !== 'network') this.console.push(String(p.entry.text).slice(0, 300)); break;
        case 'Page.javascriptDialogOpening': this.dialogs.push({ type: p.type, message: String(p.message).slice(0, 200), action: p.type === 'alert' ? 'accept' : this.dialogPolicy }); this.send('Page.handleJavaScriptDialog', { accept: p.type === 'alert' || this.dialogPolicy === 'accept' }).catch(() => {}); break;
        case 'Browser.downloadProgress': if (p.state === 'completed') this.downloads.push({ guid: p.guid, bytes: p.receivedBytes }); break;
        case 'Browser.downloadWillBegin': this.downloads.push({ suggested_filename: p.suggestedFilename, url: stripQuery(p.url), state: 'started' }); break;
        default:
      }
    });
    for (const d of ['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable']) await this.send(d);
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HELPERS });
    await this.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await this.cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: this.outDir, eventsEnabled: true }).catch(() => {});
  }
  async eval(expr, timeoutMs = 15_000) {
    const r = await this.send('Runtime.evaluate', { expression: `${PAGE_HELPERS};(${expr})`, returnByValue: true, awaitPromise: true }, timeoutMs);
    if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).split('\n')[0]);
    return r.result?.value;
  }
  async settle(maxMs = 5000, quietMs = 500) {
    const end = Date.now() + maxMs; let quietSince = Date.now();
    while (Date.now() < end) { if (this.inflight.size === 0) { if (Date.now() - quietSince >= quietMs) return true; } else quietSince = Date.now(); await sleep(100); }
    return false;
  }
  async waitLoad(timeoutMs) { const end = Date.now() + timeoutMs; while (!this.loadFired && Date.now() < end) await sleep(100); return this.loadFired; }
  async locate(loc, timeoutMs) {
    const end = Date.now() + timeoutMs; let last;
    while (Date.now() < end) { last = await this.eval(`window.__dcore.find(${JSON.stringify(loc)})`).catch((e) => ({ error: e.message })); if (last?.selector || last?.error) return last; await sleep(200); }
    return last ?? {};
  }
  async mouseClick(x, y, clickCount = 1) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount });
  }
  async key(name) {
    const [code, text] = KEYS[name] ?? [0, name.length === 1 ? name : ''];
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, windowsVirtualKeyCode: code, text: text || undefined });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, windowsVirtualKeyCode: code });
  }
}

const locOf = (s) => { const { selector, text, label, placeholder, testid, role, exact, index } = s; return Object.fromEntries(Object.entries({ selector, text, label, placeholder, testid, role, exact, index }).filter(([, v]) => v !== undefined)); };
const describe = (s) => { const l = locOf(s); return Object.entries(l).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' '); };

// Execute one step; returns { result, detail, evidence? }. Action failures stop the run; assertion failures don't.
async function step(S, s, ctx) {
  const t = s.timeoutMs ?? ctx.stepTimeoutMs;
  const op = Object.keys(s).find((k) => ['goto', 'click', 'fill', 'select', 'press', 'check', 'hover', 'wait', 'waitFor', 'assertText', 'assertNoText', 'assertUrl', 'assertTitle', 'assertVisible', 'assertCount', 'screenshot', 'inspect', 'text', 'a11y', 'perf', 'viewport', 'evaluate', 'dialog', 'back', 'reload'].includes(k));
  if (!op) return { op: '?', result: 'FAIL', detail: `unknown step: ${JSON.stringify(Object.keys(s))}`, stop: true };
  const v = s[op];
  const L = typeof v === 'object' && v !== null ? v : s;   // locator may live inside the op object or alongside it
  switch (op) {
    case 'goto': {
      const url = typeof v === 'string' ? v : v.url;
      if (!/^https?:\/\//i.test(url) && !/^about:|^data:/.test(url)) return { op, result: 'FAIL', detail: `refusing non-http URL: ${url}`, stop: true };
      S.loadFired = false;
      const r = await S.send('Page.navigate', { url }, t);
      if (r.errorText) return { op, result: 'FAIL', detail: `navigation failed: ${r.errorText}`, stop: true };
      await S.waitLoad(t); await S.settle(ctx.settleMs);
      return { op, result: 'PASS', detail: `navigated to ${stripQuery(await S.eval('location.href'))}` };
    }
    case 'back': await S.eval('history.back()'); await sleep(300); await S.settle(ctx.settleMs); return { op, result: 'PASS', detail: 'history.back()' };
    case 'reload': S.loadFired = false; await S.send('Page.reload'); await S.waitLoad(t); await S.settle(ctx.settleMs); return { op, result: 'PASS', detail: 'reloaded' };
    case 'click': case 'hover': case 'check': {
      const loc = locOf(L);
      const r = await S.locate(loc, t);
      if (!r.selector) return { op, result: 'FAIL', detail: `element not found: ${describe(L)} (matches=${r.found ?? 0}, visible=${r.visible ?? 0}${r.error ? ', ' + r.error : ''})`, stop: !s.optional };
      if (op === 'hover') { await S.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y }); await sleep(200); return { op, result: 'PASS', detail: `hovered ${r.tag} "${r.name}"` }; }
      S.loadFired = false;
      await S.mouseClick(r.x, r.y, s.double ? 2 : 1);
      await sleep(150); await S.settle(ctx.settleMs);
      return { op, result: 'PASS', detail: `clicked ${r.tag}${r.type ? '[' + r.type + ']' : ''} "${r.name}" (${r.selector})` };
    }
    case 'fill': {
      const loc = locOf(L);
      let value = L.value ?? s.value;
      if (L.valueEnv ?? s.valueEnv) { const name = L.valueEnv ?? s.valueEnv; value = process.env[name]; if (value === undefined) return { op, result: 'BLOCKED', detail: `env var ${name} is not set`, stop: true }; ctx.secrets.push(value); }
      const r = await S.locate(loc, t);
      if (!r.selector) return { op, result: 'FAIL', detail: `field not found: ${describe(L)} (matches=${r.found ?? 0})`, stop: true };
      if (r.type === 'password' && typeof value === 'string') ctx.secrets.push(value);
      await S.mouseClick(r.x, r.y);
      await S.eval(`(() => { const e = window.__dcore.element(${JSON.stringify(loc)}); if (!e) return; e.focus(); if (e.select) e.select(); else if (e.isContentEditable) document.execCommand('selectAll'); })()`);
      if (value === '') await S.key('Backspace'); else await S.send('Input.insertText', { text: String(value) });
      await S.eval(`(() => { const e = window.__dcore.element(${JSON.stringify(loc)}); if (e) e.dispatchEvent(new Event('change', { bubbles: true })); })()`).catch(() => {});
      const shown = (L.valueEnv ?? s.valueEnv) || r.type === 'password' ? '[REDACTED]' : JSON.stringify(String(value).slice(0, 60));
      return { op, result: 'PASS', detail: `filled ${r.tag}[${r.type ?? ''}] "${r.name}" with ${shown}` };
    }
    case 'select': {
      const loc = locOf(L);
      const r = await S.locate(loc, t);
      if (!r.selector) return { op, result: 'FAIL', detail: `select not found: ${describe(L)}`, stop: true };
      const ok = await S.eval(`(() => { const e = window.__dcore.element(${JSON.stringify(loc)}); if (!e || e.tagName !== 'SELECT') return false; const want = ${JSON.stringify(String(L.option ?? L.value ?? ''))}.toLowerCase(); const o = [...e.options].find((o) => o.value.toLowerCase() === want || o.text.trim().toLowerCase() === want); if (!o) return false; e.value = o.value; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await S.settle(ctx.settleMs);
      return ok ? { op, result: 'PASS', detail: `selected "${L.option ?? L.value}"` } : { op, result: 'FAIL', detail: `option not found or not a <select> (use click steps for custom dropdowns)`, stop: true };
    }
    case 'press': { await S.key(typeof v === 'string' ? v : v.key); await sleep(150); await S.settle(ctx.settleMs); return { op, result: 'PASS', detail: `pressed ${typeof v === 'string' ? v : v.key}` }; }
    case 'wait': { await sleep(Math.min(Number(v), 30_000)); return { op, result: 'PASS', detail: `waited ${v} ms` }; }
    case 'waitFor': {
      const cond = typeof v === 'string' ? { text: v } : v;
      const end = Date.now() + t;
      while (Date.now() < end) {
        const ok = await S.eval(`(() => { const c = ${JSON.stringify(cond)}; const D = window.__dcore;
          if (c.url) return location.href.includes(c.url);
          if (c.gone) return !D.find(typeof c.gone === 'string' ? { text: c.gone } : c.gone).selector;
          if (c.selector || c.label || c.placeholder || c.testid) return !!D.find(c).selector;
          if (c.text) return D.norm(document.body.innerText).toLowerCase().includes(c.text.toLowerCase());
          return false; })()`).catch(() => false);
        if (ok) { await S.settle(ctx.settleMs); return { op, result: 'PASS', detail: `condition met: ${JSON.stringify(cond)}` }; }
        await sleep(250);
      }
      return { op, result: 'FAIL', detail: `timed out after ${t} ms waiting for ${JSON.stringify(cond)}`, stop: !s.optional };
    }
    case 'assertText': case 'assertNoText': {
      const want = typeof v === 'string' ? v : v.text;
      const present = await S.eval(`window.__dcore.norm(document.body.innerText).toLowerCase().includes(${JSON.stringify(String(want).toLowerCase())})`);
      const ok = op === 'assertText' ? present : !present;
      return { op, result: ok ? 'PASS' : 'FAIL', detail: `text "${want}" ${present ? 'present' : 'absent'}` };
    }
    case 'assertUrl': { const href = await S.eval('location.href'); const ok = typeof v === 'string' ? href.includes(v) : new RegExp(v.matches).test(href); return { op, result: ok ? 'PASS' : 'FAIL', detail: `url ${stripQuery(href)} ${ok ? 'matches' : 'does not match'} ${JSON.stringify(v)}` }; }
    case 'assertTitle': { const title = await S.eval('document.title'); const ok = title.toLowerCase().includes(String(v).toLowerCase()); return { op, result: ok ? 'PASS' : 'FAIL', detail: `title "${title}"` }; }
    case 'assertVisible': { const r = await S.locate(locOf(typeof v === 'string' ? { text: v } : L), t); return { op, result: r.selector ? 'PASS' : 'FAIL', detail: r.selector ? `visible: ${r.tag} "${r.name}"` : `not visible: ${typeof v === 'string' ? v : describe(L)}` }; }
    case 'assertCount': {
      const n = await S.eval(`[...document.querySelectorAll(${JSON.stringify(v.selector)})].filter(window.__dcore.vis).length`);
      const ok = (v.min === undefined || n >= v.min) && (v.max === undefined || n <= v.max) && (v.equals === undefined || n === v.equals);
      return { op, result: ok ? 'PASS' : 'FAIL', detail: `${n} visible "${v.selector}" (want ${JSON.stringify({ min: v.min, max: v.max, equals: v.equals })})` };
    }
    case 'screenshot': {
      const name = String((typeof v === 'string' ? v : v.name) ?? `shot-${ctx.shots.length + 1}`).replace(/[^\w.-]/g, '_');
      const full = typeof v === 'object' && v.fullPage;
      let clip;
      if (full) { const m = await S.send('Page.getLayoutMetrics'); const c = m.cssContentSize ?? m.contentSize; clip = { x: 0, y: 0, width: Math.min(c.width, 2000), height: Math.min(c.height, 12000), scale: 1 }; }
      const r = await S.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
      const file = join(ctx.outDir, `${String(ctx.shots.length + 1).padStart(2, '0')}-${name}.png`);
      writeFileSync(file, Buffer.from(r.data, 'base64'));
      ctx.shots.push(file);
      return { op, result: 'PASS', detail: `saved ${file}` };
    }
    case 'inspect': { const data = await S.eval(`window.__dcore.inspect(${Number(v?.max ?? 120)})`); ctx.inspections.push(data); return { op, result: 'PASS', detail: `${data.interactive_total} interactive elements, ${data.tables.length} tables, ${data.forms.length} forms on "${data.title}"` }; }
    case 'text': { const txt = await S.eval(`window.__dcore.norm(document.body.innerText).slice(0, ${Number(v?.max ?? 4000)})`); ctx.texts.push(txt); return { op, result: 'PASS', detail: `captured ${txt.length} chars of page text` }; }
    case 'a11y': {
      const r = await S.eval('window.__dcore.a11y()'); ctx.a11y.push(r);
      const bad = Object.entries(r).filter(([, x]) => !x.ok).map(([k]) => k);
      return { op, result: bad.length ? 'FAIL' : 'PASS', detail: bad.length ? `accessibility findings: ${bad.join(', ')}` : 'basic accessibility checks passed (not a WCAG audit)', a11y: true };
    }
    case 'perf': { const p = await S.eval('window.__dcore.perf()'); ctx.perf.push(p); const max = v?.maxLoadMs; return { op, result: max !== undefined && p ? (p.load_ms <= max ? 'PASS' : 'FAIL') : 'PASS', detail: p ? `load ${p.load_ms} ms, DCL ${p.dom_content_loaded_ms} ms, TTFB ${p.ttfb_ms} ms` : 'no navigation timing' }; }
    case 'viewport': { const { width = 375, height = 812, mobile = width < 768 } = typeof v === 'object' ? v : {}; await S.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile }); await sleep(300); return { op, result: 'PASS', detail: `viewport ${width}x${height}${mobile ? ' (mobile)' : ''}` }; }
    case 'evaluate': { const val = await S.eval(typeof v === 'string' ? v : v.expression); const shown = JSON.stringify(val) ?? 'undefined'; ctx.values.push(shown.slice(0, 2000)); const ok = v?.expect === undefined || JSON.stringify(val) === JSON.stringify(v.expect); return { op, result: ok ? 'PASS' : 'FAIL', detail: `value ${shown.slice(0, 200)}` }; }
    case 'dialog': { S.dialogPolicy = v === 'accept' ? 'accept' : 'dismiss'; return { op, result: 'PASS', detail: `confirm/prompt dialogs will be ${S.dialogPolicy}ed` }; }
    default: return { op, result: 'FAIL', detail: 'unhandled', stop: true };
  }
}

// Run a list of steps in one real browser session. opts: { outDir, profile, headed, stepTimeoutMs, settleMs,
// allowConsoleErrors, browser }.
export async function browse(steps, opts = {}) {
  const started_at = new Date().toISOString();
  const ctx = { secrets: [], shots: [], inspections: [], texts: [], a11y: [], perf: [], values: [], stepTimeoutMs: opts.stepTimeoutMs ?? 15_000, settleMs: opts.settleMs ?? 4000 };
  const action = `browse ${steps.length} step(s)`;
  if (!Array.isArray(steps) || steps.length === 0) return report({ module: 'dcore-browse', action, started_at, result: 'BLOCKED', limitations: ['no steps given'] });
  const exe = opts.browser ?? findBrowser();
  if (!exe) return report({ module: 'dcore-browse', action, started_at, result: 'BLOCKED', limitations: ['no Chromium-family browser found (install Chrome/Edge/Chromium or set DCORE_BROWSER); NOTHING was executed in a browser'], evidence: { searched: browserCandidates().slice(0, 12) } });
  ctx.outDir = resolve(opts.outDir ?? join('.dcore', 'evidence', `browse-${started_at.replace(/[:.]/g, '-')}`));
  mkdirSync(ctx.outDir, { recursive: true });
  const ephemeral = !opts.profile;
  const userDir = opts.profile ? resolve(opts.profile) : mkdtempSync(join(tmpdir(), 'dcore-browse-'));
  let proc; let cdp; const log = [];
  try {
    ({ proc } = await launch(exe, { userDir, headed: opts.headed }).then(async (l) => { cdp = await CDP.connect(l.wsUrl); return l; }));
    const { targetInfos } = await cdp.send('Target.getTargets');
    let page = targetInfos.find((t) => t.type === 'page');
    if (!page) page = { targetId: (await cdp.send('Target.createTarget', { url: 'about:blank' })).targetId };
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    const S = new Session(cdp, sessionId, ctx.outDir, ctx.secrets);
    await S.init();
    let stopped = false;
    for (const [i, s] of steps.entries()) {
      if (stopped) { log.push({ n: i + 1, op: Object.keys(s)[0], result: 'SKIPPED', detail: 'not run: an earlier step failed' }); continue; }
      let r;
      try { r = await step(S, s, ctx); } catch (e) { r = { op: Object.keys(s)[0], result: 'FAIL', detail: `error: ${e.message}`, stop: true }; }
      log.push({ n: i + 1, op: r.op, ...(s.name ? { name: s.name } : {}), result: r.result, detail: r.detail });
      if ((r.result === 'FAIL' || r.result === 'BLOCKED') && r.stop) {
        stopped = true;
        try { await step(S, { screenshot: `failure-step-${i + 1}` }, ctx); } catch { /* best effort */ }
      }
    }
    const final = await S.eval('({ url: location.href, title: document.title })').catch(() => ({}));
    const checks = log.map((l) => check(`step-${l.n}`, `${l.op}${l.name ? ' (' + l.name + ')' : ''}: ${l.detail}`, l.result));
    checks.push(check('page-errors', `${S.pageErrors.length} uncaught page exception(s)`, S.pageErrors.length ? 'FAIL' : 'PASS'));
    checks.push(check('console-errors', `${S.console.length} console error(s)`, S.console.length && !opts.allowConsoleErrors ? 'FAIL' : 'PASS'));
    checks.push(check('network-failures', `${S.network.length} failed request(s) or 5xx response(s)`, S.network.length ? 'FAIL' : 'PASS'));
    return report({
      module: 'dcore-browse', action, started_at, checks, secrets: ctx.secrets,
      evidence: {
        browser: exe.split(/[\\/]/).pop(), final_url: final.url ? stripQuery(final.url) : null, title: final.title ?? null,
        steps: log, console_errors: [...new Set(S.console)].slice(0, 50), page_errors: [...new Set(S.pageErrors)].slice(0, 50),
        network_failures: S.network.slice(0, 50), http_4xx: S.http4xx.slice(0, 50), dialogs: S.dialogs, downloads: S.downloads,
        screenshots: ctx.shots, inspections: ctx.inspections, page_text: ctx.texts, a11y: ctx.a11y, perf: ctx.perf, values: ctx.values, out_dir: ctx.outDir,
      },
      limitations: ['iframes and closed shadow DOM are not traversed by locators', 'a11y checks are basic heuristics, not a WCAG audit', ...(ephemeral ? ['fresh browser profile: no prior cookies/session'] : ['persistent profile in use: session cookies are stored there'])],
    });
  } catch (e) {
    return report({ module: 'dcore-browse', action, started_at, result: 'BLOCKED', secrets: ctx.secrets, checks: log.map((l) => check(`step-${l.n}`, `${l.op}: ${l.detail}`, l.result)), evidence: { steps: log, screenshots: ctx.shots, out_dir: ctx.outDir }, limitations: [`browser session failed: ${redact(e.message, ctx.secrets)}`] });
  } finally {
    try { await cdp?.send('Browser.close', {}, undefined, 5000); } catch { /* ignore */ }
    cdp?.close();
    try { proc?.kill(); } catch { /* ignore */ }
    if (ephemeral) for (let i = 0; i < 10; i++) { try { rmSync(userDir, { recursive: true, force: true }); break; } catch { await sleep(300); } }
  }
}
