// M16 — deterministic public package descriptor + public doctor report sample. No Claude, no network, no fs writes
// outside the compatibility output dir, no /runtime/. Production host reports UNVERIFIED (certified count stays 0).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { buildProductManifest, buildIntegrityManifest } from '../product/integrity-and-manifest.ts';
import { buildPublicDoctorReport } from '../product/public-doctor.ts';
import { buildProductSpec } from '../compatibility/product-core-spec.ts';
import { packageFiles } from '../tools/gen-product-foundation-sample.ts';
import type { UniversalHost } from '../compatibility/universal-compatibility-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-30T00:00:00Z';

// The real pinned host identity (lowercased binary), resolved against the PRODUCTION registry => UNVERIFIED.
export const productionHost = (): UniversalHost => ({ product: 'claude-code', version: '2.1.283', os: 'win32', os_version: null, architecture: 'x64', channel: 'native', binary_sha256: '9dbe16dafed59da5cdabbfe11ad0335738c753fad794989b47f9446accd6de3a', runtime_facet: 'node' });
// A host with Claude facts unknown (the honest default of the real entrypoint).
export const unknownClaudeHost = (): UniversalHost => ({ product: 'claude-code', version: null, os: 'linux', os_version: '6.1.0', architecture: 'x64', channel: null, binary_sha256: null, runtime_facet: 'node' });

export function packageDescriptor() {
  const spec = buildProductSpec();
  const manifest = buildProductManifest();
  const integrity = buildIntegrityManifest(packageFiles());
  return {
    schema: 'dkskill.package/1', version: 1, product_id: spec.identity.product_id, skill_id: manifest.skill_id,
    product: manifest.product, product_version: manifest.product_version, schema_version: manifest.schema_version,
    license: spec.identity.license, scope: spec.identity.scope,
    entrypoints: { doctor: 'src/product/dkskill-doctor.ts (dkskill doctor)', api: 'src/product/index.ts' },
    protected_files: integrity.entries.map((e) => e.path), integrity_algorithm: integrity.algorithm,
    signature_status: integrity.signature_status, certified: false, certified_facets: 0,
    public_layout: spec.repository_layout.filter((r) => r.visibility === 'PUBLIC').map((r) => r.path),
    private_infrastructure: spec.repository_layout.filter((r) => r.visibility === 'PRIVATE').map((r) => r.path),
    requires_network_for_local_use: false, requires_credentials: false, requires_certification_infrastructure: false,
    works_everywhere_claim: false, universally_certified_claim: false,
  };
}

export const fixtures = {
  descriptor: () => packageDescriptor(),
  publicDoctorProd: () => buildPublicDoctorReport({ host: productionHost(), synthetic_test_only: false }),
  publicDoctorUnknownClaude: () => buildPublicDoctorReport({ host: unknownClaudeHost(), synthetic_test_only: false }),
};

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'dkskill-package.json'), canonicalFile(fixtures.descriptor()));
  writeFileSync(join(OUT, 'public-doctor-report-production.json'), canonicalFile(fixtures.publicDoctorProd()));
  writeFileSync(join(OUT, 'public-doctor-report-unknown-claude.json'), canonicalFile(fixtures.publicDoctorUnknownClaude()));
  const p = fixtures.publicDoctorProd(), u = fixtures.publicDoctorUnknownClaude();
  console.log(`M16 package: id=${fixtures.descriptor().product_id} certified=${fixtures.descriptor().certified_facets} sig=${fixtures.descriptor().signature_status}`);
  console.log(`public doctor(prod): outcome=${p.compatibility_outcome} claude_ver=${p.claude_code_version} creds=${p.credentials_accessed} net=${p.network_contacted} subproc=${p.subprocesses_spawned}`);
  console.log(`public doctor(unknown claude): outcome=${u.compatibility_outcome} claude_ver=${u.claude_code_version} channel=${u.claude_code_channel} binhash=${u.claude_code_binary_hash}`);
}

if (process.argv[1]?.endsWith('gen-public-package-sample.ts')) main();
