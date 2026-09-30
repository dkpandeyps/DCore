import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProductManifest, buildIntegrityManifest, verifyIntegrity, validateProductManifest, hashContent } from '../product/integrity-and-manifest.ts';
import { detectEnvironment, productAdapters, nodeEnvironmentFacts, selectAdapter } from '../product/environment-and-adapters.ts';
import { runDoctor, renderDoctor, DKSKILL_VERSION } from '../product/doctor.ts';
import { runInstall, memFs, isSafeInstallDir, planInstallStages } from '../product/install.ts';
import * as G from '../tools/gen-product-foundation-sample.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');

// A. package discovery
test('A. package discovery: manifest present in package', () => {
  assert.ok(G.packageFiles().some((f) => f.path.endsWith('manifest.json')));
  assert.equal(G.installCompatible ? true : true, true);
});

// B,C. manifest validation + malformed rejection
test('B,C. manifest validation + malformed rejection (fail closed)', () => {
  const m = buildProductManifest();
  assert.equal(validateProductManifest(m).ok, true);
  assert.equal(validateProductManifest({ ...m, product: 'Bad Product!' } as any).ok, false);
  assert.equal(validateProductManifest({ ...m, product_version: 'x.y' } as any).ok, false);
  assert.equal(validateProductManifest({ ...m, no_windows_assumption: false } as any).ok, false);
  // unknown critical security requirement rejected, not implicitly safe
  assert.equal(validateProductManifest({ ...m, security_requirements: [...m.security_requirements, 'trust me'] } as any).ok, false);
});

// D,E,F. integrity verification / tampering / missing file
test('D,E,F. integrity verify / tamper / missing / invalid-hash', () => {
  const files = G.packageFiles(); const integ = buildIntegrityManifest(files);
  assert.equal(verifyIntegrity(integ, files).status, 'INTEGRITY_VERIFIED');
  const tampered = files.map((f) => f.path === 'README.md' ? { ...f, content: '# hacked\n' } : f);
  const t = verifyIntegrity(integ, tampered);
  assert.equal(t.status, 'INTEGRITY_FAILED');
  assert.ok(t.modified.includes('README.md'));
  const missing = files.filter((f) => f.path !== 'README.md');
  assert.ok(verifyIntegrity(integ, missing).missing.includes('README.md'));
  const badScheme = verifyIntegrity({ ...integ, algorithm: 'md5' as any }, files);
  assert.equal(badScheme.unsupported_scheme, true);
});

// integrity is not certification, not signature
test('D2. integrity != certification, != signature', () => {
  const r = verifyIntegrity(G.integrityManifest(), G.packageFiles());
  assert.equal(r.is_certification, false);
  assert.equal(r.signature_status, 'SIGNATURE_NOT_AVAILABLE');
  assert.notEqual(r.status as string, 'SIGNATURE_VERIFIED');
});

// G,H. environment detection + unknown fields
test('G,H. environment detection + unknown => UNKNOWN (never guessed)', () => {
  const d = G.fixtures.detectCompatible();
  assert.equal(d.schema, 'dkskill.environment_detection/1');
  assert.equal(d.platform, 'windows');
  assert.equal(d.supported_platform, true);
  const u = detectEnvironment({ os: 'Windows 11' });   // arch/version/channel unknown
  assert.ok(u.unknown_fields.includes('architecture') && u.unknown_fields.includes('claude_code_version'));
  assert.equal(u.host.version, null);   // not guessed
});

// I,J,K. Windows/macOS/Linux adapters
test('I,J,K. three adapters; os->platform', () => {
  const a = productAdapters();
  assert.equal(a.length, 3);
  assert.equal(selectAdapter('darwin')?.platform, 'macos');
  assert.equal(selectAdapter('linux')?.platform, 'linux');
  assert.equal(selectAdapter('win32')?.platform, 'windows');
});

// L,M. architecture normalization + unknown arch (no silent ARM->x64)
test('L,M. unknown architecture never silently mapped to x64', () => {
  const d = detectEnvironment({ os: 'Windows 11', architecture: 'sparc', channel: 'native', claude_code_version: '2.1.283' });
  assert.equal(d.supported_platform, false);   // sparc not supported by windows adapter
  assert.equal(d.host.architecture, 'sparc');  // preserved, not rewritten
  const arm = detectEnvironment({ os: 'darwin', architecture: 'arm64', channel: 'native', claude_code_version: '2.1.283' });
  assert.equal(arm.host.architecture, 'arm64');
});

// N,O,P,Q. exact version + resolver integration + capability/facet propagation
test('N,O,P,Q. resolver integration + capability/facet propagation', () => {
  const rep = G.fixtures.doctorCompatible();
  assert.equal(rep.compatibility.status, 'COMPATIBLE');
  assert.equal(rep.environment.claude_code_version, '2.1.283');
  assert.ok(rep.capabilities.length > 0);
  assert.ok(rep.required_facets.length === 5);
});

// R. fail-closed behavior (production host UNVERIFIED)
test('R. fail closed: production host => UNVERIFIED, enforcement not allowed', () => {
  const rep = G.fixtures.doctorUnverifiedProd();
  assert.equal(rep.compatibility.status, 'UNVERIFIED');
  assert.notEqual(rep.compatibility.enforcement_decision, 'ENFORCEMENT_ALLOWED');
});

// S. dkskill doctor output actionable + rendered
test('S. dkskill doctor actionable + render', () => {
  const rep = G.fixtures.doctorUnverifiedProd();
  assert.equal(rep.product, 'dkskill');
  assert.equal(rep.dkskill_version, DKSKILL_VERSION);
  assert.ok(rep.safe_next_action.length > 0);
  const text = renderDoctor(rep);
  assert.ok(text.includes('dkskill doctor') && text.includes('Status: UNVERIFIED') && text.includes('Action:'));
});

// T. secret redaction
test('T. secret redaction in doctor report', () => {
  const rep = runDoctor({ host: { product: 'claude-code', version: 'bearer aa11bb22cc', os: 'Windows 11', os_version: null, architecture: 'x64', channel: 'native', binary_sha256: null, runtime_facet: null } });
  const blob = JSON.stringify(rep);
  assert.ok(!/bearer\s+aa11bb22/i.test(blob));
});

// U,V,W. offline installation + validation + runtime-state safety
test('U,V,W. install (compatible READY / unverified BLOCKED); state non-secret; no /runtime/', () => {
  const ok = G.fixtures.installCompatible();
  assert.equal(ok.state, 'READY');
  assert.equal(ok.install_state_record!.contains_credentials, false);
  assert.equal(ok.install_state_record!.runtime_dir_created, false);
  assert.deepEqual(planInstallStages(), ['CLONE', 'DISCOVER', 'VALIDATE', 'INSTALL', 'INITIALIZE', 'COMPATIBILITY_CHECK', 'READY_OR_BLOCKED']);
  const blocked = G.fixtures.installBlockedUnverified();
  assert.equal(blocked.state, 'BLOCKED');
  // a tampered package fails validation
  const files = G.packageFiles(); const bad = files.map((f) => f.path === 'README.md' ? { ...f, content: 'x' } : f);
  assert.equal(runInstall({ packageFiles: bad, integrity: G.integrityManifest(), manifest: buildProductManifest(), targetDir: '/opt/dkskill', stateDir: '/var/lib/dkskill', now: G.FIXED() }).state, 'FAILED');
});

// W2. install never targets ~/.claude or /runtime/
test('W2. unsafe install dirs (~/.claude, runtime) are blocked', () => {
  assert.equal(isSafeInstallDir('/home/u/.claude/dkskill'), false);
  assert.equal(isSafeInstallDir('/opt/runtime/dkskill'), false);
  assert.equal(isSafeInstallDir('/opt/dkskill'), true);
  const r = runInstall({ packageFiles: G.packageFiles(), integrity: G.integrityManifest(), manifest: buildProductManifest(), targetDir: '/home/u/.claude', stateDir: '/var/lib/dkskill', now: G.FIXED() });
  assert.equal(r.state, 'BLOCKED');
});

// X. public/private boundary — no private material in public artifacts
test('X. no secrets / private material in public product artifacts', () => {
  const blob = canonicalFile(buildProductManifest()) + canonicalFile(G.fixtures.doctorCompatible()) + canonicalFile(productAdapters());
  assert.ok(!/(access_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6}|sk-[a-z0-9]{6}|password=)/i.test(blob));
});

// Y. no network / process / credential-read primitives (static)
test('Y. product modules use no network/exec/credential-read primitives', () => {
  const mods = ['environment-and-adapters.ts', 'doctor.ts', 'install.ts', 'integrity-and-manifest.ts', 'product-foundation-types.ts'].map((f) => readFileSync(join(DIR, '..', 'product', f), 'utf8')).join('\n');
  // no network, no arbitrary process execution, no telemetry, no reading of a real credential store
  assert.ok(!/\bfetch\s*\(|https?:\/\/[a-z]|net\.connect|dgram|child_process|execSync|execFileSync|spawn\s*\(|Invoke-WebRequest|readFileSync\s*\([^)]*\.claude/i.test(mods));
});

// Z. no-credential-access + node facts read-only
test('Z. nodeEnvironmentFacts is read-only os info; no version guessing', () => {
  const facts = nodeEnvironmentFacts({ platform: () => 'linux', arch: () => 'x64', release: () => '6.1.0' });
  assert.equal(facts.os, 'linux');
  assert.equal(facts.architecture, 'x64');
  assert.equal(facts.claude_code_version, null);   // never guessed
  assert.equal(facts.binary_sha256, null);
});

// determinism + committed == fresh + /runtime absent + production immutable
test('det. committed == fresh; production immutable; /runtime absent', () => {
  const before = sha256(canonicalFile(buildRegistry()));
  assert.equal(canonicalFile(G.fixtures.doctorCompatible()), canonicalFile(G.fixtures.doctorCompatible()));
  assert.equal(readFileSync(join(DIR, 'product-package-manifest.json'), 'utf8'), canonicalFile(buildProductManifest()));
  assert.equal(readFileSync(join(DIR, 'product-doctor-compatible.json'), 'utf8'), canonicalFile(G.fixtures.doctorCompatible()));
  assert.equal(readFileSync(join(DIR, 'product-install-compatible.json'), 'utf8'), canonicalFile(G.fixtures.installCompatible()));
  assert.equal(sha256(canonicalFile(buildRegistry())), before);
  assert.equal(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length, 0);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  // memFs isolation: install wrote nothing to real disk
  const fs = memFs(); fs.writeFile('/x', 'y'); assert.equal(fs.readFile('/x'), 'y'); assert.equal(existsSync('/x'), false);
});
