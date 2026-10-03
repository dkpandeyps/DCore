// dcore-browse — real browser execution with evidence, dependency-free.
// Launches an installed Chromium-family browser (Chrome / Edge / Chromium / Brave, or $DCORE_BROWSER) headless with a
// throwaway profile and drives it over the Chrome DevTools Protocol using Node's built-in WebSocket. Every step is
// executed for real; results come from the live page. If no browser is available the run is BLOCKED (never PASS).
//
// Element resolution (M39): one resolver searches the main document, every frame (nested, same- and cross-origin) and
// open shadow roots, and classifies the target as NOT_FOUND / AMBIGUOUS / FOUND (present, not visible) / DISABLED /
// NOT_INTERACTABLE / VISIBLE_BUT_OBSTRUCTED / INTERACTABLE — waiting (polling) until the state an action needs, else
// TIMEOUT (with the last state). Obstruction is a page-level hit test at the click point (works across frames). Actions
// are verified: fills re-read the value, checks re-read the checked state, selects re-read the selection.
// Secrets: typed values come from env vars (`valueEnv`) and are redacted everywhere; password-field values are never
// recorded; inspection never captures input values. confirm() dialogs are dismissed unless a step accepts them.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, renameSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
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
    // Site isolation is disabled in this THROWAWAY test profile so cross-origin iframes share the page process and
    // expose an execution context to the resolver (frames are then testable). Never used with the user's real profile.
    const args = ['--remote-debugging-port=0', `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-background-networking', '--disable-default-apps', '--disable-component-update', '--mute-audio', '--window-size=1366,900', '--disable-features=IsolateOrigins,site-per-process', '--disable-site-isolation-trials', '--disable-popup-blocking', ...(headed ? [] : ['--headless=new']), 'about:blank'];
    let proc;
    try { proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }); } catch (e) { fail(e); return; }
    let buf = '';
    const t = setTimeout(() => fail(new Error('browser did not expose a DevTools endpoint in time')), timeoutMs);
    proc.on('error', (e) => { clearTimeout(t); fail(e); });
    proc.stderr.on('data', (d) => { buf += d.toString(); const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); ok({ proc, wsUrl: m[1] }); } });
    proc.on('exit', (code) => { clearTimeout(t); fail(new Error(`browser exited early (code ${code})`)); });
  });
}

// ---- in-page helpers (serialized into every frame; read-only DOM queries) --------------------------------------
// NB: this is a String.raw template — the page code must not contain backticks or dollar-brace sequences.
const PAGE_HELPERS = String.raw`(() => {
  if (window.__dcore && window.__dcore.v === 3) return;
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const roots = () => { const out = [document]; const st = [document]; while (st.length) { const r = st.pop(); for (const el of r.querySelectorAll('*')) if (el.shadowRoot) { out.push(el.shadowRoot); st.push(el.shadowRoot); } } return out; };
  const qAll = (s) => { const out = []; for (const r of roots()) for (const e of r.querySelectorAll(s)) out.push(e); return out; };
  const vis = (el) => {
    if (!el || !el.isConnected) return false;
    if (el.checkVisibility) { if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false; }
    else { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; }
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  };
  const labelsOf = (el) => { try { if (el.labels && el.labels.length) return [...el.labels]; } catch (e) { } const root = el.getRootNode(); if (el.id && root.querySelector) { const l = root.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return [l]; } const w = el.closest('label'); return w ? [w] : []; };
  const nameOf = (el) => {
    if (!el) return '';
    const al = el.getAttribute('aria-label'); if (al) return norm(al);
    const lb = el.getAttribute('aria-labelledby'); if (lb) { const root = el.getRootNode(); return norm(lb.split(/\s+/).map((id) => (root.getElementById ? root.getElementById(id) : document.getElementById(id)) || null).filter(Boolean).map((n) => n.innerText || n.textContent).join(' ')); }
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) { const ls = labelsOf(el); if (ls.length) return norm(ls.map((l) => l.innerText || l.textContent).join(' ')); }
    if (el.tagName === 'IMG') return norm(el.getAttribute('alt'));
    if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type)) return norm(el.value);
    const t = norm(el.innerText || el.textContent); if (t) return t.slice(0, 80);
    return norm(el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('name') || '');
  };
  const sel = (el) => {
    const root = el.getRootNode(); const host = root && root.host;
    const local = (() => {
      if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return '#' + el.id;
      for (const a of ['data-testid', 'data-test', 'data-cy', 'name', 'aria-label', 'placeholder']) { const v = el.getAttribute(a); if (v && v.length < 60) { const s = el.tagName.toLowerCase() + '[' + a + '="' + v.replace(/"/g, '\\"') + '"]'; try { if (root.querySelectorAll(s).length === 1) return s; } catch (e) { } } }
      const parts = []; let n = el;
      while (n && n.nodeType === 1 && parts.length < 5) { let p = n.tagName.toLowerCase(); const par = n.parentElement; if (par) { const sib = [...par.children].filter((c) => c.tagName === n.tagName); if (sib.length > 1) p += ':nth-of-type(' + (sib.indexOf(n) + 1) + ')'; } parts.unshift(p); if (n.id && /^[A-Za-z][\w-]*$/.test(n.id)) { parts[0] = '#' + n.id; break; } n = par; }
      return parts.join(' > ');
    })();
    return host ? sel(host) + ' >>> ' + local : local;
  };
  const disabled = (el) => { try { if (el.matches(':disabled')) return 'disabled'; } catch (e) { } if (el.getAttribute('aria-disabled') === 'true') return 'aria-disabled'; if (el.closest('[inert]')) return 'inert'; return null; };
  const editable = (el) => { if (el.isContentEditable) return true; if (el.tagName === 'TEXTAREA') return !el.readOnly; if (el.tagName === 'INPUT') return !el.readOnly && !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'hidden', 'image'].includes(el.type); return el.getAttribute('role') === 'textbox'; };
  const CLICKABLE = 'a,button,input,select,textarea,summary,label,option,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[role=switch],[role=combobox],[role=textbox],[contenteditable=true],[onclick],[tabindex]:not([tabindex="-1"]),li,td,th,span,div';
  const NATIVE = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|OPTION|LABEL)$/;
  const rank = (e) => NATIVE.test(e.tagName) ? 0 : e.getAttribute('role') ? 1 : 2;
  const candidates = (loc) => {
    if (loc.selector) { try { return qAll(loc.selector); } catch (e) { return { error: 'invalid selector: ' + loc.selector }; } }
    if (loc.testid) return qAll('[data-testid="' + loc.testid + '"],[data-test="' + loc.testid + '"],[data-cy="' + loc.testid + '"]');
    if (loc.placeholder) { const w = loc.placeholder.toLowerCase(); return qAll('[placeholder]').filter((e) => norm(e.getAttribute('placeholder')).toLowerCase().includes(w)); }
    if (loc.label) { const w = loc.label.toLowerCase(); const all = qAll('input,select,textarea,[contenteditable=true],[role=textbox],[role=combobox],[role=checkbox],[role=radio],[role=switch]'); const ex = all.filter((e) => nameOf(e).toLowerCase() === w); return ex.length ? ex : (loc.exact ? [] : all.filter((e) => nameOf(e).toLowerCase().includes(w))); }
    if (loc.text !== undefined) {
      const want = norm(loc.text).toLowerCase();
      const roleSel = loc.role ? '[role="' + loc.role + '"]' + (loc.role === 'button' ? ',button,input[type=submit],input[type=button],input[type=reset]' : loc.role === 'link' ? ',a[href]' : loc.role === 'checkbox' ? ',input[type=checkbox]' : loc.role === 'radio' ? ',input[type=radio]' : loc.role === 'option' ? ',option' : loc.role === 'textbox' ? ',input,textarea' : '') : CLICKABLE;
      const all = qAll(roleSel);
      const exact = all.filter((e) => nameOf(e).toLowerCase() === want);
      let c = exact.length ? exact : (loc.exact ? [] : all.filter((e) => nameOf(e).toLowerCase().includes(want)));
      c = c.filter((e) => !c.some((o) => o !== e && e.contains(o) && vis(o)));   // innermost match
      return c;
    }
    if (loc.role) return qAll('[role="' + loc.role + '"]');
    return { error: 'no locator given (selector / text / label / placeholder / testid / role)' };
  };
  // resolve: classify the target. Node then hit-tests at page level (frames) and finalises INTERACTABLE vs OBSTRUCTED.
  const resolve = (loc) => {
    const c = candidates(loc);
    if (!Array.isArray(c)) return { state: 'BLOCKED', error: c.error };
    window.__dcore._last = null;
    if (!c.length) return { state: 'NOT_FOUND', count: 0 };
    let visible = c.filter(vis);
    if (visible.length > 1 && loc.selector === undefined) { const best = Math.min(...visible.map(rank)); visible = visible.filter((e) => rank(e) === best); }
    if (loc.index === undefined && !loc.first && visible.length > 1) return { state: 'AMBIGUOUS', count: c.length, visible_count: visible.length, matches: visible.slice(0, 5).map((e) => ({ tag: e.tagName.toLowerCase(), name: nameOf(e).slice(0, 50), selector: sel(e) })) };
    const el = visible.length ? visible[loc.index || 0] : c[loc.index || 0];
    if (!el) return { state: 'NOT_FOUND', count: c.length, reason: 'index ' + loc.index + ' out of range' };
    window.__dcore._last = el;
    const base = { count: c.length, visible_count: visible.length, tag: el.tagName.toLowerCase(), type: el.type || null, role: el.getAttribute('role'), name: nameOf(el).slice(0, 80), selector: sel(el), in_shadow: el.getRootNode() !== document, editable: editable(el), checked: el.type === 'checkbox' || el.type === 'radio' ? !!el.checked : (el.getAttribute('aria-checked') ? el.getAttribute('aria-checked') === 'true' : null), maxlength: el.maxLength > 0 ? el.maxLength : null };
    if (!vis(el)) return { ...base, state: 'FOUND', visible: false };
    if (!loc.noScroll) el.scrollIntoView({ block: 'center', inline: 'center' });
    const d = disabled(el); if (d) return { ...base, state: 'DISABLED', visible: true, enabled: false, reason: d };
    if (getComputedStyle(el).pointerEvents === 'none') return { ...base, state: 'NOT_INTERACTABLE', visible: true, enabled: true, reason: 'pointer-events: none' };
    return { ...base, state: 'VISIBLE', visible: true, enabled: true };
  };
  const cons = (e) => { if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName)) return undefined; const c = {}; if (e.required) c.required = true; for (const a of ['min', 'max', 'minlength', 'maxlength', 'pattern', 'step']) { const v = e.getAttribute(a); if (v !== null && v !== '') c[a] = v; } return Object.keys(c).length ? c : undefined; };
  const modals = () => qAll('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]').filter(vis).map((m) => ({ selector: sel(m), title: norm((m.querySelector('h1,h2,h3,h4,h5,.modal-title,[id*=title]') || {}).innerText || m.getAttribute('aria-label') || '').slice(0, 100) }));
  const textOf = () => { const parts = [norm(document.body ? document.body.innerText : '')]; for (const r of roots()) if (r !== document) parts.push(norm(r.textContent)); return parts.join(' '); };
  const inspect = (max) => {
    const els = qAll('a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=combobox],[role=radio],summary,[contenteditable=true]').filter(vis);
    return {
      url: location.href, title: document.title,
      headings: qAll('h1,h2,h3').filter(vis).slice(0, 30).map((h) => h.tagName.toLowerCase() + ': ' + norm(h.innerText).slice(0, 100)),
      interactive: els.slice(0, max).map((e) => ({ tag: e.tagName.toLowerCase(), type: e.type || undefined, role: e.getAttribute('role') || undefined, name: nameOf(e).slice(0, 80), selector: sel(e), disabled: disabled(e) ? true : undefined, in_shadow: e.getRootNode() !== document || undefined, constraints: cons(e), href: e.tagName === 'A' ? (e.getAttribute('href') || '').slice(0, 120) : undefined })),
      interactive_total: els.length,
      forms: [...document.forms].map((f) => ({ selector: sel(f), fields: [...f.elements].filter((x) => x.name || x.id).slice(0, 30).map((x) => ({ name: x.name || x.id, type: x.type, label: nameOf(x).slice(0, 60), required: x.required || undefined, selector: sel(x), visible: vis(x), constraints: cons(x) })) })),
      tables: qAll('table,[role=grid],[role=table]').filter(vis).slice(0, 10).map((t) => ({ selector: sel(t), headers: [...t.querySelectorAll('th,[role=columnheader]')].map((h) => norm(h.innerText)).filter(Boolean).slice(0, 25), rows: t.querySelectorAll('tbody tr,[role=row]').length })),
      alerts: qAll('[role=alert],[role=status],.alert,.toast,.error,.invalid-feedback').filter(vis).slice(0, 10).map((a) => norm(a.innerText).slice(0, 200)).filter(Boolean),
      modals_open: modals(), shadow_roots: roots().length - 1, iframes: qAll('iframe,frame').length,
    };
  };
  const a11y = () => {
    const out = {};
    const sample = (list) => list.slice(0, 8).map(sel);
    out.lang = { ok: !!document.documentElement.getAttribute('lang') };
    out.title = { ok: !!norm(document.title) };
    const imgs = qAll('img').filter((i) => vis(i) && !i.hasAttribute('alt') && i.getAttribute('role') !== 'presentation');
    out.img_alt = { ok: imgs.length === 0, count: imgs.length, samples: sample(imgs) };
    const fields = qAll('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea').filter((f) => vis(f) && !nameOf(f));
    out.form_labels = { ok: fields.length === 0, count: fields.length, samples: sample(fields) };
    const ctrls = qAll('button,a[href],[role=button],[role=link]').filter((b) => vis(b) && !nameOf(b));
    out.control_names = { ok: ctrls.length === 0, count: ctrls.length, samples: sample(ctrls) };
    const ids = {}; for (const e of document.querySelectorAll('[id]')) ids[e.id] = (ids[e.id] || 0) + 1;
    const dup = Object.entries(ids).filter(([, n]) => n > 1).map(([k]) => k);
    out.duplicate_ids = { ok: dup.length === 0, count: dup.length, samples: dup.slice(0, 8) };
    const hs = qAll('h1,h2,h3,h4,h5,h6').filter(vis).map((h) => Number(h.tagName[1]));
    let skip = 0; for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) skip++;
    out.heading_order = { ok: skip === 0, count: skip, h1: hs.filter((h) => h === 1).length };
    const pos = qAll('[tabindex]').filter((e) => Number(e.getAttribute('tabindex')) > 0);
    out.positive_tabindex = { ok: pos.length === 0, count: pos.length, samples: sample(pos) };
    const hiddenFocusable = qAll('[aria-hidden=true] a[href],[aria-hidden=true] button,[aria-hidden=true] input');
    out.aria_hidden_focusable = { ok: hiddenFocusable.length === 0, count: hiddenFocusable.length, samples: sample(hiddenFocusable) };
    return out;
  };
  const perf = () => { const n = performance.getEntriesByType('navigation')[0]; if (!n) return null; return { ttfb_ms: Math.round(n.responseStart - n.requestStart), dom_content_loaded_ms: Math.round(n.domContentLoadedEventEnd), load_ms: Math.round(n.loadEventEnd), transfer_bytes: n.transferSize, resources: performance.getEntriesByType('resource').length }; };
  const stable = (quietMs, maxMs) => new Promise((ok) => { let last = Date.now(); const mo = new MutationObserver(() => { last = Date.now(); }); mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true }); const t0 = Date.now(); const tick = () => { if (Date.now() - last >= quietMs) { mo.disconnect(); ok(true); } else if (Date.now() - t0 > maxMs) { mo.disconnect(); ok(false); } else setTimeout(tick, 50); }; tick(); });
  // back-compat for plans that used window.__dcore.find / element
  const find = (loc) => { const r = resolve(loc); return r.state === 'NOT_FOUND' ? { found: 0 } : { ...r, found: r.count }; };
  const element = (loc) => { resolve(loc); return window.__dcore._last; };
  window.__dcore = { v: 3, sel, cons, disabled, resolve, find, element, inspect, a11y, perf, vis, norm, nameOf, qAll, modals, textOf, stable, _last: null };
})()`;

const KEYS = { Enter: [13, '\r'], Tab: [9, ''], Escape: [27, ''], Backspace: [8, ''], Delete: [46, ''], ArrowDown: [40, ''], ArrowUp: [38, ''], ArrowLeft: [37, ''], ArrowRight: [39, ''], Space: [32, ' '], Home: [36, ''], End: [35, ''], PageDown: [34, ''], PageUp: [33, ''], Control: [17, ''], Shift: [16, ''], Alt: [18, ''], Meta: [91, ''] };
const MOD_BITS = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Command: 4, Shift: 8 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripQuery = (u) => { try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return `${x.protocol}${x.pathname.slice(0, 40)}${x.pathname.length > 40 ? '…' : ''}`; return x.origin + x.pathname + (x.search ? '?…' : ''); } catch { return String(u).slice(0, 200); } };
const CRED_NAME = /((^|[._-])credentials|(^|[.])env($|[.])|id_rsa|id_ed25519|[.](pem|key|p12|pfx)$|cookie|token|secret|password)/i;   // never uploaded

// ---- session (one per tab) ------------------------------------------------------------------------------------
class Session {
  constructor(cdp, sessionId, targetId, ctx) {
    Object.assign(this, { cdp, sessionId, targetId, ctx });
    this.sink = ctx.sink;
    this.inflight = new Map(); this.reqMethods = new Map(); this.loadFired = false; this.contexts = new Map(); this.mainFrameId = null;
  }
  send(m, p, t) { return this.cdp.send(m, p, this.sessionId, t); }
  async init() {
    const k = this.sink;
    this.cdp.on((m) => {
      if (m.sessionId !== this.sessionId) return;
      const p = m.params ?? {};
      switch (m.method) {
        case 'Page.loadEventFired': this.loadFired = true; break;
        case 'Page.navigatedWithinDocument': k.spaNavigations.push({ url: stripQuery(p.url), at: Date.now() }); break;
        case 'Runtime.executionContextCreated': { const a = p.context.auxData ?? {}; if (a.isDefault && a.frameId) this.contexts.set(a.frameId, p.context.id); break; }
        case 'Runtime.executionContextDestroyed': for (const [f, id] of this.contexts) if (id === p.executionContextId) this.contexts.delete(f); break;
        case 'Runtime.executionContextsCleared': this.contexts.clear(); break;
        case 'Network.requestWillBeSent':
          if (p.redirectResponse && p.type === 'Document') k.redirects.push({ from: stripQuery(p.redirectResponse.url), status: p.redirectResponse.status, to: stripQuery(p.request.url), at: Date.now() });
          if (!['WebSocket', 'EventSource'].includes(p.type)) this.inflight.set(p.requestId, p.request.url);
          if (['XHR', 'Fetch'].includes(p.type)) this.reqMethods.set(p.requestId, p.request.method);
          if (!p.redirectResponse && !['GET', 'HEAD', 'OPTIONS'].includes(p.request.method) && k.writes.length < 1000) k.writes.push({ method: p.request.method, url: stripQuery(p.request.url), type: p.type, at: Date.now() });
          break;
        case 'Fetch.requestPaused': this.onPaused(p).catch(() => {}); break;
        case 'Network.loadingFinished': this.inflight.delete(p.requestId); break;
        case 'Network.loadingFailed': this.inflight.delete(p.requestId); if (!this.ctx.faultedIds.has(p.requestId) && !p.canceled && !/ERR_ABORTED/.test(p.errorText)) k.network.push({ kind: 'failed', error: p.errorText, type: p.type }); break;
        case 'Network.responseReceived': if (['XHR', 'Fetch'].includes(p.type) && k.api.length < 1000) k.api.push({ method: this.reqMethods.get(p.requestId) ?? 'GET', url: stripQuery(p.response.url), status: p.response.status, type: p.type }); if (p.response.status >= 400 && !this.ctx.faultedIds.has(p.requestId)) (p.response.status >= 500 ? k.network : k.http4xx).push({ kind: 'http', status: p.response.status, url: stripQuery(p.response.url), type: p.type }); break;
        case 'Runtime.consoleAPICalled': if (['error', 'assert'].includes(p.type)) k.console.push((p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)); break;
        case 'Runtime.exceptionThrown': { const d = p.exceptionDetails ?? {}; const where = d.url ? ` (${stripQuery(d.url)}:${(d.lineNumber ?? 0) + 1})` : ''; k.pageErrors.push(String(d.exception?.description ?? d.text ?? 'exception').split('\n')[0].slice(0, 300) + where); break; }
        case 'Log.entryAdded': if (p.entry.level === 'error' && p.entry.source !== 'network') k.console.push(String(p.entry.text).slice(0, 300)); break;
        case 'Page.javascriptDialogOpening': k.dialogs.push({ type: p.type, message: String(p.message).slice(0, 200), action: p.type === 'alert' ? 'accept' : this.ctx.dialogPolicy }); this.send('Page.handleJavaScriptDialog', { accept: p.type === 'alert' || this.ctx.dialogPolicy === 'accept' }).catch(() => {}); break;
        default:
      }
    });
    for (const d of ['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable', 'DOM.enable']) await this.send(d);
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HELPERS });
    await this.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1366, screenHeight: 900 });
    this.mainFrameId = (await this.send('Page.getFrameTree')).frameTree.frame.id;
  }
  async eval(expr, { contextId, timeoutMs = 15_000 } = {}) {
    const r = await this.send('Runtime.evaluate', { expression: `${PAGE_HELPERS};(${expr})`, returnByValue: true, awaitPromise: true, ...(contextId ? { contextId } : {}) }, timeoutMs);
    if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).split('\n')[0]);
    return r.result?.value;
  }
  // fault injection (M42): answer matching requests locally — the server is never contacted for a faulted request
  async onPaused(p) {
    const ctx = this.ctx;
    const f = ctx.faults.find((x) => (x.times === undefined || x.hits < x.times) && x.method === p.request.method && x.re.test(p.request.url));
    if (!f) return this.send('Fetch.continueRequest', { requestId: p.requestId });
    f.hits++; if (p.networkId) ctx.faultedIds.add(p.networkId); ctx.faultLog.push({ mode: f.mode, method: p.request.method, url: stripQuery(p.request.url), at: new Date().toISOString() });
    const json = [{ name: 'Content-Type', value: 'application/json' }];
    const body = (txt) => Buffer.from(txt).toString('base64');
    switch (f.mode) {
      case 'server-error': return this.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: f.status ?? 500, responseHeaders: json, body: body('{"error":"DCore simulated server error"}') });
      case 'empty-response': return this.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: f.status ?? 200, responseHeaders: json, body: '' });
      case 'malformed-response': return this.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: f.status ?? 200, responseHeaders: json, body: body('{"dcore": [1, 2, "unterminated') });
      case 'network-failure': return this.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'InternetDisconnected' });
      case 'timeout': await sleep(f.delayMs); return this.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'TimedOut' });
      default: return this.send('Fetch.continueRequest', { requestId: p.requestId });
    }
  }
  async objectOf(contextId) { const r = await this.send('Runtime.evaluate', { expression: 'window.__dcore._last', returnByValue: false, ...(contextId ? { contextId } : {}) }); return r.result?.objectId ?? null; }
  async call(objectId, fn, args = []) {
    const r = await this.send('Runtime.callFunctionOn', { objectId, functionDeclaration: fn, arguments: args.map((value) => ({ value })), returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).split('\n')[0]);
    return r.result?.value;
  }
  async frames() {
    const out = [];
    const walk = (n, depth, parentId) => { const f = n.frame; out.push({ id: f.id, url: f.url, name: f.name ?? '', depth, parentId, contextId: this.contexts.get(f.id) ?? null }); for (const c of n.childFrames ?? []) walk(c, depth + 1, f.id); };
    walk((await this.send('Page.getFrameTree')).frameTree, 0, null);
    return out;
  }
  // frame spec: "name" | "url substring" | { selector } (an iframe element) | { name } | { url } | { index }
  async findFrame(spec, frames) {
    frames = frames ?? await this.frames();
    const sub = frames.filter((f) => f.depth > 0);
    if (spec === 'main' || spec === 0) return frames[0];
    if (typeof spec === 'string') return sub.find((f) => f.name === spec) ?? sub.find((f) => f.url.includes(spec)) ?? null;
    if (spec?.name) return sub.find((f) => f.name === spec.name) ?? null;
    if (spec?.url) return sub.find((f) => f.url.includes(spec.url)) ?? null;
    if (Number.isInteger(spec?.index)) return sub[spec.index] ?? null;
    if (spec?.selector) {
      for (const f of frames) {
        if (!f.contextId) continue;
        try {
          const r = await this.eval(`(() => { const e = window.__dcore.qAll(${JSON.stringify(spec.selector)}).find((x) => x.tagName === 'IFRAME' || x.tagName === 'FRAME'); window.__dcore._last = e || null; return !!e; })()`, { contextId: f.contextId });
          if (!r) continue;
          const oid = await this.objectOf(f.contextId);
          const node = (await this.send('DOM.describeNode', { objectId: oid })).node;
          if (node.frameId) return frames.find((x) => x.id === node.frameId) ?? null;
        } catch { /* frame navigating */ }
      }
    }
    return null;
  }
  async contextFor(spec) {
    if (spec === undefined) return { contextId: undefined, frame: null };
    const f = await this.findFrame(spec);
    if (!f || !f.contextId) return { blocked: `frame not found or not loaded: ${JSON.stringify(spec)}` };
    return { contextId: f.contextId, frame: f };
  }
  // one resolution attempt across frames; returns the classified element (page coordinates when interactable)
  async resolveOnce(loc) {
    const frames = await this.frames();
    let targets = frames;
    if (loc.frame !== undefined) { const f = await this.findFrame(loc.frame, frames); if (!f) return { state: 'BLOCKED', reason: `frame not found: ${JSON.stringify(loc.frame)}` }; targets = [f]; }
    const inner = { ...loc }; delete inner.frame;
    const hits = [];
    for (const f of targets) {
      if (!f.contextId) continue;
      let r;
      try { r = await this.eval(`window.__dcore.resolve(${JSON.stringify(inner)})`, { contextId: f.contextId }); } catch { continue; }
      if (r?.state === 'BLOCKED') return r;
      if (r && r.state !== 'NOT_FOUND') { hits.push({ ...r, frame: f }); if (loc.frame === undefined && f.depth === 0) break; }   // the main document wins
    }
    if (!hits.length) return { state: 'NOT_FOUND', frames_searched: targets.filter((f) => f.contextId).length };
    if (hits.length > 1 && loc.index === undefined && !loc.first) return { state: 'AMBIGUOUS', reason: `matches in ${hits.length} frames`, matches: hits.map((h) => ({ frame: stripQuery(h.frame.url), name: h.name, selector: h.selector })) };
    const r = hits[0];
    r.frame_url = r.frame.depth > 0 ? stripQuery(r.frame.url) : null;
    if (!['VISIBLE', 'DISABLED', 'NOT_INTERACTABLE'].includes(r.state)) return r;
    r.objectId = await this.objectOf(r.frame.contextId);
    if (!r.objectId) return { ...r, state: 'NOT_FOUND', reason: 'element detached' };
    try { await this.send('DOM.scrollIntoViewIfNeeded', { objectId: r.objectId }); } catch { /* best effort */ }
    const box = async () => { const q = (await this.send('DOM.getContentQuads', { objectId: r.objectId })).quads?.[0]; if (!q) return null; return { x: (q[0] + q[2] + q[4] + q[6]) / 4, y: (q[1] + q[3] + q[5] + q[7]) / 4, minX: Math.min(q[0], q[6]), minY: Math.min(q[1], q[3]), maxX: Math.max(q[2], q[4]), maxY: Math.max(q[5], q[7]) }; };
    let b1; try { b1 = await box(); } catch { b1 = null; }
    if (!b1) return { ...r, state: r.state === 'VISIBLE' ? 'NOT_INTERACTABLE' : r.state, reason: 'element has no layout box' };
    Object.assign(r, { x: b1.x, y: b1.y, box: b1 });
    if (r.state !== 'VISIBLE') return r;
    await sleep(60);
    const b2 = await box().catch(() => null);
    if (!b2 || Math.abs(b2.x - b1.x) > 2 || Math.abs(b2.y - b1.y) > 2) return { ...r, state: 'NOT_INTERACTABLE', reason: 'element is moving (animation/layout shift)' };
    const lm = await this.send('Page.getLayoutMetrics');
    const vp = lm.cssVisualViewport ?? {};
    if (vp.clientWidth && (r.x < 0 || r.y < 0 || r.x >= vp.clientWidth || r.y >= vp.clientHeight)) return { ...r, state: 'NOT_INTERACTABLE', reason: 'click point is outside the viewport' };
    // page-level hit test at the click point (sees overlays in any frame). Quads/mouse events use VIEWPORT coordinates;
    // DOM.getNodeForLocation uses DOCUMENT coordinates, so add the scroll offset (regression: scrolled pages).
    const scrollX = lm.cssLayoutViewport?.pageX ?? 0; const scrollY = lm.cssLayoutViewport?.pageY ?? 0;
    try {
      const hit = await this.send('DOM.getNodeForLocation', { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), includeUserAgentShadowDOM: false, ignorePointerEventsNone: true });
      const hitObj = (await this.send('DOM.resolveNode', { backendNodeId: hit.backendNodeId })).object?.objectId;
      // is the topmost node at the click point the element itself, a descendant (across shadow roots) or its label?
      const owns = hitObj ? (await this.send('Runtime.callFunctionOn', { objectId: r.objectId, functionDeclaration: 'function (h) { let n = h; while (n) { if (n === this) return true; n = n.parentNode || n.host; } try { if (this.labels && [...this.labels].some((l) => l === h || l.contains(h))) return true; } catch (e) { } return false; }', arguments: [{ objectId: hitObj }], returnByValue: true }).catch(() => null))?.result?.value : null;
      if (owns === false) {
        const by = await this.send('Runtime.callFunctionOn', { objectId: hitObj, functionDeclaration: 'function () { const e = this.nodeType === 1 ? this : this.parentElement; if (!e) return "node"; const t = (e.innerText || "").trim().slice(0, 40); return e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.classList && e.classList.length ? "." + [...e.classList].slice(0, 2).join(".") : "") + (t ? " [" + t + "]" : ""); }', returnByValue: true }).catch(() => null);
        return { ...r, state: 'VISIBLE_BUT_OBSTRUCTED', obstructed_by: by?.result?.value ?? 'another element' };
      }
    } catch { /* hit test unavailable: keep in-page classification */ }
    return { ...r, state: 'INTERACTABLE' };
  }
  // wait until the target reaches `need`: present | visible | interactable. Never returns success for NOT_FOUND/BLOCKED.
  async locate(loc, timeoutMs, need = 'interactable') {
    const end = Date.now() + timeoutMs; let last = { state: 'NOT_FOUND' }; let everFound = false;
    const ok = (r) => need === 'present' ? !['NOT_FOUND', 'AMBIGUOUS', 'BLOCKED'].includes(r.state) : need === 'visible' ? ['INTERACTABLE', 'VISIBLE_BUT_OBSTRUCTED', 'DISABLED', 'NOT_INTERACTABLE', 'VISIBLE'].includes(r.state) : r.state === 'INTERACTABLE';
    do {
      try { last = await this.resolveOnce(loc); } catch (e) { last = { state: 'NOT_FOUND', reason: e.message }; }
      if (last.state === 'BLOCKED') return { ...last, ok: false };
      if (last.state !== 'NOT_FOUND') everFound = true;
      const moving = /^element is moving/.test(last.reason ?? '');   // transient: wait for it to settle before judging
      if (ok(last) && !moving) return { ...last, ok: true };
      await sleep(150);
    } while (Date.now() < end);
    if (!everFound) return { ...last, state: 'NOT_FOUND', ok: false, waited_ms: timeoutMs };
    if (last.state === 'AMBIGUOUS') return { ...last, ok: false };
    return { ...last, state: 'TIMEOUT', last_state: last.state, ok: false, waited_ms: timeoutMs };
  }
  async settle(maxMs = 5000, quietMs = 500) {
    const end = Date.now() + maxMs; let quietSince = Date.now();
    while (Date.now() < end) { if (this.inflight.size === 0) { if (Date.now() - quietSince >= quietMs) return true; } else quietSince = Date.now(); await sleep(100); }
    return false;
  }
  async waitLoad(timeoutMs) { const end = Date.now() + timeoutMs; while (!this.loadFired && Date.now() < end) await sleep(100); return this.loadFired; }
  async mouse(x, y, { button = 'left', clickCount = 1 } = {}) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount });
  }
  // "Enter", "Shift+Tab", "Control+A"
  async key(combo) {
    const parts = String(combo).split('+').map((x) => x.trim()).filter(Boolean);
    const main = parts.pop() ?? '';
    const mods = parts.map((p) => (p === 'Ctrl' ? 'Control' : p === 'Command' ? 'Meta' : p));
    const bits = mods.reduce((a, m) => a | (MOD_BITS[m] ?? 0), 0);
    for (const m of mods) await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: m, windowsVirtualKeyCode: KEYS[m]?.[0] ?? 0, modifiers: bits });
    const [code, text] = KEYS[main] ?? [main.length === 1 ? main.toUpperCase().charCodeAt(0) : 0, main.length === 1 ? main : ''];
    const withText = text && !(bits & (MOD_BITS.Control | MOD_BITS.Meta | MOD_BITS.Alt));
    // headless Chrome does not map shortcuts to editing commands by itself: send them explicitly
    const cmd = (bits & (MOD_BITS.Control | MOD_BITS.Meta)) && main.length === 1 ? { a: 'selectAll', c: 'copy', x: 'cut', v: 'paste', z: 'undo', y: 'redo' }[main.toLowerCase()] : null;
    await this.send('Input.dispatchKeyEvent', { type: withText ? 'keyDown' : 'rawKeyDown', key: main, code: main.length === 1 ? `Key${main.toUpperCase()}` : main, windowsVirtualKeyCode: code, modifiers: bits, ...(withText ? { text } : {}), ...(cmd ? { commands: [cmd] } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: main, windowsVirtualKeyCode: code, modifiers: bits });
    for (const m of mods.reverse()) await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: m, windowsVirtualKeyCode: KEYS[m]?.[0] ?? 0, modifiers: 0 });
  }
}

const LOC_KEYS = ['selector', 'text', 'label', 'placeholder', 'testid', 'role', 'exact', 'index', 'first', 'frame', 'noScroll'];
const locOf = (s) => Object.fromEntries(LOC_KEYS.filter((k) => s?.[k] !== undefined).map((k) => [k, s[k]]));
const describe = (s) => Object.entries(locOf(s)).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
const stateText = (r) => `${r.state}${r.last_state ? ` (last state: ${r.last_state}${r.obstructed_by ? ` by ${r.obstructed_by}` : ''})` : ''}${r.state === 'VISIBLE_BUT_OBSTRUCTED' ? ` by ${r.obstructed_by}` : ''}${r.reason ? ` — ${r.reason}` : ''}${r.state === 'AMBIGUOUS' && r.matches ? `: ${r.matches.map((m) => `${m.name || m.selector}`).join(' | ')} (add "index" or a more specific locator)` : ''}`;
const elText = (r) => `${r.tag ?? '?'}${r.type ? `[${r.type}]` : ''} "${r.name ?? ''}"${r.frame_url ? ` in frame ${r.frame_url}` : ''}${r.in_shadow ? ' (shadow DOM)' : ''}`;
// a failed element resolution never becomes PASS: BLOCKED stays BLOCKED, an optional step becomes SKIPPED
const notOk = (op, s, L, r) => ({ op, result: r.state === 'BLOCKED' ? 'BLOCKED' : s.optional ? 'SKIPPED' : 'FAIL', element_state: r.state, detail: `${describe(L) || 'element'} → ${stateText(r)}`, stop: !s.optional });

const SETTER = 'function (v) { const proto = this instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : this instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(this, v); this.dispatchEvent(new Event("input", { bubbles: true })); this.dispatchEvent(new Event("change", { bubbles: true })); return this.value; }';
const READ_VALUE = 'function () { return this.isContentEditable ? this.innerText : (this.value ?? null); }';
const SET_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week', 'color', 'range']);

// Risk guard (scenario runs): a click on a state-changing control, or submitting a POST form, is BLOCKED unless the run
// carries the `ui-write` approval. Authentication forms (containing a password field) are not data changes.
const STATE_CHANGING = /\b(create|save|submit|delete|remove|revoke|destroy|drop|deactivate|disable|enable|pay|purchase|buy|checkout|transfer|send|confirm|approve|reject|publish|archive|import|update|reset|invite|assign|grant|log ?out|sign ?out)\b/i;
async function riskBlock(S, r, ctx, op) {
  if (!ctx.riskGuard || !r.objectId) return null;
  const info = await S.call(r.objectId, 'function () { const f = this.form || this.closest("form"); return { auth: !!(f && f.querySelector("input[type=password]")), postSubmit: !!f && (f.getAttribute("method") || "get").toLowerCase() === "post" && (this.type === "submit" || this.tagName === "BUTTON" && !this.getAttribute("type")) }; }').catch(() => ({}));
  if (info.auth) return null;
  if (STATE_CHANGING.test(r.name ?? '') || info.postSubmit) return { op, result: 'BLOCKED', element_state: r.state, detail: `state-changing control ${elText(r)} was NOT clicked: requires the "ui-write" approval (--approve ui-write)`, stop: true };
  return null;
}

async function clickTarget(S, r, opts = {}) {
  if (opts.force && r.state !== 'INTERACTABLE') { await S.call(r.objectId, 'function () { this.click(); }'); return 'forced JS click'; }
  await S.mouse(r.x, r.y, { button: opts.button ?? 'left', clickCount: opts.double ? 2 : 1 });
  return 'mouse click';
}

// Execute one step; returns { result, detail, element_state? }. Action failures stop the run/case; assertion failures don't.
export const FAULT_MODES = ['server-error', 'network-failure', 'timeout', 'empty-response', 'malformed-response'];
// a path such as /api/tokens/:id matches any value in the :id segment
const urlRe = (u) => new RegExp(String(u).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/:[A-Za-z_]\w*/g, '/[^/?#]+'));
const cookieParam = (c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, ...(c.sameSite ? { sameSite: c.sameSite } : {}), ...(c.session || !(c.expires > 0) ? {} : { expires: c.expires }) });
const OPS = ['intercept', 'session', 'goto', 'click', 'fill', 'type', 'clear', 'select', 'press', 'check', 'uncheck', 'hover', 'upload', 'download', 'wait', 'waitFor', 'assertText', 'assertNoText', 'assertUrl', 'assertTitle', 'assertVisible', 'assertHidden', 'assertState', 'assertValue', 'assertModal', 'assertCount', 'screenshot', 'inspect', 'text', 'a11y', 'perf', 'viewport', 'evaluate', 'dialog', 'back', 'forward', 'reload', 'switchTab', 'closeTab'];
async function step(ctx, s) {
  const S = ctx.page;
  const t = s.timeoutMs ?? ctx.stepTimeoutMs;
  const nav = s.timeoutMs ?? Math.max(ctx.stepTimeoutMs, ctx.navTimeoutMs ?? 30_000);   // navigation has its own budget (element waits are short)
  const op = Object.keys(s).find((k) => OPS.includes(k));
  if (!op) return { op: '?', result: 'FAIL', detail: `unknown step: ${JSON.stringify(Object.keys(s))}`, stop: true };
  const v = s[op];
  const L = typeof v === 'object' && v !== null && !Array.isArray(v) ? v : s;   // locator may live inside the op object or alongside it
  const inFrame = async (fn) => { const c = await S.contextFor(L.frame); if (c.blocked) return { op, result: 'BLOCKED', detail: c.blocked }; return fn(c.contextId); };
  switch (op) {
    case 'goto': {
      const url = typeof v === 'string' ? v : v.url;
      if (!/^https?:\/\//i.test(url) && !/^about:|^data:/.test(url)) return { op, result: 'FAIL', detail: `refusing non-http URL: ${url}`, stop: true };
      const r0 = ctx.sink.redirects.length;
      S.loadFired = false;
      let r;
      try { r = await S.send('Page.navigate', { url }, nav); } catch (e) { return { op, result: 'FAIL', element_state: 'TIMEOUT', detail: `navigation TIMEOUT: ${stripQuery(url)} did not commit within ${nav} ms (${e.message})`, stop: true }; }
      if (r.errorText) return { op, result: 'FAIL', detail: `navigation failed: ${r.errorText}`, stop: true };
      await S.waitLoad(nav); await S.settle(ctx.settleMs);
      const chain = ctx.sink.redirects.slice(r0);
      return { op, result: 'PASS', detail: `navigated to ${stripQuery(await S.eval('location.href'))}${chain.length ? ` (redirects: ${chain.map((c) => `${c.status} ${c.from} -> ${c.to}`).join(', ')})` : ''}` };
    }
    case 'back': case 'forward': {
      const before = await S.eval('location.href');
      await S.eval(op === 'back' ? 'history.back()' : 'history.forward()'); await sleep(400); await S.settle(ctx.settleMs);
      const after = await S.eval('location.href');
      return { op, result: after !== before ? 'PASS' : 'FAIL', detail: after !== before ? `history.${op}(): ${stripQuery(before)} -> ${stripQuery(after)}` : `history.${op}() did not change the URL (${stripQuery(after)}): no ${op === 'back' ? 'previous' : 'next'} entry?` };
    }
    case 'reload': S.loadFired = false; await S.send('Page.reload', {}, nav); await S.waitLoad(nav); await S.settle(ctx.settleMs); return { op, result: 'PASS', detail: 'reloaded' };
    case 'click': case 'hover': {
      const r = await S.locate(locOf(L), t, op === 'hover' ? 'visible' : 'interactable');
      if (!r.ok && !(L.force && ['VISIBLE_BUT_OBSTRUCTED', 'NOT_INTERACTABLE', 'TIMEOUT'].includes(r.state) && r.objectId)) return notOk(op, s, L, r);
      if (op === 'hover') { await S.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y }); await sleep(200); return { op, result: 'PASS', element_state: r.state, detail: `hovered ${elText(r)}` }; }
      const risk = await riskBlock(S, r, ctx, op); if (risk) return risk;
      S.loadFired = false;
      const how = await clickTarget(S, r, { force: L.force, button: L.button, double: L.double ?? s.double });
      await sleep(150); await S.settle(ctx.settleMs);
      return { op, result: 'PASS', element_state: r.state, detail: `clicked ${elText(r)} (${r.selector}) via ${how}${how.startsWith('forced') ? ` — element was ${r.last_state ?? r.state}` : ''}` };
    }
    case 'fill': case 'type': case 'clear': {
      let value = op === 'clear' ? '' : (L.value ?? s.value ?? (op === 'type' && typeof v === 'string' ? v : undefined));
      const envName = L.valueEnv ?? s.valueEnv;
      if (envName) { value = process.env[envName]; if (value === undefined) return { op, result: 'BLOCKED', detail: `env var ${envName} is not set`, stop: true }; ctx.secrets.push(value); }
      if (value === undefined) return { op, result: 'FAIL', detail: `${op} needs "value" or "valueEnv"`, stop: true };
      value = String(value);
      const r = await S.locate(locOf(L), t, 'interactable');
      if (!r.ok) return notOk(op, s, L, r);
      if (!r.editable) return { op, result: 'FAIL', element_state: 'NOT_INTERACTABLE', detail: `${elText(r)} is not an editable field`, stop: true };
      const secret = !!envName || r.type === 'password';
      if (secret && value) ctx.secrets.push(value);
      const shown = secret ? '[REDACTED]' : JSON.stringify(value.slice(0, 60));
      // `type` into an already-focused field keeps the caret/selection (e.g. after Control+A); otherwise click to focus
      const focused = op === 'type' && !L.clear && await S.call(r.objectId, 'function () { return this.getRootNode().activeElement === this || document.activeElement === this; }');
      if (!focused) await S.mouse(r.x, r.y);
      let got;
      if (SET_TYPES.has(r.type)) got = await S.call(r.objectId, SETTER, [value]);     // native pickers ignore typed text
      else {
        if (op !== 'type' || L.clear) await S.call(r.objectId, 'function () { this.focus(); if (this.select) this.select(); else if (this.isContentEditable) { const s = getSelection(); const rg = document.createRange(); rg.selectNodeContents(this); s.removeAllRanges(); s.addRange(rg); } }');
        else if (!focused) await S.call(r.objectId, 'function () { this.focus(); if (this.setSelectionRange && this.value !== undefined) { try { this.setSelectionRange(this.value.length, this.value.length); } catch (e) { } } }');
        if (op === 'type') for (const ch of value) { await S.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch }); await S.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); if (L.delayMs) await sleep(L.delayMs); }
        else if (value === '') await S.key('Backspace');
        else await S.send('Input.insertText', { text: value });
        if (op !== 'type') await S.call(r.objectId, 'function () { this.dispatchEvent(new Event("change", { bubbles: true })); }').catch(() => {});
        got = await S.call(r.objectId, READ_VALUE);
      }
      // verify the value actually landed (explained differences only: maxlength truncation, browser sanitisation)
      const gotS = got === null || got === undefined ? '' : String(got);
      const expected = op === 'type' && !L.clear ? null : value;
      if (expected === null ? gotS.endsWith(value) : gotS === expected || (r.tag !== 'input' && r.tag !== 'textarea' && gotS.trim() === expected.trim())) return { op, result: 'PASS', element_state: r.state, detail: `${op === 'type' ? 'typed' : op === 'clear' ? 'cleared' : 'filled'} ${elText(r)} with ${shown} (value verified)` };
      if (r.maxlength && expected !== null && gotS === expected.slice(0, r.maxlength)) return { op, result: 'PASS', element_state: r.state, detail: `filled ${elText(r)} with ${shown}: browser truncated to maxlength ${r.maxlength} (verified)` };
      if (['number', 'email', 'url'].includes(r.type) && gotS === '' && expected !== null && expected !== '') return { op, result: 'PASS', element_state: r.state, detail: `filled ${elText(r)} with ${shown}: the browser rejected the input for a ${r.type} field (value stays empty; verified)` };
      if ((SET_TYPES.has(r.type) || r.type === 'number') && expected !== null && gotS !== expected) return { op, result: 'PASS', element_state: r.state, detail: `filled ${elText(r)} with ${shown}: the browser sanitised it to ${JSON.stringify(gotS.slice(0, 40))} for a ${r.type} field (verified)` };
      return { op, result: 'FAIL', element_state: r.state, detail: `value not applied to ${elText(r)}: expected ${shown}, field holds ${secret ? '[REDACTED]' : JSON.stringify(gotS.slice(0, 60))}`, stop: true };
    }
    case 'select': {
      const want = String(L.option ?? L.value ?? (Number.isInteger(L.optionIndex) ? '' : ''));
      const r = await S.locate(locOf(L), t, 'interactable');
      if (!r.ok) return notOk(op, s, L, r);
      if (r.tag === 'select') {
        const res = await S.call(r.objectId, 'function (want, idx) { const opts = [...this.options]; const w = String(want).toLowerCase(); const o = Number.isInteger(idx) ? opts[idx] : opts.find((x) => x.value.toLowerCase() === w || x.text.trim().toLowerCase() === w); if (!o) return { ok: false, available: opts.slice(0, 15).map((x) => x.text.trim()) }; if (o.disabled) return { ok: false, disabled: true }; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(this, o.value); this.dispatchEvent(new Event("input", { bubbles: true })); this.dispatchEvent(new Event("change", { bubbles: true })); return { ok: this.value === o.value && this.selectedOptions[0] === o, text: o.text.trim() }; }', [want, L.optionIndex ?? null]);
        await S.settle(ctx.settleMs);
        return res?.ok ? { op, result: 'PASS', element_state: r.state, detail: `selected "${res.text}" in ${elText(r)} (verified)` } : { op, result: 'FAIL', element_state: r.state, detail: res?.disabled ? `option "${want}" is disabled` : `option "${want}" not found in ${elText(r)}; available: ${(res?.available ?? []).join(' | ')}`, stop: true };
      }
      // custom dropdown / combobox: open it, click the option, verify the trigger now shows it
      await clickTarget(S, r); await sleep(200);
      const optLoc = { text: want, role: 'option', ...(L.frame !== undefined ? { frame: L.frame } : {}), first: true };
      let o = await S.locate(optLoc, Math.min(t, 5000), 'interactable');
      if (!o.ok) o = await S.locate({ text: want, first: true, ...(L.frame !== undefined ? { frame: L.frame } : {}) }, Math.min(t, 3000), 'interactable');
      if (!o.ok) return { op, result: 'FAIL', element_state: o.state, detail: `custom dropdown ${elText(r)} opened but option "${want}": ${stateText(o)}`, stop: true };
      await clickTarget(S, o); await sleep(250); await S.settle(ctx.settleMs);
      const after = await S.locate({ ...locOf(L), first: true }, 2000, 'present');
      const shownNow = after.objectId ? await S.call(after.objectId, 'function () { return (this.value ?? "") + " " + (this.innerText ?? "") + " " + (this.getAttribute("aria-label") ?? ""); }').catch(() => '') : (after.name ?? '');
      const confirmed = String(shownNow).toLowerCase().includes(want.toLowerCase()) || String(after.name ?? '').toLowerCase().includes(want.toLowerCase());
      return confirmed ? { op, result: 'PASS', element_state: r.state, detail: `chose "${want}" in custom dropdown ${elText(r)} (verified on the trigger)` } : { op, result: 'FAIL', element_state: r.state, detail: `clicked option "${want}" but the dropdown ${elText(r)} does not show it (selection not confirmed)`, stop: true };
    }
    case 'check': case 'uncheck': {
      const want = op === 'check';
      const r = await S.locate(locOf(L), t, 'present');
      if (!r.ok) return notOk(op, s, L, r);
      const oid = r.objectId ?? await S.objectOf(r.frame?.contextId);
      const read = 'function () { if (this.type === "checkbox" || this.type === "radio") return this.checked; const a = this.getAttribute("aria-checked") ?? this.getAttribute("aria-pressed"); return a === null ? null : a === "true"; }';
      const before = await S.call(oid, read);
      if (before === null) return { op, result: 'FAIL', element_state: r.state, detail: `${elText(r)} is not a checkbox/radio/switch (no checked state)`, stop: true };
      if (before === want) return { op, result: 'PASS', element_state: r.state, detail: `${elText(r)} already ${want ? 'checked' : 'unchecked'} (no click)` };
      if (!want && r.type === 'radio') return { op, result: 'FAIL', element_state: r.state, detail: 'a radio button cannot be unchecked directly; check another option in the group', stop: true };
      let target = r;
      if (r.state !== 'INTERACTABLE') {   // custom-styled inputs are often hidden: click their visible label instead
        const lab = await S.call(oid, 'function () { const ls = this.labels ? [...this.labels] : []; const l = ls.find((x) => x.checkVisibility ? x.checkVisibility() : x.offsetParent !== null); if (!l) return null; window.__dcore._last = l; return true; }');
        if (lab) { const lo = await S.objectOf(r.frame?.contextId); const q = (await S.send('DOM.getContentQuads', { objectId: lo })).quads?.[0]; if (q) target = { ...r, x: (q[0] + q[4]) / 2, y: (q[1] + q[5]) / 2, state: 'INTERACTABLE', via: 'label' }; }
        else { const w = await S.locate(locOf(L), t, 'interactable'); if (!w.ok) return notOk(op, s, L, w); target = w; }
      }
      await S.mouse(target.x, target.y); await sleep(150); await S.settle(ctx.settleMs);
      const after = await S.call(oid, read);
      return after === want ? { op, result: 'PASS', element_state: target.state, detail: `${want ? 'checked' : 'unchecked'} ${elText(r)}${target.via ? ' via its label' : ''} (verified)` } : { op, result: 'FAIL', element_state: target.state, detail: `clicked ${elText(r)} but it is still ${after ? 'checked' : 'unchecked'}`, stop: true };
    }
    case 'press': {
      const combo = typeof v === 'string' ? v : v.key;
      if (typeof v === 'object' && Object.keys(locOf(v)).some((k) => k !== 'frame')) {
        const r = await S.locate(locOf(v), t, 'interactable');
        if (!r.ok) return notOk(op, s, v, r);
        await S.call(r.objectId, 'function () { this.focus(); }');
      }
      if (ctx.riskGuard && /^Enter$/i.test(combo)) {
        const sub = await S.eval('(() => { const e = document.activeElement; const f = e && (e.form || (e.closest && e.closest("form"))); return !!f && (f.getAttribute("method") || "get").toLowerCase() === "post" && !f.querySelector("input[type=password]"); })()').catch(() => false);
        if (sub) return { op, result: 'BLOCKED', detail: 'Enter would submit a POST form: requires the "ui-write" approval (--approve ui-write)', stop: true };
      }
      await S.key(combo); await sleep(150); await S.settle(ctx.settleMs);
      return { op, result: 'PASS', detail: `pressed ${combo}` };
    }
    case 'upload': {
      const files = [].concat(L.files ?? L.file ?? []);
      if (!files.length) return { op, result: 'FAIL', detail: 'upload needs "files"', stop: true };
      const roots = (ctx.uploadRoots ?? [process.cwd()]).map((x) => resolve(x));
      const abs = [];
      for (const f of files) {
        const p = resolve(f);
        if (!roots.some((rt) => { const rel = relative(rt, p); return rel && !rel.startsWith('..') && !isAbsolute(rel); })) return { op, result: 'BLOCKED', detail: `refusing to upload ${basename(p)}: outside the allowed upload directories (${roots.join(', ')})`, stop: true };
        if (CRED_NAME.test(basename(p))) return { op, result: 'BLOCKED', detail: `refusing to upload a credential-like file: ${basename(p)}`, stop: true };
        if (!existsSync(p) || !statSync(p).isFile()) return { op, result: 'BLOCKED', detail: `upload file not found: ${f}`, stop: true };
        abs.push(p);
      }
      const r = await S.locate(locOf(L), t, 'present');
      if (!r.ok) return notOk(op, s, L, r);
      if (!(r.tag === 'input' && r.type === 'file')) return { op, result: 'FAIL', element_state: r.state, detail: `${elText(r)} is not an <input type=file>`, stop: true };
      const oid = r.objectId ?? await S.objectOf(r.frame?.contextId);
      await S.send('DOM.setFileInputFiles', { files: abs, objectId: oid });
      const names = await S.call(oid, 'function () { return [...this.files].map((f) => f.name); }');
      const ok = names.length === abs.length && abs.every((p) => names.includes(basename(p)));
      await S.settle(ctx.settleMs);
      return { op, result: ok ? 'PASS' : 'FAIL', element_state: r.state, detail: ok ? `attached ${names.join(', ')} to ${elText(r)} (verified on input.files)` : `files not attached (input reports ${JSON.stringify(names)})`, stop: !ok };
    }
    case 'download': {
      const before = new Set(ctx.sink.downloads.map((d) => d.guid));
      const r = await S.locate(locOf(L), t, 'interactable');
      if (!r.ok) return notOk(op, s, L, r);
      await clickTarget(S, r);
      const end = Date.now() + (L.waitMs ?? 30_000);
      let d;
      while (Date.now() < end) { d = ctx.sink.downloads.find((x) => !before.has(x.guid) && ['completed', 'canceled'].includes(x.state)); if (d) break; await sleep(150); }
      if (!d) return { op, result: 'FAIL', element_state: 'TIMEOUT', detail: `no download completed within ${L.waitMs ?? 30_000} ms after clicking ${elText(r)}`, stop: true };
      if (d.state === 'canceled') return { op, result: 'FAIL', detail: `download canceled: ${d.suggested_filename}`, stop: true };
      const raw = join(ctx.downloadDir, d.guid);
      const file = join(ctx.downloadDir, `${d.guid.slice(0, 8)}-${String(d.suggested_filename ?? 'download').replace(/[^\w.-]/g, '_')}`);
      try { renameSync(raw, file); } catch { /* keep guid name */ }
      const path = existsSync(file) ? file : raw;
      if (!existsSync(path)) return { op, result: 'FAIL', detail: 'download reported complete but no file was written', stop: true };
      const buf = readFileSync(path);
      d.file = path; d.bytes = buf.length; d.sha256 = createHash('sha256').update(buf).digest('hex');
      const e = L.expect ?? {}; const probs = [];
      if (e.name && !new RegExp(e.name, 'i').test(d.suggested_filename ?? '')) probs.push(`name "${d.suggested_filename}" !~ /${e.name}/`);
      if (e.minBytes !== undefined && buf.length < e.minBytes) probs.push(`${buf.length} bytes < ${e.minBytes}`);
      if (e.maxBytes !== undefined && buf.length > e.maxBytes) probs.push(`${buf.length} bytes > ${e.maxBytes}`);
      if (e.contains !== undefined && !buf.subarray(0, 2_000_000).toString('utf8').includes(e.contains)) probs.push(`content does not contain "${e.contains}"`);
      if (e.sha256 && e.sha256 !== d.sha256) probs.push('sha256 mismatch');
      return { op, result: probs.length ? 'FAIL' : 'PASS', detail: `downloaded "${d.suggested_filename}" (${buf.length} bytes, sha256 ${d.sha256.slice(0, 12)}…)${probs.length ? ` — ${probs.join('; ')}` : ' (verified)'}` };
    }
    case 'wait': { await sleep(Math.min(Number(v), 30_000)); return { op, result: 'PASS', detail: `waited ${v} ms` }; }
    case 'waitFor': {
      const cond = typeof v === 'string' ? { text: v } : v;
      if (cond.stable) { const ok = await inFrame((cid) => S.eval(`window.__dcore.stable(${Number(cond.quietMs ?? 500)}, ${t})`, { contextId: cid, timeoutMs: t + 2000 })); if (ok?.op) return ok; return { op, result: ok ? 'PASS' : 'FAIL', detail: ok ? `DOM stable for ${cond.quietMs ?? 500} ms` : `DOM still changing after ${t} ms`, stop: !ok && !s.optional }; }
      const end = Date.now() + t;
      // an element condition (selector/label/placeholder/testid/role, or text + role/state); plain {text} waits on page text
      const hasLoc = ['selector', 'label', 'placeholder', 'testid', 'role'].some((k) => cond[k] !== undefined) || (cond.text !== undefined && cond.state !== undefined);
      const want = cond.gone ? 'gone' : (cond.state ?? (hasLoc ? 'visible' : null));
      let last = null;
      while (Date.now() < end) {
        let ok = false;
        try {
          if (cond.url) ok = (await S.eval('location.href')).includes(cond.url);
          else if (want === 'gone') { const g = typeof cond.gone === 'string' ? { text: cond.gone } : cond.gone; last = await S.resolveOnce({ ...g, first: true }); ok = ['NOT_FOUND', 'FOUND'].includes(last.state); }
          else if (hasLoc) {
            last = await S.resolveOnce({ ...locOf(cond), first: true });
            const st = last.state;
            ok = { visible: ['INTERACTABLE', 'VISIBLE_BUT_OBSTRUCTED', 'DISABLED', 'NOT_INTERACTABLE'].includes(st), hidden: ['FOUND', 'NOT_FOUND'].includes(st), detached: st === 'NOT_FOUND', attached: !['NOT_FOUND', 'BLOCKED'].includes(st), enabled: ['INTERACTABLE', 'VISIBLE_BUT_OBSTRUCTED', 'NOT_INTERACTABLE'].includes(st), disabled: st === 'DISABLED', interactable: st === 'INTERACTABLE' }[want] ?? false;
            if (st === 'BLOCKED') return { op, result: 'BLOCKED', detail: stateText(last) };
          } else if (cond.text !== undefined) { const c = await S.contextFor(cond.frame); if (c.blocked) { last = { state: 'BLOCKED', reason: c.blocked }; } else ok = (await S.eval('window.__dcore.textOf()', { contextId: c.contextId })).toLowerCase().includes(String(cond.text).toLowerCase()); }
        } catch { ok = false; }
        if (ok) { await S.settle(ctx.settleMs); return { op, result: 'PASS', ...(last ? { element_state: last.state } : {}), detail: `condition met: ${JSON.stringify(cond)}` }; }
        await sleep(200);
      }
      return { op, result: s.optional ? 'SKIPPED' : 'FAIL', element_state: 'TIMEOUT', detail: `TIMEOUT after ${t} ms waiting for ${JSON.stringify(cond)}${last ? ` (last state: ${last.state})` : ''}`, stop: !s.optional };
    }
    case 'assertText': case 'assertNoText': {
      const want = typeof v === 'string' ? v : v.text;
      return inFrame(async (cid) => {
        const present = (await S.eval('window.__dcore.textOf()', { contextId: cid })).toLowerCase().includes(String(want).toLowerCase());
        const ok = op === 'assertText' ? present : !present;
        return { op, result: ok ? 'PASS' : 'FAIL', detail: `text "${want}" ${present ? 'present' : 'absent'}${L.frame !== undefined ? ` in frame ${JSON.stringify(L.frame)}` : ''}` };
      });
    }
    case 'assertUrl': { const href = await S.eval('location.href'); const ok = typeof v === 'string' ? href.includes(v) : new RegExp(v.matches).test(href); return { op, result: ok ? 'PASS' : 'FAIL', detail: `url ${stripQuery(href)} ${ok ? 'matches' : 'does not match'} ${JSON.stringify(v)}` }; }
    case 'assertTitle': { const title = await S.eval('document.title'); const ok = title.toLowerCase().includes(String(v).toLowerCase()); return { op, result: ok ? 'PASS' : 'FAIL', detail: `title "${title}"` }; }
    case 'assertVisible': {
      const loc = typeof v === 'string' ? { text: v } : locOf(L);
      const r = await S.locate({ ...loc, first: loc.index === undefined ? true : undefined }, t, 'visible');
      if (!r.ok) return { op, result: r.state === 'BLOCKED' ? 'BLOCKED' : 'FAIL', element_state: r.state, detail: `not visible: ${describe(loc)} → ${stateText(r)}` };
      return { op, result: 'PASS', element_state: r.state, detail: `visible: ${elText(r)}${r.state !== 'INTERACTABLE' ? ` [${r.state}${r.obstructed_by ? ` by ${r.obstructed_by}` : ''}]` : ''}` };
    }
    case 'assertHidden': {
      const loc = typeof v === 'string' ? { text: v } : locOf(L);
      const r = await S.resolveOnce({ ...loc, first: true });
      const hidden = ['NOT_FOUND', 'FOUND'].includes(r.state);
      return { op, result: r.state === 'BLOCKED' ? 'BLOCKED' : hidden ? 'PASS' : 'FAIL', element_state: r.state, detail: `${describe(loc)} is ${r.state}` };
    }
    case 'assertState': {
      const wantState = String(L.state ?? '').toUpperCase();
      const loc = locOf(L);
      const r = wantState === 'NOT_FOUND' || wantState === 'HIDDEN' ? await S.resolveOnce({ ...loc, first: loc.index === undefined ? true : undefined }) : await S.locate({ ...loc, first: loc.index === undefined ? true : undefined }, Math.min(t, 3000), 'present');
      if (r.state === 'BLOCKED') return { op, result: 'BLOCKED', detail: stateText(r) };
      const st = r.state === 'TIMEOUT' ? r.last_state : r.state;
      let actual = st;
      if (['CHECKED', 'UNCHECKED'].includes(wantState)) actual = r.checked === null || r.checked === undefined ? `${st} (no checked state)` : r.checked ? 'CHECKED' : 'UNCHECKED';
      const ok = { VISIBLE: ['INTERACTABLE', 'VISIBLE_BUT_OBSTRUCTED', 'DISABLED', 'NOT_INTERACTABLE'].includes(st), HIDDEN: ['FOUND', 'NOT_FOUND'].includes(st), ENABLED: ['INTERACTABLE', 'VISIBLE_BUT_OBSTRUCTED', 'NOT_INTERACTABLE'].includes(st) && st !== 'DISABLED', FOUND: !['NOT_FOUND', 'AMBIGUOUS'].includes(st) }[wantState] ?? actual === wantState;
      return { op, result: ok ? 'PASS' : 'FAIL', element_state: st, detail: `${describe(loc)} → expected ${wantState}, actual ${actual}${r.obstructed_by ? ` (obstructed by ${r.obstructed_by})` : ''}${r.reason ? ` — ${r.reason}` : ''}` };
    }
    case 'assertValue': {
      // the field's current value (input/textarea value, selected option text, or element text) equals / contains
      const r = await S.locate({ ...locOf(L), first: L.index === undefined ? true : undefined }, t, 'present');
      if (!r.ok) return notOk(op, { ...s, optional: false }, L, r);
      const oid = r.objectId ?? await S.objectOf(r.frame?.contextId);
      const got = String(await S.call(oid, 'function () { if (this.tagName === "SELECT") return this.selectedOptions[0] ? this.selectedOptions[0].text.trim() : ""; if (this.value !== undefined && ["INPUT", "TEXTAREA"].includes(this.tagName)) return this.value; return (this.innerText || this.textContent || "").trim(); }') ?? '');
      const secret = r.type === 'password';
      const ok = L.equals !== undefined ? got === String(L.equals) : L.contains !== undefined ? got.toLowerCase().includes(String(L.contains).toLowerCase()) : L.matches !== undefined ? new RegExp(L.matches).test(got) : got !== '';
      const want = L.equals !== undefined ? `== ${JSON.stringify(String(L.equals))}` : L.contains !== undefined ? `contains ${JSON.stringify(String(L.contains))}` : L.matches !== undefined ? `~ /${L.matches}/` : 'is not empty';
      return { op, result: ok ? 'PASS' : 'FAIL', element_state: r.state, detail: `value of ${elText(r)} ${want}: actual ${secret ? '[REDACTED]' : JSON.stringify(got.slice(0, 80))}` };
    }
    case 'assertModal': {
      const wantOpen = (typeof v === 'object' ? v.open : v) !== false;
      const end = Date.now() + Math.min(t, 5000); let ms = [];
      do { ms = await S.eval('window.__dcore.modals()').catch(() => []); const hit = ms.filter((m) => !v?.title || m.title.toLowerCase().includes(String(v.title).toLowerCase())); if (wantOpen ? hit.length : !hit.length) return { op, result: 'PASS', detail: wantOpen ? `modal open: ${hit.map((m) => m.title || m.selector).join(' | ')}` : 'no modal open' }; await sleep(150); } while (Date.now() < end);
      return { op, result: 'FAIL', detail: wantOpen ? `no open modal${v?.title ? ` titled "${v.title}"` : ''} (open: ${ms.map((m) => m.title || m.selector).join(' | ') || 'none'})` : `modal still open: ${ms.map((m) => m.title || m.selector).join(' | ')}` };
    }
    case 'assertCount': {
      return inFrame(async (cid) => {
        const n = await S.eval(`window.__dcore.qAll(${JSON.stringify(v.selector)}).filter(window.__dcore.vis).length`, { contextId: cid });
        const ok = (v.min === undefined || n >= v.min) && (v.max === undefined || n <= v.max) && (v.equals === undefined || n === v.equals);
        return { op, result: ok ? 'PASS' : 'FAIL', detail: `${n} visible "${v.selector}" (want ${JSON.stringify({ min: v.min, max: v.max, equals: v.equals })})` };
      });
    }
    case 'screenshot': {
      const name = String((typeof v === 'string' ? v : v.name) ?? `shot-${ctx.shots.length + 1}`).replace(/[^\w.-]/g, '_');
      let clip;
      if (typeof v === 'object' && Object.keys(locOf(v)).length) {
        const r = await S.locate({ ...locOf(v), first: true }, t, 'visible');
        if (!r.ok || !r.box) return notOk(op, { optional: true }, v, r);
        clip = { x: Math.max(0, r.box.minX), y: Math.max(0, r.box.minY), width: Math.max(1, r.box.maxX - r.box.minX), height: Math.max(1, r.box.maxY - r.box.minY), scale: 1 };
      } else if (typeof v === 'object' && v.fullPage) { const m = await S.send('Page.getLayoutMetrics'); const c = m.cssContentSize ?? m.contentSize; clip = { x: 0, y: 0, width: Math.min(c.width, 2000), height: Math.min(c.height, 12000), scale: 1 }; }
      const r = await S.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
      const file = join(ctx.outDir, `${String(ctx.shots.length + 1).padStart(2, '0')}-${name}.png`);
      writeFileSync(file, Buffer.from(r.data, 'base64'));
      ctx.shots.push(file);
      return { op, result: 'PASS', detail: `saved ${file}` };
    }
    case 'inspect': {
      return inFrame(async (cid) => {
        const data = await S.eval(`window.__dcore.inspect(${Number(v?.max ?? 120)})`, { contextId: cid });
        data.frames = (await S.frames()).filter((f) => f.depth > 0).map((f) => ({ url: stripQuery(f.url), name: f.name || undefined, depth: f.depth, accessible: !!f.contextId }));
        data.tabs = ctx.tabs.filter((x) => !x.closed).map((x) => ({ url: stripQuery(x.url), title: x.title, current: x.targetId === S.targetId }));
        ctx.inspections.push(data);
        return { op, result: 'PASS', detail: `${data.interactive_total} interactive elements, ${data.tables.length} tables, ${data.forms.length} forms, ${data.frames.length} frame(s), ${data.shadow_roots} shadow root(s), ${data.modals_open.length} open modal(s) on "${data.title}"` };
      });
    }
    case 'text': { return inFrame(async (cid) => { const txt = (await S.eval('window.__dcore.textOf()', { contextId: cid })).slice(0, Number(v?.max ?? 4000)); ctx.texts.push(txt); return { op, result: 'PASS', detail: `captured ${txt.length} chars of page text` }; }); }
    case 'a11y': {
      const r = await S.eval('window.__dcore.a11y()'); ctx.a11y.push(r);
      const bad = Object.entries(r).filter(([, x]) => !x.ok).map(([k]) => k);
      return { op, result: bad.length ? 'FAIL' : 'PASS', detail: bad.length ? `accessibility findings: ${bad.join(', ')}` : 'basic accessibility checks passed (not a WCAG audit)', a11y: true };
    }
    case 'perf': { const p = await S.eval('window.__dcore.perf()'); ctx.perf.push(p); const max = v?.maxLoadMs; return { op, result: max !== undefined && p ? (p.load_ms <= max ? 'PASS' : 'FAIL') : p ? 'PASS' : 'NOT_TESTED', detail: p ? `load ${p.load_ms} ms, DCL ${p.dom_content_loaded_ms} ms, TTFB ${p.ttfb_ms} ms` : 'no navigation timing available' }; }
    case 'viewport': {
      const { width = 375, height = 812, mobile = width < 768 } = typeof v === 'object' ? v : {};
      await S.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile, screenWidth: width, screenHeight: height }); await sleep(300);
      const [layoutW, layoutH, screenW, meta] = await S.eval('[window.innerWidth, window.innerHeight, screen.width, !!document.querySelector("meta[name=viewport]")]');
      if (screenW !== width) return { op, result: 'FAIL', detail: `device emulation not applied: screen reports ${screenW}px, wanted ${width}px` };
      const note = layoutW !== width ? ` — page lays out at ${layoutW}px${mobile && !meta ? ' (no responsive <meta name="viewport">: phones render it at desktop width)' : ''}` : '';
      if (note && mobile) ctx.responsive.push({ width, layout_width: layoutW, has_meta_viewport: meta });
      return { op, result: 'PASS', detail: `viewport ${width}x${height}${mobile ? ' (mobile)' : ''} applied; page layout ${layoutW}x${layoutH}${note}` };
    }
    case 'evaluate': {
      return inFrame(async (cid) => {
        const val = await S.eval(typeof v === 'string' ? v : v.expression, { contextId: cid });
        const shown = JSON.stringify(val) ?? 'undefined'; ctx.values.push(shown.slice(0, 2000));
        const ok = v?.expect === undefined || JSON.stringify(val) === JSON.stringify(v.expect);
        return { op, result: ok ? 'PASS' : 'FAIL', detail: `value ${shown.slice(0, 200)}${v?.expect !== undefined && !ok ? ` (expected ${JSON.stringify(v.expect).slice(0, 100)})` : ''}` };
      });
    }
    case 'intercept': {
      if (v === false || v === null || v?.clear) { const n = ctx.faults.length; ctx.faults = []; await S.send('Fetch.disable').catch(() => {}); return { op, result: 'PASS', detail: n ? `request interception cleared (${n} rule(s))` : 'no request interception active' }; }
      if (!FAULT_MODES.includes(v?.mode)) return { op, result: 'FAIL', detail: `intercept needs mode (one of ${FAULT_MODES.join(', ')})`, stop: true };
      if (!v.url && !v.matches) return { op, result: 'FAIL', detail: 'intercept needs url (a path or URL fragment to match)', stop: true };
      const method = String(v.method ?? 'GET').toUpperCase(); const delayMs = Math.min(Number(v.delayMs ?? 3000), 30_000);
      ctx.faults.push({ mode: v.mode, method, re: v.matches ? new RegExp(v.matches) : urlRe(v.url), url: v.url ?? v.matches, status: v.status, delayMs, times: v.times, hits: 0 });
      await S.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'XHR', requestStage: 'Request' }, { urlPattern: '*', resourceType: 'Fetch', requestStage: 'Request' }] });
      return { op, result: 'PASS', detail: `${method} requests matching ${JSON.stringify(v.url ?? v.matches)} will get a simulated ${v.mode}${v.mode === 'server-error' ? ` (${v.status ?? 500})` : v.mode === 'timeout' ? ` after ${delayMs} ms` : ''} in this browser only (the server is not contacted for them)` };
    }
    case 'session': {
      if (v === 'expire') {
        const { cookies } = await S.send('Network.getAllCookies');
        if (!ctx.savedCookies) ctx.savedCookies = cookies;
        for (const c of cookies) if (String(c.value).length >= 12) ctx.secrets.push(c.value);
        await S.send('Network.clearBrowserCookies');
        return { op, result: 'PASS', detail: `session expired in this browser: ${cookies.length} cookie(s) removed (values are not recorded); the server-side session is untouched` };
      }
      if (v === 'restore') {
        if (!ctx.savedCookies) return { op, result: 'PASS', detail: 'no expired session to restore' };
        await S.send('Network.clearBrowserCookies'); await S.send('Network.setCookies', { cookies: ctx.savedCookies.map(cookieParam) });
        const n = ctx.savedCookies.length; ctx.savedCookies = null;
        return { op, result: 'PASS', detail: `session restored (${n} cookie(s))` };
      }
      return { op, result: 'FAIL', detail: 'session needs "expire" or "restore"', stop: true };
    }
    case 'dialog': { ctx.dialogPolicy = v === 'accept' ? 'accept' : 'dismiss'; return { op, result: 'PASS', detail: `confirm/prompt dialogs will be ${ctx.dialogPolicy}ed` }; }
    case 'switchTab': {
      const spec = typeof v === 'object' ? v : { [typeof v === 'number' ? 'index' : 'latest']: v };
      const end = Date.now() + nav; let tab;   // a new tab is a navigation: its URL is known only once it commits
      while (Date.now() < end) {
        const open = ctx.tabs.filter((x) => !x.closed);
        tab = spec.url ? open.find((x) => x.url.includes(spec.url)) : spec.title ? open.find((x) => (x.title ?? '').toLowerCase().includes(String(spec.title).toLowerCase())) : Number.isInteger(spec.index) ? open[spec.index] : open.filter((x) => x.targetId !== S.targetId).at(-1);
        if (tab) break; await sleep(200);
      }
      if (!tab) return { op, result: 'FAIL', element_state: 'NOT_FOUND', detail: `no tab matching ${JSON.stringify(spec)} (open: ${ctx.tabs.filter((x) => !x.closed).map((x) => stripQuery(x.url)).join(' | ')})`, stop: true };
      ctx.page = await ctx.attach(tab.targetId);
      await ctx.cdp.send('Target.activateTarget', { targetId: tab.targetId }).catch(() => {});
      await ctx.page.settle(ctx.settleMs);
      const href = await ctx.page.eval('location.href').catch(() => tab.url);
      return { op, result: 'PASS', detail: `switched to tab ${stripQuery(href)}` };
    }
    case 'closeTab': {
      const cur = S.targetId;
      await ctx.cdp.send('Target.closeTarget', { targetId: cur });
      const tabRec = ctx.tabs.find((x) => x.targetId === cur); if (tabRec) tabRec.closed = true;
      const next = ctx.tabs.find((x) => !x.closed && x.targetId === tabRec?.openerId) ?? ctx.tabs.find((x) => !x.closed);
      if (!next) return { op, result: 'FAIL', detail: 'closed the last tab', stop: true };
      ctx.page = await ctx.attach(next.targetId);
      return { op, result: 'PASS', detail: `closed tab; now on ${stripQuery(next.url)}` };
    }
    default: return { op, result: 'FAIL', detail: 'unhandled', stop: true };
  }
}

// A live browser session that callers drive step by step (used by browse() and by the scenario engine, so there is
// exactly one browser implementation). opts: { outDir, profile, headed, stepTimeoutMs, settleMs, browser,
// uploadRoots, riskGuard }. Returns { ok:false, reason } when no browser can be started (nothing executed).
export async function startBrowser(opts = {}) {
  const started_at = new Date().toISOString();
  const sink = { console: [], pageErrors: [], network: [], http4xx: [], downloads: [], dialogs: [], redirects: [], spaNavigations: [], api: [], writes: [] };
  const ctx = { sink, secrets: [], shots: [], inspections: [], texts: [], a11y: [], perf: [], values: [], tabs: [], responsive: [], faults: [], faultLog: [], faultedIds: new Set(), savedCookies: null, dialogPolicy: 'dismiss', stepTimeoutMs: opts.stepTimeoutMs ?? 15_000, settleMs: opts.settleMs ?? 4000, uploadRoots: opts.uploadRoots, riskGuard: !!opts.riskGuard };
  const exe = opts.browser ?? findBrowser();
  if (!exe) return { ok: false, started_at, reason: 'no Chromium-family browser found (install Chrome/Edge/Chromium or set DCORE_BROWSER); NOTHING was executed in a browser', searched: browserCandidates().slice(0, 12) };
  ctx.outDir = resolve(opts.outDir ?? join('.dcore', 'evidence', `browse-${started_at.replace(/[:.]/g, '-')}`));
  ctx.downloadDir = join(ctx.outDir, 'downloads');
  mkdirSync(ctx.downloadDir, { recursive: true });
  const ephemeral = !opts.profile;
  const userDir = opts.profile ? resolve(opts.profile) : mkdtempSync(join(tmpdir(), 'dcore-browse-'));
  let proc; let cdp; const sessions = new Map();
  const close = async () => {
    try { await cdp?.send('Browser.close', {}, undefined, 5000); } catch { /* ignore */ }
    cdp?.close();
    try { proc?.kill(); } catch { /* ignore */ }
    if (ephemeral) for (let i = 0; i < 10; i++) { try { rmSync(userDir, { recursive: true, force: true }); break; } catch { await sleep(300); } }
  };
  try {
    ({ proc } = await launch(exe, { userDir, headed: opts.headed }).then(async (l) => { cdp = await CDP.connect(l.wsUrl); return l; }));
    ctx.cdp = cdp;
    cdp.on((m) => {
      const p = m.params ?? {};
      if (m.method === 'Target.targetCreated' && p.targetInfo.type === 'page') ctx.tabs.push({ targetId: p.targetInfo.targetId, url: p.targetInfo.url, title: p.targetInfo.title, openerId: p.targetInfo.openerId ?? null, closed: false });
      else if (m.method === 'Target.targetInfoChanged') { const x = ctx.tabs.find((y) => y.targetId === p.targetInfo.targetId); if (x) Object.assign(x, { url: p.targetInfo.url, title: p.targetInfo.title }); }
      else if (m.method === 'Target.targetDestroyed') { const x = ctx.tabs.find((y) => y.targetId === p.targetId); if (x) x.closed = true; }
      else if (m.method === 'Browser.downloadWillBegin') sink.downloads.push({ guid: p.guid, suggested_filename: p.suggestedFilename, url: stripQuery(p.url), state: 'started' });
      else if (m.method === 'Browser.downloadProgress') { const d = sink.downloads.find((x) => x.guid === p.guid); if (d && p.state !== 'inProgress') { d.state = p.state; d.bytes = p.receivedBytes; } }
    });
    await cdp.send('Target.setDiscoverTargets', { discover: true });
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: ctx.downloadDir, eventsEnabled: true }).catch(() => {});
    ctx.attach = async (targetId) => {
      if (sessions.has(targetId)) return sessions.get(targetId);
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      const S = new Session(cdp, sessionId, targetId, ctx); await S.init(); sessions.set(targetId, S); return S;
    };
    const { targetInfos } = await cdp.send('Target.getTargets');
    let page = targetInfos.find((t) => t.type === 'page');
    if (!page) page = { targetId: (await cdp.send('Target.createTarget', { url: 'about:blank' })).targetId };
    if (!ctx.tabs.some((x) => x.targetId === page.targetId)) ctx.tabs.push({ targetId: page.targetId, url: page.url ?? 'about:blank', title: '', openerId: null, closed: false });
    ctx.page = await ctx.attach(page.targetId);
  } catch (e) { await close(); return { ok: false, started_at, reason: `browser session failed: ${e.message}` }; }
  return {
    ok: true, started_at, ctx, sink, exe, ephemeral,
    // run one step; never throws (an exception becomes a FAIL result with the message)
    async run(s) { try { return await step(ctx, s); } catch (e) { return { op: Object.keys(s)[0], result: 'FAIL', detail: `error: ${redact(e.message, ctx.secrets)}`, stop: true }; } },
    async location() { return ctx.page.eval('({ url: location.href, title: document.title })').catch(() => ({})); },
    marks() { return { c: sink.console.length, p: sink.pageErrors.length, n: sink.network.length, a: sink.api.length, w: sink.writes.length, f: ctx.faultLog.length, shots: ctx.shots.length }; },
    since(m) { return { console_errors: sink.console.slice(m.c), page_errors: sink.pageErrors.slice(m.p), network_failures: sink.network.slice(m.n), api: sink.api.slice(m.a ?? 0), writes: sink.writes.slice(m.w ?? 0), faults: ctx.faultLog.slice(m.f ?? 0), screenshots: ctx.shots.slice(m.shots) }; },
    async screenshot(name) { const r = await this.run({ screenshot: name }); return r.result === 'PASS' ? ctx.shots[ctx.shots.length - 1] : null; },
    evidence() {
      return {
        browser: exe.split(/[\\/]/).pop(), console_errors: [...new Set(sink.console)].slice(0, 50), page_errors: [...new Set(sink.pageErrors)].slice(0, 50),
        network_failures: sink.network.slice(0, 50), http_4xx: sink.http4xx.slice(0, 50), redirects: sink.redirects.slice(0, 50), spa_navigations: sink.spaNavigations.slice(0, 50),
        dialogs: sink.dialogs, downloads: sink.downloads.map(({ guid, ...d }) => d), tabs: ctx.tabs.map((x) => ({ url: stripQuery(x.url), title: x.title, closed: x.closed, opened_by_page: !!x.openerId })),
        screenshots: ctx.shots, inspections: ctx.inspections, page_text: ctx.texts, a11y: ctx.a11y, perf: ctx.perf, responsive: ctx.responsive, values: ctx.values, write_requests: sink.writes.slice(0, 50).map(({ at, ...w }) => w), simulated_faults: ctx.faultLog.slice(0, 50), out_dir: ctx.outDir,
      };
    },
    limitations: () => ['closed shadow roots are not reachable (by design of the web platform)', 'cross-origin iframes are reachable because site isolation is disabled in the throwaway test profile', 'a11y checks are basic heuristics, not a WCAG audit', ...(ephemeral ? ['fresh browser profile: no prior cookies/session'] : ['persistent profile in use: session cookies are stored there'])],
    close,
  };
}

// Run a list of steps in one real browser (one or more tabs). opts: { outDir, profile, headed, stepTimeoutMs,
// settleMs, allowConsoleErrors, browser, caseScreenshots, uploadRoots, riskGuard }.
export async function browse(steps, opts = {}) {
  const started_at = new Date().toISOString();
  const action = `browse ${steps?.length ?? 0} step(s)`;
  if (!Array.isArray(steps) || steps.length === 0) return report({ module: 'dcore-browse', action, started_at, result: 'BLOCKED', limitations: ['no steps given'] });
  const B = await startBrowser(opts);
  if (!B.ok) return report({ module: 'dcore-browse', action, started_at, result: 'BLOCKED', limitations: [B.reason], evidence: B.searched ? { searched: B.searched } : {} });
  const { ctx, sink } = B; const log = [];
  try {
    // Steps run in order. `{ "case": { id, title } }` markers split them into test cases: steps before the first marker
    // are SETUP (a setup failure blocks everything after it); a failure inside a case skips only the rest of that case.
    // Console / page-error / network events are attributed to the case during which they occurred.
    let stopped = false; let caseStopped = false; let current = null; const cases = [];
    const closeCase = async () => {
      if (!current) return;
      current.console_errors = sink.console.slice(current._c); current.page_errors = sink.pageErrors.slice(current._p); current.network_failures = sink.network.slice(current._n);
      if (opts.caseScreenshots) { const shot = await B.screenshot(`case-${current.id}`); if (shot) current.screenshot = shot; }
      delete current._c; delete current._p; delete current._n; cases.push(current); current = null;
    };
    for (const [i, s] of steps.entries()) {
      if (s.case) {
        await closeCase();
        current = { id: String(s.case.id ?? `TC-${cases.length + 1}`), title: s.case.title ?? null, first_step: i + 1, _c: sink.console.length, _p: sink.pageErrors.length, _n: sink.network.length };
        caseStopped = false;
        continue;
      }
      const tag = current ? { case: current.id } : { phase: 'setup' };
      if (stopped) { log.push({ n: i + 1, op: Object.keys(s)[0], ...tag, result: current ? 'BLOCKED' : 'SKIPPED', detail: current ? 'not run: setup failed' : 'not run: an earlier step failed' }); continue; }
      if (caseStopped) { log.push({ n: i + 1, op: Object.keys(s)[0], ...tag, result: 'SKIPPED', detail: 'not run: an earlier step in this case failed' }); continue; }
      const r = await B.run(s);
      log.push({ n: i + 1, op: r.op, ...tag, ...(s.name ? { name: s.name } : {}), result: r.result, ...(r.element_state ? { element_state: r.element_state } : {}), detail: r.detail });
      if ((r.result === 'FAIL' || r.result === 'BLOCKED') && r.stop) {
        if (current) caseStopped = true; else stopped = true;
        const shot = await B.screenshot(`failure-step-${i + 1}`); if (current && shot) current.failure_screenshot = shot;
      }
    }
    await closeCase();
    const final = await B.location();
    const checks = log.map((l) => check(`step-${l.n}`, `${l.op}${l.name ? ' (' + l.name + ')' : ''}: ${l.detail}`, l.result));
    checks.push(check('page-errors', `${sink.pageErrors.length} uncaught page exception(s)`, sink.pageErrors.length ? 'FAIL' : 'PASS'));
    checks.push(check('console-errors', `${sink.console.length} console error(s)`, sink.console.length && !opts.allowConsoleErrors ? 'FAIL' : 'PASS'));
    checks.push(check('network-failures', `${sink.network.length} failed request(s) or 5xx response(s)`, sink.network.length ? 'FAIL' : 'PASS'));
    return report({
      module: 'dcore-browse', action, started_at, checks, secrets: ctx.secrets,
      evidence: { ...B.evidence(), final_url: final.url ? stripQuery(final.url) : null, title: final.title ?? null, steps: log, cases },
      limitations: B.limitations(),
    });
  } catch (e) {
    return report({ module: 'dcore-browse', action, started_at, result: 'BLOCKED', secrets: ctx.secrets, checks: log.map((l) => check(`step-${l.n}`, `${l.op}: ${l.detail}`, l.result)), evidence: { steps: log, screenshots: ctx.shots, out_dir: ctx.outDir }, limitations: [`browser session failed: ${redact(e.message, ctx.secrets)}`] });
  } finally { await B.close(); }
}

// Render local HTML files to PDF with the same browser (Page.printToPDF). jobs: [{ html, pdf, landscape }].
// Returns one entry per job: { pdf, ok, bytes, pages, error }. No browser => every job BLOCKED (nothing fabricated).
export async function printPdfs(jobs, opts = {}) {
  const exe = opts.browser ?? findBrowser();
  if (!exe) return jobs.map((j) => ({ pdf: j.pdf, ok: false, result: 'BLOCKED', error: 'no Chromium-family browser found: PDF not produced (HTML/Markdown still available)' }));
  const userDir = mkdtempSync(join(tmpdir(), 'dcore-pdf-'));
  let proc; let cdp; const out = [];
  try {
    ({ proc } = await launch(exe, { userDir }).then(async (l) => { cdp = await CDP.connect(l.wsUrl); return l; }));
    for (const j of jobs) {
      let sessionId;
      if (!existsSync(resolve(j.html))) { out.push({ pdf: j.pdf, ok: false, result: 'BLOCKED', error: `source HTML not found: ${j.html}` }); continue; }   // never print the browser's error page
      try {
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
        await cdp.send('Page.enable', {}, sessionId);
        let loaded = false; cdp.on((m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') loaded = true; });
        await cdp.send('Page.navigate', { url: pathToFileURL(resolve(j.html)).href }, sessionId);
        for (let t = 0; t < 150 && !loaded; t++) await sleep(100);
        await sleep(300);
        const footer = `<div style="font-size:7px;width:100%;padding:0 10mm;color:#666;display:flex;justify-content:space-between"><span>${String(j.footer ?? 'DCore').replace(/[<>&]/g, '')}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
        // stream the PDF in chunks: a single base64 message stalls on large, image-heavy documents
        const r = await cdp.send('Page.printToPDF', { printBackground: true, landscape: !!j.landscape, paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.45, marginBottom: 0.55, marginLeft: 0.4, marginRight: 0.4, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer, preferCSSPageSize: false, transferMode: 'ReturnAsStream' }, sessionId, opts.timeoutMs ?? 300_000);
        const chunks = [];
        for (let eof = false; !eof;) {
          const c = await cdp.send('IO.read', { handle: r.stream, size: 1 << 20 }, sessionId, 60_000);
          chunks.push(Buffer.from(c.data, c.base64Encoded ? 'base64' : 'latin1'));
          eof = c.eof;
        }
        await cdp.send('IO.close', { handle: r.stream }, sessionId).catch(() => {});
        const buf = Buffer.concat(chunks);
        writeFileSync(j.pdf, buf);
        out.push({ pdf: j.pdf, ok: true, result: 'PASS', bytes: buf.length, pages: (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length });
      } catch (e) { out.push({ pdf: j.pdf, ok: false, result: 'FAIL', error: e.message }); }
    }
    return out;
  } catch (e) {
    return jobs.map((j) => ({ pdf: j.pdf, ok: false, result: 'BLOCKED', error: `browser failed to start: ${e.message}` }));
  } finally {
    try { await cdp?.send('Browser.close', {}, undefined, 5000); } catch { /* ignore */ }
    cdp?.close(); try { proc?.kill(); } catch { /* ignore */ }
    for (let i = 0; i < 10; i++) { try { rmSync(userDir, { recursive: true, force: true }); break; } catch { await sleep(300); } }
  }
}
