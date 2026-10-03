// M42 — systematic negative & boundary testing: applicability decisions, fault injection inside the test browser,
// expired session, refresh / back / double submission, and defect candidates for violated negative expectations.
// Runs against a LOCAL fixture app with one fragile page (/limits: unhandled API failures, a field whose input handler
// throws, no double-submit protection) and one robust page (/safe), so both HELD and VIOLATED outcomes are real.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { discoverApp } from '../../skills/dcore/scripts/exec/discover.mjs';
import { generateCandidates, sampleValue } from '../../skills/dcore/scripts/exec/candidates.mjs';
import { NEGATIVE_CASES, planNegative, defectCandidate, isViolation, matrixSummary, renderMatrix } from '../../skills/dcore/scripts/exec/negative.mjs';
import { runScenarios, validateScenarios, scenarioReports } from '../../skills/dcore/scripts/exec/scenario.mjs';
import { findBrowser } from '../../skills/dcore/scripts/exec/browse.mjs';
import { TEST_DIR } from './helpers.ts';

const SKIP = findBrowser() ? false : 'no Chromium-family browser';
const CLI = join(TEST_DIR, '..', '..', 'skills', 'dcore', 'scripts', 'dcore.mjs');
const PASS = 'M42-SENTINEL-pw-9d1e';
let A = ''; let srv: Server; let OUT = ''; const LOG: string[] = [];

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
const NAV = '<nav><a href="/home">Home</a> <a href="/limits">Limits</a> <a href="/safe">Safe</a></nav>';
function app(req: any, res: any) {
  let body = ''; req.on('data', (d: any) => { body += d; });
  req.on('end', () => {
    const u = req.url.split('?')[0]; LOG.push(`${req.method} ${u}`);
    const authed = /sid=ok/.test(req.headers.cookie ?? '');
    const send = (code: number, b: string, h: any = {}) => { res.writeHead(code, { 'content-type': 'text/html', ...h }); res.end(b); };
    if (u === '/session' && req.method === 'POST') { const f = new URLSearchParams(body); return f.get('u') === 'admin' && f.get('p') === PASS ? send(302, '', { location: '/home', 'set-cookie': 'sid=ok; Path=/' }) : send(302, '', { location: '/login?e=1' }); }
    if (u === '/login') return send(200, page('Login', `<h1>Sign in</h1><form method="post" action="/session"><label>Username <input id="user" name="u" required></label><label>Password <input id="pass" name="p" type="password" required></label><button id="signin">Sign in</button></form>`));
    if (!authed) return u.startsWith('/api/') ? send(401, '{"error":"unauthorized"}', { 'content-type': 'application/json' }) : send(302, '', { location: '/login' });
    if (u === '/home') return send(200, page('Home', `${NAV}<h1>Home</h1>`));
    if (u === '/limits') return send(200, page('Limits', `${NAV}<h1>Rate limits</h1><p>Configured: <span id="count">?</span></p>
<form method="get" action="/limits" id="find"><label>Find <input id="find-q" name="q" type="search"></label><button id="find-btn">Find</button></form>
<form method="post" action="/limits" id="limits">
<label>Rate limit <input id="rate" name="rate" type="number" min="1" max="1000" required></label>
<label>Name <input id="name" name="name" minlength="3" maxlength="20" required></label>
<label>Contact email <input id="email" name="email" type="email"></label>
<label>Start date <input id="start" name="start" type="date" min="2026-01-01" max="2026-12-31"></label>
<label>Notes <textarea id="notes" name="notes"></textarea></label>
<label>Tag <input id="tag" name="tag"></label>
<label>Plan <select id="plan" name="plan"><option>Basic</option><option>Pro</option></select></label>
<button id="save">Save limits</button></form>
<script>
fetch('/api/limits').then((r) => r.json()).then((d) => { document.getElementById('count').textContent = d.items.length; });
document.getElementById('tag').addEventListener('input', (e) => { if (e.target.value.includes('<')) throw new Error('tag handler cannot handle markup'); });
document.getElementById('limits').addEventListener('submit', (e) => { e.preventDefault(); fetch('/api/limits-save', { method: 'POST', body: new FormData(e.target) }); });
</script>`));
    if (u === '/safe') return send(200, page('Safe', `${NAV}<h1>Safe page</h1><p id="msg"></p><label>Comment <input id="comment" name="comment"></label>
<script>fetch('/api/limits').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((d) => { document.getElementById('msg').textContent = (d.items || []).length + ' limits'; }).catch(() => { document.getElementById('msg').textContent = 'Could not load limits'; });</script>`));
    if (u === '/api/limits') return send(200, '{"items":[1,2]}', { 'content-type': 'application/json' });
    if (u === '/api/limits-save' && req.method === 'POST') return send(201, '{"ok":true}', { 'content-type': 'application/json' });
    return send(404, page('Not found', '<h1>404</h1>'));
  });
}
before(async () => { OUT = mkdtempSync(join(tmpdir(), 'dcore-m42-')); await new Promise<void>((ok) => { srv = createServer(app); srv.listen(0, '127.0.0.1', () => { A = `http://127.0.0.1:${(srv.address() as any).port}`; ok(); }); }); process.env.M42_PASS = PASS; });
after(() => { srv?.close(); if (OUT) rmSync(OUT, { recursive: true, force: true }); delete process.env.M42_PASS; });

const setupBrowse = () => [{ goto: `${A}/login` }, { fill: { selector: '#user', value: 'admin' } }, { fill: { selector: '#pass', valueEnv: 'M42_PASS' } }, { click: { selector: '#signin' } }, { waitFor: { url: '/home' } }];
const setupScenario = () => [{ action: 'goto', target: `${A}/login` }, { action: 'fill', target: { selector: '#user' }, input: 'admin' }, { action: 'fill', target: { selector: '#pass' }, input: { valueEnv: 'M42_PASS' } }, { action: 'click', target: { selector: '#signin' }, expect: { url: '/home' } }];
const usable = (f: any) => f.visible !== false && f.selector && !['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'image'].includes(String(f.type).toLowerCase());
const fieldName = (f: any) => f.label || f.name || f.selector;

// a hand-written map: the planner must decide applicability from evidence, not blindly emit every case
const SYNTH: any = {
  origin: 'https://app.example.test', start_url: 'https://app.example.test/a', setup: { status: 'PASS' },
  auth: { login_route: '/login', login_marker: 'Sign in', protected_routes: ['/a', '/b'], public_routes: [] },
  routes: [
    { route: '/a', url: 'https://app.example.test/a', kind: 'page', auth: 'protected', h1: ['A'], nav: [{ text: 'B', route: '/b' }], api: [{ method: 'GET', path: '/api/a', status: 200 }],
      forms: [
        { selector: '#f', method: 'post', state_changing: true, fields: [{ selector: '#n', type: 'number', label: 'Rate limit', required: true, constraints: { min: 1, max: 1000 } }, { selector: '#s', type: 'select-one', label: 'Plan' }, { selector: '#t', type: 'text', label: 'Notes' }], submits: [{ selector: '#go', name: 'Save' }] },
        { selector: '#g', method: 'get', fields: [{ selector: '#q', type: 'search', label: 'Find' }], submits: [{ selector: '#find', name: 'Find' }] },
      ] },
    { route: '/b', url: 'https://app.example.test/b', kind: 'page', auth: 'protected', h1: ['B'], nav: [], api: [], forms: [], inputs: Array.from({ length: 3 }, (_, i) => ({ selector: `#i${i}`, type: 'text', label: `I${i}` })) },
  ],
};

test('M42-1. applicability: every case decided per target from evidence; only applicable cases become scenarios', () => {
  const { specs, matrix } = planNegative(SYNTH, { sampleValue, usable, fieldName, maxFieldsPerPage: 3 });
  const dec = (sel: string, c: string) => matrix.find((r: any) => (r.target.selector === sel || r.target.route === sel && r.target.level === 'page') && r.case === c)?.decision;
  // all 23 cases are decided somewhere
  for (const c of NEGATIVE_CASES) assert.ok(matrix.some((r: any) => r.case === c.id), `case ${c.id} not decided`);
  assert.equal(NEGATIVE_CASES.length, 23);
  // number with min/max: all four boundaries apply; a select: nothing free-form applies
  for (const c of ['valid', 'invalid', 'malformed', 'empty', 'min', 'max', 'below-min', 'above-max']) assert.equal(dec('#n', c), 'APPLICABLE', c);
  for (const c of ['unexpected-chars', 'long-input']) assert.equal(dec('#n', c), 'NOT_APPLICABLE', c);
  for (const c of NEGATIVE_CASES.filter((x) => x.level === 'field')) assert.equal(dec('#s', c.id), 'NOT_APPLICABLE');
  // free text without constraints: boundaries are NOT_APPLICABLE (no invented limits), robustness applies
  for (const c of ['min', 'max', 'below-min', 'above-max', 'invalid', 'malformed']) assert.equal(dec('#t', c), 'NOT_APPLICABLE', c);
  for (const c of ['unexpected-chars', 'long-input']) assert.equal(dec('#t', c), 'APPLICABLE', c);
  // forms: POST -> duplicate / double submit need approval; GET -> not applicable
  assert.equal(dec('#f', 'duplicate'), 'APPROVAL_REQUIRED'); assert.equal(dec('#f', 'double-submit'), 'APPROVAL_REQUIRED');
  assert.equal(dec('#g', 'duplicate'), 'NOT_APPLICABLE'); assert.equal(dec('#g', 'missing-required'), 'NOT_APPLICABLE');
  assert.equal(dec('#f', 'missing-required'), 'APPLICABLE');
  // pages: faults only where the page makes an API call; back only with a link
  for (const m of ['server-error', 'network-failure', 'timeout', 'empty-response', 'malformed-response']) { assert.equal(dec('/a', m), 'APPLICABLE'); assert.equal(dec('/b', m), 'NOT_APPLICABLE'); }
  assert.equal(dec('/a', 'back'), 'APPLICABLE'); assert.equal(dec('/b', 'back'), 'NOT_APPLICABLE');
  assert.equal(dec('/a', 'expired-session'), 'APPLICABLE'); assert.equal(dec('/a', 'unauthenticated'), 'APPLICABLE');
  assert.equal(matrix.find((r: any) => r.case === 'unauthorized').decision, 'NOT_TESTED');
  // field cap is explicit, never silent
  assert.ok(matrix.filter((r: any) => r.target.selector === '#q').length && matrix.filter((r: any) => r.target.selector === '#q').every((r: any) => r.decision === 'NOT_TESTED' && /field cap/.test(r.reason)));
  // every non-applicable decision says why; every applicable one has exactly one scenario
  assert.ok(matrix.filter((r: any) => ['NOT_APPLICABLE', 'NOT_TESTED'].includes(r.decision)).every((r: any) => r.reason && !r._key));
  assert.equal(specs.length, matrix.filter((r: any) => r._key).length);
  assert.ok(specs.every((s: any) => s.negative?.expected && s.negative?.violation && s.steps.some((st: any) => st.oracle)));
  assert.ok(specs.filter((s: any) => ['duplicate', 'double-submit'].includes(s.negative.case)).every((s: any) => s.requires_approval.includes('ui-write')));
  assert.deepEqual(planNegative(SYNTH, { sampleValue, usable, fieldName, maxFieldsPerPage: 3 }).matrix, matrix);   // deterministic
  // via the candidate generator: numbered, valid, matrix linked to scenario ids, summary
  const c = generateCandidates(SYNTH, { maxFieldsPerPage: 3 });
  assert.deepEqual(validateScenarios(c), []);
  const rows = c.negative_matrix.filter((r: any) => ['APPLICABLE', 'APPROVAL_REQUIRED'].includes(r.decision));
  assert.ok(rows.every((r: any) => r.scenario_ids.length === 1 && c.scenarios.some((s: any) => s.id === r.scenario_ids[0] && s.negative.case === r.case)));
  assert.equal(c.summary.negative.rows, c.negative_matrix.length);
  assert.ok(c.scenarios.some((s: any) => /^CAND-FI-\d{3}$/.test(s.id)) && c.scenarios.some((s: any) => /^CAND-SS-\d{3}$/.test(s.id)));
  assert.match(renderMatrix(c), /\| Malformed API response \| 1 \| 0 \| 1 \| 0 \|/);
  assert.equal(matrixSummary(c.negative_matrix).by_decision.APPROVAL_REQUIRED, 2);
});

test('M42-2. defect candidates: only a violated oracle expectation; severity / priority never invented', () => {
  const sc = { id: 'CAND-BD-002', title: 'Rate limit: 1001 (just above the maximum 1000) is rejected', negative: { case: 'above-max', label: 'Just above maximum', expected: 'Rate limit: 1001 (just above the maximum 1000) is rejected.', violation: 'Rate limit: 1001 (just above the maximum 1000) was accepted.' } };
  const viol = { step_id: 'S3', action: 'evaluate', status: 'FAIL', oracle: true, actual: 'value false (expected true)', url: 'https://app.example.test/a', screenshot: '/tmp/x.png', run_id: 'run-x', timestamp: 't', checks: [{ kind: 'expectation', label: 'value == true', status: 'FAIL', detail: 'value false (expected true)' }] };
  assert.equal(isViolation(viol), true);
  assert.equal(isViolation({ ...viol, oracle: false }), false, 'a non-oracle step (precondition) is not a violation');
  assert.equal(isViolation({ ...viol, checks: [{ kind: 'action', status: 'FAIL', detail: 'element NOT_FOUND' }] }), false, 'an action that could not run is not a violation');
  const d = defectCandidate(sc, viol, { evidence: ['/tmp/end.png'] }, 1);
  assert.equal(d.id, 'DC-001'); assert.match(d.status, /CANDIDATE/);
  assert.equal(d.scenario.id, 'CAND-BD-002'); assert.equal(d.step.id, 'S3');
  assert.equal(d.expected, 'Rate limit: 1001 (just above the maximum 1000) is rejected.');
  assert.match(d.actual, /^Rate limit: 1001 \(just above the maximum 1000\) was accepted\. Observed: value false/);
  assert.deepEqual(d.evidence.screenshots, ['/tmp/x.png', '/tmp/end.png']);
  assert.equal(d.defect_type_candidate.value, 'Validation — boundary');
  assert.equal(d.severity_candidate.value, 'UNASSESSED'); assert.equal(d.priority_candidate.value, 'UNASSESSED'); assert.match(d.severity_candidate.basis, /business impact/);
  // a security violation carries a rule-based proposal with its basis
  const s2 = defectCandidate({ id: 'X', title: 't', negative: { case: 'expired-session' } }, viol, {}, 2);
  assert.equal(s2.severity_candidate.value, 'high'); assert.match(s2.severity_candidate.basis, /access-control/);
});

let CANDS: any = null;
test('M42-3. fixture: negative cases run; faults are simulated in the browser only; HELD vs VIOLATED; approvals send nothing', { skip: SKIP }, async () => {
  const map = await discoverApp(`${A}/home`, { setup: setupBrowse(), outDir: join(OUT, 'map'), stepTimeoutMs: 6000 });
  assert.equal(map.status, 'DISCOVERED', map.reason);
  CANDS = generateCandidates(map, { setup: setupScenario() });
  assert.deepEqual(validateScenarios(CANDS), []);
  const neg = { ...CANDS, scenarios: CANDS.scenarios.filter((s: any) => s.negative && s.negative.case !== 'unauthorized') };
  LOG.length = 0;
  const run = await runScenarios(neg, { outDir: join(OUT, 'run'), stepTimeoutMs: 5000 });
  const by = (route: string, c: string, field?: string) => run.scenarios.filter((s: any) => { const src = CANDS.scenarios.find((x: any) => x.id === s.scenario_id); return src.negative.case === c && (src.source.route === route) && (!field || src.source.field === field || src.source.form === field); });
  const one = (route: string, c: string, field?: string) => { const r = by(route, c, field); assert.equal(r.length, 1, `${route} ${c} ${field ?? ''}: ${r.length}`); return r[0]; };
  const held = (s: any) => assert.equal(s.negative_outcome, 'HELD', `${s.title}: ${s.status} ${s.actual}`);
  const violated = (s: any) => { assert.equal(s.negative_outcome, 'VIOLATED', `${s.title}: ${s.status} ${s.actual}`); assert.ok(s.defect_candidate); };
  // boundaries / validation on the rate limit field hold (the browser enforces the declared constraints)
  for (const c of ['valid', 'invalid', 'malformed', 'empty', 'min', 'max', 'below-min', 'above-max']) held(one('/limits', c, '#rate'));
  for (const c of ['min', 'max', 'below-min', 'above-max']) held(one('/limits', c, '#name'));
  for (const c of ['min', 'max', 'below-min', 'above-max', 'invalid', 'malformed']) held(one('/limits', c, '#start'));
  held(one('/limits', 'missing-required', '#limits'));
  // robustness: the fragile tag handler throws on markup -> VIOLATED; the notes field holds
  violated(one('/limits', 'unexpected-chars', '#tag'));
  held(one('/limits', 'unexpected-chars', '#notes')); held(one('/limits', 'long-input', '#notes'));
  // faults: /limits does not handle API failures -> VIOLATED; /safe handles them -> HELD
  for (const m of ['server-error', 'network-failure', 'timeout', 'empty-response', 'malformed-response']) { violated(one('/limits', m)); held(one('/safe', m)); }
  assert.ok(run.browser.simulated_faults.length >= 10);
  // a simulated server error is never reported as a real backend failure
  assert.ok(!run.browser.network_failures.some((n: any) => /api\/limits/.test(n.url ?? '')), JSON.stringify(run.browser.network_failures));
  // session, navigation, refresh
  for (const r of ['/home', '/limits', '/safe']) { held(one(r, 'expired-session')); held(one(r, 'unauthenticated')); held(one(r, 'back')); }
  const afterExpire = run.scenarios.findIndex((s: any) => /expired session/.test(s.title));
  assert.ok(run.scenarios.slice(afterExpire + 1).some((s: any) => s.status === 'PASS' && s.steps.some((st: any) => st.action === 'goto' && /\/(limits|safe|home)$/.test(st.target))), 'the session was restored after the expiry scenario');
  held(one('/limits', 'refresh', '#limits')); held(one('/limits', 'refresh', '#find'));
  // approval-required: BLOCKED, nothing written
  for (const c of ['duplicate', 'double-submit']) { const s = one('/limits', c, '#limits'); assert.equal(s.status, 'BLOCKED'); assert.match(s.actual, /APPROVAL_REQUIRED/); }
  assert.ok(!LOG.some((l) => l.startsWith('POST /api/limits-save') || l.startsWith('POST /limits')), LOG.filter((l) => l.startsWith('POST')).join(','));
  // GET form: no duplicate / double-submit scenarios at all
  assert.ok(!CANDS.scenarios.some((s: any) => s.source?.form === '#find' && ['duplicate', 'double-submit'].includes(s.negative?.case)));
  // defect candidates: complete, evidence-backed, severity not invented
  const dcs = run.defect_candidates;
  assert.equal(dcs.length, 6);
  for (const d of dcs) {
    for (const k of ['scenario', 'step', 'expected', 'actual', 'evidence', 'severity_candidate', 'priority_candidate', 'defect_type_candidate']) assert.ok(d[k], `${d.id} lacks ${k}`);
    assert.equal(d.severity_candidate.value, 'UNASSESSED'); assert.equal(d.priority_candidate.value, 'UNASSESSED');
    assert.ok(d.evidence.screenshots.length > 0);
  }
  const se = dcs.find((d: any) => d.scenario.negative_case === 'server-error');
  assert.equal(se.defect_type_candidate.value, 'Error handling');
  assert.match(se.actual, /broke \/limits/); assert.match(se.actual, /Observed: new uncaught script error/);
  assert.equal(run.totals.negative.violated, 6);
  // reports: violated negatives become defects with UNASSESSED severity, not a priority-derived one
  const files = await scenarioReports(run, { outDir: join(OUT, 'run'), pdf: false });
  assert.ok(files);
  const rep = run.defects.filter((d: any) => d.defect_candidate);
  assert.equal(rep.length, 6);
  assert.ok(rep.every((d: any) => d.severity === 'unassessed' && d.priority === 'UNASSESSED' && d.severity_candidate.value === 'UNASSESSED'));
  assert.ok(!JSON.stringify(run).includes(PASS));
});

test('M42-4. approved double submission: two clicks send two writes -> VIOLATED defect candidate (data integrity)', { skip: SKIP }, async () => {
  assert.ok(CANDS, 'needs candidates from M42-3');
  const doc = { ...CANDS, scenarios: CANDS.scenarios.filter((s: any) => s.negative?.case === 'double-submit') };
  assert.equal(doc.scenarios.length, 1);
  LOG.length = 0;
  const run = await runScenarios(doc, { outDir: join(OUT, 'dbl'), stepTimeoutMs: 5000, approvals: ['ui-write'] });
  const s = run.scenarios[0];
  assert.equal(s.negative_outcome, 'VIOLATED', s.actual);
  assert.equal(LOG.filter((l) => l === 'POST /api/limits-save').length, 2);
  const d = run.defect_candidates[0];
  assert.equal(d.defect_type_candidate.value, 'Data integrity');
  assert.match(d.expected, /at most one write request/); assert.match(d.actual, /sent more than one write request.*2 write request/);
});

test('M42-5. CLI: --only selects negative cases; defect-candidates.json written; discovery writes the applicability matrix', { skip: SKIP }, async () => {
  assert.ok(CANDS);
  const file = join(OUT, 'cands.json'); writeFileSync(file, JSON.stringify(CANDS));
  const out = join(OUT, 'cli');
  const spawnCli = (args: string[]) => new Promise<any>((ok) => { const c = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, M42_PASS: PASS } }); let stdout = '', stderr = ''; c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; }); c.on('close', (status) => ok({ status, stdout, stderr })); });
  const r = await spawnCli(['dcore-qa', '--scenarios', file, '--only', 'server-error,below-min', '--no-pdf', '--out', out, '--json']);
  const res = JSON.parse(r.stdout);
  assert.equal(res.evidence.totals.scenarios, CANDS.scenarios.filter((s: any) => ['server-error', 'below-min'].includes(s.negative?.case)).length);
  assert.ok(res.evidence.defect_candidates.length >= 1 && res.evidence.defect_candidates.every((d: any) => d.severity === 'UNASSESSED'));
  assert.ok(existsSync(res.evidence.defect_candidates_file));
  assert.equal(JSON.parse(readFileSync(res.evidence.defect_candidates_file, 'utf8')).schema, 'dcore.defect-candidates/1');
  const out2 = join(OUT, 'cli-map');
  const r2 = await spawnCli(['dcore-explore', '--app', `${A}/home`, '--setup', JSON.stringify(setupBrowse()), '--max-pages', '3', '--out', out2, '--json']);
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(readFileSync(join(out2, 'negative-matrix.md'), 'utf8'), /\| Expired session \|/);
});
