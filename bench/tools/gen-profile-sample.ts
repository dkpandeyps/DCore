// M5 — deterministic sample publication artifacts (hashable). Writes:
//  - profile-sample-2.1.283.json : real host => NOT_CERTIFIED => publication BLOCKED (DRAFT).
//  - profile-sample-synthetic.json: SYNTHETIC_TEST_ONLY => M4 CERTIFIED but publication REJECTED (PG-13).
// Executes no Claude, certifies no real host, mutates no registry. main() guarded; fixed clock.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { real283Input, syntheticInput } from './gen-certification-sample.ts';
import { runCertification } from '../compatibility/certification.ts';
import { buildM5Artifact } from '../compatibility/profile.ts';
import type { M5Artifact } from '../compatibility/profile-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
const FIXED = () => '2026-09-29T00:00:00Z';

export function real283Artifact(): M5Artifact {
  const input = real283Input();
  const cert = runCertification(input);
  // A real host: unsigned, no publication authorization.
  return buildM5Artifact(cert, input.evidence, { clock: FIXED, issuer: null, signature_status: 'SIGNATURE_MISSING', publication_authorized: false });
}

export function syntheticArtifact(): M5Artifact {
  const input = syntheticInput();
  const cert = runCertification(input);
  // A synthetic signer is clearly labeled and can never yield production publication (PG-13 rejects it).
  return buildM5Artifact(cert, input.evidence, { clock: FIXED, issuer: { authority: 'SYNTHETIC_TEST_ONLY', synthetic: true }, signature_status: 'SIGNED', publication_authorized: true });
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'profile-sample-2.1.283.json'), canonicalFile(real283Artifact()));
  writeFileSync(join(OUT, 'profile-sample-synthetic.json'), canonicalFile(syntheticArtifact()));
  const r = real283Artifact(), s = syntheticArtifact();
  console.log(`M5 samples: 2.1.283 lifecycle=${r.profile.lifecycle_state} publication=${r.publication.state}; synthetic lifecycle=${s.profile.lifecycle_state} publication=${s.publication.state} (synthetic_test_only=${s.synthetic_test_only})`);
}

if (process.argv[1]?.endsWith('gen-profile-sample.ts')) main();
