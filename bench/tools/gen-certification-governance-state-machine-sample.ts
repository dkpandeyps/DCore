// M22 — deterministic end-to-end certification-governance state-machine specification artifact (DESIGN ONLY).
// No execution, no certification, no signing, no key generation, no network, no registry mutation.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { buildGovernanceSpec, validateGovernanceSpec } from '../compatibility/certification-governance-state-machine-spec.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const spec = buildGovernanceSpec();
  writeFileSync(join(OUT, 'certification-governance-state-machine-spec.json'), canonicalFile(spec));
  const v = validateGovernanceSpec(spec);
  console.log(`M22: states=${spec.state_machine.length}; preconditions=${spec.precondition_table.length}; gaps=${spec.gap_assessments.length}; owner_decisions=${spec.owner_decision_register.length}; recovery=${spec.failure_recovery_matrix.length}; threats=${spec.security_review.length}; overall=${spec.overall_readiness}; activation_all_met=${spec.activation_all_met}; consistent=${v.ok}${v.ok ? '' : ' issues=' + v.issues.join('|')}`);
}

if (process.argv[1]?.endsWith('gen-certification-governance-state-machine-sample.ts')) main();
