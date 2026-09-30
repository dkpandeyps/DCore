// M14 — deterministic product-core specification artifacts + manifest fixtures.
// Specification only: no runtime, no Claude, no network, no credential access, no /runtime/ creation.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { buildProductSpec } from '../compatibility/product-core-spec.ts';
import type { Manifest } from '../compatibility/product-core-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-29T00:00:00Z';

export function validManifest(): Manifest { return buildProductSpec().manifest_template; }
export function malformedManifest(): Manifest { return { ...validManifest(), schema: 'wrong/1' as any, product: '' }; }
export function windowsAssumptionManifest(): Manifest { return { ...validManifest(), no_windows_assumption: false as any }; }
export function singleVersionIdentityManifest(): Manifest { return { ...validManifest(), no_single_version_identity: false as any }; }

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'product-core-spec.json'), canonicalFile(buildProductSpec()));
  writeFileSync(join(OUT, 'product-manifest-template.json'), canonicalFile(validManifest()));
  const s = buildProductSpec();
  console.log(`M14 spec: taxonomy=${s.taxonomy.choice} skills=${s.taxonomy.initial_release_skill_count}(${s.taxonomy.initial_release_skill_count_state}) future=${s.taxonomy.future_skills_state}; lifecycle=${s.runtime_lifecycle.length}; api=${s.compatibility_api.length}; caps=${s.capabilities.length}; ops=${s.operations.length}; perms=${s.permissions.length}; security=${s.security_requirements.length}; decisions=${s.decision_boundary.length}`);
}

if (process.argv[1]?.endsWith('gen-product-core-sample.ts')) main();
