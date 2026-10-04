// M43 — dcore-report: three separate, evidence-backed PDF documents (Detailed Test Report, Detailed Defect Report,
// Test Case Register) from the unified evidence model. Fixture-based: a hand-built scenario run covering every result
// state, a backend 5xx, an uncaught exception, an accessibility finding, a violated negative case and a credential
// referenced through an environment variable (which must never reach any document).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { buildReportModel, renderDocuments, readPdfFacts, secretsAbsent, withPdfInfo, ROOT_CAUSE_UNKNOWN, UNKNOWN } from '../../skills/dcore/scripts/exec/docs.mjs';
import { scenarioTestRun } from '../../skills/dcore/scripts/exec/scenario.mjs';
import { writeReports, buildTestRun } from '../../skills/dcore/scripts/exec/report.mjs';
import { findBrowser } from '../../skills/dcore/scripts/exec/browse.mjs';
import { TEST_DIR } from './helpers.ts';

const SKIP = findBrowser() ? false : 'no Chromium-family browser';
const CLI = join(TEST_DIR, '..', '..', 'skills', 'dcore', 'scripts', 'dcore.mjs');
const SECRET = 'M43-SENTINEL-Pw!7c2e';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let DIR = '';

function fixtureRun(dir: string) {
  const shot = (n: string) => { const p = join(dir, `${n}.png`); writeFileSync(p, PNG); return p; };
  const step = (o: any) => ({ run_id: 'run-20261003T120000-abc123', timestamp: '2026-10-03T12:00:05.000Z', console_errors: [], network_failures: [], checks: [], url: 'https://app.example.test/orders', ...o });
  return {
    schema: 'dcore.scenario-run/1', host: { os: 'Linux 6.1 (x64)' }, run_id: 'run-20261003T120000-abc123', name: 'Orders regression', target: 'https://app.example.test/orders', environment: 'staging',
    started_at: '2026-10-03T12:00:00.000Z', ended_at: '2026-10-03T12:05:00.000Z', approvals: [],
    setup: { status: 'PASS', steps: [step({ scenario_id: 'setup', step_id: 'S1', action: 'fill', target: 'selector="#pass"', input: '${DCORE_M43_PASS}', status: 'PASS', actual: 'filled [REDACTED]' })] },
    scenarios: [
      { scenario_id: 'SC-001', title: 'Create order with valid data', feature: 'Orders', category: 'happy-path', type: 'Functional', priority: 'P1', preconditions: 'Signed in', data: { qty: 2 }, expected: 'Order is created', status: 'PASS', actual: '2 of 2 step(s) verified', evidence: [shot('SC-001-end')],
        steps: [step({ scenario_id: 'SC-001', step_id: 'S1', action: 'goto', target: 'https://app.example.test/orders', expected: 'text "Orders" is shown', actual: 'Orders shown', status: 'PASS', verified: true }), step({ scenario_id: 'SC-001', step_id: 'S2', action: 'click', target: 'selector="#create"', expected: 'notification "Order created" appears', actual: 'Order created', status: 'PASS', verified: true })] },
      { scenario_id: 'SC-002', title: 'Order list shows the new order', feature: 'Orders', category: 'persistence', type: 'Regression', priority: 'P2', preconditions: 'Signed in', data: {}, expected: 'The new order is listed', status: 'FAIL', actual: 'Step S2 (assert) failed: text "ORD-1" not found', evidence: [shot('SC-002-end')],
        steps: [step({ scenario_id: 'SC-002', step_id: 'S1', action: 'goto', target: 'https://app.example.test/orders', expected: 'text "Orders" is shown', actual: 'shown', status: 'PASS', verified: true }),
          step({ scenario_id: 'SC-002', step_id: 'S2', action: 'assert', target: '—', expected: 'text "ORD-1" is shown', actual: `text "ORD-1" not found (page echoed ${SECRET})`, status: 'FAIL', screenshot: shot('SC-002-S2'), checks: [{ kind: 'expectation', label: 'text "ORD-1" is shown', status: 'FAIL', detail: 'not found' }] })] },
      { scenario_id: 'SC-003', title: 'Reports page loads without errors', feature: 'Reports', category: 'error-handling', type: 'Error handling', priority: 'P2', preconditions: 'Signed in', data: {}, expected: 'No runtime errors', status: 'FAIL', actual: 'Step S1 (goto) failed: runtime errors', evidence: [],
        steps: [step({ scenario_id: 'SC-003', step_id: 'S1', action: 'goto', target: 'https://app.example.test/reports', url: 'https://app.example.test/reports', expected: 'no runtime errors or failed requests', actual: 'runtime errors / failed requests observed: TypeError: x is null', status: 'FAIL', console_errors: ['TypeError: x is null (https://app.example.test/app.js:42)'], network_failures: [{ kind: 'http', status: 500, url: 'https://app.example.test/api/reports' }], checks: [{ kind: 'expectation', label: 'no runtime errors or failed requests', status: 'FAIL', detail: 'TypeError' }] })] },
      { scenario_id: 'SC-004', title: 'Delete order after confirmation', feature: 'Orders', category: 'state-change', type: 'Functional', priority: 'P2', preconditions: 'Signed in', data: {}, expected: 'Order is deleted', status: 'BLOCKED', approval: 'APPROVAL_REQUIRED', actual: 'APPROVAL_REQUIRED: not executed — needs --approve ui-write', evidence: [],
        steps: [step({ scenario_id: 'SC-004', step_id: 'S1', action: 'click', target: 'selector="#delete"', expected: 'click performed', actual: 'not executed: approval required', status: 'BLOCKED', timestamp: null })] },
      { scenario_id: 'SC-005', title: 'Lower-privileged user cannot open admin routes', feature: 'Authorization', category: 'permission', type: 'Authorization', priority: 'P1', preconditions: '—', data: {}, expected: 'Refused', status: 'NOT_TESTED', actual: 'Not executed (NOT_TESTED): needs a second account', evidence: [], steps: [] },
      { scenario_id: 'SC-006', title: 'Export as CSV', feature: 'Orders', type: 'Functional', priority: 'P3', preconditions: '—', data: {}, expected: 'CSV downloaded', status: 'SKIPPED', actual: 'Not executed (SKIPPED): out of this run', evidence: [], steps: [] },
      { scenario_id: 'SC-007', title: 'Quantity: 11 (just above the maximum 10) is rejected', feature: 'Orders', category: 'boundary', type: 'Boundary', priority: 'P3', preconditions: 'Signed in', data: {}, expected: 'Rejected', status: 'FAIL', actual: 'Step S3 (evaluate) failed: value false', evidence: [shot('SC-007-end')],
        negative: { case: 'above-max', label: 'Just above maximum', expected: 'Quantity: 11 (just above the maximum 10) is rejected.', violation: 'Quantity: 11 (just above the maximum 10) was accepted.' }, negative_outcome: 'VIOLATED', defect_candidate: 'DC-001',
        steps: [step({ scenario_id: 'SC-007', step_id: 'S3', action: 'evaluate', target: '—', expected: 'value == true', actual: 'value false (expected true)', status: 'FAIL', oracle: true, checks: [{ kind: 'expectation', label: 'value == true', status: 'FAIL', detail: 'value false' }] })] },
    ],
    defect_candidates: [{ id: 'DC-001', scenario: { id: 'SC-007', title: 'Quantity: 11 (just above the maximum 10) is rejected', negative_case: 'above-max' }, expected: 'Quantity: 11 (just above the maximum 10) is rejected.', actual: 'Quantity: 11 (just above the maximum 10) was accepted. Observed: value false', defect_type_candidate: { value: 'Validation — boundary', basis: 'violated' }, severity_candidate: { value: 'UNASSESSED', basis: 'the evidence shows the behaviour, not its business impact: assign after triage' }, priority_candidate: { value: 'UNASSESSED', basis: 'the evidence shows the behaviour, not its business impact: assign after triage' } }],
    browser: { browser: 'chrome.exe', version: 'Chrome/153.0.0.0', viewport: '1366x900 desktop (default)', responsive: [{ width: 390, layout_width: 980, has_meta_viewport: false }],
      page_errors: ['TypeError: x is null (https://app.example.test/app.js:42)'], console_errors: [], network_failures: [{ kind: 'http', status: 500, url: 'https://app.example.test/api/reports' }], http_4xx: [], a11y: [{ form_labels: { ok: false, count: 2, samples: ['input#qty', 'input#note'] } }], perf: [], screenshots: [], out_dir: dir },
    totals: {}, limitations: ['state-changing controls were guarded (no ui-write approval)'],
  };
}

before(() => { DIR = mkdtempSync(join(tmpdir(), 'dcore-m43-')); process.env.DCORE_M43_PASS = SECRET; });
after(() => { if (DIR) rmSync(DIR, { recursive: true, force: true }); delete process.env.DCORE_M43_PASS; });

async function model(meta: any = {}) {
  const dir = join(DIR, 'm'); mkdirSync(dir, { recursive: true });
  const sr: any = fixtureRun(dir); const tr = await scenarioTestRun(sr, { outDir: dir });
  return { sr, tr, m: buildReportModel(tr, { source: sr, meta }), dir };
}

test('M43-1. report model: metadata, totals, UNKNOWN where evidence is silent, test-case fields, evidence linkage', async () => {
  const { m } = await model();
  assert.equal(m.schema, 'dcore.report-model/1');
  assert.equal(m.run_id, 'run-20261003T120000-abc123'); assert.equal(m.application, 'https://app.example.test'); assert.equal(m.environment, 'staging');
  assert.equal(m.build, UNKNOWN, 'no build was supplied: never invented');
  assert.equal(m.browser_version, 'Chrome/153.0.0.0'); assert.equal(m.os, 'Linux 6.1 (x64)'); assert.equal(m.viewport, '1366x900 desktop (default)');
  assert.match(m.auth_context, /environment variables DCORE_M43_PASS \(values never recorded\)/);
  assert.deepEqual([m.totals.cases, m.totals.PASS, m.totals.FAIL, m.totals.BLOCKED, m.totals.SKIPPED, m.totals.NOT_TESTED], [7, 1, 3, 1, 1, 1]);
  assert.equal(m.pass_percentage.value, 25); assert.match(m.pass_percentage.basis, /1 passed of 4 executed/);
  // test case register fields
  for (const c of m.cases) for (const k of ['id', 'title', 'feature', 'module', 'type', 'priority', 'preconditions', 'test_data', 'steps', 'expected', 'actual', 'status', 'defect_ids', 'evidence_refs', 'executed_at']) assert.ok(k in c, `${c.id} lacks ${k}`);
  assert.equal(m.cases.find((c: any) => c.id === 'SC-006').status, 'SKIPPED');
  assert.equal(m.cases.find((c: any) => c.id === 'SC-005').executed_at, null);
  assert.deepEqual(m.cases.find((c: any) => c.id === 'SC-001').test_data, { qty: 2 });
  // evidence linkage: every reference resolves; every defect id in a case exists; screenshots carry captions
  const ev = new Set(m.evidence.map((e: any) => e.id));
  for (const c of m.cases) for (const r of [...c.evidence_refs, ...c.steps.flatMap((s: any) => s.evidence)]) assert.ok(ev.has(r), `${c.id} -> ${r}`);
  const defs = new Set(m.defects.map((d: any) => d.id));
  for (const c of m.cases) for (const d of c.defect_ids) assert.ok(defs.has(d), `${c.id} -> ${d}`);
  assert.ok(m.evidence.every((e: any) => /^EV-\d{3}$/.test(e.id) && e.caption && e.available));
  assert.ok(m.cases.find((c: any) => c.id === 'SC-002').steps.find((s: any) => s.id === 'S2').evidence.length === 1);
  // meta supplies facts the evidence cannot
  const withMeta = (await model({ build: '2026.10.3-rc1', application: 'Orders portal', objectives: ['Regression of order creation'] })).m;
  assert.equal(withMeta.build, '2026.10.3-rc1'); assert.equal(withMeta.application, 'Orders portal'); assert.deepEqual(withMeta.scope.objectives, ['Regression of order creation']);
  // a plan run with nothing executed: no pass percentage, nothing claimed
  const empty = buildReportModel(buildTestRun({ name: 'Empty', target: 'https://x.test', cases: [{ id: 'TC-1', title: 'A', steps: [{ goto: 'https://x.test' }] }] }, null));
  assert.equal(empty.pass_percentage.value, null); assert.match(empty.pass_percentage.basis, /NOT APPLICABLE/);
  assert.equal(empty.cases[0].status, 'NOT_TESTED'); assert.equal(empty.cases[0].steps[0].status, UNKNOWN);
  assert.equal(empty.browser_version, UNKNOWN); assert.equal(empty.os, UNKNOWN);
});

test('M43-2. defects: DCORE-DEF ids, every required field, evidence-based layer, no fabricated root cause or severity, testable acceptance criteria', async () => {
  const { m } = await model();
  assert.ok(m.defects.length >= 4);
  m.defects.forEach((d: any, i: number) => assert.equal(d.id, `DCORE-DEF-${String(i + 1).padStart(3, '0')}`));
  for (const d of m.defects) {
    for (const k of ['id', 'title', 'application', 'environment', 'test_run', 'date', 'defect_type', 'layer', 'severity', 'priority', 'summary', 'business_impact', 'technical', 'observed', 'expected', 'preconditions', 'steps_to_reproduce', 'evidence', 'recommendation', 'acceptance_criteria', 'root_cause']) assert.ok(d[k] !== undefined && d[k] !== '', `${d.id} lacks ${k}`);
    for (const k of ['screenshots', 'url', 'console', 'network', 'api', 'step', 'timestamp']) assert.ok(k in d.evidence, `${d.id} evidence lacks ${k}`);
    for (const k of ['fix', 'area', 'investigation', 'regression']) assert.ok(d.recommendation[k], `${d.id} recommendation lacks ${k}`);
    assert.equal(d.root_cause, ROOT_CAUSE_UNKNOWN);
    assert.match(d.business_impact, /NOT ESTABLISHED BY THE EVIDENCE/);
    assert.ok(d.acceptance_criteria.length >= 2 && d.acceptance_criteria.every((a: any, i: number) => a.id === `AC-${String(i + 1).padStart(2, '0')}` && a.text.length > 15));
    assert.equal(d.test_run, 'run-20261003T120000-abc123');
  }
  const by = (re: RegExp) => m.defects.find((d: any) => re.test(d.title));
  assert.match(by(/Server error 500/).layer, /^Backend/);
  assert.match(by(/Uncaught JavaScript exception/).layer, /^Frontend/);
  assert.match(by(/Uncaught JavaScript exception/).recommendation.area, /app\.js:42/);
  assert.ok(by(/Uncaught JavaScript exception/).acceptance_criteria.some((a: any) => /No uncaught JavaScript exception "TypeError: x is null"/.test(a.text)));
  assert.ok(by(/Server error 500/).acceptance_criteria.some((a: any) => /returns a non-5xx response/.test(a.text)));
  // the violated negative case keeps UNASSESSED severity / priority and its expectation becomes AC-01
  const neg = by(/Quantity: 11/);
  assert.equal(neg.severity, 'unassessed'); assert.equal(neg.priority, 'UNASSESSED'); assert.match(neg.severity_basis, /business impact/);
  assert.equal(neg.acceptance_criteria[0].text, 'Quantity: 11 (just above the maximum 10) is rejected.');
  const fn = by(/Order list shows the new order/);
  assert.match(fn.layer, /^UNKNOWN/, 'an assertion failure does not establish the layer');
  assert.equal(fn.evidence.step, 'SC-002 / S2 (assert)'); assert.equal(fn.evidence.timestamp, '2026-10-03T12:00:05.000Z');
  assert.ok(fn.evidence.screenshots.length >= 1);
});

test('M43-3. three separate documents: required sections, escaping, deterministic HTML, no secret', async () => {
  const { tr, sr, m, dir } = await model();
  const h = renderDocuments(m, dir);
  assert.deepEqual(Object.keys(h), ['test_report', 'defect_report', 'test_case_register']);
  for (const s of ['Browser coverage', 'NOT a cross-browser compatibility claim', 'Executive summary', 'Test scope', 'Objectives', 'Included scope', 'Excluded scope', 'Assumptions', 'Limitations', 'Environment', 'Scenario execution summary', 'Detailed execution', 'Defect summary', 'Console errors', 'Network failures', 'Accessibility observations', 'Responsive observations', 'Final evidence-based status', 'Recommendations', 'Evidence index', 'Test run ID', 'Build / version', 'Browser', 'Operating system', 'Viewport', 'Authentication context']) assert.ok(h.test_report.includes(s), `test report lacks ${s}`);
  for (const s of ['DCORE-DEF-001', 'Identification', 'Classification', 'Description', 'Business impact', 'Technical explanation', 'Reproduction', 'Steps to reproduce', 'Evidence', 'Recommendation', 'Recommended fix', 'Likely affected area', 'Regression considerations', 'Acceptance criteria', 'AC-01', ROOT_CAUSE_UNKNOWN]) assert.ok(h.defect_report.includes(s), `defect report lacks ${s}`);
  for (const s of ['Feature', 'Module', 'Test data', 'Preconditions', 'Expected result', 'Actual result', 'Defects', 'Evidence', 'Executed', 'SC-007']) assert.ok(h.test_case_register.includes(s), `register lacks ${s}`);
  assert.match(h.test_case_register, /size:A4 landscape/); assert.match(h.test_report, /class="wide break"/);
  assert.ok(h.test_report.includes('<span class="unknown">UNKNOWN</span>'), 'unknown build is shown as UNKNOWN');
  assert.ok(!h.test_report.includes('Generated</td><td>2'), 'no wall-clock time');
  // deterministic: same evidence, same bytes
  const again = renderDocuments(buildReportModel(await scenarioTestRun(fixtureRun(dir) as any, { outDir: dir }), { source: fixtureRun(dir) }), dir);
  assert.deepEqual(again, h);
  // escaping: page-derived text cannot inject markup
  const bad = buildReportModel({ ...tr, cases: [{ ...tr.cases[0], title: '<script>alert(1)</script>' }] }, { source: null });
  const bh = renderDocuments(bad, dir);
  assert.ok(!bh.test_report.includes('<script>alert(1)') && bh.test_report.includes('&lt;script&gt;'));
  // the run echoed the password into a step result: the writer redacts it everywhere (checked in M43-4)
  assert.ok(JSON.stringify(sr).includes(SECRET));
});

test('M43-4. PDFs: created, separate, sections in the PDF outline, metadata, secrets absent, deterministic content', { skip: SKIP }, async () => {
  const { tr, sr, dir } = await model({});
  const out = join(dir, 'docs');
  const files: any = await writeReports(tr, out, { source: sr, meta: { build: '2026.10.3-rc1' } });
  const outlines: any = {};
  for (const [k, title] of [['test_report', 'Detailed Test Report'], ['defect_report', 'Detailed Defect Report'], ['test_case_register', 'Test Case Register']]) {
    const p = files[`${k}_pdf`];
    assert.equal(p.ok, true, `${k}: ${p.error}`);
    const buf = readFileSync(p.pdf);
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
    const f = readPdfFacts(buf);
    assert.ok(f.pages >= 2, `${k} pages ${f.pages}`);
    assert.equal(f.title, `${title} — Orders regression`); assert.equal(f.author, 'DCore'); assert.equal(f.creator, 'DCore dcore-report');
    assert.match(f.subject, /run-20261003T120000-abc123 \(staging\)/); assert.match(f.keywords, /DCore/); assert.equal(f.created, 'D:20261003120500Z');
    outlines[k] = f.outline;
    assert.deepEqual(files[`${k}_verified`], { secrets_absent: true, checked: 1, files: 2, leaks: [] });
    assert.ok(!buf.toString('latin1').includes(SECRET));
  }
  for (const s of ['Contents', '1. Executive summary', '2. Test scope', '3. Environment', '4. Browser coverage', '5. Scenario execution summary', '6. Detailed execution', '7. Defect summary', '8. Console errors', '9. Network failures', '10. Accessibility observations', '11. Responsive observations', '12. Final evidence-based status', '13. Recommendations', '14. Evidence index']) assert.ok(outlines.test_report.includes(s), `PDF outline lacks ${s}: ${outlines.test_report.join(' | ')}`);
  assert.ok(outlines.defect_report.includes('Defect summary') && outlines.defect_report.some((x: string) => /^DCORE-DEF-001 — /.test(x)) && outlines.defect_report.includes('7. Acceptance criteria'));
  assert.ok(outlines.test_case_register.includes('2. Register'));
  // every written text file is free of the credential, even though the run evidence contained it
  for (const k of ['json', 'md', 'report_model', 'test_report_html', 'defect_report_html', 'test_case_register_html']) assert.ok(!readFileSync(files[k], 'utf8').includes(SECRET), `${k} leaked the secret`);
  assert.ok(readFileSync(files.test_report_html, 'utf8').includes('[REDACTED]'));
  // deterministic: a second write gives identical HTML and identical outlines
  const files2: any = await writeReports(tr, out, { source: sr, meta: { build: '2026.10.3-rc1' }, pdf: true });
  assert.equal(readFileSync(files2.test_report_html, 'utf8'), readFileSync(files.test_report_html, 'utf8'));
  assert.deepEqual(readPdfFacts(readFileSync(files2.defect_report_pdf.pdf)).outline, outlines.defect_report);
});

test('M43-5. metadata writer and secret checker are standalone and fail safe', () => {
  const fake = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<</Size 2\n/Root 1 0 R>>\nstartxref\n47\n%%EOF\n', 'latin1');
  const r = withPdfInfo(fake, { title: 'Ünïcode — title', author: 'DCore', created: '2026-10-03T12:05:00.000Z' });
  assert.equal(r.ok, true);
  const f = readPdfFacts(r.buf); assert.equal(f.title, 'Ünïcode — title'); assert.equal(f.author, 'DCore'); assert.equal(f.created, 'D:20261003120500Z');
  assert.equal(withPdfInfo(Buffer.from('%PDF-1.7 no trailer'), { title: 'x' }).ok, false);
  const p = join(DIR, 'leak.html'); writeFileSync(p, `<p>${SECRET}</p>`);
  assert.deepEqual(secretsAbsent([p], [SECRET]), { secrets_absent: false, checked: 1, files: 1, leaks: ['leak.html'] });
  const hexed = join(DIR, 'leak.pdf'); writeFileSync(hexed, withPdfInfo(fake, { title: SECRET }).buf);
  assert.equal(secretsAbsent([hexed], [SECRET]).secrets_absent, false, 'a secret in UTF-16 PDF metadata is found');
});

test('M43-6. CLI: dcore-report --run renders and verifies; unsupported input is BLOCKED; text mode explains usage', { skip: SKIP }, async () => {
  const { sr, dir } = await model();
  const runFile = join(dir, 'run.scenario-run.json'); writeFileSync(runFile, JSON.stringify(sr));
  const cli = (args: string[]) => new Promise<any>((ok) => { const c = spawn(process.execPath, [CLI, ...args], { env: { ...process.env } }); let stdout = '', stderr = ''; c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; }); c.on('close', (status) => ok({ status, stdout, stderr })); });
  const out = join(dir, 'cli');
  const r = await cli(['dcore-report', '--run', runFile, '--meta', '{"build":"b-77"}', '--out', out, '--json']);
  const res = JSON.parse(r.stdout);
  assert.equal(res.result, 'PASS', JSON.stringify(res.checks));
  assert.equal(res.checks.length, 6);
  assert.ok(existsSync(res.evidence.files.test_case_register_pdf.pdf));
  assert.ok(readFileSync(res.evidence.files.report_model, 'utf8').includes('"build": "b-77"'));
  const bad = join(dir, 'bad.json'); writeFileSync(bad, '{"schema":"something/1"}');
  const b = await cli(['dcore-report', '--run', bad, '--json']);
  assert.equal(JSON.parse(b.stdout).result, 'BLOCKED');
  const t = await cli(['dcore-report', 'Document the run.', '--json']);
  assert.equal(JSON.parse(t.stdout).module_id, 'dcore-report');
});
