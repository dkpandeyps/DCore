// Writes the read-only FIXTURE-CONTENT AUTHORING RECORD artifact under bench/approval/.
// Governance/documentation only: it records the owner-approved fixture content (byte-exact) with provenance.
// It materializes NOTHING — no ws/ files, no R/ files, no tarball, no server. Deterministic (canonical JSON).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { FIXTURE_AUTHORING_RECORD, FIXTURE_CONTENT_DECISION, authoringSummary } from '../src/fixtures-authoring.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'approval');

export function fixtureAuthoringArtifact(): string {
  const banner =
    'FIXTURE-CONTENT AUTHORING RECORD — OWNER_APPROVED (2026-09-28), NOT MATERIALIZED. ' +
    'Byte-exact record of approved fixture content; approval and materialization are separate phases. ' +
    'EVID-CLAIM-001 frozen files are REQUEST_REAUTHORING. No bytes written to ws/ or R/; no builder changed.';
  return canonicalFile({ banner, decision: FIXTURE_CONTENT_DECISION, summary: authoringSummary(), entries: FIXTURE_AUTHORING_RECORD });
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'FIXTURE-CONTENT-AUTHORING.json'), fixtureAuthoringArtifact());
  const s = authoringSummary();
  console.log(`fixture-content authoring record: ${s.approved} OWNER_APPROVED, ${s.request_reauthoring} REQUEST_REAUTHORING`);
  console.log(`EVID-CLAIM-001 grounded: ${s.evid_claim_001_grounded}; materialized bytes: ${s.materialized_bytes}`);
}

main();
