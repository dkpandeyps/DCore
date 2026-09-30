// M19 — Certification-side Identity Attestation DESIGN engine.
// DESIGN ONLY, deterministic, FAIL-CLOSED. Builds + validates attestations and maps them to exactly one M13 matrix
// cell (read-only). It NEVER certifies, signs, executes Claude, authenticates, contacts the network, or mutates
// M4/M5/M6/M7/M8/M9/M13/M17/M18 or the production registry. It never yields CERTIFIED/SIGNED/PUBLISHED. A missing
// matrix cell stays NOT_CERTIFIED; no cross-platform/version/channel/architecture inheritance.
import { sha256, canonicalJson } from '../src/canonical.ts';
import { matrixCell } from './global-certification-matrix.ts';
import { selectAdapter } from './platform-adapter.ts';
import type { GlobalCertificationMatrix } from './global-certification-types.ts';
import type { Platform } from './universal-compatibility-types.ts';
import type {
  CertificationIdentityAttestation, ObservationSource, FieldProvenance, ObsField, FieldState, ProvenanceStrength,
  AttestationStatus, AttestationThreat, IntegrationInterface,
} from './certification-identity-attestation-types.ts';

const REQUIRED_FIELDS: ObsField[] = ['product', 'version', 'operating_system', 'architecture', 'channel', 'binary_sha256'];
const RANK: Record<ProvenanceStrength, number> = { SELF_REPORTED: 0, LOCAL_OBSERVATION: 1, CONTROLLED_OBSERVATION: 2, INDEPENDENT_OBSERVATION: 3, CERTIFICATION_ATTESTATION: 4 };
// Minimum provenance for a field to count as authoritatively OBSERVED. Channel + binary are the sensitive ones.
const MIN_STRENGTH: Record<ObsField, ProvenanceStrength> = {
  product: 'SELF_REPORTED', version: 'LOCAL_OBSERVATION', operating_system: 'LOCAL_OBSERVATION', os_version: 'LOCAL_OBSERVATION',
  architecture: 'LOCAL_OBSERVATION', runtime_facet: 'LOCAL_OBSERVATION', channel: 'CONTROLLED_OBSERVATION', binary_sha256: 'CONTROLLED_OBSERVATION',
};
const SECRET_RE = /(sk-[a-z0-9]{6}|eyJ[a-zA-Z0-9_-]{6,}\.[a-zA-Z0-9_-]{6,}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|access_token=|refresh_token=|api[_-]?key=|bearer\s+[a-z0-9]{6}|password=\S+)/i;
export function containsSecret(v: unknown): boolean { return SECRET_RE.test(typeof v === 'string' ? v : JSON.stringify(v ?? null)); }

// Per-field provenance from observation sources, detecting contradictions + insufficient strength.
function fieldProvenance(field: ObsField, declared: string | null, sources: ObservationSource[]): FieldProvenance {
  const forField = sources.filter((s) => s.field === field);
  if (declared == null || declared === '') return { field, value: null, state: 'UNKNOWN', strength: null, source: null };
  if (forField.length === 0) return { field, value: declared, state: 'UNKNOWN', strength: null, source: null };
  const values = new Set(forField.map((s) => s.value));
  if (values.size > 1 || [...values].some((v) => v !== declared)) return { field, value: declared, state: 'CONTRADICTED', strength: null, source: forField.map((s) => s.source).join(',') };
  const best = forField.reduce((a, b) => (RANK[b.provenance_strength] > RANK[a.provenance_strength] ? b : a));
  const state: FieldState = RANK[best.provenance_strength] >= RANK[MIN_STRENGTH[field]] ? 'OBSERVED' : 'INSUFFICIENT_PROVENANCE';
  return { field, value: declared, state, strength: best.provenance_strength, source: best.source };
}

export function attestationMatrixCombo(a: Pick<CertificationIdentityAttestation, 'operating_system' | 'architecture' | 'channel' | 'claude_version'>): { platform: Platform | null; architecture: string | null; channel: string | null; version: string | null } {
  const platform = a.operating_system ? (selectAdapter(a.operating_system)?.platform ?? null) : null;
  return { platform, architecture: a.architecture ?? null, channel: a.channel ?? null, version: a.claude_version ?? null };
}

export function buildAttestation(input: {
  attestation_id: string; product?: string | null; version?: string | null; operating_system?: string | null;
  os_version?: string | null; architecture?: string | null; channel?: string | null; runtime_facet?: string | null;
  binary_sha256?: string | null; observation_sources?: ObservationSource[]; environment_id?: string | null;
  profile_id?: string | null; installation_ref?: string | null; ambiguous_installations?: boolean;
  evidence_references?: string[]; created_at: string; expires_at?: string | null; revocation_reference?: string | null;
  supersession_reference?: string | null; previous_attestation_hash?: string | null; now: string; synthetic_test_only?: boolean; tampered?: boolean;
}): CertificationIdentityAttestation {
  const sources = input.observation_sources ?? [];
  const declared = {
    product: input.product ?? 'claude-code', version: input.version ?? null, operating_system: input.operating_system ?? null,
    os_version: input.os_version ?? null, architecture: input.architecture ?? null, channel: input.channel ?? null,
    runtime_facet: input.runtime_facet ?? null, binary_sha256: input.binary_sha256 ?? null,
  };
  const map: Record<ObsField, string | null> = declared;
  const provenance: FieldProvenance[] = (Object.keys(map) as ObsField[]).map((f) => fieldProvenance(f, map[f], sources));
  const byField = new Map(provenance.map((p) => [p.field, p]));
  const contradictions = provenance.filter((p) => p.state === 'CONTRADICTED').map((p) => `field ${p.field} CONTRADICTED across sources`);
  const reasons: string[] = [];

  // Status derivation (fail-closed precedence).
  let attestation_status: AttestationStatus;
  const expired = !!input.expires_at && input.expires_at <= input.now;
  if (input.tampered) { attestation_status = 'TAMPERED'; reasons.push('attestation integrity broken'); }
  else if (input.revocation_reference) { attestation_status = 'REVOKED'; reasons.push('attestation revoked'); }
  else if (input.supersession_reference) { attestation_status = 'SUPERSEDED'; reasons.push('attestation superseded'); }
  else if (expired) { attestation_status = 'EXPIRED'; reasons.push('attestation expired'); }
  else if (contradictions.length) { attestation_status = 'CONTRADICTED'; reasons.push(...contradictions); }
  else if (input.ambiguous_installations) { attestation_status = 'AMBIGUOUS'; reasons.push('multiple installations — exact one not identified'); }
  else {
    const missing = REQUIRED_FIELDS.filter((f) => byField.get(f)!.state !== 'OBSERVED');
    if (missing.length) { attestation_status = 'INCOMPLETE'; reasons.push(...missing.map((f) => `field ${f} not authoritatively OBSERVED (${byField.get(f)!.state})`)); }
    else { attestation_status = 'COMPLETE_UNSIGNED'; reasons.push('all required identity fields authoritatively observed; authorized signing still required before publication'); }
  }

  const base: Omit<CertificationIdentityAttestation, 'attestation_hash'> = {
    schema: 'dkskill.certification_identity_attestation/1', version: 1, synthetic_test_only: input.synthetic_test_only ?? true,
    attestation_id: input.attestation_id, product: declared.product, claude_version: declared.version, operating_system: declared.operating_system,
    os_version: declared.os_version, architecture: declared.architecture, channel: declared.channel, runtime_facet: declared.runtime_facet,
    binary_sha256: declared.binary_sha256, observation_sources: sources, observation_timestamps: [...new Set(sources.map((s) => s.observation_time))].sort(),
    evidence_references: input.evidence_references ?? [], provenance, environment_id: input.environment_id ?? null, profile_id: input.profile_id ?? null,
    installation_ref: input.installation_ref ?? null, ambiguous_installations: input.ambiguous_installations ?? false,
    evidence_hashes: sources.map((s) => s.evidence_hash), attestation_status, signer_identity: null, signature_status: 'SIGNATURE_REQUIRED', signing_required: true,
    created_at: input.created_at, expires_at: input.expires_at ?? null, revocation_reference: input.revocation_reference ?? null,
    supersession_reference: input.supersession_reference ?? null, previous_attestation_hash: input.previous_attestation_hash ?? null,
    matrix_combo: attestationMatrixCombo({ operating_system: declared.operating_system, architecture: declared.architecture, channel: declared.channel, claude_version: declared.version }),
    contradictions, reasons,
  };
  return { ...base, attestation_hash: sha256(canonicalJson(base)) };
}

export function verifyAttestation(a: CertificationIdentityAttestation): boolean { const { attestation_hash, ...rest } = a; return sha256(canonicalJson(rest)) === attestation_hash; }
export function attestationHasSecret(a: CertificationIdentityAttestation): boolean { return containsSecret(a); }

// Map an attestation to EXACTLY ONE M13 matrix cell (read-only). A missing cell => NOT_CERTIFIED. No inheritance.
export function attestationToMatrixCell(a: CertificationIdentityAttestation, matrix: GlobalCertificationMatrix) {
  const c = a.matrix_combo;
  if (a.attestation_status !== 'COMPLETE_UNSIGNED' || !c.platform || !c.architecture || !c.channel || !c.version) return { bound: false, cell: null as any, reason: `attestation ${a.attestation_status} or incomplete combo => no cell binding` };
  const cell = matrixCell(matrix, { platform: c.platform, architecture: c.architecture, channel: c.channel, version: c.version });
  return { bound: true, cell, reason: `bound to ${c.platform}/${c.architecture}/${c.channel}/${c.version} => ${cell.cert_state} (M19 never certifies)` };
}

// ---- design-only integration interfaces (documented, never executed) ---------------------------------------
export function integrationInterfaces(): IntegrationInterface[] {
  return [
    { stage: 'M7', role: 'evidence acquisition', consumes: 'identity observations', produces: 'evidence package (hashed, secret-free)', m19_executes: false },
    { stage: 'M9', role: 'independent network-isolation verification', consumes: 'evidence session', produces: 'L4 verification (INDEPENDENT_OBSERVATION)', m19_executes: false },
    { stage: 'M8', role: 'controlled execution authorization', consumes: 'exact identity + L4 + authorization', produces: 'EXECUTION decision (still BLOCKED without all gates)', m19_executes: false },
    { stage: 'M4', role: 'certification harness', consumes: 'evidence package + attestation', produces: 'certification decision (owner-reviewed)', m19_executes: false },
    { stage: 'M5', role: 'publication profile', consumes: 'certification result + attestation', produces: 'publication proposal (not applied)', m19_executes: false },
    { stage: 'M6', role: 'registry governance', consumes: 'signed proposal', produces: 'immutable signed registry update', m19_executes: false },
    { stage: 'M13', role: 'global matrix', consumes: 'published profile', produces: 'exactly one certified cell (no inheritance)', m19_executes: false },
  ];
}

// ---- security threat model (design) -----------------------------------------------------------------------
export function threatModel(): AttestationThreat[] {
  const t = (threat: string, required_evidence: string, control: string, failure_state: string): AttestationThreat => ({ threat, required_evidence, control, failure_state, certification_blocked: true });
  return [
    t('forged attestation', 'independent evidence chain + authorized signature', 'signing required (M6); no signer invented', 'unsigned => not authoritative'),
    t('copied attestation', 'environment binding + freshness', 'environment_id + created_at/expires_at + hash chain', 'environment mismatch => blocked'),
    t('stale attestation', 'freshness metadata', 'expires_at; stale => EXPIRED', 'EXPIRED'),
    t('revoked attestation', 'revocation record', 'revocation_reference => REVOKED', 'REVOKED'),
    t('wrong binary', 'binary SHA-256 from the exact certified executable', 'binary_sha256 bound; CONTROLLED/INDEPENDENT provenance', 'mismatch => not OBSERVED / CONTRADICTED'),
    t('wrong version/channel/OS/architecture', 'directly evidenced fields (no inference)', 'per-field provenance + min strength (channel/binary CONTROLLED+)', 'INSUFFICIENT_PROVENANCE / CONTRADICTED'),
    t('wrong environment', 'certification environment id', 'environment_id binding', 'mismatch => blocked'),
    t('replay', 'freshness + previous_attestation_hash chain', 'hash chain + expiry + environment binding', 'stale/replay => blocked'),
    t('metadata substitution', 'strong-provenance evidence', 'SELF_REPORTED/LOCAL insufficient for channel/binary', 'INSUFFICIENT_PROVENANCE'),
    t('malicious registry update', 'signed governance', 'M6 signed, immutable, hash-chained', 'unsigned/unauthorized => rejected'),
    t('compromised observer', 'independent + tamper-evident observation', 'INDEPENDENT_OBSERVATION; tamper hash', 'contradiction/integrity failure => blocked'),
    t('compromised certification environment', 'isolated, reproducible env + independent observer (M9 L4)', 'trust-plane separation (M13-infra)', 'L4 unverified => blocked'),
    t('ambiguous installation', 'exact installation_ref', 'no PATH guess/default selection', 'AMBIGUOUS => blocked'),
    t('tampered attestation', 'attestation_hash', 'hash over canonical attestation; verifyAttestation', 'TAMPERED'),
  ];
}
