// M24 — deterministic design compendium artifact (REPORT/DESIGN ONLY). Writes data/design-compendium.json (root
// data/ dir, outside frozen artifacts). No execution, no certification, no signing, no network, no registry mutation.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { buildCompendium, validateCompendium, runInvariantChecks, allInvariantsHold } from '../compatibility/design-compendium.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');   // repo root (parent of bench)
const DATA = join(ROOT, 'data');

function main(): void {
  mkdirSync(DATA, { recursive: true });
  const c = buildCompendium();
  writeFileSync(join(DATA, 'design-compendium.json'), canonicalFile(c));
  const v = validateCompendium(c);
  const checks = runInvariantChecks();
  console.log(`M24: rows=${c.traceability_matrix.length}; invariants=${c.invariant_ledger.length}; reading_steps=${c.reading_map.length}; deps=${c.dependency_graph.length}; security=${c.security_traceability.length}; consistent=${v.ok}${v.ok ? '' : ' issues=' + v.issues.join('|')}; invariants_hold=${allInvariantsHold()}`);
  const failed = checks.filter((x) => !x.ok);
  if (failed.length) console.log('FAILED INVARIANTS:', failed.map((f) => `${f.invariant_id}(actual=${f.actual.slice(0, 24)} expected=${f.expected.slice(0, 24)})`).join(' | '));
}

if (process.argv[1]?.endsWith('gen-design-compendium-sample.ts')) main();
