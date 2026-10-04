// DCore shared reporting layer (M44). Any DCore result — execution evidence (dcore.evidence/1 from dcore-browse,
// dcore-api, dcore-run, dcore-verify, dcore-git, dcore-release, dcore-explore), a scenario run or plan run from dcore-qa,
// or reasoning output (dcore-route, dcore-chain, dcore-debug, dcore-qa text mode) — is normalised ONCE here into a
// scenario run (dcore.scenario-run/1 shape) and handed to dcore-report, which classifies defects and writes the three
// PDFs. No module renders reports itself. Results are never upgraded: an unexecuted plan is NOT_TESTED, a refused or
// impossible execution is BLOCKED, a run that stopped half way keeps its SKIPPED / NOT_TESTED steps (partial report).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { type as osType, release as osRelease, arch as osArch } from 'node:os';

const MODULE_TYPE = { 'dcore-browse': 'Functional', 'dcore-api': 'Integration', 'dcore-run': 'Regression', 'dcore-verify': 'Smoke', 'dcore-git': 'Regression', 'dcore-release': 'Regression', 'dcore-explore': 'Smoke', 'dcore-qa': 'Functional' };
const CODE = (m) => String(m ?? 'dcore').replace(/^dcore-/, '').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DCORE';
const pad = (n) => String(n).padStart(3, '0');
const statusOf = (x) => (['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'NOT_TESTED', 'NOT_APPLICABLE'].includes(x) ? x : 'NOT_TESTED');

// --report <dir-or-prefix>: an existing directory (or a path ending in a separator) is a directory; otherwise the last
// path segment is the file-name prefix for the documents.
export function reportTarget(spec) {
  const p = resolve(String(spec));
  if (/[\\/]$/.test(String(spec)) || (existsSync(p) && statSync(p).isDirectory())) return { dir: p, prefix: null };
  return { dir: dirname(p), prefix: basename(p) };
}

export function runIdFor(r, at) {
  const t = new Date(at ?? r?.started_at ?? r?.ended_at ?? Date.now());
  const stamp = (Number.isNaN(t.getTime()) ? new Date() : t).toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  return `run-${stamp}-${createHash('sha256').update(JSON.stringify([r?.module ?? r?.module_id, r?.action ?? r?.objective ?? r?.task ?? null, r?.started_at ?? null])).digest('hex').slice(0, 6)}`;
}

// scenario status from its steps (same rule as the scenario engine: PASS needs a verified step and no failure)
function scenarioStatus(steps, forced) {
  if (forced) return forced;
  if (steps.some((s) => s.status === 'FAIL')) return 'FAIL';
  if (steps.some((s) => s.status === 'BLOCKED')) return 'BLOCKED';
  if (steps.some((s) => s.status === 'PASS')) return 'PASS';
  return steps.length && steps.every((s) => s.status === 'SKIPPED') ? 'SKIPPED' : 'NOT_TESTED';
}
function summarise(status, steps, reason) {
  const f = steps.find((s) => s.status === 'FAIL') ?? steps.find((s) => s.status === 'BLOCKED');
  const notRun = steps.filter((s) => ['SKIPPED', 'NOT_TESTED'].includes(s.status)).length;
  if (f) return `Step ${f.step_id} (${f.action}) ${f.status === 'FAIL' ? 'failed' : 'blocked'}: ${f.actual}${notRun ? ` — ${notRun} later step(s) not run (partial execution)` : ''}`;
  if (status === 'PASS') return `${steps.filter((s) => s.status === 'PASS').length} of ${steps.length} check(s) passed`;
  return reason ?? 'Nothing was executed, so nothing is claimed.';
}

// ---- normalisation -------------------------------------------------------------------------------------------------
export function toReportSource(r, { module } = {}) {
  const mod = r?.module ?? r?.module_id ?? module ?? 'dcore';
  // dcore-qa runs already carry a scenario run / test run: report exactly that (same IDs as dcore-qa's own documents)
  if (r?.schema === 'dcore.evidence/1' && r.evidence?.run_file && existsSync(r.evidence.run_file)) return { kind: 'scenario-run', sr: JSON.parse(readFileSync(r.evidence.run_file, 'utf8')) };
  if (r?.schema === 'dcore.evidence/1' && r.evidence?.files?.json && existsSync(r.evidence.files.json)) { const tr = JSON.parse(readFileSync(r.evidence.files.json, 'utf8')); if (tr.schema === 'dcore.testrun/1') return { kind: 'testrun', tr }; }
  if (r?.schema === 'dcore.scenario-run/1') return { kind: 'scenario-run', sr: r };
  if (r?.schema === 'dcore.testrun/1') return { kind: 'testrun', tr: r };
  const run_id = runIdFor(r);
  const base = { schema: 'dcore.scenario-run/1', host: { os: `${osType()} ${osRelease()} (${osArch()})` }, run_id, name: `${mod}: ${String(r?.action ?? r?.objective ?? r?.task ?? 'run').slice(0, 100)}`, target: r?.evidence?.final_url ?? r?.evidence?.url ?? r?.target ?? null, environment: r?.environment_name ?? 'UNSPECIFIED', started_at: r?.started_at ?? null, ended_at: r?.ended_at ?? null, approvals: [], setup: { status: 'NOT_APPLICABLE', steps: [] }, limitations: [...(r?.limitations ?? [])], defect_candidates: [] };
  if (r?.schema === 'dcore.evidence/1') return { kind: 'evidence', sr: fromEvidence(r, base, mod) };
  return { kind: 'reasoning', sr: fromReasoning(r, base, mod) };
}

function fromEvidence(r, base, mod) {
  const ev = r.evidence ?? {};
  const scenarios = []; const code = CODE(mod);
  const mk = (id, title, steps, extra = {}) => { const status = scenarioStatus(steps, extra.forced); scenarios.push({ scenario_id: id, title, feature: extra.feature ?? mod, category: mod, type: MODULE_TYPE[mod] ?? 'Functional', priority: null, preconditions: extra.preconditions ?? 'None', data: {}, expected: extra.expected ?? 'Every check passes.', status, actual: summarise(status, steps, extra.reason), steps, evidence: extra.evidence ?? [], console_errors: extra.console_errors ?? [], network_failures: extra.network_failures ?? [] }); };
  if (mod === 'dcore-browse' && Array.isArray(ev.steps)) {
    const stepOf = (l, sid) => ({ run_id: base.run_id, scenario_id: sid, step_id: `S${l.n}`, action: l.op, target: '—', input: null, expected: `${l.op} succeeds`, actual: l.detail, status: statusOf(l.result), verified: l.result === 'PASS', timestamp: null, url: null, screenshot: null, console_errors: [], network_failures: [], checks: [{ kind: l.op?.startsWith('assert') || l.op === 'evaluate' ? 'expectation' : 'action', status: statusOf(l.result), detail: l.detail }] });
    const setupSteps = ev.steps.filter((l) => l.phase === 'setup' || (!l.case && (ev.cases ?? []).length));
    if ((ev.cases ?? []).length) {
      base.setup = { status: setupSteps.some((l) => ['FAIL', 'BLOCKED'].includes(l.result)) ? 'FAIL' : setupSteps.length ? 'PASS' : 'NOT_APPLICABLE', steps: setupSteps.map((l) => stepOf(l, 'setup')) };
      for (const c of ev.cases) { const sid = c.id; const steps = ev.steps.filter((l) => l.case === c.id).map((l) => stepOf(l, sid)); const fail = steps.find((s) => ['FAIL', 'BLOCKED'].includes(s.status)); if (fail && c.failure_screenshot) fail.screenshot = c.failure_screenshot; mk(sid, c.title ?? sid, steps, { evidence: [c.screenshot].filter(Boolean), console_errors: [...(c.console_errors ?? []), ...(c.page_errors ?? [])], network_failures: c.network_failures ?? [] }); }
    } else {
      const sid = `${code}-001`; const steps = ev.steps.map((l) => stepOf(l, sid));
      mk(sid, r.action, steps, { evidence: (ev.screenshots ?? []).slice(-1), console_errors: [...(ev.console_errors ?? []), ...(ev.page_errors ?? [])], network_failures: ev.network_failures ?? [], forced: r.result === 'BLOCKED' && !steps.length ? 'BLOCKED' : null, reason: r.result === 'BLOCKED' ? (r.limitations ?? []).join('; ') : null });
    }
  } else {
    const sid = `${code}-001`;
    const steps = (r.checks ?? []).map((c, i) => ({ run_id: base.run_id, scenario_id: sid, step_id: `S${i + 1}`, action: String(c.id ?? 'check'), target: '—', input: null, expected: c.title, actual: c.actual !== undefined ? (typeof c.actual === 'string' ? c.actual : JSON.stringify(c.actual)).slice(0, 400) : c.result === 'PASS' ? 'as expected' : c.title, status: statusOf(c.result), verified: c.result === 'PASS', timestamp: null, url: null, screenshot: null, console_errors: [], network_failures: [], checks: [{ kind: 'expectation', label: c.title, status: statusOf(c.result), detail: c.title }], ...(mod === 'dcore-api' ? { module_evidence: { status: ev.status ?? null, latency: ev.latency ?? null } } : {}) }));
    const blocked = r.result === 'BLOCKED';
    mk(sid, r.action, steps, { forced: blocked && !steps.some((s) => s.status === 'FAIL') ? 'BLOCKED' : null, reason: blocked ? `BLOCKED: ${(r.limitations ?? []).join('; ') || 'not executed'}` : null, evidence: (ev.screenshots ?? []).slice(-1) });
    if (blocked && !steps.length) scenarios[0].actual = `BLOCKED: ${(r.limitations ?? []).join('; ') || 'not executed'}`;
  }
  return { ...base, target: base.target ?? ev.url ?? null, scenarios, browser: ev.browser || ev.page_errors ? { browser: ev.browser ?? null, version: ev.version ?? null, viewport: ev.viewport ?? null, responsive: ev.responsive ?? [], page_errors: ev.page_errors ?? [], console_errors: ev.console_errors ?? [], network_failures: ev.network_failures ?? [], http_4xx: ev.http_4xx ?? [], redirects: ev.redirects ?? [], a11y: ev.a11y ?? [], perf: ev.perf ?? [], screenshots: ev.screenshots ?? [], out_dir: ev.out_dir ?? null } : null };
}

// reasoning output: planned work, nothing executed => every case NOT_TESTED with the reason
function fromReasoning(r, base, mod) {
  const code = CODE(mod); const reason = 'planned by reasoning output only; nothing was executed (run it through an execution module to obtain a result)';
  const items = mod === 'dcore-route' ? (r.workflow ?? []).map((w) => ({ title: `Step ${w.step}: ${w.capability} — ${w.purpose}`, feature: w.capability }))
    : mod === 'dcore-chain' ? (r.qa?.scenarios ?? []).map((s) => ({ title: String(s), feature: 'QA scenario (chain)' }))
    : mod === 'dcore-qa' ? (r.scenarios ?? []).map((s) => ({ title: String(s), feature: 'QA scenario' }))
    : mod === 'dcore-debug' ? [...(r.hypotheses ?? []).map((h) => ({ title: `Verify hypothesis ${h}`, feature: 'Debug hypothesis' })), ...(r.next_steps ?? []).map((s) => ({ title: `Next step: ${s}`, feature: 'Debug procedure' }))]
    : [];
  const list = items.length ? items : [{ title: String(r?.objective ?? r?.task ?? `${mod} output`), feature: mod }];
  const scenarios = list.map((it, i) => ({ scenario_id: `${code}-${pad(i + 1)}`, title: it.title.slice(0, 200), feature: it.feature, category: mod, type: 'Functional', priority: null, preconditions: '—', data: {}, expected: 'Defined when the case is executed.', status: 'NOT_TESTED', actual: `Not executed (NOT_TESTED): ${reason}`, steps: [], evidence: [] }));
  return { ...base, name: `${mod}: ${String(r?.task ?? r?.objective ?? '').slice(0, 100)}`, target: null, scenarios, browser: null, limitations: [...base.limitations, `${mod} produced a plan / analysis only: every case is NOT_TESTED`] };
}

// ---- the one entry point every workflow uses -----------------------------------------------------------------------
// result: any DCore result. spec: --report <dir-or-prefix>. Returns a compact summary for the caller's evidence.
export async function reportFor(result, spec, { module, meta = {}, pdf = true, browser } = {}) {
  const { writeReports } = await import('./report.mjs');
  const { scenarioTestRun } = await import('./scenario.mjs');
  const { totalsOf } = await import('./scenario.mjs');
  const src = toReportSource(result, { module });
  const { dir, prefix } = reportTarget(spec);
  let tr; let source = null;
  if (src.kind === 'testrun') tr = src.tr;
  else { source = src.sr; source.totals = totalsOf(source.scenarios); tr = await scenarioTestRun(source, { outDir: dir }); }
  const files = await writeReports(tr, dir, { pdf, browser, source, meta, prefix: prefix ?? undefined });
  const docs = ['test_report', 'defect_report', 'test_case_register'];
  return {
    run_id: source?.run_id ?? JSON.parse(readFileSync(files.report_model, 'utf8')).run_id, source: src.kind, dir, prefix,
    final_status: JSON.parse(readFileSync(files.report_model, 'utf8')).final_status,
    pdfs: Object.fromEntries(docs.map((k) => [k, files[`${k}_pdf`]?.ok ? files[`${k}_pdf`].pdf : `NOT PRODUCED: ${files[`${k}_pdf`]?.error ?? 'unknown'}`])),
    consistency: files.consistency, secrets: Object.fromEntries(docs.map((k) => [k, files[`${k}_verified`]?.secrets_absent ?? null])), files,
  };
}
