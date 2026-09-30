// M18 — deterministic version/metadata assessment artifact. Documentation/assessment only; modifies no product code,
// executes no Claude, reads no ~/.claude, contacts no network.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { buildAssessment } from '../product/version-metadata-assessment.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const a = buildAssessment();
  writeFileSync(join(OUT, 'version-metadata-assessment.json'), canonicalFile(a));
  console.log(`M18: decision=${a.implementation_decision}; version=${a.version_source_status}; channel=${a.channel_source_status}; candidates=${a.candidates.length}; rejected=${a.evaluations.filter((e) => e.overall_acceptance === 'REJECTED').length}`);
}

if (process.argv[1]?.endsWith('gen-version-metadata-assessment-sample.ts')) main();
