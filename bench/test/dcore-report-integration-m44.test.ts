// M44 — dcore-report as the shared reporting layer. Every execution-capable workflow (dcore-qa, dcore-browse, dcore-api,
// dcore-run, dcore-verify) and every reasoning workflow (dcore-chain, dcore-debug, natural-language routing) produces
// the same three PDFs through ONE path (`--report <dir-or-prefix>` -> exec/reporting.mjs -> dcore-report). Results are
// never upgraded: a run that stops half way is a partial report, a refused run is BLOCKED, a plan is NOT_TESTED.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { toReportSource, reportTarget } from '../../skills/dcore/scripts/exec/reporting.mjs';
import { readPdfFacts } from '../../skills/dcore/scripts/exec/docs.mjs';
import { findBrowser } from '../../skills/dcore/scripts/exec/browse.mjs';
import { TEST_DIR } from './helpers.ts';

const SKIP = findBrowser() ? false : 'no Chromium-family browser';
const CLI = join(TEST_DIR, '..', '..', 'skills', 'dcore', 'scripts', 'dcore.mjs');
const DOCS = ['test_report', 'defect_report', 'test_case_register'];
let A = ''; let srv: Server; let OUT = '';
const page = (t: string, b: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${t}</title></head><body>${b}</body></html>`;

before(async () => {
  OUT = mkdtempSync(join(tmpdir(), 'dcore-m44-'));
  srv = createServer((req: any, res: any) => {
    const u = req.url.split('?')[0];
    if (u === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"status":"ok"}'); }
    if (u === '/api/items') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"items":[1,2,3]}'); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(page('Shop', '<h1>Welcome to the shop</h1><button id="buy">Buy</button>'));
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => { A = `http://127.0.0.1:${(srv.address() as any).port}`; ok(); }));
});
after(() => { srv?.close(); if (OUT) rmSync(OUT, { recursive: true, force: true }); });

const cli = (args: string[]) => new Promise<any>((ok) => { const c = spawn(process.execPath, [CLI, ...args], { env: { ...process.env } }); let stdout = '', stderr = ''; c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; }); c.on('close', (status) => ok({ status, stdout, stderr, json: (() => { try { return JSON.parse(stdout); } catch { return null; } })() })); });
const model = (rep: any) => JSON.parse(readFileSync(join(rep.dir, readdirSync(rep.dir).find((f) => f.startsWith(rep.prefix ?? '') && f.endsWith('.report-model.json'))!), 'utf8'));
const html = (rep: any, doc: string) => readFileSync(join(rep.dir, readdirSync(rep.dir).find((f) => f.startsWith(rep.prefix ?? '') && f.endsWith({ test_report: '.Detailed-Test-Report.html', defect_report: '.Detailed-Defect-Report.html', test_case_register: '.Test-Case-Register.html' }[doc]!))!), 'utf8');
// all three PDFs exist, carry the same run ID (metadata) and the documents agree on every ID
function threePdfs(rep: any) {
  assert.ok(rep && !rep.error, JSON.stringify(rep));
  assert.equal(rep.consistency.ok, true, rep.consistency.problems.join('; '));
  for (const k of DOCS) {
    const p = rep.pdfs[k]; assert.ok(existsSync(p), `${k}: ${p}`);
    const f = readPdfFacts(readFileSync(p));
    assert.ok(f.pages >= 2); assert.ok(f.subject.includes(rep.run_id), `${k} metadata names run ${rep.run_id}`);
    assert.equal(rep.secrets[k], true);
  }
}

test('M44-1. one normaliser: evidence, partial runs, BLOCKED, reasoning output and dcore-qa runs map to honest statuses', () => {
  assert.deepEqual(reportTarget(join(OUT, 'x') + '/'), { dir: join(OUT, 'x'), prefix: null });
  assert.deepEqual(reportTarget(join(OUT, 'reports', 'nightly')), { dir: join(OUT, 'reports'), prefix: 'nightly' });
  // api evidence: one case, each check a step
  const api = toReportSource({ schema: 'dcore.evidence/1', module: 'dcore-api', action: 'GET http://x.test/a', result: 'PASS', checks: [{ id: 'status', title: 'status == 200', result: 'PASS', actual: 200 }], evidence: { status: 200 }, limitations: [] });
  assert.equal(api.kind, 'evidence'); assert.equal(api.sr.scenarios[0].scenario_id, 'API-001'); assert.equal(api.sr.scenarios[0].status, 'PASS');
  // browse evidence that stopped half way: FAIL with the remaining steps SKIPPED (partial)
  const br = toReportSource({ schema: 'dcore.evidence/1', module: 'dcore-browse', action: 'browse 4 step(s)', result: 'FAIL', checks: [], limitations: [], evidence: { steps: [{ n: 1, op: 'goto', phase: 'setup', result: 'PASS', detail: 'ok' }, { n: 2, op: 'click', phase: 'setup', result: 'FAIL', detail: 'NOT_FOUND #x' }, { n: 3, op: 'assertText', phase: 'setup', result: 'SKIPPED', detail: 'not run' }], page_errors: [] } });
  assert.deepEqual(br.sr.scenarios[0].steps.map((s: any) => s.status), ['PASS', 'FAIL', 'SKIPPED']);
  assert.equal(br.sr.scenarios[0].status, 'FAIL'); assert.match(br.sr.scenarios[0].actual, /1 later step\(s\) not run \(partial execution\)/);
  // refused execution: BLOCKED, never FAIL or PASS
  const bl = toReportSource({ schema: 'dcore.evidence/1', module: 'dcore-run', action: 'run rm -rf build', result: 'BLOCKED', checks: [{ id: 'gate', title: 'destructive-command approval required', result: 'BLOCKED' }], evidence: {}, limitations: ['needs --approve destructive-command'] });
  assert.equal(bl.sr.scenarios[0].status, 'BLOCKED'); assert.match(bl.sr.scenarios[0].actual, /BLOCKED|blocked/);
  // reasoning output: every planned case NOT_TESTED with the reason
  const dbg = toReportSource({ module_id: 'dcore-debug', objective: 'Checkout times out', hypotheses: ['H-01: slow dependency'], next_steps: ['reproduce deterministically'] });
  assert.equal(dbg.kind, 'reasoning'); assert.deepEqual(dbg.sr.scenarios.map((s: any) => [s.scenario_id, s.status]), [['DEBUG-001', 'NOT_TESTED'], ['DEBUG-002', 'NOT_TESTED']]);
  const ch = toReportSource({ module_id: 'dcore-chain', objective: 'x', qa: { scenarios: ['S-01: verify — a', 'S-02: verify — b'] } });
  assert.equal(ch.sr.scenarios.length, 2); assert.ok(ch.sr.scenarios.every((s: any) => s.status === 'NOT_TESTED' && /nothing was executed/.test(s.actual)));
  const rt = toReportSource({ module_id: 'dcore-route', task: 't', workflow: [{ step: 1, capability: 'dcore-browse', purpose: 'open the page' }] });
  assert.match(rt.sr.scenarios[0].title, /^Step 1: dcore-browse/);
});

test('M44-2. dcore-api --report <prefix>: PASS run, three PDFs, explicit "No defects identified" and no empty defect table', { skip: SKIP }, async () => {
  const r = await cli(['dcore-api', '--url', `${A}/api/items`, '--expect-status', '200', '--report', join(OUT, 'api', 'items-check'), '--json']);
  assert.equal(r.json.result, 'PASS', r.stdout.slice(0, 400));
  const rep = r.json.report; threePdfs(rep);
  assert.equal(rep.prefix, 'items-check'); assert.ok(rep.pdfs.test_report.endsWith('items-check.Detailed-Test-Report.pdf'));
  const dr = html(rep, 'defect_report');
  assert.ok(dr.includes('No defects identified during this test run.'));
  assert.ok(!/<table><thead><tr><th>Defect<\/th>/.test(dr), 'no empty defect table');
  assert.ok(html(rep, 'test_report').includes('No defects identified during this test run.'));
  assert.equal(model(rep).totals.PASS, 1); assert.match(model(rep).final_status, /NO BLOCKING DEFECTS/);
});

test('M44-3. dcore-browse failing half way: partial report with the correct status; defect linked across all three documents', { skip: SKIP }, async () => {
  const steps = JSON.stringify([{ goto: `${A}/` }, { assertText: 'Welcome to the shop' }, { click: { selector: '#does-not-exist' }, timeoutMs: 1500 }, { assertText: 'Thank you' }]);
  const r = await cli(['dcore-browse', '--steps', steps, '--out', join(OUT, 'br-ev'), '--report', join(OUT, 'browse') + '/', '--json']);
  assert.equal(r.json.result, 'FAIL'); assert.equal(r.status, 1, 'exit code unchanged by reporting');
  const rep = r.json.report; threePdfs(rep);
  const m = model(rep);
  assert.equal(m.totals.FAIL, 1);
  assert.match(m.final_status, /PARTIAL RUN: execution stopped early in 1 case\(s\) \(BROWSE-001\); 1 later step\(s\) did not run/);
  assert.deepEqual(m.cases[0].steps.map((s: any) => s.status), ['PASS', 'PASS', 'FAIL', 'SKIPPED']);
  const d = m.defects.find((x: any) => x.linked_cases.includes('BROWSE-001'));
  assert.ok(d, 'the failed case produced a defect');
  assert.ok(html(rep, 'defect_report').includes(d.id) && html(rep, 'test_report').includes(d.id) && html(rep, 'test_case_register').includes(d.id));
  assert.ok(m.cases[0].defect_ids.includes(d.id));
  const ev = m.cases[0].evidence_refs; assert.ok(ev.length >= 1 && ev.every((id: string) => html(rep, 'test_report').includes(id)));
  assert.ok(readPdfFacts(readFileSync(rep.pdfs.defect_report)).outline.some((t: string) => t.startsWith(`${d.id} — `)));
});

test('M44-4. dcore-run refused without approval: report shows BLOCKED (not failed, not passed); exit code stays 3', { skip: SKIP }, async () => {
  const r = await cli(['dcore-run', 'rm -rf build', '--report', join(OUT, 'blocked', 'run'), '--json']);
  assert.equal(r.json.result, 'BLOCKED'); assert.equal(r.status, 3);
  const rep = r.json.report; threePdfs(rep);
  const m = model(rep);
  assert.match(m.final_status, /^BLOCKED — 1 of 1 case\(s\) blocked; nothing was executed to a verdict/);
  assert.equal(m.totals.BLOCKED, 1); assert.equal(m.totals.FAIL, 0); assert.equal(m.totals.PASS, 0); assert.equal(m.pass_percentage.value, null);
  assert.ok(html(rep, 'defect_report').includes('No defects identified during this test run.') && html(rep, 'defect_report').includes('Nothing was executed to a verdict'));
});

test('M44-5. dcore-verify, dcore-chain, dcore-debug and natural-language routing all report through the same layer', { skip: SKIP }, async () => {
  const v = await cli(['dcore-verify', '--url', `${A}/`, '--health', `${A}/health`, '--report', join(OUT, 'verify') + '/', '--json']);
  threePdfs(v.json.report); assert.equal(model(v.json.report).cases[0].id, 'VERIFY-001');
  for (const [args, code] of [[['dcore-chain', 'Add CSV export to the orders page'], 'CHAIN'], [['dcore-debug', 'Checkout times out after 30s'], 'DEBUG'], [['test the login page https://x.test end to end'], 'ROUTE']] as [string[], string][]) {
    const r = await cli([...args, '--report', join(OUT, code.toLowerCase()) + '/', '--json']);
    const rep = r.json.report; threePdfs(rep);
    const m = model(rep);
    assert.ok(m.cases.length >= 1 && m.cases.every((c: any) => c.status === 'NOT_TESTED' && c.id.startsWith(`${code}-`)), `${code}: ${JSON.stringify(m.cases.map((c: any) => [c.id, c.status]))}`);
    assert.match(m.final_status, /^NOT TESTED — nothing was executed to a verdict/);
  }
});

test('M44-6. dcore-qa --scenarios --report: the shared layer reports the SAME run, scenario, defect and evidence IDs as dcore-qa', { skip: SKIP }, async () => {
  const doc = { name: 'Shop smoke', target: A, environment: 'fixture', scenarios: [
    { id: 'SHOP-001', title: 'Home page greets the user', type: 'Smoke', priority: 'P1', steps: [{ action: 'goto', target: `${A}/`, expect: { text: 'Welcome to the shop' } }] },
    { id: 'SHOP-002', title: 'Order confirmation is shown', type: 'Functional', priority: 'P2', steps: [{ action: 'goto', target: `${A}/` }, { action: 'assert', expect: { text: 'Order confirmed' }, timeoutMs: 1500 }] },
  ] };
  const f = join(OUT, 'shop.json'); writeFileSync(f, JSON.stringify(doc));
  const r = await cli(['dcore-qa', '--scenarios', f, '--out', join(OUT, 'qa-run'), '--report', join(OUT, 'qa-shared', 'shop'), '--json']);
  const rep = r.json.report; threePdfs(rep);
  assert.equal(rep.source, 'scenario-run'); assert.equal(rep.run_id, r.json.evidence.run_id);
  const shared = model(rep);
  const own = JSON.parse(readFileSync(r.json.evidence.files.report_model, 'utf8'));
  assert.equal(shared.run_id, own.run_id);
  assert.deepEqual(shared.cases.map((c: any) => [c.id, c.status, c.defect_ids]), own.cases.map((c: any) => [c.id, c.status, c.defect_ids]));
  assert.deepEqual(shared.defects.map((d: any) => [d.id, d.title]), own.defects.map((d: any) => [d.id, d.title]));
  assert.deepEqual(shared.evidence.map((e: any) => [e.id, e.file]), own.evidence.map((e: any) => [e.id, e.file]));
  assert.deepEqual(shared.cases.map((c: any) => c.status), ['PASS', 'FAIL']);
});

test('M44-7. --report <file.md> keeps its Markdown behaviour (no PDFs); a reporting failure never changes the run result', async () => {
  const file = join(OUT, 'md', 'evidence.md');
  const r = await cli(['dcore-run', 'rm -rf build', '--report', file, '--json']);
  assert.ok(existsSync(file)); assert.equal(r.json.report, undefined, 'Markdown mode does not produce PDFs');
  assert.equal(r.json.result, 'BLOCKED');
});
