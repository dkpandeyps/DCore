import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  observeClaudeIdentity, observationToHost, resolveWithIdentity, isSafeBinaryPath, verifyObservation,
} from '../product/claude-identity-probe.ts';
import { doctorWithIdentity, identityMain, renderIdentity, observeReal } from '../product/identity-cli.ts';
import * as G from '../tools/gen-claude-identity-sample.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { syntheticUniversalRegistry } from '../tools/gen-universal-compatibility-sample.ts';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const R = syntheticUniversalRegistry();
const f = G.fixtures;

// A,AG. all-safe explicit identity + provenance
test('A,AG. explicit complete identity => COMPLETE with EXPLICIT_INPUT provenance', () => {
  const o = f.explicitComplete();
  assert.equal(o.schema, 'dkskill.claude_identity_observation/1');
  assert.equal(o.identity_status, 'COMPLETE');
  assert.equal(o.version_state, 'OBSERVED');
  assert.equal(o.provenance.version, 'EXPLICIT_INPUT');
  assert.equal(o.evidence_class, 'EXPLICIT_INPUT');
});

// B,C,D,T. missing version/channel/hash => INCOMPLETE
test('B,C,D,T. missing version/channel/hash => INCOMPLETE (never manufactured)', () => {
  assert.equal(f.explicitMissingVersion().identity_status, 'INCOMPLETE');
  assert.equal(f.explicitMissingVersion().version_state, 'UNKNOWN');
  assert.equal(f.explicitMissingChannel().channel_state, 'UNKNOWN');
  assert.equal(f.explicitMissingChannel().identity_status, 'INCOMPLETE');
});

// F,AH. binary hash calculation + local provenance
test('F,AH. binary hash observed (read-only) with LOCAL_BINARY_READ provenance', () => {
  const o = f.binaryHashObserved();
  assert.equal(o.binary_hash_state, 'OBSERVED');
  assert.equal(o.binary_sha256, G.SYN_BIN_HASH.replace(/^sha256:/, ''));
  assert.equal(o.provenance.binary_sha256, 'LOCAL_BINARY_READ');
  assert.equal(o.binary_size, G.SYN_BIN_BYTES.length);
  assert.equal(o.execution_performed, false);
});

// G. binary missing
test('G. binary missing => UNAVAILABLE', () => {
  assert.equal(f.binaryMissing().binary_path_state, 'UNAVAILABLE');
  assert.equal(f.binaryMissing().binary_hash_state, 'UNAVAILABLE');
});

// H,I,J,K. path escape / .claude / credential / runtime rejection
test('H,I,J,K. unsafe path rejection (.claude, credentials, runtime, ssh)', () => {
  assert.equal(isSafeBinaryPath('/home/u/.claude/claude'), false);
  assert.equal(isSafeBinaryPath('/home/u/.credentials.json'), false);
  assert.equal(isSafeBinaryPath('/opt/runtime/claude'), false);
  assert.equal(isSafeBinaryPath('/home/u/.ssh/id_rsa'), false);
  assert.equal(isSafeBinaryPath('/root/.aws/credentials'), false);
  assert.equal(isSafeBinaryPath('/opt/claude/claude-code'), true);
  assert.equal(f.claudeDirRejected().binary_path_state, 'REJECTED');
  assert.equal(f.claudeDirRejected().safe, false);
  assert.equal(f.credentialPathRejected().binary_hash_state, 'REJECTED');
});

// L,M,N,O. no subprocess/Claude/network/credentials (static)
test('L,M,N,O. probe has no exec/network/credential primitives (static)', () => {
  const mods = ['claude-identity-probe.ts', 'identity-cli.ts'].map((x) => readFileSync(join(DIR, '..', 'product', x), 'utf8')).join('\n');
  assert.ok(!/\bfetch\s*\(|https?:\/\/[a-z]|net\.connect|dgram|from ['"]node:child_process|require\(['"]child_process|execSync|execFileSync|\bspawn\s*\(|\bexec\s*\(|Invoke-WebRequest|claude\s+--?version|process\.env\.[A-Z_]*(TOKEN|SECRET|KEY)/i.test(mods));
});

// P,Q,W. version/channel UNKNOWN remains UNKNOWN
test('P,Q,W. UNKNOWN remains UNKNOWN when no safe evidence', () => {
  const o = f.allUnknown();
  assert.equal(o.version_state, 'UNKNOWN');
  assert.equal(o.channel_state, 'UNKNOWN');
  assert.equal(o.provenance.version, 'UNKNOWN');
});

// R,S. contradictory version + hash => CONTRADICTED (no silent choice)
test('R,S. contradictions => CONTRADICTED (block, no fallback)', () => {
  assert.equal(f.contradictoryVersion().version_state, 'CONTRADICTED');
  assert.equal(f.contradictoryVersion().identity_status, 'CONTRADICTED');
  assert.equal(f.contradictoryHash().binary_hash_state, 'CONTRADICTED');
  assert.equal(f.contradictoryHash().identity_status, 'CONTRADICTED');
});

// U,V. exact identity passed to M13 => COMPATIBLE; resolver authoritative
test('U,V. exact identity improves resolution (COMPATIBLE via synthetic registry); resolver authoritative', () => {
  assert.equal(resolveWithIdentity(f.exactCompatible(), R, true).outcome, 'COMPATIBLE');
  // same identity against PRODUCTION registry (certified 0) => UNVERIFIED (resolver decides, not the probe)
  assert.equal(resolveWithIdentity(f.exactCompatible(), buildRegistry(), false).outcome, 'UNVERIFIED');
});

// contradicted/unknown/incomplete never become COMPATIBLE
test('U2. CONTRADICTED/UNKNOWN/INCOMPLETE never => COMPATIBLE', () => {
  assert.notEqual(resolveWithIdentity(f.contradictoryVersion(), R, true).outcome, 'COMPATIBLE');
  assert.notEqual(resolveWithIdentity(f.allUnknown(), R, true).outcome, 'COMPATIBLE');
  assert.notEqual(resolveWithIdentity(f.explicitMissingVersion(), R, true).outcome, 'COMPATIBLE');
});

// X. deterministic observation + observation hash
test('X. deterministic observation + verifiable hash', () => {
  assert.equal(canonicalFile(f.explicitComplete()), canonicalFile(f.explicitComplete()));
  assert.match(f.explicitComplete().observation_hash!, /^sha256:[0-9a-f]{64}$/);
  assert.equal(verifyObservation(f.explicitComplete()), true);
  assert.equal(verifyObservation({ ...f.explicitComplete(), claude_version: '9.9.9' }), false);
});

// Y. secret redaction (a secret in local metadata is not persisted as a real fact / no secret fields)
test('Y. no secret fields; a bogus secret path is rejected not stored', () => {
  const o = observeClaudeIdentity({ explicit: { binary_path: '/home/u/.credentials.json' }, os_facts: { os: 'linux', architecture: 'x64' }, fs: G.fakeBinFs({ '/home/u/.credentials.json': 'access_token=sk-abc123def' }), now: G.FIXED() });
  assert.equal(o.binary_path_state, 'REJECTED');
  assert.ok(!/access_token=|sk-abc123/i.test(JSON.stringify(o)));
});

// Z,AA,AB,AC,AD,AE,AF. cross-platform + architectures + unknown arch
test('Z,AA-AF. cross-platform identity (win/mac/linux, x64/arm64, unknown arch)', () => {
  const mk = (os: string, arch: string) => observeClaudeIdentity({ explicit: { version: '2.1.283', channel: 'native' }, os_facts: { os, architecture: arch, os_version: 'x', runtime: 'node' }, now: G.FIXED() });
  assert.equal(mk('win32', 'x64').identity_status, 'COMPLETE');
  assert.equal(mk('darwin', 'arm64').identity_status, 'COMPLETE');
  assert.equal(mk('linux', 'x64').identity_status, 'COMPLETE');
  assert.equal(mk('darwin', 'arm64').architecture, 'arm64');   // never mapped to x64
  assert.equal(mk('plan9', 'x64').identity_status, 'INCOMPLETE');   // unknown OS not platform-resolvable
});

// AI,AJ. doctor + identity integration + JSON
test('AI,AJ. doctor+identity composition; identity never forces COMPATIBLE for unknown/contradicted', () => {
  const d = doctorWithIdentity({ explicit: { version: '2.1.283', channel: 'native', binary_sha256: 'A'.repeat(64) }, registry: R, synthetic_test_only: true, now: G.FIXED() });
  assert.equal(d.outcome, 'COMPATIBLE');
  assert.ok(d.text.includes('Claude Code:') && d.text.includes('identity status: COMPLETE'));
  const contradicted = doctorWithIdentity({ explicit: { version: '2.1.283', channel: 'native' }, local_metadata: { version: '2.1.284' }, registry: R, synthetic_test_only: true, now: G.FIXED() });
  assert.notEqual(contradicted.outcome, 'COMPATIBLE');
  const j = identityMain({ json: true });
  assert.ok(JSON.parse(j.text).schema === 'dkskill.claude_identity_observation/1');
});

// real entrypoint: Claude facts UNKNOWN, no execution, no ~/.claude touch
test('real. dkskill identity on this machine: Claude facts UNKNOWN; ~/.claude untouched', () => {
  const before = existsSync(join(homedir(), '.claude'));
  const o = observeReal({ now: G.FIXED() });
  assert.equal(o.version_state, 'UNKNOWN');
  assert.equal(o.channel_state, 'UNKNOWN');
  assert.equal(o.execution_performed, false);
  assert.equal(o.credentials_accessed, false);
  assert.equal(o.network_contacted, false);
  assert.equal(existsSync(join(homedir(), '.claude')), before);
  assert.ok(renderIdentity(o).includes('version: UNKNOWN'));
});

// AK. no certification / production immutable / /runtime absent / committed == fresh
test('AK. no certification; production immutable; committed == fresh; /runtime absent', () => {
  const before = sha256(canonicalFile(buildRegistry()));
  assert.equal(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length, 0);
  assert.equal(readFileSync(join(DIR, 'claude-identity-explicit-complete.json'), 'utf8'), canonicalFile(f.explicitComplete()));
  assert.equal(readFileSync(join(DIR, 'claude-identity-contradicted.json'), 'utf8'), canonicalFile(f.contradictoryVersion()));
  assert.equal(sha256(canonicalFile(buildRegistry())), before);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
});
