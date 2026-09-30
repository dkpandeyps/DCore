// M3 — writes a DETERMINISTIC sample HCL result for the pinned 2.1.283 identity, as a hashable artifact.
// It executes no Claude and certifies nothing; the sample demonstrates a fail-closed REFUSED decision for the
// current PROBED / NOT_CERTIFIED profile. main() is guarded so importing this module has no side effects.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { staticIdentityProbe, evaluateHost } from '../compatibility/hcl.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');

export function sampleResult() {
  // A static (non-executing) probe of the pinned benchmark identity, including the pinned binary hash.
  const probe = staticIdentityProbe({
    product: 'claude-code', version: '2.1.283', platform: 'win32', architecture: 'x64', channel: 'native',
    binary_sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A',
    executable_source: 'operator-supplied (pinned)',
  }, { product: 'registry-declared', version: 'operator-declared', platform: 'os', architecture: 'os', channel: 'operator-declared', binary_sha256: 'operator-hash' });
  // Self-checks are NOT run in M3 (contract only).
  return evaluateHost({ probe, selfChecks: [{ id: 'T2-HEARTBEAT', description: 'PreToolUse nonce heartbeat', critical: true, result: 'NOT_RUN' }] });
}

export function sampleJson(): string {
  return canonicalFile(sampleResult());
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'hcl-sample-result.json'), sampleJson());
  const r = sampleResult();
  console.log(`M3 HCL sample: profile=${r.profile_id} resolution=${r.profile_resolution} decision=${r.enforcement_decision}`);
}

if (process.argv[1]?.endsWith('gen-hcl-sample.ts')) main();
