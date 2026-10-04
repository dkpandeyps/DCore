// M45 — advanced web application coverage, against a LOCAL fixture app (a tiny WebSocket server is built in, so no
// dependency is needed). Capabilities already covered by M39 / M42 (iframes, nested iframes, shadow DOM, tabs, upload,
// download, SPA / history, session expiry) keep their own tests; this file covers the gaps: drag and drop (native
// HTML5 + pointer), touch tap / long press / swipe, breakpoint sweeps, infinite scroll and virtualised lists, sticky
// headers, stacked modals, prompt dialogs, custom and native date / time pickers, WebSocket and SSE observation,
// authentication redirects with return-to, and popup windows.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { browse, findBrowser } from '../../skills/dcore/scripts/exec/browse.mjs';
import { runScenarios } from '../../skills/dcore/scripts/exec/scenario.mjs';

const SKIP = findBrowser() ? false : 'no Chromium-family browser';
let A = ''; let srv: Server; let OUT = '';
const page = (t: string, b: string, meta = true) => `<!doctype html><html lang="en"><head><meta charset="utf-8">${meta ? '<meta name="viewport" content="width=device-width, initial-scale=1">' : ''}<title>${t}</title><style>body{font:14px Arial;margin:0}</style></head><body>${b}</body></html>`;

// minimal RFC 6455 text-frame server: echo client messages, then push two ticks
function wsFrame(text: string) { const p = Buffer.from(text); return Buffer.concat([Buffer.from([0x81, p.length]), p]); }
function wsRead(buf: Buffer) { const len = buf[1] & 0x7f; const mask = buf.subarray(2, 6); const data = buf.subarray(6, 6 + len); return Buffer.from(data.map((b, i) => b ^ mask[i % 4])).toString(); }

const PAGES: Record<string, string> = {
  '/dnd-native': page('DnD', `<div id="src" draggable="true" style="width:120px;height:60px;background:#cde">Card A</div><div id="dst" style="width:200px;height:120px;margin-top:80px;border:2px dashed #888">Drop here</div><p id="out">none</p>
<script>const s=document.getElementById('src'),d=document.getElementById('dst');s.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain','card-a'));d.addEventListener('dragover',e=>e.preventDefault());d.addEventListener('drop',e=>{e.preventDefault();document.getElementById('out').textContent='dropped:'+e.dataTransfer.getData('text/plain');});</script>`),
  '/dnd-pointer': page('Slider', `<div id="track" style="position:relative;width:400px;height:40px;background:#eee;margin:40px"><div id="knob" style="position:absolute;left:0;top:0;width:40px;height:40px;background:#468;touch-action:none"></div></div><p id="pos">0</p>
<script>const k=document.getElementById('knob');let sx=null,start=0;k.addEventListener('pointerdown',e=>{sx=e.clientX;start=k.offsetLeft;k.setPointerCapture(e.pointerId);});k.addEventListener('pointermove',e=>{if(sx===null)return;const x=Math.max(0,Math.min(360,start+e.clientX-sx));k.style.left=x+'px';document.getElementById('pos').textContent=String(Math.round(x));});k.addEventListener('pointerup',()=>{sx=null;});</script>`),
  '/touch': page('Touch', `<button id="tap" style="width:160px;height:60px">Tap me</button><p id="t">none</p><div id="carousel" style="width:300px;height:150px;background:#dfe;margin-top:30px">Slide 1</div><p id="sw">none</p>
<script>let ts=0,touched=false;const b=document.getElementById('tap');b.addEventListener('touchstart',()=>{touched=true;ts=Date.now();});b.addEventListener('touchend',()=>{if(Date.now()-ts>600)document.getElementById('t').textContent='long press';});b.addEventListener('click',()=>{if(document.getElementById('t').textContent!=='long press')document.getElementById('t').textContent=touched?'tapped (touch)':'clicked (mouse)';});
const c=document.getElementById('carousel');let x0=null;c.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;});c.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-x0;if(dx<-50){c.textContent='Slide 2';document.getElementById('sw').textContent='swiped left';}});</script>`),
  '/responsive': page('Responsive', `<style>#burger{display:none}@media (max-width:767px){#desktop-nav{display:none}#burger{display:block}}</style><nav id="desktop-nav">Home · Products · Contact</nav><button id="burger">Menu</button><main><h1>Responsive</h1><p>Fluid content.</p></main>`),
  '/responsive-bad': page('Fixed width', `<h1>Fixed</h1><table style="width:900px"><tr><td>wide table</td></tr></table>`, false),
  '/infinite': page('Feed', `<h1>Feed</h1><ul id="feed"></ul><script>let n=0;const load=()=>{if(n>=100)return;fetch('/api/feed?from='+n).then(r=>r.json()).then(items=>{for(const t of items){const li=document.createElement('li');li.textContent=t;li.style.height='60px';document.getElementById('feed').appendChild(li);}n+=items.length;});};load();addEventListener('scroll',()=>{if(innerHeight+scrollY>=document.body.scrollHeight-200)load();});</script>`),
  '/virtual': page('Virtual', `<h1>Virtual list</h1><div id="vp" style="height:300px;overflow-y:auto;position:relative;border:1px solid #999"><div id="spacer" style="height:300000px"></div></div>
<script>const vp=document.getElementById('vp'),sp=document.getElementById('spacer');const H=30;const render=()=>{for(const r of [...sp.querySelectorAll('.row')])r.remove();const first=Math.floor(vp.scrollTop/H);for(let i=first;i<Math.min(10000,first+12);i++){const d=document.createElement('div');d.className='row';d.textContent='Row '+i;d.style.cssText='position:absolute;top:'+(i*H)+'px;height:'+H+'px';sp.appendChild(d);}};vp.addEventListener('scroll',render);render();</script>`),
  '/sticky': page('Sticky', `<header style="position:sticky;top:0;height:90px;background:#234;color:#fff;z-index:10">Sticky header</header><div style="height:1500px">filler</div><button id="deep" onclick="document.getElementById('r').textContent='deep clicked'">Deep button</button><p id="r">none</p><div style="height:1500px"></div>`),
  '/modals': page('Modals', `<button id="openA" onclick="document.getElementById('a').style.display='block'">Open A</button>
<div id="a" role="dialog" aria-modal="true" style="display:none;position:fixed;inset:60px;background:#fff;border:1px solid;z-index:100"><h2>Dialog A</h2><button id="openB" onclick="document.getElementById('b').style.display='block'">Open B</button></div>
<div id="b" role="dialog" aria-modal="true" style="display:none;position:fixed;inset:120px;background:#ffd;border:1px solid;z-index:200"><h2>Dialog B</h2></div>
<script>addEventListener('keydown',e=>{if(e.key!=='Escape')return;const b=document.getElementById('b');if(b.style.display==='block')b.style.display='none';else document.getElementById('a').style.display='none';});</script>`),
  '/prompt': page('Prompt', `<button id="ask" onclick="const n=prompt('Your name?');document.getElementById('hi').textContent=n===null?'cancelled':'Hello '+n">Ask</button><p id="hi">none</p>`),
  '/dates': page('Dates', `<label>Start <input id="pick" readonly placeholder="Pick a date"></label><div id="cal" style="display:none"></div><label>Time <input id="tm" type="time"></label><label>When <input id="dt" type="datetime-local"></label><label>Month <input id="mo" type="month"></label><label>Week <input id="wk" type="week"></label>
<script>const p=document.getElementById('pick'),c=document.getElementById('cal');p.addEventListener('click',()=>{c.innerHTML='';for(let d=1;d<=31;d++){const b=document.createElement('button');b.textContent=String(d);b.className='day';b.onclick=()=>{p.value='2026-10-'+String(d).padStart(2,'0');c.style.display='none';};c.appendChild(b);}c.style.display='block';});</script>`),
  '/ws': page('Live', `<h1>Live</h1><p id="log"></p><script>const w=new WebSocket('ws://'+location.host+'/socket');w.onopen=()=>w.send('hello');w.onmessage=e=>{document.getElementById('log').textContent+=e.data+' ';};</script>`),
  '/sse': page('Stream', `<h1>Stream</h1><p id="log"></p><script>const s=new EventSource('/events');s.addEventListener('update',e=>{document.getElementById('log').textContent+=e.data+' ';});</script>`),
  '/popup': page('Opener', `<button id="pop" onclick="window.open('/popup-child','child','width=420,height=320')">Open popup</button>`),
  '/popup-child': page('Child', `<h1>Popup window</h1>`),
};

before(async () => {
  OUT = mkdtempSync(join(tmpdir(), 'dcore-m45-'));
  srv = createServer((req: any, res: any) => {
    const u = req.url.split('?')[0]; const q = new URL(req.url, 'http://x').searchParams;
    const authed = /sid=ok/.test(req.headers.cookie ?? '');
    if (PAGES[u]) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGES[u]); }
    if (u === '/api/feed') { const from = Number(q.get('from')); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(Array.from({ length: 20 }, (_, i) => `Item ${from + i}`))); }
    if (u === '/events') { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }); let i = 0; const t = setInterval(() => { res.write(`event: update\ndata: price ${++i}\n\n`); if (i >= 3) { clearInterval(t); res.end(); } }, 150); return; }
    if (u === '/basic') { const ok = req.headers.authorization === `Basic ${Buffer.from('qa-user:M45-basic-secret').toString('base64')}`; if (!ok) { res.writeHead(401, { 'www-authenticate': 'Basic realm="m45"' }); return res.end('denied'); } res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page('Basic', '<h1>Basic area</h1>')); }
    // auth redirect with return-to
    if (u === '/secure') { if (!authed) { res.writeHead(302, { location: '/login?next=/secure' }); return res.end(); } res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page('Secure', '<h1>Secure area</h1>')); }
    if (u === '/login') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page('Login', `<h1>Sign in</h1><form method="post" action="/session?next=${encodeURIComponent(q.get('next') ?? '/')}"><input id="u" name="u"><input id="pw" name="p" type="password"><button id="go">Sign in</button></form>`)); }
    if (u === '/session' && req.method === 'POST') { res.writeHead(302, { location: q.get('next') ?? '/', 'set-cookie': 'sid=ok; Path=/' }); return res.end(); }
    res.writeHead(404); res.end();
  });
  srv.on('upgrade', (req: any, sock: any) => {
    const key = req.headers['sec-websocket-key'];
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')}\r\n\r\n`);
    sock.on('data', (b: Buffer) => { if ((b[0] & 0x0f) === 1) { sock.write(wsFrame(`echo:${wsRead(b)}`)); setTimeout(() => { sock.write(wsFrame('tick 1')); sock.write(wsFrame('tick 2')); }, 100); } });
    sock.on('error', () => {});
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => { A = `http://127.0.0.1:${(srv.address() as any).port}`; ok(); }));
});
after(() => { srv?.close(); if (OUT) rmSync(OUT, { recursive: true, force: true }); });

const run = (steps: any[], name: string) => browse(steps, { outDir: join(OUT, name), stepTimeoutMs: 5000, settleMs: 1500 });
const results = (r: any) => r.evidence.steps.map((s: any) => s.result);
const detail = (r: any, n: number) => r.evidence.steps[n - 1].detail;

test('M45-1. drag and drop: native HTML5 drag (intercepted + dispatched) and pointer drag both verified by their outcome', { skip: SKIP }, async () => {
  const n = await run([{ goto: `${A}/dnd-native` }, { drag: { from: { selector: '#src' }, to: { selector: '#dst' } } }, { assertText: 'dropped:card-a' }], 'dnd1');
  assert.deepEqual(results(n), ['PASS', 'PASS', 'PASS'], JSON.stringify(n.evidence.steps));
  assert.match(detail(n, 2), /native HTML5 drag-and-drop/);
  const p = await run([{ goto: `${A}/dnd-pointer` }, { drag: { from: { selector: '#knob' }, by: { x: 200, y: 0 } } }, { evaluate: { expression: 'Number(document.getElementById("pos").textContent) >= 190', expect: true } }], 'dnd2');
  assert.deepEqual(results(p), ['PASS', 'PASS', 'PASS'], JSON.stringify(p.evidence.steps));
  assert.match(detail(p, 2), /pointer drag/);
  const miss = await run([{ goto: `${A}/dnd-native` }, { drag: { from: { selector: '#nope' }, to: { selector: '#dst' } }, timeoutMs: 800 }], 'dnd3');
  assert.equal(miss.evidence.steps[1].result, 'FAIL'); assert.match(detail(miss, 2), /NOT_FOUND/);
});

test('M45-2. touch: tap fires touch + click, long press is held, swipe drives touch handlers', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/touch` }, { tap: { selector: '#tap' } }, { assertText: 'tapped (touch)' }, { tap: { selector: '#tap', holdMs: 900 } }, { assertText: 'long press' }, { swipe: { selector: '#carousel', direction: 'left', distance: 200 } }, { assertText: 'swiped left' }, { assertText: 'Slide 2' }], 'touch');
  assert.deepEqual(results(r), ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'], JSON.stringify(r.evidence.steps));
});

test('M45-3. breakpoint sweep: responsive page passes with per-breakpoint visibility; fixed-width page fails with the reason', { skip: SKIP }, async () => {
  const good = await run([{ goto: `${A}/responsive` }, { breakpoints: { widths: [320, 768, 1280], visible: [{ selector: '#burger', at: { max: 767 } }, { selector: '#desktop-nav', at: { min: 768 } }], hidden: [{ selector: '#burger', at: { min: 768 } }, { selector: '#desktop-nav', at: { max: 767 } }] } }, { evaluate: { expression: 'innerWidth', expect: 1366 } }], 'bp1');
  assert.deepEqual(results(good), ['PASS', 'PASS', 'PASS'], JSON.stringify(good.evidence.steps));
  assert.equal(good.evidence.breakpoints.length, 3); assert.ok(good.evidence.breakpoints.every((b: any) => b.screenshot));
  const bad = await run([{ goto: `${A}/responsive-bad` }, { breakpoints: { widths: [375, 1280] } }], 'bp2');
  assert.equal(bad.evidence.steps[1].result, 'FAIL');
  assert.match(detail(bad, 2), /375px: .*no <meta name="viewport">/); assert.match(detail(bad, 2), /1280px: ok/);
});

test('M45-4. lazy content: infinite scroll loads until the target appears; virtualised list scrolls its container; end of content FAILS', { skip: SKIP }, async () => {
  const inf = await run([{ goto: `${A}/infinite` }, { scrollUntil: { text: 'Item 87', maxScrolls: 60 } }, { assertVisible: { text: 'Item 87' } }], 'inf');
  assert.deepEqual(results(inf), ['PASS', 'PASS', 'PASS'], JSON.stringify(inf.evidence.steps));
  const vir = await run([{ goto: `${A}/virtual` }, { evaluate: { expression: 'document.querySelectorAll(".row").length < 20 && !document.body.innerText.includes("Row 120")', expect: true } }, { scrollUntil: { text: 'Row 120', exact: true, container: '#vp', maxScrolls: 40 } }, { assertVisible: { text: 'Row 120', exact: true } }], 'vir');
  assert.deepEqual(results(vir), ['PASS', 'PASS', 'PASS', 'PASS'], JSON.stringify(vir.evidence.steps));
  const end = await run([{ goto: `${A}/infinite` }, { scrollUntil: { text: 'Item 4000', maxScrolls: 80 } }], 'end');
  assert.equal(end.evidence.steps[1].result, 'FAIL'); assert.match(detail(end, 2), /stopped scrolling|not found after/);
});

test('M45-5. sticky header does not swallow clicks; stacked modals: the top one is known, Escape closes it first', { skip: SKIP }, async () => {
  const st = await run([{ goto: `${A}/sticky` }, { click: { selector: '#deep' } }, { assertText: 'deep clicked' }], 'sticky');
  assert.deepEqual(results(st), ['PASS', 'PASS', 'PASS'], JSON.stringify(st.evidence.steps));
  const md = await run([{ goto: `${A}/modals` }, { click: { selector: '#openA' } }, { click: { selector: '#openB' } }, { assertModal: { top: true, title: 'Dialog B' } }, { press: 'Escape' }, { assertModal: { top: true, title: 'Dialog A' } }, { assertModal: { title: 'Dialog B', open: false } }], 'modals');
  assert.deepEqual(results(md), ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'], JSON.stringify(md.evidence.steps));
  const wrong = await run([{ goto: `${A}/modals` }, { click: { selector: '#openA' } }, { click: { selector: '#openB' } }, { assertModal: { top: true, title: 'Dialog A' } }], 'modals2');
  assert.equal(wrong.evidence.steps[3].result, 'FAIL', 'A is open but not on top');
});

test('M45-6. popups: prompt answered with text; popup window tracked, switched to and closed', { skip: SKIP }, async () => {
  const pr = await run([{ goto: `${A}/prompt` }, { dialog: { accept: true, promptText: 'Ada' } }, { click: { selector: '#ask' } }, { assertText: 'Hello Ada' }, { dialog: 'dismiss' }, { click: { selector: '#ask' } }, { assertText: 'cancelled' }], 'prompt');
  assert.deepEqual(results(pr), ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'], JSON.stringify(pr.evidence.steps));
  assert.ok(pr.evidence.dialogs.some((d: any) => d.type === 'prompt' && d.message === 'Your name?'));
  const pw = await run([{ goto: `${A}/popup` }, { click: { selector: '#pop' } }, { switchTab: { url: '/popup-child' } }, { assertText: 'Popup window' }, { closeTab: true }, { assertUrl: '/popup' }], 'popup');
  assert.deepEqual(results(pw), ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'], JSON.stringify(pw.evidence.steps));
});

test('M45-7. date / time pickers: custom (read-only input + calendar) by composition; native time / datetime-local / month / week', { skip: SKIP }, async () => {
  const r = await run([{ goto: `${A}/dates` }, { click: { selector: '#pick' } }, { click: { text: '15', role: 'button' } }, { assertValue: { selector: '#pick', equals: '2026-10-15' } },
    { fill: { selector: '#tm', value: '14:30' } }, { fill: { selector: '#dt', value: '2026-10-03T09:15' } }, { fill: { selector: '#mo', value: '2026-10' } }, { fill: { selector: '#wk', value: '2026-W40' } }], 'dates');
  assert.deepEqual(results(r), ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'], JSON.stringify(r.evidence.steps));
  const typed = await run([{ goto: `${A}/dates` }, { fill: { selector: '#pick', value: '2026-10-15' }, timeoutMs: 800 }], 'dates2');
  assert.equal(typed.evidence.steps[1].result, 'FAIL', 'a read-only picker is not typed into'); assert.match(detail(typed, 2), /not an editable field/);
});

test('M45-8. WebSocket and SSE are observed passively (frames / messages), with expectations that can fail', { skip: SKIP }, async () => {
  const ws = await run([{ goto: `${A}/ws` }, { assertSocket: { url: '/socket', contains: 'echo:hello', minSent: 1 } }, { assertSocket: { url: '/socket', minReceived: 3 } }, { assertSocket: { url: '/socket', contains: 'never-sent' }, timeoutMs: 800 }], 'ws');
  assert.deepEqual(results(ws), ['PASS', 'PASS', 'PASS', 'FAIL'], JSON.stringify(ws.evidence.steps));
  const w = ws.evidence.websockets[0]; assert.equal(w.sent, 1); assert.ok(w.received >= 3); assert.ok(w.last_received.includes('echo:hello'));
  const sse = await run([{ goto: `${A}/sse` }, { assertSocket: { kind: 'sse', url: '/events', minReceived: 3, contains: 'price 3' } }], 'sse');
  assert.deepEqual(results(sse), ['PASS', 'PASS'], JSON.stringify(sse.evidence.steps));
  assert.deepEqual(sse.evidence.event_streams[0].events, ['update']);
});

test('M45-9. authentication redirect with return-to, then session expiry and restore (scenario engine)', { skip: SKIP }, async () => {
  const r = await browse([{ goto: `${A}/secure` }, { assertUrl: '/login' }, { fill: { selector: '#u', value: 'qa' } }, { click: { selector: '#go' } }, { waitFor: { url: '/secure' } }, { assertText: 'Secure area' }], { outDir: join(OUT, 'auth'), stepTimeoutMs: 5000, settleMs: 1500 });
  assert.deepEqual(results(r), ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'], JSON.stringify(r.evidence.steps));
  assert.ok(r.evidence.redirects.some((x: any) => x.status === 302 && /\/secure$/.test(x.from) && /\/login/.test(x.to)), JSON.stringify(r.evidence.redirects));
  assert.ok(r.evidence.redirects.some((x: any) => /\/session/.test(x.from) && /\/secure$/.test(x.to)), 'return-to redirect after login recorded');
  const doc = { setup: [{ action: 'goto', target: `${A}/login?next=/secure` }, { action: 'fill', target: { selector: '#u' }, input: 'qa' }, { action: 'click', target: { selector: '#go' }, expect: { url: '/secure' } }], scenarios: [
    { id: 'S1', title: 'expired session goes to login', steps: [{ action: 'goto', target: `${A}/secure`, expect: { text: 'Secure area' } }, { action: 'session', input: 'expire' }, { action: 'reload', expect: { url: '/login' } }] },
    { id: 'S2', title: 'session restored afterwards', steps: [{ action: 'goto', target: `${A}/secure`, expect: { text: 'Secure area' } }] },
  ] };
  const sr = await runScenarios(doc, { outDir: join(OUT, 'auth-sc'), stepTimeoutMs: 5000 });
  assert.deepEqual(sr.scenarios.map((s: any) => s.status), ['PASS', 'PASS'], JSON.stringify(sr.scenarios.map((s: any) => s.actual)));
});

test('M45-10. HTTP Basic authentication: answered from env vars for the configured origin only; values never recorded; missing env BLOCKS', { skip: SKIP }, async () => {
  process.env.M45_BASIC_USER = 'qa-user'; process.env.M45_BASIC_PASS = 'M45-basic-secret';
  try {
    const ok = await run([{ httpAuth: { userEnv: 'M45_BASIC_USER', passEnv: 'M45_BASIC_PASS', origin: A } }, { goto: `${A}/basic` }, { assertText: 'Basic area' }], 'basic1');
    assert.deepEqual(results(ok), ['PASS', 'PASS', 'PASS'], JSON.stringify(ok.evidence.steps));
    assert.ok(ok.evidence.auth_challenges.some((c: any) => c.scheme === 'basic' && c.answered));
    assert.ok(!JSON.stringify(ok).includes('M45-basic-secret'));
    const other = await run([{ httpAuth: { userEnv: 'M45_BASIC_USER', passEnv: 'M45_BASIC_PASS', origin: 'https://elsewhere.example.test' } }, { goto: `${A}/basic` }, { assertText: 'Basic area' }], 'basic2');
    assert.notEqual(other.evidence.steps.at(-1).result, 'PASS', 'credentials are not sent to another origin');
    assert.ok(other.evidence.auth_challenges.every((c: any) => !c.answered));
    const none = await run([{ httpAuth: { userEnv: 'M45_UNSET_USER', passEnv: 'M45_BASIC_PASS' } }], 'basic3');
    assert.equal(none.evidence.steps[0].result, 'BLOCKED');
  } finally { delete process.env.M45_BASIC_USER; delete process.env.M45_BASIC_PASS; }
});

test('M45-11. regression (real site): WebSocket URLs keep their host in the evidence', { skip: SKIP }, async () => {
  const ws = await run([{ goto: `${A}/ws` }, { assertSocket: { url: `${A.replace('http', 'ws')}/socket`, minReceived: 1 } }], 'wsurl');
  assert.deepEqual(results(ws), ['PASS', 'PASS'], JSON.stringify(ws.evidence.steps));
  assert.equal(ws.evidence.websockets[0].url, `${A.replace('http', 'ws')}/socket`);
});
