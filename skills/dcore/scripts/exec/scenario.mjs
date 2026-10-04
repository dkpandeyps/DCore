// dcore scenario engine (M40) — functional testing as executable scenarios, not a list of browser commands.
// A scenario document (dcore.scenarios/1) holds scenarios with ID, title, feature, type, priority, preconditions, test
// data, steps and an expected result. Each step = { id, action, target, input, expect (or assert), timeoutMs, evidence }.
// Steps execute through the existing modules — browser actions via dcore-browse (one shared session), `api` via
// dcore-api, `run` via dcore-run, `verify` via dcore-verify — and every executed step yields an evidence record
// (run ID, scenario ID, step ID, action, target, expected, actual, status, timestamp, URL, screenshot, console errors,
// network failures). PASS is never inferred from the absence of an error: a step's expectations must be verified, and
// a scenario is PASS only if at least one expected outcome was verified and nothing failed or was blocked.
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { type as osType, release as osRelease, arch as osArch } from 'node:os';
import { startBrowser, browserInventory } from './browse.mjs';
import { apiRequest } from './api.mjs';
import { runCommand } from './run.mjs';
import { redactDeep, redact, parseApprovals, GATES } from './evidence.mjs';
import { defectCandidate, isViolation } from './negative.mjs';

export const STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'NOT_TESTED', 'NOT_APPLICABLE'];
export const TEST_TYPES = ['Functional', 'Negative', 'Validation', 'Boundary', 'Regression', 'Smoke', 'Integration', 'Authentication', 'Authorization', 'Responsive', 'Accessibility', 'Error handling'];
export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
const BROWSER_ACTIONS = ['goto', 'click', 'hover', 'fill', 'type', 'clear', 'select', 'check', 'uncheck', 'press', 'upload', 'download', 'wait', 'waitFor', 'assert', 'screenshot', 'viewport', 'back', 'forward', 'reload', 'switchTab', 'closeTab', 'inspect', 'evaluate', 'dialog', 'intercept', 'session', 'drag', 'tap', 'swipe', 'breakpoints', 'scrollUntil', 'assertSocket', 'httpAuth'];
export const ACTIONS = [...BROWSER_ACTIONS, 'api', 'run', 'verify'];
const LOC_KEYS = ['selector', 'text', 'label', 'placeholder', 'testid', 'role', 'exact', 'index', 'first', 'frame'];
// scenario type -> defect-severity family used by the report layer
export const TYPE_FAMILY = { Functional: 'positive', Regression: 'positive', Smoke: 'positive', Integration: 'positive', Negative: 'negative', Validation: 'negative', Boundary: 'boundary', 'Error handling': 'error', Authentication: 'security', Authorization: 'security', Responsive: 'ui', Accessibility: 'accessibility' };

// ---- validation + templating ------------------------------------------------------------------------------------
export function validateScenarios(doc) {
  const errs = [];
  if (!doc || typeof doc !== 'object') return ['document is not an object'];
  if (!Array.isArray(doc.scenarios) || !doc.scenarios.length) errs.push('scenarios[] is required');
  const checkSteps = (steps, where) => {
    if (!Array.isArray(steps)) { errs.push(`${where}: steps must be an array`); return; }
    const ids = new Set();
    steps.forEach((st, i) => {
      const at = `${where} step ${st?.id ?? i + 1}`;
      if (!st || typeof st !== 'object') { errs.push(`${at}: not an object`); return; }
      if (!ACTIONS.includes(st.action)) errs.push(`${at}: unknown action "${st.action}" (allowed: ${ACTIONS.join(', ')})`);
      if (st.id && ids.has(st.id)) errs.push(`${at}: duplicate step id`); if (st.id) ids.add(st.id);
      if (st.action === 'assert' && !st.expect && !st.assert) errs.push(`${at}: assert needs "expect"`);
      if (['click', 'hover', 'fill', 'type', 'clear', 'select', 'check', 'uncheck', 'upload', 'download'].includes(st.action) && !hasLocator(st.target)) errs.push(`${at}: ${st.action} needs a target locator`);
      if (st.action === 'goto' && !(typeof st.target === 'string' || st.input?.url || typeof st.input === 'string')) errs.push(`${at}: goto needs a URL (target or input)`);
      if (st.action === 'run' && !(typeof st.input === 'string' || st.input?.command)) errs.push(`${at}: run needs input.command`);
      if (st.action === 'api' && !(st.input?.url || typeof st.target === 'string')) errs.push(`${at}: api needs input.url`);
      if (st.action === 'intercept' && st.input !== false && st.input !== null && !(st.input?.mode && (st.input?.url || st.input?.matches))) errs.push(`${at}: intercept needs input { mode, url } (or false to clear)`);
      if (st.action === 'session' && !['expire', 'restore'].includes(st.input)) errs.push(`${at}: session needs input "expire" or "restore"`);
      if (['drag', 'tap', 'swipe', 'scrollUntil'].includes(st.action) && !hasLocator(st.target)) errs.push(`${at}: ${st.action} needs a target locator`);
      if (st.action === 'drag' && !(hasLocator(st.input?.to) || st.input?.by)) errs.push(`${at}: drag needs input.to (a locator) or input.by ({x, y})`);
    });
  };
  if (doc.setup !== undefined) checkSteps(doc.setup, 'setup');
  const sids = new Set();
  (doc.scenarios ?? []).forEach((sc, i) => {
    const at = `scenario ${sc?.id ?? i + 1}`;
    if (!sc || typeof sc !== 'object') { errs.push(`${at}: not an object`); return; }
    if (!sc.id) errs.push(`${at}: id is required`); else if (sids.has(sc.id)) errs.push(`${at}: duplicate scenario id`); else sids.add(sc.id);
    if (!sc.title) errs.push(`${at}: title is required`);
    if (sc.type && !TEST_TYPES.includes(sc.type)) errs.push(`${at}: unknown type "${sc.type}" (allowed: ${TEST_TYPES.join(', ')})`);
    if (sc.priority && !PRIORITIES.includes(sc.priority)) errs.push(`${at}: priority must be one of ${PRIORITIES.join('/')}`);
    for (const g of [].concat(sc.requires_approval ?? [])) if (!GATES[g]) errs.push(`${at}: unknown approval gate "${g}" (known: ${Object.keys(GATES).join(', ')})`);
    if (sc.status && !['NOT_TESTED', 'NOT_APPLICABLE', 'SKIPPED', 'BLOCKED'].includes(sc.status)) errs.push(`${at}: declared status must be NOT_TESTED / NOT_APPLICABLE / SKIPPED / BLOCKED`);
    if (!sc.status) checkSteps(sc.steps, at);
  });
  return errs;
}
const hasLocator = (t) => !!t && typeof t === 'object' && LOC_KEYS.some((k) => t[k] !== undefined && k !== 'frame' && k !== 'exact' && k !== 'index' && k !== 'first');

// {{data.key}} / {{run.id}} / {{run.short}} / {{scenario.id}} — unknown keys are reported, never silently emptied
export function applyTemplates(value, vars, missing = new Set()) {
  if (typeof value === 'string') return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, key) => { const v = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars); if (v === undefined) { missing.add(key); return m; } return String(v); });
  if (Array.isArray(value)) return value.map((v) => applyTemplates(v, vars, missing));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, applyTemplates(v, vars, missing)]));
  return value;
}

// ---- compilation: one scenario step -> the module call(s) that execute and verify it ---------------------------
const locOf = (t) => (t && typeof t === 'object' ? Object.fromEntries(LOC_KEYS.filter((k) => t[k] !== undefined).map((k) => [k, t[k]])) : {});
const tgtText = (t) => (typeof t === 'string' ? t : Object.entries(locOf(t)).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ') || '—');

export function compileBrowserStep(st) {
  const L = locOf(st.target); const inp = st.input; const t = st.timeoutMs !== undefined ? { timeoutMs: st.timeoutMs } : {};
  const action = (() => {
    switch (st.action) {
      case 'goto': return { goto: typeof st.target === 'string' ? st.target : typeof inp === 'string' ? inp : inp.url, ...t };
      case 'click': case 'hover': case 'clear': case 'check': case 'uncheck': return { [st.action]: { ...L, ...(inp && typeof inp === 'object' ? inp : {}) }, ...t };
      case 'fill': case 'type': return { [st.action]: { ...L, ...(typeof inp === 'object' && inp !== null ? inp : { value: inp }) }, ...t };
      case 'select': return { select: { ...L, ...(typeof inp === 'object' && inp !== null ? inp : { option: inp }) }, ...t };
      case 'press': return { press: hasLocator(st.target) ? { ...L, key: typeof inp === 'object' ? inp.key : inp } : (typeof inp === 'object' ? inp.key : inp), ...t };
      case 'upload': return { upload: { ...L, files: [].concat(inp?.files ?? inp) }, ...t };
      case 'download': return { download: { ...L, expect: inp?.expect ?? st.expect?.download ?? {} }, ...t };
      case 'wait': return { wait: Number(inp ?? 500) };
      case 'waitFor': return { waitFor: { ...L, ...(typeof inp === 'object' ? inp : {}) }, ...t };
      case 'screenshot': return { screenshot: { name: inp?.name ?? st.id ?? 'shot', ...L, ...(inp?.fullPage ? { fullPage: true } : {}) } };
      case 'viewport': return { viewport: inp ?? {} };
      case 'back': case 'forward': case 'reload': case 'closeTab': return { [st.action]: true, ...t };
      case 'switchTab': return { switchTab: inp ?? { latest: true }, ...t };
      case 'inspect': return { inspect: { ...L, ...(inp ?? {}) } };
      case 'evaluate': return { evaluate: { expression: typeof inp === 'string' ? inp : inp.expression, ...(st.expect?.value !== undefined ? { expect: st.expect.value } : {}), ...(L.frame !== undefined ? { frame: L.frame } : {}) } };
      case 'dialog': return { dialog: inp };
      case 'intercept': return { intercept: inp === false || inp === null ? false : inp };
      case 'session': return { session: inp };
      case 'drag': return { drag: { from: L, ...(inp?.to ? { to: locOf(inp.to) } : {}), ...(inp?.by ? { by: inp.by } : {}), ...(inp?.steps ? { steps: inp.steps } : {}) }, ...t };
      case 'tap': case 'swipe': case 'scrollUntil': return { [st.action]: { ...L, ...(inp && typeof inp === 'object' ? inp : {}) }, ...t };
      case 'breakpoints': return { breakpoints: inp ?? {} };
      case 'assertSocket': return { assertSocket: inp ?? {}, ...t };
      case 'httpAuth': return { httpAuth: inp === false ? false : inp };
      case 'assert': return null;
      default: return null;
    }
  })();
  // expectations -> verification steps (async-safe: text/url wait up to the timeout)
  const ex = { ...(st.assert ?? {}), ...(st.expect ?? {}) };
  const checks = [];
  const tl = st.timeoutMs !== undefined ? { timeoutMs: st.timeoutMs } : {};
  for (const txt of [].concat(ex.text ?? [])) checks.push({ s: { waitFor: { text: txt, ...(L.frame !== undefined ? { frame: L.frame } : {}) }, ...tl }, label: `text "${txt}" is shown` });
  for (const txt of [].concat(ex.notification ?? [])) checks.push({ s: { waitFor: { text: txt }, ...tl }, label: `notification "${txt}" appears` });
  for (const txt of [].concat(ex.noText ?? [])) checks.push({ s: { assertNoText: { text: txt, ...(L.frame !== undefined ? { frame: L.frame } : {}) } }, label: `text "${txt}" is NOT shown` });
  if (ex.url !== undefined) checks.push({ s: { waitFor: { url: ex.url }, ...tl }, label: `URL contains "${ex.url}"` });
  if (ex.title !== undefined) checks.push({ s: { assertTitle: ex.title }, label: `title contains "${ex.title}"` });
  if (ex.modal !== undefined) checks.push({ s: { assertModal: typeof ex.modal === 'object' ? ex.modal : { open: !!ex.modal } }, label: `modal ${ex.modal === false || ex.modal?.open === false ? 'closed' : 'open'}${ex.modal?.title ? ` ("${ex.modal.title}")` : ''}` });
  const elt = hasLocator(ex.target) ? locOf(ex.target) : L;   // expectations about another element: expect.target
  if (ex.state !== undefined) checks.push({ s: { assertState: { ...elt, state: ex.state } }, label: `${tgtText(elt)} is ${ex.state}` });
  if (ex.visible === true) checks.push({ s: { assertVisible: elt, ...tl }, label: `${tgtText(elt)} is visible` });
  if (ex.hidden === true || ex.visible === false) checks.push({ s: { assertHidden: elt }, label: `${tgtText(elt)} is hidden` });
  if (ex.checked !== undefined) checks.push({ s: { assertState: { ...elt, state: ex.checked ? 'CHECKED' : 'UNCHECKED' } }, label: `${tgtText(elt)} is ${ex.checked ? 'checked' : 'unchecked'}` });
  if (ex.value !== undefined && st.action !== 'evaluate') checks.push({ s: { assertValue: { ...elt, ...(typeof ex.value === 'object' ? ex.value : { equals: ex.value }) }, ...tl }, label: `value of ${tgtText(elt)} ${typeof ex.value === 'object' ? JSON.stringify(ex.value) : `== "${ex.value}"`}` });
  if (ex.count !== undefined) checks.push({ s: { assertCount: ex.count }, label: `count of "${ex.count.selector}" ${JSON.stringify({ min: ex.count.min, max: ex.count.max, equals: ex.count.equals })}` });
  return { action, checks };
}

// human text for the expected outcome of a step
export function expectedText(st) {
  const ex = { ...(st.assert ?? {}), ...(st.expect ?? {}) };
  if (st.action === 'api') return `HTTP ${ex.status ?? '2xx/3xx'}${ex.json ? ` with ${JSON.stringify(ex.json)}` : ''}${ex.bodyContains ? ` containing "${ex.bodyContains}"` : ''}`;
  if (st.action === 'run') return `exit code ${ex.exitCode ?? 0}${ex.outputContains ? ` and output containing "${ex.outputContains}"` : ''}`;
  if (st.action === 'verify') return 'environment VERIFIED';
  const { checks } = compileBrowserStep(st);
  const exx = { ...(st.assert ?? {}), ...(st.expect ?? {}) };
  const labels = [...(st.action === 'evaluate' && exx.value !== undefined ? [`value == ${JSON.stringify(exx.value)}`] : []), ...checks.map((c) => c.label), ...(exx.noErrors ? ['no runtime errors or failed requests'] : []), ...(exx.faulted ? ['the simulated fault was triggered'] : []), ...(exx.noNewErrors ? ['no new uncaught script errors'] : []), ...(exx.noWrites ? ['no write request sent'] : []), ...(exx.writes ? [`write requests ${JSON.stringify(exx.writes)}`] : [])];
  if (labels.length) return labels.join('; ');
  if (st.action === 'evaluate' && st.expect?.value !== undefined) return `value == ${JSON.stringify(st.expect.value)}`;
  return `${st.action} performed (no outcome declared)`;
}

// a write request's identity for the load baseline: per-load random path segments (numeric server ids, session tokens —
// real case: SockJS /chat/304/soosyji1/xhr_streaming) are normalised so the same transport on a reload matches
export const writeSig = (x) => {
  let u = String(x.url ?? ''); try { const p = new URL(u); u = p.origin + p.pathname.split('/').map((seg) => (/^\d+$/.test(seg) || (/^[A-Za-z0-9_-]{6,}$/.test(seg) && /\d/.test(seg) && /[A-Za-z]/.test(seg)) ? ':x' : seg)).join('/'); } catch { /* keep as is */ }
  return `${x.method} ${u}`;
};

// ---- execution --------------------------------------------------------------------------------------------------
const now = () => new Date().toISOString();
export function newRunId(d = new Date()) { return `run-${d.toISOString().replace(/[-:]/g, '').replace(/\..*/, '')}-${randomBytes(3).toString('hex')}`; }

// doc: dcore.scenarios/1. opts: { outDir, approvals, browser, profile, headed, stepTimeoutMs, uploadRoots, runId, cwd }
export async function runScenarios(doc, opts = {}) {
  const run_id = opts.runId ?? newRunId();
  const started_at = now();
  const outDir = resolve(opts.outDir ?? join('.dcore', 'evidence', run_id));
  const errs = validateScenarios(doc);
  const approvals = parseApprovals(opts.approvals ?? []);
  const base = { schema: 'dcore.scenario-run/1', host: { os: `${osType()} ${osRelease()} (${osArch()})`, browsers: browserInventory().map(({ family, available, drivable, reason }) => ({ family, available, drivable, reason })) }, run_id, name: doc?.name ?? 'Scenario run', target: doc?.target ?? null, environment: doc?.environment ?? 'UNSPECIFIED', started_at, approvals };
  if (errs.length) return { ...base, ended_at: now(), result: 'BLOCKED', errors: errs, scenarios: [], setup: null, totals: totalsOf([]), limitations: ['invalid scenario document: nothing was executed'] };
  const secrets = [];
  let B = null; let browserError = null;
  const needsBrowser = [...(doc.setup ?? []), ...doc.scenarios.flatMap((s) => (s.status ? [] : s.steps))].some((st) => BROWSER_ACTIONS.includes(st.action));
  if (needsBrowser) {
    B = await startBrowser({ outDir, viewport: opts.viewport, browser: opts.browser, profile: opts.profile, headed: opts.headed, stepTimeoutMs: opts.stepTimeoutMs ?? 15_000, settleMs: opts.settleMs, uploadRoots: opts.uploadRoots, riskGuard: !approvals.includes('ui-write') });
    if (!B.ok) { browserError = B.reason; B = null; }
  }
  const ENGINE_CHECKS = ['noErrors', 'noNewErrors', 'noWrites', 'writes', 'faulted'];
  const exec = async (st, scenario, vars, sstate = { baseline: new Set() }) => {
    const missing = new Set();
    const s = applyTemplates(st, vars, missing);
    const rec = { run_id, scenario_id: scenario?.id ?? 'setup', step_id: String(st.id ?? ''), action: st.action, target: typeof s.target === 'string' ? s.target : tgtText(s.target), input: describeInput(s), expected: expectedText(s), actual: '', status: 'NOT_TESTED', verified: false, timestamp: now(), url: null, screenshot: null, console_errors: [], network_failures: [], checks: [], ...(st.oracle ? { oracle: true } : {}) };
    if (missing.size) return { ...rec, status: 'BLOCKED', actual: `unresolved template value(s): ${[...missing].join(', ')}` };
    if (s.input?.valueEnv && process.env[s.input.valueEnv]) secrets.push(process.env[s.input.valueEnv]);
    // ---- browser steps
    if (BROWSER_ACTIONS.includes(s.action)) {
      if (!B) return { ...rec, status: 'BLOCKED', actual: browserError ?? 'no browser session' };
      const mk = B.marks();
      const { action, checks } = compileBrowserStep(s);
      let ok = true;
      if (action) {
        const r = await B.run(action);
        // the comparison itself, not an execution error; an oracle that could not find its element ("MISSING") proves
        // nothing about the behaviour under test (real case: demoqa date input re-rendered) — it is not an expectation
        const evalCheck = s.action === 'evaluate' && s.expect?.value !== undefined && /^value /.test(r.detail ?? '') && !/^value "MISSING"/.test(r.detail ?? '');
        rec.checks.push(evalCheck ? { kind: 'expectation', label: `value == ${JSON.stringify(s.expect.value)}`, status: r.result, detail: r.detail } : { kind: 'action', status: r.result, element_state: r.element_state, detail: r.detail });
        if (['intercept', 'session'].includes(s.action)) sstate.touched = true;
        if (r.result !== 'PASS') ok = false;
        rec.status = r.result === 'SKIPPED' ? 'SKIPPED' : r.result;
        rec.actual = r.detail;
      }
      if (ok) {
        const results = [];
        for (const c of checks) { const r = await B.run(c.s); results.push(r); rec.checks.push({ kind: 'expectation', label: c.label, status: r.result, element_state: r.element_state, detail: r.detail }); if (r.result === 'BLOCKED') break; }
        if (checks.length) {
          const bad = results.find((r) => r.result !== 'PASS');
          rec.status = bad ? (bad.result === 'BLOCKED' ? 'BLOCKED' : 'FAIL') : results.length === checks.length ? 'PASS' : 'BLOCKED';
          rec.verified = !bad && results.length === checks.length;
          rec.actual = bad ? bad.detail : results.map((r) => r.detail).join('; ');
        } else if (s.action === 'evaluate' && s.expect?.value !== undefined) rec.verified = rec.status === 'PASS';
        // steps that ARE checks: their PASS is a verified outcome (waitFor a condition, a breakpoint sweep, a socket
        // expectation, a download with expectations)
        else if (rec.status === 'PASS' && (['waitFor', 'breakpoints', 'assertSocket'].includes(s.action) || (s.action === 'download' && (s.input?.expect || s.expect?.download)))) { rec.verified = true; }
        else if (action && rec.status === 'PASS' && !ENGINE_CHECKS.some((k) => ({ ...(s.assert ?? {}), ...(s.expect ?? {}) })[k])) rec.actual = `${rec.actual} (action performed; no expected outcome declared for this step)`;
        if (!action && !checks.length) { rec.status = 'NOT_TESTED'; rec.actual = 'nothing to execute'; }
      }
      // expect.noErrors: no uncaught exception, console error or failed request may occur during this step
      if (ok && ({ ...(s.assert ?? {}), ...(s.expect ?? {}) }).noErrors) {
        await new Promise((r) => setTimeout(r, 300));
        const sn = B.since(mk); const errs = [...sn.page_errors, ...sn.console_errors, ...sn.network_failures.map((n) => (n.status ? `${n.status} ${n.url}` : n.error))];
        rec.checks.push({ kind: 'expectation', label: 'no runtime errors or failed requests', status: errs.length ? 'FAIL' : 'PASS', detail: errs.length ? errs.slice(0, 5).join(' | ') : 'none observed' });
        if (errs.length) { rec.status = 'FAIL'; rec.verified = false; rec.actual = `runtime errors / failed requests observed: ${errs.slice(0, 5).join(' | ')}`; }
        else if (rec.status === 'PASS') { rec.verified = true; if (!rec.actual.includes('none observed')) rec.actual = `${rec.actual}; no runtime errors or failed requests`; }
      }
      // M42 engine checks: fault triggered, no NEW uncaught errors (beyond those already seen in this scenario), write requests
      const exM = { ...(s.assert ?? {}), ...(s.expect ?? {}) };
      if (ok && (exM.faulted || exM.noNewErrors || exM.noWrites || exM.writes)) {
        const timeoutWait = Math.max(0, ...(B.ctx.faults ?? []).filter((f) => f.mode === 'timeout').map((f) => f.delayMs + 800));
        await new Promise((r) => setTimeout(r, Math.max(exM.faulted ? 1000 : 300, exM.writes || exM.noWrites ? 1500 : 0, exM.faulted ? timeoutWait : 0)));
        const sn = B.since(mk); const post = [];
        if (exM.faulted) post.push({ label: 'the simulated fault was triggered', status: sn.faults.length ? 'PASS' : 'BLOCKED', detail: sn.faults.length ? `${sn.faults.length} request(s) answered with the simulated fault (${[...new Set(sn.faults.map((f) => `${f.mode} ${f.method} ${f.url}`))].slice(0, 3).join(' | ')})` : 'no request matched the fault rule: the fault was not exercised, so nothing is concluded' });
        if (exM.noNewErrors) { const fresh = [...new Set(sn.page_errors)].filter((e) => !sstate.baseline.has(e)); post.push({ label: 'no new uncaught script errors', status: fresh.length ? 'FAIL' : 'PASS', detail: fresh.length ? `new uncaught script error(s): ${fresh.slice(0, 3).join(' | ')}` : `no new uncaught script error${sstate.baseline.size ? ` (${sstate.baseline.size} already seen earlier in this scenario excluded)` : ''}` }); }
        // write requests the page also makes on a clean load earlier in this scenario (data fetches by POST, chat
        // transports) are the page loading, not the user's data being submitted (staging finding)
        const sig = writeSig;
        const loadWrites = sn.writes.filter((x) => sstate.baselineWrites?.has(sig(x)));
        // noWrites {containing: [values]}: only a request whose body carries the typed data counts (real case: a chat transport's
        // own xhr_send is not the form being submitted)
        const carry = Array.isArray(exM.noWrites?.containing) ? exM.noWrites.containing.filter((v) => String(v).length >= 3) : null;
        const w = sn.writes.filter((x) => !sstate.baselineWrites?.has(sig(x)) && (!carry || carry.some((v) => String(x.body ?? '').includes(String(v)) || String(x.body ?? '').includes(encodeURIComponent(String(v)))))); const wl = w.slice(0, 3).map(sig).join(' | ');
        const excl = loadWrites.length ? ` (${loadWrites.length} request(s) that a clean load of the page also makes were excluded)` : '';
        if (exM.noWrites) post.push({ label: carry ? 'the typed data was not sent' : 'no write request sent', status: w.length ? 'FAIL' : 'PASS', detail: w.length ? `${w.length} write request(s) ${carry ? 'carrying the typed data ' : ''}sent: ${wl}${excl}` : carry ? `no request carried the typed data (${sn.writes.length} other write request(s) by the page itself ignored)${excl}` : `no POST/PUT/PATCH/DELETE request sent${excl}` });
        if (exM.writes) { const { max, min, equals } = exM.writes; const good = (max === undefined || w.length <= max) && (min === undefined || w.length >= min) && (equals === undefined || w.length === equals); post.push({ label: `write requests ${JSON.stringify(exM.writes)}`, status: good ? 'PASS' : 'FAIL', detail: `${w.length} write request(s)${w.length ? `: ${wl}` : ''}` }); }
        for (const c of post) rec.checks.push({ kind: 'expectation', ...c });
        const blk = post.find((c) => c.status === 'BLOCKED'); const bad = post.filter((c) => c.status === 'FAIL');
        if (blk) { rec.status = 'BLOCKED'; rec.verified = false; rec.actual = blk.detail; }
        else if (bad.length) { rec.actual = rec.status === 'FAIL' ? `${rec.actual}; ${bad.map((c) => c.detail).join('; ')}` : bad.map((c) => c.detail).join('; '); rec.status = 'FAIL'; rec.verified = false; }
        else if (rec.status === 'PASS') { rec.verified = true; rec.actual = `${rec.actual}; ${post.map((c) => c.detail).join('; ')}`; }
      }
      for (const e of B.since(mk).page_errors) sstate.baseline.add(e);
      // writes made by a page LOAD (goto / reload / back with no form submission) form the baseline for later write checks
      if (['goto', 'reload', 'back', 'forward'].includes(s.action) && !(exM.noWrites || exM.writes)) { sstate.baselineWrites ??= new Set(); for (const x of B.since(mk).writes ?? []) sstate.baselineWrites.add(writeSig(x)); }
      const loc = await B.location(); rec.url = loc.url ?? null;
      const want = s.evidence ?? 'on-failure';
      if (want === 'screenshot' || want === 'always' || (want !== 'none' && ['FAIL', 'BLOCKED'].includes(rec.status))) rec.screenshot = await B.screenshot(`${rec.scenario_id}-${rec.step_id || 'step'}`);
      const since = B.since(mk); rec.console_errors = [...since.console_errors, ...since.page_errors]; rec.network_failures = since.network_failures;
      return rec;
    }
    // ---- api (dcore-api)
    if (s.action === 'api') {
      const spec = { ...(typeof s.input === 'object' ? s.input : {}), url: s.input?.url ?? s.target, expect: { ...(s.input?.expect ?? {}), ...(s.expect ?? {}), ...(s.assert ?? {}) }, ...(s.timeoutMs ? { timeoutMs: s.timeoutMs } : {}) };
      const r = await apiRequest(spec, { approvals });
      rec.url = spec.url ? redact(String(spec.url)) : null;
      rec.checks = r.checks.map((c) => ({ kind: 'expectation', label: c.title, status: c.result, detail: c.actual !== undefined ? JSON.stringify(c.actual).slice(0, 200) : c.title }));
      rec.status = r.result === 'PASS' ? 'PASS' : r.result === 'BLOCKED' ? 'BLOCKED' : r.result === 'FAIL' ? 'FAIL' : 'NOT_TESTED';
      rec.verified = rec.status === 'PASS' && r.checks.length > 0;
      rec.actual = r.result === 'BLOCKED' ? (r.limitations?.join('; ') || 'blocked') : `HTTP ${r.evidence?.status ?? '—'}; ${r.checks.map((c) => `${c.result} ${c.title}`).join('; ')}`;
      rec.module_evidence = { status: r.evidence?.status ?? null, latency: r.evidence?.latency ?? null };
      return rec;
    }
    // ---- run (dcore-run)
    if (s.action === 'run') {
      const cmd = typeof s.input === 'string' ? s.input : s.input.command;
      const r = await runCommand(cmd, { cwd: s.input?.cwd ?? opts.cwd ?? '.', approvals, timeoutMs: s.timeoutMs ?? s.input?.timeoutMs });
      const ex = { ...(s.expect ?? {}), ...(s.assert ?? {}) };
      if (r.result === 'BLOCKED') return { ...rec, status: 'BLOCKED', actual: [...(r.checks ?? []).map((c) => c.title), ...(r.limitations ?? [])].join('; ') };
      const code = r.evidence?.exit_code; const out = String(r.evidence?.output ?? '');
      const wantCode = ex.exitCode ?? 0;
      const checks = [{ label: `exit code == ${wantCode}`, ok: code === wantCode, detail: `exit code ${code}${r.evidence?.failure ? ` (${r.evidence.failure.kind})` : ''}` }];
      for (const txt of [].concat(ex.outputContains ?? [])) checks.push({ label: `output contains "${txt}"`, ok: out.includes(txt), detail: out.includes(txt) ? 'found' : 'not found' });
      if (ex.testsFailed !== undefined) { const tc = r.evidence?.test_counts; checks.push({ label: `failing tests == ${ex.testsFailed}`, ok: !!tc && tc.fail === ex.testsFailed, detail: tc ? `${tc.fail} failing of ${tc.tests ?? '?'}` : 'no test counts printed' }); }
      rec.checks = checks.map((c) => ({ kind: 'expectation', label: c.label, status: c.ok ? 'PASS' : 'FAIL', detail: c.detail }));
      rec.status = checks.every((c) => c.ok) ? 'PASS' : 'FAIL'; rec.verified = rec.status === 'PASS';
      rec.actual = checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'} ${c.label}: ${c.detail}`).join('; ');
      rec.module_evidence = { exit_code: code, duration_ms: r.evidence?.duration_ms, output_tail: out.slice(-1200) };
      return rec;
    }
    // ---- verify (dcore-verify)
    if (s.action === 'verify') {
      const { verifyDeployment } = await import('./verify.mjs');
      const r = await verifyDeployment({ url: s.input?.url ?? s.target, health: s.input?.health, expectText: s.input?.expectText ?? s.expect?.text, maxMs: s.input?.maxMs, browse: !!s.input?.browse }, { outDir });
      rec.url = s.input?.url ?? s.target;
      rec.checks = r.checks.map((c) => ({ kind: 'expectation', label: c.title, status: c.result, detail: c.title }));
      rec.status = r.verdict === 'VERIFIED' ? 'PASS' : r.verdict === 'FAILED' ? 'FAIL' : 'BLOCKED'; rec.verified = rec.status === 'PASS';
      rec.actual = `${r.verdict}: ${r.checks.map((c) => `${c.result} ${c.title}`).join('; ')}`;
      return rec;
    }
    return { ...rec, status: 'BLOCKED', actual: `unsupported action ${s.action}` };
  };

  const runVars = { run: { id: run_id, short: run_id.slice(-6) } };
  const vars = { data: applyTemplates(doc.data ?? {}, runVars), ...runVars };   // data values may themselves use {{run.*}}
  // setup (e.g. login): a failure blocks every scenario
  const setup = { steps: [], status: 'NOT_APPLICABLE' };
  if (doc.setup?.length) {
    for (const st of doc.setup) {
      if (setup.status === 'FAIL' || setup.status === 'BLOCKED') { setup.steps.push({ run_id, scenario_id: 'setup', step_id: String(st.id ?? ''), action: st.action, status: 'SKIPPED', actual: 'not run: an earlier setup step failed', timestamp: now() }); continue; }
      const rec = await exec(st, null, vars); setup.steps.push(rec);
      setup.status = rec.status === 'PASS' ? 'PASS' : rec.status === 'SKIPPED' ? setup.status : rec.status;
    }
    if (setup.status === 'NOT_APPLICABLE') setup.status = 'PASS';
  }
  const scenarios = []; const defect_candidates = [];
  for (const sc of doc.scenarios) {
    const head = { scenario_id: sc.id, title: sc.title, feature: sc.feature ?? 'General', ...(sc.category ? { category: sc.category } : {}), type: sc.type ?? 'Functional', priority: sc.priority ?? 'P3', preconditions: sc.preconditions ?? (doc.setup?.length ? 'Setup completed' : 'None'), data: sc.data ?? {}, expected: sc.expected ?? 'All step expectations are met.', defects: [], evidence: [] };
    if (sc.negative) { head.negative = sc.negative; head.negative_outcome = 'NOT_DETERMINED'; }
    if (sc.status) { scenarios.push({ ...head, status: sc.status, actual: `Not executed (${sc.status}): ${sc.reason ?? 'declared in the scenario document'}`, steps: (sc.steps ?? []).map((st) => ({ run_id, scenario_id: sc.id, step_id: String(st.id ?? ''), action: st.action, target: typeof st.target === 'string' ? st.target : tgtText(st.target), expected: expectedText(st), actual: 'not executed', status: sc.status, timestamp: null })) }); continue; }
    // APPROVAL_REQUIRED: a scenario that declares required approvals is not executed at all without them
    const missingGates = [].concat(sc.requires_approval ?? []).filter((g) => !approvals.includes(g));
    if (missingGates.length) { scenarios.push({ ...head, status: 'BLOCKED', approval: 'APPROVAL_REQUIRED', actual: `APPROVAL_REQUIRED: not executed — needs ${missingGates.map((g) => `--approve ${g}`).join(' ')} (${missingGates.map((g) => GATES[g]).join('; ')})`, steps: (sc.steps ?? []).map((st, i) => ({ run_id, scenario_id: sc.id, step_id: String(st.id ?? `S${i + 1}`), action: st.action, target: typeof st.target === 'string' ? st.target : tgtText(st.target), expected: expectedText(st), actual: 'not executed: approval required', status: 'BLOCKED', timestamp: null })) }); continue; }
    if (setup.status === 'FAIL' || setup.status === 'BLOCKED') { scenarios.push({ ...head, status: 'BLOCKED', actual: 'Not run: setup failed.', steps: sc.steps.map((st) => ({ run_id, scenario_id: sc.id, step_id: String(st.id ?? ''), action: st.action, target: typeof st.target === 'string' ? st.target : tgtText(st.target), expected: expectedText(st), actual: 'not run: setup failed', status: 'BLOCKED', timestamp: null })) }); continue; }
    const svars = { ...vars, data: { ...vars.data, ...applyTemplates(sc.data ?? {}, { ...vars, scenario: { id: sc.id } }) }, scenario: { id: sc.id } };
    head.data = svars.data;
    const steps = []; let stop = null; const sstate = { baseline: new Set(), touched: false };
    for (const [i, st] of sc.steps.entries()) {
      const stepWithId = { ...st, id: st.id ?? `S${i + 1}` };
      if (stop) { steps.push({ run_id, scenario_id: sc.id, step_id: stepWithId.id, action: st.action, target: typeof st.target === 'string' ? st.target : tgtText(st.target), expected: expectedText(st), actual: `not run: step ${stop} did not pass`, status: 'SKIPPED', timestamp: null }); continue; }
      const rec = await exec(stepWithId, sc, svars, sstate);
      steps.push(rec);
      if (['FAIL', 'BLOCKED'].includes(rec.status) && !st.optional) stop = rec.step_id;
    }
    if (B && sc.screenshot !== false) { const shot = await B.screenshot(`${sc.id}-end`); if (shot) head.evidence.push(shot); }
    if (B && sstate.touched) { await B.run({ intercept: false }); await B.run({ session: 'restore' }); }   // never leak a fault / expired session into the next scenario
    for (const st of steps) if (st.screenshot) head.evidence.unshift(st.screenshot);
    const failed = steps.find((x) => x.status === 'FAIL'); const blocked = steps.find((x) => x.status === 'BLOCKED');
    const verified = steps.filter((x) => x.verified);
    const status = failed ? 'FAIL' : blocked ? 'BLOCKED' : verified.length ? 'PASS' : 'NOT_TESTED';
    const actual = failed ? `Step ${failed.step_id} (${failed.action}) failed: ${failed.actual}` : blocked ? `Step ${blocked.step_id} (${blocked.action}) blocked: ${blocked.actual}` : verified.length ? `${verified.length} of ${steps.length} step(s) verified their expected outcome: ${verified.map((v) => `${v.step_id} ${v.expected}`).join('; ')}` : 'No expected outcome was verified (steps ran without declared expectations), so nothing is claimed as passed.';
    if (sc.negative) {
      head.negative = sc.negative;
      const v = status === 'FAIL' ? steps.find(isViolation) : null;
      head.negative_outcome = status === 'PASS' ? 'HELD' : v ? 'VIOLATED' : 'NOT_DETERMINED';
      if (v) { const dc = defectCandidate(sc, v, head, defect_candidates.length + 1); defect_candidates.push(dc); head.defect_candidate = dc.id; }
    }
    scenarios.push({ ...head, status, actual, steps, console_errors: [...new Set(steps.flatMap((x) => x.console_errors ?? []))], network_failures: steps.flatMap((x) => x.network_failures ?? []) });
  }
  for (const nt of doc.not_tested ?? []) scenarios.push({ scenario_id: `NT-${String(scenarios.filter((x) => x.scenario_id.startsWith('NT-')).length + 1).padStart(3, '0')}`, title: `${nt.area} (not covered)`, feature: nt.area, type: 'Functional', priority: 'P4', preconditions: '—', data: {}, expected: '—', actual: nt.reason, status: nt.status ?? 'NOT_TESTED', steps: [], defects: [], evidence: [] });
  const browserEv = B ? B.evidence() : null;
  if (B) await B.close();
  const result = { ...base, ended_at: now(), setup, scenarios, totals: totalsOf(scenarios), defect_candidates, browser: browserEv ? { browser: browserEv.browser, version: browserEv.version, viewport: browserEv.viewport, responsive: browserEv.responsive, page_errors: browserEv.page_errors, console_errors: browserEv.console_errors, network_failures: browserEv.network_failures, http_4xx: browserEv.http_4xx, redirects: browserEv.redirects, write_requests: browserEv.write_requests, simulated_faults: browserEv.simulated_faults, a11y: browserEv.a11y, perf: browserEv.perf, screenshots: browserEv.screenshots, out_dir: outDir } : null, limitations: [...(browserError ? [`browser unavailable: ${browserError}`] : []), ...(approvals.includes('ui-write') ? ['ui-write approved: state-changing controls were allowed'] : ['state-changing controls were guarded (no ui-write approval)'])] };
  return redactDeep(result, secrets);
}

function describeInput(s) {
  const i = s.input;
  if (i === undefined) return null;
  if (typeof i === 'string') return /pass|pwd|secret|token/i.test(JSON.stringify(s.target ?? '')) ? '[REDACTED]' : i;
  if (i.valueEnv) return `\${${i.valueEnv}}`;
  return JSON.stringify(i).slice(0, 200);
}
export function totalsOf(scenarios) {
  const t = Object.fromEntries(STATUSES.map((s) => [s, scenarios.filter((x) => x.status === s).length]));
  const executed = t.PASS + t.FAIL;
  const neg = scenarios.filter((x) => x.negative);
  return { scenarios: scenarios.length, executed, pass_rate_executed: executed ? Math.round((t.PASS / executed) * 1000) / 10 : null, ...t, steps: scenarios.reduce((n, s) => n + (s.steps?.length ?? 0), 0), ...(neg.length ? { negative: { scenarios: neg.length, held: neg.filter((x) => x.negative_outcome === 'HELD').length, violated: neg.filter((x) => x.negative_outcome === 'VIOLATED').length, not_determined: neg.filter((x) => x.negative_outcome === 'NOT_DETERMINED').length } } : {}) };
}

// scenario run -> dcore.testrun/1 (so the existing defect detection and the three PDF documents are reused)
export async function scenarioReports(sr, { outDir, pdf = true, browser, meta } = {}) {
  const { writeReports } = await import('./report.mjs');
  const tr = await scenarioTestRun(sr, { outDir });
  return writeReports(tr, outDir, { pdf, browser, source: sr, meta });
}
// scenario run -> dcore.testrun/1 with detected defects (shared by dcore-qa and dcore-report)
export async function scenarioTestRun(sr, { outDir } = {}) {
  const { detectDefects } = await import('./report.mjs');
  const cases = sr.scenarios.map((s) => ({
    id: s.scenario_id, area: s.feature, title: `${s.title} [${s.type}${s.priority ? `, ${s.priority}` : ''}]`, type: TYPE_FAMILY[s.type] ?? 'positive', priority: s.priority, preconditions: s.preconditions,
    steps: (s.steps ?? []).map((st) => `[${st.status}] ${st.step_id} ${st.action} ${st.target ?? ''}${st.input ? ` ← ${st.input}` : ''} — expect: ${st.expected}${st.status !== 'PASS' && st.actual ? ` — actual: ${st.actual}` : ''}`),
    expected: s.expected, actual: s.actual, result: s.status, defects: [], evidence: s.evidence ?? [],
    failure_kind: s.status === 'FAIL' ? ((s.steps ?? []).find((x) => x.status === 'FAIL')?.checks?.some((c) => c.kind === 'expectation' && c.status === 'FAIL') ? 'ASSERTION' : 'ACTION') : undefined,
    failed_op: (s.steps ?? []).find((x) => x.status === 'FAIL')?.action,
    observed: { console_errors: s.console_errors ?? [], page_errors: [], network_failures: s.network_failures ?? [] },
  }));
  const plan = { name: sr.name, target: sr.target, environment: sr.environment, setup: (sr.setup?.steps ?? []).map((x) => ({ [x.action]: x.target })), cases: sr.scenarios.map((s) => { const dc = (sr.defect_candidates ?? []).find((d) => d.id === s.defect_candidate); const sv = dc?.severity_candidate?.value; return { id: s.scenario_id, severity_on_fail: s.negative ? (sv && sv !== 'UNASSESSED' ? sv : 'unassessed') : { P1: 'critical', P2: 'high', P3: 'medium', P4: 'low' }[s.priority] }; }) };
  const defects = detectDefects(plan, cases, { evidence: { page_errors: sr.browser?.page_errors ?? [], console_errors: sr.browser?.console_errors ?? [], network_failures: sr.browser?.network_failures ?? [], a11y: sr.browser?.a11y ?? [] } });
  for (const d of defects) for (const id of d.linked_cases) { const c = cases.find((x) => x.id === id); if (c && !c.defects.includes(d.id)) c.defects.push(d.id); }
  for (const s of sr.scenarios) s.defects = cases.find((c) => c.id === s.scenario_id)?.defects ?? [];
  for (const dc of sr.defect_candidates ?? []) {   // a violated negative expectation: carry the candidate's triage fields onto the report defect
    const d = defects.find((x) => x.signature === `case:${dc.scenario.id}`); if (!d) continue;
    Object.assign(d, { title: `${dc.scenario.title} — negative expectation violated`, defect_candidate: dc.id, category: dc.defect_type_candidate.value, confidence: 'CONFIRMED (negative expectation violated; severity needs triage unless a rule applies)', expected: dc.expected, actual: dc.actual, defect_type_candidate: dc.defect_type_candidate, severity_candidate: dc.severity_candidate, priority_candidate: dc.priority_candidate });
    dc.report_defect = d.id;
  }
  const count = (r) => cases.filter((c) => c.result === r).length;
  const totals = Object.fromEntries(STATUSES.map((r) => [r, count(r)]));
  const executed = totals.PASS + totals.FAIL;
  const sev = Object.fromEntries(['critical', 'high', 'medium', 'low', 'unassessed'].map((x) => [x, defects.filter((d) => d.severity === x).length]));
  const tr = {
    schema: 'dcore.testrun/1', name: `${sr.name} (${sr.run_id})`, target: sr.target, environment: sr.environment, started_at: sr.started_at, ended_at: sr.ended_at, executed_by: 'DCore scenario engine (dcore-browse / dcore-api / dcore-run / dcore-verify)', browser: sr.browser?.browser ?? null,
    scope: [...new Set(sr.scenarios.map((s) => s.feature))], out_of_scope: [],
    setup: { steps: (sr.setup?.steps ?? []).map((x) => `${x.action} ${x.target ?? ''}`), result: sr.setup?.status ?? 'NOT_APPLICABLE', log: [] },
    totals: { cases: cases.length, executed, pass_rate_executed: executed ? Math.round((totals.PASS / executed) * 1000) / 10 : null, ...totals },
    defects_by_severity: sev, defects, cases,
    verdict: !executed ? 'NO VERDICT — nothing was verified' : sev.critical || sev.high ? 'NOT READY — high/critical defects open' : sev.unassessed ? 'NEEDS TRIAGE — defect candidates await a severity assessment' : totals.FAIL || sev.medium ? 'READY WITH RISKS — medium defects or failed scenarios open' : totals.BLOCKED ? 'INCOMPLETE — some scenarios were blocked' : 'NO BLOCKING DEFECTS FOUND in the executed scope',
    observations: { console_errors: sr.browser?.console_errors ?? [], page_errors: sr.browser?.page_errors ?? [], network_failures: sr.browser?.network_failures ?? [], http_4xx: sr.browser?.http_4xx ?? [], perf: sr.browser?.perf ?? [], a11y: sr.browser?.a11y ?? [] },
    limitations: [...sr.limitations, 'a scenario is PASS only when at least one expected outcome was verified and no step failed or was blocked'],
    evidence_dir: outDir ?? sr.browser?.out_dir ?? null,
  };
  sr.defects = defects;
  sr.verdict = tr.verdict;
  return tr;
}
