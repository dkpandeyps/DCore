// M21 — deterministic signing/publication-binding specification artifact (DESIGN ONLY). No signing, no key
// generation, no execution, no network, no registry mutation.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { buildSigningBindingSpec, validateSigningSpec } from '../compatibility/signing-publication-binding-spec.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const spec = buildSigningBindingSpec();
  writeFileSync(join(OUT, 'signing-publication-binding-spec.json'), canonicalFile(spec));
  const v = validateSigningSpec(spec);
  console.log(`M21: objects=${spec.object_graph.length}; layers=${spec.verification_layers.length}; key_states=${spec.key_lifecycle.length}; threats=${spec.security_threat_model.length}; fixtures=${spec.fixture_specs.length}; gap03=${spec.gap03_status}; gap04=${spec.gap04_status}; consistent=${v.ok}${v.ok ? '' : ' issues=' + v.issues.join('|')}`);
}

if (process.argv[1]?.endsWith('gen-signing-publication-binding-sample.ts')) main();
