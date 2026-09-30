// M13-UNIVERSAL — deterministic global certification matrix artifacts + SYNTHETIC_TEST_ONLY fixtures.
// Production matrix has ZERO certified cells (immutability preserved). Synthetic matrix demonstrates multi-platform/
// multi-version cells and the latest-3 policy. No Claude, no network, no OS change, no registry mutation.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { buildCatalogue } from '../tools/gen-capability-catalogue.ts';
import { buildMatrix } from '../compatibility/global-certification-matrix.ts';
import type { Platform } from '../compatibility/universal-compatibility-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-29T00:00:00Z';
export const SYN = 'SYNTHETIC_TEST_ONLY';

const HASH = (c: string) => c.repeat(64);
const allVerified = () => { const m: Record<string, string> = {}; for (const c of buildCatalogue().capabilities) m[c.id] = 'VERIFIED'; return m; };
function synth(o: { id: string; version: string; platform: string; architecture: string; channel: string; binary: string; certified?: boolean; revoked?: boolean; lifecycle?: string; certStatus?: string }) {
  const base = JSON.parse(JSON.stringify(buildRegistry().profiles.find((p) => p.version === '2.1.283' && !p.is_scope_placeholder)));
  return { ...base, profile_id: o.id, version: o.version, platform: o.platform, architecture: o.architecture, channel: o.channel, binary_sha256: o.binary, is_scope_placeholder: false, validation_status: o.certified === false ? 'PROBED' : 'CERTIFIED', certification_status: o.certStatus ?? (o.certified === false ? 'NOT_CERTIFIED' : 'CERTIFIED'), lifecycle_state: o.lifecycle ?? 'active', revoked: o.revoked ?? false, capability_refs: allVerified() };
}

// Synthetic registry with 4 certified versions (for latest-3), a revoked, a superseded, and a not-certified cell.
export function syntheticMatrixRegistry() {
  const reg = JSON.parse(JSON.stringify(buildRegistry()));
  reg.profiles = [...reg.profiles,
    synth({ id: 'm-win-283@1', version: '2.1.283', platform: 'win32', architecture: 'x64', channel: 'native', binary: HASH('1') }),
    synth({ id: 'm-win-284@1', version: '2.1.284', platform: 'win32', architecture: 'x64', channel: 'native', binary: HASH('2') }),
    synth({ id: 'm-win-285@1', version: '2.1.285', platform: 'win32', architecture: 'x64', channel: 'native', binary: HASH('3') }),
    synth({ id: 'm-win-286@1', version: '2.1.286', platform: 'win32', architecture: 'x64', channel: 'native', binary: HASH('4') }),
    synth({ id: 'm-mac-283@1', version: '2.1.283', platform: 'darwin', architecture: 'arm64', channel: 'native', binary: HASH('5') }),
    synth({ id: 'm-linux-283@1', version: '2.1.283', platform: 'linux', architecture: 'x64', channel: 'native', binary: HASH('6') }),
    synth({ id: 'm-win-revoked@1', version: '2.1.282', platform: 'win32', architecture: 'x64', channel: 'native', binary: HASH('7'), revoked: true, lifecycle: 'revoked' }),
    synth({ id: 'm-win-notcert@1', version: '2.1.281', platform: 'win32', architecture: 'x64', channel: 'native', binary: HASH('8'), certified: false }),
  ];
  return reg;
}

const DIMS = { platforms: ['windows', 'macos', 'linux'] as Platform[], architectures: ['x64', 'arm64'], channels: ['native'], versions: ['2.1.281', '2.1.282', '2.1.283', '2.1.284', '2.1.285', '2.1.286'] };

export function productionMatrix() { return buildMatrix(); }
export function syntheticMatrix() { return buildMatrix({ registry: syntheticMatrixRegistry(), dimensions: DIMS, synthetic_test_only: true }); }

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'global-certification-matrix-production.json'), canonicalFile(productionMatrix()));
  writeFileSync(join(OUT, 'global-certification-matrix-synthetic.json'), canonicalFile(syntheticMatrix()));
  const s = syntheticMatrix(); const p = productionMatrix();
  console.log(`M13 matrix: production certified=${p.certified_count}; synthetic certified=${s.certified_count}; latest3=${s.latest_3_certified_versions.join(',')}; cells=${s.records.length}`);
}

if (process.argv[1]?.endsWith('gen-global-certification-matrix-sample.ts')) main();
