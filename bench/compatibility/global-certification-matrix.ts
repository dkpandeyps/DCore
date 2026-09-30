// M13-UNIVERSAL — Global Certification Matrix engine. Deterministic, FAIL-CLOSED. Builds an explicit matrix over
// platform × architecture × channel × version; every combination has a state; NO missing combination is certified;
// NO automatic inheritance; records are immutable. Reads a registry (production or a synthetic clone) read-only.
import { sha256, canonicalJson } from '../src/canonical.ts';
import { buildRegistry, type Registry, type Profile } from '../tools/gen-compatibility-registry.ts';
import { buildCatalogue } from '../tools/gen-capability-catalogue.ts';
import { buildEquivalence } from '../tools/gen-attribution-equivalence.ts';
import { FACET_FAMILIES } from './hcl.ts';
import type {
  GlobalCertificationMatrix, GlobalCertificationRecord, MatrixCombo, CertState, RegistryRecordState, VersionLifecycle,
} from './global-certification-types.ts';
import type { Platform } from './universal-compatibility-types.ts';

// registry platform token -> universal Platform
const TOKEN_PLATFORM: Record<string, Platform> = { win32: 'windows', windows: 'windows', darwin: 'macos', macos: 'macos', linux: 'linux' };
const CATALOGUE = buildCatalogue();

export function profileCertState(p: Profile): CertState {
  if (p.revoked || p.lifecycle_state === 'revoked') return 'REVOKED';
  if (p.lifecycle_state === 'superseded') return 'SUPERSEDED';
  if (p.certification_status === 'CERTIFIED') return 'CERTIFIED';
  if (p.validation_status === 'VALIDATED') return 'NOT_CERTIFIED';
  return 'NOT_VALIDATED';
}
function registryState(p: Profile): RegistryRecordState {
  if (p.revoked || p.lifecycle_state === 'revoked') return 'REVOKED';
  if (p.lifecycle_state === 'superseded') return 'SUPERSEDED';
  if (p.certification_status === 'CERTIFIED') return 'CERTIFIED';
  if (p.validation_status === 'VALIDATED') return 'VALIDATED';
  if (p.validation_status === 'PROBED') return 'PROBED';
  return 'NOT_VALIDATED';
}
function lifecycleOf(state: CertState): VersionLifecycle {
  switch (state) { case 'CERTIFIED': return 'CERTIFIED'; case 'REVOKED': return 'REVOKED'; case 'SUPERSEDED': return 'SUPERSEDED'; case 'FAILED': return 'FAILED'; case 'BLOCKED': return 'BLOCKED'; case 'NOT_VALIDATED': return 'UNVERIFIED'; default: return 'UNVERIFIED'; }
}

function recordFromProfile(p: Profile, synthetic: boolean): GlobalCertificationRecord | null {
  if (p.is_scope_placeholder) return null;
  const platform = TOKEN_PLATFORM[(p as any).platform] ?? null;
  if (!platform) return null;
  const state = profileCertState(p);
  const caps = CATALOGUE.capabilities;
  const verified = caps.filter((c) => (p.capability_refs?.[c.id]) === 'VERIFIED').length;
  return {
    schema: 'dkskill.global_certification_record/1',
    combo: { platform, architecture: (p as any).architecture, channel: (p as any).channel, version: (p as any).version },
    profile_id: p.profile_id, binary_sha256: (p as any).binary_sha256 ?? null, cert_state: state, registry_state: registryState(p),
    version_lifecycle: lifecycleOf(state),
    facet_states: (FACET_FAMILIES as readonly string[]).map((fam) => ({ family: fam, state: p.facet_refs?.[fam] ? 'RESOLVED' : 'UNRESOLVED' })),
    capability_summary: { verified, total: caps.length }, attribution_in_scope: buildEquivalence().attr_valid_for.includes((p as any).version),
    evidence_ref: state === 'CERTIFIED' ? `evi:${p.profile_id}` : null, signed: state === 'CERTIFIED', immutable: true, synthetic_test_only: synthetic,
  };
}

// A missing combination is NEVER certified: it defaults to NOT_CERTIFIED.
export function defaultRecord(combo: MatrixCombo, synthetic: boolean): GlobalCertificationRecord {
  return {
    schema: 'dkskill.global_certification_record/1', combo, profile_id: null, binary_sha256: null, cert_state: 'NOT_CERTIFIED',
    registry_state: 'NOT_CERTIFIED', version_lifecycle: 'UNVERIFIED',
    facet_states: (FACET_FAMILIES as readonly string[]).map((fam) => ({ family: fam, state: 'UNRESOLVED' })),
    capability_summary: { verified: 0, total: CATALOGUE.capabilities.length }, attribution_in_scope: false, evidence_ref: null,
    signed: false, immutable: true, synthetic_test_only: synthetic,
  };
}

export function buildMatrix(input: { registry?: Registry; dimensions?: { platforms: Platform[]; architectures: string[]; channels: string[]; versions: string[] }; synthetic_test_only?: boolean } = {}): GlobalCertificationMatrix {
  const registry = input.registry ?? buildRegistry();
  const synthetic = input.synthetic_test_only ?? false;
  const fromProfiles = registry.profiles.map((p) => recordFromProfile(p, synthetic)).filter((r): r is GlobalCertificationRecord => !!r);
  const dims = input.dimensions ?? deriveDimensions(fromProfiles);
  // Ensure every enumerated combination has an explicit record; missing => NOT_CERTIFIED (fail closed).
  const byKey = new Map(fromProfiles.map((r) => [comboKey(r.combo), r]));
  const records: GlobalCertificationRecord[] = [];
  for (const platform of dims.platforms) for (const architecture of dims.architectures) for (const channel of dims.channels) for (const version of dims.versions) {
    const combo: MatrixCombo = { platform, architecture, channel, version };
    records.push(byKey.get(comboKey(combo)) ?? defaultRecord(combo, synthetic));
  }
  const certified = records.filter((r) => r.cert_state === 'CERTIFIED');
  const base: Omit<GlobalCertificationMatrix, 'matrix_hash'> = {
    schema: 'dkskill.global_certification_matrix/1', version: 1, synthetic_test_only: synthetic, dimensions: dims, records,
    certified_count: certified.length, latest_3_certified_versions: latest3(certified),
    no_inheritance: { version: true, platform: true, architecture: true, channel: true }, requires_signed_authorization: true,
  };
  return { ...base, matrix_hash: sha256(canonicalJson(base)) };
}
function comboKey(c: MatrixCombo): string { return `${c.platform}|${c.architecture}|${c.channel}|${c.version}`; }
function deriveDimensions(records: GlobalCertificationRecord[]): { platforms: Platform[]; architectures: string[]; channels: string[]; versions: string[] } {
  const uniq = <T,>(xs: T[]) => [...new Set(xs)].sort() as T[];
  return {
    platforms: (uniq(records.map((r) => r.combo.platform)).length ? uniq(records.map((r) => r.combo.platform)) : ['windows', 'macos', 'linux']) as Platform[],
    architectures: uniq(records.map((r) => r.combo.architecture)).length ? uniq(records.map((r) => r.combo.architecture)) : ['x64', 'arm64'],
    channels: uniq(records.map((r) => r.combo.channel)).length ? uniq(records.map((r) => r.combo.channel)) : ['native'],
    versions: uniq(records.map((r) => r.combo.version)).length ? uniq(records.map((r) => r.combo.version)) : ['2.1.283'],
  };
}

// ---- lookups + latest-3 policy ----------------------------------------------------------------------------
export function matrixCell(matrix: GlobalCertificationMatrix, combo: MatrixCombo): GlobalCertificationRecord {
  return matrix.records.find((r) => comboKey(r.combo) === comboKey(combo)) ?? defaultRecord(combo, matrix.synthetic_test_only);
}
export function latest3(certified: GlobalCertificationRecord[]): string[] {
  // only actually-certified versions count; no filling; revoked/superseded excluded; deterministic descending.
  const versions = [...new Set(certified.filter((r) => r.cert_state === 'CERTIFIED').map((r) => r.combo.version))];
  versions.sort((a, b) => cmpVersion(b, a));
  return versions.slice(0, 3);
}
function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0), pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return d; }
  return a < b ? -1 : a > b ? 1 : 0;
}
// No automatic inheritance across any dimension.
export function inheritsCertification(): boolean { return false; }

export function verifyMatrix(m: GlobalCertificationMatrix): boolean {
  const { matrix_hash, ...rest } = m; return sha256(canonicalJson(rest)) === matrix_hash;
}
