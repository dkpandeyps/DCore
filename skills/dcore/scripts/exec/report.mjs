// dcore-qa test runs — execute a test plan in a real browser, derive per-case results honestly, detect and classify
// defects, and write three evidence-backed documents (Detailed Test Report, Detailed Defect Report, Test Case
// Register) as JSON + Markdown + HTML + PDF. PASS only when a case's steps executed and passed; nothing executed =>
// NOT_TESTED; setup failure => BLOCKED; declared exclusions keep their declared status (NOT_TESTED / NOT_APPLICABLE /
// SKIPPED / BLOCKED). PDFs are rendered by the same local browser; without one they are BLOCKED (never faked).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { browse, printPdfs } from './browse.mjs';
import { redact, redactDeep } from './evidence.mjs';
import { buildReportModel, renderDocuments, DOCS, withPdfInfo, secretsAbsent, crossReferences } from './docs.mjs';

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
  // one defect per failing ENDPOINT: per-request random path segments (session / server ids, e.g. SockJS
  // /chat/304/soosyji1/xhr_streaming) are normalised, the occurrences counted (real case: 50 identical chat 500s)
  const net = new Map(); const occ = new Map();
  const endpoint = (u) => { try { const x = new URL(String(u).replace(/\?.*$/, '')); return x.origin + x.pathname.split('/').map((seg) => (/^\d+$/.test(seg) || (/^[A-Za-z0-9_-]{6,}$/.test(seg) && /\d/.test(seg) && /[A-Za-z]/.test(seg)) ? ':x' : seg)).join('/'); } catch { return String(u); } };
  for (const n of run?.evidence?.network_failures ?? []) { const k = n.kind === 'http' ? `${n.status} ${endpoint(n.url)}` : `${n.error} (${n.type ?? 'request'})`; occ.set(k, (occ.get(k) ?? 0) + 1); if (!net.has(k)) net.set(k, n); }
  for (const [k, n] of net) add({ title: n.kind === 'http' ? `Server error ${n.status} from ${k.replace(/^\d+ /, '')}${occ.get(k) > 1 ? ` (${occ.get(k)} occurrences)` : ''}` : `Request failed: ${k}${occ.get(k) > 1 ? ` (${occ.get(k)} occurrences)` : ''}`, severity: n.kind === 'http' ? 'high' : 'medium', category: n.kind === 'http' ? 'backend' : 'network', confidence: 'CONFIRMED (observed network response)', steps_to_reproduce: ['Open the page(s) under test and watch the network panel'], expected: 'Requests succeed (no 5xx / failed requests).', actual: k, evidence: [], linked_cases: cases.filter((c) => (c.observed?.network_failures ?? []).some((x) => JSON.stringify(x) === JSON.stringify(n))).map((c) => c.id), signature: `net:${k}` });
  // accessibility: one defect per failing check (union over all a11y runs)
  const a11yCases = cases.filter((c) => c.failed_op === 'a11y').map((c) => c.id);
  const failing = new Map();
  for (const r of run?.evidence?.a11y ?? []) for (const [k, v] of Object.entries(r)) if (!v.ok && !failing.has(k)) failing.set(k, v);
  for (const [k, v] of failing) add({ title: `Accessibility: ${A11Y_TEXT[k] ?? k}${v.count ? ` (${v.count})` : ''}`, severity: ['form_labels', 'control_names', 'lang'].includes(k) ? 'medium' : 'low', category: 'accessibility', confidence: 'HEURISTIC (automated check; confirm with assistive technology)', steps_to_reproduce: ['Open the page', 'Inspect the listed elements'], expected: 'Check passes.', actual: v.samples?.length ? `Examples: ${v.samples.slice(0, 5).join(' | ')}` : 'Check failed.', evidence: [], linked_cases: a11yCases, signature: `a11y:${k}` });
  out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  out.forEach((d, i) => { d.id = `DEF-${String(i + 1).padStart(3, '0')}`; });
  return out;
}

// ---- rendering: the three documents are rendered by dcore-report (docs.mjs); the Markdown summary stays here

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
// Writes the run as JSON + Markdown and the three dcore-report documents (HTML + PDF). opts.source: the scenario run the
// test run came from (richer step evidence); opts.meta: application / build / objectives / assumptions supplied by a person.
export async function writeReports(tr, outDir, { pdf = true, browser, secrets = [], source = null, meta = {}, prefix } = {}) {
  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true });
  const slug = prefix ? String(prefix).replace(/[^\w.-]+/g, '-').slice(0, 80) : String(tr.name).replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'test-run';
  // credential values the run referenced through environment variables (valueEnv) must never reach a document
  const envNames = [...new Set(JSON.stringify([source?.setup ?? null, tr.setup ?? null]).match(/\$\{(\w+)\}/g) ?? [])].map((x) => x.slice(2, -1));
  secrets = [...secrets, ...envNames.map((n) => process.env[n]).filter((x) => x && x.length >= 4)];
  const clean = (s) => redact(s, secrets);
  const model = redactDeep(buildReportModel(tr, { source, meta }), secrets);
  const files = { json: join(dir, `${slug}.testrun.json`), md: join(dir, `${slug}.summary.md`), report_model: join(dir, `${slug}.report-model.json`) };
  writeFileSync(files.json, clean(JSON.stringify(tr, null, 2)) + '\n');
  writeFileSync(files.md, clean(renderMarkdown(tr)));
  writeFileSync(files.report_model, clean(JSON.stringify(model, null, 2)) + '\n');
  const html = renderDocuments(model, dir);
  files.consistency = crossReferences(model, html);
  const jobs = [];
  for (const d of DOCS) {
    const h = join(dir, `${slug}.${d.file}.html`);
    writeFileSync(h, clean(html[d.key]));
    files[`${d.key}_html`] = h;
    const info = { title: `${d.title} — ${model.name}`, author: 'DCore', subject: `${d.title} for test run ${model.run_id} (${model.environment})`, keywords: `DCore, ${d.title}, ${model.run_id}, ${model.application}`, creator: 'DCore dcore-report', producer: 'DCore dcore-report (Chromium print engine)', created: model.ended_at === 'UNKNOWN' ? null : model.ended_at };
    jobs.push({ key: d.key, html: h, pdf: join(dir, `${slug}.${d.file}.pdf`), cssPageSize: true, outline: true, header: `${d.title} · ${model.name}`.slice(0, 120), headerRight: `Run ${model.run_id}`, footer: `DCore · ${model.application} · ${model.environment} · generated from execution evidence`, postProcess: (buf) => withPdfInfo(buf, info).buf });
  }
  const pdfs = pdf ? await printPdfs(jobs, { browser }) : jobs.map((j) => ({ pdf: j.pdf, ok: false, result: 'SKIPPED', error: 'PDF disabled (--no-pdf)' }));
  jobs.forEach((j, i) => { files[`${j.key}_pdf`] = pdfs[i]; files[`${j.key}_verified`] = secretsAbsent([j.html, ...(pdfs[i]?.ok ? [j.pdf] : [])], secrets); });
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
