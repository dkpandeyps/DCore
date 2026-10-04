// M47 — regressions for the DCore defects found while certifying on real applications.
//  1. length-boundary values ignored the field pattern (demoqa: 10-digit mobile number with pattern \d* -> false violation)
//  2. an oracle that could not find its element ("MISSING") was counted as a violated negative expectation
//  3. load-time write requests with per-load random path segments (SockJS /chat/304/soosyji1/...) defeated the baseline
//  4. the browser's password-breach warning (browser UI) swallowed input after a login with a well-known test password
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { planNegative } from '../../skills/dcore/scripts/exec/negative.mjs';
import { sampleValue } from '../../skills/dcore/scripts/exec/candidates.mjs';
import { runScenarios, writeSig } from '../../skills/dcore/scripts/exec/scenario.mjs';
import { startBrowser, findBrowser } from '../../skills/dcore/scripts/exec/browse.mjs';

const SKIP = findBrowser() ? false : 'no Chromium-family browser';
let OUT = ''; let srv: Server; let A = '';
before(async () => { OUT = mkdtempSync(join(tmpdir(), 'dcore-m47-')); srv = createServer((q: any, r: any) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><h1>M47</h1><input id="x" pattern="\\d*" minlength="10" maxlength="10">'); }); await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => { A = `http://127.0.0.1:${(srv.address() as any).port}`; ok(); })); });
after(() => { srv?.close(); if (OUT) { try { rmSync(OUT, { recursive: true, force: true, maxRetries: 30, retryDelay: 500 }); } catch { /* a browser launched with a persistent profile can hold its folder for a while on Windows: temp-dir cleanup is not a test result */ } } });

test('M47-1. length boundaries use a value the field pattern accepts; an unsatisfiable pattern is NOT_TESTED, never a false violation', () => {
  const map: any = { routes: [{ route: '/f', url: 'http://x/f', kind: 'page', forms: [{ selector: '#f', fields: [
    { selector: '#n', type: 'text', label: 'Mobile', constraints: { pattern: String.raw`\d*`, minlength: 10, maxlength: 10 } },
    { selector: '#p', type: 'text', label: 'Code', constraints: { pattern: String.raw`[A-Z]{3}-\d{2}`, minlength: 6, maxlength: 6 } },
    { selector: '#t', type: 'text', label: 'Note', constraints: { minlength: 3, maxlength: 5 } }] }] }] };
  const { specs, matrix } = planNegative(map, { sampleValue, usable: (f: any) => f.selector, fieldName: (f: any) => f.label });
  const input = (field: string, c: string) => specs.find((s: any) => s.source.field === field && s.negative.case === c)?.steps[1].input;
  assert.equal(input('#n', 'min'), '1111111111'); assert.equal(input('#n', 'above-max'), '11111111111');
  assert.equal(input('#t', 'min'), 'xxx');
  assert.ok(matrix.filter((r: any) => r.target.selector === '#p' && ['min', 'max', 'below-min', 'above-max'].includes(r.case)).every((r: any) => r.decision === 'NOT_TESTED'));
});

test('M47-2. write signatures ignore per-load random path segments but keep real differences', () => {
  const a = writeSig({ method: 'POST', url: 'https://h.test/chat/304/soosyji1/xhr_streaming?…' });
  const b = writeSig({ method: 'POST', url: 'https://h.test/chat/918/xhllyz0k/xhr_streaming?…' });
  assert.equal(a, b);
  assert.notEqual(writeSig({ method: 'POST', url: 'https://h.test/api/orders' }), writeSig({ method: 'POST', url: 'https://h.test/api/refunds' }));
  assert.notEqual(writeSig({ method: 'POST', url: 'https://h.test/api/orders' }), writeSig({ method: 'PUT', url: 'https://h.test/api/orders' }));
});

test('M47-3. an oracle that cannot find its element is NOT a violation (negative outcome NOT_DETERMINED)', { skip: SKIP }, async () => {
  const doc = { scenarios: [{ id: 'N1', title: 'missing element', negative: { case: 'empty', expected: 'x', violation: 'y' }, steps: [{ action: 'goto', target: `${A}/` }, { action: 'evaluate', oracle: true, input: "(() => { const e = document.querySelector('#gone'); return e ? e.checkValidity() : 'MISSING'; })()", expect: { value: true } }] }] };
  const sr: any = await runScenarios(doc, { outDir: join(OUT, 'missing'), stepTimeoutMs: 4000 });
  assert.equal(sr.scenarios[0].status, 'FAIL');
  assert.equal(sr.scenarios[0].negative_outcome, 'NOT_DETERMINED');
  assert.equal(sr.defect_candidates.length, 0);
});

test('M47-4. a fresh test profile has the password manager off; an existing profile is never modified', { skip: SKIP }, async () => {
  const fresh = join(OUT, 'fresh-profile');
  const B: any = await startBrowser({ profile: fresh, outDir: join(OUT, 'p1') });
  assert.ok(B.ok); await B.close();
  const prefs = JSON.parse(readFileSync(join(fresh, 'Default', 'Preferences'), 'utf8'));
  assert.equal(prefs.credentials_enable_service, false); assert.equal(prefs.profile.password_manager_leak_detection, false);
  const existing = join(OUT, 'user-profile'); mkdirSync(join(existing, 'Default'), { recursive: true });
  writeFileSync(join(existing, 'Default', 'Preferences'), '{"custom":true}');
  const before = readFileSync(join(existing, 'Default', 'Preferences'), 'utf8');
  assert.equal(before, '{"custom":true}');
  // DCore itself must not rewrite it (the browser may add its own keys while running; the user's key must survive)
  const B2: any = await startBrowser({ profile: existing, outDir: join(OUT, 'p2') }); assert.ok(B2.ok); await B2.close();
  assert.equal(JSON.parse(readFileSync(join(existing, 'Default', 'Preferences'), 'utf8')).custom, true);
  assert.ok(existsSync(join(existing, 'Default', 'Preferences')));
});

test('M47-5. refresh oracle: only a request carrying the typed data counts; page-own transport writes do not; a real submission still fails', { skip: SKIP }, async () => {
  const html = `<!doctype html><h1>Chatty</h1><form id="f"><input id="q" name="q"></form><script>setInterval(() => fetch('/chat/xhr_send', { method: 'POST', body: '["heartbeat"]' }), 300);</script>`;
  const s2 = createServer((q: any, r: any) => { if (q.method === 'POST') { r.writeHead(204); return r.end(); } r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); });
  await new Promise<void>((ok) => s2.listen(0, '127.0.0.1', () => ok()));
  const U = `http://127.0.0.1:${(s2.address() as any).port}/`;
  try {
    const doc = { scenarios: [
      { id: 'R1', title: 'refresh with background transport', steps: [{ action: 'goto', target: U, expect: { text: 'Chatty' } }, { action: 'fill', target: { selector: '#q' }, input: 'dcore-typed-value' }, { action: 'reload', expect: { text: 'Chatty', noWrites: { containing: ['dcore-typed-value'] } } }] },
      { id: 'R2', title: 'the typed data really leaves the browser', steps: [{ action: 'goto', target: U, expect: { text: 'Chatty' } }, { action: 'evaluate', input: "(() => { fetch('/save', { method: 'POST', body: 'q=dcore-typed-value' }); return true; })()", expect: { value: true, noWrites: { containing: ['dcore-typed-value'] } } }] },
    ] };
    const sr: any = await runScenarios(doc, { outDir: join(OUT, 'chatty'), stepTimeoutMs: 4000 });
    assert.equal(sr.scenarios[0].status, 'PASS', sr.scenarios[0].actual);
    assert.match(sr.scenarios[0].steps[2].actual, /no request carried the typed data/);
    assert.equal(sr.scenarios[1].status, 'FAIL'); assert.match(sr.scenarios[1].actual, /carrying the typed data/);
    assert.ok(!JSON.stringify(sr.browser.write_requests).includes('dcore-typed-value'), 'request bodies are never written to evidence');
  } finally { s2.close(); }
});

test('M47-6. network failures are reported once per endpoint (random per-request path segments normalised), with the occurrence count', async () => {
  const { detectDefects } = await import('../../skills/dcore/scripts/exec/report.mjs');
  const fails = Array.from({ length: 50 }, (_, i) => ({ kind: 'http', status: 500, url: `https://h.test/chat/${100 + i}/a${i}bcdef${i}/xhr_streaming?…` }));
  const d = detectDefects({ cases: [] }, [], { evidence: { network_failures: [...fails, { kind: 'http', status: 500, url: 'https://h.test/api/orders' }] } });
  assert.deepEqual(d.map((x: any) => x.title), ['Server error 500 from https://h.test/chat/:x/:x/xhr_streaming (50 occurrences)', 'Server error 500 from https://h.test/api/orders']);
});

test('M47-7. steps that are checks (waitFor, breakpoints, download with expectations) count as verified when they pass', { skip: SKIP }, async () => {
  const doc = { scenarios: [{ id: 'W1', title: 'wait only', steps: [{ action: 'goto', target: `${A}/` }, { action: 'waitFor', input: { text: 'M47' } }] }, { id: 'W2', title: 'plain action only', steps: [{ action: 'goto', target: `${A}/` }] }] };
  const sr: any = await runScenarios(doc, { outDir: join(OUT, 'verified'), stepTimeoutMs: 4000 });
  assert.equal(sr.scenarios[0].status, 'PASS', sr.scenarios[0].actual);
  assert.equal(sr.scenarios[1].status, 'NOT_TESTED', 'an action with no check still proves nothing');
});
