// M23 — deterministic owner decision dossier artifact (DESIGN ONLY / NO DECISIONS). No execution, no signing, no
// key generation, no certification, no network, no registry mutation.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { buildOwnerDecisionDossier, validateDossier, recomputeReadiness, currentInputs, fullySatisfiedInputs, evaluateFirstCertificationTree } from '../compatibility/owner-decision-dossier.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const d = buildOwnerDecisionDossier();
  writeFileSync(join(OUT, 'owner-decision-dossier.json'), canonicalFile(d));
  const v = validateDossier(d);
  console.log(`M23: decisions=${d.master_decision_register.length}; gaps=${d.gap_register.length}; scenarios=${d.scenario_table.length}; fixtures=${d.decision_fixtures.length}; decisions_made=${d.decisions_made}; current_overall=${d.current_readiness.overall}; full_overall=${recomputeReadiness(fullySatisfiedInputs()).overall}; tree(current)=${evaluateFirstCertificationTree(currentInputs()).result}; consistent=${v.ok}${v.ok ? '' : ' issues=' + v.issues.join('|')}`);
}

if (process.argv[1]?.endsWith('gen-owner-decision-dossier-sample.ts')) main();
