// dcore module engine — portable, dependency-free ESM. Deterministic, read-only analysis.
// No network, no credentials, no ~/.claude access, no arbitrary execution, no destructive actions.
// The "intelligence" of each module is the guidance in the module reference that Claude Code follows; this engine
// produces a deterministic structured scaffold from the user's input so the behavior is real and testable offline.
// node:fs/node:path are used ONLY by dcore-impact, for a read-only scan of a user-supplied repository (never ~/.claude,
// never credential files, never network, never subprocess).
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { dcoreExplore, discoverCommands } from './explore.mjs';
import { secretScan } from './secscan.mjs';
import { routeTask } from './route.mjs';

export const MODULES = [
  { module_id: 'dcore-frame', module_name: 'Problem Framing', status: 'IMPLEMENTED', purpose: 'turn a raw request into a framed problem (objective, stakeholders, risks, open questions)', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-spec', module_name: 'Specification', status: 'IMPLEMENTED', purpose: 'turn a problem into a structured specification', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-plan', module_name: 'Engineering Plan', status: 'IMPLEMENTED', purpose: 'turn a feature/request into an implementation plan', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-review', module_name: 'Code Review', status: 'IMPLEMENTED', purpose: 'produce a structured review of code or a real unified diff (diff mode reviews added lines only, with file:line)', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-qa', module_name: 'QA / Test Plan', status: 'IMPLEMENTED', purpose: 'produce a test plan from a feature/spec', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-debug', module_name: 'Debug / Investigation', status: 'IMPLEMENTED', purpose: 'turn a defect report into hypotheses, evidence to collect, likely root causes and next steps', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-sec', module_name: 'Security Review', status: 'IMPLEMENTED', purpose: 'threat-model a change (assets, surface, STRIDE-style checks, findings, residual risk); with --repo also scan the working tree (CONFIRMED / SUSPICIOUS / THEORETICAL)', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-doc', module_name: 'Documentation', status: 'IMPLEMENTED', purpose: 'turn a feature/spec/change into a deterministic documentation scaffold (known vs UNKNOWN, no invented APIs)', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-release', module_name: 'Release Prep', status: 'IMPLEMENTED', purpose: 'fail-closed release readiness: a go/no-go checklist from text, or with --repo EXECUTE the gates (tree, upstream, tests, secrets, version, docs) => READY/BLOCKED/NOT_AUTHORIZED/FAILED/VERIFIED; push/deploy only with approval', permissions: ['read-only', 'execute-local (--repo)', 'git-push / deploy (approval)'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-chain', module_name: 'Composition Chain', status: 'IMPLEMENTED', purpose: 'run the common frame -> spec -> plan -> qa path in one call, composing via deterministic handoff', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-impact', module_name: 'Change Impact', status: 'IMPLEMENTED', purpose: 'given a change + a repo, find literal references and classify DIRECT_EVIDENCE / LIKELY_AFFECTED / POSSIBLY_AFFECTED / UNKNOWN (never a dependency graph)', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-explore', module_name: 'Repository Exploration', status: 'IMPLEMENTED', kind: 'analysis', purpose: 'read-only repository intelligence: project type, languages, frameworks, build/test/lint commands, entry points, CI, integrations, config (secret files by name only)', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-build', module_name: 'Implementation', status: 'IMPLEMENTED', kind: 'procedure', purpose: 'implement the smallest coherent change following repository conventions, then verify with dcore-run (Claude edits files with its own tools)', permissions: ['writes-repo-files (user-requested change only)'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-test', module_name: 'Test Generation', status: 'IMPLEMENTED', kind: 'procedure', purpose: 'add focused tests (regression, edge cases) that follow the repository test conventions, then run them', permissions: ['writes-repo-files (tests only)'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dcore-run', module_name: 'Command Execution', status: 'IMPLEMENTED', kind: 'execution', purpose: 'run one repository-local command (tests/lint/typecheck/build) with timeout, redacted output, failure classification; destructive commands need approval', permissions: ['execute-local'], security_level: 'ENVIRONMENT_SPECIFIC', platform_requirements: ['any'] },
  { module_id: 'dcore-api', module_name: 'API Testing', status: 'IMPLEMENTED', kind: 'execution', purpose: 'execute real HTTP requests with status/header/body/JSON-path/schema/latency assertions; writes to non-local hosts need approval; secrets from env only, redacted', permissions: ['network'], security_level: 'ENVIRONMENT_SPECIFIC', platform_requirements: ['any'] },
  { module_id: 'dcore-browse', module_name: 'Browser Execution', status: 'IMPLEMENTED', kind: 'execution', purpose: 'drive a real Chromium-family browser (CDP, no dependencies): navigate, click, fill, assert, screenshot, console/network errors, a11y heuristics, timing; BLOCKED when no browser exists', permissions: ['network', 'execute-local'], security_level: 'ENVIRONMENT_SPECIFIC', platform_requirements: ['any', 'chromium-family browser'] },
  { module_id: 'dcore-git', module_name: 'Git Change Management', status: 'IMPLEMENTED', kind: 'execution', purpose: 'status/diff/log/branches/show; commit and push only with explicit approval; push verified against the remote; never force-push or rewrite history', permissions: ['read-only', 'git-write (approval)'], security_level: 'ENVIRONMENT_SPECIFIC', platform_requirements: ['any', 'git'] },
  { module_id: 'dcore-verify', module_name: 'Deployment Verification', status: 'IMPLEMENTED', kind: 'execution', purpose: 'verify a deployed environment: health endpoints, expected page/text, latency, optional browser smoke => VERIFIED/FAILED/BLOCKED; never auto-rollback', permissions: ['network'], security_level: 'ENVIRONMENT_SPECIFIC', platform_requirements: ['any'] },
  { module_id: 'dcore-retro', module_name: 'Retrospective', status: 'DEFERRED', purpose: 'project retrospective scaffold', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
];
for (const m of MODULES) m.kind ??= m.module_id === 'dcore-impact' ? 'analysis' : 'reasoning';
export const IMPLEMENTED = MODULES.filter((m) => m.status === 'IMPLEMENTED').map((m) => m.module_id);
// execution modules perform real side effects (subprocess/network) and are dispatched by dcore.mjs, never by runModule
export const EXECUTION_MODULES = MODULES.filter((m) => m.kind === 'execution').map((m) => m.module_id);

// ---- deterministic text helpers (pure) --------------------------------------------------------------------
function sentences(text) { return String(text ?? '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean); }
function firstSentence(text) { return sentences(text)[0] ?? String(text ?? '').trim(); }
const has = (s, words) => words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(s));
// stem match (prefix, no trailing boundary) for keyword heuristics: 'test' -> Tests/tested, 'migrat' -> migration/migrate
const hasStem = (s, stems) => stems.some((w) => new RegExp(`\\b${w}`, 'i').test(s));

// ---- modules (each returns a plain structured object) ------------------------------------------------------
export function dcoreFrame(input) {
  const ss = sentences(input);
  return {
    module_id: 'dcore-frame', objective: firstSentence(input) || '(no input)',
    stakeholders: ['requester', 'end users', 'maintainers'],
    problem: ss.length ? ss : ['(state the problem)'],
    context: ss.filter((s) => has(s, ['because', 'since', 'currently', 'today'])),
    success_signals: ['the stated objective is met', 'no safety-critical regression', 'clear, verifiable outcome'],
    risks: ss.filter((s) => has(s, ['risk', 'unknown', 'hard', 'unclear', 'unsafe', 'block'])),
    open_questions: ss.filter((s) => /\?|\b(tbd|maybe|etc|somehow)\b/i.test(s)),
  };
}
export function dcoreSpec(input) {
  const ss = sentences(input);
  const requirements = ss.map((s, i) => `REQ-${String(i + 1).padStart(2, '0')}: ${s}`);
  return {
    module_id: 'dcore-spec', objective: firstSentence(input) || '(no input)',
    users: ['primary user', 'operator/maintainer'],
    requirements: requirements.length ? requirements : ['REQ-01: (define at least one requirement)'],
    constraints: ss.filter((s) => has(s, ['must', 'only', 'cannot', 'never', 'limit', 'within', 'without'])),
    assumptions: ss.filter((s) => has(s, ['assume', 'expect', 'given', 'provided'])),
    acceptance_criteria: requirements.map((r, i) => `AC-${String(i + 1).padStart(2, '0')}: ${r.split(': ')[1] ?? r} is implemented and independently verified`),
    open_questions: ss.filter((s) => /\?|\b(tbd|maybe|etc)\b/i.test(s)),
  };
}
export function dcorePlan(input) {
  const ss = sentences(input);
  const components = ss.map((s, i) => `C-${String(i + 1).padStart(2, '0')}: implement — ${s}`);
  return {
    module_id: 'dcore-plan', objective: firstSentence(input) || '(no input)',
    architecture: 'fail-closed, platform-neutral core with platform behavior isolated behind adapters',
    components: components.length ? components : ['C-01: (define components)'],
    dependencies: ss.filter((s) => has(s, ['depends', 'requires', 'needs', 'after'])),
    risks: ss.filter((s) => has(s, ['risk', 'unknown', 'hard', 'unsafe', 'migration', 'breaking'])),
    tests: components.map((c, i) => `T-${String(i + 1).padStart(2, '0')}: test ${c.split(': ')[0]}`),
    rollout: ['dry-run / validate', 'ship behind capability check', 'observe', 'clean up'],
  };
}
// Unified diff -> the ADDED lines with their file and new-file line number (reviews judge what the change adds).
export function parseUnifiedDiff(text) {
  const added = []; const files = new Set();
  let file = null; let ln = 0;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    if (raw.startsWith('+++ ')) { file = raw.slice(4).replace(/^b\//, '').trim(); if (file !== '/dev/null') files.add(file); continue; }
    if (raw.startsWith('--- ') || raw.startsWith('diff --git') || raw.startsWith('index ')) continue;
    const h = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) { ln = Number(h[1]); continue; }
    if (!file) continue;
    if (raw.startsWith('+')) { added.push({ file, line: ln, text: raw.slice(1) }); ln++; }
    else if (raw.startsWith(' ')) ln++;
  }
  return { added, files: [...files].sort() };
}
const isDiff = (t) => /^diff --git |^@@ -\d+/m.test(t) && /^\+\+\+ /m.test(t);

export function dcoreReview(code) {
  const text = String(code ?? '');
  const diff = isDiff(text) ? parseUnifiedDiff(text) : null;
  const lines = diff ? diff.added.map((a) => a.text) : text.split(/\r?\n/);
  const findings = [];
  const flag = (re, severity, category, message) => lines.forEach((ln, i) => { if (re.test(ln)) findings.push({ ...(diff ? { file: diff.added[i].file, line: diff.added[i].line } : { line: i + 1 }), severity, category, message, excerpt: ln.trim().slice(0, 80) }); });
  flag(/\beval\s*\(|new Function\s*\(/, 'high', 'security', 'dynamic code execution');
  flag(/child_process|execSync|exec\s*\(|spawn\s*\(/, 'high', 'security', 'subprocess execution');
  flag(/password\s*[:=]|api[_-]?key\s*[:=]|secret\s*[:=]|token\s*[:=]/i, 'high', 'security', 'possible hardcoded secret');
  flag(/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, 'high', 'security', 'private key material');
  flag(/\bAKIA[0-9A-Z]{16}\b/, 'high', 'security', 'cloud access key id');
  flag(/https?:\/\//i, 'medium', 'security', 'network endpoint reference');
  flag(/(?<![=!<>])==(?!=)|!=(?!=)/, 'low', 'correctness', 'loose equality (prefer ===/!==)');   // not the tail of === / !==
  flag(/\bTODO\b|\bFIXME\b|\bXXX\b/, 'low', 'maintainability', 'unresolved marker');
  flag(/console\.log|print\(/, 'info', 'maintainability', 'debug output');
  const bySev = (s) => findings.filter((f) => f.severity === s).length;
  return {
    module_id: 'dcore-review', objective: 'structured review of supplied code/diff',
    ...(diff ? { mode: 'diff (added lines only)', files_changed: diff.files, added_lines: diff.added.length } : {}),
    correctness: { loose_equality: findings.filter((f) => f.category === 'correctness').length },
    security: { high: findings.filter((f) => f.category === 'security' && f.severity === 'high').length, findings: findings.filter((f) => f.category === 'security').length },
    maintainability: { markers: findings.filter((f) => f.category === 'maintainability').length },
    tests: lines.length ? 'assess test coverage for changed lines' : 'no code supplied',
    findings,
    severity_summary: { high: bySev('high'), medium: bySev('medium'), low: bySev('low'), info: bySev('info') },
    recommendations: findings.length ? [...new Set(findings.map((f) => `address ${f.severity} ${f.category}: ${f.message}`))] : ['no automated findings; perform manual correctness + test review'],
  };
}
export function dcoreQa(input) {
  const ss = sentences(input);
  const scenarios = ss.map((s, i) => `S-${String(i + 1).padStart(2, '0')}: verify — ${s}`);
  return {
    module_id: 'dcore-qa', objective: firstSentence(input) || '(no input)',
    test_levels: ['unit', 'integration', 'failure-mode', 'cross-platform (Windows/macOS/Linux)'],
    scenarios: scenarios.length ? scenarios : ['S-01: (define scenarios)'],
    edge_cases: ['empty input', 'malformed input', 'unknown platform', 'missing capability', 'path traversal attempt'],
    data: ['deterministic fixtures only; no real credentials; no network'],
    exit_criteria: ['all scenarios pass', 'no high-severity finding', 'fail-closed on unknown/unsafe input'],
    // which DCore capability EXECUTES each surface; a scenario is PASS only when it was actually executed
    execute_with: qaSurfaces(input),
    result_vocabulary: ['PASS', 'FAIL', 'BLOCKED', 'NOT_APPLICABLE', 'NOT_TESTED'],
  };
}
function qaSurfaces(input) {
  const t = String(input ?? '');
  const out = [];
  if (/https?:\/\/|\b(page|browser|ui|screen|click|form|login|website|site)\b/i.test(t)) out.push('web UI -> dcore-browse (real browser steps + assertions + screenshots)');
  if (/\b(api|endpoint|rest|graphql|http|webhook)\b/i.test(t)) out.push('API -> dcore-api (requests + status/body/schema assertions)');
  if (/\b(unit|function|module|class|library|cli|command|script|integration|service|worker|job)\b/i.test(t) || !out.length) out.push('code -> dcore-run (the repository test/lint/typecheck commands from dcore-explore)');
  if (/\b(database|db|migration|sql)\b/i.test(t)) out.push('database -> dcore-run against a disposable/test database only (never production)');
  return out;
}

export function dcoreDebug(input) {
  const ss = sentences(input);
  // deterministic root-cause heuristics: map symptom keywords -> candidate causes
  const CAUSES = [
    [['timeout', 'timed', 'slow', 'latency', 'hang', 'deadlock', 'times'], 'contention/latency: slow dependency, lock contention, or unbounded wait'],
    [['null', 'undefined', 'nan', 'empty', 'missing'], 'missing guard: unhandled null/empty/boundary value'],
    [['race', 'concurrent', 'intermittent', 'flaky', 'sometimes'], 'concurrency: race condition or ordering assumption'],
    [['permission', 'denied', 'forbidden', '403', '401', 'auth'], 'authorization/credentials: identity or scope misconfigured'],
    [['after', 'regression', 'since', 'upgrade', 'deploy', 'release'], 'recent change: regression introduced by a recent change — bisect it'],
    [['memory', 'leak', 'oom', 'crash', 'segfault'], 'resource exhaustion: leak or unbounded allocation'],
    [['404', 'not found', 'path', 'route', 'url'], 'wrong target: path/route/config mismatch'],
  ];
  const likely = CAUSES.filter(([ws]) => ss.some((s) => hasStem(s, ws))).map(([, c], i) => `RC-${String(i + 1).padStart(2, '0')}: ${c}`);
  return {
    module_id: 'dcore-debug', objective: firstSentence(input) || '(no input)',
    symptoms: ss.length ? ss : ['(describe the observed vs expected behavior)'],
    hypotheses: ss.length ? ss.map((s, i) => `H-${String(i + 1).padStart(2, '0')}: cause behind — ${s}`) : ['H-01: (form at least one hypothesis)'],
    evidence_to_collect: ['exact error text + stack', 'minimal reproduction', 'recent diffs touching the area', 'logs/metrics around the event', 'environment + version'],
    likely_root_causes: likely.length ? likely : ['RC-01: no keyword match — reproduce, then isolate by bisection'],
    next_steps: ['reproduce deterministically', 'isolate (bisect / remove variables)', 'confirm one hypothesis with evidence', 'fix narrowly', 'add a regression test (dcore-qa)'],
    // the investigation loop and its evidence discipline (filled in by Claude as the loop executes)
    loop: ['reproduce (dcore-run / dcore-browse / dcore-api)', 'collect evidence (exact error, stack, logs, dcore-git log of the area)', 'inspect the implementation (dcore-explore + dcore-impact)', 'hypothesis -> discriminating experiment', 'root cause CONFIRMED by an experiment that flips the outcome', 'smallest fix (dcore-build)', 'regression test that failed before the fix (dcore-test)', 'verify (dcore-run)'],
    evidence_status: { observed_facts: ss.length ? ss.map((s) => `REPORTED: ${s}`) : [], hypotheses: 'UNCONFIRMED until an experiment confirms one', confirmed_root_cause: null, unresolved: ['everything above until reproduced'] },
  };
}
export function dcoreSec(input, opts = {}) {
  const base = dcoreSecText(input);
  if (!opts.repo) return base;
  const scan = secretScan(opts.repo);
  if (scan.error) return { ...base, repo_scan: { error: scan.error } };
  const confirmed = scan.findings.filter((f) => f.classification === 'CONFIRMED');
  return {
    ...base,
    findings: [...(confirmed.length ? confirmed.map((f) => `CONFIRMED ${f.rule}: ${f.file}:${f.line}`) : []), ...base.findings.filter((f) => !/^no automated flags/.test(f) || !scan.findings.length)],
    repo_scan: scan,
    residual_risk: confirmed.length ? 'HIGH: confirmed credential material in the working tree — rotate it and remove it from history with the owner' : base.residual_risk,
  };
}
function dcoreSecText(input) {
  const ss = sentences(input);
  const text = String(input ?? '');
  const surface = [];
  const addSurf = (words, label) => { if (hasStem(text, words)) surface.push(label); };
  addSurf(['input', 'request', 'form', 'upload', 'param', 'query'], 'untrusted input handling');
  addSurf(['auth', 'login', 'token', 'session', 'password', 'permission', 'role'], 'authentication / authorization');
  addSurf(['sql', 'query', 'database', 'db'], 'data store / injection surface');
  addSurf(['http', 'api', 'network', 'request', 'url', 'webhook'], 'network / SSRF surface');
  addSurf(['secret', 'key', 'credential', 'token', 'crypto', 'encrypt', 'hash'], 'secrets / cryptography');
  addSurf(['file', 'path', 'upload', 'download', 'fs'], 'filesystem / path handling');
  addSurf(['depend', 'package', 'library', 'third', 'vendor'], 'third-party dependencies');
  // STRIDE-style checklist (fail-closed: unchecked until verified)
  const checks = ['Spoofing: identities authenticated', 'Tampering: inputs validated + integrity protected', 'Repudiation: security-relevant actions logged', 'Information disclosure: secrets + PII protected, least data exposed', 'Denial of service: limits/timeouts/quotas', 'Elevation of privilege: least privilege + authz on every path'].map((c) => `[ ] ${c}`);
  const findings = [];
  if (/password\s*[:=]|api[_-]?key\s*[:=]|secret\s*[:=]|token\s*[:=]/i.test(text)) findings.push('high: hardcoded-secret language present — verify no secret is embedded');
  if (/\beval\b|new Function|exec\s*\(|child_process/i.test(text)) findings.push('high: dynamic execution / subprocess — validate and avoid untrusted input');
  if (/http:\/\//i.test(text)) findings.push('medium: plaintext http — require TLS');
  if (/\buser input\b|untrusted|unsanit/i.test(text)) findings.push('medium: untrusted input — validate + encode at every boundary');
  return {
    module_id: 'dcore-sec', objective: firstSentence(input) || '(no input)',
    assets: ss.filter((s) => hasStem(s, ['data', 'user', 'secret', 'key', 'money', 'payment', 'pii', 'credential', 'account'])),
    threat_surface: surface.length ? [...new Set(surface)] : ['(no surface keywords detected — enumerate inputs, trust boundaries, and data flows manually)'],
    checks,
    findings: findings.length ? findings : ['no automated flags; perform manual review against the checklist above'],
    recommendations: ['validate + encode all untrusted input', 'enforce authz on every path, not just the UI', 'keep secrets out of code + logs', 'add least-privilege + limits', 'add security regression tests (dcore-qa)'],
    residual_risk: 'UNKNOWN until every checklist item is verified — treat as not-cleared',
  };
}
export function dcoreRelease(input) {
  const ss = sentences(input);
  const text = String(input ?? '');
  const GATES = [
    ['tests', ['test', 'tested', 'ci', 'suite', 'coverage']],
    ['code_review', ['review', 'reviewed', 'approved', 'pr']],
    ['security_review', ['security', 'threat', 'sec', 'audit', 'vuln']],
    ['docs_updated', ['doc', 'docs', 'readme', 'changelog', 'documentation']],
    ['migration_plan', ['migration', 'migrate', 'schema', 'backfill', 'data']],
    ['rollback_plan', ['rollback', 'revert', 'roll back', 'fallback', 'feature flag']],
    ['observability', ['metric', 'log', 'alert', 'monitor', 'trace', 'dashboard']],
    ['versioning', ['version', 'semver', 'tag', 'bump']],
  ];
  const gates = GATES.map(([name, words]) => {
    const mentioned = hasStem(text, words);
    return `[${mentioned ? 'x' : ' '}] ${name}${mentioned ? '' : ' — not evidenced in input'}`;
  });
  const unmet = GATES.filter(([, words]) => !hasStem(text, words)).map(([name]) => name);
  return {
    module_id: 'dcore-release', objective: firstSentence(input) || '(no input)',
    scope: ss.length ? ss : ['(describe what is being released)'],
    gates,
    risks: ss.filter((s) => hasStem(s, ['risk', 'breaking', 'migration', 'downtime', 'irreversible', 'data loss'])),
    unmet_gates: unmet,
    go_no_go: unmet.length === 0 ? 'GO — all gates evidenced (still confirm each is truly satisfied)' : `NO-GO — ${unmet.length} gate(s) not evidenced: ${unmet.join(', ')}`,
    rollout: ['stage / canary first', 'verify observability + health', 'progressive rollout', 'rollback on regression', 'post-release verification'],
  };
}

export function dcoreDoc(input) {
  const ss = sentences(input);
  const uniq = (arr) => [...new Set(arr)];
  const title = firstSentence(input) || '(no input)';
  // KNOWN = inferable from the supplied text; everything else is explicitly UNKNOWN (never invented).
  return {
    module_id: 'dcore-doc', title,
    summary: ss.length ? ss[0] : 'UNKNOWN — provide a one-line summary',
    purpose: ss.length ? uniq(ss) : ['UNKNOWN — state what this is for'],
    prerequisites: ['UNKNOWN — list required runtime / tools / permissions (do not invent)'],
    installation: ['UNKNOWN — document real setup/install steps (do not invent commands)'],
    usage: ['UNKNOWN — show the primary way to use this (do not invent flags)'],
    examples: ['UNKNOWN — add a real, verified example (do not fabricate output)'],
    configuration: ['UNKNOWN — list real configuration keys + defaults, or state "none"'],
    api_interface: ['UNKNOWN — document real public functions/endpoints/flags, or state "none"'],
    behavior: uniq(ss.filter((s) => has(s, ['must', 'should', 'when', 'if', 'returns', 'produces', 'ensures', 'guarantees']))),
    edge_cases: ['empty input', 'malformed input', 'unknown platform', 'missing capability'],
    limitations: uniq(ss.filter((s) => has(s, ['not', 'cannot', 'never', 'only', 'limit', 'without']))),
    troubleshooting: ['UNKNOWN — add real "symptom -> remedy" pairs (do not invent)'],
    testing: ['UNKNOWN — how to verify it works (tests/commands)'],
    migration_notes: uniq(ss.filter((s) => hasStem(s, ['migrat', 'upgrade', 'breaking', 'deprecat', 'rename', 'moved']))),
    open_questions: uniq(ss.filter((s) => /\?|\b(tbd|maybe|unknown)\b/i.test(s))),
  };
}

// ---- thin composition chain (reuses modules + handoff; NOT an orchestration engine) -----------------------
// Runs the common path frame -> spec -> plan -> qa in one call. frame+spec read the original request; plan and qa
// are fed the prior stage's JSON via the same deterministic handoff used on the CLI. Each sub-module is a total,
// deterministic function (never throws, always returns a scaffold), so the chain is fail-closed by construction.
export function dcoreChain(input) {
  const frame = dcoreFrame(input);
  const spec = dcoreSpec(input);
  const plan = runModule('dcore-plan', JSON.stringify(spec));   // handoff from spec
  const qa = runModule('dcore-qa', JSON.stringify(plan));       // handoff from plan
  const stageOf = (r) => (r && r.error ? `ERROR: ${r.error}` : 'ok');
  return {
    module_id: 'dcore-chain', objective: frame.objective,
    stages: ['dcore-frame', 'dcore-spec', 'dcore-plan', 'dcore-qa'],
    stage_status: { frame: stageOf(frame), spec: stageOf(spec), plan: stageOf(plan), qa: stageOf(qa) },
    frame, spec, plan, qa,
  };
}

// ---- dcore-impact: read-only change-impact evidence --------------------------------------------------------
// Extract code-like identifiers (snake_case, camelCase, dotted/filenames) from a change description. Plain English
// words are intentionally ignored — this tool is conservative and only reasons about named symbols/files/keys.
export function extractIdentifiers(text) {
  const t = String(text ?? '');
  const out = new Set();
  for (const m of t.matchAll(/\b[\w./-]+\.[A-Za-z0-9]{1,6}\b/g)) out.add(m[0]);                 // file.ext / dotted
  for (const m of t.matchAll(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g)) out.add(m[0]);     // snake_case
  for (const m of t.matchAll(/\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g)) out.add(m[0]);            // camelCase
  // multi-hump PascalCase (>=2 capital-led segments): matches distinctive compound type/class names like
  // ZodError, RequestValidator, CustomErrorParams, but NEVER a single capitalized English word (Command, Change,
  // Add, Request) — those are single-hump — so ordinary prose/sentence starts are not treated as identifiers.
  for (const m of t.matchAll(/\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b/g)) out.add(m[0]);
  return [...out].filter((x) => x.length >= 3 && /[A-Za-z]/.test(x) && !/^\d/.test(x)).sort();
}
// Secret files are NEVER read (let alone reported). This is narrow on purpose: it must not skip legitimate source
// like session.ts, so we match real secret artifacts, not substrings like "session"/"token"/"cookie".
const IMPACT_SENSITIVE = /(^|[\\/])(\.env(\.|$)|\.credentials|credentials\.json|\.git-credentials|\.npmrc|id_rsa|\.pem|\.ssh[\\/])/i;
const IMPACT_SENSITIVE_EXT = /\.(pem|key|p12|pfx|crt|keystore|pk8|asc)$/i;
// Never descend into VCS metadata, dependency/build output, or local agent-state dirs (the last group — .claude/
// .paysec — can hold session/config/state that must never be scanned or reported, especially under a broad `--repo .`).
const IMPACT_SKIP_DIR = new Set(['.git', '.hg', '.svn', 'node_modules', '.ssh', 'dist', 'build', '.cache', 'coverage', '.venv', 'vendor', '.claude', '.paysec']);
function impactClassify(p) {
  const s = p.replace(/\\/g, '/');
  if (/(^|\/)(tests?|spec|__tests__)(\/|$)|\.(test|spec)\.[A-Za-z0-9]+$/i.test(s)) return 'test';
  if (/\.(md|mdx|rst|adoc|txt)$/i.test(s)) return 'doc';
  return 'source';
}
function impactScan(root) {
  const abs = resolve(root);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new Error('repo path is not a directory');
  const out = [];
  let budget = 4000;
  const walk = (dir) => {
    let names; try { names = readdirSync(dir).sort(); } catch { return; }
    for (const name of names) {
      if (budget <= 0) return;
      const p = join(dir, name);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (!IMPACT_SKIP_DIR.has(name) && !/\.credentials/i.test(name)) walk(p); continue; }
      budget--;
      if (IMPACT_SENSITIVE.test(p) || IMPACT_SENSITIVE_EXT.test(name)) continue;   // never read secret files
      if (st.size > 256 * 1024) continue;
      let buf; try { buf = readFileSync(p); } catch { continue; }
      if (buf.includes(0)) continue;                                               // skip binary
      out.push({ path: relative(abs, p).replace(/\\/g, '/'), content: buf.toString('utf8'), kind: impactClassify(p) });
    }
  };
  walk(abs);
  return out;
}
export function dcoreImpact(input, opts = {}) {
  const identifiers = extractIdentifiers(input);
  const base = {
    module_id: 'dcore-impact', objective: firstSentence(input) || '(no input)',
    identifiers, repo: opts.repo ? String(opts.repo) : null,
    direct_evidence: [], likely_affected_tests: [], possibly_affected_docs: [], unknown_identifiers: [],
    notes: [
      'literal-reference evidence only; indirect/dynamic/semantic references are UNKNOWN',
      'NOT a dependency graph — absence of evidence is not proof of no impact',
      'secret files (.env/.credentials/keys/etc.) are never read or reported',
    ],
  };
  if (!identifiers.length) { base.unknown_identifiers = ['(no code-like identifiers detected — name the symbols/files/keys the change touches)']; return base; }
  if (!opts.repo) { base.unknown_identifiers = identifiers; base.notes.unshift('no repo supplied (--repo <path>): impact UNKNOWN until grounded in a repository'); return base; }
  let files;
  try { files = impactScan(opts.repo); } catch (e) { return { ...base, error: `cannot scan repo: ${e.message}`, unknown_identifiers: identifiers }; }
  const found = new Set();
  for (const f of files) {
    for (const id of identifiers) {
      if (!f.content.includes(id)) continue;
      const lines = [];
      f.content.split(/\r?\n/).forEach((ln, i) => { if (ln.includes(id)) lines.push(i + 1); });
      found.add(id);
      const rec = { file: f.path, identifier: id, line_count: lines.length, lines: lines.slice(0, 10) };
      if (f.kind === 'test') base.likely_affected_tests.push(rec);
      else if (f.kind === 'doc') base.possibly_affected_docs.push(rec);
      else base.direct_evidence.push(rec);
    }
  }
  const byKey = (a, b) => (a.file + '::' + a.identifier).localeCompare(b.file + '::' + b.identifier);
  base.direct_evidence.sort(byKey); base.likely_affected_tests.sort(byKey); base.possibly_affected_docs.sort(byKey);
  base.unknown_identifiers = identifiers.filter((id) => !found.has(id));
  base.files_scanned = files.length;
  return base;
}
// Compact, deterministic presentation of a dcore-impact result. Derives ENTIRELY from the structured evidence —
// it runs no new analysis, hides no UNKNOWN, and never turns inference into certainty.
export function summarizeImpact(r) {
  if (!r || r.module_id !== 'dcore-impact') return renderMarkdown(r);
  const fileSet = (arr) => [...new Set(arr.map((e) => e.file))].sort();
  const line = (label, arr) => { const f = fileSet(arr); return `${label} (${f.length}): ${f.length ? f.join(', ') : '(none)'}`; };
  const out = [
    `dcore-impact: ${r.objective}`,
    `repo: ${r.repo ?? '(none — impact UNKNOWN until --repo is supplied)'}${r.files_scanned != null ? ` — ${r.files_scanned} files scanned` : ''}`,
    `identifiers: ${r.identifiers.length ? r.identifiers.join(', ') : '(none detected)'}`,
  ];
  if (r.error) out.push(`error: ${r.error}`);
  out.push(line('DIRECT', r.direct_evidence));
  out.push(line('LIKELY tests', r.likely_affected_tests));
  out.push(line('POSSIBLE docs', r.possibly_affected_docs));
  out.push(`UNKNOWN (${r.unknown_identifiers.length}): ${r.unknown_identifiers.length ? r.unknown_identifiers.join(', ') : '(none)'}`);
  out.push('note: literal references only — NOT a dependency graph; UNKNOWN is not proof of no impact.');
  return out.join('\n');
}

// ---- deterministic module-to-module handoff ---------------------------------------------------------------
// A downstream module may be fed the JSON output of an upstream dcore module (e.g. `dcore-spec --json | dcore-plan`).
// We detect that shape and carry its objective + salient list forward as seed text, so chains need no re-typing.
export function parseHandoff(input) {
  const s = String(input ?? '').trim();
  if (!s.startsWith('{')) return null;
  try {
    const o = JSON.parse(s);
    if (o && typeof o === 'object' && typeof o.module_id === 'string' && o.module_id.startsWith('dcore-') && typeof o.objective === 'string') {
      const carry = o.requirements || o.components || o.scenarios || o.symptoms || o.hypotheses || [];
      return { from: o.module_id, objective: o.objective, carry: Array.isArray(carry) ? carry : [] };
    }
  } catch { /* not JSON — treat as plain text */ }
  return null;
}
function handoffToText(ho) {
  const norm = (x) => String(x).replace(/[.!?]+$/, '').trim().toLowerCase();
  const objective = ho.objective.replace(/[.!?]+$/, '');
  const seen = new Set([norm(objective)]);
  const items = ho.carry
    .map((x) => String(x).replace(/^[A-Z]+-\d+:\s*/, '').replace(/^(implement|verify|cause behind)\s*—\s*/i, '').replace(/[.!?]+$/, '').trim())
    .filter((x) => x && !seen.has(norm(x)) && (seen.add(norm(x)) || true));   // drop blanks + anything equal to a prior line
  return [objective, ...items].filter(Boolean).join('. ');
}

// ---- procedures: Claude performs the edits with its own tools; these scaffolds ground them in the repo ----------
function conventions(repo) {
  if (!repo) return null;
  const x = dcoreExplore('', { repo });
  if (x.error) return { error: x.error };
  return { languages: x.languages.slice(0, 5), frameworks: x.frameworks, test_frameworks: x.test_frameworks, test_dirs: x.test_dirs, commands: x.commands.filter((c) => ['test', 'lint', 'typecheck', 'build'].includes(c.kind)) };
}
export function dcoreBuild(input, opts = {}) {
  return {
    module_id: 'dcore-build', objective: firstSentence(input) || '(no input)',
    conventions: conventions(opts.repo) ?? 'pass --repo <path> to ground the change in the repository conventions',
    procedure: ['read the code you will change and its callers (dcore-impact) before editing', 'make the smallest coherent change that meets the acceptance criteria; no unrelated refactors', 'preserve public APIs/behavior unless the requirement says otherwise', 'match the surrounding naming, structure, comment density and error handling', 'update or add tests for the changed behavior (dcore-test)', 'run the repository verification commands (dcore-run): tests, then lint/typecheck/build if present', 'report the actual diff (dcore-git diff) and the verification evidence'],
    done_when: ['acceptance criteria met', 'verification commands executed and PASS (unexecuted = NOT_TESTED, never PASS)', 'diff contains only intended changes'],
    never: ['commit or push without explicit approval (dcore-git gates)', 'delete or overwrite user work', 'invent APIs/config the repo does not have'],
  };
}
export function dcoreTest(input, opts = {}) {
  const conv = conventions(opts.repo);
  return {
    module_id: 'dcore-test', objective: firstSentence(input) || '(no input)',
    conventions: conv ?? 'pass --repo <path> to discover the test framework, test directories and commands',
    procedure: ['find the nearest existing test file for the code under test and copy its structure', 'for a bug: write the regression test FIRST and confirm it FAILS on the current code (dcore-run)', 'cover the edge cases that matter: empty/null, boundary values, invalid input, error paths, permissions', 'one behavior per test; deterministic data; no real credentials, network or clocks (use the repository fakes/mocks)', 'run the new tests and the surrounding suite (dcore-run); a test that cannot run is NOT_TESTED', 'delete tests that only restate the implementation or never fail'],
    test_command: (conv && !conv.error ? conv.commands.find((c) => c.kind === 'test')?.command : null) ?? 'UNKNOWN (no test command discovered)',
  };
}
export function dcoreRoute(input) { return routeTask(input); }

const RUNNERS = { 'dcore-frame': dcoreFrame, 'dcore-spec': dcoreSpec, 'dcore-plan': dcorePlan, 'dcore-review': dcoreReview, 'dcore-qa': dcoreQa, 'dcore-debug': dcoreDebug, 'dcore-sec': dcoreSec, 'dcore-release': dcoreRelease, 'dcore-doc': dcoreDoc, 'dcore-chain': dcoreChain, 'dcore-impact': dcoreImpact, 'dcore-explore': dcoreExplore, 'dcore-build': dcoreBuild, 'dcore-test': dcoreTest, 'dcore-route': dcoreRoute };

export function runModule(moduleId, input, opts = {}) {
  const runner = RUNNERS[moduleId];
  if (!runner && EXECUTION_MODULES.includes(moduleId)) return { error: `${moduleId} is an execution module: run it through the CLI (node scripts/dcore.mjs ${moduleId} ...)`, execution_module: true, known_modules: MODULES.map((m) => m.module_id) };
  if (!runner) {
    const known = MODULES.find((m) => m.module_id === moduleId);
    return { error: known ? `module ${moduleId} is ${known.status}, not yet runnable` : `unknown module: ${moduleId}`, known_modules: MODULES.map((m) => m.module_id) };
  }
  const ho = parseHandoff(input);
  const result = runner(ho ? handoffToText(ho) : input, opts);
  if (ho) result.handoff_from = ho.from;
  return result;
}

export function renderMarkdown(result) {
  if (result.error) return `dcore: ${result.error}`;
  const lines = [`# DCore · ${result.module_id}`, ''];
  for (const [k, v] of Object.entries(result)) {
    if (k === 'module_id') continue;
    lines.push(`## ${k}`);
    if (Array.isArray(v)) lines.push(...(v.length ? v.map((x) => `- ${typeof x === 'object' ? JSON.stringify(x) : x}`) : ['- (none)']));
    else if (v && typeof v === 'object') lines.push('```json', JSON.stringify(v, null, 2), '```');
    else lines.push(String(v));
    lines.push('');
  }
  return lines.join('\n');
}

export function buildManifest() {
  return {
    schema: 'dcore.skill_manifest/1', version: 1, skill_id: 'dcore', name: 'dcore',
    description: 'Universal, fail-closed Claude Code skill set for framing, specifying, planning, reviewing, QA, debugging, security review and release readiness — composable via deterministic handoff, installable by clone, no certification/credentials/network required.',
    license: 'Apache-2.0', entrypoint: 'SKILL.md', runner: 'scripts/dcore.mjs',
    modules: MODULES.map((m) => ({ module_id: m.module_id, module_name: m.module_name, status: m.status, kind: m.kind, purpose: m.purpose, permissions: m.permissions, security_level: m.security_level, platform_requirements: m.platform_requirements, reference: `modules/${m.module_id}.md`, runnable: IMPLEMENTED.includes(m.module_id) })),
    implemented_count: IMPLEMENTED.length, planned_count: MODULES.filter((m) => m.status === 'PLANNED').length, deferred_count: MODULES.filter((m) => m.status === 'DEFERRED').length,
    requires_certification_for_basic_use: false, requires_private_infrastructure: false, requires_credentials: false, requires_network: false,
    execution_layer: {
      optional: true, location: 'scripts/exec/', modules: EXECUTION_MODULES,
      subprocess: 'dcore-run (the one requested command), dcore-git (git), dcore-browse (the local browser), dcore-release (git + test command)',
      network: 'only dcore-api / dcore-browse / dcore-verify, only to the URL the user gives; never in reasoning modules',
      credentials: 'only from environment variables the user names (valueEnv / --auth-env); always redacted from evidence',
      approvals: 'git-commit, git-push, deploy, release, production, db-destructive, delete, external-write, credential, account, destructive-command — per invocation via --approve',
      forbidden: ['force-push', 'history-rewrite'],
    },
  };
}

// Deprecated aliases (pre-DCore names). Kept so existing imports keep working; use the dcore* names.
export const dkFrame = dcoreFrame, dkSpec = dcoreSpec, dkPlan = dcorePlan, dkReview = dcoreReview, dkQa = dcoreQa;
