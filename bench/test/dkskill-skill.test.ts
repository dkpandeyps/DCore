import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MODULES, IMPLEMENTED, runModule, renderMarkdown, buildManifest, dkSpec, dkReview, dkPlan, dkQa, dkFrame,
} from '../../skills/dkskill/scripts/modules.mjs';
import { install, planInstall, isSafeDestRoot } from '../../skills/dkskill/scripts/install.mjs';
import { buildCoverageMatrix } from '../../skills/dkskill/scripts/coverage.mjs';
import { TEST_DIR } from './helpers.ts';

const SKILL = join(TEST_DIR, '..', '..', 'skills', 'dkskill');
// Structural discovery only — real Claude Code discovery is a separate, authorized step.
const REAL_CLAUDE_CODE_DISCOVERY = 'REAL_SMOKE_TEST_PENDING';

test('A. skill structure present (SKILL.md, modules, references, scripts, templates, manifest)', () => {
  assert.ok(existsSync(join(SKILL, 'SKILL.md')));
  assert.ok(existsSync(join(SKILL, 'dkskill.manifest.json')));
  for (const d of ['modules', 'references', 'scripts', 'templates']) assert.ok(existsSync(join(SKILL, d)), d);
  assert.ok(existsSync(join(SKILL, '..', '..', 'README.md')) && existsSync(join(SKILL, '..', '..', 'LICENSE')));
});

test('B. SKILL.md is an operational skill definition (frontmatter name/description; usage; safety)', () => {
  const s = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  assert.match(s, /^---[\s\S]*name:\s*dkskill[\s\S]*description:/m);
  assert.ok(/When to use dkskill/i.test(s) && /How to invoke/i.test(s) && /Safe operating rules/i.test(s));
  assert.ok(!/design document|specification phase/i.test(s));   // operational, not a design doc
});

test('C. module discovery: manifest lists modules; every reference resolves', () => {
  const m = buildManifest();
  assert.equal(m.schema, 'dkskill.skill_manifest/1');
  assert.equal(readFileSync(join(SKILL, 'dkskill.manifest.json'), 'utf8'), JSON.stringify(m, null, 2) + '\n');
  assert.equal(m.modules.length, MODULES.length);
  for (const mod of m.modules) assert.ok(existsSync(join(SKILL, mod.reference)), mod.reference);
  assert.equal(m.implemented_count, 5);
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
  assert.equal(spec.module_id, 'dk-spec');
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

test('F. dk-review finds security/correctness issues with severity', () => {
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
  const unknown = runModule('dk-nope', 'x');
  assert.ok(unknown.error && unknown.known_modules.length === MODULES.length);
  const planned = runModule('dk-debug', 'x');
  assert.ok(planned.error && /PLANNED/i.test(planned.error));
  assert.ok(renderMarkdown(unknown).startsWith('dkskill:'));
});

test('I. installer: idempotent + confined install into a temp dir; no files outside target', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dkskill-inst-'));
  try {
    const target = join(dir, 'skills');
    const r1 = install({ target });
    assert.equal(r1.ok, true);
    assert.ok(r1.created > 0 && r1.updated === 0);
    assert.ok(existsSync(join(target, 'dkskill', 'SKILL.md')));
    assert.ok(existsSync(join(target, 'dkskill', 'scripts', 'dkskill.mjs')));
    const r2 = install({ target });   // idempotent
    assert.equal(r2.created, 0);
    assert.equal(r2.updated, 0);
    assert.equal(r2.unchanged, r2.files);
    assert.equal(r2.network_contacted, false);
    assert.equal(r2.credentials_accessed, false);
    // every written path is under the target
    for (const a of r2.actions) assert.ok(a.path.startsWith(join(target, 'dkskill')), a.path);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('J. installer safety: rejects runtime/credential targets; path-traversal protected; dry-run writes nothing', () => {
  assert.equal(isSafeDestRoot('/opt/runtime/skills'), false);
  assert.equal(isSafeDestRoot('/home/u/.claude/.credentials.json'), false);
  assert.equal(isSafeDestRoot('/opt/skills'), true);
  assert.equal(install({ target: '/opt/runtime/x' }).ok, false);
  assert.equal(install({ target: '' }).ok, false);
  const dir = mkdtempSync(join(tmpdir(), 'dkskill-dry-'));
  try {
    const r = install({ target: join(dir, 'skills'), dryRun: true });
    assert.equal(r.ok, true);
    assert.ok(r.created > 0);
    assert.equal(existsSync(join(dir, 'skills', 'dkskill', 'SKILL.md')), false);   // dry-run wrote nothing
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('K. cross-platform: plan uses node:path; install plan resolves nested paths on this OS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dkskill-xp-'));
  try {
    const plan = planInstall(join(dir, 'skills'));
    assert.ok(plan.length > 0 && plan.every((p) => p.dest.includes('dkskill')));
    // nested module reference paths install correctly regardless of OS separator
    const r = install({ target: join(dir, 'skills') });
    assert.ok(existsSync(join(dir, 'skills', 'dkskill', 'modules', 'dk-spec.md')));
    assert.ok(r.ok);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  // modules are platform-neutral (platform_requirements: any)
  assert.ok(MODULES.every((m) => m.platform_requirements.includes('any')));
});

test('L. no credential/network/exec imports or calls in the public skill scripts (static)', () => {
  // NB: dk-review legitimately CONTAINS tokens like child_process/exec/password= as detection PATTERNS. We therefore
  // check for real imports and real call sites, not substrings inside regex literals.
  for (const f of ['modules.mjs', 'dkskill.mjs', 'install.mjs', 'coverage.mjs']) {
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
  for (const f of ['modules.mjs', 'dkskill.mjs', 'install.mjs', 'coverage.mjs']) {
    const src = readFileSync(join(SKILL, 'scripts', f), 'utf8');
    assert.ok(!/import[^;]*from\s*['"][^'"]*(compatibility|\/bench\/)/.test(src), f);
  }
});

test('N. gstack coverage metadata: original names; missing useful capability = 0', () => {
  const c = buildCoverageMatrix();
  assert.equal(c.missing_useful_capabilities, 0);
  assert.equal(c.total, 10);
  assert.ok(c.rows.every((r: any) => /^dk-/.test(r.original_module_name)));   // original dkskill names only
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
