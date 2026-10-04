// dcore router — turns a natural-language engineering task into an ordered workflow of DCore capabilities.
// Pure and deterministic: no I/O. It does not execute anything; it tells Claude WHICH capability to run in WHICH
// order, which phases really execute (vs. reason), which surfaces were detected, and which approvals would be needed.

const INTENTS = [
  // [intent, stems] — stems are matched at a word start, case-insensitively
  ['release', ['release', 'ship', 'publish', 'cut a version', 'prepare.*release', 'tag v', 'changelog']],
  ['deploy', ['deploy', 'rollout', 'roll out', 'promote to', 'go live']],
  ['verify', ['verify (the )?deploy', 'smoke', 'health ?check', 'post-deploy', 'is (it|the site|prod) (up|down|working)', 'canary', 'monitor']],
  ['debug', ['fix', 'bug', 'debug', 'investigat', 'why', 'broken', 'fails?', 'failing', 'error', 'crash', 'timeout', 'times out', 'regression', 'not working', 'flaky', 'intermittent', 'root cause', 'exception']],
  ['qa', ['test', 'qa\\b', 'e2e', 'end to end', 'end-to-end', 'check (this|the) (page|site|app|flow|form)', 'try (out|the)', 'click through', 'walk through']],
  ['review', ['review', 'code review', 'pr\\b', 'pull request', 'diff', 'look over', 'audit (this|the) change']],
  ['security', ['secur', 'vulnerab', 'pentest', 'threat', 'owasp', 'secret', 'xss', 'csrf', 'ssrf', 'injection', 'auth(n|z)?\\b']],
  ['impact', ['impact', 'what (will|would|does) .{0,60}(affect|break|touch)', 'blast radius', 'renam', 'who uses', 'where is .* used']],
  ['document', ['document', 'docs?\\b', 'readme', 'explain how to use', 'usage guide', 'release notes', 'api docs']],
  ['perf', ['perf', 'slow', 'latency', 'speed up', 'benchmark', 'load time', 'n\\+1']],
  ['a11y', ['accessib', 'a11y', 'screen reader', 'wcag', 'keyboard nav']],
  ['deps', ['dependenc', 'upgrade (the )?(package|lib|dep)', 'bump', 'outdated', 'lockfile', 'npm audit']],
  ['explore', ['explore', 'understand', 'how does', 'walk me through (the )?(code|repo)', 'what is this (repo|project)', 'inspect', 'onboard', 'architecture']],
  ['build', ['implement', 'add', 'build', 'create', 'feature', 'support for', 'write (a|an|the) ', 'make it', 'refactor', 'change .* to']],
];

const re = (stem) => new RegExp(`(^|[^\\w])${stem}`, 'i');
export function detectIntents(task) {
  const t = String(task ?? '');
  return INTENTS.filter(([, stems]) => stems.some((s) => re(s).test(t))).map(([i]) => i);
}

export function detectSurfaces(task) {
  const t = String(task ?? '');
  const urls = [...new Set((t.match(/https?:\/\/[^\s'"<>)]+/gi) ?? []).map((u) => u.replace(/[.,;]+$/, '')))];
  const apiish = urls.filter((u) => /\/api\/|\/v\d+\/|\.json(\?|$)|graphql/i.test(u));
  const local = urls.filter((u) => /\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(u));
  const files = [...new Set(t.match(/(?:[\w.-]+\/)+[\w.-]+\.\w+|\b[\w-]+\.(?:js|mjs|ts|tsx|jsx|py|java|go|rs|rb|php|cs|json|ya?ml|md|sql)\b/g) ?? [])];
  const credentials = /\b(login|log in|sign in|password|credential|username)\b/i.test(t);
  const production = /\bprod(uction)?\b|\blive (site|system)\b/i.test(t) && !/\bnon-?prod/i.test(t);
  return {
    urls, api_urls: apiish, local_urls: local, files,
    web: urls.length > 0 && apiish.length < urls.length, api: apiish.length > 0 || /\b(endpoint|api|rest|graphql|http (get|post))\b/i.test(t),
    needs_login: credentials, mentions_production: production,
  };
}

// phase: [capability, executes?, purpose]
const P = (capability, executes, purpose, extra = {}) => ({ capability, executes, purpose, ...extra });
const WORKFLOWS = {
  qa_web: [P('dcore-explore', false, 'if a repo is present: find the app, its routes and test conventions (skip for a remote URL only)', { optional: true }), P('dcore-qa', false, 'decide the testing surface and a focused strategy (what to execute, what is out of scope)'), P('dcore-browse', true, 'open the page, authenticate via env-var credentials, inspect, interact, assert, screenshot; capture console/network errors'), P('dcore-browse', true, 'accessibility heuristics (a11y step) + mobile viewport + navigation timing', { label: 'a11y/perf' }), P('dcore-sec', false, 'sensitivity review of what was observed (secrets in page/console/URLs, http vs https, error leakage)'), P('dcore-report', true, 'three separate PDFs (Detailed Test Report, Detailed Defect Report, Test Case Register): PASS/FAIL/BLOCKED/NOT_TESTED per case with screenshots, steps, defects and acceptance criteria')],
  qa_api: [P('dcore-qa', false, 'list endpoints, positive/negative/boundary cases'), P('dcore-api', true, 'execute requests with status/header/body/schema assertions; negative + timeout cases'), P('dcore-sec', false, 'auth/authz + data exposure review of responses'), P('report', false, 'evidence per request')],
  qa_repo: [P('dcore-explore', true, 'discover test/lint/typecheck commands and conventions'), P('dcore-qa', false, 'pick the surfaces (unit/integration/e2e) relevant to the request'), P('dcore-run', true, 'execute the relevant test/lint/typecheck commands; classify failures; rerun targeted'), P('dcore-test', false, 'add missing focused tests where coverage of the request is absent', { optional: true }), P('report', false, 'executed vs not executed, with counts and failures')],
  debug: [P('dcore-explore', true, 'locate the code, commands and recent history (dcore-git log) for the failing area'), P('dcore-debug', false, 'record observed facts vs hypotheses; choose the cheapest discriminating experiment'), P('dcore-run', true, 'reproduce: run the failing test/command (or dcore-browse / dcore-api for a web/API symptom)'), P('dcore-impact', true, 'find every place the suspected code is referenced'), P('dcore-build', false, 'smallest fix for the CONFIRMED root cause only'), P('dcore-test', false, 'add a regression test that fails before the fix'), P('dcore-run', true, 'verify: regression test + full relevant suite pass', { label: 'verify' }), P('dcore-review', false, 'review the diff (dcore-git diff | dcore-review)'), P('dcore-sec', true, 'scan the change for introduced secrets/unsafe patterns'), P('report', false, 'root cause (confirmed vs not), fix, evidence')],
  build: [P('dcore-explore', true, 'conventions, entry points, commands'), P('dcore-frame', false, 'objective, stakeholders, risks, open questions'), P('dcore-spec', false, 'requirements + acceptance criteria'), P('dcore-plan', false, 'components, dependencies, risks, tests'), P('dcore-impact', true, 'what the change touches (source/tests/docs/config)'), P('dcore-build', false, 'implement the smallest coherent change'), P('dcore-test', false, 'add focused tests for the acceptance criteria'), P('dcore-run', true, 'run tests/lint/typecheck/build'), P('dcore-review', false, 'review the actual diff'), P('dcore-sec', true, 'scan for introduced secrets/unsafe patterns'), P('dcore-doc', false, 'update docs where behavior changed', { optional: true }), P('report', false, 'what changed, evidence, open items')],
  review: [P('dcore-git', true, 'collect the real diff (status + diff or a range)'), P('dcore-review', false, 'findings on ADDED lines with file:line and severity'), P('dcore-impact', true, 'callers/tests/docs of the changed identifiers'), P('dcore-sec', true, 'scan for secrets/unsafe patterns'), P('dcore-run', true, 'run the relevant tests', { optional: true }), P('report', false, 'actionable findings only')],
  security: [P('dcore-explore', true, 'surfaces: entry points, integrations, config'), P('dcore-sec', true, 'repository scan (CONFIRMED / SUSPICIOUS / THEORETICAL) + STRIDE where a design is involved'), P('dcore-run', true, 'ecosystem audit tool if present (e.g. npm audit, pip-audit)', { optional: true }), P('dcore-api', true, 'confirm suspected issues against a running non-production instance only with authorization', { optional: true }), P('report', false, 'confirmed vs suspicious vs not tested')],
  impact: [P('dcore-impact', true, 'literal references across source/tests/docs/config'), P('dcore-explore', true, 'deployment/release surfaces (CI, Docker, manifests)', { optional: true }), P('report', false, 'DIRECT / LIKELY / POSSIBLE / UNKNOWN')],
  document: [P('dcore-explore', true, 'what actually exists: commands, config, entry points'), P('dcore-doc', false, 'scaffold known vs UNKNOWN; never invent APIs or config'), P('dcore-build', false, 'write/update the doc files'), P('report', false, 'what was documented from evidence, what stays UNKNOWN')],
  release: [P('dcore-git', true, 'status, branch, upstream sync'), P('dcore-impact', true, 'what the release contains (diff since last tag)', { optional: true }), P('dcore-release', true, 'run gates: clean tree, upstream, tests, secret scan, version, docs => READY/BLOCKED'), P('dcore-review', false, 'review the release diff', { optional: true }), P('approval', false, 'ask the user to approve push/deploy explicitly', { gate: true }), P('dcore-release', true, 'push/deploy only with --approve; verified by remote HEAD / dcore-verify', { label: 'publish' }), P('report', false, 'verdict READY / BLOCKED / NOT_AUTHORIZED / FAILED / VERIFIED')],
  deploy: [P('dcore-release', true, 'readiness gates first'), P('approval', false, 'explicit user approval for this deploy target', { gate: true }), P('dcore-run', true, 'run the deploy command with --approve deploy'), P('dcore-verify', true, 'health endpoint + page + optional browser smoke; FAILED => rollback signal (no auto-rollback)'), P('report', false, 'VERIFIED or FAILED with evidence')],
  verify: [P('dcore-verify', true, 'health endpoints + expected page/text + latency'), P('dcore-browse', true, 'critical-workflow smoke in a real browser', { optional: true }), P('report', false, 'VERIFIED / FAILED / BLOCKED with evidence')],
  perf: [P('dcore-explore', true, 'locate the hot path'), P('dcore-api', true, 'measure latency with --repeat (p50/p95) before/after', { optional: true }), P('dcore-browse', true, 'navigation timing for pages (perf step)', { optional: true }), P('dcore-run', true, 'run an existing benchmark if the repo has one', { optional: true }), P('report', false, 'measured numbers only; no estimates')],
  a11y: [P('dcore-browse', true, 'a11y step on each page + keyboard (Tab) walk + mobile viewport'), P('report', false, 'findings with selectors; not a WCAG certification')],
  deps: [P('dcore-explore', true, 'manifests, lockfiles, ecosystems'), P('dcore-run', true, 'ecosystem outdated/audit commands'), P('dcore-plan', false, 'upgrade plan: one dependency group at a time'), P('dcore-run', true, 'tests after each upgrade', { label: 'verify' }), P('report', false, 'what was upgraded and verified')],
  explore: [P('dcore-explore', true, 'project type, languages, frameworks, commands, entry points, CI, integrations'), P('dcore-git', true, 'recent history', { optional: true }), P('report', false, 'map of the repository')],
};

const APPROVALS = { release: ['git-push', 'release'], deploy: ['deploy', 'production'], build: ['git-commit'], debug: ['git-commit'] };

export function routeTask(task) {
  const text = String(task ?? '').trim();
  const intents = detectIntents(text);
  const surfaces = detectSurfaces(text);
  if (!text) return { module_id: 'dcore-route', task: '(none)', intent: 'unknown', intents: [], surfaces, workflow: [], approvals_possibly_required: [], notes: ['empty task: describe what you want done'] };
  // precedence: an explicit deploy/release/verify wins; then debug > qa > review > security > impact > docs > perf/a11y/deps > explore > build
  const order = ['deploy', 'release', 'verify', 'debug', 'qa', 'review', 'security', 'impact', 'document', 'perf', 'a11y', 'deps', 'explore', 'build'];
  let primary = order.find((i) => intents.includes(i)) ?? (surfaces.urls.length ? 'qa' : 'build');
  if (primary === 'debug' && intents.includes('qa') && !/\b(fix|debug|why|investigat|root cause)/i.test(text)) primary = 'qa';   // "test this page ... errors" is QA
  let key = primary;
  if (primary === 'qa') key = surfaces.web ? 'qa_web' : surfaces.api ? 'qa_api' : 'qa_repo';
  const workflow = (WORKFLOWS[key] ?? WORKFLOWS.build).map((p, i) => ({ step: i + 1, ...p }));
  // secondary intents add their key phase if missing (e.g. "fix X and add docs" => doc phase)
  const extra = intents.filter((i) => i !== primary && ['document', 'security', 'a11y', 'perf'].includes(i));
  for (const i of extra) { const cap = { document: 'dcore-doc', security: 'dcore-sec', a11y: 'dcore-browse', perf: 'dcore-api' }[i]; if (!workflow.some((w) => w.capability === cap)) workflow.splice(workflow.length - 1, 0, { step: 0, ...P(cap, cap !== 'dcore-doc', `requested: ${i}`) }); }
  workflow.forEach((w, i) => { w.step = i + 1; });
  const approvals = [...new Set([...(APPROVALS[primary] ?? []), ...(surfaces.mentions_production ? ['production'] : [])])];
  const notes = [];
  if (surfaces.needs_login) notes.push('credentials: pass them via environment variables (e.g. DCORE_USER / DCORE_PASS) and reference them with valueEnv; never put them in files, steps or reports');
  if (surfaces.mentions_production) notes.push('production mentioned: read-only checks only unless the user explicitly approves a production action');
  if (surfaces.urls.length && !surfaces.local_urls.length) notes.push('remote site: confirm the user is authorized to test it before driving it; stay within the stated scope');
  return {
    module_id: 'dcore-route', task: text, intent: primary, intents, surfaces, workflow_key: key, workflow,
    executes: [...new Set(workflow.filter((w) => w.executes).map((w) => w.capability))],
    approvals_possibly_required: approvals, notes,
  };
}
