// M39 — browser testing foundation. Every capability is executed for real against LOCAL fixture sites (two origins on
// 127.0.0.1) and every negative path must yield a non-PASS status (NOT_FOUND / AMBIGUOUS / DISABLED / TIMEOUT /
// VISIBLE_BUT_OBSTRUCTED / NOT_INTERACTABLE / BLOCKED). Skipped when no Chromium-family browser is installed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { browse, findBrowser } from '../../skills/dcore/scripts/exec/browse.mjs';
import { buildTestRun } from '../../skills/dcore/scripts/exec/report.mjs';

const SKIP = findBrowser() ? false : 'no Chromium-family browser';
let A = ''; let B = ''; const servers: Server[] = []; let OUT = '';

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>body{font:14px sans-serif;margin:20px}button{margin:4px;padding:6px 10px}</style></head><body>${body}</body></html>`;
const PAGES: Record<string, (b: string) => string> = {
  '/states': () => page('States', `<h1>States</h1>
<button id="ok" onclick="document.title='ok-clicked'">OK</button>
<button id="dis" disabled>Disabled</button><button id="aria" aria-disabled="true">AriaDisabled</button>
<fieldset disabled><button id="fs">InFieldset</button></fieldset>
<button id="nop" style="pointer-events:none">NoPointer</button>
<button id="hid" style="display:none">Hidden</button><button id="ghost" style="opacity:0">Ghost</button>
<button class="dup">Save</button><button class="dup">Save</button>
<div style="position:relative;width:220px;height:44px"><button id="cov" onclick="document.title='cov-clicked'">Covered</button><div id="shield" style="position:absolute;inset:0;background:rgba(255,0,0,.25)"></div></div>
<button id="unshield" onclick="document.getElementById('shield').remove()">Unshield</button>
<div id="spinner">Loading</div>
<button id="enlater" disabled onclick="document.title='enlater-clicked'">EnableLater</button>
<button id="openm" onclick="document.getElementById('bd').style.display='block'">Open modal</button>
<div id="bd" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4)"><div id="m" role="dialog" aria-modal="true" style="position:fixed;top:30%;left:30%;width:300px;background:#fff;padding:16px"><h2>Confirm order</h2><button id="mclose" onclick="document.getElementById('bd').style.display='none'">Close</button></div></div>
<script>
setTimeout(() => { const b = document.createElement('button'); b.id = 'later'; b.textContent = 'Later'; b.onclick = () => { document.title = 'later-clicked'; }; document.body.appendChild(b); }, 700);
setTimeout(() => { document.getElementById('enlater').disabled = false; }, 600);
setTimeout(() => { document.getElementById('spinner').remove(); }, 500);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('bd').style.display = 'none'; });
</script>`),
  '/form': () => page('Form', `<h1>Form</h1>
<input id="t" aria-label="Name"> <input id="d" type="date" aria-label="Date"> <input id="rg" type="range" min="0" max="10" aria-label="Level">
<input id="n" type="number" aria-label="Qty"> <input id="ml" maxlength="3" aria-label="Code">
<div id="ce" contenteditable="true" aria-label="Notes" style="border:1px solid #999;min-height:20px"></div>
<input id="ro" readonly value="x" aria-label="ReadOnly">
<select id="s" aria-label="Fruit"><option value="a">Apple</option><option value="b">Banana</option><option value="c" disabled>Cherry</option></select>
<label><input type="checkbox" id="cb"> Agree</label>
<label><input type="radio" name="g" id="r1" value="1"> One</label> <label><input type="radio" name="g" id="r2" value="2"> Two</label>
<label for="fancy" style="display:inline-block;padding:4px;border:1px solid #333">Fancy</label><input type="checkbox" id="fancy" style="opacity:0;position:absolute;left:-9999px">
<div><input id="ac" aria-label="City" autocomplete="off"><ul id="sug"></ul></div>
<div id="dd" role="combobox" tabindex="0" aria-label="Color" style="border:1px solid #333;width:120px;padding:4px">Choose</div>
<ul id="lb" role="listbox" style="display:none"><li role="option">Red</li><li role="option">Blue</li></ul>
<input id="k" aria-label="Keys" value="hello">
<form id="f" onsubmit="event.preventDefault(); document.title = 'submitted';"><input id="q" aria-label="Query"></form>
<input type="file" id="up" multiple aria-label="Attach">
<a id="dl" href="/download.csv">Export CSV</a>
<script>
document.getElementById('ac').addEventListener('keyup', (e) => { const v = e.target.value.toLowerCase(); document.getElementById('sug').innerHTML = ['Paris', 'Parma', 'Prague'].filter((c) => v && c.toLowerCase().startsWith(v)).map((c) => '<li role="option" onclick="document.getElementById(\\'ac\\').value=this.textContent;document.getElementById(\\'sug\\').innerHTML=\\'\\'">' + c + '</li>').join(''); });
const dd = document.getElementById('dd'), lb = document.getElementById('lb');
dd.onclick = () => { lb.style.display = lb.style.display === 'none' ? 'block' : 'none'; };
lb.onclick = (e) => { if (e.target.getAttribute('role') === 'option') { dd.textContent = e.target.textContent; lb.style.display = 'none'; } };
</script>`),
  '/nav': () => page('Nav one', `<h1>Nav one</h1><a id="to2" href="/nav2">Go to two</a>`),
  '/nav2': () => page('Nav two', `<h1>Nav two</h1>`),
  '/final': () => page('Final', `<h1>Final page</h1>`),
  '/spa': () => page('SPA', `<nav><a href="/spa" data-link>Home</a> <a href="/spa/orders" data-link>Orders</a></nav><main id="view"></main>
<script>
const render = async () => { const v = document.getElementById('view'); if (location.pathname === '/spa/orders') { v.textContent = 'loading...'; const r = await fetch('/api/orders'); const j = await r.json(); v.innerHTML = '<h2>Orders view</h2>' + j.map((o) => '<p>Order #' + o.id + '</p>').join(''); } else v.innerHTML = '<h2>Home view</h2>'; };
document.addEventListener('click', (e) => { const a = e.target.closest('[data-link]'); if (!a) return; e.preventDefault(); history.pushState({}, '', a.getAttribute('href')); render(); });
addEventListener('popstate', render); render();
</script>`),
  '/frames': (b) => page('Frames', `<h1>Frames</h1><button onclick="document.title='main-shared'">Shared</button>
<iframe id="f1" name="child" src="/child" style="width:560px;height:260px"></iframe>
<iframe id="x" name="cross" src="${b}/xchild" style="width:400px;height:120px"></iframe>`),
  '/child': () => page('Child', `<h2>Child</h2><button onclick="document.body.insertAdjacentHTML('beforeend','<p>child done</p>')">Child button</button><button>Shared</button><button>Twin</button>
<iframe name="grand" src="/grand" style="width:400px;height:140px"></iframe>`),
  '/grand': () => page('Grand', `<button onclick="document.body.insertAdjacentHTML('beforeend','<p>grand done</p>')">Grand button</button><button>Twin</button><input aria-label="Grand input">`),
  '/shadow': () => page('Shadow', `<h1>Shadow</h1><x-open></x-open><x-closed></x-closed>
<script>
customElements.define('x-open', class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: 'open' }); r.innerHTML = '<label>Shadow input <input id="si"></label><button id="sb">Shadow button</button><p id="out"></p>'; r.getElementById('sb').onclick = () => { r.getElementById('out').textContent = 'shadow clicked: ' + r.getElementById('si').value; }; } });
customElements.define('x-closed', class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: 'closed' }); r.innerHTML = '<button>Closed button</button>'; } });
</script>`),
  '/tabs': () => page('Tabs page', `<h1>Tabs page</h1><a href="/nav2" target="_blank">Open tab</a> <button onclick="window.open('/popup')">Popup</button>`),
  '/long': () => page('Long', `<h1>Long</h1><div style="height:1800px">spacer</div>
<button id="far" onclick="document.title='far-clicked'">Far button</button>
<div style="position:relative;width:220px;height:44px;margin-top:20px"><button id="farcov">Far covered</button><div style="position:absolute;inset:0;background:rgba(0,0,255,.2)"></div></div>
<div style="height:1200px">more</div>`),
  '/anim': () => page('Anim', `<button id="go" onclick="const b=document.getElementById('mv');b.style.transition='transform 600ms';b.style.transform='translateX(200px)'">Go</button><button id="mv">Mover</button><button>Secret token</button>`),
  '/responsive': () => `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Resp</title></head><body><h1>Responsive</h1></body></html>`,
  '/popup': () => page('Popup', `<h1>Popup window</h1>`),
  '/errors': () => page('Errors', `<h1>Errors</h1><script>
setTimeout(() => { throw new Error('boom-m39'); }, 50);
console.error('console-m39');
fetch('/api/fail500'); fetch('http://127.0.0.1:9/unreachable').catch(() => {});
</script>`),
};

before(async () => {
  if (SKIP) return;
  OUT = mkdtempSync(join(tmpdir(), 'dcore-m39-'));
  const mk = (handler: (req: any, res: any) => void) => new Promise<string>((ok) => { const s = createServer(handler); servers.push(s); s.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${(s.address() as any).port}`)); });
  B = await mk((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page('Cross', `<button onclick="document.body.insertAdjacentHTML('beforeend','<p>cross done</p>')">Cross button</button>`)); });
  A = await mk((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/redirect') { res.writeHead(302, { location: '/final' }); res.end(); return; }
    if (u === '/api/orders') { setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('[{"id":1},{"id":2}]'); }, 300); return; }
    if (u === '/api/fail500') { res.writeHead(500); res.end('x'); return; }
    if (u === '/download.csv') { res.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="orders.csv"' }); res.end('id,name\n1,Alice\n'); return; }
    const p = PAGES[u] ?? (u.startsWith('/spa') ? PAGES['/spa'] : null);
    if (!p) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(p(B));
  });
});
after(() => { for (const s of servers) s.close(); if (OUT) rmSync(OUT, { recursive: true, force: true }); });

// helpers: run steps (each in its own case so one failure does not hide the next) and index the log by case id
async function run(steps: any[], opts: any = {}) { return browse(steps, { outDir: join(OUT, String(Math.random()).slice(2)), stepTimeoutMs: 2500, settleMs: 600, ...opts }); }
const cases = (list: [string, ...any[]][]) => list.flatMap(([id, ...st]) => [{ case: { id } }, ...st]);
const byCase = (r: any, id: string) => r.evidence.steps.filter((s: any) => s.case === id);
const last = (r: any, id: string) => byCase(r, id).at(-1);

test('M39-1. element states: INTERACTABLE / DISABLED (3 kinds) / NOT_INTERACTABLE / HIDDEN / OBSTRUCTED / NOT_FOUND — via assertState', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/states` }, ...cases([
    ['ok', { assertState: { selector: '#ok', state: 'INTERACTABLE' } }],
    ['dis', { assertState: { selector: '#dis', state: 'DISABLED' } }],
    ['aria', { assertState: { selector: '#aria', state: 'DISABLED' } }],
    ['fs', { assertState: { selector: '#fs', state: 'DISABLED' } }],
    ['nop', { assertState: { selector: '#nop', state: 'NOT_INTERACTABLE' } }],
    ['hid', { assertState: { selector: '#hid', state: 'HIDDEN' } }],
    ['ghost', { assertState: { selector: '#ghost', state: 'HIDDEN' } }],
    ['cov', { assertState: { selector: '#cov', state: 'VISIBLE_BUT_OBSTRUCTED' } }],
    ['missing', { assertState: { selector: '#nope', state: 'NOT_FOUND' } }],
    ['wrong', { assertState: { selector: '#dis', state: 'INTERACTABLE' } }],
  ])]);
  for (const id of ['ok', 'dis', 'aria', 'fs', 'nop', 'hid', 'ghost', 'cov', 'missing']) assert.equal(last(r, id).result, 'PASS', `${id}: ${last(r, id).detail}`);
  assert.equal(last(r, 'wrong').result, 'FAIL');
  assert.match(last(r, 'wrong').detail, /actual DISABLED/);
  assert.match(last(r, 'cov').detail, /obstructed by div#shield/);
});

test('M39-2. click never silently passes: obstructed / disabled / hidden / missing / ambiguous fail with their state; optional => SKIPPED; force is explicit', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/states` }, ...cases([
    ['obstructed', { click: { selector: '#cov' }, timeoutMs: 800 }],
    ['disabled', { click: { selector: '#dis' }, timeoutMs: 600 }],
    ['hidden', { click: { selector: '#hid' }, timeoutMs: 600 }],
    ['missing', { click: { selector: '#nope' }, timeoutMs: 600 }],
    ['ambiguous', { click: { text: 'Save' }, timeoutMs: 600 }],
    ['indexed', { click: { text: 'Save', index: 1 } }],
    ['optional', { click: { selector: '#nope' }, timeoutMs: 400, optional: true }],
    ['unshield', { click: { text: 'Unshield' } }, { click: { selector: '#cov' } }, { assertTitle: 'cov-clicked' }],
  ])]);
  const st = (id: string) => byCase(r, id)[0];
  assert.equal(st('obstructed').result, 'FAIL'); assert.equal(st('obstructed').element_state, 'TIMEOUT'); assert.match(st('obstructed').detail, /VISIBLE_BUT_OBSTRUCTED by div#shield/);
  assert.equal(st('disabled').result, 'FAIL'); assert.match(st('disabled').detail, /last state: DISABLED/);
  assert.equal(st('hidden').result, 'FAIL'); assert.match(st('hidden').detail, /last state: FOUND/);
  assert.equal(st('missing').result, 'FAIL'); assert.equal(st('missing').element_state, 'NOT_FOUND');
  assert.equal(st('ambiguous').result, 'FAIL'); assert.equal(st('ambiguous').element_state, 'AMBIGUOUS'); assert.match(st('ambiguous').detail, /add "index"/);
  assert.equal(st('indexed').result, 'PASS');
  assert.equal(st('optional').result, 'SKIPPED');
  assert.ok(byCase(r, 'unshield').every((s: any) => s.result === 'PASS'), JSON.stringify(byCase(r, 'unshield')));
  const forced = await run([{ goto: `${A}/states` }, { click: { selector: '#cov', force: true }, timeoutMs: 500 }, { assertTitle: 'cov-clicked' }]);
  assert.match(forced.evidence.steps[1].detail, /forced JS click — element was VISIBLE_BUT_OBSTRUCTED/);
  assert.equal(forced.evidence.steps[2].result, 'PASS');
});

test('M39-3. dynamic UI: waits for late elements, late enabling, spinners to vanish and the DOM to settle', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/states` }, { waitFor: { selector: '#spinner', state: 'detached' } }, { click: { selector: '#enlater' } }, { assertTitle: 'enlater-clicked' }, { click: { text: 'Later' } }, { assertTitle: 'later-clicked' }, { waitFor: { stable: true, quietMs: 300 } }]);
  assert.ok(r.evidence.steps.every((s: any) => s.result === 'PASS'), JSON.stringify(r.evidence.steps));
});

test('M39-4. fixed-position modal: detected open, backdrop obstructs the page, Escape closes it', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/states` }, { assertModal: { open: false } }, { click: { selector: '#openm' } }, { assertModal: { open: true, title: 'Confirm order' } }, { assertVisible: { selector: '#mclose' } }, { assertState: { selector: '#ok', state: 'VISIBLE_BUT_OBSTRUCTED' } }, { press: 'Escape' }, { assertModal: { open: false } }, { assertState: { selector: '#ok', state: 'INTERACTABLE' } }]);
  assert.ok(r.evidence.steps.every((s: any) => s.result === 'PASS'), JSON.stringify(r.evidence.steps.filter((s: any) => s.result !== 'PASS')));
});

test('M39-5. inputs are verified after entry: text/date/range/number/maxlength/contenteditable/readonly/clear', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/form` }, ...cases([
    ['text', { fill: { label: 'Name', value: 'Ada' } }, { evaluate: { expression: "document.querySelector('#t').value", expect: 'Ada' } }],
    ['date', { fill: { label: 'Date', value: '2026-10-03' } }, { evaluate: { expression: "document.querySelector('#d').value", expect: '2026-10-03' } }],
    ['range', { fill: { label: 'Level', value: '7' } }],
    ['number', { fill: { label: 'Qty', value: 'abc' } }],
    ['maxlen', { fill: { label: 'Code', value: 'ABCDE' } }],
    ['ce', { fill: { label: 'Notes', value: 'note text' } }],
    ['readonly', { fill: { label: 'ReadOnly', value: 'y' } }],
    ['clear', { clear: { label: 'Name' } }, { evaluate: { expression: "document.querySelector('#t').value", expect: '' } }],
  ])]);
  for (const id of ['text', 'date', 'range', 'number', 'maxlen', 'ce', 'clear']) assert.ok(byCase(r, id).every((s: any) => s.result === 'PASS'), `${id}: ${JSON.stringify(byCase(r, id))}`);
  assert.match(byCase(r, 'date')[0].detail, /value verified/);
  assert.match(byCase(r, 'number')[0].detail, /rejected the input/);
  assert.match(byCase(r, 'maxlen')[0].detail, /truncated to maxlength 3/);
  assert.equal(byCase(r, 'readonly')[0].result, 'FAIL');
});

test('M39-6. select (native + custom), checkbox/radio (idempotent, verified, via label)', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/form` }, ...cases([
    ['sel', { select: { label: 'Fruit', option: 'Banana' } }, { evaluate: { expression: "document.querySelector('#s').value", expect: 'b' } }],
    ['seldis', { select: { label: 'Fruit', option: 'Cherry' } }],
    ['selmissing', { select: { label: 'Fruit', option: 'Mango' } }],
    ['custom', { select: { label: 'Color', option: 'Blue' } }, { evaluate: { expression: "document.querySelector('#dd').textContent", expect: 'Blue' } }],
    ['check', { check: { label: 'Agree' } }, { check: { label: 'Agree' } }, { uncheck: { label: 'Agree' } }, { assertState: { selector: '#cb', state: 'UNCHECKED' } }],
    ['radio', { check: { label: 'Two' } }, { assertState: { selector: '#r2', state: 'CHECKED' } }],
    ['radiouncheck', { uncheck: { label: 'Two' } }],
    ['fancy', { check: { selector: '#fancy' } }, { assertState: { selector: '#fancy', state: 'CHECKED' } }],
  ])]);
  for (const id of ['sel', 'custom', 'check', 'radio', 'fancy']) assert.ok(byCase(r, id).every((s: any) => s.result === 'PASS'), `${id}: ${JSON.stringify(byCase(r, id))}`);
  assert.match(byCase(r, 'check')[1].detail, /already checked \(no click\)/);
  assert.match(byCase(r, 'fancy')[0].detail, /via its label/);
  assert.equal(byCase(r, 'seldis')[0].result, 'FAIL'); assert.match(byCase(r, 'seldis')[0].detail, /disabled/);
  assert.equal(byCase(r, 'selmissing')[0].result, 'FAIL'); assert.match(byCase(r, 'selmissing')[0].detail, /available: Apple \| Banana \| Cherry/);
  assert.equal(byCase(r, 'radiouncheck')[0].result, 'FAIL');
});

test('M39-7. keyboard: per-key typing drives key-event autocomplete (paste-style fill does not); chords; Shift+Tab; Enter submits', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/form` }, ...cases([
    ['fillnokeys', { fill: { label: 'City', value: 'Par' } }, { waitFor: { text: 'Paris', role: 'option', state: 'visible' }, timeoutMs: 800 }],
    ['typed', { type: { label: 'City', value: 'Par', clear: true } }, { waitFor: { text: 'Paris', role: 'option', state: 'visible' } }, { click: { text: 'Paris', role: 'option' } }, { evaluate: { expression: "document.querySelector('#ac').value", expect: 'Paris' } }],
    ['chord', { press: { selector: '#k', key: 'Control+A' } }, { type: { selector: '#k', value: 'Z' } }, { evaluate: { expression: "document.querySelector('#k').value", expect: 'Z' } }],
    ['shifttab', { click: { selector: '#q' } }, { press: 'Shift+Tab' }, { evaluate: { expression: 'document.activeElement.id', expect: 'k' } }],
    ['enter', { type: { label: 'Query', value: 'x' } }, { press: 'Enter' }, { assertTitle: 'submitted' }],
  ])]);
  assert.equal(byCase(r, 'fillnokeys')[1].result, 'FAIL', 'insertText fires no key events, so a keyup-driven widget must not appear');
  for (const id of ['typed', 'chord', 'shifttab', 'enter']) assert.ok(byCase(r, id).every((s: any) => s.result === 'PASS'), `${id}: ${JSON.stringify(byCase(r, id))}`);
});

test('M39-8. navigation: redirects recorded, back/forward verified, SPA pushState routes + async render, history on SPA', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/redirect` }, { assertText: 'Final page' }, { goto: `${A}/nav` }, { click: { text: 'Go to two' } }, { assertUrl: '/nav2' }, { back: true }, { assertUrl: '/nav' }, { forward: true }, { assertUrl: '/nav2' },
    { goto: `${A}/spa` }, { assertText: 'Home view' }, { click: { text: 'Orders' } }, { waitFor: { url: '/spa/orders' } }, { waitFor: { text: 'Order #2' } }, { back: true }, { waitFor: { text: 'Home view' } }]);
  assert.ok(r.evidence.steps.every((s: any) => s.result === 'PASS'), JSON.stringify(r.evidence.steps.filter((s: any) => s.result !== 'PASS')));
  assert.match(r.evidence.steps[0].detail, /redirects: 302 .*\/redirect -> .*\/final/);
  assert.ok(r.evidence.redirects.some((x: any) => x.status === 302));
  assert.ok(r.evidence.spa_navigations.some((x: any) => /\/spa\/orders/.test(x.url)));
  const noBack = await run([{ goto: `${A}/nav` }, { forward: true }]);
  assert.equal(noBack.evidence.steps[1].result, 'FAIL', 'forward with no next entry must not pass');
});

test('M39-9. frames: nested + cross-origin iframes discovered and interacted with; main wins; ambiguity across frames; unknown frame BLOCKED', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/frames` }, { wait: 500 }, { inspect: {} }, ...cases([
    ['grand', { click: { text: 'Grand button' } }, { assertText: { text: 'grand done', frame: 'grand' } }],
    ['cross', { click: { text: 'Cross button' } }, { assertText: { text: 'cross done', frame: { url: '/xchild' } } }],
    ['scoped', { click: { text: 'Child button', frame: { selector: '#f1' } } }, { assertText: { text: 'child done', frame: 'child' } }],
    ['fillframe', { fill: { label: 'Grand input', value: 'hello' } }],
    ['mainwins', { click: { text: 'Shared' } }, { assertTitle: 'main-shared' }],
    ['twin', { click: { text: 'Twin' }, timeoutMs: 600 }],
    ['twinscoped', { click: { text: 'Twin', frame: 'grand' } }],
    ['noframe', { click: { text: 'X', frame: 'no-such-frame' } }],
  ])]);
  const frames = r.evidence.inspections[0].frames;
  assert.equal(frames.length, 3);
  assert.ok(frames.some((f: any) => f.depth === 2) && frames.every((f: any) => f.accessible));
  for (const id of ['grand', 'cross', 'scoped', 'fillframe', 'mainwins', 'twinscoped']) assert.ok(byCase(r, id).every((s: any) => s.result === 'PASS'), `${id}: ${JSON.stringify(byCase(r, id))}`);
  assert.match(byCase(r, 'grand')[0].detail, /in frame .*\/grand/);
  assert.equal(byCase(r, 'twin')[0].element_state, 'AMBIGUOUS');
  assert.equal(byCase(r, 'noframe')[0].result, 'BLOCKED');
});

test('M39-10. shadow DOM: open roots are searched (fill + click + text); closed roots are NOT_FOUND, never PASS', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/shadow` }, ...cases([
    ['open', { fill: { label: 'Shadow input', value: 'deep' } }, { click: { text: 'Shadow button' } }, { assertText: 'shadow clicked: deep' }],
    ['closed', { click: { text: 'Closed button' }, timeoutMs: 600 }],
  ])]);
  assert.ok(byCase(r, 'open').every((s: any) => s.result === 'PASS'), JSON.stringify(byCase(r, 'open')));
  assert.match(byCase(r, 'open')[0].detail, /shadow DOM/);
  assert.equal(byCase(r, 'closed')[0].result, 'FAIL');
  assert.equal(byCase(r, 'closed')[0].element_state, 'NOT_FOUND');
});

test('M39-11. tabs/windows: window.open and target=_blank are tracked, switched to, asserted and closed', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/tabs` }, { click: { text: 'Popup' } }, { switchTab: { latest: true } }, { assertText: 'Popup window' }, { closeTab: true }, { assertText: 'Tabs page' }, { click: { text: 'Open tab' } }, { switchTab: { url: '/nav2' } }, { assertText: 'Nav two' }]);
  assert.ok(r.evidence.steps.every((s: any) => s.result === 'PASS'), JSON.stringify(r.evidence.steps.filter((s: any) => s.result !== 'PASS')));
  assert.ok(r.evidence.tabs.filter((t: any) => t.opened_by_page).length >= 2);
  const none = await run([{ goto: `${A}/tabs` }, { switchTab: { url: '/does-not-exist' }, timeoutMs: 500 }]);
  assert.equal(none.evidence.steps[1].result, 'FAIL');
});

test('M39-12. upload (verified, confined to allowed dirs, credential names refused) and download (saved, hashed, content-checked)', { skip: SKIP }, async () => {
  const allowed = join(OUT, 'uploads'); mkdirSync(allowed, { recursive: true });
  writeFileSync(join(allowed, 'invoice.txt'), 'hello'); writeFileSync(join(allowed, 'api-token.txt'), 'nope');
  const outside = join(tmpdir(), `dcore-outside-${Date.now()}.txt`); writeFileSync(outside, 'x');
  try {
    const r = await run([{ goto: `${A}/form` }, ...cases([
      ['up', { upload: { label: 'Attach', files: [join(allowed, 'invoice.txt')] } }],
      ['outside', { upload: { label: 'Attach', files: [outside] } }],
      ['cred', { upload: { label: 'Attach', files: [join(allowed, 'api-token.txt')] } }],
      ['dl', { download: { selector: '#dl', expect: { name: '\\.csv$', contains: 'id,name', minBytes: 5 } } }],
      ['dlbad', { download: { selector: '#dl', expect: { contains: 'zzz-not-there' } } }],
    ])], { uploadRoots: [allowed] });
    assert.equal(byCase(r, 'up')[0].result, 'PASS'); assert.match(byCase(r, 'up')[0].detail, /invoice\.txt.*verified/);
    assert.equal(byCase(r, 'outside')[0].result, 'BLOCKED');
    assert.equal(byCase(r, 'cred')[0].result, 'BLOCKED');
    assert.equal(byCase(r, 'dl')[0].result, 'PASS', byCase(r, 'dl')[0].detail); assert.match(byCase(r, 'dl')[0].detail, /orders\.csv.*sha256/);
    assert.equal(byCase(r, 'dlbad')[0].result, 'FAIL');
    assert.ok(r.evidence.downloads.some((d: any) => d.file && existsSync(d.file) && d.bytes > 0));
  } finally { rmSync(outside, { force: true }); }
});

test('M39-13. runtime signals: exceptions with source location, console errors, 5xx and failed requests', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/errors` }, { wait: 600 }]);
  assert.ok(r.evidence.page_errors.some((e: string) => /boom-m39 .*:\d+\)$/.test(e)), JSON.stringify(r.evidence.page_errors));
  assert.ok(r.evidence.console_errors.some((e: string) => /console-m39/.test(e)));
  assert.ok(r.evidence.network_failures.some((n: any) => n.status === 500));
  assert.ok(r.evidence.network_failures.some((n: any) => n.kind === 'failed' && /net::ERR_/.test(n.error)));
});

test('M39-14. screenshots (element clip), responsive viewport verified by the page, NOT_FOUND assertions fail', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/states` }, { screenshot: { name: 'ok-button', selector: '#ok' } }, { viewport: { width: 390, height: 844 } }, { assertVisible: { selector: '#definitely-missing' }, timeoutMs: 400 }, { goto: `${A}/responsive` }, { viewport: { width: 390, height: 844 } }]);
  assert.equal(r.evidence.steps[1].result, 'PASS'); assert.ok(existsSync(r.evidence.screenshots[0]));
  assert.equal(r.evidence.steps[2].result, 'PASS');
  assert.ok(r.evidence.steps[2].detail.includes('lays out at 980px (no responsive <meta name="viewport">'), r.evidence.steps[2].detail);   // fixture page without meta viewport: a real responsive finding
  assert.ok(r.evidence.responsive.some((x: any) => x.layout_width === 980 && !x.has_meta_viewport));
  assert.match(r.evidence.steps[5].detail, /page layout 390x/);   // with a meta viewport the page lays out at device width
  assert.equal(r.evidence.steps[3].result, 'FAIL');
  assert.equal(r.evidence.steps[3].element_state, 'NOT_FOUND');
});

test('M39-15. test runs: a case containing a BLOCKED step is BLOCKED, never PASS (regression)', () => {
  const plan = { name: 'x', target: 'http://x.test', cases: [{ id: 'C1', title: 'blocked inside', steps: [{ goto: 'http://x.test' }, { click: { text: 'a', frame: 'nope' } }, { assertText: 'x' }] }] };
  const run = { result: 'BLOCKED', evidence: { steps: [{ n: 2, op: 'goto', case: 'C1', result: 'PASS', detail: '' }, { n: 3, op: 'click', case: 'C1', result: 'BLOCKED', detail: 'frame not found' }, { n: 4, op: 'assertText', case: 'C1', result: 'SKIPPED', detail: '' }], cases: [{ id: 'C1' }] } };
  const tr = buildTestRun(plan, run);
  assert.equal(tr.cases[0].result, 'BLOCKED');
  assert.equal(tr.totals.PASS, 0);
});

test('M39-16. regression (staging): obstruction hit-test is correct on SCROLLED pages; desktop viewport restore is verified', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/long` }, ...cases([
    ['far', { assertState: { selector: '#far', state: 'INTERACTABLE' } }, { click: { selector: '#far' } }, { assertTitle: 'far-clicked' }],
    ['farcov', { assertState: { selector: '#farcov', state: 'VISIBLE_BUT_OBSTRUCTED' } }],
    ['viewport', { viewport: { width: 390, height: 844 } }, { viewport: { width: 1366, height: 900, mobile: false } }],
  ])]);
  for (const id of ['far', 'farcov', 'viewport']) assert.ok(byCase(r, id).every((s: any) => s.result === 'PASS'), `${id}: ${JSON.stringify(byCase(r, id))}`);
});

test('M39-17. regression (staging): a transient "moving" state is waited out, not reported as final; details are never over-redacted', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/anim` }, { click: { selector: '#go' } }, { assertState: { selector: '#mv', state: 'INTERACTABLE' } }, { click: { text: 'No such secret token' }, timeoutMs: 400 }]);
  assert.equal(r.evidence.steps[2].result, 'PASS', r.evidence.steps[2].detail);
  assert.match(r.evidence.steps[3].detail, /NOT_FOUND/, 'the element state must stay readable even when the locator mentions "token"');
});
