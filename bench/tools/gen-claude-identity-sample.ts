// M17 — deterministic Claude identity observation artifacts + SYNTHETIC_TEST_ONLY fixtures.
// No Claude execution, no credentials, no network, no ~/.claude, no /runtime/. Real host stays UNVERIFIED; identity
// only improves resolution, never manufactures compatibility.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { observeClaudeIdentity, resolveWithIdentity } from '../product/claude-identity-probe.ts';
import { syntheticUniversalRegistry } from '../tools/gen-universal-compatibility-sample.ts';
import type { ReadOnlyBinFs } from '../product/claude-identity-probe.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-30T00:00:00Z';
export const SYN = 'SYNTHETIC_TEST_ONLY';
const HASH = (c: string) => c.repeat(64);

// A synthetic in-memory read-only binary fs (never touches the real disk / real Claude).
export function fakeBinFs(files: Record<string, string>): ReadOnlyBinFs {
  return {
    isFile: (p) => p in files,
    realpath: (p) => p,
    readBytes: (p) => (p in files ? new TextEncoder().encode(files[p]) : null),
    size: (p) => (p in files ? files[p].length : null),
  };
}
// The synthetic certified windows profile's binary is sha256 of these bytes — compute it for a matching fixture.
export const SYN_BIN_PATH = '/opt/claude/claude-code';
export const SYN_BIN_BYTES = `${SYN} claude-code binary bytes`;
export const SYN_BIN_HASH = sha256(new TextEncoder().encode(SYN_BIN_BYTES));

const osFacts = (os: string, arch: string) => ({ os, os_version: '10.0.0', architecture: arch, runtime: 'node' });
const R = syntheticUniversalRegistry();

export const fixtures = {
  explicitComplete: () => observeClaudeIdentity({ explicit: { product: 'claude-code', version: '2.1.283', channel: 'native', binary_sha256: HASH('A') }, os_facts: osFacts('Windows 11', 'x64'), now: FIXED() }),
  explicitMissingVersion: () => observeClaudeIdentity({ explicit: { channel: 'native' }, os_facts: osFacts('Windows 11', 'x64'), now: FIXED() }),
  explicitMissingChannel: () => observeClaudeIdentity({ explicit: { version: '2.1.283' }, os_facts: osFacts('Windows 11', 'x64'), now: FIXED() }),
  binaryHashObserved: () => observeClaudeIdentity({ explicit: { version: '2.1.283', channel: 'native', binary_path: SYN_BIN_PATH }, os_facts: osFacts('Windows 11', 'x64'), fs: fakeBinFs({ [SYN_BIN_PATH]: SYN_BIN_BYTES }), now: FIXED() }),
  binaryMissing: () => observeClaudeIdentity({ explicit: { version: '2.1.283', channel: 'native', binary_path: '/opt/claude/does-not-exist' }, os_facts: osFacts('linux', 'x64'), fs: fakeBinFs({}), now: FIXED() }),
  claudeDirRejected: () => observeClaudeIdentity({ explicit: { binary_path: '/home/u/.claude/claude' }, os_facts: osFacts('linux', 'x64'), fs: fakeBinFs({ '/home/u/.claude/claude': 'x' }), now: FIXED() }),
  credentialPathRejected: () => observeClaudeIdentity({ explicit: { binary_path: '/home/u/.credentials.json' }, os_facts: osFacts('linux', 'x64'), fs: fakeBinFs({ '/home/u/.credentials.json': 'x' }), now: FIXED() }),
  contradictoryVersion: () => observeClaudeIdentity({ explicit: { version: '2.1.283', channel: 'native' }, local_metadata: { version: '2.1.284' }, os_facts: osFacts('Windows 11', 'x64'), now: FIXED() }),
  contradictoryHash: () => observeClaudeIdentity({ explicit: { version: '2.1.283', channel: 'native', binary_path: SYN_BIN_PATH, binary_sha256: HASH('9') }, os_facts: osFacts('Windows 11', 'x64'), fs: fakeBinFs({ [SYN_BIN_PATH]: SYN_BIN_BYTES }), now: FIXED() }),
  allUnknown: () => observeClaudeIdentity({ os_facts: osFacts('linux', 'x64'), now: FIXED() }),
  // exact identity matching a synthetic certified windows profile => resolver COMPATIBLE (identity improves resolution)
  exactCompatible: () => observeClaudeIdentity({ explicit: { product: 'claude-code', version: '2.1.283', channel: 'native', binary_sha256: HASH('A') }, os_facts: osFacts('Windows 11', 'x64'), now: FIXED() }),
};

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'claude-identity-explicit-complete.json'), canonicalFile(fixtures.explicitComplete()));
  writeFileSync(join(OUT, 'claude-identity-binary-observed.json'), canonicalFile(fixtures.binaryHashObserved()));
  writeFileSync(join(OUT, 'claude-identity-contradicted.json'), canonicalFile(fixtures.contradictoryVersion()));
  writeFileSync(join(OUT, 'claude-identity-all-unknown.json'), canonicalFile(fixtures.allUnknown()));
  const exact = fixtures.exactCompatible();
  const outcome = resolveWithIdentity(exact, R, true).outcome;
  const contradicted = resolveWithIdentity(fixtures.contradictoryVersion(), R, true).outcome;
  console.log(`M17: explicitComplete=${fixtures.explicitComplete().identity_status}; binaryObserved=${fixtures.binaryHashObserved().binary_hash_state}; contradictedVer=${fixtures.contradictoryVersion().identity_status}; allUnknown=${fixtures.allUnknown().identity_status}; claudeDir=${fixtures.claudeDirRejected().binary_path_state}; exact->resolver=${outcome}; contradicted->resolver=${contradicted}`);
}

if (process.argv[1]?.endsWith('gen-claude-identity-sample.ts')) main();
