// M46 — browser validation matrix. Representative scenarios run on every INSTALLED, drivable browser (Chromium engine:
// Chrome / Edge / Chromium) at desktop, tablet and mobile viewports; browsers that are absent are NOT_AVAILABLE, browsers
// that are present but not drivable over CDP (Firefox, WebKit) are NOT_TESTED with the reason. Nothing is installed.
// The report carries a browser-coverage section and never claims cross-browser compatibility from one engine.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { browserInventory, VIEWPORTS, findBrowser } from '../../skills/dcore/scripts/exec/browse.mjs';
import { runMatrix } from '../../skills/dcore/scripts/exec/matrix.mjs';
import { runScenarios } from '../../skills/dcore/scripts/exec/scenario.mjs';
import { writeReports } from '../../skills/dcore/scripts/exec/report.mjs';
import { scenarioTestRun } from '../../skills/dcore/scripts/exec/scenario.mjs';
import { readPdfFacts } from '../../skills/dcore/scripts/exec/docs.mjs';

const SKIP = findBrowser() ? false : 'no Chromium-family browser';
let A = ''; let srv: Server; let OUT = '';
const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>XB</title>
<style>#burger{display:none}@media (max-width:767px){#nav{display:none}#burger{display:block}}</style></head><body>
<nav id="nav">Home · Shop</nav><button id="burger">Menu</button>
<form id="f"><label>Email <input id="email" type="email" required></label></form>
<iframe id="fr" srcdoc="<p>inside frame</p>"></iframe><div id="host"></div>
<div id="src" draggable="true" style="width:100px;height:40px;background:#cde">Card</div><div id="dst" style="width:160px;height:80px;margin-top:40px;border:2px dashed #888">Drop</div><p id="out">none</p>
<button id="act" style="width:140px;height:50px">Act</button><p id="acted">no</p>
<script>document.getElementById('host').attachShadow({mode:'open'}).innerHTML='<span>inside shadow</span>';
const s=document.getElementById('src'),d=document.getElementById('dst');s.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain','card'));d.addEventListener('dragover',e=>e.preventDefault());d.addEventListener('drop',e=>{e.preventDefault();document.getElementById('out').textContent='dropped';});
document.getElementById('act').addEventListener('click',()=>{document.getElementById('acted').textContent='acted';});</script></body></html>`;
const DOC = () => ({ name: 'Cross-browser representative set', target: A, environment: 'fixture', scenarios: [
  { id: 'XB-01', title: 'Email validation', type: 'Validation', priority: 'P2', steps: [{ action: 'goto', target: `${A}/` }, { action: 'fill', target: { selector: '#email' }, input: 'not-an-email' }, { action: 'evaluate', input: 'document.getElementById("email").checkValidity()', expect: { value: false } }] },
  { id: 'XB-02', title: 'Frame and shadow content', type: 'Functional', priority: 'P2', steps: [{ action: 'goto', target: `${A}/` }, { action: 'assert', expect: { text: 'inside shadow' } }, { action: 'waitFor', target: { frame: { selector: '#fr' } }, input: { text: 'inside frame' } }] },
  { id: 'XB-03', title: 'Native drag and drop', type: 'Functional', priority: 'P3', steps: [{ action: 'goto', target: `${A}/` }, { action: 'drag', target: { selector: '#src' }, input: { to: { selector: '#dst' } } }, { action: 'assert', expect: { text: 'dropped' } }] },
  { id: 'XB-04', title: 'Navigation adapts to the viewport', type: 'Responsive', priority: 'P2', steps: [{ action: 'goto', target: `${A}/` }, { action: 'evaluate', input: "(() => { const small = matchMedia('(max-width: 767px)').matches; const vis = (id) => getComputedStyle(document.getElementById(id)).display !== 'none'; return small ? vis('burger') && !vis('nav') : vis('nav') && !vis('burger'); })()", expect: { value: true } }] },
  { id: 'XB-05', title: 'Primary action works (tap on touch viewports, click on desktop)', type: 'Functional', priority: 'P1', steps: [{ action: 'goto', target: `${A}/` }, { action: 'tap', target: { selector: '#act' } }, { action: 'assert', expect: { text: 'acted' } }] },
] });

before(async () => { OUT = mkdtempSync(join(tmpdir(), 'dcore-m46-')); srv = createServer((q: any, r: any) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(HTML); }); await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => { A = `http://127.0.0.1:${(srv.address() as any).port}`; ok(); })); });
after(() => { srv?.close(); if (OUT) rmSync(OUT, { recursive: true, force: true }); });

test('M46-1. inventory is detection only: absent browsers NOT_AVAILABLE; an installed Firefox / WebKit is reported as not drivable, never faked', () => {
  const home = mkdtempSync(join(tmpdir(), 'dcore-m46-home-'));
  try {
    const empty = browserInventory('linux', { HOME: home, PATH: '' });
    assert.deepEqual(empty.map((b: any) => b.family), ['chrome', 'edge', 'chromium', 'brave', 'firefox', 'webkit']);
    for (const b of empty.filter((x: any) => ['firefox', 'webkit'].includes(x.family))) { assert.equal(b.available, false); assert.equal(b.drivable, false); assert.match(b.reason, /not installed/); }
    // a Playwright Firefox build present: installed, but DCore's CDP driver cannot run it
    const ff = join(home, '.cache', 'ms-playwright', 'firefox-1490', 'firefox'); mkdirSync(ff, { recursive: true }); writeFileSync(join(ff, 'firefox'), '');
    const withFf = browserInventory('linux', { HOME: home, PATH: '' }).find((b: any) => b.family === 'firefox');
    assert.equal(withFf.available, true); assert.equal(withFf.drivable, false); assert.match(withFf.reason, /WebDriver BiDi/);
    assert.deepEqual(Object.keys(VIEWPORTS), ['desktop', 'tablet', 'mobile']);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

let RESULT: any = null;
test('M46-2. matrix: every drivable browser x desktop / tablet / mobile runs the representative scenarios; unavailable browsers are recorded, not skipped', { skip: SKIP }, async () => {
  const inv = browserInventory();
  const drivable = inv.filter((b: any) => b.drivable && ['chrome', 'edge', 'chromium'].includes(b.family)).map((b: any) => b.family);
  assert.ok(drivable.length >= 1);
  RESULT = await runMatrix(DOC(), { browsers: [...drivable, 'firefox', 'webkit'], viewports: ['desktop', 'tablet', 'mobile'], outDir: join(OUT, 'mx'), stepTimeoutMs: 5000 });
  const { matrix, sr } = RESULT;
  for (const fam of drivable) for (const vp of ['desktop', 'tablet', 'mobile']) {
    const rows = matrix.rows.filter((r: any) => r.browser === fam && r.viewport.startsWith(vp));
    assert.equal(rows.length, 5, `${fam}/${vp}`);
    for (const r of rows) {
      assert.equal(r.status, 'PASS', `${fam}/${vp} ${r.scenario}: ${JSON.stringify(sr.scenarios.find((s: any) => s.scenario_id === `${r.scenario}@${fam}-${vp}`)?.actual)}`);
      assert.ok(r.version && r.os && r.viewport.includes(`${VIEWPORTS[vp].width}x${VIEWPORTS[vp].height}`));
      if (vp !== 'desktop') assert.ok(r.limitations.some((l: string) => /emulation in desktop Chromium/.test(l)));
    }
  }
  for (const fam of ['firefox', 'webkit']) {
    const inf = inv.find((b: any) => b.family === fam);
    const rows = matrix.rows.filter((r: any) => r.browser === fam);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r: any) => r.status === (inf.available ? 'NOT_TESTED' : 'NOT_AVAILABLE') && r.scenario === '*' && r.limitations[0] === inf.reason));
  }
  assert.match(matrix.claim, /NOT a cross-browser compatibility claim/);
  assert.ok(sr.scenarios.every((s: any) => /^XB-0\d@(chrome|edge|chromium)-(desktop|tablet|mobile)$/.test(s.scenario_id)));
});

test('M46-3. dcore-report: browser-coverage section with every combination, unavailable browsers and the no-cross-browser statement; IDs consistent', { skip: SKIP }, async () => {
  assert.ok(RESULT, 'needs M46-2');
  const { sr } = RESULT;
  const tr = await scenarioTestRun(sr, { outDir: join(OUT, 'mx') });
  const files: any = await writeReports(tr, join(OUT, 'mx-report'), { source: sr, prefix: 'matrix' });
  assert.equal(files.consistency.ok, true, files.consistency.problems.join('; '));
  const html = readFileSync(files.test_report_html, 'utf8');
  assert.ok(html.includes('4. Browser coverage') && html.includes('Chromium-engine coverage only: this is NOT a cross-browser compatibility claim.'));
  for (const r of sr.browser_coverage) assert.ok(html.includes(r.scenario === '*' ? r.limitations[0] : `${r.scenario}`), `coverage row ${r.browser} ${r.scenario}`);
  assert.ok(html.includes('NOT AVAILABLE') || html.includes('NOT TESTED'));
  assert.ok(readPdfFacts(readFileSync(files.test_report_pdf.pdf)).outline.includes('4. Browser coverage'));
});

test('M46-4. a single-browser run reports its one browser + viewport and lists the other installed browsers as NOT_TESTED in this run', { skip: SKIP }, async () => {
  const sr: any = await runScenarios({ ...DOC(), scenarios: DOC().scenarios.slice(0, 2) }, { outDir: join(OUT, 'single'), viewport: 'tablet', stepTimeoutMs: 5000 });
  assert.match(sr.browser.viewport, /^820x1180 tablet \(mobile emulation, touch\)/);
  const tr = await scenarioTestRun(sr, { outDir: join(OUT, 'single') });
  const files: any = await writeReports(tr, join(OUT, 'single-report'), { source: sr, pdf: false });
  const model = JSON.parse(readFileSync(files.report_model, 'utf8'));
  const rows = model.browser_coverage.rows;
  assert.equal(rows[0].viewport.startsWith('820x1180 tablet'), true); assert.match(rows[0].status, /PASS 2/);
  const others = browserInventory().filter((b: any) => !String(rows[0].browser).includes(b.family));
  for (const b of others) { const r = rows.find((x: any) => x.browser === b.family); assert.ok(r, b.family); assert.equal(r.status, b.available ? 'NOT_TESTED' : 'NOT_AVAILABLE'); }
});

test('M46-5. regression (Edge, real site): hit-test uses page coordinates when the layout is wider than the viewport; fixed modal buttons are not "obstructed"', { skip: SKIP }, async () => {
  const wide = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><div style="width:900px;height:40px;background:#eee">wide content</div>
<div id="m" role="dialog" style="position:fixed;left:50%;top:150px;transform:translateX(-50%);width:300px;background:#fff;border:1px solid"><div class="footer" style="padding:12px;text-align:right"><button id="close" onclick="document.getElementById('m').remove()">Close</button></div></div></body></html>`;
  const s2 = createServer((q: any, r: any) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(wide); });
  await new Promise<void>((ok) => s2.listen(0, '127.0.0.1', () => ok()));
  const url = `http://127.0.0.1:${(s2.address() as any).port}/`;
  try {
    const fams = browserInventory().filter((b: any) => b.drivable && ['edge', 'chrome', 'chromium'].includes(b.family)).map((b: any) => b.family);
    const { matrix, sr } = await runMatrix({ name: 'wide layout', scenarios: [{ id: 'WIDE-01', title: 'Close a fixed modal on an overflowing page', steps: [{ action: 'goto', target: url }, { action: 'click', target: { selector: '#close' } }, { action: 'assert', expect: { noText: 'Close' } }] }] }, { browsers: fams, viewports: ['tablet', 'mobile'], outDir: join(OUT, 'wide'), stepTimeoutMs: 4000 });
    for (const r of matrix.rows) assert.equal(r.status, 'PASS', `${r.browser}/${r.viewport}: ${sr.scenarios.find((x: any) => x.scenario_id.startsWith(r.scenario) && x.scenario_id.includes(r.browser) && x.scenario_id.includes(r.viewport.split(' ')[0]))?.actual}`);
  } finally { s2.close(); }
});
