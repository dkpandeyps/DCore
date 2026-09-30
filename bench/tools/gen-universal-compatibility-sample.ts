// M13-UNIVERSAL — deterministic universal-compatibility artifacts + SYNTHETIC_TEST_ONLY fixtures.
// Uses an in-memory synthetic multi-platform registry (windows/macos/linux) for COMPATIBLE demonstrations; the
// production registry is never mutated and its certified count stays ZERO. No Claude, no network, no OS change.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { buildCatalogue } from '../tools/gen-capability-catalogue.ts';
import { resolveUniversal, buildUniversalCompatibility } from '../compatibility/universal-compatibility.ts';
import type { UniversalHost } from '../compatibility/universal-compatibility-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-29T00:00:00Z';
export const SYN = 'SYNTHETIC_TEST_ONLY';

const HASH = (c: string) => c.repeat(64);
const allVerified = () => { const m: Record<string, string> = {}; for (const c of buildCatalogue().capabilities) m[c.id] = 'VERIFIED'; return m; };

// Clone the base 2.1.283 profile into a SYNTHETIC certified facet for an arbitrary platform/arch/channel/version.
function synthProfile(o: { id: string; product?: string; version: string; platform: string; architecture: string; channel: string; binary: string; certified?: boolean; caps?: Record<string, string>; dropFacet?: string; lifecycle?: string; revoked?: boolean; certStatus?: string }) {
  const base = JSON.parse(JSON.stringify(buildRegistry().profiles.find((p) => p.version === '2.1.283' && !p.is_scope_placeholder)));
  const facet_refs = { ...base.facet_refs }; if (o.dropFacet) delete (facet_refs as any)[o.dropFacet];
  return {
    ...base, profile_id: o.id, product: o.product ?? 'claude-code', version: o.version, platform: o.platform, architecture: o.architecture,
    channel: o.channel, binary_sha256: o.binary, is_scope_placeholder: false,
    validation_status: o.certified === false ? 'PROBED' : 'CERTIFIED', certification_status: o.certStatus ?? (o.certified === false ? 'NOT_CERTIFIED' : 'CERTIFIED'),
    lifecycle_state: o.lifecycle ?? 'active', revoked: o.revoked ?? false, capability_refs: o.caps ?? allVerified(), facet_refs, limitations: [],
  };
}

export function syntheticUniversalRegistry() {
  const reg = JSON.parse(JSON.stringify(buildRegistry()));
  const extra = [
    synthProfile({ id: 'syn-win-x64@1', version: '2.1.283', platform: 'win32', architecture: 'x64', channel: 'native', binary: HASH('A') }),
    synthProfile({ id: 'syn-macos-arm64@1', version: '2.1.283', platform: 'darwin', architecture: 'arm64', channel: 'native', binary: HASH('B') }),
    synthProfile({ id: 'syn-linux-x64@1', version: '2.1.283', platform: 'linux', architecture: 'x64', channel: 'native', binary: HASH('C') }),
    synthProfile({ id: 'syn-macos-284@1', version: '2.1.284', platform: 'darwin', architecture: 'arm64', channel: 'native', binary: HASH('D') }),   // attribution out of scope
    synthProfile({ id: 'syn-win-revoked@1', version: '2.1.283', platform: 'win32', architecture: 'arm64', channel: 'native', binary: HASH('E'), revoked: true, lifecycle: 'revoked' }),
    synthProfile({ id: 'syn-linux-superseded@1', version: '2.1.283', platform: 'linux', architecture: 'arm64', channel: 'native', binary: HASH('F'), lifecycle: 'superseded', certStatus: 'SUPERSEDED' }),
    synthProfile({ id: 'syn-win-safetygap@1', version: '2.1.282', platform: 'win32', architecture: 'x64', channel: 'stable', binary: HASH('7'), caps: (() => { const m = allVerified(); const sc = buildCatalogue().capabilities.find((c) => (c.criticality || '').toLowerCase().includes('safety') || c.required_for?.toLowerCase?.().includes('safety')); const k = sc?.id ?? Object.keys(m)[0]; m[k] = 'PARTIALLY_VERIFIED'; return m; })() }),
    synthProfile({ id: 'syn-linux-nofacet@1', version: '2.1.281', platform: 'linux', architecture: 'x64', channel: 'stable', binary: HASH('8'), dropFacet: 'stream_schema' }),
    // ambiguous pair (identical dims, different ids)
    synthProfile({ id: 'syn-ambig-a@1', version: '2.1.280', platform: 'darwin', architecture: 'x64', channel: 'npm', binary: HASH('9') }),
    synthProfile({ id: 'syn-ambig-b@1', version: '2.1.280', platform: 'darwin', architecture: 'x64', channel: 'npm', binary: HASH('9') }),
  ];
  reg.profiles = [...reg.profiles, ...extra];
  return reg;
}

const R = syntheticUniversalRegistry();
function host(o: Partial<UniversalHost>): UniversalHost {
  const g = <K extends keyof UniversalHost>(k: K, d: UniversalHost[K]): UniversalHost[K] => (k in o ? (o[k] as UniversalHost[K]) : d);
  return { product: g('product', 'claude-code'), version: g('version', '2.1.283'), os: g('os', 'Windows 11'), os_version: g('os_version', null), architecture: g('architecture', 'x64'), channel: g('channel', 'native'), binary_sha256: g('binary_sha256', HASH('A')), runtime_facet: g('runtime_facet', null) };
}
function res(h: UniversalHost) { return resolveUniversal({ host: h, registry: R, synthetic_test_only: true }); }

export const fixtures = {
  windowsCertified: () => res(host({ os: 'Windows 11', architecture: 'x64', binary_sha256: HASH('A') })),
  macosCertified: () => res(host({ os: 'darwin', architecture: 'arm64', binary_sha256: HASH('B') })),
  linuxCertified: () => res(host({ os: 'linux', architecture: 'x64', binary_sha256: HASH('C') })),
  versionMismatch: () => res(host({ os: 'Windows 11', version: '2.1.999', architecture: 'x64', binary_sha256: HASH('A') })),
  platformMismatch: () => res(host({ os: 'freebsd', architecture: 'x64' })),
  architectureMismatch: () => res(host({ os: 'Windows 11', architecture: 'arm64', binary_sha256: HASH('A') })),   // supported arch, no cert profile
  channelMismatch: () => res(host({ os: 'Windows 11', architecture: 'x64', channel: 'npm', binary_sha256: HASH('A') })),
  binaryHashMismatch: () => res(host({ os: 'Windows 11', architecture: 'x64', binary_sha256: HASH('0') })),
  unknownHost: () => res(host({ os: 'plan9', architecture: 'sparc' })),
  incompleteIdentity: () => res(host({ os: 'Windows 11', version: null, architecture: 'x64', binary_sha256: HASH('A') })),
  safetyCapBlocked: () => res(host({ os: 'Windows 11', version: '2.1.282', architecture: 'x64', channel: 'stable', binary_sha256: HASH('7') })),
  unknownFacet: () => res(host({ os: 'linux', version: '2.1.281', architecture: 'x64', channel: 'stable', binary_sha256: HASH('8') })),
  attributionOutOfScope: () => res(host({ os: 'darwin', version: '2.1.284', architecture: 'arm64', binary_sha256: HASH('D') })),
  revokedProfile: () => res(host({ os: 'Windows 11', architecture: 'arm64', binary_sha256: HASH('E') })),
  supersededProfile: () => res(host({ os: 'linux', architecture: 'arm64', binary_sha256: HASH('F') })),
  ambiguousProfile: () => res(host({ os: 'darwin', version: '2.1.280', architecture: 'x64', channel: 'npm', binary_sha256: HASH('9') })),
  productionUnverified: () => resolveUniversal({ host: host({ os: 'Windows 11', architecture: 'x64', binary_sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A'.toLowerCase() }), synthetic_test_only: false }),   // production registry
};

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'universal-compatibility.json'), canonicalFile(buildUniversalCompatibility()));
  const samples: [string, keyof typeof fixtures][] = [['uc-sample-windows-compatible.json', 'windowsCertified'], ['uc-sample-macos-compatible.json', 'macosCertified'], ['uc-sample-linux-compatible.json', 'linuxCertified'], ['uc-sample-unverified.json', 'versionMismatch'], ['uc-sample-unsupported.json', 'platformMismatch'], ['uc-sample-revoked.json', 'revokedProfile'], ['uc-sample-blocked.json', 'safetyCapBlocked'], ['uc-sample-partial.json', 'unknownFacet'], ['uc-sample-ambiguous.json', 'ambiguousProfile']];
  for (const [name, key] of samples) writeFileSync(join(OUT, name), canonicalFile(fixtures[key]()));
  console.log(`M13-UNIVERSAL: win=${fixtures.windowsCertified().outcome} mac=${fixtures.macosCertified().outcome} linux=${fixtures.linuxCertified().outcome} | verMismatch=${fixtures.versionMismatch().outcome} platMismatch=${fixtures.platformMismatch().outcome} archMismatch=${fixtures.architectureMismatch().outcome} revoked=${fixtures.revokedProfile().outcome} blocked=${fixtures.safetyCapBlocked().outcome} partial=${fixtures.unknownFacet().outcome} ambig=${fixtures.ambiguousProfile().outcome} prod=${fixtures.productionUnverified().outcome}`);
}

if (process.argv[1]?.endsWith('gen-universal-compatibility-sample.ts')) main();
