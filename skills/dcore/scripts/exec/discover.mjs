// dcore application discovery (M41) — a PASSIVE crawl that builds a deterministic application map.
// Discovery only NAVIGATES (GET) and OBSERVES: it never clicks, types or submits. Links that look state-changing
// (logout, delete, revoke, export, …), downloads and other origins are recorded but NOT visited. Every control in the
// map is DISCOVERED — never "tested": discovery says what exists, not that it works. The map is deterministic
// (sorted, ids normalised, timestamps outside the hashed content) and carries a content hash (map_hash).
import { createHash } from 'node:crypto';
import { startBrowser } from './browse.mjs';
// unauthenticated GET for the auth-boundary probe: follows redirects, reads up to 1 MB of the body, sends no cookies
async function anonymousGet(url, timeoutMs = 10_000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try { const res = await fetch(url, { redirect: 'follow', signal: ac.signal }); const text = (await res.text()).slice(0, 1_000_000); return { status: res.status, url_final: res.url, body: text }; }
  catch (e) { return { status: null, error: e.message }; } finally { clearTimeout(t); }
}
import { redactDeep } from './evidence.mjs';

const RISKY_LINK = /(log-?out|sign-?out|delete|remove|destroy|revoke|unsubscribe|deactivate|disable|reset|purge|cancel|approve|reject|\/export\b|\/download\b)/i;
const DOWNLOAD_EXT = /\.(pdf|csv|xlsx?|zip|gz|tar|docx?|pptx?|png|jpe?g|gif|svg|mp4|mp3|apk|exe|dmg|msi|json|xml)$/i;
const STATE_CHANGING = /\b(create|save|submit|delete|remove|revoke|destroy|drop|deactivate|disable|enable|pay|purchase|buy|checkout|transfer|send|confirm|approve|reject|publish|archive|import|update|reset|invite|assign|grant|log ?out|sign ?out|upload)\b/i;

const routeOf = (u) => { try { const x = new URL(u); return x.pathname.replace(/\/+$/, '') || '/'; } catch { return null; } };
// replace numeric / uuid / long-hex path segments with placeholders so the map is stable across data
export const normalizePath = (p) => String(p).split('/').map((seg) => /^\d+$/.test(seg) ? ':id' : /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(seg) ? ':uuid' : /^[0-9a-f]{16,}$/i.test(seg) ? ':hex' : seg).join('/');
const sortBy = (arr, key) => [...arr].sort((a, b) => String(key(a)).localeCompare(String(key(b))));
const uniq = (arr, key) => { const seen = new Set(); return arr.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };

// in-page observation (read-only DOM queries through the dcore page helpers)
const OBSERVE = `(() => {
  const D = window.__dcore; const vis = D.vis, nameOf = D.nameOf, norm = D.norm, sel = D.sel, cons = D.cons;
  const abs = (h) => { try { return new URL(h, location.href).href; } catch (e) { return null; } };
  const SEARCH = /search|filter|find|query|keyword/i;
  const fieldOf = (x) => ({ name: x.name || x.id || '', label: nameOf(x).slice(0, 60), type: (x.type || x.tagName.toLowerCase()), selector: sel(x), required: !!x.required, visible: vis(x), constraints: cons(x) || null });
  const links = D.qAll('a[href]').map((a) => ({ href: abs(a.getAttribute('href')), raw: a.getAttribute('href'), text: norm(nameOf(a)).slice(0, 60), visible: vis(a), in_nav: !!a.closest('nav,header,aside,[role=navigation],#sidebar,.sidebar,.navbar,.menu,.nav'), download: a.hasAttribute('download'), new_tab: a.target === '_blank' })).filter((l) => l.href);
  const forms = [...document.forms].map((f) => ({ selector: sel(f), method: (f.getAttribute('method') || 'get').toLowerCase(), action: f.getAttribute('action') || '', visible: vis(f), has_password: !!f.querySelector('input[type=password]'),
    fields: [...f.elements].filter((x) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(x.tagName) && !['hidden', 'submit', 'button', 'reset', 'image'].includes(x.type)).map(fieldOf),
    submits: [...f.querySelectorAll('button,input[type=submit]')].filter((b) => (b.type || 'submit') === 'submit').map((b) => ({ name: nameOf(b).slice(0, 50), selector: sel(b), visible: vis(b) })) }));
  const loose = D.qAll('input,select,textarea').filter((x) => !x.form && !['hidden', 'submit', 'button', 'reset', 'image'].includes(x.type) && vis(x)).map(fieldOf);
  const buttons = D.qAll('button,[role=button],input[type=submit],input[type=button]').filter(vis).map((b) => ({ name: nameOf(b).slice(0, 60), selector: sel(b), in_form: !!(b.form || b.closest('form')), disabled: !!D.disabled(b) }));
  const tables = D.qAll('table,[role=grid],[role=table]').filter(vis).map((t) => ({ selector: sel(t), headers: [...t.querySelectorAll('th,[role=columnheader]')].map((h) => norm(h.innerText)).filter(Boolean).slice(0, 25), rows: t.querySelectorAll('tbody tr,[role=row]').length }));
  const dialogs = D.qAll('dialog,[role=dialog],[role=alertdialog],.modal').map((m) => ({ selector: sel(m), title: norm((m.querySelector('h1,h2,h3,h4,h5,.modal-title') || {}).innerText || m.getAttribute('aria-label') || '').slice(0, 80), open: vis(m) }));
  const tabs = D.qAll('[role=tab]').filter(vis).map((t) => ({ name: nameOf(t).slice(0, 50), selector: sel(t), selected: t.getAttribute('aria-selected') === 'true' }));
  const dropdowns = [...D.qAll('select').filter(vis).map((s) => ({ kind: 'select', label: nameOf(s).slice(0, 60), selector: sel(s), options: s.options.length, multiple: s.multiple })), ...D.qAll('[role=combobox]').filter(vis).map((c) => ({ kind: 'combobox', label: nameOf(c).slice(0, 60), selector: sel(c) }))];
  const postForm = (x) => !!x.form && (x.form.getAttribute('method') || 'get').toLowerCase() === 'post';
  const searchFilters = D.qAll('input,select').filter((x) => vis(x) && !postForm(x) && !['checkbox', 'radio', 'hidden', 'button', 'submit', 'reset', 'file', 'image'].includes(x.type) && (x.type === 'search' || x.tagName === 'SELECT' || SEARCH.test([x.name, x.id, x.placeholder, nameOf(x)].join(' ')))).map((x) => { const global = !!x.closest('nav,header,aside,[role=navigation],[role=banner],#sidebar,.sidebar,.navbar,.menu'); let table = null; if (!global) { let n = x.parentElement; for (let i = 0; n && i < 8 && !table; i++, n = n.parentElement) { const ts = [...n.querySelectorAll('table,[role=grid],[role=table]')].filter(vis); if (ts.length === 1) table = sel(ts[0]); else if (ts.length > 1) break; } } return { kind: x.tagName === 'SELECT' ? 'filter' : 'search', label: nameOf(x).slice(0, 60), selector: sel(x), type: x.type, scope: global ? 'global' : 'page', table }; });
  const text = norm(document.body ? document.body.innerText : '');
  const empty = (text.match(/\\b(no (results|records|data|items|entries|matches)\\b[^.]{0,40}|no [a-z]+ (yet|found|available|to (show|display))\\b[^.]{0,30}|nothing (here|found|to show)[^.]{0,30}|(list|table) is empty)/gi) || []).slice(0, 5);
  return { url: location.href, title: document.title, h1: D.qAll('h1').filter(vis).map((h) => norm(h.innerText).slice(0, 80)), headings: D.qAll('h2,h3').filter(vis).map((h) => norm(h.innerText).slice(0, 60)).slice(0, 20),
    links, forms, loose, buttons, tables, dialogs, tabs, dropdowns, searchFilters,
    states: { alerts: D.qAll('[role=alert],.alert,.toast').filter(vis).map((a) => norm(a.innerText).slice(0, 80)).filter(Boolean).slice(0, 5), empty_states: empty, loading: D.qAll('[aria-busy=true],.spinner,.loading,[role=progressbar]').filter(vis).length },
    has_password: !!document.querySelector('input[type=password]'), meta_viewport: !!document.querySelector('meta[name=viewport]'), iframes: D.qAll('iframe').length, shadow_roots: D.qAll('*').filter((e) => e.shadowRoot).length };
})()`;

function canonical(v) { if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`; return JSON.stringify(v); }
export function mapHash(map) { const { generated_at, map_hash, duration_ms, ...content } = map; return createHash('sha256').update(canonical(content)).digest('hex'); }

// startUrl + opts { setup: [browse steps] (e.g. login with valueEnv), maxPages, maxDepth, outDir, browser, stepTimeoutMs, probeAuth }
export async function discoverApp(startUrl, opts = {}) {
  const t0 = Date.now();
  let origin; try { origin = new URL(startUrl).origin; } catch { return { schema: 'dcore.appmap/1', status: 'BLOCKED', reason: `invalid start URL: ${startUrl}`, routes: [] }; }
  const maxPages = Math.min(opts.maxPages ?? 20, 200); const maxDepth = opts.maxDepth ?? 3;
  const B = await startBrowser({ outDir: opts.outDir, browser: opts.browser, stepTimeoutMs: opts.stepTimeoutMs ?? 15_000, settleMs: opts.settleMs ?? 1500 });
  if (!B.ok) return { schema: 'dcore.appmap/1', status: 'BLOCKED', origin, start_url: startUrl, reason: B.reason, routes: [], limitations: ['nothing was discovered: no browser session'] };
  const setup = { status: 'NOT_APPLICABLE', steps: [] };
  const pages = new Map(); const skipped = []; const external = new Set(); const edges = [];
  try {
    if (opts.setup?.length) {
      setup.status = 'PASS';
      for (const s of opts.setup) { const r = await B.run(s); setup.steps.push({ op: r.op, result: r.result, detail: r.detail }); if (r.result !== 'PASS') { setup.status = r.result === 'BLOCKED' ? 'BLOCKED' : 'FAIL'; break; } }
    }
    const queue = [{ url: startUrl, depth: 0, via: null }]; const queued = new Set([routeOf(startUrl)]);
    while (queue.length && pages.size < maxPages && setup.status !== 'FAIL' && setup.status !== 'BLOCKED') {
      const { url, depth, via } = queue.shift();
      const mk = B.marks();
      const nav = await B.run({ goto: url });
      const loc = await B.location();
      const finalRoute = routeOf(loc.url ?? url);
      const key = normalizePath(routeOf(url));
      if (nav.result !== 'PASS') { pages.set(key, { route: key, url: url.replace(/[?#].*$/, ''), depth, reached_via: via, kind: 'unreachable', status: 'DISCOVERED', error: nav.detail }); continue; }
      let o; try { o = await B.ctx.page.eval(OBSERVE); } catch (e) { o = null; }
      // responsive: mobile width, horizontal overflow, then restore
      let responsive = null;
      if (o) {
        await B.run({ viewport: { width: 390, height: 844 } });
        const ov = await B.ctx.page.eval('document.documentElement.scrollWidth > window.innerWidth + 2').catch(() => null);
        await B.run({ viewport: { width: 1366, height: 900, mobile: false } });
        responsive = { meta_viewport: o.meta_viewport, overflow_at_390px: ov, mobile_friendly: !!o.meta_viewport && ov === false };
      }
      const since = B.since(mk);
      const redirectedTo = finalRoute !== routeOf(url) ? normalizePath(finalRoute) : null;
      const page = {
        route: key, url: url.replace(/[?#].*$/, ''), depth, reached_via: via, status: 'DISCOVERED',
        kind: o?.has_password ? 'login' : 'page', redirected_to: redirectedTo, title: o?.title ?? null, h1: o?.h1 ?? [], headings: o?.headings ?? [],
        nav: o ? sortBy(uniq(o.links.filter((l) => l.in_nav && l.visible && l.href.startsWith(origin)).map((l) => ({ text: l.text, route: normalizePath(routeOf(l.href)), state_changing: RISKY_LINK.test(routeOf(l.href)) || RISKY_LINK.test(l.text), lifecycle: 'DISCOVERED' })), (x) => x.route + x.text), (x) => x.route + x.text) : [],
        forms: (o?.forms ?? []).map((f) => ({ ...f, lifecycle: 'DISCOVERED', state_changing: f.method === 'post' || f.submits.some((b) => STATE_CHANGING.test(b.name)), auth_form: f.has_password })),
        inputs: (o?.loose ?? []).map((x) => ({ ...x, lifecycle: 'DISCOVERED' })),
        buttons: sortBy(uniq((o?.buttons ?? []).map((b) => ({ ...b, state_changing: STATE_CHANGING.test(b.name), lifecycle: 'DISCOVERED' })), (b) => b.selector), (b) => b.selector),
        tables: (o?.tables ?? []).map((t) => ({ ...t, lifecycle: 'DISCOVERED' })),
        dialogs: sortBy(uniq((o?.dialogs ?? []).map((d) => ({ ...d, lifecycle: 'DISCOVERED' })), (d) => d.selector), (d) => d.selector),
        tabs: (o?.tabs ?? []).map((t) => ({ ...t, lifecycle: 'DISCOVERED' })),
        dropdowns: (o?.dropdowns ?? []).map((d) => ({ ...d, lifecycle: 'DISCOVERED' })),
        search_filters: (o?.searchFilters ?? []).map((s) => ({ ...s, lifecycle: 'DISCOVERED' })),
        states: o?.states ?? null,
        api: sortBy(uniq(since.api.filter((a) => a.url.startsWith(origin)).map((a) => ({ method: a.method, path: normalizePath(routeOf(a.url)), status: a.status })), (a) => `${a.method} ${a.path} ${a.status}`), (a) => `${a.path} ${a.method} ${a.status}`),
        console_errors: [...new Set([...since.console_errors, ...since.page_errors])].sort(),
        network_failures: sortBy(uniq(since.network_failures.map((n) => (n.kind === 'http' ? `${n.status} ${normalizePath(routeOf(n.url) ?? n.url)}` : `${n.error} (${n.type ?? 'request'})`)), (x) => x), (x) => x),
        responsive, iframes: o?.iframes ?? 0, shadow_roots: o?.shadow_roots ?? 0,
      };
      pages.set(key, page);
      if (!o) continue;
      for (const l of sortBy(o.links, (x) => x.href)) {
        let u; try { u = new URL(l.href); } catch { continue; }
        if (!/^https?:$/.test(u.protocol)) continue;
        if (u.origin !== origin) { external.add(u.origin); continue; }
        const r = routeOf(u.href);
        if (l.download || DOWNLOAD_EXT.test(r)) { skipped.push({ route: normalizePath(r), text: l.text, from: key, reason: 'download (not fetched)' }); continue; }
        if (RISKY_LINK.test(r) || RISKY_LINK.test(l.text)) { skipped.push({ route: normalizePath(r), text: l.text, from: key, reason: 'looks state-changing (not visited)' }); continue; }
        if (normalizePath(r) !== key) edges.push({ from: key, to: normalizePath(r), text: l.text, in_nav: l.in_nav });
        if (queued.has(r) || depth + 1 > maxDepth) continue;
        if (queued.size >= maxPages * 3) continue;
        queued.add(r); queue.push({ url: u.origin + u.pathname, depth: depth + 1, via: key });
      }
    }
  } finally { await B.close(); }
  // authentication boundary: request each discovered route WITHOUT the browser session (plain GET, no cookies)
  const routes = sortBy([...pages.values()], (p) => p.route);
  const login = routes.find((p) => p.kind === 'login');
  const loginMarker = login ? (login.h1[0] || login.title || null) : null;
  const auth = { login_route: login?.route ?? null, login_marker: loginMarker, protected_routes: [], public_routes: [], unknown: [] };
  if (opts.probeAuth !== false) {
    for (const p of routes.filter((x) => x.kind === 'page').slice(0, 40)) {
      const r = await anonymousGet(p.url);   // full body, no cookies (an excerpt can miss a large login form)
      const finalRoute = r.url_final ? normalizePath(routeOf(r.url_final)) : null;
      const body = r.body ?? '';
      const hasPw = /type=["']?password/i.test(body);
      // learn the login page from the redirect target when the crawl itself never saw it
      if (hasPw && finalRoute && finalRoute !== p.route && !auth.login_route) { auth.login_route = finalRoute; auth.login_marker = (body.match(/<h1[^>]*>([^<]{2,80})</i) || body.match(/<title>([^<]{2,80})</i) || [])[1]?.trim() ?? null; }
      const toLogin = (auth.login_route && finalRoute === auth.login_route) || (auth.login_marker && body.includes(auth.login_marker)) || hasPw;
      p.auth = !r.status ? 'unknown' : toLogin || [401, 403].includes(r.status) ? 'protected' : 'public';
      (p.auth === 'protected' ? auth.protected_routes : p.auth === 'public' ? auth.public_routes : auth.unknown).push(p.route);
    }
  }
  const apiEndpoints = [];
  for (const p of routes) for (const a of p.api ?? []) { const k = `${a.method} ${a.path}`; let e = apiEndpoints.find((x) => x.key === k); if (!e) { e = { key: k, method: a.method, path: a.path, statuses: [], pages: [] }; apiEndpoints.push(e); } if (!e.statuses.includes(a.status)) e.statuses.push(a.status); if (!e.pages.includes(p.route)) e.pages.push(p.route); }
  const map = {
    schema: 'dcore.appmap/1', status: setup.status === 'FAIL' || setup.status === 'BLOCKED' ? 'BLOCKED' : 'DISCOVERED', origin, start_url: startUrl,
    generated_at: new Date().toISOString(), duration_ms: Date.now() - t0,
    crawl: { max_pages: maxPages, max_depth: maxDepth, pages_visited: routes.length, truncated: routes.length >= maxPages },
    setup: { status: setup.status, steps: setup.steps.map((s) => ({ op: s.op, result: s.result, ...(s.result !== 'PASS' ? { detail: s.detail } : {}) })) },
    routes, navigation: sortBy(uniq(edges, (e) => `${e.from}>${e.to}`), (e) => `${e.from}>${e.to}`),
    auth, api_endpoints: sortBy(apiEndpoints.map(({ key, ...e }) => ({ ...e, statuses: e.statuses.sort(), pages: e.pages.sort() })), (e) => `${e.path} ${e.method}`),
    skipped_links: sortBy(uniq(skipped, (x) => `${x.route}|${x.reason}`), (x) => x.route), external_origins: [...external].sort(),
    lifecycle_note: 'every control here is DISCOVERED (observed in the DOM). Nothing in this map has been functionally tested.',
    limitations: ['passive crawl: GET navigation and DOM observation only; nothing is clicked, typed or submitted', 'controls that appear only after interaction (opened menus, dialogs, wizard steps) are seen only if already in the DOM', 'state-changing links, downloads and other origins are not visited', 'auth boundary probed with an unauthenticated GET per route'],
  };
  map.map_hash = mapHash(map);
  return redactDeep(map);
}

// human-readable summary of the map
export function renderAppMap(map) {
  const L = [`# Application map — ${map.origin}`, '', `Status: **${map.status}** · ${map.crawl?.pages_visited ?? 0} route(s) · map_hash \`${(map.map_hash ?? '').slice(0, 16)}\``, '', `> ${map.lifecycle_note ?? ''}`, ''];
  L.push('| Route | Kind | Auth | Forms | Buttons (state-changing) | Tables | Dialogs | Tabs | Dropdowns | Search/filter | API calls | Console errors | Network failures | Mobile overflow |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of map.routes ?? []) L.push(`| ${p.route} | ${p.kind}${p.redirected_to ? ` → ${p.redirected_to}` : ''} | ${p.auth ?? '—'} | ${p.forms?.length ?? 0} | ${p.buttons?.length ?? 0} (${(p.buttons ?? []).filter((b) => b.state_changing).length}) | ${p.tables?.length ?? 0} | ${p.dialogs?.length ?? 0} | ${p.tabs?.length ?? 0} | ${p.dropdowns?.length ?? 0} | ${p.search_filters?.length ?? 0} | ${(p.api ?? []).map((a) => `${a.method} ${a.path} ${a.status}`).join('<br>') || '—'} | ${p.console_errors?.length ?? 0} | ${p.network_failures?.length ?? 0} | ${p.responsive ? (p.responsive.mobile_friendly ? 'mobile-friendly' : 'NOT mobile-friendly') + (p.responsive.meta_viewport ? '' : ' (no meta viewport)') + (p.responsive.overflow_at_390px ? ' (overflow)' : '') : '—'} |`);
  L.push('', `**Auth boundary:** login ${map.auth?.login_route ?? 'not found'}; protected: ${(map.auth?.protected_routes ?? []).join(', ') || '—'}; public: ${(map.auth?.public_routes ?? []).join(', ') || '—'}`);
  L.push('', `**Not visited:** ${(map.skipped_links ?? []).map((s) => `${s.route} (${s.reason})`).join('; ') || '—'}`, `**Other origins (not visited):** ${(map.external_origins ?? []).join(', ') || '—'}`);
  return L.join('\n') + '\n';
}

// Lifecycle after a scenario run: CANDIDATE -> TESTED (PASSED / FAILED) | BLOCKED | NOT_TESTED; controls stay
// DISCOVERED unless an executed (PASS/FAIL) step targeted them.
export function coverage(map, candidates, run) {
  const byId = new Map((run?.scenarios ?? []).map((s) => [s.scenario_id, s]));
  const scen = (candidates?.scenarios ?? []).map((c) => {
    const r = byId.get(c.id);
    const result = !r ? 'NOT_TESTED' : r.status === 'PASS' ? 'PASSED' : r.status === 'FAIL' ? 'FAILED' : r.status === 'BLOCKED' ? 'BLOCKED' : 'NOT_TESTED';
    return { id: c.id, title: c.title, category: c.category, approval: c.approval, lifecycle: ['PASSED', 'FAILED'].includes(result) ? 'TESTED' : !r ? 'CANDIDATE' : result, result, reason: r ? r.actual : 'not executed in this run' };
  });
  const executedSteps = (run?.scenarios ?? []).flatMap((s) => (s.steps ?? []).filter((st) => ['PASS', 'FAIL'].includes(st.status)));
  const touched = (selector, name) => executedSteps.some((st) => (selector && String(st.target ?? '').includes(selector)) || (name && String(st.target ?? '').includes(JSON.stringify(name))));
  const controls = [];
  for (const p of map?.routes ?? []) {
    for (const [kind, list] of [['form', p.forms], ['button', p.buttons], ['search_filter', p.search_filters], ['dropdown', p.dropdowns], ['tab', p.tabs], ['nav_link', p.nav]]) for (const c of list ?? []) {
      const sel = c.selector ?? null; const name = c.name ?? c.label ?? c.text ?? null;
      controls.push({ route: p.route, kind, name, selector: sel, lifecycle: touched(sel, name) ? 'TESTED' : 'DISCOVERED' });
    }
  }
  const count = (arr, k, v) => arr.filter((x) => x[k] === v).length;
  return {
    schema: 'dcore.coverage/1', map_hash: map?.map_hash ?? null, run_id: run?.run_id ?? null,
    scenarios: scen, controls,
    summary: { discovered_controls: controls.length, tested_controls: count(controls, 'lifecycle', 'TESTED'), candidates: scen.length, tested: count(scen, 'lifecycle', 'TESTED'), passed: count(scen, 'result', 'PASSED'), failed: count(scen, 'result', 'FAILED'), blocked: count(scen, 'result', 'BLOCKED'), not_tested: count(scen, 'result', 'NOT_TESTED') },
    note: 'TESTED means a scenario step exercising it was executed (PASS or FAIL). DISCOVERED controls were only observed.',
  };
}
