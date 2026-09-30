// dkskill module engine — portable, dependency-free ESM. Deterministic, read-only analysis.
// No network, no credentials, no ~/.claude access, no arbitrary execution, no destructive actions.
// The "intelligence" of each module is the guidance in the module reference that Claude Code follows; this engine
// produces a deterministic structured scaffold from the user's input so the behavior is real and testable offline.

export const MODULES = [
  { module_id: 'dk-frame', module_name: 'Problem Framing', status: 'IMPLEMENTED', purpose: 'turn a raw request into a framed problem (objective, stakeholders, risks, open questions)', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dk-spec', module_name: 'Specification', status: 'IMPLEMENTED', purpose: 'turn a problem into a structured specification', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dk-plan', module_name: 'Engineering Plan', status: 'IMPLEMENTED', purpose: 'turn a feature/request into an implementation plan', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dk-review', module_name: 'Code Review', status: 'IMPLEMENTED', purpose: 'produce a structured review of code/diff text', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dk-qa', module_name: 'QA / Test Plan', status: 'IMPLEMENTED', purpose: 'produce a test plan from a feature/spec', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dk-debug', module_name: 'Debug / Investigation', status: 'PLANNED', purpose: 'structured investigation of a defect', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dk-sec', module_name: 'Security Review', status: 'PLANNED', purpose: 'structured security review', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dk-doc', module_name: 'Documentation', status: 'PLANNED', purpose: 'generate documentation scaffolds', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dk-release', module_name: 'Release Prep', status: 'PLANNED', purpose: 'release readiness checklist', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
  { module_id: 'dk-retro', module_name: 'Retrospective', status: 'DEFERRED', purpose: 'project retrospective scaffold', permissions: ['read-only'], security_level: 'SAFE_GENERIC', platform_requirements: ['any'] },
];
export const IMPLEMENTED = MODULES.filter((m) => m.status === 'IMPLEMENTED').map((m) => m.module_id);

// ---- deterministic text helpers (pure) --------------------------------------------------------------------
function sentences(text) { return String(text ?? '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean); }
function firstSentence(text) { return sentences(text)[0] ?? String(text ?? '').trim(); }
const has = (s, words) => words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(s));

// ---- modules (each returns a plain structured object) ------------------------------------------------------
export function dkFrame(input) {
  const ss = sentences(input);
  return {
    module_id: 'dk-frame', objective: firstSentence(input) || '(no input)',
    stakeholders: ['requester', 'end users', 'maintainers'],
    problem: ss.length ? ss : ['(state the problem)'],
    context: ss.filter((s) => has(s, ['because', 'since', 'currently', 'today'])),
    success_signals: ['the stated objective is met', 'no safety-critical regression', 'clear, verifiable outcome'],
    risks: ss.filter((s) => has(s, ['risk', 'unknown', 'hard', 'unclear', 'unsafe', 'block'])),
    open_questions: ss.filter((s) => /\?|\b(tbd|maybe|etc|somehow)\b/i.test(s)),
  };
}
export function dkSpec(input) {
  const ss = sentences(input);
  const requirements = ss.map((s, i) => `REQ-${String(i + 1).padStart(2, '0')}: ${s}`);
  return {
    module_id: 'dk-spec', objective: firstSentence(input) || '(no input)',
    users: ['primary user', 'operator/maintainer'],
    requirements: requirements.length ? requirements : ['REQ-01: (define at least one requirement)'],
    constraints: ss.filter((s) => has(s, ['must', 'only', 'cannot', 'never', 'limit', 'within', 'without'])),
    assumptions: ss.filter((s) => has(s, ['assume', 'expect', 'given', 'provided'])),
    acceptance_criteria: requirements.map((r, i) => `AC-${String(i + 1).padStart(2, '0')}: ${r.split(': ')[1] ?? r} is implemented and independently verified`),
    open_questions: ss.filter((s) => /\?|\b(tbd|maybe|etc)\b/i.test(s)),
  };
}
export function dkPlan(input) {
  const ss = sentences(input);
  const components = ss.map((s, i) => `C-${String(i + 1).padStart(2, '0')}: implement — ${s}`);
  return {
    module_id: 'dk-plan', objective: firstSentence(input) || '(no input)',
    architecture: 'fail-closed, platform-neutral core with platform behavior isolated behind adapters',
    components: components.length ? components : ['C-01: (define components)'],
    dependencies: ss.filter((s) => has(s, ['depends', 'requires', 'needs', 'after'])),
    risks: ss.filter((s) => has(s, ['risk', 'unknown', 'hard', 'unsafe', 'migration', 'breaking'])),
    tests: components.map((c, i) => `T-${String(i + 1).padStart(2, '0')}: test ${c.split(': ')[0]}`),
    rollout: ['dry-run / validate', 'ship behind capability check', 'observe', 'clean up'],
  };
}
export function dkReview(code) {
  const text = String(code ?? '');
  const lines = text.split(/\r?\n/);
  const findings = [];
  const flag = (re, severity, category, message) => lines.forEach((ln, i) => { if (re.test(ln)) findings.push({ line: i + 1, severity, category, message, excerpt: ln.trim().slice(0, 80) }); });
  flag(/\beval\s*\(|new Function\s*\(/, 'high', 'security', 'dynamic code execution');
  flag(/child_process|execSync|exec\s*\(|spawn\s*\(/, 'high', 'security', 'subprocess execution');
  flag(/password\s*[:=]|api[_-]?key\s*[:=]|secret\s*[:=]|token\s*[:=]/i, 'high', 'security', 'possible hardcoded secret');
  flag(/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, 'high', 'security', 'private key material');
  flag(/\bAKIA[0-9A-Z]{16}\b/, 'high', 'security', 'cloud access key id');
  flag(/https?:\/\//i, 'medium', 'security', 'network endpoint reference');
  flag(/==(?!=)|!=(?!=)/, 'low', 'correctness', 'loose equality (prefer ===/!==)');
  flag(/\bTODO\b|\bFIXME\b|\bXXX\b/, 'low', 'maintainability', 'unresolved marker');
  flag(/console\.log|print\(/, 'info', 'maintainability', 'debug output');
  const bySev = (s) => findings.filter((f) => f.severity === s).length;
  return {
    module_id: 'dk-review', objective: 'structured review of supplied code/diff',
    correctness: { loose_equality: findings.filter((f) => f.category === 'correctness').length },
    security: { high: findings.filter((f) => f.category === 'security' && f.severity === 'high').length, findings: findings.filter((f) => f.category === 'security').length },
    maintainability: { markers: findings.filter((f) => f.category === 'maintainability').length },
    tests: lines.length ? 'assess test coverage for changed lines' : 'no code supplied',
    findings,
    severity_summary: { high: bySev('high'), medium: bySev('medium'), low: bySev('low'), info: bySev('info') },
    recommendations: findings.length ? [...new Set(findings.map((f) => `address ${f.severity} ${f.category}: ${f.message}`))] : ['no automated findings; perform manual correctness + test review'],
  };
}
export function dkQa(input) {
  const ss = sentences(input);
  const scenarios = ss.map((s, i) => `S-${String(i + 1).padStart(2, '0')}: verify — ${s}`);
  return {
    module_id: 'dk-qa', objective: firstSentence(input) || '(no input)',
    test_levels: ['unit', 'integration', 'failure-mode', 'cross-platform (Windows/macOS/Linux)'],
    scenarios: scenarios.length ? scenarios : ['S-01: (define scenarios)'],
    edge_cases: ['empty input', 'malformed input', 'unknown platform', 'missing capability', 'path traversal attempt'],
    data: ['deterministic fixtures only; no real credentials; no network'],
    exit_criteria: ['all scenarios pass', 'no high-severity finding', 'fail-closed on unknown/unsafe input'],
  };
}

const RUNNERS = { 'dk-frame': dkFrame, 'dk-spec': dkSpec, 'dk-plan': dkPlan, 'dk-review': dkReview, 'dk-qa': dkQa };

export function runModule(moduleId, input) {
  const runner = RUNNERS[moduleId];
  if (!runner) {
    const known = MODULES.find((m) => m.module_id === moduleId);
    return { error: known ? `module ${moduleId} is ${known.status}, not yet runnable` : `unknown module: ${moduleId}`, known_modules: MODULES.map((m) => m.module_id) };
  }
  return runner(input);
}

export function renderMarkdown(result) {
  if (result.error) return `dkskill: ${result.error}`;
  const lines = [`# dkskill · ${result.module_id}`, ''];
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
    schema: 'dkskill.skill_manifest/1', version: 1, skill_id: 'dkskill', name: 'dkskill',
    description: 'Universal, fail-closed Claude Code skill set for framing, specifying, planning, reviewing and QA — installable by clone, no certification/credentials/network required.',
    license: 'Apache-2.0', entrypoint: 'SKILL.md', runner: 'scripts/dkskill.mjs',
    modules: MODULES.map((m) => ({ module_id: m.module_id, module_name: m.module_name, status: m.status, purpose: m.purpose, permissions: m.permissions, security_level: m.security_level, platform_requirements: m.platform_requirements, reference: `modules/${m.module_id}.md`, runnable: IMPLEMENTED.includes(m.module_id) })),
    implemented_count: IMPLEMENTED.length, planned_count: MODULES.filter((m) => m.status === 'PLANNED').length, deferred_count: MODULES.filter((m) => m.status === 'DEFERRED').length,
    requires_certification_for_basic_use: false, requires_private_infrastructure: false, requires_credentials: false, requires_network: false,
  };
}
