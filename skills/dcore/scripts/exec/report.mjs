// dcore-qa test runs — execute a test plan in a real browser, derive per-case results honestly, detect and classify
// defects, and write three evidence-backed documents (Detailed Test Report, Detailed Defect Report, Test Case
// Register) as JSON + Markdown + HTML + PDF. PASS only when a case's steps executed and passed; nothing executed =>
// NOT_TESTED; setup failure => BLOCKED; declared exclusions keep their declared status (NOT_TESTED / NOT_APPLICABLE /
// SKIPPED / BLOCKED). PDFs are rendered by the same local browser; without one they are BLOCKED (never faked).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, dirname, basename } from 'node:path';
import { browse, printPdfs } from './browse.mjs';
import { redact } from './evidence.mjs';

export const CASE_RESULTS = ['PASS', 'FAIL', 'BLOCKED', 'NOT_TESTED', 'NOT_APPLICABLE', 'SKIPPED'];
const ASSERTION_OPS = new Set(['assertText', 'assertNoText', 'assertUrl', 'assertTitle', 'assertVisible', 'assertHidden', 'assertState', 'assertModal', 'assertCount', 'evaluate', 'a11y', 'perf']);
const SEV_BY_TYPE = { positive: 'high', negative: 'medium', boundary: 'medium', error: 'medium', ui: 'low', accessibility: 'low', performance: 'medium', security: 'high' };
// "unassessed": a defect whose business severity the evidence cannot establish (negative-case candidates, M42)
const PRIORITY = { critical: 'P1', high: 'P2', medium: 'P3', low: 'P4', unassessed: 'UNASSESSED' };
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, unassessed: 4 };

// ---- plan helpers -----------------------------------------------------------------------------------------------
export function validatePlan(plan) {
  const errs = [];
  if (!plan || typeof plan !== 'object') return ['plan is not an object'];
  if (!Array.isArray(plan.cases)) errs.push('plan.cases must be an array');
  if (plan.setup !== undefined && !Array.isArray(plan.setup)) errs.push('plan.setup must be an array of steps');
  const ids = new Set();
  (plan.cases ?? []).forEach((c, i) => {
    if (!c || typeof c !== 'object') { errs.push(`case #${i + 1} is not an object`); return; }
    if (!c.title) errs.push(`case #${i + 1} has no title`);
    if (!c.skip && !c.status && !Array.isArray(c.steps)) errs.push(`case ${c.id ?? '#' + (i + 1)} has no steps`);
    if (c.id && ids.has(c.id)) errs.push(`duplicate case id ${c.id}`);
    if (c.id) ids.add(c.id);
  });
  return errs;
}
function normalize(plan) {
  return { ...plan, setup: plan.setup ?? [], cases: plan.cases.map((c, i) => ({ ...c, id: String(c.id ?? `TC-${String(i + 1).padStart(3, '0')}`), type: c.type ?? 'positive', area: c.area ?? 'General' })) };
}
export function flattenPlan(plan) {
  const steps = [...plan.setup];
  for (const c of plan.cases) { if (c.skip || c.status) continue; steps.push({ case: { id: c.id, title: c.title } }, ...c.steps); }
  return steps;
}

// Human-readable step text (values from env vars and password fields are never shown).
export function describeStep(s) {
  const k = Object.keys(s).find((x) => !['name', 'timeoutMs', 'optional'].includes(x)) ?? '?';
  const v = s[k]; const o = typeof v === 'object' && v !== null ? v : s;
  const loc = ['selector', 'text', 'label', 'placeholder', 'testid'].map((x) => o[x] !== undefined ? `${x} "${o[x]}"` : null).filter(Boolean).join(' ');
  const val = o.valueEnv ? `\${${o.valueEnv}}` : /pass|pwd|secret|token/i.test(`${o.label ?? ''} ${o.selector ?? ''}`) ? '[REDACTED]' : JSON.stringify(String(o.value ?? '').slice(0, 40));
  switch (k) {
    case 'goto': return `Open ${typeof v === 'string' ? v : v.url}`;
    case 'click': return `Click ${loc}`;
    case 'fill': return `Enter ${val} into ${loc}`;
    case 'select': return `Select "${o.option ?? o.value}" in ${loc}`;
    case 'press': return `Press ${typeof v === 'string' ? v : v.key}`;
    case 'waitFor': return `Wait for ${JSON.stringify(v)}`;
    case 'wait': return `Wait ${v} ms`;
    case 'assertText': return `Verify text "${typeof v === 'string' ? v : v.text}" is shown`;
    case 'assertNoText': return `Verify text "${typeof v === 'string' ? v : v.text}" is NOT shown`;
    case 'assertUrl': return `Verify URL contains ${JSON.stringify(v)}`;
    case 'assertTitle': return `Verify title contains "${v}"`;
    case 'assertVisible': return `Verify ${typeof v === 'string' ? `"${v}"` : loc} is visible`;
    case 'assertCount': return `Verify count of "${v.selector}" ${JSON.stringify({ min: v.min, max: v.max, equals: v.equals })}`;
    case 'evaluate': return `Check ${s.name ?? 'page state'}${v?.expect !== undefined ? ` (expect ${JSON.stringify(v.expect)})` : ''}`;
    case 'a11y': return 'Run accessibility heuristics';
    case 'perf': return `Measure navigation timing${v?.maxLoadMs ? ` (budget ${v.maxLoadMs} ms)` : ''}`;
    case 'viewport': return `Set viewport ${v.width}x${v.height}`;
    case 'screenshot': return 'Capture screenshot';
    default: return k;
  }
}

// ---- results + defects ------------------------------------------------------------------------------------------
export function buildTestRun(plan, run, meta = {}) {
  const p = normalize(plan);
  const steps = run?.evidence?.steps ?? [];
  const caseEv = new Map((run?.evidence?.cases ?? []).map((c) => [c.id, c]));
  const setupSteps = steps.filter((s) => s.phase === 'setup');
  const setupFailed = setupSteps.some((s) => s.result === 'FAIL' || s.result === 'BLOCKED');
  const executed = run && run.result !== 'BLOCKED' || steps.length > 0;
  const cases = p.cases.map((c) => {
    const base = { id: c.id, area: c.area, title: c.title, type: c.type, priority: c.priority ?? null, preconditions: c.preconditions ?? (p.setup.length ? 'Setup steps completed (see report)' : 'None'), steps: (c.steps ?? []).map(describeStep), expected: c.expected ?? 'All assertions in the steps pass.', defects: [], evidence: [] };
    const declared = { preconditions: c.preconditions ?? '—', expected: c.expected ?? '—' };   // never ran: no implied setup/assertions
    if (c.status) return { ...base, ...declared, result: c.status, actual: `Not executed (${c.status}): ${c.reason ?? 'declared in the plan'}` };
    if (c.skip) return { ...base, ...declared, result: 'SKIPPED', actual: `Not executed (SKIPPED): ${c.reason ?? 'skipped by plan'}` };
    const log = steps.filter((s) => s.case === c.id);
    const ev = caseEv.get(c.id) ?? {};
    for (const shot of [ev.failure_screenshot, ev.screenshot]) if (shot) base.evidence.push(shot);
    const executedSteps = log.filter((s) => ['PASS', 'FAIL'].includes(s.result));
    if (!executed || !log.length) return { ...base, result: setupFailed ? 'BLOCKED' : 'NOT_TESTED', actual: setupFailed ? 'Not run: setup failed.' : 'Not executed (no browser session).' };
    if (log.every((s) => s.result === 'BLOCKED')) return { ...base, result: 'BLOCKED', actual: 'Not run: setup failed.' };
    const fail = log.find((s) => s.result === 'FAIL');
    if (fail) return { ...base, result: 'FAIL', failure_kind: ASSERTION_OPS.has(fail.op) ? 'ASSERTION' : 'ACTION', failed_step: fail.n, failed_op: fail.op, actual: fail.detail, observed: { console_errors: ev.console_errors ?? [], page_errors: ev.page_errors ?? [], network_failures: ev.network_failures ?? [] } };
    const blockedStep = log.find((s) => s.result === 'BLOCKED');
    if (blockedStep) return { ...base, result: 'BLOCKED', failed_step: blockedStep.n, failed_op: blockedStep.op, actual: `Blocked: ${blockedStep.detail}` };   // never PASS around a blocked step
    if (!executedSteps.length) return { ...base, result: 'NOT_TESTED', actual: 'No step executed.' };
    const last = [...log].reverse().find((s) => ASSERTION_OPS.has(s.op)) ?? log[log.length - 1];
    return { ...base, result: 'PASS', actual: `As expected — ${last.detail}`, observed: { console_errors: ev.console_errors ?? [], page_errors: ev.page_errors ?? [], network_failures: ev.network_failures ?? [] } };
  });
  for (const nt of p.not_tested ?? []) cases.push({ id: `NT-${String(cases.filter((x) => x.id.startsWith('NT-')).length + 1).padStart(3, '0')}`, area: nt.area, title: `${nt.area} (not covered)`, type: 'scope', result: nt.status ?? 'NOT_TESTED', steps: [], expected: '—', actual: nt.reason, preconditions: '—', defects: [], evidence: [] });
  const defects = detectDefects(p, cases, run);
  for (const d of defects) for (const id of d.linked_cases) { const c = cases.find((x) => x.id === id); if (c && !c.defects.includes(d.id)) c.defects.push(d.id); }
  const count = (r) => cases.filter((c) => c.result === r).length;
  const totals = Object.fromEntries(CASE_RESULTS.map((r) => [r, count(r)]));
  const executedN = totals.PASS + totals.FAIL;
  const sev = Object.fromEntries(['critical', 'high', 'medium', 'low', 'unassessed'].map((s) => [s, defects.filter((d) => d.severity === s).length]));
  const verdict = !executedN ? 'NO VERDICT — nothing was executed' : sev.critical || sev.high ? 'NOT READY — high/critical defects open' : totals.FAIL || sev.medium ? 'READY WITH RISKS — medium defects or failed cases open' : totals.BLOCKED ? 'INCOMPLETE — some cases were blocked' : 'NO BLOCKING DEFECTS FOUND in the executed scope';
  return {
    schema: 'dcore.testrun/1', name: p.name ?? 'Test run', target: p.target ?? null, environment: p.environment ?? 'UNSPECIFIED',
    started_at: run?.started_at ?? null, ended_at: run?.ended_at ?? null, executed_by: 'DCore dcore-qa (dcore-browse, real browser)', browser: run?.evidence?.browser ?? null,
    scope: p.scope ?? [...new Set(p.cases.map((c) => c.area))], out_of_scope: p.out_of_scope ?? [],
    setup: { steps: p.setup.map(describeStep), result: !setupSteps.length ? 'NOT_APPLICABLE' : setupFailed ? 'FAIL' : 'PASS', log: setupSteps },
    totals: { cases: cases.length, executed: executedN, pass_rate_executed: executedN ? Math.round((totals.PASS / executedN) * 1000) / 10 : null, ...totals },
    defects_by_severity: sev, verdict, cases, defects,
    observations: { console_errors: run?.evidence?.console_errors ?? [], page_errors: run?.evidence?.page_errors ?? [], network_failures: run?.evidence?.network_failures ?? [], http_4xx: run?.evidence?.http_4xx ?? [], perf: run?.evidence?.perf ?? [], a11y: run?.evidence?.a11y ?? [] },
    limitations: [...(run?.limitations ?? []), 'client-side validation was checked with the browser constraint-validation API; server-side validation is only covered where a case submits data', 'results are point-in-time observations from this machine'],
    evidence_dir: meta.outDir ?? run?.evidence?.out_dir ?? null,
  };
}

const A11Y_TEXT = { lang: 'Page has no lang attribute', title: 'Page has no title', img_alt: 'Images without alt text', form_labels: 'Form fields without an accessible name', control_names: 'Buttons/links without an accessible name', duplicate_ids: 'Duplicate element ids', heading_order: 'Heading levels are skipped', positive_tabindex: 'Positive tabindex values', aria_hidden_focusable: 'Focusable controls inside aria-hidden content' };

export function detectDefects(plan, cases, run) {
  const out = [];
  const add = (d) => out.push({ status: 'OPEN', environment: plan.environment ?? 'UNSPECIFIED', target: plan.target ?? null, ...d, priority: PRIORITY[d.severity] });
  const planCase = (id) => plan.cases.find((c) => c.id === id) ?? {};
  for (const c of cases.filter((x) => x.result === 'FAIL')) {
    const pc = planCase(c.id);
    if (c.failed_op === 'a11y') continue;   // heuristic a11y findings are reported per check below
    const severity = pc.severity_on_fail ?? SEV_BY_TYPE[c.type] ?? 'medium';
    add({ title: `${c.title} — failed`, severity, category: { performance: 'performance', ui: 'ui', accessibility: 'accessibility', security: 'security' }[c.type] ?? 'functional', confidence: c.failure_kind === 'ASSERTION' ? 'CONFIRMED (assertion failed)' : 'NEEDS TRIAGE (an action could not be performed: app change or test locator)', steps_to_reproduce: [...(plan.setup?.length ? ['Complete the setup steps (log in / navigate)'] : []), ...c.steps], expected: c.expected, actual: c.actual, evidence: c.evidence, linked_cases: [c.id], signature: `case:${c.id}` });
  }
  // runtime signals (deduplicated), attributed to the cases during which they occurred
  const byCase = (field, msg) => cases.filter((c) => (c.observed?.[field] ?? []).some((m) => (typeof m === 'string' ? m : JSON.stringify(m)) === msg)).map((c) => c.id);
  // signals not attributable to any case happened during setup (e.g. on the login page): say so and give the setup steps
  const repro = (linked) => linked.length ? ['Open the page(s) under test with the browser developer console open', `Observed during: ${linked.join(', ')}`] : ['Observed during setup, before any test case ran:', ...(plan.setup ?? []).map(describeStep)];
  for (const msg of [...new Set(run?.evidence?.page_errors ?? [])]) { const linked = byCase('page_errors', msg); add({ title: `Uncaught JavaScript exception: ${msg.slice(0, 120)}`, severity: 'medium', category: 'frontend-runtime', confidence: 'CONFIRMED (observed in the browser)', steps_to_reproduce: repro(linked), expected: 'No uncaught exceptions.', actual: msg, evidence: [], linked_cases: linked, signature: `pageerror:${msg}` }); }
  for (const msg of [...new Set(run?.evidence?.console_errors ?? [])]) { const linked = byCase('console_errors', msg); add({ title: `Console error: ${msg.slice(0, 120)}`, severity: 'low', category: 'frontend-console', confidence: 'CONFIRMED (observed in the browser)', steps_to_reproduce: repro(linked), expected: 'No console errors.', actual: msg, evidence: [], linked_cases: linked, signature: `console:${msg}` }); }
  const net = new Map();
  for (const n of run?.evidence?.network_failures ?? []) { const k = n.kind === 'http' ? `${n.status} ${n.url}` : `${n.error} (${n.type ?? 'request'})`; if (!net.has(k)) net.set(k, n); }
  for (const [k, n] of net) add({ title: n.kind === 'http' ? `Server error ${n.status} from ${n.url}` : `Request failed: ${k}`, severity: n.kind === 'http' ? 'high' : 'medium', category: n.kind === 'http' ? 'backend' : 'network', confidence: 'CONFIRMED (observed network response)', steps_to_reproduce: ['Open the page(s) under test and watch the network panel'], expected: 'Requests succeed (no 5xx / failed requests).', actual: k, evidence: [], linked_cases: cases.filter((c) => (c.observed?.network_failures ?? []).some((x) => JSON.stringify(x) === JSON.stringify(n))).map((c) => c.id), signature: `net:${k}` });
  // accessibility: one defect per failing check (union over all a11y runs)
  const a11yCases = cases.filter((c) => c.failed_op === 'a11y').map((c) => c.id);
  const failing = new Map();
  for (const r of run?.evidence?.a11y ?? []) for (const [k, v] of Object.entries(r)) if (!v.ok && !failing.has(k)) failing.set(k, v);
  for (const [k, v] of failing) add({ title: `Accessibility: ${A11Y_TEXT[k] ?? k}${v.count ? ` (${v.count})` : ''}`, severity: ['form_labels', 'control_names', 'lang'].includes(k) ? 'medium' : 'low', category: 'accessibility', confidence: 'HEURISTIC (automated check; confirm with assistive technology)', steps_to_reproduce: ['Open the page', 'Inspect the listed elements'], expected: 'Check passes.', actual: v.samples?.length ? `Examples: ${v.samples.slice(0, 5).join(' | ')}` : 'Check failed.', evidence: [], linked_cases: a11yCases, signature: `a11y:${k}` });
  out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  out.forEach((d, i) => { d.id = `DEF-${String(i + 1).padStart(3, '0')}`; });
  return out;
}

// ---- rendering --------------------------------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CSS = `*{box-sizing:border-box}body{font:10.5px/1.45 "Segoe UI",Arial,sans-serif;color:#1a1d24;margin:0}h1{font-size:20px;margin:0 0 2px}h2{font-size:14px;margin:18px 0 6px;border-bottom:2px solid #4b2ab8;padding-bottom:3px;color:#2b1a6e}h3{font-size:12px;margin:12px 0 4px}
.sub{color:#5b6070;margin-bottom:10px}.meta{border-collapse:collapse;margin:6px 0 10px}.meta td{padding:2px 10px 2px 0;vertical-align:top}.meta td:first-child{color:#5b6070;white-space:nowrap}
table.t{border-collapse:collapse;width:100%;margin:4px 0 10px;page-break-inside:auto}table.t th{background:#eeebf9;text-align:left;font-weight:600}table.t th,table.t td{border:1px solid #d6d3e4;padding:3px 5px;vertical-align:top}table.t tr{page-break-inside:avoid}
.tiles{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.tile{border:1px solid #d6d3e4;border-radius:5px;padding:5px 9px;min-width:78px}.tile b{display:block;font-size:16px}
.r{font-weight:700;padding:1px 5px;border-radius:3px;font-size:9.5px;white-space:nowrap}.PASS{background:#dff3e4;color:#14612b}.FAIL{background:#fbe0de;color:#9b1c13}.BLOCKED{background:#fde9cf;color:#8a4b00}.NOT_TESTED,.SKIPPED,.NOT_APPLICABLE{background:#e9eaee;color:#444}
.sev-critical,.sev-high{color:#9b1c13;font-weight:700}.sev-medium{color:#8a4b00;font-weight:700}.sev-low{color:#444;font-weight:700}.sev-unassessed{color:#4b2ab8;font-weight:700}
.verdict{padding:7px 10px;border-left:4px solid #4b2ab8;background:#f5f3fd;margin:8px 0;font-weight:600}.case{page-break-inside:avoid;border:1px solid #e1dfea;border-radius:5px;padding:6px 9px;margin:6px 0}
img.shot{max-width:100%;max-height:330px;border:1px solid #ccc;margin:4px 0}code{font:9.5px Consolas,monospace;background:#f3f3f6;padding:0 3px}ol,ul{margin:2px 0 2px 18px;padding:0}.small{color:#5b6070;font-size:9.5px}`;
const badge = (r) => `<span class="r ${esc(r)}">${esc(r)}</span>`;
const img = (p, dir) => p && existsSync(p) ? `<img class="shot" src="${esc(relative(dir, p).replace(/\\/g, '/'))}">` : '';
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
function header(tr, doc) {
  return `<h1>${esc(doc)}</h1><div class="sub">${esc(tr.name)}</div><table class="meta">
<tr><td>Target</td><td>${esc(tr.target)}</td></tr><tr><td>Environment</td><td>${esc(tr.environment)}</td></tr>
<tr><td>Executed</td><td>${esc(tr.started_at)} → ${esc(tr.ended_at)}</td></tr><tr><td>Executed by</td><td>${esc(tr.executed_by)}${tr.browser ? ` · ${esc(tr.browser)}` : ''}</td></tr>
<tr><td>Generated</td><td>${esc(new Date().toISOString())} · schema ${esc(tr.schema)}</td></tr></table>`;
}
function tiles(tr) {
  const t = tr.totals;
  return `<div class="tiles">${[['Cases', t.cases], ['Executed', t.executed], ['Pass', t.PASS], ['Fail', t.FAIL], ['Blocked', t.BLOCKED], ['Not tested', t.NOT_TESTED], ['N/A', t.NOT_APPLICABLE], ['Skipped', t.SKIPPED], ['Pass rate (executed)', t.pass_rate_executed === null ? '—' : `${t.pass_rate_executed}%`], ['Defects', tr.defects.length]].map(([k, v]) => `<div class="tile"><b>${esc(v)}</b>${esc(k)}</div>`).join('')}</div>`;
}

export function renderTestReport(tr, dir) {
  const areas = [...new Set(tr.cases.map((c) => c.area))];
  const byArea = areas.map((a) => { const cs = tr.cases.filter((c) => c.area === a); return `<tr><td>${esc(a)}</td>${CASE_RESULTS.map((r) => `<td>${cs.filter((c) => c.result === r).length || ''}</td>`).join('')}</tr>`; }).join('');
  const sev = tr.defects_by_severity;
  const body = `${header(tr, 'Detailed Test Report')}
<h2>1. Executive summary</h2><div class="verdict">Verdict: ${esc(tr.verdict)}</div>${tiles(tr)}
<p>Defects by severity: <span class="sev-critical">critical ${sev.critical}</span> · <span class="sev-high">high ${sev.high}</span> · <span class="sev-medium">medium ${sev.medium}</span> · <span class="sev-low">low ${sev.low}</span>${sev.unassessed ? ` · <span class="sev-unassessed">unassessed ${sev.unassessed}</span>` : ''}. Setup: ${badge(tr.setup.result)}</p>
<h2>2. Scope</h2><p><b>In scope:</b> ${esc(tr.scope.join(', ') || '—')}</p><p><b>Out of scope:</b> ${esc(tr.out_of_scope.join('; ') || '—')}</p>
<h2>3. Approach</h2><p>Every case was executed in a real Chromium-family browser by DCore. A case is <b>PASS</b> only when all of its steps executed and every assertion held; <b>FAIL</b> when an assertion failed or a required action could not be performed; <b>BLOCKED</b> when setup failed; <b>NOT_TESTED / NOT_APPLICABLE / SKIPPED</b> are never counted as passed. Console errors, uncaught exceptions and failed or 5xx requests were recorded throughout and are attributed to the case during which they occurred.</p>
${tr.setup.steps.length ? `<h3>Setup</h3><ol>${tr.setup.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
<h2>4. Results by area</h2><table class="t"><tr><th>Area</th>${CASE_RESULTS.map((r) => `<th>${r}</th>`).join('')}</tr>${byArea}</table>
<h2>5. Test case details</h2>${tr.cases.map((c) => `<div class="case"><b>${esc(c.id)}</b> ${badge(c.result)} <b>${esc(c.title)}</b> <span class="small">· ${esc(c.area)} · ${esc(c.type)}</span>
${c.steps.length ? `<ol>${c.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}<div><b>Expected:</b> ${esc(c.expected)}</div><div><b>Actual:</b> ${esc(c.actual)}</div>
${c.defects.length ? `<div><b>Defects:</b> ${esc(c.defects.join(', '))}</div>` : ''}${c.evidence.slice(0, 1).map((p) => img(p, dir)).join('')}</div>`).join('')}
<h2>6. Runtime observations</h2><table class="t"><tr><th>Signal</th><th>Count</th><th>Examples</th></tr>
<tr><td>Uncaught exceptions</td><td>${tr.observations.page_errors.length}</td><td>${esc(tr.observations.page_errors.slice(0, 4).join(' | '))}</td></tr>
<tr><td>Console errors</td><td>${tr.observations.console_errors.length}</td><td>${esc(tr.observations.console_errors.slice(0, 4).join(' | '))}</td></tr>
<tr><td>Failed / 5xx requests</td><td>${tr.observations.network_failures.length}</td><td>${esc(tr.observations.network_failures.slice(0, 4).map((n) => n.status ? `${n.status} ${n.url}` : n.error).join(' | '))}</td></tr>
<tr><td>4xx responses (informational)</td><td>${tr.observations.http_4xx.length}</td><td>${esc(tr.observations.http_4xx.slice(0, 4).map((n) => `${n.status} ${n.url}`).join(' | '))}</td></tr>
<tr><td>Navigation timing</td><td>${tr.observations.perf.length}</td><td>${esc(tr.observations.perf.filter(Boolean).map((p) => `load ${p.load_ms} ms / DCL ${p.dom_content_loaded_ms} ms / TTFB ${p.ttfb_ms} ms`).join(' | '))}</td></tr></table>
<h2>7. Limitations</h2><ul>${tr.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<p class="small">Evidence directory: ${esc(tr.evidence_dir)}. Companion documents: Detailed Defect Report, Test Case Register.</p>`;
  return page('Detailed Test Report', body);
}

export function renderDefectReport(tr, dir) {
  const body = `${header(tr, 'Detailed Defect Report')}
<h2>Summary</h2><p>${tr.defects.length} defect(s): critical ${tr.defects_by_severity.critical} · high ${tr.defects_by_severity.high} · medium ${tr.defects_by_severity.medium} · low ${tr.defects_by_severity.low}${tr.defects_by_severity.unassessed ? ` · unassessed ${tr.defects_by_severity.unassessed} (needs triage)` : ''}.</p>
${tr.defects.length ? `<table class="t"><tr><th>ID</th><th>Severity</th><th>Priority</th><th>Category</th><th>Title</th><th>Cases</th><th>Confidence</th></tr>${tr.defects.map((d) => `<tr><td>${esc(d.id)}</td><td class="sev-${esc(d.severity)}">${esc(d.severity)}</td><td>${esc(d.priority)}</td><td>${esc(d.category)}</td><td>${esc(d.title)}</td><td>${esc(d.linked_cases.join(', ') || '—')}</td><td>${esc(d.confidence)}</td></tr>`).join('')}</table>` : '<p>No defects were detected in the executed scope. This does not prove the absence of defects outside it.</p>'}
<h2>Details</h2>${tr.defects.map((d) => `<div class="case"><h3>${esc(d.id)} — ${esc(d.title)}</h3><table class="meta">
<tr><td>Severity / priority</td><td class="sev-${esc(d.severity)}">${esc(d.severity)} / ${esc(d.priority)}</td></tr><tr><td>Category</td><td>${esc(d.category)}</td></tr><tr><td>Status</td><td>${esc(d.status)}</td></tr>
<tr><td>Confidence</td><td>${esc(d.confidence)}</td></tr>${d.defect_candidate ? `<tr><td>Defect candidate</td><td>${esc(d.defect_candidate)} · type: ${esc(d.defect_type_candidate?.value)}</td></tr><tr><td>Severity candidate</td><td>${esc(d.severity_candidate?.value)} — ${esc(d.severity_candidate?.basis)}</td></tr><tr><td>Priority candidate</td><td>${esc(d.priority_candidate?.value)} — ${esc(d.priority_candidate?.basis)}</td></tr>` : ''}<tr><td>Environment</td><td>${esc(d.environment)} · ${esc(d.target)}</td></tr><tr><td>Linked cases</td><td>${esc(d.linked_cases.join(', ') || '—')}</td></tr></table>
<b>Steps to reproduce</b><ol>${d.steps_to_reproduce.map((s) => `<li>${esc(s)}</li>`).join('')}</ol><div><b>Expected:</b> ${esc(d.expected)}</div><div><b>Actual:</b> ${esc(d.actual)}</div>${d.evidence.slice(0, 1).map((p) => img(p, dir)).join('')}</div>`).join('')}`;
  return page('Detailed Defect Report', body);
}

export function renderRegister(tr) {
  const body = `${header(tr, 'Test Case Register')}${tiles(tr)}
<table class="t"><tr><th>ID</th><th>Area</th><th>Title</th><th>Type</th><th>Preconditions</th><th>Steps / test data</th><th>Expected</th><th>Actual</th><th>Result</th><th>Defects</th><th>Evidence</th></tr>
${tr.cases.map((c) => `<tr><td>${esc(c.id)}</td><td>${esc(c.area)}</td><td>${esc(c.title)}</td><td>${esc(c.type)}</td><td>${esc(c.preconditions)}</td><td>${c.steps.length ? `<ol>${c.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '—'}</td><td>${esc(c.expected)}</td><td>${esc(c.actual)}</td><td>${badge(c.result)}</td><td>${esc(c.defects.join(', ') || '—')}</td><td>${esc(c.evidence.map((p) => basename(p)).join(', ') || '—')}</td></tr>`).join('')}</table>`;
  return page('Test Case Register', body);
}

export function renderMarkdown(tr) {
  const t = tr.totals;
  return [`# ${tr.name}`, '', `Target: ${tr.target} · Environment: ${tr.environment} · ${tr.started_at} → ${tr.ended_at}`, '', `**Verdict:** ${tr.verdict}`, '',
    `Cases ${t.cases} · executed ${t.executed} · PASS ${t.PASS} · FAIL ${t.FAIL} · BLOCKED ${t.BLOCKED} · NOT_TESTED ${t.NOT_TESTED} · N/A ${t.NOT_APPLICABLE} · SKIPPED ${t.SKIPPED} · defects ${tr.defects.length}`, '',
    '## Test Case Register', '', '| ID | Area | Title | Type | Result | Actual | Defects |', '|---|---|---|---|---|---|---|',
    ...tr.cases.map((c) => `| ${c.id} | ${c.area} | ${c.title.replace(/\|/g, '/')} | ${c.type} | ${c.result} | ${String(c.actual).replace(/\|/g, '/').slice(0, 160)} | ${c.defects.join(', ')} |`), '',
    '## Defects', '', '| ID | Severity | Category | Title | Cases |', '|---|---|---|---|---|',
    ...tr.defects.map((d) => `| ${d.id} | ${d.severity} | ${d.category} | ${d.title.replace(/\|/g, '/')} | ${d.linked_cases.join(', ')} |`), ''].join('\n');
}

// ---- orchestration ----------------------------------------------------------------------------------------------
export async function writeReports(tr, outDir, { pdf = true, browser, secrets = [] } = {}) {
  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true });
  const slug = String(tr.name).replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'test-run';
  const clean = (s) => redact(s, secrets);
  const files = { json: join(dir, `${slug}.testrun.json`), md: join(dir, `${slug}.summary.md`) };
  writeFileSync(files.json, clean(JSON.stringify(tr, null, 2)) + '\n');
  writeFileSync(files.md, clean(renderMarkdown(tr)));
  const docs = [['test_report', 'Detailed-Test-Report', renderTestReport(tr, dir), false], ['defect_report', 'Detailed-Defect-Report', renderDefectReport(tr, dir), false], ['test_case_register', 'Test-Case-Register', renderRegister(tr), true]];
  const jobs = [];
  for (const [key, name, html, landscape] of docs) {
    const h = join(dir, `${slug}.${name}.html`);
    writeFileSync(h, clean(html));
    files[`${key}_html`] = h;
    jobs.push({ key, html: h, pdf: join(dir, `${slug}.${name}.pdf`), landscape, footer: `DCore · ${name.replace(/-/g, ' ')} · ${tr.name}` });
  }
  const pdfs = pdf ? await printPdfs(jobs, { browser }) : jobs.map((j) => ({ pdf: j.pdf, ok: false, result: 'SKIPPED', error: 'PDF disabled (--no-pdf)' }));
  jobs.forEach((j, i) => { files[`${j.key}_pdf`] = pdfs[i]; });
  return files;
}

// Discover a live page (after optional setup steps, e.g. login) and generate an executable plan from what is there.
export async function discoverPlan(url, opts = {}) {
  const { generatePlan } = await import('./scenarios.mjs');
  const setup = opts.setup ?? [];
  const run = await browse([...setup, { goto: url }, { inspect: { max: 250 } }, { screenshot: { name: 'discovered', fullPage: true } }], { outDir: opts.outDir, profile: opts.profile, headed: opts.headed, browser: opts.browser, stepTimeoutMs: opts.stepTimeoutMs });
  const inspection = run.evidence?.inspections?.[0] ?? null;
  const plan = generatePlan(inspection, { url, setup, name: opts.name, environment: opts.environment });
  return {
    schema: 'dcore.evidence/1', module: 'dcore-qa', action: `discover ${url}`, result: inspection ? 'PASS' : 'BLOCKED', started_at: run.started_at, ended_at: new Date().toISOString(),
    checks: (run.evidence?.steps ?? []).map((s) => ({ id: `step-${s.n}`, title: `${s.op}: ${s.detail}`, result: s.result })),
    evidence: { plan, generated_cases: plan.cases.length, not_tested: plan.not_tested, screenshots: run.evidence?.screenshots ?? [], page_errors: run.evidence?.page_errors ?? [] },
    limitations: inspection ? ['generated cases cover page load, declared field constraints, keyboard, accessibility, responsive layout and load time; business flows that change data need explicit cases'] : run.limitations ?? ['page could not be inspected'],
  };
}

// plan: dcore.testplan/1. opts: { outDir, profile, headed, browser, pdf, stepTimeoutMs }
export async function runQaPlan(plan, opts = {}) {
  const errs = validatePlan(plan);
  const started_at = new Date().toISOString();
  const outDir = resolve(opts.outDir ?? join('.dcore', 'evidence', `qa-${started_at.replace(/[:.]/g, '-')}`));
  if (errs.length) return { schema: 'dcore.evidence/1', module: 'dcore-qa', action: 'run plan', result: 'BLOCKED', checks: [], evidence: { plan_errors: errs }, limitations: ['invalid test plan: nothing was executed'], started_at, ended_at: new Date().toISOString() };
  const p = normalize(plan);
  const steps = flattenPlan(p);
  const run = steps.length ? await browse(steps, { outDir, profile: opts.profile, headed: opts.headed, browser: opts.browser, stepTimeoutMs: opts.stepTimeoutMs, caseScreenshots: true }) : null;
  const tr = buildTestRun(p, run, { outDir });
  const files = await writeReports(tr, outDir, { pdf: opts.pdf !== false, browser: opts.browser });
  const t = tr.totals;
  const result = !t.executed ? (run?.result === 'BLOCKED' || t.BLOCKED ? 'BLOCKED' : 'NOT_TESTED') : t.FAIL || tr.defects.length ? 'FAIL' : t.BLOCKED ? 'BLOCKED' : 'PASS';
  return {
    schema: 'dcore.evidence/1', module: 'dcore-qa', action: `run plan "${tr.name}" (${p.cases.length} cases)`, result, started_at, ended_at: new Date().toISOString(),
    checks: tr.cases.map((c) => ({ id: c.id, title: `${c.title}: ${c.actual}`.slice(0, 220), result: c.result })),
    evidence: { verdict: tr.verdict, totals: t, defects: tr.defects.map((d) => ({ id: d.id, severity: d.severity, title: d.title })), files, browser_result: run?.result ?? null },
    limitations: [...(run?.result === 'BLOCKED' ? run.limitations : []), ...Object.values(files).filter((f) => typeof f === 'object' && !f.ok).map((f) => `PDF not produced: ${f.error}`)],
  };
}
