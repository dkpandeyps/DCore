import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  buildProductManifest, buildIntegrityManifest, verifyIntegrity, validateProductManifest, detectEnvironment,
  productAdapters, nodeFs, runInstallReal, confinePath, buildPublicDoctorReport, doctorMain, realHost, renderDoctor,
} from '../product/index.ts';
import { runDoctor } from '../product/doctor.ts';
import * as PKG from '../tools/gen-public-package-sample.ts';
import { packageFiles } from '../tools/gen-product-foundation-sample.ts';
import { syntheticUniversalRegistry } from '../tools/gen-universal-compatibility-sample.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { tempDir, TEST_DIR } from './helpers.ts';
import { canonicalFile, sha256 } from '../src/canonical.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const HASH = (c: string) => c.repeat(64);

// 1,2,3. package discovery + manifest + integrity validation
test('1,2,3. clean package: discovery + manifest + integrity valid', () => {
  const files = packageFiles();
  assert.ok(files.some((f) => f.path.endsWith('manifest.json')));
  assert.equal(validateProductManifest(buildProductManifest()).ok, true);
  assert.equal(verifyIntegrity(buildIntegrityManifest(files), files).status, 'INTEGRITY_VERIFIED');
});

// 4. real filesystem adapter safety (path confinement + runtime/.claude refusal)
test('4. real fs adapter confines paths; refuses escape / runtime / .claude', () => {
  const t = tempDir('m16-fs');
  try {
    const fs = nodeFs(t.dir);
    fs.writeFile(join(t.dir, 'a', 'b.txt'), 'hi');
    assert.equal(fs.readFile(join(t.dir, 'a', 'b.txt')), 'hi');
    assert.throws(() => fs.writeFile(join(t.dir, '..', 'escape.txt'), 'x'));
    assert.throws(() => confinePath(t.dir, join(t.dir, 'runtime', 'x')));
    assert.throws(() => confinePath(t.dir, join(t.dir, '.claude', 'x')));
  } finally { t.cleanup(); }
});

// 16 + 5. clean installation into an isolated temp dir; doctor invocation
test('5,16. clean install into isolated temp dir (real fs); compatible => READY', () => {
  const t = tempDir('m16-install');
  try {
    const r = runInstallReal({ packageFiles: packageFiles(), integrity: buildIntegrityManifest(packageFiles()), manifest: buildProductManifest(), root: t.dir, targetDir: join(t.dir, 'opt', 'dkskill'), stateDir: join(t.dir, 'state', 'dkskill'), host: { product: 'claude-code', version: '2.1.283', os: 'Windows 11', os_version: '10.0.26200', architecture: 'x64', channel: 'native', binary_sha256: HASH('A'), runtime_facet: 'node' }, registry: syntheticUniversalRegistry(), now: PKG.FIXED() });
    assert.equal(r.state, 'READY');
    assert.equal(r.install_state_record!.runtime_dir_created, false);
    assert.equal(r.install_state_record!.contains_credentials, false);
    assert.ok(existsSync(join(t.dir, 'opt', 'dkskill', 'manifest.json')));   // real files written under temp only
    assert.ok(!existsSync(join(t.dir, 'runtime')));
  } finally { t.cleanup(); }
});

// unverified stays blocked (never converted to READY)
test('5b. UNVERIFIED host installs but stays BLOCKED (never READY)', () => {
  const t = tempDir('m16-blocked');
  try {
    const r = runInstallReal({ packageFiles: packageFiles(), integrity: buildIntegrityManifest(packageFiles()), manifest: buildProductManifest(), root: t.dir, targetDir: join(t.dir, 'opt', 'dkskill'), stateDir: join(t.dir, 'state'), host: PKG.productionHost(), registry: buildRegistry(), now: PKG.FIXED() });
    assert.equal(r.state, 'BLOCKED');
    assert.equal(r.compatibility_status, 'UNVERIFIED');
  } finally { t.cleanup(); }
});

// install refuses ~/.claude and runtime targets
test('5c. install refuses ~/.claude and runtime targets (fail closed)', () => {
  const t = tempDir('m16-unsafe');
  try {
    assert.equal(runInstallReal({ packageFiles: packageFiles(), integrity: buildIntegrityManifest(packageFiles()), manifest: buildProductManifest(), root: t.dir, targetDir: join(t.dir, '.claude'), stateDir: join(t.dir, 'state'), now: PKG.FIXED() }).state, 'BLOCKED');
    assert.equal(runInstallReal({ packageFiles: packageFiles(), integrity: buildIntegrityManifest(packageFiles()), manifest: buildProductManifest(), root: t.dir, targetDir: join(t.dir, 'runtime'), stateDir: join(t.dir, 'state'), now: PKG.FIXED() }).state, 'BLOCKED');
  } finally { t.cleanup(); }
});

// 6,7. doctor output schema + unknown Claude metadata behavior
test('6,7. public doctor schema + Claude metadata UNKNOWN when unprobed', () => {
  const rep = PKG.fixtures.publicDoctorUnknownClaude();
  assert.equal(rep.schema, 'dkskill.public_doctor_report/1');
  for (const k of ['product_id', 'skill_id', 'product_version', 'operating_system', 'architecture', 'compatibility_outcome', 'safe_next_action'] as const) assert.ok((rep as any)[k], k);
  assert.equal(rep.claude_code_version, 'UNKNOWN');
  assert.equal(rep.claude_code_channel, 'UNKNOWN');
  assert.equal(rep.claude_code_binary_hash, 'UNKNOWN');
});

// 8. fail-closed compatibility (production host UNVERIFIED)
test('8. fail-closed compatibility: production host UNVERIFIED', () => {
  assert.equal(PKG.fixtures.publicDoctorProd().compatibility_outcome, 'UNVERIFIED');
});

// 9,10,11. no credential / network / subprocess (declared + static)
test('9,10,11. doctor declares + proves no credentials/network/subprocess', () => {
  const rep = PKG.fixtures.publicDoctorProd();
  assert.equal(rep.credentials_accessed, false);
  assert.equal(rep.network_contacted, false);
  assert.equal(rep.subprocesses_spawned, false);
  const mods = ['fs-node.ts', 'public-doctor.ts', 'dkskill-doctor.ts', 'index.ts'].map((f) => readFileSync(join(DIR, '..', 'product', f), 'utf8')).join('\n');
  // real dangerous primitives only (not safety-comment prose)
  assert.ok(!/\bfetch\s*\(|https?:\/\/[a-z]|net\.connect|dgram|require\(['"]child_process|from ['"]node:child_process|execSync|execFileSync|\bspawn\s*\(|Invoke-WebRequest|readFileSync\s*\([^)]*\.claude/i.test(mods));
});

// 12,13. no unsafe runtime creation; no ~/.claude access
test('12,13. no /runtime/ created; real ~/.claude untouched', () => {
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  // the doctor entrypoint reads only os.* — running it does not create runtime or touch ~/.claude
  const before = existsSync(join(homedir(), '.claude'));
  doctorMain();
  assert.equal(existsSync(join(homedir(), '.claude')), before);   // presence unchanged either way
});

// real entrypoint: Claude facts UNKNOWN, honest fail-closed
test('14. real dkskill doctor entrypoint: Claude facts UNKNOWN, fail-closed, deterministic shape', () => {
  const { text, report } = doctorMain();
  assert.equal(report.claude_code_version, 'UNKNOWN');
  assert.equal(report.credentials_accessed, false);
  assert.ok(text.includes('dkskill doctor') && text.includes('Claude Code: UNKNOWN'));
  assert.equal(realHost().version, null);   // never guessed
  assert.ok(['UNVERIFIED', 'UNSUPPORTED', 'PROFILE_NOT_FOUND'].includes(report.compatibility_outcome));   // never COMPATIBLE without evidence
});

// 15. public/private boundary in package descriptor
test('15. package descriptor: no false claims; private infra separated; certified 0', () => {
  const d = PKG.fixtures.descriptor();
  assert.equal(d.certified_facets, 0);
  assert.equal(d.works_everywhere_claim, false);
  assert.equal(d.universally_certified_claim, false);
  assert.equal(d.signature_status, 'SIGNATURE_NOT_AVAILABLE');
  assert.equal(d.requires_network_for_local_use, false);
  assert.equal(d.requires_credentials, false);
  assert.ok(d.private_infrastructure.some((p) => /certification/i.test(p)));
  assert.ok(!d.public_layout.some((p) => /certification/i.test(p)));
});

// adapters cross-platform (no ARM->x64, no unknown OS mapping)
test('17. cross-platform adapters; unknown arch/OS preserved', () => {
  assert.equal(productAdapters().length, 3);
  assert.equal(detectEnvironment({ os: 'darwin', architecture: 'arm64' }).host.architecture, 'arm64');   // never mapped to x64
  assert.equal(detectEnvironment({ os: 'plan9' }).supported_platform, false);                            // unknown OS not mapped
});

// determinism + committed == fresh + production immutable
test('18. committed == fresh; production immutable; deterministic', () => {
  const before = sha256(canonicalFile(buildRegistry()));
  assert.equal(readFileSync(join(DIR, 'dkskill-package.json'), 'utf8'), canonicalFile(PKG.fixtures.descriptor()));
  assert.equal(readFileSync(join(DIR, 'public-doctor-report-production.json'), 'utf8'), canonicalFile(PKG.fixtures.publicDoctorProd()));
  assert.equal(sha256(canonicalFile(buildRegistry())), before);
  assert.equal(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length, 0);
});
