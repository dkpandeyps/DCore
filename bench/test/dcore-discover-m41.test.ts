// M41 — application discovery (passive, deterministic) + candidate scenario generation + lifecycle coverage.
// Runs against a LOCAL multi-page fixture app whose server logs every request, so the tests can prove that discovery
// never submits, never follows state-changing links, and that APPROVAL_REQUIRED candidates send nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { discoverApp, coverage, normalizePath, mapHash, renderAppMap } from '../../skills/dcore/scripts/exec/discover.mjs';
import { generateCandidates, sampleValue } from '../../skills/dcore/scripts/exec/candidates.mjs';
import { runScenarios, validateScenarios } from '../../skills/dcore/scripts/exec/scenario.mjs';
import { findBrowser } from '../../skills/dcore/scripts/exec/browse.mjs';
import { TEST_DIR } from './helpers.ts';

const SKIP = findBrowser() ? false : 'no Chromium-family browser';
const CLI = join(TEST_DIR, '..', '..', 'skills', 'dcore', 'scripts', 'dcore.mjs');
const PASS = 'M41-SENTINEL-pw-3c3c';
let A = ''; let srv: Server; let OUT = ''; const LOG: string[] = [];

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
const NAV = `<nav><a href="/dashboard">Dashboard</a> <a href="/orders">Orders</a> <a href="/customers">Customers</a> <a href="/settings">Settings</a> <a href="/logout">Logout</a><input id="menu-search" type="search" placeholder="Search menu"></nav>`;
function app(req: any, res: any) {
  let body = ''; req.on('data', (d: any) => { body += d; });
  req.on('end', () => {
    const u = req.url.split('?')[0]; LOG.push(`${req.method} ${u}`);
    const authed = /sid=ok/.test(req.headers.cookie ?? '');
    const send = (code: number, b: string, h: any = {}) => { res.writeHead(code, { 'content-type': 'text/html', ...h }); res.end(b); };
    if (u === '/session' && req.method === 'POST') { const f = new URLSearchParams(body); return f.get('u') === 'admin' && f.get('p') === PASS ? send(302, '', { location: '/dashboard', 'set-cookie': 'sid=ok; Path=/' }) : send(302, '', { location: '/login?e=1' }); }
    if (u === '/login') return send(200, page('Login', `<!-- ${'padding '.repeat(600)} --><h1>Sign in to Admin</h1><form method="post" action="/session"><label>Username <input id="user" name="u" required></label><label>Password <input id="pass" name="p" type="password" required></label><button id="signin">Sign in</button></form>`));
    if (!authed) return u.startsWith('/api/') ? send(401, '{"error":"unauthorized"}', { 'content-type': 'application/json' }) : send(302, '', { location: '/login' });
    if (u === '/dashboard') return send(200, page('Dashboard', `${NAV}<h1>Dashboard</h1><a href="/orders/delete-all">Delete all orders</a> <a href="/export/orders.csv">Export CSV</a> <a href="https://external.example.test/docs">Docs</a>`));
    if (u === '/orders') return send(200, page('Orders', `${NAV}<h1>Orders</h1>
<div role="tablist"><button role="tab" aria-selected="true">Open</button><button role="tab">Closed</button></div>
<label>Search orders <input id="q" type="search" placeholder="Search orders"></label>
<label>Status <select id="status"><option>All</option><option>Open</option><option>Closed</option></select></label>
<table id="orders"><thead><tr><th>ID</th><th>Customer</th></tr></thead><tbody><tr><td>1</td><td>alice@example.test</td></tr><tr><td>2</td><td>bob@example.test</td></tr></tbody></table>
<label><input type="checkbox" id="qlog"> query logs</label><label><input type="radio" name="r" id="qr"> query mode</label><button id="del">Delete selected</button>
<div id="dlg" role="dialog" style="display:none"><h2>Delete order?</h2></div>
<form method="post" action="/orders" id="create"><label>Customer email <input id="email" type="email" required></label><label>Quantity <input id="qty" type="number" min="1" max="10" required></label><label>Note <input id="note" maxlength="20"></label><button id="create-btn">Create order</button></form>
<script>
fetch('/api/orders'); fetch('/api/orders/123/notes');
document.getElementById('q').addEventListener('input', (e) => { for (const tr of document.querySelectorAll('#orders tbody tr')) tr.style.display = tr.innerText.includes(e.target.value) ? '' : 'none'; for (const tr of [...document.querySelectorAll('#orders tbody tr')]) if (tr.style.display === 'none') tr.remove(); });
</script>`));
    if (u === '/customers') return send(200, page('Customers', `${NAV}<h1>Customers</h1><table id="cust"><thead><tr><th>Name</th></tr></thead><tbody></tbody></table><p>No customers yet.</p>`));
    if (u === '/settings') return send(200, page('Settings', `${NAV}<h1>Settings</h1><div style="width:1200px">wide content</div><script>console.error('settings-error'); fetch('/api/broken');</script>`));
    if (u === '/api/orders' || /^\/api\/orders\/\d+\/notes$/.test(u)) return send(200, '[]', { 'content-type': 'application/json' });
    if (u === '/api/broken') return send(500, '{"error":"boom"}', { 'content-type': 'application/json' });
    if (u === '/logout') return send(302, '', { location: '/login', 'set-cookie': 'sid=; Path=/; Max-Age=0' });
    return send(404, page('Not found', '<h1>404</h1>'));
  });
}
before(async () => { OUT = mkdtempSync(join(tmpdir(), 'dcore-m41-')); await new Promise<void>((ok) => { srv = createServer(app); srv.listen(0, '127.0.0.1', () => { A = `http://127.0.0.1:${(srv.address() as any).port}`; ok(); }); }); process.env.M41_PASS = PASS; process.env.DCORE_USER = 'admin'; });
after(() => { srv?.close(); if (OUT) rmSync(OUT, { recursive: true, force: true }); delete process.env.M41_PASS; delete process.env.DCORE_USER; });

const setupBrowse = () => [{ goto: `${A}/login` }, { fill: { selector: '#user', value: 'admin' } }, { fill: { selector: '#pass', valueEnv: 'M41_PASS' } }, { click: { selector: '#signin' } }, { waitFor: { url: '/dashboard' } }];
const setupScenario = () => [{ action: 'goto', target: `${A}/login` }, { action: 'fill', target: { selector: '#user' }, input: 'admin' }, { action: 'fill', target: { selector: '#pass' }, input: { valueEnv: 'M41_PASS' } }, { action: 'click', target: { selector: '#signin' }, expect: { url: '/dashboard' } }];
let MAP: any = null;

test('M41-1. pure helpers: path normalisation, sample values from constraints, unknown approval gates rejected', () => {
  assert.equal(normalizePath('/api/orders/123/notes'), '/api/orders/:id/notes');
  assert.equal(normalizePath('/t/0b1c2d3e4f5a6b7c8d9e'), '/t/:hex');
  assert.equal(sampleValue({ type: 'number', constraints: { min: '1', max: '10' } }), '5');
  assert.equal(sampleValue({ type: 'email' }), 'qa.user@example.test');
  assert.equal(sampleValue({ type: 'text', constraints: { maxlength: '3' } }), 'DCo');
  assert.ok(validateScenarios({ scenarios: [{ id: 'A', title: 't', requires_approval: ['launch-missiles'], steps: [{ action: 'goto', target: 'http://x.test' }] }] }).some((e: string) => /unknown approval gate/.test(e)));
});

test('M41-2. discovery: routes, nav, forms, inputs, buttons, tables, dialogs, tabs, dropdowns, search/filter, auth boundary, API calls, errors, responsive — passively and deterministically', { skip: SKIP }, async () => {
  LOG.length = 0;
  const map = await discoverApp(`${A}/dashboard`, { setup: setupBrowse(), outDir: join(OUT, 'd1'), stepTimeoutMs: 6000 });
  MAP = map;
  assert.equal(map.status, 'DISCOVERED');
  assert.deepEqual(map.routes.map((r: any) => r.route), ['/customers', '/dashboard', '/orders', '/settings']);
  const orders = map.routes.find((r: any) => r.route === '/orders');
  assert.deepEqual(orders.nav.map((n: any) => [n.route, n.state_changing]), [['/customers', false], ['/dashboard', false], ['/logout', true], ['/orders', false], ['/settings', false]]);   // listed, but flagged and never visited
  const form = orders.forms.find((f: any) => f.selector === '#create');
  assert.ok(form && form.method === 'post' && form.state_changing);
  assert.deepEqual(form.fields.map((f: any) => [f.selector, f.type, f.required]), [['#email', 'email', true], ['#qty', 'number', true], ['#note', 'text', false]]);
  assert.deepEqual(form.fields[1].constraints, { required: true, min: '1', max: '10' });
  assert.ok(orders.buttons.some((b: any) => b.selector === '#del' && b.state_changing && !b.in_form));
  assert.equal(orders.tables[0].rows, 2);
  assert.deepEqual(orders.dialogs.map((d: any) => [d.title, d.open]), [['Delete order?', false]]);
  assert.deepEqual(orders.tabs.map((t: any) => t.name), ['Open', 'Closed']);
  assert.ok(orders.dropdowns.some((d: any) => d.selector === '#status' && d.options === 3));
  assert.deepEqual(orders.search_filters.map((s: any) => [s.kind, s.selector, s.scope, s.table]), [['search', '#menu-search', 'global', null], ['search', '#q', 'page', '#orders'], ['filter', '#status', 'page', '#orders']]);
  assert.deepEqual(orders.api.map((a: any) => `${a.method} ${a.path} ${a.status}`), ['GET /api/orders 200', 'GET /api/orders/:id/notes 200']);
  const settings = map.routes.find((r: any) => r.route === '/settings');
  assert.ok(settings.console_errors.some((e: string) => /settings-error/.test(e)));
  assert.ok(settings.network_failures.some((n: string) => /500 \/api\/broken/.test(n)));
  assert.equal(settings.responsive.meta_viewport, false); assert.equal(settings.responsive.mobile_friendly, false);
  assert.equal(map.routes.find((r: any) => r.route === '/customers').states.empty_states.length > 0, true);
  assert.deepEqual(map.auth.protected_routes, ['/customers', '/dashboard', '/orders', '/settings']);
  assert.equal(map.auth.login_route, '/login');   // learned from the unauthenticated probe's redirect
  assert.equal(map.auth.login_marker, 'Sign in to Admin');
  assert.deepEqual(map.skipped_links.map((s: any) => s.route).sort(), ['/export/orders.csv', '/logout', '/orders/delete-all']);
  assert.deepEqual(map.external_origins, ['https://external.example.test']);
  assert.ok(map.api_endpoints.some((e: any) => e.path === '/api/broken' && e.statuses.includes(500)));
  // SAFETY: only GET requests besides the login POST; no risky/download route was ever requested
  const writes = LOG.filter((l) => !l.startsWith('GET ') && l !== 'POST /session');
  assert.deepEqual(writes, [], `discovery sent writes: ${writes.join(', ')}`);
  for (const r of ['/logout', '/orders/delete-all', '/export/orders.csv']) assert.ok(!LOG.includes(`GET ${r}`), `visited ${r}`);
  // every control is DISCOVERED, never tested
  assert.ok(!JSON.stringify(map).includes('"TESTED"'));
  assert.match(map.lifecycle_note, /Nothing in this map has been functionally tested/);
  assert.equal(map.map_hash, mapHash(map));
  // determinism: a second crawl of the same app yields the same map hash
  const again = await discoverApp(`${A}/dashboard`, { setup: setupBrowse(), outDir: join(OUT, 'd2'), stepTimeoutMs: 6000 });
  assert.equal(again.map_hash, map.map_hash);
  assert.match(renderAppMap(map), /\| \/orders \| page \| protected \|/);
});

test('M41-3. candidates: categories, APPROVAL_REQUIRED classification, review placeholders, all CANDIDATE, deterministic', { skip: SKIP }, () => {
  assert.ok(MAP, 'needs the map from M41-2');
  const c1 = generateCandidates(MAP, { setup: setupScenario() }); const c2 = generateCandidates(MAP, { setup: setupScenario() });
  assert.deepEqual(c1, c2);
  assert.deepEqual(validateScenarios(c1), []);
  const cats = new Set(c1.scenarios.map((s: any) => s.category));
  for (const c of ['happy-path', 'required-validation', 'invalid-input', 'boundary', 'empty-state', 'search-filter', 'permission', 'authentication', 'error-handling', 'responsive', 'navigation', 'persistence', 'state-change']) assert.ok(cats.has(c), `missing category ${c}`);
  assert.ok(c1.scenarios.every((s: any) => s.lifecycle === 'CANDIDATE'));
  const approval = c1.scenarios.filter((s: any) => s.approval === 'APPROVAL_REQUIRED');
  assert.ok(approval.length >= 3);
  assert.ok(approval.every((s: any) => s.requires_approval.length > 0));
  assert.ok(c1.scenarios.filter((s: any) => ['happy-path', 'persistence'].includes(s.category) && /Create order/.test(s.title)).every((s: any) => s.approval === 'APPROVAL_REQUIRED'));
  assert.ok(c1.scenarios.find((s: any) => s.category === 'state-change' && /Delete selected/.test(s.title)).requires_approval.includes('ui-write'));
  assert.ok(c1.scenarios.filter((s: any) => ['required-validation', 'invalid-input', 'boundary', 'responsive', 'navigation'].includes(s.category)).every((s: any) => s.approval === 'SAFE'));
  assert.ok(c1.scenarios.some((s: any) => s.review.length && JSON.stringify(s.steps).includes('{{data.')));
  assert.equal(c1.scenarios.find((s: any) => s.category === 'permission').status, 'NOT_TESTED');
  // regression (staging): a global menu search is never paired with a page table or turned into page search candidates
  assert.ok(!JSON.stringify(c1.scenarios.filter((s: any) => ['empty-state', 'search-filter'].includes(s.category))).includes('#menu-search'));
  assert.ok(c1.scenarios.some((s: any) => s.category === 'empty-state' && JSON.stringify(s.steps).includes('#orders tbody tr')));
});

test('M41-4. executing candidates: approval-required send nothing; placeholders block; safe ones are really TESTED (PASSED/FAILED); coverage lifecycle', { skip: SKIP }, async () => {
  assert.ok(MAP);
  const cands = generateCandidates(MAP, { setup: setupScenario() });
  LOG.length = 0;
  const run = await runScenarios(cands, { outDir: join(OUT, 'run'), stepTimeoutMs: 5000 });
  const st = (pred: (s: any) => boolean) => run.scenarios.filter(pred);
  // approval-required: BLOCKED as APPROVAL_REQUIRED, no POST /orders ever sent
  const appr = st((s) => cands.scenarios.find((c: any) => c.id === s.scenario_id)?.approval === 'APPROVAL_REQUIRED');
  assert.ok(appr.length && appr.every((s: any) => s.status === 'BLOCKED' && /APPROVAL_REQUIRED/.test(s.actual)));
  assert.ok(!LOG.some((l) => l.startsWith('POST /orders')), 'an approval-required candidate submitted data');
  // review placeholders: BLOCKED (unresolved template), never PASS
  const sf = run.scenarios.find((s: any) => /Search "Search orders" narrows/.test(s.title));
  assert.equal(sf.status, 'BLOCKED'); assert.match(sf.actual, /unresolved template/);
  // safe candidates really execute
  const byCat = (cat: string) => run.scenarios.filter((s: any) => cands.scenarios.find((c: any) => c.id === s.scenario_id)?.category === cat);
  assert.ok(byCat('boundary').length && byCat('boundary').every((s: any) => s.status === 'PASS'), JSON.stringify(byCat('boundary').map((s: any) => [s.title, s.status, s.actual])));
  assert.ok(byCat('required-validation').every((s: any) => s.status === 'PASS'));
  assert.ok(byCat('navigation').every((s: any) => s.status === 'PASS'), JSON.stringify(byCat('navigation').map((s: any) => s.actual)));
  assert.equal(run.scenarios.find((s: any) => /\/settings is mobile-friendly/.test(s.title)).status, 'FAIL');
  assert.equal(run.scenarios.find((s: any) => /\/settings loads without runtime errors/.test(s.title)).status, 'FAIL');
  assert.equal(run.scenarios.find((s: any) => /unknown route without a session is sent to login/.test(s.title)).status, 'PASS');
  assert.equal(run.scenarios.find((s: any) => /not-found page to a signed-in user/.test(s.title)).status, 'BLOCKED');   // review placeholder
  assert.ok(byCat('authentication').filter((s: any) => /Unauthenticated/.test(s.title)).every((s: any) => s.status === 'FAIL' || s.status === 'PASS'));
  const empty = run.scenarios.find((s: any) => /Search "Search orders" with no match/.test(s.title));
  assert.equal(empty.status, 'PASS', empty.actual);
  // coverage lifecycle
  const cov = coverage(MAP, cands, run);
  const lc = new Set(cov.scenarios.map((s: any) => s.lifecycle));
  assert.ok(lc.has('TESTED') && lc.has('BLOCKED') && lc.has('NOT_TESTED'));
  assert.ok(cov.scenarios.filter((s: any) => s.lifecycle === 'TESTED').every((s: any) => ['PASSED', 'FAILED'].includes(s.result)));
  assert.ok(cov.summary.passed > 0 && cov.summary.failed > 0 && cov.summary.blocked > 0);
  assert.ok(cov.controls.some((c: any) => c.selector === '#qty' || c.lifecycle === 'TESTED'));
  assert.ok(cov.controls.some((c: any) => c.selector === '#del' && c.lifecycle === 'DISCOVERED'), 'a never-executed destructive control stays DISCOVERED');
  assert.ok(!JSON.stringify(run).includes(PASS));
});

test('M41-5. no browser: discovery is BLOCKED and claims nothing; CLI writes map + summary + candidates', async () => {
  const none = await discoverApp('http://127.0.0.1:9/', { browser: join(OUT, 'no-such-browser.exe') });
  assert.equal(none.status, 'BLOCKED'); assert.deepEqual(none.routes, []);
  assert.equal((await discoverApp('not a url')).status, 'BLOCKED');
  if (SKIP) return;
  const out = join(OUT, 'cli');
  const setup = JSON.stringify(setupBrowse());
  // async spawn: the fixture server lives in THIS process, so a synchronous spawn would deadlock it
  const r: any = await new Promise((ok) => { const c = spawn(process.execPath, [CLI, 'dcore-explore', '--app', `${A}/dashboard`, '--setup', setup, '--max-pages', '3', '--out', out, '--json'], { env: { ...process.env, M41_PASS: PASS } }); let stdout = '', stderr = ''; c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; }); c.on('close', (status) => ok({ status, stdout, stderr })); });
  assert.equal(r.status, 0, (existsSync(join(out, 'appmap.json')) ? JSON.stringify(JSON.parse(readFileSync(join(out, 'appmap.json'), 'utf8')).setup) : r.stdout.slice(0, 800)) + r.stderr);
  const res = JSON.parse(r.stdout);
  assert.equal(res.evidence.routes, 3);
  for (const f of ['appmap.json', 'app-map.md', 'candidate-scenarios.json']) assert.ok(existsSync(join(out, f)), f);
  assert.ok(!readFileSync(join(out, 'appmap.json'), 'utf8').includes(PASS));
  assert.ok(JSON.parse(readFileSync(join(out, 'appmap.json'), 'utf8')).crawl.truncated);
});
