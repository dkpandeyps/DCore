// M15 — deterministic public product-foundation artifacts + SYNTHETIC_TEST_ONLY fixtures.
// No Claude, no network, no credentials, no real fs writes, no /runtime/. Uses the synthetic universal registry
// (from M13-universal) for a COMPATIBLE doctor demo; production stays certified-count 0.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { buildProductManifest, buildIntegrityManifest, verifyIntegrity } from '../product/integrity-and-manifest.ts';
import { detectEnvironment, productAdapters } from '../product/environment-and-adapters.ts';
import { runDoctor, renderDoctor } from '../product/doctor.ts';
import { runInstall } from '../product/install.ts';
import { syntheticUniversalRegistry } from '../tools/gen-universal-compatibility-sample.ts';
import type { UniversalHost } from '../compatibility/universal-compatibility-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-29T00:00:00Z';
export const SYN = 'SYNTHETIC_TEST_ONLY';
const HASH = (c: string) => c.repeat(64);

export function packageFiles() {
  const manifest = buildProductManifest();
  return [
    { path: 'manifest.json', content: canonicalFile(manifest) },
    { path: 'src/product/index.ts', content: '// dkskill product core\n' },
    { path: 'README.md', content: '# dkskill\n' },
  ];
}
export const integrityManifest = () => buildIntegrityManifest(packageFiles());

// A COMPATIBLE synthetic host (windows/x64/native/2.1.283 in the synthetic registry).
export const compatibleHost = (): UniversalHost => ({ product: 'claude-code', version: '2.1.283', os: 'Windows 11', os_version: '10.0.26200', architecture: 'x64', channel: 'native', binary_sha256: HASH('A'), runtime_facet: 'node' });
export const unknownHost = (): UniversalHost => ({ product: 'claude-code', version: null, os: 'plan9', os_version: null, architecture: null, channel: null, binary_sha256: null, runtime_facet: null });

const R = syntheticUniversalRegistry();

export const fixtures = {
  manifest: () => buildProductManifest(),
  integrity: () => integrityManifest(),
  detectCompatible: () => detectEnvironment({ os: 'Windows 11', os_version: '10.0.26200', architecture: 'x64', channel: 'native', claude_code_version: '2.1.283', binary_sha256: HASH('A') }),
  detectUnknown: () => detectEnvironment({ os: 'plan9' }),
  doctorCompatible: () => runDoctor({ host: compatibleHost(), registry: R, synthetic_test_only: true }),
  doctorUnverifiedProd: () => runDoctor({ host: { ...compatibleHost(), binary_sha256: '9dbe16dafed59da5cdabbfe11ad0335738c753fad794989b47f9446accd6de3a' }, synthetic_test_only: false }),
  installCompatible: () => runInstall({ packageFiles: packageFiles(), integrity: integrityManifest(), manifest: buildProductManifest(), targetDir: '/opt/dkskill', stateDir: '/var/lib/dkskill', host: compatibleHost(), registry: R, now: FIXED() }),
  installBlockedUnverified: () => runInstall({ packageFiles: packageFiles(), integrity: integrityManifest(), manifest: buildProductManifest(), targetDir: '/opt/dkskill', stateDir: '/var/lib/dkskill', host: unknownHost(), now: FIXED() }),
};

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'product-package-manifest.json'), canonicalFile(fixtures.manifest()));
  writeFileSync(join(OUT, 'product-package-integrity.json'), canonicalFile(fixtures.integrity()));
  writeFileSync(join(OUT, 'product-adapters.json'), canonicalFile(productAdapters()));
  writeFileSync(join(OUT, 'product-doctor-compatible.json'), canonicalFile(fixtures.doctorCompatible()));
  writeFileSync(join(OUT, 'product-doctor-unverified.json'), canonicalFile(fixtures.doctorUnverifiedProd()));
  writeFileSync(join(OUT, 'product-install-compatible.json'), canonicalFile(fixtures.installCompatible()));
  console.log(`M15: manifest_hash=${fixtures.manifest().integrity.manifest_hash?.slice(0, 20)}; integrity=${verifyIntegrity(integrityManifest(), packageFiles()).status}; doctor(compat)=${fixtures.doctorCompatible().compatibility.status}; doctor(prod)=${fixtures.doctorUnverifiedProd().compatibility.status}; install(compat)=${fixtures.installCompatible().state}; install(unverified)=${fixtures.installBlockedUnverified().state}; adapters=${productAdapters().length}`);
  console.log('--- dkskill doctor (unverified prod) ---'); console.log(renderDoctor(fixtures.doctorUnverifiedProd()));
}

if (process.argv[1]?.endsWith('gen-product-foundation-sample.ts')) main();
