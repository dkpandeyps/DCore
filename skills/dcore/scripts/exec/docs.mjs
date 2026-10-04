// dcore-report (M43) — evidence-backed PDF documentation for a DCore test execution. One report model (built from the
// unified evidence: a test run `dcore.testrun/1`, enriched by the scenario run `dcore.scenario-run/1` when there is
// one) feeds THREE separate documents: Detailed Test Report, Detailed Defect Report, Test Case Register.
// Nothing is invented: a value the evidence does not establish is UNKNOWN, a result that was not established keeps its
// status (NOT_TESTED / BLOCKED / NOT_APPLICABLE / SKIPPED), and root cause is never claimed. Rendering is deterministic:
// the same evidence gives byte-identical HTML (no wall-clock time, stable ordering). PDFs are printed by the local
// browser (dcore-browse printPdfs) with headers, footers, page numbers, a document outline and PDF metadata.
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { basename, relative } from 'node:path';

export const UNKNOWN = 'UNKNOWN';
export const ROOT_CAUSE_UNKNOWN = 'ROOT CAUSE: UNKNOWN — REQUIRES ENGINEERING INVESTIGATION';
export const DOCS = [
  { key: 'test_report', file: 'Detailed-Test-Report', title: 'Detailed Test Report' },
  { key: 'defect_report', file: 'Detailed-Defect-Report', title: 'Detailed Defect Report' },
  { key: 'test_case_register', file: 'Test-Case-Register', title: 'Test Case Register' },
];
const STATUS_ORDER = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'NOT_TESTED', 'NOT_APPLICABLE'];
const known = (x) => x !== undefined && x !== null && x !== '' && !(Array.isArray(x) && !x.length);
const v = (x) => (known(x) ? x : UNKNOWN);
const pad = (n) => String(n).padStart(3, '0');
const originOf = (u) => { try { return new URL(u).origin; } catch { return null; } };
const titleOf = (t) => String(t ?? '').replace(/ \[[A-Z][A-Za-z ]+(?:, P\d)?\]/g, '');   // scenario titles carry "[type, priority]" in the test run

// ---- model ------------------------------------------------------------------------------------------------------
// tr: dcore.testrun/1 (cases, defects, totals, verdict). opts.source: the dcore.scenario-run/1 it came from (optional).
// opts.meta: facts only a person can supply (application, build, objectives, assumptions, excluded scope).
export function buildReportModel(tr, { source: sr = null, meta = {} } = {}) {
  const scen = new Map((sr?.scenarios ?? []).map((s) => [s.scenario_id, s]));
  const evidence = []; const evIds = new Map();
  const ref = (path, caption, caseId = null, stepId = null) => {
    if (!path) return null;
    if (evIds.has(path)) return evIds.get(path);
    const id = `EV-${pad(evidence.length + 1)}`;
    evidence.push({ id, kind: /\.(png|jpe?g|webp)$/i.test(path) ? 'screenshot' : 'file', path, file: basename(path), caption, case_id: caseId, step_id: stepId, available: existsSync(path) });
    evIds.set(path, id); return id;
  };
  const defId = new Map((tr.defects ?? []).map((d, i) => [d.id, `DCORE-DEF-${pad(i + 1)}`]));

  // test cases (one per case of the run, in run order)
  const cases = (tr.cases ?? []).map((c) => {
    const s = scen.get(c.id);
    const steps = s ? (s.steps ?? []).map((st) => {
      const shot = ref(st.screenshot, `${c.id} · step ${st.step_id || '—'} (${st.action}) — ${st.status}`, c.id, st.step_id);
      return { id: st.step_id || '—', action: `${st.action}${st.target && st.target !== '—' ? ` ${st.target}` : ''}${st.input ? ` ← ${st.input}` : ''}`, expected: v(st.expected), actual: v(st.actual), status: st.status ?? UNKNOWN, url: st.url ?? null, timestamp: st.timestamp ?? null, evidence: shot ? [shot] : [] };
    }) : (c.steps ?? []).map((txt, i) => ({ id: `S${i + 1}`, action: String(txt), expected: UNKNOWN, actual: UNKNOWN, status: UNKNOWN, url: null, timestamp: null, evidence: [] }));
    const caseShots = [...(c.evidence ?? []), ...(s?.evidence ?? [])].map((p) => ref(p, `${c.id} — ${titleOf(s?.title ?? c.title)}: ${/-end\.png$/.test(p) ? 'final state' : 'evidence'}`, c.id)).filter(Boolean);
    const stamps = steps.map((x) => x.timestamp).filter(Boolean).sort();
    return {
      id: c.id, title: titleOf(s?.title ?? c.title), feature: v(s?.feature ?? c.area), module: v(s?.category ?? c.module ?? s?.negative?.label),
      type: v(s?.type ?? c.type), priority: v(s?.priority ?? c.priority), preconditions: v(s?.preconditions ?? c.preconditions),
      test_data: s && Object.keys(s.data ?? {}).length ? s.data : c.data ?? 'None declared', steps, expected: v(s?.expected ?? c.expected), actual: v(s?.actual ?? c.actual),
      status: c.result ?? UNKNOWN, negative_outcome: s?.negative_outcome ?? null, defect_ids: (c.defects ?? []).map((d) => defId.get(d) ?? d),
      evidence_refs: [...new Set([...caseShots, ...steps.flatMap((x) => x.evidence)])], executed_at: stamps[0] ?? null,
    };
  });
  const caseById = new Map(cases.map((c) => [c.id, c]));

  // defects
  const defects = (tr.defects ?? []).map((d, i) => {
    const id = `DCORE-DEF-${pad(i + 1)}`;
    const linked = (d.linked_cases ?? []).map((x) => caseById.get(x)).filter(Boolean);
    const src = (d.linked_cases ?? []).map((x) => scen.get(x)).find(Boolean);
    const failStep = src?.steps?.find((st) => st.status === 'FAIL') ?? src?.steps?.find((st) => st.status === 'BLOCKED') ?? null;
    const layer = layerOf(d, failStep);
    const shots = [...(d.evidence ?? []).map((p) => ref(p, `${id} — ${d.title}`)), ...(failStep?.screenshot ? [ref(failStep.screenshot, `${id} — failing step ${failStep.step_id} (${failStep.action})`)] : []), ...linked.flatMap((c) => c.evidence_refs)].filter(Boolean);
    const consoleEv = [...new Set([...(['frontend-runtime', 'frontend-console'].includes(d.category) ? [d.actual] : []), ...(failStep?.console_errors ?? [])])];
    const netEv = [...(['backend', 'network'].includes(d.category) ? [d.actual] : []), ...(failStep?.network_failures ?? []).map((n) => (n.status ? `${n.status} ${n.url}` : `${n.error ?? 'failed'} ${n.url ?? ''}`.trim()))];
    const api = failStep?.action === 'api' ? { request: failStep.target, result: failStep.actual, ...(failStep.module_evidence ?? {}) } : null;
    return {
      id, source_id: d.id, title: titleOf(d.title), application: null, environment: v(d.environment ?? tr.environment), test_run: null, date: failStep?.timestamp ?? sr?.ended_at ?? tr.ended_at ?? null,
      defect_type: v(d.defect_type_candidate?.value ?? d.category), layer, severity: v(d.severity), priority: v(d.priority),
      severity_basis: d.severity_candidate?.basis ?? (d.severity === 'unassessed' ? 'not established by the evidence' : `DCore rule for ${d.category} findings (confirm in triage)`),
      priority_basis: d.priority_candidate?.basis ?? 'derived from severity (confirm in triage)', confidence: v(d.confidence),
      summary: titleOf(d.title), business_impact: d.business_impact ?? 'NOT ESTABLISHED BY THE EVIDENCE — requires product assessment',
      technical: technicalOf(d, failStep), root_cause: ROOT_CAUSE_UNKNOWN, observed: v(d.actual), expected: v(d.expected),
      preconditions: linked[0]?.preconditions ?? (tr.setup?.steps?.length ? 'Setup steps completed (see the test report)' : 'None'),
      steps_to_reproduce: d.steps_to_reproduce?.length ? d.steps_to_reproduce : [UNKNOWN],
      evidence: { screenshots: [...new Set(shots)], url: failStep?.url ?? tr.target ?? null, console: consoleEv, network: netEv, api, step: failStep ? `${src.scenario_id} / ${failStep.step_id} (${failStep.action})` : (d.linked_cases ?? []).join(', ') || 'observed outside a test case (setup or run-level signal)', timestamp: failStep?.timestamp ?? null },
      linked_cases: d.linked_cases ?? [], defect_candidate: d.defect_candidate ?? null,
      recommendation: recommend(d, failStep, linked), acceptance_criteria: acceptance(d, linked, failStep),
    };
  });

  const t = tr.totals ?? {};
  const executed = (t.PASS ?? 0) + (t.FAIL ?? 0);
  const setupSteps = sr?.setup?.steps ?? [];
  const envVars = [...new Set([...setupSteps.map((x) => x.input), ...(tr.setup?.steps ?? [])].join(' ').match(/\$\{(\w+)\}/g) ?? [])].map((x) => x.slice(2, -1));
  const hasSetup = setupSteps.length || (tr.setup?.steps ?? []).length;
  const obs = tr.observations ?? {};
  const b = sr?.browser ?? {};
  const model = {
    schema: 'dcore.report-model/1',
    run_id: sr?.run_id ?? meta.run_id ?? String(tr.name ?? '').match(/run-\d{8}T\d{6}-[0-9a-f]+/)?.[0] ?? UNKNOWN,
    name: titleOf(sr?.name ?? tr.name) || UNKNOWN, application: v(meta.application ?? originOf(tr.target ?? sr?.target)), target: v(tr.target ?? sr?.target),
    environment: v(tr.environment ?? sr?.environment), build: v(meta.build), started_at: v(tr.started_at ?? sr?.started_at), ended_at: v(tr.ended_at ?? sr?.ended_at),
    executed_by: v(tr.executed_by), browser: v(b.browser ?? tr.browser), browser_version: v(b.version), os: v(sr?.host?.os ?? meta.os), viewport: v(b.viewport ?? meta.viewport),
    auth_context: !hasSetup ? 'Anonymous: no setup / login steps' : `${envVars.length ? `Signed in by the setup steps with credentials from environment variables ${envVars.join(', ')} (values never recorded)` : 'Signed in by the setup steps (no credential values recorded)'}; setup result ${v(sr?.setup?.status ?? tr.setup?.result)}`,
    approvals: sr?.approvals?.length ? sr.approvals : [],
    totals: { cases: t.cases ?? cases.length, PASS: t.PASS ?? 0, FAIL: t.FAIL ?? 0, BLOCKED: t.BLOCKED ?? 0, SKIPPED: t.SKIPPED ?? 0, NOT_TESTED: t.NOT_TESTED ?? 0, NOT_APPLICABLE: t.NOT_APPLICABLE ?? 0, executed },
    pass_percentage: executed ? { value: Math.round(((t.PASS ?? 0) / executed) * 1000) / 10, basis: `${t.PASS ?? 0} passed of ${executed} executed to a verdict (PASS + FAIL); BLOCKED / SKIPPED / NOT_TESTED / NOT_APPLICABLE are excluded` } : { value: null, basis: 'NOT APPLICABLE — no case was executed to a verdict' },
    scope: {
      objectives: meta.objectives ?? [`Execute the ${cases.length} test case(s) of this run against ${v(tr.target)} and report only what the evidence establishes`],
      included: tr.scope?.length ? tr.scope : [UNKNOWN], excluded: [...(meta.excluded ?? []), ...(tr.out_of_scope ?? [])].length ? [...(meta.excluded ?? []), ...(tr.out_of_scope ?? [])] : ['None declared'],
      assumptions: meta.assumptions ?? ['None declared'], limitations: tr.limitations ?? [],
    },
    cases, defects, defects_by_severity: tr.defects_by_severity ?? {},
    observations: {
      page_errors: [...new Set(obs.page_errors ?? [])], console_errors: [...new Set(obs.console_errors ?? [])], network_failures: (obs.network_failures ?? []).map((n) => (n.status ? `${n.status} ${n.url}` : `${n.error ?? 'failed'}${n.type ? ` (${n.type})` : ''}`)),
      http_4xx: (obs.http_4xx ?? []).map((n) => `${n.status} ${n.url}`), a11y: a11yOf(obs.a11y ?? []), responsive: responsiveOf(b.responsive ?? [], cases),
      simulated_faults: (b.simulated_faults ?? []).length, write_requests: (b.write_requests ?? []).length,
    },
    final_status: v(tr.verdict), evidence,
    completeness: completenessOf(cases),
    browser_coverage: browserCoverageOf(sr, tr, cases),
  };
  for (const d of model.defects) { d.application = model.application; d.test_run = model.run_id; }
  // a run where nothing reached a verdict is BLOCKED or NOT TESTED — never "failed" or "passed"
  if (!executed) model.final_status = model.totals.BLOCKED ? `BLOCKED — ${model.totals.BLOCKED} of ${model.totals.cases} case(s) blocked; nothing was executed to a verdict` : `NOT TESTED — nothing was executed to a verdict (${model.totals.cases} case(s))`;
  else if (model.completeness.partial) model.final_status = `${model.final_status} — PARTIAL RUN: ${model.completeness.note}`;
  model.recommendations = runRecommendations(model);
  return model;
}

function browserCoverageOf(sr, tr, cases) {
  const rows = (sr?.browser_coverage ?? []).map((r) => ({ browser: r.browser, version: v(r.version), os: v(r.os), viewport: v(r.viewport), scenario: r.scenario, status: r.status, evidence: (r.evidence ?? []).length ? `${r.evidence.length} screenshot(s)` : '—', limitations: (r.limitations ?? []).join('; ') || '—' }));
  if (!rows.length && (sr?.browser || tr?.browser)) {
    const b = sr?.browser ?? {}; const count = (st) => cases.filter((c) => c.status === st).length;
    rows.push({ browser: v(b.browser ?? tr?.browser), version: v(b.version), os: v(sr?.host?.os), viewport: v(b.viewport), scenario: `all ${cases.length} case(s)`, status: ['PASS', 'FAIL', 'BLOCKED', 'NOT_TESTED', 'SKIPPED', 'NOT_APPLICABLE'].filter((x) => count(x)).map((x) => `${x} ${count(x)}`).join(' · ') || 'NOT_TESTED', evidence: 'see the evidence index', limitations: 'single browser and viewport in this run' });
  }
  const ran = new Set(rows.map((r) => String(r.browser).split(/[ ,]/)[0]));
  const others = (sr?.host?.browsers ?? []).filter((b) => !rows.some((r) => String(r.browser).includes(b.family)) && !ran.has(b.family));
  for (const b of others) rows.push({ browser: b.family, version: UNKNOWN, os: v(sr?.host?.os), viewport: '—', scenario: '*', status: b.drivable ? 'NOT_TESTED' : b.available ? 'NOT_TESTED' : 'NOT_AVAILABLE', evidence: '—', limitations: b.drivable ? 'installed and drivable, but not part of this run' : b.reason ?? 'not available' });
  const engines = new Set(rows.filter((r) => ['PASS', 'FAIL'].some((x) => String(r.status).includes(x))).map((r) => (/firefox|webkit|safari/i.test(r.browser) ? r.browser : 'chromium')));
  return { rows, claim: !engines.size ? 'No browser executed a test to a verdict.' : engines.size === 1 && engines.has('chromium') ? 'Chromium-engine coverage only: this is NOT a cross-browser compatibility claim.' : `Engines that executed tests: ${[...engines].join(', ')}.` };
}
function completenessOf(cases) {
  const steps = cases.flatMap((c) => c.steps);
  const ran = steps.filter((s) => ['PASS', 'FAIL'].includes(s.status)).length;
  const stopped = cases.filter((c) => c.steps.some((s) => ['FAIL', 'BLOCKED'].includes(s.status)) && c.steps.some((s) => ['SKIPPED', 'NOT_TESTED'].includes(s.status)));
  const notRun = stopped.reduce((n, c) => n + c.steps.filter((s) => ['SKIPPED', 'NOT_TESTED'].includes(s.status)).length, 0);
  return { steps_total: steps.length, steps_executed: ran, partial: stopped.length > 0, note: stopped.length ? `execution stopped early in ${stopped.length} case(s) (${stopped.map((c) => c.id).join(', ')}); ${notRun} later step(s) did not run` : 'every step that was reached ran to completion' };
}
function layerOf(d, st) {
  const c = String(d.category ?? '');
  if (c === 'backend') return 'Backend / API (HTTP 5xx response observed)';
  if (c === 'network') return 'Network / integration (request failed in the browser)';
  if (c === 'frontend-runtime') return 'Frontend (uncaught JavaScript exception)';
  if (c === 'frontend-console') return 'Frontend (console error)';
  if (c === 'accessibility') return 'Frontend (accessibility)';
  if (c === 'ui') return 'Frontend (UI / layout)';
  if (c === 'performance') return 'Performance (measured in the browser)';
  if (/^Security/.test(c) || c === 'security') return 'Security (access control)';
  if (/^Validation|Input handling|Functional — valid/.test(c)) return 'Frontend (client-side validation; server-side not exercised)';
  if (c === 'Error handling') return 'Frontend (handling of API failures)';
  if (st?.action === 'api') return 'API';
  // the failing check itself was about runtime signals: the layer follows from what was observed during the step
  const failed = (st?.checks ?? []).filter((x) => x.status === 'FAIL').map((x) => x.label ?? '').join(' ');
  const net5xx = (st?.network_failures ?? []).some((n) => n.status >= 500);
  if (/runtime errors|uncaught/.test(failed) && (st.console_errors ?? []).length) return net5xx ? 'Frontend and backend (uncaught exceptions and 5xx responses during the step)' : 'Frontend (uncaught JavaScript exception / console error during the step)';
  if (/failed requests/.test(failed) && net5xx) return 'Backend / API (5xx response during the step)';
  return 'UNKNOWN — the failing check does not establish the layer';
}
function technicalOf(d, st) {
  const c = d.category;
  if (c === 'frontend-runtime') { const m = String(d.actual).match(/\(([^()]+:\d+)\)\s*$/); return `The browser reported an uncaught exception: ${d.actual}.${m ? ` The location reported by the browser is ${m[1]}.` : ''}`; }
  if (c === 'frontend-console') return `The page wrote an error to the browser console: ${d.actual}.`;
  if (c === 'backend') return `The server answered with an HTTP 5xx status: ${d.actual}.`;
  if (c === 'network') return `A request failed in the browser: ${d.actual}.`;
  if (c === 'accessibility') return `An automated accessibility heuristic failed: ${d.actual}`;
  if (st) return `Step ${st.step_id} (${st.action}${st.target && st.target !== '—' ? ` ${st.target}` : ''}) ${st.status === 'BLOCKED' ? 'could not run' : 'did not meet its expectation'}: ${st.actual}`;
  return `Observed: ${d.actual}`;
}
const locOf = (d) => String(d.actual ?? '').match(/\(([^()]+:\d+)\)\s*$/)?.[1] ?? null;
function recommend(d, st, linked) {
  const cases = linked.map((c) => c.id).join(', ') || 'the linked test cases';
  const area = [...new Set(linked.map((c) => c.feature).filter((x) => x !== UNKNOWN))].join(', ') || UNKNOWN;
  const c = d.category;
  const base = { investigation: `Reproduce with the steps above and the browser developer tools open; compare the observed and expected behaviour${st?.timestamp ? `; correlate with server logs around ${st.timestamp}` : ''}.`, regression: `Re-run ${cases} and the other cases of the same feature (${area}); confirm no new console errors or failed requests appear.` };
  if (c === 'frontend-runtime') return { ...base, fix: 'Make the failing operation handle the state it encountered instead of throwing (validate the value / element before use, catch and report errors).', area: locOf(d) ?? area };
  if (c === 'frontend-console') return { ...base, fix: 'Remove the condition that writes the console error, or handle it and report it to the user where relevant.', area };
  if (c === 'backend') return { ...base, fix: 'Make the endpoint return a successful or well-formed error response; a 5xx indicates an unhandled server-side condition.', area: `Server handler for ${String(d.actual).replace(/^\d+\s+/, '')}`, investigation: `Check the server logs for the failing request${st?.timestamp ? ` around ${st.timestamp}` : ''}; reproduce the request directly (dcore-api).` };
  if (c === 'network') return { ...base, fix: 'Make the request reachable (URL, CORS, certificate, availability) or handle its failure in the page.', area };
  if (c === 'accessibility') return { ...base, fix: `Fix the elements listed in the observed behaviour so the "${d.title.replace(/^Accessibility:\s*/, '')}" check passes.`, area, investigation: 'Confirm with assistive technology (screen reader / keyboard only); automated heuristics are not a WCAG audit.' };
  if (d.defect_candidate) return { ...base, fix: `Make the application meet the negative expectation: ${d.expected}`, area };
  if (/NEEDS TRIAGE/.test(d.confidence ?? '')) return { ...base, fix: 'First establish whether the application changed or the test locator is outdated; fix whichever is wrong.', area };
  return { ...base, fix: `Restore the expected behaviour: ${d.expected}`, area };
}
function acceptance(d, linked, st) {
  const ac = []; const add = (x) => { if (x && !ac.includes(x)) ac.push(x); };
  const cases = linked.map((c) => c.id);
  if (d.defect_candidate || (d.expected && !/^No (uncaught|console)|Requests succeed|Check passes/.test(d.expected))) add(String(d.expected).replace(/\.?$/, '.'));
  if (d.category === 'frontend-runtime') add(`No uncaught JavaScript exception "${String(d.actual).replace(/\s*\([^()]+:\d+\)\s*$/, '').slice(0, 100)}" occurs${cases.length ? ` while executing ${cases.join(', ')}` : ' on the affected page(s)'}.`);
  if (d.category === 'frontend-console') add('The console error no longer appears on the affected page(s).');
  if (d.category === 'backend') add(`The request ${String(d.actual).replace(/^\d+\s+/, '')} returns a non-5xx response for the same input.`);
  if (d.category === 'network') add(`The request "${d.actual}" completes without a network error.`);
  if (d.category === 'accessibility') add(`The "${d.title.replace(/^Accessibility:\s*/, '').replace(/\s*\(\d+\)$/, '')}" accessibility check passes on the affected page(s).`);
  if (st?.action === 'api' && st.expected) add(`The API step returns ${st.expected}.`);
  if (cases.length) add(`Re-executing ${cases.join(', ')} gives PASS with every expected outcome verified.`);
  add('No new uncaught exception, console error or failed request is introduced on the affected page(s).');
  return ac.map((text, i) => ({ id: `AC-${String(i + 1).padStart(2, '0')}`, text }));
}
const A11Y = { lang: 'Page has no lang attribute', title: 'Page has no title', img_alt: 'Images without alt text', form_labels: 'Form fields without an accessible name', control_names: 'Buttons/links without an accessible name', duplicate_ids: 'Duplicate element ids', headings: 'Heading structure', landmarks: 'No main landmark', focus: 'Focus visibility', contrast: 'Low text contrast' };
function a11yOf(runs) {
  const m = new Map();
  for (const r of runs) for (const [k, x] of Object.entries(r ?? {})) if (x && x.ok === false && !m.has(k)) m.set(k, { check: A11Y[k] ?? k, count: x.count ?? null, samples: (x.samples ?? []).slice(0, 5) });
  return [...m.values()];
}
function responsiveOf(findings, cases) {
  const out = findings.map((f) => `At ${f.width}px the page lays out at ${f.layout_width}px${f.has_meta_viewport ? '' : ' (no <meta name="viewport">)'}`);
  for (const c of cases.filter((x) => x.type === 'Responsive' || /mobile|viewport|responsive/i.test(x.title))) out.push(`${c.id} ${c.title}: ${c.status}`);
  return [...new Set(out)];
}
function runRecommendations(m) {
  const r = []; const t = m.totals;
  if (t.FAIL) r.push(`Fix and re-test the ${t.FAIL} failed case(s); the defect report gives reproduction steps and acceptance criteria for each defect.`);
  const blocked = m.cases.filter((c) => c.status === 'BLOCKED');
  if (blocked.length) {
    const appr = blocked.filter((c) => /APPROVAL_REQUIRED/.test(c.actual)).length; const tpl = blocked.filter((c) => /unresolved template/.test(JSON.stringify(c.steps))).length;
    r.push(`Unblock ${blocked.length} case(s)${appr ? `: ${appr} need an explicit approval to run` : ''}${tpl ? `${appr ? ',' : ':'} ${tpl} need review values ({{data.*}})` : ''}; a blocked case proves nothing either way.`);
  }
  if (t.NOT_TESTED) r.push(`${t.NOT_TESTED} case(s) were not tested; they remain open risk until executed.`);
  const un = m.defects.filter((d) => d.severity === 'unassessed').length;
  if (un) r.push(`Triage ${un} defect(s) whose severity the evidence could not establish (severity UNASSESSED).`);
  if (m.observations.page_errors.length || m.observations.network_failures.length) r.push('Investigate the runtime errors and failed requests listed in the observations even where no test case failed on them.');
  if (m.observations.a11y.length) r.push('Review the accessibility observations with assistive technology; the automated checks are heuristics, not a WCAG audit.');
  if (!r.length) r.push(m.totals.executed ? 'No defect was found in the executed scope; extend coverage to the excluded scope before relying on this result outside it.' : 'Nothing was executed to a verdict: run the test cases before drawing any conclusion.');
  return r;
}

// ---- rendering --------------------------------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const statusBadge = (s) => `<span class="st st-${esc(String(s).replace(/[^A-Z_]/gi, ''))}">${esc(String(s).replace(/_/g, ' '))}</span>`;
const sevBadge = (s) => `<span class="sev sev-${esc(String(s).toLowerCase().replace(/[^a-z]/g, ''))}">${esc(String(s).toUpperCase())}</span>`;
const prioBadge = (p) => `<span class="prio">${esc(p)}</span>`;
const list = (xs) => (xs?.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">None.</p>');
const kv = (rows) => `<table class="kv">${rows.map(([k, x]) => `<tr><th>${esc(k)}</th><td>${x}</td></tr>`).join('')}</table>`;
const data = (x) => (typeof x === 'string' ? esc(x) : `<code>${esc(JSON.stringify(x))}</code>`);
const unk = (x) => (x === UNKNOWN ? '<span class="unknown">UNKNOWN</span>' : esc(x));
const BRAND = '<svg class="logo" viewBox="0 0 120 32" role="img" aria-label="DCore"><rect x="0" y="2" width="28" height="28" rx="6" fill="#2b1a6e"/><path d="M8 9h7a7 7 0 0 1 0 14H8z" fill="none" stroke="#fff" stroke-width="3"/><text x="36" y="23" font-family="Segoe UI,Arial,sans-serif" font-size="19" font-weight="700" fill="#2b1a6e">DCore</text></svg>';

const CSS = (landscape) => `@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:18mm 13mm 17mm 13mm}@page:first{margin:0}@page wide{size:A4 landscape;margin:18mm 11mm 17mm 11mm}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font:10pt/1.45 "Segoe UI",Arial,Helvetica,sans-serif;color:#1b1e27;margin:0}
.cover{page-break-after:always;height:${landscape ? '210mm' : '297mm'};padding:24mm 22mm;display:flex;flex-direction:column;background:linear-gradient(180deg,#f4f1fd 0,#fff 46%)}
.cover .logo{width:150px;height:40px}.cover .kind{margin-top:22mm;color:#4b2ab8;font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:10pt}
.cover h1{font-size:28pt;line-height:1.15;margin:4mm 0 2mm;color:#1b1340}.cover .sub{font-size:12pt;color:#4a4f60;margin-bottom:12mm}.cover table.kv{max-width:${landscape ? '210mm' : '150mm'}}
.cover .foot{margin-top:auto;font-size:8.5pt;color:#5b6070;border-top:1px solid #d9d5ea;padding-top:4mm}
h2{font-size:14pt;color:#2b1a6e;margin:0 0 3mm;padding-bottom:1.5mm;border-bottom:2px solid #4b2ab8;page-break-after:avoid}h3{font-size:11.5pt;color:#1b1340;margin:5mm 0 2mm;page-break-after:avoid}h4{font-size:10pt;margin:3.5mm 0 1.5mm;color:#2b1a6e;page-break-after:avoid}
section{margin-bottom:7mm}section.break{page-break-before:always}.wide{page:wide}p{margin:1.5mm 0}ul{margin:1mm 0 1mm 5mm;padding-left:3mm}.muted{color:#6b7080}
table{border-collapse:collapse;width:100%;margin:2mm 0 4mm}th,td{border:1px solid #d6d3e4;padding:1.6mm 2mm;vertical-align:top;text-align:left;font-size:8.6pt;overflow-wrap:anywhere}thead th{background:#ece8fa;color:#1b1340;font-weight:600;overflow-wrap:normal;word-break:keep-all}td.id{white-space:nowrap;font-weight:600}table.reg{table-layout:fixed}table.reg th,table.reg td{font-size:7.2pt;padding:1.2mm 1.3mm}table.reg td.rid{font-weight:700;overflow-wrap:normal;word-break:break-word}table.reg ol{margin:0;padding-left:3.5mm}
thead{display:table-header-group}tr{page-break-inside:avoid}table.kv th{width:42mm;background:#f6f4fc;font-weight:600;color:#3d3f4c}table.kv td,table.kv th{font-size:9pt}
.tiles{display:flex;flex-wrap:wrap;gap:2.5mm;margin:3mm 0}.tile{border:1px solid #d6d3e4;border-radius:2mm;padding:2.5mm 3.5mm;min-width:27mm}.tile b{display:block;font-size:16pt;color:#1b1340}.tile span{font-size:8pt;color:#5b6070;text-transform:uppercase;letter-spacing:.05em}
.st{display:inline-block;font-weight:700;font-size:7.6pt;padding:.4mm 1.6mm;border-radius:1mm;border:1px solid;white-space:nowrap}.st-PASS{background:#e2f4e6;color:#11602a;border-color:#7cc58f}.st-FAIL{background:#fde3e1;color:#9b1c13;border-color:#e59a93}.st-BLOCKED{background:#fdebd2;color:#8a4b00;border-color:#e3b26e}.st-SKIPPED,.st-NOT_TESTED,.st-NOT_APPLICABLE,.st-NOT_AVAILABLE,.st-UNKNOWN{background:#eceef2;color:#3f4350;border-color:#b9bdc8}
.sev{display:inline-block;font-weight:700;font-size:7.6pt;padding:.4mm 1.6mm;border-radius:1mm;border:1px solid}.sev-critical{background:#9b1c13;color:#fff;border-color:#9b1c13}.sev-high{background:#fde3e1;color:#9b1c13;border-color:#9b1c13}.sev-medium{background:#fdebd2;color:#8a4b00;border-color:#c98a2e}.sev-low{background:#eceef2;color:#3f4350;border-color:#9aa0ad}.sev-unassessed,.sev-unknown{background:#fff;color:#4b2ab8;border:1px dashed #4b2ab8}
.prio{display:inline-block;font-weight:700;font-size:7.6pt;padding:.4mm 1.6mm;border-radius:1mm;border:1px solid #4b2ab8;color:#2b1a6e}.unknown{color:#6b4fd0;font-weight:600}
.verdict{border-left:4px solid #4b2ab8;background:#f5f3fd;padding:3mm 4mm;font-weight:600;margin:3mm 0}.callout{border:1px solid #d6d3e4;border-left:4px solid #9b1c13;padding:2.5mm 3.5mm;margin:2mm 0;font-weight:600;color:#7a1810}
.defect{page-break-before:always}.defect:first-of-type{page-break-before:auto}figure{margin:3mm 0;page-break-inside:avoid}figure img{max-width:100%;max-height:110mm;border:1px solid #c9c6d8}figcaption{font-size:8pt;color:#4a4f60;margin-top:1mm}
code{font:8.2pt Consolas,"Courier New",monospace;background:#f3f2f8;padding:0 1mm;overflow-wrap:anywhere}.toc ol{margin:0;padding-left:0;list-style:none}.toc li{margin:1mm 0}.ref{font:8pt Consolas,monospace;color:#2b1a6e}`;

function cover(m, doc, extra = []) {
  return `<div class="cover">${BRAND}<div class="kind">${esc(doc.title)}</div><h1>${esc(m.name)}</h1><div class="sub">Evidence-backed test documentation generated by DCore</div>
${kv([['Test run ID', esc(m.run_id)], ['Application', unk(m.application)], ['Environment', unk(m.environment)], ['Build / version', unk(m.build)], ['Executed', `${unk(m.started_at)} → ${unk(m.ended_at)}`], ['Browser', `${unk(m.browser)} ${m.browser_version === UNKNOWN ? '(version UNKNOWN)' : esc(m.browser_version)}`], ['Operating system', unk(m.os)], ['Viewport', unk(m.viewport)], ['Authentication context', esc(m.auth_context)], ...extra])}
<div class="foot">Every statement in this document is derived from recorded execution evidence. Values the evidence does not establish are shown as UNKNOWN; results that were not established keep their status (NOT TESTED, BLOCKED, NOT APPLICABLE, SKIPPED). No credential value is recorded.</div></div>`;
}
// no defects: an explicit statement, never an empty table
const noDefects = (m) => `<p class="nodef"><b>No defects identified during this test run.</b></p><p class="muted">${m.totals.executed ? 'This covers the executed scope only; it does not prove the absence of defects outside it.' : 'Nothing was executed to a verdict, so the absence of defects establishes nothing.'}</p>`;
const toc = (items) => `<section class="toc"><h2>Contents</h2><ol>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>`;
const page = (m, doc, body, landscape = false) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(`${doc.title} — ${m.name}`)}</title><meta name="author" content="DCore"><meta name="description" content="${esc(`${doc.title} for test run ${m.run_id}`)}"><meta name="generator" content="DCore dcore-report"><style>${CSS(landscape)}</style></head><body>${body}</body></html>`;
const figure = (m, id, dir) => { const e = m.evidence.find((x) => x.id === id); if (!e || e.kind !== 'screenshot' || !e.available) return ''; return `<figure><img src="${esc(relative(dir, e.path).replace(/\\/g, '/'))}" alt="${esc(e.caption)}"><figcaption>${esc(id)} — ${esc(e.caption)} (${esc(e.file)})</figcaption></figure>`; };
const tiles = (m) => `<div class="tiles">${[['Total', m.totals.cases], ['Passed', m.totals.PASS], ['Failed', m.totals.FAIL], ['Blocked', m.totals.BLOCKED], ['Skipped', m.totals.SKIPPED], ['Not tested', m.totals.NOT_TESTED], ['Not applicable', m.totals.NOT_APPLICABLE], ['Pass %', m.pass_percentage.value === null ? 'N/A' : `${m.pass_percentage.value}%`]].map(([k, x]) => `<div class="tile"><b>${esc(x)}</b><span>${esc(k)}</span></div>`).join('')}</div>`;

export function renderTestReportDoc(m, dir) {
  const doc = DOCS[0]; const S = ['Executive summary', 'Test scope', 'Environment', 'Browser coverage', 'Scenario execution summary', 'Detailed execution', 'Defect summary', 'Console errors', 'Network failures', 'Accessibility observations', 'Responsive observations', 'Final evidence-based status', 'Recommendations', 'Evidence index'];
  const n = (i) => `${i + 1}. ${S[i]}`;
  const sev = m.defects_by_severity;
  const execRows = m.cases.flatMap((c) => (c.steps.length ? c.steps : [{ id: '—', action: '(no steps)', expected: c.expected, actual: c.actual, status: c.status, evidence: [] }]).map((s, i) => `<tr><td>${i ? '' : `<b>${esc(c.id)}</b><br>${esc(c.title)}`}</td><td>${esc(s.id)}</td><td>${esc(s.action)}</td><td>${unk(s.expected)}</td><td>${unk(s.actual)}</td><td>${statusBadge(s.status)}</td><td class="ref">${esc(s.evidence.join(', ') || '—')}</td></tr>`)).join('');
  const body = `${cover(m, doc, [['Final status', esc(m.final_status)], ['Completeness', esc(`${m.completeness.steps_executed} of ${m.completeness.steps_total} step(s) executed; ${m.completeness.note}`)]])}${toc(S.map((_, i) => n(i)))}
<section class="break"><h2>${n(0)}</h2><div class="verdict">${esc(m.final_status)}</div>${tiles(m)}
<p><b>Pass percentage:</b> ${m.pass_percentage.value === null ? '' : `${esc(m.pass_percentage.value)}% — `}${esc(m.pass_percentage.basis)}.</p>
<p><b>Defects:</b> ${m.defects.length} (critical ${esc(sev.critical ?? 0)} · high ${esc(sev.high ?? 0)} · medium ${esc(sev.medium ?? 0)} · low ${esc(sev.low ?? 0)}${sev.unassessed ? ` · unassessed ${esc(sev.unassessed)}` : ''}).</p></section>
<section><h2>${n(1)}</h2><h3>Objectives</h3>${list(m.scope.objectives)}<h3>Included scope</h3>${list(m.scope.included)}<h3>Excluded scope</h3>${list(m.scope.excluded)}<h3>Assumptions</h3>${list(m.scope.assumptions)}<h3>Limitations</h3>${list(m.scope.limitations)}</section>
<section><h2>${n(2)}</h2>${kv([['Application', unk(m.application)], ['Target', unk(m.target)], ['Environment', unk(m.environment)], ['Build / version', unk(m.build)], ['Browser', unk(m.browser)], ['Browser version', unk(m.browser_version)], ['Operating system', unk(m.os)], ['Viewport', unk(m.viewport)], ['Authentication context', esc(m.auth_context)], ['Approvals granted', esc(m.approvals.join(', ') || 'none')], ['Executed by', unk(m.executed_by)], ['Started', unk(m.started_at)], ['Ended', unk(m.ended_at)]])}</section>
<section><h2>${n(3)}</h2><div class="verdict">${esc(m.browser_coverage.claim)}</div>${m.browser_coverage.rows.length ? `<table><thead><tr><th>Browser</th><th>Version</th><th>OS</th><th>Viewport</th><th>Scenario</th><th>Status</th><th>Evidence</th><th>Limitations</th></tr></thead><tbody>${m.browser_coverage.rows.map((r) => `<tr><td>${esc(r.browser)}</td><td>${unk(r.version)}</td><td>${unk(r.os)}</td><td>${unk(r.viewport)}</td><td>${esc(r.scenario)}</td><td>${/^[A-Z_]+$/.test(r.status) ? statusBadge(r.status) : esc(r.status)}</td><td>${esc(r.evidence)}</td><td>${esc(r.limitations)}</td></tr>`).join('')}</tbody></table>` : '<p>No browser information was recorded for this run.</p>'}</section>
<section class="break"><h2>${n(4)}</h2><table><thead><tr><th>ID</th><th>Test case</th><th>Feature</th><th>Type</th><th>Priority</th><th>Status</th><th>Defects</th></tr></thead><tbody>${m.cases.map((c) => `<tr><td class="id">${esc(c.id)}</td><td>${esc(c.title)}</td><td>${unk(c.feature)}</td><td>${unk(c.type)}</td><td>${c.priority === UNKNOWN ? unk(c.priority) : prioBadge(c.priority)}</td><td>${statusBadge(c.status)}</td><td>${esc(c.defect_ids.join(', ') || '—')}</td></tr>`).join('')}</tbody></table></section>
<section class="wide break"><h2>${n(5)}</h2><table><thead><tr><th style="width:17%">Test case</th><th style="width:4%">Step</th><th style="width:19%">Action</th><th style="width:20%">Expected result</th><th style="width:25%">Actual result</th><th style="width:7%">Status</th><th style="width:8%">Evidence</th></tr></thead><tbody>${execRows}</tbody></table></section>
<section class="break"><h2>${n(6)}</h2>${m.defects.length ? `<table><thead><tr><th>Defect</th><th>Title</th><th>Severity</th><th>Priority</th><th>Type</th><th>Cases</th></tr></thead><tbody>${m.defects.map((d) => `<tr><td class="id">${esc(d.id)}</td><td>${esc(d.title)}</td><td>${sevBadge(d.severity)}</td><td>${prioBadge(d.priority)}</td><td>${unk(d.defect_type)}</td><td>${esc(d.linked_cases.join(', ') || '—')}</td></tr>`).join('')}</tbody></table><p class="muted">Full details, reproduction steps and acceptance criteria: Detailed Defect Report.</p>` : noDefects(m)}</section>
<section><h2>${n(7)}</h2><h3>Uncaught exceptions</h3>${list(m.observations.page_errors)}<h3>Console errors</h3>${list(m.observations.console_errors)}</section>
<section><h2>${n(8)}</h2><h3>Failed requests and 5xx responses</h3>${list(m.observations.network_failures)}<h3>4xx responses</h3>${list(m.observations.http_4xx)}${m.observations.simulated_faults ? `<p class="muted">${esc(m.observations.simulated_faults)} request(s) were answered by simulated faults inside the test browser (negative testing); they are not listed as failures.</p>` : ''}</section>
<section><h2>${n(9)}</h2>${m.observations.a11y.length ? `<table><thead><tr><th>Check</th><th>Count</th><th>Examples</th></tr></thead><tbody>${m.observations.a11y.map((a) => `<tr><td>${esc(a.check)}</td><td>${esc(a.count ?? '—')}</td><td>${esc(a.samples.join(' | ') || '—')}</td></tr>`).join('')}</tbody></table><p class="muted">Automated heuristics, not a WCAG audit.</p>` : '<p>No accessibility check failed in this run (or none was executed).</p>'}</section>
<section><h2>${n(10)}</h2>${list(m.observations.responsive)}</section>
<section><h2>${n(11)}</h2><div class="verdict">${esc(m.final_status)}</div><p>${esc(m.totals.executed)} of ${esc(m.totals.cases)} case(s) were executed to a verdict; ${esc(m.totals.BLOCKED + m.totals.NOT_TESTED + m.totals.SKIPPED + m.totals.NOT_APPLICABLE)} were not (blocked, not tested, skipped or not applicable) and establish nothing about the application.</p></section>
<section><h2>${n(12)}</h2>${list(m.recommendations)}</section>
<section class="break"><h2>${n(13)}</h2>${m.evidence.length ? `<table><thead><tr><th>Ref</th><th>Kind</th><th>File</th><th>Test case</th><th>Step</th><th>Caption</th></tr></thead><tbody>${m.evidence.map((e) => `<tr><td class="ref">${esc(e.id)}</td><td>${esc(e.kind)}${e.available ? '' : ' (file missing)'}</td><td>${esc(e.file)}</td><td>${esc(e.case_id ?? '—')}</td><td>${esc(e.step_id ?? '—')}</td><td>${esc(e.caption)}</td></tr>`).join('')}</tbody></table>${m.cases.filter((c) => ['FAIL', 'BLOCKED'].includes(c.status)).slice(0, 12).map((c) => figure(m, c.evidence_refs[0], dir)).join('')}` : '<p>No evidence files were recorded.</p>'}</section>`;
  return page(m, doc, body);
}

export function renderDefectReportDoc(m, dir) {
  const doc = DOCS[1];
  const one = (d) => `<section class="defect"><h2>${esc(d.id)} — ${esc(d.title)}</h2>
<h3>1. Identification</h3>${kv([['Defect ID', esc(d.id)], ['Title', esc(d.title)], ['Application', unk(d.application)], ['Environment', unk(d.environment)], ['Build / version', unk(m.build)], ['Test run', esc(d.test_run)], ['Date', unk(v(d.date))]])}
<h3>2. Classification</h3>${kv([['Defect type', unk(d.defect_type)], ['Layer', unk(d.layer)], ['Severity', `${sevBadge(d.severity)} <span class="muted">${esc(d.severity_basis)}</span>`], ['Priority', `${prioBadge(d.priority)} <span class="muted">${esc(d.priority_basis)}</span>`], ['Confidence', unk(d.confidence)]])}
<h3>3. Description</h3>${kv([['Summary', esc(d.summary)], ['Business impact', esc(d.business_impact)], ['Technical explanation', esc(d.technical)], ['Observed behaviour', unk(d.observed)], ['Expected behaviour', unk(d.expected)]])}<div class="callout">${esc(d.root_cause)}</div>
<h3>4. Reproduction</h3>${kv([['Preconditions', unk(d.preconditions)], ['Expected result', unk(d.expected)], ['Actual result', unk(d.observed)]])}<h4>Steps to reproduce</h4><ol>${d.steps_to_reproduce.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
<h3>5. Evidence</h3>${kv([['Execution step', esc(d.evidence.step)], ['URL', unk(v(d.evidence.url))], ['Timestamp', unk(v(d.evidence.timestamp))], ['Screenshots', `<span class="ref">${esc(d.evidence.screenshots.join(', ') || 'none recorded')}</span>`], ['Console errors', d.evidence.console.length ? list(d.evidence.console) : 'none recorded'], ['Network evidence', d.evidence.network.length ? list(d.evidence.network) : 'none recorded'], ['API evidence', d.evidence.api ? data(d.evidence.api) : 'not applicable (no API step)']])}${d.evidence.screenshots.slice(0, 2).map((id) => figure(m, id, dir)).join('')}
<h3>6. Recommendation</h3>${kv([['Recommended fix', esc(d.recommendation.fix)], ['Likely affected area', unk(d.recommendation.area)], ['Investigation', esc(d.recommendation.investigation)], ['Regression considerations', esc(d.recommendation.regression)]])}
<h3>7. Acceptance criteria</h3><table><thead><tr><th style="width:14mm">ID</th><th>Criterion (testable)</th></tr></thead><tbody>${d.acceptance_criteria.map((a) => `<tr><td>${esc(a.id)}</td><td>${esc(a.text)}</td></tr>`).join('')}</tbody></table></section>`;
  const sev = m.defects_by_severity;
  const body = `${cover(m, doc, [['Defects', esc(m.defects.length)]])}
<section class="break"><h2>Defect summary</h2><p>${m.defects.length} defect(s): critical ${esc(sev.critical ?? 0)} · high ${esc(sev.high ?? 0)} · medium ${esc(sev.medium ?? 0)} · low ${esc(sev.low ?? 0)}${sev.unassessed ? ` · unassessed ${esc(sev.unassessed)} (severity not established by the evidence: needs triage)` : ''}.</p>
${m.defects.length ? `<table><thead><tr><th>Defect</th><th>Title</th><th>Severity</th><th>Priority</th><th>Layer</th><th>Cases</th></tr></thead><tbody>${m.defects.map((d) => `<tr><td class="id">${esc(d.id)}</td><td>${esc(d.title)}</td><td>${sevBadge(d.severity)}</td><td>${prioBadge(d.priority)}</td><td>${unk(d.layer)}</td><td>${esc(d.linked_cases.join(', ') || '—')}</td></tr>`).join('')}</tbody></table><p class="muted">Root cause is never inferred: each defect states what was observed and what an engineer should investigate.</p>` : noDefects(m)}</section>
${m.defects.map(one).join('')}`;
  return page(m, doc, body);
}

export function renderRegisterDoc(m) {
  const doc = DOCS[2];
  const rows = m.cases.map((c) => `<tr><td class="rid">${esc(c.id)}</td><td>${esc(c.title)}</td><td>${unk(c.feature)}</td><td>${unk(c.module)}</td><td>${unk(c.type)}</td><td>${c.priority === UNKNOWN ? unk(c.priority) : prioBadge(c.priority)}</td><td>${unk(c.preconditions)}</td><td>${data(c.test_data)}</td><td>${c.steps.length ? `<ol>${c.steps.map((s) => `<li>${esc(s.action)}</li>`).join('')}</ol>` : '—'}</td><td>${unk(c.expected)}</td><td>${unk(c.actual)}</td><td>${statusBadge(c.status)}</td><td>${esc(c.defect_ids.join(', ') || '—')}</td><td class="ref">${esc(c.evidence_refs.join(', ') || '—')}</td><td>${unk(v(c.executed_at))}</td></tr>`).join('');
  const body = `${cover(m, doc, [['Test cases', esc(m.totals.cases)]], true)}
<section class="break"><h2>1. Summary</h2>${tiles(m)}</section>
<section><h2>2. Register</h2><table class="reg"><colgroup>${[7, 9, 6, 5, 5, 4, 6, 6, 15, 9, 11, 5, 4, 4, 4].map((w) => `<col style="width:${w}%">`).join('')}</colgroup><thead><tr><th>ID</th><th>Title</th><th>Feature</th><th>Module</th><th>Type</th><th>Priority</th><th>Preconditions</th><th>Test data</th><th>Steps</th><th>Expected result</th><th>Actual result</th><th>Status</th><th>Defects</th><th>Evidence</th><th>Executed</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  return page(m, doc, body, true);
}

export function renderDocuments(m, dir) {
  return { test_report: renderTestReportDoc(m, dir), defect_report: renderDefectReportDoc(m, dir), test_case_register: renderRegisterDoc(m) };
}

// The three documents must agree: same run ID; every test case in the test report and the register; every defect in the
// test report and the defect report (and in the register for its cases); every evidence ID cited anywhere exists in
// the evidence index of the test report. Checked on the HTML that is printed.
export function crossReferences(m, html) {
  const problems = []; const has = (doc, id) => html[doc].includes(esc(id));
  for (const doc of Object.keys(html)) if (!has(doc, m.run_id)) problems.push(`${doc} does not show run ${m.run_id}`);
  for (const c of m.cases) for (const doc of ['test_report', 'test_case_register']) if (!has(doc, c.id)) problems.push(`${doc} lacks test case ${c.id}`);
  for (const d of m.defects) for (const doc of ['test_report', 'defect_report']) if (!has(doc, d.id)) problems.push(`${doc} lacks defect ${d.id}`);
  for (const c of m.cases) for (const d of c.defect_ids) if (!m.defects.some((x) => x.id === d)) problems.push(`case ${c.id} cites unknown defect ${d}`);
  const index = new Set(m.evidence.map((e) => e.id));
  for (const [doc, h] of Object.entries(html)) for (const id of new Set(h.match(/EV-\d{3}/g) ?? [])) if (!index.has(id)) problems.push(`${doc} cites unknown evidence ${id}`);
  for (const e of m.evidence) if (!has('test_report', e.id)) problems.push(`evidence index lacks ${e.id}`);
  return { ok: !problems.length, run_id: m.run_id, cases: m.cases.length, defects: m.defects.length, evidence: m.evidence.length, problems };
}

// ---- PDF metadata (incremental update of the Info dictionary; no dependencies) -------------------------------------
const pdfStr = (s) => `<FEFF${Buffer.from(String(s), 'utf16le').swap16().toString('hex').toUpperCase()}>`;
const pdfDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`; };
export function withPdfInfo(buf, info) {
  const s = buf.toString('latin1');
  const trailer = s.lastIndexOf('trailer'); const sx = s.match(/startxref\s+(\d+)\s+%%EOF\s*$/);
  if (trailer < 0 || !sx) return { buf, ok: false, reason: 'no classic xref trailer: metadata left as printed' };
  const t = s.slice(trailer, s.lastIndexOf('startxref'));
  const size = Number(t.match(/\/Size\s+(\d+)/)?.[1]); const root = t.match(/\/Root\s+(\d+\s+\d+\s+R)/)?.[1];
  if (!size || !root) return { buf, ok: false, reason: 'trailer without /Size or /Root' };
  const fields = Object.entries({ Title: info.title, Author: info.author, Subject: info.subject, Keywords: info.keywords, Creator: info.creator, Producer: info.producer }).filter(([, x]) => known(x)).map(([k, x]) => `/${k} ${pdfStr(x)}`);
  const cd = info.created ? pdfDate(info.created) : null; if (cd) fields.push(`/CreationDate (${cd})`, `/ModDate (${cd})`);
  const sep = s.endsWith('\n') ? '' : '\n';
  const objStart = buf.length + Buffer.byteLength(sep, 'latin1');
  const obj = `${size} 0 obj\n<< ${fields.join(' ')} >>\nendobj\n`;
  const xref = objStart + Buffer.byteLength(obj, 'latin1');
  const tail = `${sep}${obj}xref\n${size} 1\n${String(objStart).padStart(10, '0')} 00000 n \ntrailer\n<< /Size ${size + 1} /Root ${root} /Info ${size} 0 R /Prev ${sx[1]} >>\nstartxref\n${xref}\n%%EOF\n`;
  return { buf: Buffer.concat([buf, Buffer.from(tail, 'latin1')]), ok: true };
}
// Secret absence check over written documents: HTML as text; PDF raw bytes, every inflated stream, and the UTF-16BE hex
// form used by PDF strings (metadata, outline). Page text in a PDF is glyph-encoded, so it is checked at its HTML source.
export function secretsAbsent(paths, secrets) {
  const vals = [...new Set((secrets ?? []).filter((x) => typeof x === 'string' && x.length >= 4))];
  const leaks = [];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const buf = readFileSync(p); const raw = buf.toString('latin1');
    const hay = [raw];
    if (/\.pdf$/i.test(p)) for (const m of raw.matchAll(/stream\r?\n/g)) { const start = m.index + m[0].length; const end = raw.indexOf('endstream', start); if (end < 0) continue; try { hay.push(inflateSync(buf.subarray(start, end)).toString('latin1')); } catch { /* not deflated */ } }
    const text = hay.join('\n'); const upper = text.toUpperCase();
    for (const s of vals) if (text.includes(s) || text.includes(Buffer.from(s, 'utf8').toString('latin1')) || upper.includes(Buffer.from(s, 'utf16le').swap16().toString('hex').toUpperCase())) leaks.push(basename(p));
  }
  return { secrets_absent: !leaks.length, checked: vals.length, files: paths.length, leaks: [...new Set(leaks)] };
}

// read back the effective Info dictionary and the outline titles (used by tests and the report verification step)
export function readPdfFacts(buf) {
  const s = buf.toString('latin1');
  const dec = (x) => { if (!x) return null; if (x.startsWith('<')) { const h = x.slice(1, -1); const b = Buffer.from(h, 'hex'); return b[0] === 0xfe && b[1] === 0xff ? b.subarray(2).swap16().toString('utf16le') : b.toString('latin1'); } return x.slice(1, -1).replace(/\\([()\\])/g, '$1'); };
  const infoRef = [...s.matchAll(/\/Info\s+(\d+)\s+0\s+R/g)].pop()?.[1];
  const infoObj = infoRef ? [...s.matchAll(new RegExp(`(?:^|\\n)${infoRef} 0 obj\\s*<<([\\s\\S]*?)>>\\s*endobj`, 'g'))].pop()?.[1] ?? '' : '';
  const field = (k) => dec(infoObj.match(new RegExp(`/${k}\\s*(<[0-9A-Fa-f]*>|\\((?:\\\\.|[^\\\\)])*\\))`))?.[1]);
  const outline = [...s.matchAll(/\/Title\s*(<[0-9A-Fa-f]+>|\((?:\\.|[^\\)])*\))\s*\/Dest/g)].map((x) => dec(x[1]));
  return { pages: (s.match(/\/Type\s*\/Page[^s]/g) ?? []).length, title: field('Title'), author: field('Author'), subject: field('Subject'), keywords: field('Keywords'), creator: field('Creator'), created: field('CreationDate'), outline };
}
