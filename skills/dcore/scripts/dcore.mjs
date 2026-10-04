#!/usr/bin/env node
// dcore CLI — portable, offline by default. Usage:
//   node dcore.mjs "<natural-language task>"        (router: which capabilities, in which order)
//   node dcore.mjs list
//   node dcore.mjs <module> "<text>"           (positional input)
//   node dcore.mjs <module> --input "<text>" [--json]
//   node dcore.mjs <module>                    (reads text from stdin)
// Reasoning/analysis modules: no network, no credentials, no ~/.claude access, no subprocess, no destructive action.
// Execution modules (dcore-run/api/browse/git/verify, dcore-release --repo) live in ./exec and are loaded ONLY when
// invoked; their side effects are bounded and consequential ones require an explicit --approve.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve, join } from 'node:path';
import { MODULES, EXECUTION_MODULES, runModule, renderMarkdown, summarizeImpact } from './modules.mjs';

const BOOL = new Set(['json', 'summary', 'staged', 'push', 'headed', 'allow-dirty', 'allow-console-errors', 'browse', 'list', 'no-pdf', 'inventory']);
const VALUE = new Set(['input', 'repo', 'cwd', 'timeout', 'approve', 'url', 'method', 'header', 'auth-env', 'auth-scheme', 'body', 'json-body', 'expect-status', 'expect-text', 'expect-json', 'schema', 'repeat', 'retries', 'spec', 'steps', 'out', 'profile', 'range', 'n', 'path', 'ref', 'message', 'files', 'remote', 'branch', 'test-cmd', 'deploy-cmd', 'verify-url', 'health', 'max-ms', 'report', 'plan', 'discover', 'setup', 'plan-out', 'name', 'env', 'scenarios', 'app', 'max-pages', 'max-depth', 'coverage', 'candidates', 'run', 'only', 'max-fields', 'meta', 'browsers', 'viewports', 'viewport']);
const MULTI = new Set(['header', 'expect-text', 'expect-json', 'approve', 'health']);

export function parseArgs(argv) {
  const args = { _: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = a.match(/^--([a-z][\w-]*)$/);
    if (m && BOOL.has(m[1])) args[m[1]] = true;
    else if (m && VALUE.has(m[1])) {
      const v = argv[++i] ?? '';
      if (MULTI.has(m[1])) (args[m[1]] ??= []).push(v); else args[m[1]] = v;
    } else args._.push(a);
  }
  return args;
}

// Resolve module input, deterministically, from three sources in priority order:
//   1. an explicit --input flag, 2. positional text after the module name, 3. stdin.
// `readStdin` is a thunk so stdin is only consulted when nothing else supplied input.
export function resolveInput(args, readStdin) {
  if (args.input !== undefined) return args.input;
  const positional = args._.slice(1).join(' ').trim();
  if (positional !== '') return positional;
  return typeof readStdin === 'function' ? readStdin() : '';
}

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

class ArgError extends Error {}
// JSON arguments (--steps/--spec/--schema/--json-body) may be a file path or inline JSON; bad JSON fails closed.
const jsonArg = (v, name = 'argument') => {
  if (v === undefined) return undefined;
  try { return JSON.parse(existsSync(v) ? readFileSync(v, 'utf8') : v); } catch (e) { throw new ArgError(`${name} is not valid JSON (${e.message.split('\n')[0]})`); }
};
const blocked = (module, reason) => ({ schema: 'dcore.evidence/1', module, action: 'parse arguments', result: 'BLOCKED', checks: [], evidence: {}, limitations: [reason, 'nothing was executed'], started_at: null, ended_at: new Date().toISOString(), environment: { platform: process.platform, arch: process.arch, node: process.version } });

export function renderEvidence(r) {
  const lines = [`# DCore · ${r.module} — ${r.result}${r.verdict ? ` (verdict: ${r.verdict})` : ''}`, '', `action: ${r.action}`, ''];
  if (r.checks?.length) { lines.push('## checks'); for (const c of r.checks) lines.push(`- [${c.result}] ${c.title}${c.actual !== undefined && c.result === 'FAIL' ? ` (actual: ${JSON.stringify(c.actual).slice(0, 160)})` : ''}`); lines.push(''); }
  if (r.actions?.length) { lines.push('## actions'); for (const a of r.actions) lines.push(`- [${a.result}] ${a.action}${a.reason ? `: ${a.reason}` : ''}`); lines.push(''); }
  if (r.evidence && Object.keys(r.evidence).length) { lines.push('## evidence', '```json', JSON.stringify(r.evidence, null, 2).slice(0, 12000), '```', ''); }
  if (r.limitations?.length) { lines.push('## limitations', ...r.limitations.map((l) => `- ${l}`), ''); }
  return lines.join('\n');
}

// --report <file.md>: the same (already redacted) evidence as Markdown, plus screenshot links relative to the report.
function writeReport(file, r) {
  const path = resolve(file);
  const shots = r.evidence?.screenshots ?? [];
  const md = renderEvidence(r) + (shots.length ? `\n## screenshots\n${shots.map((s) => `![${s.split(/[\\/]/).pop()}](${relative(dirname(path), s).replace(/\\/g, '/')})`).join('\n')}\n` : '');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, md);
}

// --report <dir-or-prefix>: every workflow hands its result to the ONE shared reporting layer (exec/reporting.mjs ->
// dcore-report); no module renders documents itself. A reporting failure never changes the run's own result.
async function shareReport(result, args, cmd) {
  try {
    const { reportFor } = await import('./exec/reporting.mjs');
    const rep = await reportFor(result, args.report, { module: cmd.startsWith('dcore-') ? cmd : 'dcore-route', meta: jsonArg(args.meta, '--meta') ?? {}, pdf: !args['no-pdf'] });
    const { files, ...summary } = rep;
    return summary;
  } catch (e) { return { error: `report not produced: ${e.message}` }; }
}

// a dcore-browse setup step ({fill:{selector,valueEnv}}) as a scenario setup step ({action,target,input})
function scenarioStepFromBrowse(s) {
  const op = ['goto', 'fill', 'click', 'type', 'waitFor', 'press', 'select', 'wait'].find((k) => s[k] !== undefined);
  if (!op) return null;
  const v = s[op]; const timeout = s.timeoutMs ? { timeoutMs: s.timeoutMs } : {};
  if (op === 'goto') return { action: 'goto', target: typeof v === 'string' ? v : v.url, ...timeout };
  if (op === 'wait') return { action: 'wait', input: v };
  if (op === 'waitFor') return { action: 'waitFor', input: v, ...timeout };
  if (op === 'press') return { action: 'press', input: typeof v === 'string' ? v : v.key, ...timeout };
  const { value, valueEnv, option, ...target } = typeof v === 'object' ? v : {};
  return { action: op, target, ...(valueEnv ? { input: { valueEnv } } : value !== undefined ? { input: value } : option !== undefined ? { input: option } : {}), ...timeout };
}

async function runExecution(cmd, args) {
  const approvals = args.approve ?? [];
  const rest = args._.slice(1);
  switch (cmd) {
    case 'dcore-run': {
      const { runCommand, listCommands } = await import('./exec/run.mjs');
      if (args.list || rest.length === 0) return listCommands(args.repo ?? '.');
      return runCommand(rest.join(' '), { cwd: args.cwd ?? args.repo ?? '.', timeoutMs: args.timeout ? Number(args.timeout) : undefined, approvals });
    }
    case 'dcore-api': {
      const { apiRequest } = await import('./exec/api.mjs');
      const spec = jsonArg(args.spec, '--spec') ?? {};
      if (args.url ?? rest[0]) spec.url = args.url ?? rest[0];
      if (args.method) spec.method = args.method;
      for (const h of args.header ?? []) { const i = h.indexOf(':'); (spec.headers ??= {})[h.slice(0, i).trim()] = h.slice(i + 1).trim(); }
      if (args['auth-env']) { spec.authEnv = args['auth-env']; if (args['auth-scheme']) spec.authScheme = args['auth-scheme']; }
      if (args['json-body']) spec.json = jsonArg(args['json-body'], '--json-body');
      if (args.body) spec.body = args.body;
      if (args.repeat) spec.repeat = Number(args.repeat);
      if (args.retries) spec.retries = Number(args.retries);
      if (args.timeout) spec.timeoutMs = Number(args.timeout);
      const e = (spec.expect ??= {});
      if (args['expect-status']) e.status = Number(args['expect-status']);
      if (args['expect-text']) e.bodyContains = args['expect-text'];
      for (const kv of args['expect-json'] ?? []) { const i = kv.indexOf('='); let v = kv.slice(i + 1); try { v = JSON.parse(v); } catch { /* string */ } (e.json ??= {})[kv.slice(0, i)] = v; }
      if (args.schema) e.schema = jsonArg(args.schema, '--schema');
      if (args['max-ms']) e.maxMs = Number(args['max-ms']);
      return apiRequest(spec, { approvals });
    }
    case 'dcore-browse': {
      const { browse } = await import('./exec/browse.mjs');
      if (args.inventory) {   // detection only: which browsers exist here and which DCore can drive
        const { browserInventory } = await import('./exec/browse.mjs');
        const inv = browserInventory();
        return { schema: 'dcore.evidence/1', module: 'dcore-browse', action: 'browser inventory', result: inv.some((b) => b.drivable) ? 'PASS' : 'BLOCKED', started_at: null, ended_at: new Date().toISOString(), checks: inv.map((b) => ({ id: b.family, title: `${b.family}: ${b.drivable ? `drivable (${b.engine})` : b.reason}`, result: b.drivable ? 'PASS' : b.available ? 'NOT_TESTED' : 'NOT_AVAILABLE' })), evidence: { inventory: inv }, limitations: ['detection only: nothing was launched, installed or modified', 'DCore drives Chromium-engine browsers (CDP) only'] };
      }
      let steps = jsonArg(args.steps, '--steps');
      if (!steps && rest[0] === 'open' && rest[1]) steps = [{ goto: rest[1] }, { inspect: {} }, { a11y: true }, { perf: true }, { screenshot: 'page' }];
      return browse(steps ?? [], { outDir: args.out, viewport: args.viewport, profile: args.profile, headed: args.headed, allowConsoleErrors: args['allow-console-errors'], stepTimeoutMs: args.timeout ? Number(args.timeout) : undefined });
    }
    case 'dcore-git': {
      const { gitOp } = await import('./exec/git.mjs');
      return gitOp(rest[0] ?? 'status', { repo: args.repo, range: args.range, staged: args.staged, n: args.n, path: args.path, ref: args.ref, message: args.message, files: args.files ? args.files.split(',') : undefined, remote: args.remote, branch: args.branch, approvals, args: rest.slice(1) });
    }
    case 'dcore-verify': {
      const { verifyDeployment } = await import('./exec/verify.mjs');
      return verifyDeployment({ url: args.url ?? rest[0], health: (args.health ?? []).flatMap((h) => h.split(',')), expectText: args['expect-text'], maxMs: args['max-ms'] ? Number(args['max-ms']) : undefined, browse: args.browse, steps: jsonArg(args.steps, '--steps') }, { outDir: args.out });
    }
    case 'dcore-explore': {
      const { discoverApp, renderAppMap, coverage } = await import('./exec/discover.mjs');
      if (args.coverage) {
        const map = jsonArg(args.coverage, '--coverage'); const cands = jsonArg(args.candidates, '--candidates'); const run = jsonArg(args.run, '--run');
        const cov = coverage(map, cands, run);
        const outDir = resolve(args.out ?? join('.dcore', 'evidence', 'coverage'));
        mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, 'coverage.json'), JSON.stringify(cov, null, 2) + '\n');
        const sm = cov.summary;
        return { schema: 'dcore.evidence/1', module: 'dcore-explore', action: 'coverage', result: sm.failed ? 'FAIL' : sm.tested ? 'PASS' : 'NOT_TESTED', started_at: null, ended_at: new Date().toISOString(), checks: cov.scenarios.map((s) => ({ id: s.id, title: `[${s.lifecycle}] ${s.title}`, result: { PASSED: 'PASS', FAILED: 'FAIL', BLOCKED: 'BLOCKED' }[s.result] ?? 'NOT_TESTED' })), evidence: { summary: sm, file: join(outDir, 'coverage.json') }, limitations: [cov.note] };
      }
      const { generateCandidates } = await import('./exec/candidates.mjs');
      const setup = jsonArg(args.setup, '--setup') ?? [];
      const outDir = resolve(args.out ?? join('.dcore', 'evidence', `appmap-${new Date().toISOString().replace(/[:.]/g, '-')}`));
      const map = await discoverApp(args.app, { setup, outDir, maxPages: args['max-pages'] ? Number(args['max-pages']) : undefined, maxDepth: args['max-depth'] ? Number(args['max-depth']) : undefined, stepTimeoutMs: args.timeout ? Number(args.timeout) : undefined });
      mkdirSync(outDir, { recursive: true });
      const cands = map.status === 'DISCOVERED' ? generateCandidates(map, { setup: setup.map((s) => scenarioStepFromBrowse(s)).filter(Boolean), maxFieldsPerPage: args['max-fields'] ? Number(args['max-fields']) : undefined }) : null;
      writeFileSync(join(outDir, 'appmap.json'), JSON.stringify(map, null, 2) + '\n');
      writeFileSync(join(outDir, 'app-map.md'), renderAppMap(map));
      if (cands) { writeFileSync(join(outDir, 'candidate-scenarios.json'), JSON.stringify(cands, null, 2) + '\n'); const { renderMatrix } = await import('./exec/negative.mjs'); writeFileSync(join(outDir, 'negative-matrix.md'), renderMatrix(cands)); }
      return { schema: 'dcore.evidence/1', module: 'dcore-explore', action: `discover ${args.app}`, result: map.status === 'DISCOVERED' ? 'PASS' : 'BLOCKED', started_at: map.generated_at ?? null, ended_at: new Date().toISOString(), checks: (map.routes ?? []).map((p) => ({ id: p.route, title: `[DISCOVERED] ${p.route} (${p.kind})`, result: 'PASS' })), evidence: { map_hash: map.map_hash ?? null, routes: map.routes?.length ?? 0, auth: map.auth ?? null, candidates: cands?.summary ?? null, files: { appmap: join(outDir, 'appmap.json'), summary: join(outDir, 'app-map.md'), candidates: cands ? join(outDir, 'candidate-scenarios.json') : null, negative_matrix: cands ? join(outDir, 'negative-matrix.md') : null } }, limitations: [...(map.limitations ?? []), ...(map.reason ? [map.reason] : []), 'discovered controls are NOT tested; run candidate scenarios with dcore-qa --scenarios to test them'] };
    }
    case 'dcore-report': {
      const src = jsonArg(args.run, '--run');
      const meta = jsonArg(args.meta, '--meta') ?? {};
      if (!['dcore.scenario-run/1', 'dcore.testrun/1'].includes(src?.schema)) return blocked('dcore-report', `unsupported --run input (schema ${JSON.stringify(src?.schema ?? null)}): expected dcore.scenario-run/1 or dcore.testrun/1`);
      const { writeReports } = await import('./exec/report.mjs');
      let tr = src; let source = null;
      if (src.schema === 'dcore.scenario-run/1') { const { scenarioTestRun } = await import('./exec/scenario.mjs'); source = src; tr = await scenarioTestRun(src, { outDir: src.browser?.out_dir }); }
      const outDir = resolve(args.out ?? join('.dcore', 'evidence', `report-${source?.run_id ?? 'testrun'}`));
      const files = await writeReports(tr, outDir, { pdf: !args['no-pdf'], source, meta });
      const docs = [['test_report', 'Detailed Test Report'], ['defect_report', 'Detailed Defect Report'], ['test_case_register', 'Test Case Register']];
      const checks = docs.flatMap(([k, title]) => { const p = files[`${k}_pdf`]; const ver = files[`${k}_verified`]; return [{ id: `${k}-pdf`, title: `${title} PDF${p?.ok ? ` (${p.pages} pages)` : `: ${p?.error ?? 'not produced'}`}`, result: p?.result ?? 'NOT_TESTED' }, { id: `${k}-secrets`, title: `${title}: referenced credential values absent (${ver?.checked ?? 0} value(s) checked)`, result: !ver ? 'NOT_TESTED' : ver.secrets_absent ? 'PASS' : 'FAIL' }]; });
      const results = checks.map((c) => c.result);
      return { schema: 'dcore.evidence/1', module: 'dcore-report', action: `document run ${source?.run_id ?? tr.name}`, result: results.includes('FAIL') ? 'FAIL' : results.includes('BLOCKED') ? 'BLOCKED' : results.every((r) => r === 'PASS') ? 'PASS' : 'NOT_TESTED', started_at: null, ended_at: new Date().toISOString(), checks, evidence: { files, verdict: tr.verdict, totals: tr.totals, defects: (tr.defects ?? []).length }, limitations: ['documents state only what the run evidence establishes; build, objectives and business impact come from --meta or are UNKNOWN', 'PDF page text is checked for secrets at its HTML source; PDF metadata, outline and links are checked in the PDF itself'] };
    }
    case 'dcore-qa': {
      if (args.scenarios) {
        const { runScenarios, scenarioReports } = await import('./exec/scenario.mjs');
        const doc = jsonArg(args.scenarios, '--scenarios');
        if (args.env) doc.environment = args.env;
        if (args.only && Array.isArray(doc?.scenarios)) {   // --only: scenario ids, categories, negative case ids, or "negative"
          const want = String(args.only).split(',').map((x) => x.trim()).filter(Boolean);
          doc.scenarios = doc.scenarios.filter((x) => want.some((w) => w === x.id || w === x.category || w === x.negative?.case || (w === 'negative' && x.negative)));
        }
        // --browsers / --viewports: the browser matrix (M46); --viewport: one preset for a single run
        let matrix = null; let sr;
        if (args.browsers || args.viewports) {
          const { runMatrix } = await import('./exec/matrix.mjs');
          const outBase = resolve(args.out ?? join('.dcore', 'evidence', `matrix-${new Date().toISOString().replace(/[:.]/g, '-')}`));
          const list = (v, d) => (v ? String(v).split(',').map((x) => x.trim()).filter(Boolean) : d);
          ({ matrix, sr } = await runMatrix(doc, { browsers: list(args.browsers, ['chrome', 'edge', 'chromium', 'firefox', 'webkit']), viewports: list(args.viewports, ['desktop', 'tablet', 'mobile']), outDir: outBase, approvals, stepTimeoutMs: args.timeout ? Number(args.timeout) : undefined }));
          sr.browser = sr.browser ? { ...sr.browser, out_dir: outBase } : { out_dir: outBase };
        } else sr = await runScenarios(doc, { outDir: args.out, approvals, profile: args.profile, headed: args.headed, viewport: args.viewport, stepTimeoutMs: args.timeout ? Number(args.timeout) : undefined, cwd: args.cwd });
        const outDir = sr.browser?.out_dir ?? resolve(args.out ?? join('.dcore', 'evidence', sr.run_id));
        const files = sr.errors ? {} : await scenarioReports(sr, { outDir, pdf: !args['no-pdf'], meta: jsonArg(args.meta, '--meta') ?? {} });
        mkdirSync(outDir, { recursive: true });
        const runFile = join(outDir, `${sr.run_id}.scenario-run.json`);
        writeFileSync(runFile, JSON.stringify(sr, null, 2) + '\n');
        const dcFile = sr.defect_candidates?.length ? join(outDir, 'defect-candidates.json') : null;
        const matrixFile = matrix ? join(outDir, 'browser-matrix.json') : null;
        if (matrixFile) writeFileSync(matrixFile, JSON.stringify(matrix, null, 2) + '\n');
        if (dcFile) writeFileSync(dcFile, JSON.stringify({ schema: 'dcore.defect-candidates/1', run_id: sr.run_id, note: 'violated negative expectations; severity / priority are UNASSESSED unless a stated rule applies', candidates: sr.defect_candidates }, null, 2) + '\n');
        const t = sr.totals;
        return { schema: 'dcore.evidence/1', module: 'dcore-qa', action: `run ${sr.scenarios.length} scenario(s) ${sr.run_id}`, result: sr.errors ? 'BLOCKED' : t.FAIL ? 'FAIL' : t.BLOCKED ? 'BLOCKED' : t.PASS ? 'PASS' : 'NOT_TESTED', started_at: sr.started_at, ended_at: sr.ended_at, checks: sr.scenarios.map((s) => ({ id: s.scenario_id, title: `${s.title}: ${s.actual}`.slice(0, 240), result: s.status })), evidence: { run_id: sr.run_id, verdict: sr.verdict ?? null, totals: t, errors: sr.errors, defects: (sr.defects ?? []).map((d) => ({ id: d.id, severity: d.severity, title: d.title })), defect_candidates: (sr.defect_candidates ?? []).map((d) => ({ id: d.id, scenario: d.scenario.id, case: d.scenario.negative_case, type: d.defect_type_candidate.value, severity: d.severity_candidate.value, expected: d.expected })), run_file: runFile, defect_candidates_file: dcFile, ...(matrix ? { browser_matrix: { file: matrixFile, summary: matrix.summary, claim: matrix.claim } } : {}), files }, limitations: sr.limitations };
      }
      const { runQaPlan, discoverPlan } = await import('./exec/report.mjs');
      if (args.discover) {
        const r = await discoverPlan(args.discover, { setup: jsonArg(args.setup, '--setup') ?? [], outDir: args.out, profile: args.profile, headed: args.headed, name: args.name, environment: args.env, stepTimeoutMs: args.timeout ? Number(args.timeout) : undefined });
        if (args['plan-out'] && r.evidence?.plan) { mkdirSync(dirname(resolve(args['plan-out'])), { recursive: true }); writeFileSync(resolve(args['plan-out']), JSON.stringify(r.evidence.plan, null, 2) + '\n'); r.evidence.plan_file = resolve(args['plan-out']); }
        return r;
      }
      const plan = jsonArg(args.plan, '--plan');
      if (args.env) plan.environment = args.env;
      return runQaPlan(plan, { outDir: args.out, profile: args.profile, headed: args.headed, pdf: !args['no-pdf'], stepTimeoutMs: args.timeout ? Number(args.timeout) : undefined });
    }
    case 'dcore-release': {
      const { releaseReadiness } = await import('./exec/release.mjs');
      return releaseReadiness({ repo: args.repo, testCmd: args['test-cmd'], push: args.push, deployCmd: args['deploy-cmd'], verifyUrl: args['verify-url'], health: args.health?.flatMap((h) => h.split(',')), allowDirty: args['allow-dirty'], approvals });
    }
    default: return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || cmd === 'help' || cmd === '--help') {
    process.stdout.write(['DCore — universal Claude Code skill', '', 'Usage:', '  node dcore.mjs "<task in plain English>"  (router)', '  node dcore.mjs list', '  node dcore.mjs <module> "<text>"           (positional)', '  node dcore.mjs <module> --input "<text>" [--json]', '  node dcore.mjs <module>                    (stdin)', '', 'Modules:', ...MODULES.map((m) => `  ${m.module_id.padEnd(14)} ${m.status.padEnd(11)} ${m.kind.padEnd(9)} ${m.module_name}`), ''].join('\n'));
    return;
  }
  if (cmd === 'list') {
    if (args.json) process.stdout.write(JSON.stringify(MODULES, null, 2) + '\n');
    else process.stdout.write(MODULES.map((m) => `${m.module_id.padEnd(14)} ${m.status.padEnd(11)} ${m.kind.padEnd(9)} ${m.module_name} — ${m.purpose}`).join('\n') + '\n');
    return;
  }
  // execution modules (and dcore-release with --repo / publish flags) produce evidence reports
  if (EXECUTION_MODULES.includes(cmd) || (cmd === 'dcore-release' && (args.repo || args.push || args['deploy-cmd'])) || (cmd === 'dcore-qa' && (args.plan || args.discover || args.scenarios)) || (cmd === 'dcore-explore' && (args.app || args.coverage)) || (cmd === 'dcore-report' && args.run)) {
    let r;
    try { r = await runExecution(cmd, args); } catch (e) { if (!(e instanceof ArgError)) throw e; r = blocked(cmd, e.message); }
    // --report <file.md>: Markdown evidence; --report <dir-or-prefix>: the three PDFs through the shared reporting layer
    if (args.report && /\.md$/i.test(args.report)) writeReport(args.report, r);
    else if (args.report) r.report = await shareReport(r, args, cmd);
    process.stdout.write((args.json ? JSON.stringify(r, null, 2) : r.schema ? renderEvidence(r) : JSON.stringify(r, null, 2)) + '\n');
    if (r.result === 'FAIL' || r.verdict === 'FAILED') process.exitCode = 1;
    else if (r.result === 'BLOCKED' || r.verdict === 'BLOCKED' || r.verdict === 'NOT_AUTHORIZED') process.exitCode = 3;
    return;
  }
  // plain-language task (not a module id): route it
  const isModule = cmd.startsWith('dcore-');
  const input = cmd === 'route' || !isModule ? (cmd === 'route' ? resolveInput(args, readStdin) : args._.join(' ')) : resolveInput(args, readStdin);
  const result = cmd === 'route' || !isModule ? runModule('dcore-route', input) : runModule(cmd, input, { repo: args.repo });
  // --summary: compact presentation of a dcore-impact result (same evidence; nothing hidden). Shown even on a
  // soft repo error so the UNKNOWN/identifier context is still visible.
  if (args.summary && result.module_id === 'dcore-impact') {
    process.stdout.write(summarizeImpact(result) + '\n');
    if (result.error) process.exitCode = 2;
    return;
  }
  if (result.error) { process.stderr.write(renderMarkdown(result) + '\n'); process.exitCode = 2; return; }
  // reasoning output (route / chain / debug / qa text) with --report: the shared layer documents the plan as NOT_TESTED
  if (args.report && !/\.md$/i.test(args.report)) result.report = await shareReport(result, args, cmd);
  process.stdout.write((args.json ? JSON.stringify(result, null, 2) : renderMarkdown(result)) + '\n');
}

if (process.argv[1] && process.argv[1].endsWith('dcore.mjs')) main();
