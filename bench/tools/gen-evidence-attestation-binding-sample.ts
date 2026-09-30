// M20 — deterministic binding-specification artifact (DESIGN ONLY). No execution, no certification, no signing, no
// network, no registry mutation.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { buildBindingSpec, validateSpecConsistency } from '../compatibility/evidence-attestation-binding-spec.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const spec = buildBindingSpec();
  writeFileSync(join(OUT, 'evidence-attestation-binding-spec.json'), canonicalFile(spec));
  const v = validateSpecConsistency(spec);
  console.log(`M20: fields=${spec.field_map.length}; failure_rows=${spec.m4_failure_matrix.length}; threats=${spec.security_review.length}; fixtures=${spec.fixture_specs.length}; gaps=${spec.open_design_gaps.length}; consistent=${v.ok}${v.ok ? '' : ' issues=' + v.issues.join('|')}`);
}

if (process.argv[1]?.endsWith('gen-evidence-attestation-binding-sample.ts')) main();
