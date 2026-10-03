// M40 — functional scenario engine. Scenarios execute through dcore-browse / dcore-api / dcore-run / dcore-verify
// against a LOCAL fixture "token admin" app (login, Analytics > Tokens, create token, persisted details, JSON API).
// Secrets are sentinels; nothing leaves 127.0.0.1.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { spawnSync } from 'node:child_process';
import { runScenarios, scenarioReports, validateScenarios, applyTemplates, compileBrowserStep, expectedText, TEST_TYPES } from '../../skills/dcore/scripts/exec/scenario.mjs';
import { findBrowser } from '../../skills/dcore/scripts/exec/browse.mjs';
import { TEST_DIR } from './helpers.ts';

const SKIP = findBrowser() ? false : 'no Chromium-family browser';
const CLI = join(TEST_DIR, '..', '..', 'skills', 'dcore', 'scripts', 'dcore.mjs');
const PASS = 'M40-SENTINEL-pw-55aa'; const API_TOKEN = 'M40-SENTINEL-api-77bb';
let A = ''; let srv: Server; let OUT = '';
const tokens: any[] = [];

const html = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
const app = (req: any, res: any) => {
  let body = ''; req.on('data', (d: any) => { body += d; });
  req.on('end', () => {
    const u = req.url.split('?')[0]; const authed = /sid=ok/.test(req.headers.cookie ?? '') || req.headers.authorization === `Bearer ${API_TOKEN}`;
    const send = (code: number, type: string, b: string, h: any = {}) => { res.writeHead(code, { 'content-type': type, ...h }); res.end(b); };
    if (u === '/session' && req.method === 'POST') { const f = new URLSearchParams(body); return f.get('u') === 'admin' && f.get('p') === PASS ? send(302, 'text/plain', '', { location: '/admin', 'set-cookie': 'sid=ok; Path=/' }) : send(302, 'text/plain', '', { location: '/login?e=1' }); }
    if (u === '/login') return send(200, 'text/html', html('Login', `<h1>Login</h1><form method="post" action="/session"><label>Username <input name="u"></label><label>Password <input name="p" type="password"></label><button>Submit</button></form>`));
    if (!authed) return u.startsWith('/api/') ? send(401, 'application/json', '{"error":"unauthorized"}') : send(302, 'text/plain', '', { location: '/login' });
    if (u === '/admin') return send(200, 'text/html', html('Admin', `<h1>Dashboard</h1><nav><a href="/admin/analytics">Analytics</a></nav>`));
    if (u === '/admin/analytics') return send(200, 'text/html', html('Analytics', `<h1>Analytics</h1><a href="/admin/analytics/tokens">Tokens</a>`));
    if (u === '/api/tokens' && req.method === 'GET') return send(200, 'application/json', JSON.stringify(tokens));
    if (u === '/api/tokens' && req.method === 'POST') {
      const t = JSON.parse(body || '{}'); const rate = Number(t.rate);
      if (!t.name || !(rate >= 1 && rate <= 1000)) return send(400, 'application/json', JSON.stringify({ error: 'Rate limit must be between 1 and 1000' }));
      const tok = { id: tokens.length + 1, name: t.name, owner: t.owner, rate }; tokens.push(tok); return send(201, 'application/json', JSON.stringify(tok));
    }
    if (u === '/admin/analytics/tokens') return send(200, 'text/html', html('API tokens', `<h1>API tokens</h1><button id="new">New token</button>
<div id="form" style="display:none"><label>Token name <input id="name"></label><label>Owner <select id="owner"><option>Paysecure</option><option>Whitelabel</option></select></label>
<label>Rate limit <input id="rate" type="number" min="1" max="1000" value="60"></label><button id="create">Create token</button></div>
<div id="note" role="status"></div><h2>Active</h2><ul id="list"></ul><section id="detail"></section>
<script>
const $ = (s) => document.querySelector(s);
const load = async () => { const r = await fetch('/api/tokens'); const ts = await r.json(); $('#list').innerHTML = ts.map((t) => '<li><a href="#" data-id="' + t.id + '">' + t.name + '</a></li>').join(''); };
$('#new').onclick = () => { $('#form').style.display = 'block'; };
$('#create').onclick = async () => { $('#note').textContent = ''; const r = await fetch('/api/tokens', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('#name').value, owner: $('#owner').value, rate: $('#rate').value }) }); const j = await r.json(); if (!r.ok) { $('#note').textContent = 'Error: ' + j.error; return; } $('#note').textContent = 'Token created: ' + j.name; await load(); };
$('#list').onclick = async (e) => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); const ts = await (await fetch('/api/tokens')).json(); const t = ts.find((x) => String(x.id) === a.dataset.id); $('#detail').innerHTML = '<h3>Details</h3><label>Name <input id="d-name" readonly value="' + t.name + '"></label><label>Owner <input id="d-owner" readonly value="' + t.owner + '"></label><label>Rate <input id="d-rate" readonly value="' + t.rate + '"></label>'; };
load();
</script>`));
    return send(404, 'text/plain', 'nope');
  });
};

before(async () => { OUT = mkdtempSync(join(tmpdir(), 'dcore-m40-')); await new Promise<void>((ok) => { srv = createServer(app); srv.listen(0, '127.0.0.1', () => { A = `http://127.0.0.1:${(srv.address() as any).port}`; ok(); }); }); process.env.M40_PASS = PASS; process.env.M40_API = API_TOKEN; });
after(() => { srv?.close(); if (OUT) rmSync(OUT, { recursive: true, force: true }); delete process.env.M40_PASS; delete process.env.M40_API; });

const login = () => [
  { id: 'L1', action: 'goto', target: `${A}/login` },
  { id: 'L2', action: 'fill', target: { label: 'Username' }, input: 'admin' },
  { id: 'L3', action: 'fill', target: { label: 'Password' }, input: { valueEnv: 'M40_PASS' } },
  { id: 'L4', action: 'click', target: { text: 'Submit', role: 'button' }, expect: { url: '/admin', text: 'Dashboard' } },
];
const createToken = (id = 'SC-001') => ({
  id, title: 'Create API Token', feature: 'Analytics / Tokens', type: 'Functional', priority: 'P1', preconditions: 'Authenticated administrator.',
  data: { name: 'dcore-{{run.short}}', owner: 'Whitelabel', rate: '250' },
  expected: 'Token is created and the persisted configuration matches the submitted values.',
  steps: [
    { id: 'S1', action: 'click', target: { text: 'Analytics' }, expect: { url: '/admin/analytics' } },
    { id: 'S2', action: 'click', target: { text: 'Tokens' }, expect: { text: 'API tokens' } },
    { id: 'S3', action: 'click', target: { text: 'New token' }, expect: { target: { label: 'Token name' }, visible: true } },
    { id: 'S4', action: 'fill', target: { label: 'Token name' }, input: '{{data.name}}', expect: { value: '{{data.name}}' } },
    { id: 'S5', action: 'select', target: { label: 'Owner' }, input: '{{data.owner}}', expect: { value: '{{data.owner}}' } },
    { id: 'S6', action: 'fill', target: { label: 'Rate limit' }, input: '{{data.rate}}', expect: { value: '{{data.rate}}' } },
    { id: 'S7', action: 'click', target: { text: 'Create token' } },
    { id: 'S8', action: 'assert', expect: { notification: 'Token created: {{data.name}}' } },
    { id: 'S9', action: 'assert', expect: { target: { text: '{{data.name}}', role: 'link' }, visible: true } },
    { id: 'S10', action: 'click', target: { text: '{{data.name}}', role: 'link' }, expect: { text: 'Details' } },
    { id: 'S11', action: 'assert', expect: { target: { selector: '#d-name' }, value: '{{data.name}}' } },
    { id: 'S12', action: 'assert', expect: { target: { selector: '#d-owner' }, value: '{{data.owner}}' } },
    { id: 'S13', action: 'assert', expect: { target: { selector: '#d-rate' }, value: '{{data.rate}}' } },
    { id: 'S14', action: 'api', input: { url: `${A}/api/tokens`, authEnv: 'M40_API' }, expect: { status: 200, bodyContains: '{{data.name}}' } },
    { id: 'S15', action: 'run', input: { command: `"${process.execPath}" -e "console.log('repo check ok')"` }, expect: { exitCode: 0, outputContains: 'repo check ok' } },
  ],
});
const goTokens = { id: 'N0', action: 'goto', target: '' };   // filled per test (A known only at runtime)

// ---- pure ------------------------------------------------------------------------------------------------------
test('M40-1. scenario validation: types, priorities, actions, locators, ids, declared statuses', () => {
  assert.equal(TEST_TYPES.length, 12);
  assert.deepEqual(validateScenarios({ scenarios: [{ id: 'A', title: 't', type: 'Functional', steps: [{ action: 'goto', target: 'http://x.test' }] }] }), []);
  const errs = validateScenarios({ scenarios: [
    { id: 'A', title: 't', type: 'Weird', priority: 'P9', steps: [{ action: 'teleport' }, { action: 'click' }, { action: 'assert' }, { action: 'run' }] },
    { id: 'A', title: 'dup', steps: [] }, { title: 'no id', steps: [] }, { id: 'D', title: 'x', status: 'PASS' },
  ] });
  for (const re of [/unknown type "Weird"/, /priority must be/, /unknown action "teleport"/, /click needs a target/, /assert needs "expect"/, /run needs input.command/, /duplicate scenario id/, /id is required/, /declared status must be/]) assert.ok(errs.some((e: string) => re.test(e)), `${re}: ${errs.join(' | ')}`);
  assert.ok(validateScenarios({}).length && validateScenarios(null).length);
});

test('M40-2. templates resolve data/run values; unknown keys are reported, never silently emptied', () => {
  const missing = new Set<string>();
  assert.deepEqual(applyTemplates({ a: 'tok-{{data.n}}-{{run.short}}', b: ['{{data.n}}'] }, { data: { n: 'x' }, run: { short: 'abc' } }, missing), { a: 'tok-x-abc', b: ['x'] });
  applyTemplates('{{data.nope}}', { data: {} }, missing);
  assert.deepEqual([...missing], ['data.nope']);
});

test('M40-3. step compilation: action + expectations map onto dcore-browse steps; expected text is human readable', () => {
  const c = compileBrowserStep({ action: 'click', target: { text: 'Save' }, expect: { notification: 'Saved', url: '/done', state: 'DISABLED', value: 'x', count: { selector: 'li', min: 1 } } });
  assert.deepEqual(c.action, { click: { text: 'Save' } });
  assert.deepEqual(c.checks.map((x: any) => Object.keys(x.s).find((k) => k !== 'timeoutMs')), ['waitFor', 'waitFor', 'assertState', 'assertValue', 'assertCount']);
  assert.equal(compileBrowserStep({ action: 'assert', expect: { text: 'Hi' } }).action, null);
  assert.match(expectedText({ action: 'click', target: { text: 'X' } }), /no outcome declared/);
  assert.match(expectedText({ action: 'api', expect: { status: 201 } }), /HTTP 201/);
});

// ---- real execution ----------------------------------------------------------------------------------------------
test('M40-4. Create API Token: 15 steps across browser + API + repo command; persisted values verified; per-step evidence; 3 PDFs', { skip: SKIP }, async () => {
  const out = join(OUT, 'create');
  const doc = { name: 'Token admin', target: A, environment: 'local-fixture', setup: login(), scenarios: [createToken()] };
  const sr = await runScenarios(doc, { outDir: out, approvals: ['ui-write'], stepTimeoutMs: 6000 });
  const sc = sr.scenarios[0];
  assert.equal(sr.setup.status, 'PASS', JSON.stringify(sr.setup.steps.map((s: any) => [s.step_id, s.status, s.actual])));
  assert.equal(sc.status, 'PASS', JSON.stringify(sc.steps.filter((s: any) => s.status !== 'PASS').map((s: any) => [s.step_id, s.actual])));
  assert.equal(sc.steps.length, 15);
  const name = `dcore-${sr.run_id.slice(-6)}`;
  assert.ok(tokens.some((t) => t.name === name && t.owner === 'Whitelabel' && t.rate === 250), 'the server persisted exactly the submitted values');
  for (const st of sc.steps) for (const k of ['run_id', 'scenario_id', 'step_id', 'action', 'target', 'expected', 'actual', 'status', 'timestamp']) assert.ok(st[k] !== undefined && st[k] !== '', `${st.step_id}.${k}`);
  assert.ok(sc.steps.filter((s: any) => !['api', 'run'].includes(s.action)).every((s: any) => s.url && Array.isArray(s.console_errors) && Array.isArray(s.network_failures)));
  assert.equal(sc.steps.find((s: any) => s.step_id === 'S7').verified, false);   // a bare click is performed, not "verified"
  assert.equal(sc.steps.find((s: any) => s.step_id === 'S13').verified, true);
  assert.match(sc.steps.find((s: any) => s.step_id === 'S14').actual, /HTTP 200/);
  assert.match(sc.steps.find((s: any) => s.step_id === 'S15').actual, /PASS exit code == 0/);
  const files = await scenarioReports(sr, { outDir: out });
  for (const k of ['test_report_pdf', 'defect_report_pdf', 'test_case_register_pdf']) { assert.equal(files[k].ok, true, files[k].error); assert.equal(readFileSync(files[k].pdf).subarray(0, 5).toString(), '%PDF-'); }
  const all = JSON.stringify(sr) + readdirSync(out).filter((f) => statSync(join(out, f)).isFile() && !/\.(png|pdf)$/.test(f)).map((f) => readFileSync(join(out, f), 'utf8')).join('');
  assert.ok(!all.includes(PASS) && !all.includes(API_TOKEN), 'no secret in run evidence or reports');
});

test('M40-5. negative + guard + honesty: invalid rate rejected; no ui-write approval => BLOCKED (nothing created); no expectations => NOT_TESTED; declared/unresolved/setup states', { skip: SKIP }, async () => {
  const before = tokens.length;
  const tokensUrl = { ...goTokens, target: `${A}/admin/analytics/tokens` };
  const doc = { name: 'Token admin (negative)', target: A, setup: login(), data: { name: 'neg-{{run.short}}' }, scenarios: [
    { id: 'SC-NEG', title: 'Rate limit above maximum is rejected', feature: 'Tokens', type: 'Validation', priority: 'P2', steps: [tokensUrl, { action: 'click', target: { text: 'New token' } }, { action: 'fill', target: { label: 'Token name' }, input: '{{data.name}}' }, { action: 'fill', target: { label: 'Rate limit' }, input: '5000', expect: { value: '5000' } }, { action: 'assert', expect: { target: { label: 'Rate limit' }, state: 'INTERACTABLE' } }] },
    { id: 'SC-GUARD', title: 'Create without ui-write approval', feature: 'Tokens', type: 'Functional', priority: 'P1', steps: [tokensUrl, { action: 'click', target: { text: 'New token' } }, { action: 'fill', target: { label: 'Token name' }, input: 'guarded-{{run.short}}' }, { action: 'click', target: { text: 'Create token' } }, { action: 'assert', expect: { notification: 'Token created' } }] },
    { id: 'SC-NOEXP', title: 'Steps without expectations', feature: 'Tokens', type: 'Smoke', steps: [tokensUrl, { action: 'click', target: { text: 'New token' } }] },
    { id: 'SC-NA', title: 'Mobile app', feature: 'Mobile', status: 'NOT_APPLICABLE', reason: 'web only', steps: [] },
    { id: 'SC-TPL', title: 'Unresolved template', feature: 'Tokens', steps: [{ action: 'goto', target: '{{data.nowhere}}' }] },
  ] };
  const sr = await runScenarios(doc, { outDir: join(OUT, 'neg'), stepTimeoutMs: 4000 });
  const st = (id: string) => sr.scenarios.find((s: any) => s.scenario_id === id);
  assert.equal(st('SC-NEG').status, 'PASS', st('SC-NEG').actual);
  assert.equal(st('SC-GUARD').status, 'BLOCKED');
  assert.match(st('SC-GUARD').actual, /ui-write/);
  assert.equal(st('SC-GUARD').steps.at(-1).status, 'SKIPPED');
  assert.equal(tokens.length, before, 'the guarded click must not create anything');
  assert.equal(st('SC-NOEXP').status, 'NOT_TESTED', 'PASS is never inferred from the absence of an error');
  assert.equal(st('SC-NA').status, 'NOT_APPLICABLE');
  assert.equal(st('SC-TPL').status, 'BLOCKED'); assert.match(st('SC-TPL').actual, /unresolved template/);
  assert.equal(sr.totals.PASS, 1);
  // setup failure blocks every scenario
  process.env.M40_WRONG = 'wrong-pw';
  const bad = await runScenarios({ name: 'bad login', setup: [...login().slice(0, 2), { id: 'L3', action: 'fill', target: { label: 'Password' }, input: { valueEnv: 'M40_WRONG' } }, login()[3]], scenarios: [createToken('SC-X')] }, { outDir: join(OUT, 'bad'), approvals: ['ui-write'], stepTimeoutMs: 3000 });
  delete process.env.M40_WRONG;
  assert.equal(bad.setup.status, 'FAIL');
  assert.equal(bad.scenarios[0].status, 'BLOCKED');
  assert.ok(bad.scenarios[0].steps.every((s: any) => s.status === 'BLOCKED'));
});

test('M40-6. failures: a failed expectation fails the step and skips the rest; screenshot + console/network evidence captured', { skip: SKIP }, async () => {
  const doc = { name: 'fail', setup: login(), scenarios: [{ id: 'SC-F', title: 'Wrong expectation', feature: 'Tokens', type: 'Regression', priority: 'P2', steps: [{ action: 'goto', target: `${A}/admin/analytics/tokens`, expect: { text: 'Totally different heading' }, timeoutMs: 1200 }, { action: 'click', target: { text: 'New token' } }] }] };
  const sr = await runScenarios(doc, { outDir: join(OUT, 'fail'), stepTimeoutMs: 3000 });
  const sc = sr.scenarios[0];
  assert.equal(sc.status, 'FAIL');
  assert.equal(sc.steps[0].status, 'FAIL'); assert.match(sc.steps[0].actual, /TIMEOUT/);
  assert.ok(sc.steps[0].screenshot && existsSync(sc.steps[0].screenshot));
  assert.equal(sc.steps[1].status, 'SKIPPED');
});

test('M40-7. no browser: browser steps BLOCKED (never PASS) while API and command steps still execute', async () => {
  const sr = await runScenarios({ name: 'nob', scenarios: [{ id: 'M', title: 'mixed', feature: 'Ops', type: 'Integration', steps: [{ action: 'run', input: { command: `"${process.execPath}" -e "0"` }, expect: { exitCode: 0 } }, { action: 'goto', target: 'http://127.0.0.1:9/' }] }] }, { outDir: join(OUT, 'nob'), browser: join(OUT, 'no-such-browser.exe') });
  const sc = sr.scenarios[0];
  assert.equal(sc.steps[0].status, 'PASS');
  assert.equal(sc.steps[1].status, 'BLOCKED');
  assert.equal(sc.status, 'BLOCKED');
  assert.ok(sr.limitations.some((l: string) => /browser unavailable/.test(l)));
});

test('M40-8. invalid documents execute nothing; CLI --scenarios returns BLOCKED with errors (exit 3)', () => {
  const r = spawnSync(process.execPath, [CLI, 'dcore-qa', '--scenarios', '{"scenarios":[{"id":"A","title":"t","type":"Nope","steps":[]}]}', '--json', '--no-pdf', '--out', join(OUT, 'cli')], { encoding: 'utf8' });
  assert.equal(r.status, 3, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.result, 'BLOCKED');
  assert.ok(out.evidence.errors.some((e: string) => /unknown type "Nope"/.test(e)));
});
