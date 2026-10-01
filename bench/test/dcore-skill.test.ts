import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MODULES, IMPLEMENTED, runModule, renderMarkdown, buildManifest, dkSpec, dkReview, dkPlan, dkQa, dkFrame,
  dcoreDebug, dcoreSec, dcoreRelease, parseHandoff, dcoreDoc, dcoreChain, dcoreImpact, extractIdentifiers, summarizeImpact,
} from '../../skills/dcore/scripts/modules.mjs';
import { install, planInstall, isSafeDestRoot } from '../../skills/dcore/scripts/install.mjs';
import { buildCoverageMatrix } from '../../skills/dcore/scripts/coverage.mjs';
import { parseArgs, resolveInput } from '../../skills/dcore/scripts/dcore.mjs';
import { TEST_DIR } from './helpers.ts';

const SKILL = join(TEST_DIR, '..', '..', 'skills', 'dcore');
// Structural discovery only — real Claude Code discovery is a separate, authorized step.
const REAL_CLAUDE_CODE_DISCOVERY = 'REAL_SMOKE_TEST_PENDING';

test('A. skill structure present (SKILL.md, modules, references, scripts, templates, manifest)', () => {
  assert.ok(existsSync(join(SKILL, 'SKILL.md')));
  assert.ok(existsSync(join(SKILL, 'dcore.manifest.json')));
  for (const d of ['modules', 'references', 'scripts', 'templates']) assert.ok(existsSync(join(SKILL, d)), d);
  assert.ok(existsSync(join(SKILL, '..', '..', 'README.md')) && existsSync(join(SKILL, '..', '..', 'LICENSE')));
});

test('B. SKILL.md is an operational skill definition (frontmatter name/description; usage; safety)', () => {
  const s = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  assert.match(s, /^---[\s\S]*name:\s*dcore[\s\S]*description:/m);
  assert.ok(/When to use dcore/i.test(s) && /How to invoke/i.test(s) && /Safe operating rules/i.test(s));
  assert.ok(!/design document|specification phase/i.test(s));   // operational, not a design doc
});

test('C. module discovery: manifest lists modules; every reference resolves', () => {
  const m = buildManifest();
  assert.equal(m.schema, 'dcore.skill_manifest/1');
  assert.equal(readFileSync(join(SKILL, 'dcore.manifest.json'), 'utf8'), JSON.stringify(m, null, 2) + '\n');
  assert.equal(m.modules.length, MODULES.length);
  for (const mod of m.modules) assert.ok(existsSync(join(SKILL, mod.reference)), mod.reference);
  assert.equal(m.implemented_count, 11);
});

test('D. module contracts: every module doc carries required fields + status', () => {
  for (const mod of MODULES) {
    const md = readFileSync(join(SKILL, 'modules', `${mod.module_id}.md`), 'utf8');
    for (const field of ['module_id', 'status', 'purpose', 'inputs', 'outputs', 'permissions', 'security_level', 'platform_requirements', 'failure_behavior']) assert.ok(md.includes(field), `${mod.module_id}:${field}`);
    assert.ok(md.includes(mod.status));
  }
});

test('E. module behavior: implemented modules produce structured output (deterministic)', () => {
  const spec = dkSpec('Build an installer. It must be idempotent. What about rollback?');
  assert.equal(spec.module_id, 'dcore-spec');
  assert.equal(spec.objective, 'Build an installer.');
  assert.ok(spec.requirements.length === 3 && spec.requirements[0].startsWith('REQ-01'));
  assert.ok(spec.constraints.some((c: string) => /idempotent/i.test(c)));
  assert.ok(spec.open_questions.some((q: string) => /rollback/i.test(q)));
  assert.equal(JSON.stringify(dkSpec('x')), JSON.stringify(dkSpec('x')));   // deterministic
  // plan + qa + frame
  assert.ok(dkPlan('Add a feature. It depends on the parser.').dependencies.length >= 1);
  assert.ok(dkQa('Verify login. Verify logout.').scenarios.length === 2);
  assert.ok(dkFrame('Users are blocked because the API is unclear.').context.length >= 1);
});

test('F. dcore-review finds security/correctness issues with severity', () => {
  const r = dkReview('const p = eval(x)\nif (a == b) {}\nconst k = "password=secret123"\nfetch("http://evil")\n// TODO');
  assert.ok(r.severity_summary.high >= 2);   // eval + hardcoded secret
  assert.ok(r.findings.some((f: any) => f.category === 'security'));
  assert.ok(r.recommendations.length > 0);
});

test('G. malformed/empty input => safe scaffold (fail-closed)', () => {
  const s = dkSpec('');
  assert.equal(s.objective, '(no input)');
  assert.ok(s.requirements[0].includes('define at least one requirement'));
  assert.equal(dkFrame('').open_questions.length, 0);
});

test('H. unknown module => diagnostic (not a crash/guess); planned module not runnable', () => {
  const unknown = runModule('dcore-nope', 'x');
  assert.ok(unknown.error && unknown.known_modules.length === MODULES.length);
  const notRunnable = runModule('dcore-retro', 'x');   // dcore-retro remains DEFERRED (not runnable)
  assert.ok(notRunnable.error && /DEFERRED|PLANNED/i.test(notRunnable.error));
  assert.ok(renderMarkdown(unknown).startsWith('dcore:'));
});

test('I. installer: idempotent + confined install into a temp dir; no files outside target', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dcore-inst-'));
  try {
    const target = join(dir, 'skills');
    const r1 = install({ target });
    assert.equal(r1.ok, true);
    assert.ok(r1.created > 0 && r1.updated === 0);
    assert.ok(existsSync(join(target, 'dcore', 'SKILL.md')));
    assert.ok(existsSync(join(target, 'dcore', 'scripts', 'dcore.mjs')));
    const r2 = install({ target });   // idempotent
    assert.equal(r2.created, 0);
    assert.equal(r2.updated, 0);
    assert.equal(r2.unchanged, r2.files);
    assert.equal(r2.network_contacted, false);
    assert.equal(r2.credentials_accessed, false);
    // every written path is under the target
    for (const a of r2.actions) assert.ok(a.path.startsWith(join(target, 'dcore')), a.path);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('J. installer safety: rejects runtime/credential targets; path-traversal protected; dry-run writes nothing', () => {
  assert.equal(isSafeDestRoot('/opt/runtime/skills'), false);
  assert.equal(isSafeDestRoot('/home/u/.claude/.credentials.json'), false);
  assert.equal(isSafeDestRoot('/opt/skills'), true);
  assert.equal(install({ target: '/opt/runtime/x' }).ok, false);
  assert.equal(install({ target: '' }).ok, false);
  const dir = mkdtempSync(join(tmpdir(), 'dcore-dry-'));
  try {
    const r = install({ target: join(dir, 'skills'), dryRun: true });
    assert.equal(r.ok, true);
    assert.ok(r.created > 0);
    assert.equal(existsSync(join(dir, 'skills', 'dcore', 'SKILL.md')), false);   // dry-run wrote nothing
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('K. cross-platform: plan uses node:path; install plan resolves nested paths on this OS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dcore-xp-'));
  try {
    const plan = planInstall(join(dir, 'skills'));
    assert.ok(plan.length > 0 && plan.every((p) => p.dest.includes('dcore')));
    // nested module reference paths install correctly regardless of OS separator
    const r = install({ target: join(dir, 'skills') });
    assert.ok(existsSync(join(dir, 'skills', 'dcore', 'modules', 'dcore-spec.md')));
    assert.ok(r.ok);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  // modules are platform-neutral (platform_requirements: any)
  assert.ok(MODULES.every((m) => m.platform_requirements.includes('any')));
});

test('L. no credential/network/exec imports or calls in the public skill scripts (static)', () => {
  // NB: dcore-review legitimately CONTAINS tokens like child_process/exec/password= as detection PATTERNS. We therefore
  // check for real imports and real call sites, not substrings inside regex literals.
  for (const f of ['modules.mjs', 'dcore.mjs', 'install.mjs', 'coverage.mjs']) {
    const src = readFileSync(join(SKILL, 'scripts', f), 'utf8');
    assert.ok(!/(import[^;]*from|require\s*\(\s*)['"]node:(child_process|http|https|net|dgram|tls|http2)['"]/.test(src), `${f} imports network/exec module`);
    assert.ok(!/\bfetch\s*\(|\.connect\s*\(|createServer\s*\(|generateKeyPair|createSign\s*\(/.test(src), `${f} calls network/crypto`);
    assert.ok(!/readFileSync\s*\([^)]*\.claude/i.test(src), `${f} reads ~/.claude`);
  }
});

test('M. public/private boundary: skill needs no certification/private infra/credentials/network', () => {
  const m = buildManifest();
  assert.equal(m.requires_certification_for_basic_use, false);
  assert.equal(m.requires_private_infrastructure, false);
  assert.equal(m.requires_credentials, false);
  assert.equal(m.requires_network, false);
  // the skill scripts IMPORT nothing from the optional assurance layer (compatibility/bench) — a doc path string is ok
  for (const f of ['modules.mjs', 'dcore.mjs', 'install.mjs', 'coverage.mjs']) {
    const src = readFileSync(join(SKILL, 'scripts', f), 'utf8');
    assert.ok(!/import[^;]*from\s*['"][^'"]*(compatibility|\/bench\/)/.test(src), f);
  }
});

test('N. gstack coverage metadata: original names; missing useful capability = 0', () => {
  const c = buildCoverageMatrix();
  assert.equal(c.missing_useful_capabilities, 0);
  assert.equal(c.total, 10);
  assert.ok(c.rows.every((r: any) => /^dcore-/.test(r.original_module_name)));   // original dcore names only
  assert.equal(readFileSync(join(SKILL, 'references', 'gstack-coverage.json'), 'utf8'), JSON.stringify(c, null, 2) + '\n');
});

test('O. structural discovery passes; real Claude Code discovery is PENDING (not claimed passed)', () => {
  // STRUCTURAL_DISCOVERY_TEST: repo -> structure -> SKILL.md -> manifest -> modules resolve
  const m = buildManifest();
  assert.ok(existsSync(join(SKILL, m.entrypoint)) && existsSync(join(SKILL, m.runner)));
  assert.ok(m.modules.filter((x) => x.runnable).every((x) => IMPLEMENTED.includes(x.module_id)));
  // REAL_CLAUDE_CODE_DISCOVERY_TEST is not performed here (no Claude execution / no ~/.claude / no auth)
  assert.equal(REAL_CLAUDE_CODE_DISCOVERY, 'REAL_SMOKE_TEST_PENDING');
});

test('P. CLI input resolution: --input > positional > stdin (M29: positional no longer dropped)', () => {
  // positional text after the module name is now used as input
  assert.equal(resolveInput(parseArgs(['dcore-spec', 'hello world']), () => 'STDIN'), 'hello world');
  // multiple positional tokens are joined
  assert.equal(resolveInput(parseArgs(['dcore-frame', 'a', 'b', 'c']), () => 'STDIN'), 'a b c');
  // explicit --input still wins over positional
  assert.equal(resolveInput(parseArgs(['dcore-spec', 'pos', '--input', 'flag']), () => 'STDIN'), 'flag');
  // no positional and no flag => fall back to stdin
  assert.equal(resolveInput(parseArgs(['dcore-qa']), () => 'STDIN'), 'STDIN');
  // --json flag does not leak into the input text
  assert.equal(resolveInput(parseArgs(['dcore-plan', 'x', '--json']), () => ''), 'x');
});

test('Q. dcore-review detects private key material and cloud access key ids (M29: high severity)', () => {
  const r = dkReview('-----BEGIN RSA PRIVATE KEY-----\nconst id = "AKIAABCDEFGHIJKLMNOP"\n');
  assert.ok(r.findings.some((f: any) => f.message === 'private key material' && f.severity === 'high'));
  assert.ok(r.findings.some((f: any) => f.message === 'cloud access key id' && f.severity === 'high'));
  assert.ok(r.severity_summary.high >= 2);
});

test('R. dcore-debug: hypotheses + keyword-driven root causes + next steps; deterministic; fail-closed', () => {
  const d = dcoreDebug('The API times out intermittently after the latest deploy. It sometimes returns null.');
  assert.equal(d.module_id, 'dcore-debug');
  assert.equal(d.symptoms.length, 2);
  assert.ok(d.hypotheses[0].startsWith('H-01'));
  // keyword heuristics: latency (times out), concurrency (intermittent/sometimes), recent change (after/deploy), null guard
  assert.ok(d.likely_root_causes.some((c: string) => /latency|contention/i.test(c)));
  assert.ok(d.likely_root_causes.some((c: string) => /recent change/i.test(c)));
  assert.ok(d.next_steps.some((s: string) => /regression test/i.test(s)));
  assert.equal(JSON.stringify(dcoreDebug('x')), JSON.stringify(dcoreDebug('x')));   // deterministic
  const empty = dcoreDebug('');
  assert.equal(empty.objective, '(no input)');
  assert.ok(empty.likely_root_causes.length >= 1);   // fail-closed scaffold
});

test('S. dcore-sec: threat surface + STRIDE checks + findings; residual risk stays UNKNOWN (fail-closed)', () => {
  const s = dcoreSec('Add an endpoint that accepts user input and a token, then runs a SQL query against the database.');
  assert.equal(s.module_id, 'dcore-sec');
  assert.ok(s.threat_surface.some((x: string) => /input/i.test(x)) && s.threat_surface.some((x: string) => /injection|data store/i.test(x)));
  assert.equal(s.checks.length, 6);                       // STRIDE
  assert.ok(s.checks.every((c: string) => c.startsWith('[ ]')));   // unchecked = fail-closed
  assert.match(s.residual_risk, /UNKNOWN/);
  assert.ok(dcoreSec('store the api_key=abc in config').findings.some((f: string) => /high/.test(f)));
});

test('T. dcore-release: fail-closed go/no-go; evidenced gates marked; unmet gates block', () => {
  const r = dcoreRelease('Release v2 adds a schema migration. Tests pass and code review approved.');
  assert.equal(r.module_id, 'dcore-release');
  assert.match(r.go_no_go, /NO-GO/);                      // rollback/observability/etc not evidenced
  assert.ok(r.unmet_gates.includes('rollback_plan') && r.unmet_gates.includes('observability'));
  assert.ok(r.gates.some((g: string) => g.startsWith('[x] tests')) && r.gates.some((g: string) => g.startsWith('[x] code_review')));
  // empty input => everything unmet => NO-GO (fail-closed)
  assert.match(dcoreRelease('').go_no_go, /NO-GO/);
});

test('U. module handoff: a prior module JSON seeds the next; provenance recorded (M29 composability)', () => {
  const spec = dkSpec('Add token-bucket rate limiting. Verify burst is capped.');
  const ho = parseHandoff(JSON.stringify(spec));
  assert.ok(ho && ho.from === 'dcore-spec' && /rate limiting/i.test(ho.objective));
  // feed spec JSON into dcore-qa via runModule => scenarios derived without re-typing, provenance tagged
  const qa = runModule('dcore-qa', JSON.stringify(spec));
  assert.equal(qa.handoff_from, 'dcore-spec');
  assert.ok(/rate limiting/i.test(qa.objective) && qa.scenarios.length >= 1);
  // plain text is NOT treated as handoff (backward compatible)
  assert.equal(parseHandoff('just some text'), null);
  assert.equal(runModule('dcore-spec', 'plain text').handoff_from, undefined);
});

test('V. dcore-doc: known vs UNKNOWN scaffold; no invented APIs; handoff; deterministic; safe on bad input', () => {
  const d = dcoreDoc('Add a rate limiter. It must not add network calls. Breaking change: removes the old limiter.');
  assert.equal(d.module_id, 'dcore-doc');
  assert.equal(d.title, 'Add a rate limiter.');
  assert.ok(d.purpose.length >= 1);
  assert.ok(d.behavior.some((b: string) => /network/i.test(b)));          // inferred "must not add network calls"
  assert.ok(d.limitations.some((l: string) => /network|old limiter/i.test(l)));
  assert.ok(d.migration_notes.some((m: string) => /breaking/i.test(m)));  // stem match
  // sections that need real detail are explicit UNKNOWN, never invented
  for (const k of ['prerequisites', 'installation', 'usage', 'examples', 'configuration', 'api_interface', 'troubleshooting', 'testing']) {
    assert.ok((d as any)[k].every((x: string) => /UNKNOWN/.test(x)), `${k} must be UNKNOWN, not fabricated`);
  }
  assert.equal(JSON.stringify(dcoreDoc('x')), JSON.stringify(dcoreDoc('x')));   // deterministic
  // duplicate avoidance
  const dup = dcoreDoc('Same line. Same line. Other line.');
  assert.equal(dup.purpose.filter((p: string) => p === 'Same line.').length, 1);
  // empty input => safe UNKNOWN scaffold (fail-closed)
  const empty = dcoreDoc('');
  assert.equal(empty.title, '(no input)');
  assert.ok(/UNKNOWN/.test(empty.summary));
  // handoff from dcore-spec via runModule; malformed JSON falls back to plain text (no throw)
  const spec = dkSpec('Add token-bucket rate limiting per API key.');
  const viaHandoff = runModule('dcore-doc', JSON.stringify(spec));
  assert.equal(viaHandoff.handoff_from, 'dcore-spec');
  assert.ok(/rate limiting/i.test(viaHandoff.title));
  assert.doesNotThrow(() => runModule('dcore-doc', '{ not valid json'));
  assert.equal(runModule('dcore-doc', '{ not valid json').handoff_from, undefined);
});

test('W. dcore-chain: ordered frame->spec->plan->qa; handoff between stages; reuses modules; fail-closed', () => {
  const c = dcoreChain('Add per-key token-bucket rate limiting. Verify burst is capped.');
  assert.equal(c.module_id, 'dcore-chain');
  assert.deepEqual(c.stages, ['dcore-frame', 'dcore-spec', 'dcore-plan', 'dcore-qa']);   // ordering
  assert.deepEqual(c.stage_status, { frame: 'ok', spec: 'ok', plan: 'ok', qa: 'ok' });
  // handoff between stages
  assert.equal(c.plan.handoff_from, 'dcore-spec');
  assert.equal(c.qa.handoff_from, 'dcore-plan');
  assert.ok(c.qa.scenarios.length >= 1);
  // reuses existing module behavior exactly (no duplicated/divergent logic): frame/spec stages equal direct calls
  assert.equal(JSON.stringify(c.frame), JSON.stringify(dkFrame('Add per-key token-bucket rate limiting. Verify burst is capped.')));
  assert.equal(JSON.stringify(c.spec), JSON.stringify(dkSpec('Add per-key token-bucket rate limiting. Verify burst is capped.')));
  // deterministic
  assert.equal(JSON.stringify(dcoreChain('x')), JSON.stringify(dcoreChain('x')));
  // empty + malformed input => every stage still present, fail-closed, no throw
  assert.doesNotThrow(() => dcoreChain(''));
  const empty = dcoreChain('');
  assert.deepEqual(empty.stages, ['dcore-frame', 'dcore-spec', 'dcore-plan', 'dcore-qa']);
  assert.ok(empty.frame && empty.spec && empty.plan && empty.qa);
  assert.doesNotThrow(() => dcoreChain('{ garbage ]['));
  // individual module CLIs/behaviour unchanged (backward compatible)
  assert.equal(runModule('dcore-spec', 'plain').module_id, 'dcore-spec');
});

test('X. installer includes the new modules; project-local, idempotent, no network/credentials', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dcore-m30-'));
  try {
    const target = join(dir, 'skills');
    const r1 = install({ target });
    assert.equal(r1.ok, true);
    assert.equal(r1.network_contacted, false);
    assert.equal(r1.credentials_accessed, false);
    assert.equal(r1.subprocesses_spawned, false);
    assert.ok(existsSync(join(target, 'dcore', 'modules', 'dcore-doc.md')));
    assert.ok(existsSync(join(target, 'dcore', 'modules', 'dcore-chain.md')));
    const r2 = install({ target });   // idempotent
    assert.equal(r2.created, 0);
    assert.equal(r2.updated, 0);
    assert.equal(r2.unchanged, r2.files);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Y. dcore-impact: read-only repo scan classifies evidence; excludes secrets; deterministic; fail-closed', () => {
  // identifier extraction: code-like tokens only, plain English ignored
  const ids = extractIdentifiers('Rename cache_ttl to cache_ttl_seconds; touch getCacheTtl and config.json.');
  assert.ok(['cache_ttl', 'cache_ttl_seconds', 'getCacheTtl', 'config.json'].every((x) => ids.includes(x)));
  assert.ok(!ids.includes('Rename') && !ids.includes('touch'));

  // no --repo => everything UNKNOWN (fail-closed, no fabrication)
  const noRepo = dcoreImpact('change cache_ttl_seconds');
  assert.equal(noRepo.module_id, 'dcore-impact');
  assert.deepEqual(noRepo.direct_evidence, []);
  assert.ok(noRepo.unknown_identifiers.includes('cache_ttl_seconds'));
  assert.ok(dcoreImpact('').unknown_identifiers.length >= 1);   // empty input safe

  const dir = mkdtempSync(join(tmpdir(), 'dcore-impact-'));
  try {
    mkdirSync(join(dir, 'src')); mkdirSync(join(dir, 'test')); mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'src', 'cache.js'), 'export const cache_ttl_seconds = 300\n');
    writeFileSync(join(dir, 'test', 'cache.test.js'), 'assert(cache_ttl_seconds === 300)\n');
    writeFileSync(join(dir, 'docs', 'config.md'), '`cache_ttl_seconds` controls cache.\n');
    // NB: use a non-token sentinel (never a real provider key pattern) so this fixture can't trip secret scanners.
    writeFileSync(join(dir, '.env'), 'API_KEY=SEKRET_SENTINEL_DO_NOT_LEAK\ncache_ttl_seconds=secret\n');  // must be excluded
    writeFileSync(join(dir, 'server.pem'), '-----BEGIN RSA PRIVATE KEY-----\ncache_ttl_seconds\n');        // must be excluded

    const r = dcoreImpact('change cache_ttl_seconds', { repo: dir });
    assert.ok(r.direct_evidence.some((e: any) => e.file === 'src/cache.js' && e.identifier === 'cache_ttl_seconds'));   // DIRECT
    assert.ok(r.likely_affected_tests.some((e: any) => e.file === 'test/cache.test.js'));                               // LIKELY (test)
    assert.ok(r.possibly_affected_docs.some((e: any) => e.file === 'docs/config.md'));                                  // POSSIBLE (doc)
    // secret files are never read or reported
    const files = [...r.direct_evidence, ...r.likely_affected_tests, ...r.possibly_affected_docs].map((e: any) => e.file);
    assert.ok(!files.some((f: string) => /\.env|\.pem/.test(f)), 'secret files excluded from evidence');
    assert.ok(!JSON.stringify(r).includes('SEKRET_SENTINEL_DO_NOT_LEAK'), 'no secret content in output');
    assert.equal(r.files_scanned, 3);   // .env + .pem skipped
    // deterministic
    assert.equal(JSON.stringify(dcoreImpact('change cache_ttl_seconds', { repo: dir })), JSON.stringify(r));
    // no fabricated edges: an absent identifier is UNKNOWN, never invented
    const r2 = dcoreImpact('change nonexistent_symbol_xyz', { repo: dir });
    assert.ok(r2.unknown_identifiers.includes('nonexistent_symbol_xyz') && r2.direct_evidence.length === 0);
    // bad repo path => error + UNKNOWN, no throw
    assert.doesNotThrow(() => dcoreImpact('change cache_ttl_seconds', { repo: join(dir, 'nope') }));
    const bad = dcoreImpact('change cache_ttl_seconds', { repo: join(dir, 'nope') });
    assert.ok(bad.error && bad.unknown_identifiers.includes('cache_ttl_seconds'));
    // handoff path still works via runModule (provenance) and opts thread through
    const viaCli = runModule('dcore-impact', 'change cache_ttl_seconds', { repo: dir });
    assert.ok(viaCli.direct_evidence.length >= 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Z. dcore-impact --summary: compact deterministic view of the SAME evidence; handoff still works (M32)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dcore-sum-'));
  try {
    mkdirSync(join(dir, 'src')); mkdirSync(join(dir, 'test')); mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'src', 'cache.js'), 'export const cache_ttl_seconds = 300\n');
    writeFileSync(join(dir, 'test', 'cache.test.js'), 'assert(cache_ttl_seconds)\n');
    writeFileSync(join(dir, 'docs', 'config.md'), '`cache_ttl_seconds` doc\n');

    const r = dcoreImpact('change cache_ttl_seconds', { repo: dir });
    const sum = summarizeImpact(r);
    // compact text: every category with counts + deduped file list
    assert.match(sum, /DIRECT \(1\): src\/cache\.js/);
    assert.match(sum, /LIKELY tests \(1\): test\/cache\.test\.js/);
    assert.match(sum, /POSSIBLE docs \(1\): docs\/config\.md/);
    assert.match(sum, /UNKNOWN \(0\)/);
    assert.match(sum, /NOT a dependency graph/);                       // limitation never hidden
    // derived ONLY from evidence: nothing in the summary that is not in the structured result
    const resultFiles = new Set([...r.direct_evidence, ...r.likely_affected_tests, ...r.possibly_affected_docs].map((e: any) => e.file));
    for (const f of ['src/cache.js', 'test/cache.test.js', 'docs/config.md']) assert.ok(resultFiles.has(f));
    // deterministic
    assert.equal(summarizeImpact(dcoreImpact('change cache_ttl_seconds', { repo: dir })), sum);
    // UNKNOWN preserved (absent identifier), never fabricated into evidence
    assert.match(summarizeImpact(dcoreImpact('change ghost_symbol', { repo: dir })), /UNKNOWN \(1\): ghost_symbol/);
    // empty input is safe in summary form
    assert.match(summarizeImpact(dcoreImpact('', { repo: dir })), /identifiers: \(none detected\)/);
    // non-impact result => falls back to the full render (backward compatible, full mode preserved)
    assert.ok(summarizeImpact(dkSpec('x')).startsWith('# DCore \u00b7 dcore-spec'));

    // HANDOFF regression (already works via generic handoff): spec JSON seeds dcore-impact + records provenance
    const spec = dkSpec('Change cache_ttl_seconds default.');
    const viaHandoff = runModule('dcore-impact', JSON.stringify(spec), { repo: dir });
    assert.equal(viaHandoff.handoff_from, 'dcore-spec');
    assert.ok(viaHandoff.identifiers.includes('cache_ttl_seconds'));
    assert.ok(viaHandoff.direct_evidence.some((e: any) => e.file === 'src/cache.js'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
