// dcore-qa test runs: plan execution, honest per-case results, defect detection/classification, scenario generation,
// and the three report documents (Detailed Test Report, Detailed Defect Report, Test Case Register) as PDF.
// Real browser runs target a LOCAL fixture app on 127.0.0.1 only; secrets are obvious sentinels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { runQaPlan, discoverPlan, buildTestRun, detectDefects, validatePlan, describeStep, writeReports } from '../../skills/dcore/scripts/exec/report.mjs';
import { generatePlan, fieldCases } from '../../skills/dcore/scripts/exec/scenarios.mjs';
import { findBrowser, browse, printPdfs } from '../../skills/dcore/scripts/exec/browse.mjs';
import { writeFileSync } from 'node:fs';
import { TEST_DIR } from './helpers.ts';

const CLI = join(TEST_DIR, '..', '..', 'skills', 'dcore', 'scripts', 'dcore.mjs');
const SENTINEL_PASS = 'DCORE-QA-SENTINEL-pw-91c2';
const HAVE_BROWSER = !!findBrowser();
const tmp = (l: string) => mkdtempSync(join(tmpdir(), `dcore-qa-${l}-`));

// ---- fixture app ------------------------------------------------------------------------------------------------
function app(): Promise<{ url: string; close: () => void }> {
  const loginPage = (err: boolean) => `<!doctype html><html lang="en"><head><title>Login</title></head><body><h1>Sign in</h1>${err ? '<div role="alert">Invalid credentials</div>' : ''}
<form method="post" action="/session"><label for="u">Username</label><input id="u" name="u" required><label for="p">Password</label><input id="p" name="p" type="password" required><button type="submit">Sign in</button></form></body></html>`;
  const appPage = `<!doctype html><html lang="en"><head><title>Orders</title></head><body><h1>Orders</h1>
<table id="orders"><thead><tr><th>ID</th><th>Item</th><th>Qty</th></tr></thead><tbody><tr><td>1</td><td>Pen</td><td>2</td></tr><tr><td>2</td><td>Ink</td><td>1</td></tr><tr><td>3</td><td>Pad</td><td>5</td></tr></tbody></table>
<p id="total">Total: 3</p>
<form id="f" onsubmit="return false"><label for="email">Email</label><input id="email" name="email" type="email" required>
<label for="qty">Quantity</label><input id="qty" name="qty" type="number" min="1" max="10">
<label for="code">Code</label><input id="code" name="code" maxlength="5" pattern="[A-Z]{3}[0-9]{2}"></form>
<button id="load" onclick="fetch('/api/report').then(r => { document.querySelector('#msg').innerText = r.ok ? 'Report ready' : 'Report unavailable'; })">Load report</button>
<button id="crash" onclick="setTimeout(() => { null.boom(); }, 0)">Crash</button><button id="del">Delete all orders</button><div id="msg"></div></body></html>`;
  return new Promise((ok) => {
    const s = createServer((req, res) => {
      let body = ''; req.on('data', (d) => { body += d; });
      req.on('end', () => {
        const authed = /sid=ok/.test(req.headers.cookie ?? '');
        if (req.url === '/session' && req.method === 'POST') {
          const f = new URLSearchParams(body);
          if (f.get('u') === 'qa' && f.get('p') === SENTINEL_PASS) { res.writeHead(302, { location: '/app', 'set-cookie': 'sid=ok; Path=/; HttpOnly' }); res.end(); }
          else { res.writeHead(302, { location: '/login?error=1' }); res.end(); }
          return;
        }
        if (req.url?.startsWith('/login')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(loginPage(req.url.includes('error'))); return; }
        if (req.url === '/app') { if (!authed) { res.writeHead(302, { location: '/login' }); res.end(); return; } res.writeHead(200, { 'content-type': 'text/html' }); res.end(appPage); return; }
        if (req.url === '/api/report') { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":"boom"}'); return; }
        res.writeHead(404); res.end('nope');
      });
    });
    s.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${(s.address() as any).port}`, close: () => s.close() }));
  });
}
const loginSetup = (base: string, envName = 'DCORE_QA_PASS') => [{ goto: `${base}/app` }, { fill: { label: 'Username', value: 'qa' } }, { fill: { label: 'Password', valueEnv: envName } }, { click: { text: 'Sign in', role: 'button' } }, { waitFor: { url: '/app' }, timeoutMs: 6000 }];

function planFor(base: string, envName?: string) {
  return {
    name: 'Fixture orders app', target: `${base}/app`, environment: 'local-fixture', out_of_scope: ['Deleting orders (destructive)'],
    setup: loginSetup(base, envName),
    cases: [
      { id: 'TC-001', area: 'Orders', type: 'positive', title: 'Orders table lists 3 rows', expected: '3 rows with headers.', steps: [{ assertCount: { selector: '#orders tbody tr', equals: 3 } }, { assertText: 'Total: 3' }] },
      { id: 'TC-002', area: 'Orders', type: 'positive', title: 'Total shows 4 (deliberately wrong expectation)', expected: 'Total: 4 is shown.', steps: [{ assertText: 'Total: 4' }] },
      { id: 'TC-003', area: 'Orders', type: 'positive', title: 'Export button exists', expected: 'An Export button can be clicked.', steps: [{ click: { text: 'Export CSV' }, timeoutMs: 800 }, { assertText: 'Exported' }] },
      { id: 'TC-004', area: 'Reports', type: 'error', title: 'Report failure is shown to the user', expected: 'A failed report shows "Report unavailable".', steps: [{ click: { selector: '#load' } }, { waitFor: { text: 'Report unavailable' } }, { assertText: 'Report unavailable' }] },
      { id: 'TC-005', area: 'Runtime', type: 'positive', title: 'Crash button does not break the page', expected: 'Page keeps working.', steps: [{ click: { selector: '#crash' } }, { wait: 300 }, { assertText: 'Orders' }] },
      { id: 'TC-006', area: 'Orders', type: 'positive', title: 'Bulk delete', status: 'NOT_TESTED', reason: 'Destructive: needs explicit authorization.' },
      { id: 'TC-007', area: 'Mobile app', type: 'ui', title: 'Native app layout', status: 'NOT_APPLICABLE', reason: 'Web only.' },
      { id: 'TC-008', area: 'Orders', type: 'positive', title: 'Pagination', skip: true, reason: 'Fixture has one page.' },
    ],
    not_tested: [{ area: 'Server-side validation', status: 'NOT_TESTED', reason: 'needs form submission with test data' }],
  };
}

// ---- pure: plan validation, step text, scenario generation --------------------------------------------------------
test('QA-1. plan validation + human step text never reveals secrets', () => {
  assert.deepEqual(validatePlan({ cases: [{ title: 'x', steps: [] }] }), []);
  assert.ok(validatePlan({ cases: [{ steps: [] }] }).some((e: string) => /no title/.test(e)));
  assert.ok(validatePlan({ cases: [{ id: 'A', title: 't', steps: [] }, { id: 'A', title: 'u', steps: [] }] }).some((e: string) => /duplicate/.test(e)));
  assert.ok(validatePlan(null).length);
  assert.equal(describeStep({ fill: { label: 'Password', valueEnv: 'X_PASS' } }), 'Enter ${X_PASS} into label "Password"');
  assert.equal(describeStep({ fill: { selector: '#pwd', value: SENTINEL_PASS } }), 'Enter [REDACTED] into selector "#pwd"');
  assert.match(describeStep({ assertCount: { selector: 'tr', min: 1 } }), /count of "tr"/);
});

test('QA-2. scenario generation: positive/negative/boundary cases from REAL field constraints; risky actions excluded', () => {
  const email = fieldCases({ selector: '#email', type: 'email', name: 'Email', constraints: { required: true } });
  assert.deepEqual(email.map((c: any) => c.type), ['negative', 'negative', 'positive']);
  const qty = fieldCases({ selector: '#qty', type: 'number', name: 'Qty', constraints: { min: '1', max: '10' } });
  assert.ok(qty.some((c: any) => /below minimum \(0\)/.test(c.title)) && qty.some((c: any) => /above maximum \(11\)/.test(c.title)));
  assert.ok(qty.filter((c: any) => c.type === 'boundary').length === 4);
  const code = fieldCases({ selector: '#code', type: 'text', name: 'Code', constraints: { maxlength: '5', pattern: '[A-Z]{3}[0-9]{2}' } });
  assert.ok(code.some((c: any) => /truncated/.test(c.title)) && code.some((c: any) => /pattern/.test(c.title)));
  assert.equal(fieldCases({ selector: '#n', type: 'text', name: 'n' }).length, 0);       // no constraints => no invented cases
  const plan = generatePlan({ url: 'http://x.test/app', title: 'Orders', headings: ['h1: Orders'], interactive: [{ tag: 'input', type: 'email', name: 'Email', selector: '#email', constraints: { required: true } }, { tag: 'button', name: 'Delete all orders', selector: '#del' }, { tag: 'input', type: 'text', name: 'Free', selector: '#free' }], forms: [], tables: [{ selector: '#orders', headers: ['ID'], rows: 3 }], iframes: 1 });
  assert.ok(['Page', 'Field: Email', 'Data', 'Keyboard', 'Accessibility', 'Responsive', 'Performance'].every((a) => plan.scope.includes(a)));
  assert.ok(plan.cases.every((c: any, i: number) => c.id === `TC-${String(i + 1).padStart(3, '0')}`));
  assert.ok(plan.not_tested.some((n: any) => /Delete all orders/.test(n.reason)));
  assert.ok(plan.not_tested.some((n: any) => /iframe/.test(n.reason)) && plan.not_tested.some((n: any) => /no HTML constraints/.test(n.reason)));
  assert.ok(!JSON.stringify(plan).includes('"click"'), 'generated cases never click anything');
  assert.equal(generatePlan(null, { url: 'http://x.test' }).not_tested[0].status, 'BLOCKED');
});

test('QA-3. result derivation is honest: no run => NOT_TESTED, setup failure => BLOCKED, declared statuses kept', () => {
  const plan = planFor('http://x.test');
  const none = buildTestRun(plan, null);
  assert.ok(none.cases.filter((c: any) => c.id.startsWith('TC-') && !['TC-006', 'TC-007', 'TC-008'].includes(c.id)).every((c: any) => c.result === 'NOT_TESTED'));
  assert.equal(none.totals.PASS, 0);
  assert.match(none.verdict, /^NO VERDICT/);
  assert.equal(none.cases.find((c: any) => c.id === 'TC-006').result, 'NOT_TESTED');
  assert.equal(none.cases.find((c: any) => c.id === 'TC-007').result, 'NOT_APPLICABLE');
  assert.equal(none.cases.find((c: any) => c.id === 'TC-008').result, 'SKIPPED');
  assert.ok(none.cases.some((c: any) => c.id === 'NT-001' && c.result === 'NOT_TESTED'));
  const blockedRun = { result: 'FAIL', evidence: { steps: [{ n: 1, op: 'goto', phase: 'setup', result: 'PASS', detail: '' }, { n: 2, op: 'waitFor', phase: 'setup', result: 'FAIL', detail: 'timed out' }, { n: 4, op: 'assertCount', case: 'TC-001', result: 'BLOCKED', detail: 'not run: setup failed' }], cases: [] } };
  const b = buildTestRun(plan, blockedRun);
  assert.equal(b.setup.result, 'FAIL');
  assert.equal(b.cases.find((c: any) => c.id === 'TC-001').result, 'BLOCKED');
  assert.equal(b.cases.find((c: any) => c.id === 'TC-002').result, 'BLOCKED');
  assert.equal(detectDefects(plan as any, b.cases, blockedRun).length, 0, 'blocked cases are not defects');
});

// ---- real browser against the fixture -----------------------------------------------------------------------------
test('QA-4. real run: per-case results, defect classification, three PDFs, no secret leakage', { skip: HAVE_BROWSER ? false : 'no Chromium-family browser' }, async () => {
  const srv = await app(); const out = tmp('run');
  process.env.DCORE_QA_PASS = SENTINEL_PASS;
  try {
    const r = await runQaPlan(planFor(srv.url), { outDir: out });
    const tr = JSON.parse(readFileSync(r.evidence.files.json, 'utf8'));
    const res = (id: string) => tr.cases.find((c: any) => c.id === id).result;
    assert.equal(tr.setup.result, 'PASS');
    assert.equal(res('TC-001'), 'PASS');
    assert.equal(res('TC-002'), 'FAIL');
    assert.equal(tr.cases.find((c: any) => c.id === 'TC-002').failure_kind, 'ASSERTION');
    assert.equal(res('TC-003'), 'FAIL');
    assert.equal(tr.cases.find((c: any) => c.id === 'TC-003').failure_kind, 'ACTION');
    assert.equal(res('TC-004'), 'PASS');                       // the app handles the 500 gracefully...
    assert.equal(res('TC-005'), 'PASS');
    assert.deepEqual(['TC-006', 'TC-007', 'TC-008'].map(res), ['NOT_TESTED', 'NOT_APPLICABLE', 'SKIPPED']);
    const cat = (c: string) => tr.defects.filter((d: any) => d.category === c);
    const backend = cat('backend')[0];                          // ...but the 500 itself is still a backend defect
    assert.ok(backend && backend.severity === 'high' && /500/.test(backend.title));
    assert.deepEqual(backend.linked_cases, ['TC-004']);
    const rt = cat('frontend-runtime')[0];
    assert.ok(rt && /boom/.test(rt.actual) && rt.linked_cases.includes('TC-005'));
    const fn = cat('functional');
    assert.ok(fn.some((d: any) => d.linked_cases[0] === 'TC-002' && /CONFIRMED/.test(d.confidence)));
    assert.ok(fn.some((d: any) => d.linked_cases[0] === 'TC-003' && /NEEDS TRIAGE/.test(d.confidence)));
    assert.match(tr.verdict, /^NOT READY/);
    assert.equal(r.result, 'FAIL');
    for (const k of ['test_report_pdf', 'defect_report_pdf', 'test_case_register_pdf']) {
      const f = r.evidence.files[k];
      assert.equal(f.ok, true, `${k}: ${f.error}`);
      assert.equal(readFileSync(f.pdf).subarray(0, 5).toString(), '%PDF-');
      assert.ok(f.pages >= 1);
    }
    const reg = readFileSync(r.evidence.files.test_case_register_html, 'utf8');
    for (const id of ['TC-001', 'TC-002', 'TC-003', 'TC-004', 'TC-005', 'TC-006', 'TC-007', 'TC-008', 'NT-001']) assert.ok(reg.includes(id), id);
    for (const f of readdirSync(out)) if (statSync(join(out, f)).isFile() && !/\.(png|pdf)$/.test(f)) assert.ok(!readFileSync(join(out, f), 'utf8').includes(SENTINEL_PASS), `secret leaked in ${f}`);
    for (const f of readdirSync(out).filter((x) => x.endsWith('.pdf'))) assert.ok(!readFileSync(join(out, f)).toString('latin1').includes(SENTINEL_PASS), `secret in ${f}`);
  } finally { delete process.env.DCORE_QA_PASS; srv.close(); rmSync(out, { recursive: true, force: true }); }
});

test('QA-5. real run with a wrong password: setup fails => every case BLOCKED, no verdict, no case defects', { skip: HAVE_BROWSER ? false : 'no Chromium-family browser' }, async () => {
  const srv = await app(); const out = tmp('blocked');
  process.env.DCORE_QA_WRONG = 'wrong-password-sentinel';
  try {
    const r = await runQaPlan({ ...planFor(srv.url, 'DCORE_QA_WRONG'), cases: planFor(srv.url).cases.slice(0, 3) }, { outDir: out, pdf: false, stepTimeoutMs: 4000 });
    const tr = JSON.parse(readFileSync(r.evidence.files.json, 'utf8'));
    assert.equal(tr.setup.result, 'FAIL');
    assert.deepEqual(tr.cases.filter((c: any) => c.id.startsWith('TC-')).map((c: any) => c.result), ['BLOCKED', 'BLOCKED', 'BLOCKED']);
    assert.equal(tr.totals.PASS, 0);
    assert.match(tr.verdict, /^NO VERDICT/);
    assert.equal(tr.defects.filter((d: any) => d.category === 'functional').length, 0);
    assert.equal(r.result, 'BLOCKED');
    assert.equal(r.evidence.files.test_report_pdf.result, 'SKIPPED');
  } finally { delete process.env.DCORE_QA_WRONG; srv.close(); rmSync(out, { recursive: true, force: true }); }
});

test('QA-6. discovery on a live (fixture) page generates executable cases that then run for real', { skip: HAVE_BROWSER ? false : 'no Chromium-family browser' }, async () => {
  const srv = await app(); const out = tmp('disc');
  process.env.DCORE_QA_PASS = SENTINEL_PASS;
  try {
    const d = await discoverPlan(`${srv.url}/app`, { setup: loginSetup(srv.url), outDir: out });
    assert.equal(d.result, 'PASS');
    const plan = d.evidence.plan;
    const titles = plan.cases.map((c: any) => c.title).join('\n');
    assert.match(titles, /Email: empty value is rejected/);
    assert.match(titles, /Quantity: above maximum \(11\) is rejected/);
    assert.match(titles, /Code: input longer than maxlength \(5\) is truncated/);
    assert.ok(plan.not_tested.some((n: any) => /Delete all orders/.test(n.reason)));
    const r = await runQaPlan(plan, { outDir: join(out, 'run'), pdf: false });
    const tr = JSON.parse(readFileSync(r.evidence.files.json, 'utf8'));
    const fieldCases = tr.cases.filter((c: any) => c.area.startsWith('Field:'));
    assert.ok(fieldCases.length >= 8);
    assert.ok(fieldCases.every((c: any) => c.result === 'PASS'), JSON.stringify(fieldCases.filter((c: any) => c.result !== 'PASS').map((c: any) => [c.title, c.actual])));
  } finally { delete process.env.DCORE_QA_PASS; srv.close(); rmSync(out, { recursive: true, force: true }); }
});

// ---- no browser / malformed input ------------------------------------------------------------------------------------
test('QA-7. no browser: nothing PASSes, PDFs BLOCKED, JSON/Markdown/HTML still written', async () => {
  const out = tmp('nob');
  try {
    const r = await runQaPlan(planFor('http://127.0.0.1:9'), { outDir: out, browser: join(out, 'no-such-browser.exe') });
    const tr = JSON.parse(readFileSync(r.evidence.files.json, 'utf8'));
    assert.equal(tr.totals.PASS, 0);
    assert.equal(tr.totals.FAIL, 0);
    assert.ok(['BLOCKED', 'NOT_TESTED'].includes(r.result));
    assert.equal(r.evidence.files.test_report_pdf.ok, false);
    assert.ok(existsSync(r.evidence.files.md) && existsSync(r.evidence.files.test_case_register_html));
    assert.ok(r.limitations.some((l: string) => /PDF not produced/.test(l)));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('QA-8. CLI: invalid plan => BLOCKED exit 3 with plan errors; malformed JSON fails closed', () => {
  const run = (...a: string[]) => spawnSync(process.execPath, [CLI, ...a, '--json'], { encoding: 'utf8' });
  const bad = run('dcore-qa', '--plan', '{"cases":[{"steps":[]}]}');
  assert.equal(bad.status, 3, bad.stderr);
  assert.ok(JSON.parse(bad.stdout).evidence.plan_errors.some((e: string) => /no title/.test(e)));
  const mal = run('dcore-qa', '--plan', '{nope');
  assert.equal(mal.status, 3);
  assert.ok(!/SyntaxError|at .*\.mjs/.test(mal.stderr));
  const plain = spawnSync(process.execPath, [CLI, 'dcore-qa', 'Verify login.', '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(plain.stdout).module_id, 'dcore-qa');   // text mode unchanged
});

test('QA-9. reports render every result state and escape HTML (no injection from page text)', async () => {
  const out = tmp('render');
  try {
    const tr = buildTestRun({ name: 'Render <b>test</b>', target: 'http://x.test', cases: [{ id: 'TC-1', title: '<script>alert(1)</script>', steps: [{ assertText: 'x' }] }] }, null);
    const files = await writeReports(tr, out, { pdf: false });
    const html = readFileSync(files.test_report_html, 'utf8');
    assert.ok(!html.includes('<script>alert(1)</script>') && html.includes('&lt;script&gt;'));
    assert.ok(readFileSync(files.defect_report_html, 'utf8').includes('No defects were detected in the executed scope'));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('QA-10. regression: fields inside hidden forms/modals are never turned into generated cases (staging finding)', () => {
  const plan = generatePlan({ url: 'http://x.test/p', title: 'P', headings: [], interactive: [{ tag: 'input', type: 'number', name: 'Rate', selector: '#rate', constraints: { min: '1' } }],
    forms: [{ selector: '#chat_form', fields: [{ name: 'title_Id', type: 'text', label: 'Title', selector: '#title_Id', visible: false, constraints: { maxlength: '50' } }, { name: 'rate', type: 'number', selector: '#rate', visible: true, constraints: { min: '1' } }] }], tables: [] });
  assert.ok(!JSON.stringify(plan.cases).includes('#title_Id'), 'hidden field must not get cases');
  assert.ok(plan.cases.some((c: any) => c.area === 'Field: Rate'));
});

test('QA-11. regression: image-heavy reports print (streamed PDF); a missing source HTML is BLOCKED, never a fake PDF', { skip: HAVE_BROWSER ? false : 'no Chromium-family browser' }, async () => {
  const out = tmp('pdf');
  try {
    const shot = await browse([{ goto: 'data:text/html,' + encodeURIComponent('<body style="margin:0"><div style="height:1600px;background:linear-gradient(45deg,#f00,#0f0,#00f,#ff0,#0ff)"></div></body>') }, { screenshot: { name: 'big', fullPage: true } }], { outDir: out });
    const png = shot.evidence.screenshots[0];
    writeFileSync(join(out, 'heavy.html'), '<!doctype html><html><body>' + Array.from({ length: 30 }, (_, i) => '<h3>Case ' + i + '</h3><img style="max-width:100%" src="' + basename(png) + '">').join('') + '</body></html>');
    const t0 = Date.now();
    const [heavy, missing] = await printPdfs([{ html: join(out, 'heavy.html'), pdf: join(out, 'heavy.pdf') }, { html: join(out, 'nope.html'), pdf: join(out, 'nope.pdf') }]);
    assert.equal(heavy.ok, true, heavy.error);
    assert.ok(heavy.pages >= 10 && Date.now() - t0 < 90_000);
    assert.equal(readFileSync(join(out, 'heavy.pdf')).subarray(0, 5).toString(), '%PDF-');
    assert.equal(missing.result, 'BLOCKED');
    assert.ok(!existsSync(join(out, 'nope.pdf')));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('QA-12. defect quality: setup-phase errors say so; a11y-type failures are accessibility; a11y defects link only a11y-check cases', () => {
  const plan = { name: 'q', target: 'http://x.test', setup: [{ goto: 'http://x.test/login' }], cases: [
    { id: 'K-1', area: 'Keyboard', type: 'accessibility', title: 'skip link first', steps: [{ press: 'Tab' }, { evaluate: { expression: 'x', expect: 'Skip' } }] },
    { id: 'A-1', area: 'A11y', type: 'accessibility', title: 'heuristics', steps: [{ a11y: true }] } ] };
  const run = { result: 'FAIL', started_at: 's', evidence: {
    steps: [{ n: 1, op: 'goto', phase: 'setup', result: 'PASS', detail: '' }, { n: 3, op: 'press', case: 'K-1', result: 'PASS', detail: '' }, { n: 4, op: 'evaluate', case: 'K-1', result: 'FAIL', detail: 'value "15" (expected "Skip")' }, { n: 6, op: 'a11y', case: 'A-1', result: 'FAIL', detail: 'accessibility findings: img_alt' }],
    cases: [{ id: 'K-1', page_errors: [], console_errors: [], network_failures: [] }, { id: 'A-1', page_errors: [], console_errors: [], network_failures: [] }],
    page_errors: ['TypeError: login boom'], console_errors: [], network_failures: [], a11y: [{ img_alt: { ok: false, count: 1, samples: ['#logo'] } }] } };
  const tr = buildTestRun(plan, run);
  const byTitle = (re: RegExp) => tr.defects.find((d: any) => re.test(d.title));
  assert.equal(byTitle(/skip link first/).category, 'accessibility');
  assert.deepEqual(byTitle(/Images without alt/).linked_cases, ['A-1']);
  const setupErr = byTitle(/login boom/);
  assert.deepEqual(setupErr.linked_cases, []);
  assert.match(setupErr.steps_to_reproduce[0], /during setup/);
  assert.ok(setupErr.steps_to_reproduce.some((s: string) => s.includes('Open http://x.test/login')));
});
