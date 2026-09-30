// M20 — Certification Evidence-Package ↔ Identity-Attestation Binding SPECIFICATION (DESIGN ONLY).
// This module encodes the binding rules as deterministic SPEC DATA + a consistency validator. It is NOT runtime
// certification: it executes no Claude, authenticates nothing, reads no ~/.claude / credentials, contacts no network,
// signs nothing, and mutates nothing. It reuses M19 attestation statuses + provenance strengths (never inventing new
// states) and references M7/M9/M13 terminology without reimplementing them. Unknown/insufficient evidence remains
// non-certifiable; COMPLETE_UNSIGNED never means CERTIFIED.
import { sha256, canonicalJson } from '../src/canonical.ts';
import type { AttestationStatus, ProvenanceStrength, ObsField } from './certification-identity-attestation-types.ts';

export type M4GateResult = 'PASS' | 'FAIL' | 'BLOCKED';   // M4's existing gate outcomes; no new state introduced
const M19_STATES: AttestationStatus[] = ['INCOMPLETE', 'COMPLETE_UNSIGNED', 'CONTRADICTED', 'AMBIGUOUS', 'EXPIRED', 'REVOKED', 'SUPERSEDED', 'TAMPERED'];
const REQUIRED_FIELDS: ObsField[] = ['product', 'version', 'operating_system', 'architecture', 'channel', 'binary_sha256'];

export interface FieldBinding {
  field: ObsField;
  required_for_completeness: boolean;
  permitted_m7_evidence_classes: string[];
  permitted_observation_sources: string[];
  min_provenance: ProvenanceStrength;
  l4_required: boolean;
  independent_observation_required: boolean;
  contradiction_blocks: boolean;
  stale_blocks: boolean;
  environment_mismatch_blocks: boolean;
  may_remain_unknown: boolean;
  status_if_missing: AttestationStatus;
  status_if_contradictory: AttestationStatus;
  status_if_insufficient_provenance: AttestationStatus;
}

export interface FailureRow { case_id: string; condition: string; attestation_state: AttestationStatus; m4_gate_result: M4GateResult; certification_consequence: 'NOT_CERTIFIED' | 'BLOCKED'; remediation_possible: boolean; new_evidence_required: boolean }
export interface ThreatRow { attack: string; required_control: string; failure_state: string; certification_blocked: true }
export interface FixtureSpec { id: string; name: string; expected_attestation_state: AttestationStatus | 'COMPLETE_UNSIGNED_BLOCKED_AT_M4'; label: 'SYNTHETIC_TEST_ONLY' }
export interface OpenGap { id: string; question: string; status: 'OPEN_DESIGN_GAP'; closing_evidence_required: string }

export interface BindingSpec {
  schema: 'dkskill.evidence_attestation_binding_spec/1';
  version: 1;
  design_only: true;
  objective: string;
  field_map: FieldBinding[];
  provenance_rules: Record<string, string>;
  binary_binding: { authoritative: string[]; supporting_only: string[]; insufficient: string[]; rule: string; open_gap: string };
  channel_binding: { design_candidates: { candidate: string; acceptable_if: string }[]; forbidden_inference: string[]; rule: string; open_gap: string };
  l4_relationship: Record<string, string>;
  freshness_environment_rules: Record<string, string>;
  contradiction_rules: { contradiction: string; result: AttestationStatus }[];
  m4_consumption_gate: { gate_id: string; requires: string[]; complete_unsigned_is_not_certified: true; transition: string[] };
  m4_failure_matrix: FailureRow[];
  hash_binding_model: { chain: string[]; canonical_serialization: string; algorithm: 'sha256'; content_addressed: true; failure_modes: string[] };
  multiple_installation_model: Record<string, string>;
  observer_trust_boundary: { class: string; sufficient_for: string[] }[];
  public_private_boundary: { public_product: string[]; certification_system: string[]; signing_governance: string[] };
  security_review: ThreatRow[];
  fixture_specs: FixtureSpec[];
  future_test_specs: string[];
  open_design_gaps: OpenGap[];
  spec_hash?: string;
}

function fieldMap(): FieldBinding[] {
  const f = (field: ObsField, o: Partial<FieldBinding>): FieldBinding => ({
    field, required_for_completeness: REQUIRED_FIELDS.includes(field),
    permitted_m7_evidence_classes: o.permitted_m7_evidence_classes ?? [], permitted_observation_sources: o.permitted_observation_sources ?? [],
    min_provenance: o.min_provenance ?? 'LOCAL_OBSERVATION', l4_required: o.l4_required ?? false, independent_observation_required: o.independent_observation_required ?? false,
    contradiction_blocks: true, stale_blocks: o.stale_blocks ?? REQUIRED_FIELDS.includes(field), environment_mismatch_blocks: true,
    may_remain_unknown: !REQUIRED_FIELDS.includes(field),
    status_if_missing: REQUIRED_FIELDS.includes(field) ? 'INCOMPLETE' : 'COMPLETE_UNSIGNED', status_if_contradictory: 'CONTRADICTED', status_if_insufficient_provenance: 'INCOMPLETE',
  });
  return [
    f('product', { permitted_m7_evidence_classes: ['EV-HOST-IDENTITY'], permitted_observation_sources: ['certification-attestation'], min_provenance: 'SELF_REPORTED' }),
    f('version', { permitted_m7_evidence_classes: ['EV-VERSION', 'EV-HOST-IDENTITY'], permitted_observation_sources: ['controlled-observation', 'independent-observer'], min_provenance: 'CONTROLLED_OBSERVATION' }),
    f('operating_system', { permitted_m7_evidence_classes: ['EV-PLATFORM'], permitted_observation_sources: ['controlled-observation'], min_provenance: 'CONTROLLED_OBSERVATION' }),
    f('os_version', { permitted_m7_evidence_classes: ['EV-PLATFORM'], permitted_observation_sources: ['controlled-observation'], min_provenance: 'LOCAL_OBSERVATION' }),
    f('architecture', { permitted_m7_evidence_classes: ['EV-ARCHITECTURE'], permitted_observation_sources: ['controlled-observation'], min_provenance: 'CONTROLLED_OBSERVATION' }),
    f('channel', { permitted_m7_evidence_classes: ['EV-CHANNEL'], permitted_observation_sources: ['controlled-install-attestation', 'independent-observer'], min_provenance: 'CONTROLLED_OBSERVATION', l4_required: true, independent_observation_required: true }),
    f('runtime_facet', { permitted_m7_evidence_classes: ['EV-TOOLCHAIN'], permitted_observation_sources: ['controlled-observation'], min_provenance: 'LOCAL_OBSERVATION' }),
    f('binary_sha256', { permitted_m7_evidence_classes: ['EV-BINARY-IDENTITY'], permitted_observation_sources: ['controlled-binary-read', 'independent-observer'], min_provenance: 'CONTROLLED_OBSERVATION', l4_required: true, independent_observation_required: true }),
  ];
}

function failureMatrix(): FailureRow[] {
  const r = (case_id: string, condition: string, attestation_state: AttestationStatus, m4_gate_result: M4GateResult, certification_consequence: 'NOT_CERTIFIED' | 'BLOCKED', remediation_possible: boolean, new_evidence_required: boolean): FailureRow => ({ case_id, condition, attestation_state, m4_gate_result, certification_consequence, remediation_possible, new_evidence_required });
  return [
    r('F-01', 'missing version', 'INCOMPLETE', 'BLOCKED', 'NOT_CERTIFIED', true, true),
    r('F-02', 'missing channel', 'INCOMPLETE', 'BLOCKED', 'NOT_CERTIFIED', true, true),
    r('F-03', 'missing binary hash', 'INCOMPLETE', 'BLOCKED', 'NOT_CERTIFIED', true, true),
    r('F-04', 'weak channel provenance (< CONTROLLED)', 'INCOMPLETE', 'BLOCKED', 'NOT_CERTIFIED', true, true),
    r('F-05', 'weak binary provenance (< CONTROLLED)', 'INCOMPLETE', 'BLOCKED', 'NOT_CERTIFIED', true, true),
    r('F-06', 'contradictory version', 'CONTRADICTED', 'FAIL', 'NOT_CERTIFIED', true, true),
    r('F-07', 'contradictory binary hash', 'CONTRADICTED', 'FAIL', 'NOT_CERTIFIED', true, true),
    r('F-08', 'contradictory channel', 'CONTRADICTED', 'FAIL', 'NOT_CERTIFIED', true, true),
    r('F-09', 'ambiguous installations', 'AMBIGUOUS', 'BLOCKED', 'NOT_CERTIFIED', true, true),
    r('F-10', 'stale evidence', 'EXPIRED', 'BLOCKED', 'NOT_CERTIFIED', true, true),
    r('F-11', 'revoked evidence', 'REVOKED', 'FAIL', 'NOT_CERTIFIED', false, true),
    r('F-12', 'superseded attestation', 'SUPERSEDED', 'FAIL', 'NOT_CERTIFIED', false, true),
    r('F-13', 'tampered attestation', 'TAMPERED', 'FAIL', 'NOT_CERTIFIED', false, true),
    r('F-14', 'environment mismatch (evidence from wrong env)', 'INCOMPLETE', 'BLOCKED', 'NOT_CERTIFIED', true, true),
    r('F-15', 'M9 L4 absent (cert env not independently isolated)', 'COMPLETE_UNSIGNED', 'BLOCKED', 'NOT_CERTIFIED', true, true),
    r('F-16', 'M9 L4 stale', 'COMPLETE_UNSIGNED', 'BLOCKED', 'NOT_CERTIFIED', true, true),
    r('F-17', 'M9 L4 revoked', 'COMPLETE_UNSIGNED', 'BLOCKED', 'NOT_CERTIFIED', true, true),
    r('F-18', 'M13 matrix cell missing', 'COMPLETE_UNSIGNED', 'FAIL', 'NOT_CERTIFIED', true, false),
    r('F-19', 'matrix cell already revoked', 'COMPLETE_UNSIGNED', 'BLOCKED', 'NOT_CERTIFIED', false, false),
    r('F-20', 'safety-critical capability unresolved', 'COMPLETE_UNSIGNED', 'FAIL', 'NOT_CERTIFIED', true, true),
    r('F-21', 'M8 execution evidence unavailable where required', 'COMPLETE_UNSIGNED', 'BLOCKED', 'NOT_CERTIFIED', true, true),
  ];
}

function threats(): ThreatRow[] {
  const t = (attack: string, required_control: string, failure_state: string): ThreatRow => ({ attack, required_control, failure_state, certification_blocked: true });
  return [
    t('evidence substitution', 'content-addressed hash chain (artifact→normalized→observation→attestation)', 'hash mismatch => BLOCKED'),
    t('evidence replay', 'freshness (expires_at) + environment_id binding + previous_attestation_hash', 'stale/replay => EXPIRED/BLOCKED'),
    t('stale evidence reuse', 'per-attempt freshness; no silent refresh', 'EXPIRED'),
    t('cross-environment replay', 'environment_id must match the cert env', 'environment mismatch => INCOMPLETE/BLOCKED'),
    t('hash substitution', 'canonical serialization + sha256 at every level', 'hash mismatch => BLOCKED'),
    t('observer impersonation', 'INDEPENDENT_OBSERVATION identity bound to the cert env', 'insufficient provenance => INCOMPLETE'),
    t('observer compromise', 'trust-plane separation; L4 independent isolation', 'contradiction/integrity failure => BLOCKED'),
    t('certification-environment compromise', 'M9 L4 independent verification of the env', 'L4 absent => BLOCKED'),
    t('installation confusion', 'exact installation_ref; no PATH/default/silent selection', 'AMBIGUOUS'),
    t('binary replacement after observation', 'binary hash freshness + env binding + re-observation', 'contradiction => CONTRADICTED'),
    t('channel switching after observation', 'channel freshness + controlled/independent re-observation', 'contradiction => CONTRADICTED'),
    t('metadata substitution', 'min provenance (channel/binary >= CONTROLLED); no weak-source acceptance', 'INSUFFICIENT_PROVENANCE => INCOMPLETE'),
    t('malicious registry reference', 'M6 signed, immutable, hash-chained registry', 'unsigned/unauthorized => rejected'),
    t('forged provenance', 'evidence hashes + independent observer identity', 'unverifiable provenance => BLOCKED'),
  ];
}

function fixtureSpecs(): FixtureSpec[] {
  const s = (id: string, name: string, st: FixtureSpec['expected_attestation_state']): FixtureSpec => ({ id, name, expected_attestation_state: st, label: 'SYNTHETIC_TEST_ONLY' });
  return [
    s('FX-01', 'complete valid identity evidence', 'COMPLETE_UNSIGNED'), s('FX-02', 'missing channel', 'INCOMPLETE'), s('FX-03', 'missing binary hash', 'INCOMPLETE'),
    s('FX-04', 'weak channel provenance', 'INCOMPLETE'), s('FX-05', 'weak binary provenance', 'INCOMPLETE'), s('FX-06', 'contradictory version', 'CONTRADICTED'),
    s('FX-07', 'contradictory binary', 'CONTRADICTED'), s('FX-08', 'contradictory channel', 'CONTRADICTED'), s('FX-09', 'ambiguous installations', 'AMBIGUOUS'),
    s('FX-10', 'stale evidence', 'EXPIRED'), s('FX-11', 'revoked evidence', 'REVOKED'), s('FX-12', 'superseded evidence', 'SUPERSEDED'),
    s('FX-13', 'tampered evidence', 'TAMPERED'), s('FX-14', 'environment mismatch', 'INCOMPLETE'), s('FX-15', 'M9 L4 absent', 'COMPLETE_UNSIGNED_BLOCKED_AT_M4'),
    s('FX-16', 'M9 L4 stale', 'COMPLETE_UNSIGNED_BLOCKED_AT_M4'), s('FX-17', 'M9 L4 revoked', 'COMPLETE_UNSIGNED_BLOCKED_AT_M4'), s('FX-18', 'exact matrix-cell mismatch', 'COMPLETE_UNSIGNED_BLOCKED_AT_M4'),
  ];
}

function openGaps(): OpenGap[] {
  const g = (id: string, question: string, closing: string): OpenGap => ({ id, question, status: 'OPEN_DESIGN_GAP', closing_evidence_required: closing });
  return [
    g('GAP-01', 'What concrete direct channel evidence source can satisfy >= CONTROLLED_OBSERVATION for Claude Code?', 'a machine-readable controlled-install attestation or an independent observer record of the installed channel; none proven'),
    g('GAP-02', 'What concrete binary-binding mechanism proves the exact certified executable without weak metadata?', 'exact-executable byte hash captured in an L4-isolated cert env of the certified installation; embedded version resource unproven (M18)'),
    g('GAP-03', 'How exactly does M6 signing bind the attestation to the eventual publication record?', 'a specified signature payload over {attestation_hash, publication proposal} and a binding record; undefined at M6 detail level'),
    g('GAP-04', 'What key-management lifecycle is required at the M6 boundary?', 'signing-key generation/rotation/revocation/storage lifecycle; out of scope for M0–M20'),
  ];
}

export function buildBindingSpec(): BindingSpec {
  const base: Omit<BindingSpec, 'spec_hash'> = {
    schema: 'dkskill.evidence_attestation_binding_spec/1', version: 1, design_only: true,
    objective: 'Define how an M7 evidence package becomes the authoritative observation source per M19 identity field, how provenance/freshness/contradictions propagate into the attestation, and the exact M4 gate that consumes a COMPLETE_UNSIGNED attestation — design only; no execution/certification/signing.',
    field_map: fieldMap(),
    provenance_rules: {
      ordering: 'SELF_REPORTED < LOCAL_OBSERVATION < CONTROLLED_OBSERVATION < INDEPENDENT_OBSERVATION < CERTIFICATION_ATTESTATION',
      min_per_field: 'channel + binary_sha256 require >= CONTROLLED_OBSERVATION; version/OS/architecture >= CONTROLLED_OBSERVATION; os_version/runtime >= LOCAL_OBSERVATION; product >= SELF_REPORTED',
      upgrade: 'strength MAY increase when a stronger observation AGREES on the same value',
      downgrade: 'strength NEVER decreases silently; a weaker observation cannot lower an established value',
      multiple_agreeing: 'strongest observation wins when all observed values are identical',
      conflicting_values: 'any divergent value contradicts REGARDLESS of strength (fail closed) => CONTRADICTED; a weak divergent observation DOES invalidate a stronger one',
      reuse_across_attempts: 'observations are NOT reusable across attempts unless fresh (expires_at) AND same environment_id',
      environment_participation: 'environment_id must match the certification environment; mismatched-env evidence does not count',
      evidence_hash_binding: 'each observation carries an evidence_hash; the attestation binds them via evidence_hashes and attestation_hash',
    },
    binary_binding: {
      authoritative: ['exact executable SHA-256 read (bytes only) from the certified installation inside an L4-isolated cert env (CONTROLLED/INDEPENDENT_OBSERVATION)'],
      supporting_only: ['package/archive hash', 'embedded version metadata (UNPROVEN)'],
      insufficient: ['filename', 'directory/path', 'package.json version', 'benchmark binary reference', 'registry metadata'],
      rule: 'binary_sha256 must identify the EXACT certified executable; supporting sources may corroborate but never substitute',
      open_gap: 'OPEN DESIGN GAP — an embedded version resource binding is unproven for Claude Code; the exact-byte-hash path exists but its authority depends on L4 cert-env control (see GAP-02)',
    },
    channel_binding: {
      design_candidates: [
        { candidate: 'controlled-install attestation (channel deliberately installed in the cert env)', acceptable_if: 'CONTROLLED_OBSERVATION recorded machine-readably' },
        { candidate: 'independent observer of the installed channel', acceptable_if: 'INDEPENDENT_OBSERVATION' },
      ],
      forbidden_inference: ['version', 'filename', 'path', 'OS', 'architecture', 'benchmark pin', 'registry profile', 'install date', 'history'],
      rule: 'channel must be DIRECTLY evidenced (>= CONTROLLED_OBSERVATION); SELF_REPORTED insufficient; never inferred',
      open_gap: 'OPEN DESIGN GAP — no concrete machine-readable channel evidence source is proven for Claude Code (see GAP-01)',
    },
    l4_relationship: {
      fields_dependent: 'authoritative channel + binary_sha256 depend on the cert environment being M9-L4 independently verified',
      freshness: 'L4 must be verified within the evidence validity window',
      environment_binding: 'L4 verification must be for the SAME environment_id as the observations',
      contradiction: 'a contradicted L4 result blocks the M4 gate',
      absent: 'L4 absent => M4 gate BLOCKED (observations not independently trustworthy)',
      stale: 'L4 stale => M4 gate BLOCKED',
      revoked: 'L4 revoked => M4 gate BLOCKED',
      environment_mismatch: 'L4 for a different env does not apply => BLOCKED',
      current_real_env: 'current real environment remains L0/UNVERIFIED and M8 remains EXECUTION_BLOCKED',
    },
    freshness_environment_rules: {
      expiration: 'expires_at <= now => EXPIRED',
      future_dated: 'observation_time/created_at in the future => rejected as invalid (field not OBSERVED) => INCOMPLETE',
      environment_mismatch: 'evidence environment_id != cert env => does not count => INCOMPLETE',
      copied_between_environments: 'treated as environment mismatch => INCOMPLETE',
      replay: 'freshness + previous_attestation_hash chain detect replay',
      previous_attestation_hash: 'chains attestations; a broken chain is rejected',
      supersession: 'supersession_reference => SUPERSEDED',
      revocation: 'revocation_reference => REVOKED',
      stale_plus_fresh: 'a stale observation for a REQUIRED field blocks (fail closed) even if a fresh one for another field exists',
    },
    contradiction_rules: [
      { contradiction: 'version A vs version B', result: 'CONTRADICTED' }, { contradiction: 'binary hash A vs B', result: 'CONTRADICTED' },
      { contradiction: 'channel A vs channel B', result: 'CONTRADICTED' }, { contradiction: 'architecture mismatch', result: 'CONTRADICTED' },
      { contradiction: 'OS mismatch', result: 'CONTRADICTED' }, { contradiction: 'environment mismatch (evidence from wrong env)', result: 'INCOMPLETE' },
      { contradiction: 'installation mismatch (multiple installs)', result: 'AMBIGUOUS' },
    ],
    m4_consumption_gate: {
      gate_id: 'CG-ATT (conceptual; design only)',
      requires: ['attestation == COMPLETE_UNSIGNED', 'all required-field provenance thresholds satisfied', 'no contradiction', 'no ambiguity', 'no expiration', 'no revocation', 'no supersession', 'not tampered', 'valid environment binding', 'valid evidence hash chain', 'exact M13 matrix-cell binding (non-revoked)', 'cert env M9-L4 verified', 'all required M4 certification gates satisfied', 'no unresolved safety-critical limitation', 'owner authorization where M4 requires it'],
      complete_unsigned_is_not_certified: true,
      transition: ['COMPLETE_UNSIGNED', 'M4 evaluation (CG-ATT + existing M4 gates)', 'certification decision (owner-reviewed)', 'M5 publication proposal (not applied)', 'M6 signing/governance (authorized signing)', 'immutable registry publication'],
    },
    m4_failure_matrix: failureMatrix(),
    hash_binding_model: {
      chain: ['M7 evidence artifact hash', 'M7 normalized evidence hash', 'M19 observation evidence_hash', 'M19 attestation_hash', 'M4 certification evidence reference'],
      canonical_serialization: 'project canonical JSON (sorted keys, no insignificant whitespace) + sha256:<hex>',
      algorithm: 'sha256', content_addressed: true,
      failure_modes: ['missing evidence => BLOCKED', 'unexpected evidence => BLOCKED', 'evidence substitution => hash mismatch => BLOCKED', 'hash mismatch at any level => BLOCKED'],
    },
    multiple_installation_model: {
      selection: 'the certification environment provisions exactly ONE intended installation; installation_ref names it',
      forbidden: 'no PATH guessing, no default-install selection, no silent selection, no version-only, no filename-only',
      ambiguity: 'if more than one installation is observed => AMBIGUOUS (blocked)',
      identification: 'M7 evidence identifies the selected installation via the environment provisioning record (no credentials exposed)',
    },
    observer_trust_boundary: [
      { class: 'local observer', sufficient_for: ['product (self)', 'os_version', 'runtime_facet (LOCAL)'] },
      { class: 'controlled observer', sufficient_for: ['version', 'operating_system', 'architecture', 'channel (min)', 'binary_sha256 (min)'] },
      { class: 'independent observer (M9 L4)', sufficient_for: ['channel (authoritative)', 'binary_sha256 (authoritative)'] },
      { class: 'certification environment', sufficient_for: ['environment binding', 'installation_ref'] },
      { class: 'M4 owner review', sufficient_for: ['certification decision authorization'] },
      { class: 'M6 signing authority', sufficient_for: ['authoritative publication signature (M20 signs nothing)'] },
    ],
    public_private_boundary: {
      public_product: ['observe safe local identity', 'accept explicit identity', 'remain UNKNOWN', 'resolve compatibility', 'fail closed when certification is absent'],
      certification_system: ['consume controlled evidence', 'consume independently verified evidence', 'bind exact identity', 'produce COMPLETE_UNSIGNED attestation', 'feed M4 evaluation'],
      signing_governance: ['M6 responsibility', 'M20 does not sign', 'M20 does not manage keys'],
    },
    security_review: threats(),
    fixture_specs: fixtureSpecs(),
    future_test_specs: [
      'evidence-to-field mapping (each of 8 fields)', 'provenance threshold enforcement (per field)', 'binary-binding authoritative/supporting/insufficient',
      'channel-binding candidates + forbidden inference', 'L4 dependency (absent/stale/revoked/mismatch)', 'freshness (expired/future-dated)',
      'environment binding (mismatch/copy)', 'contradiction handling (version/binary/channel/arch/OS)', 'multiple-installation ambiguity',
      'hash-chain integrity (substitution/mismatch)', 'M4 gate behavior across the failure matrix', 'M13 exact-cell binding (no inheritance)',
      'public/private boundary', 'secret exclusion', 'static no-execution/no-network/no-credential guarantees',
    ],
    open_design_gaps: openGaps(),
  };
  return { ...base, spec_hash: sha256(canonicalJson(base)) };
}

// ---- consistency validator (design self-check; not certification) -----------------------------------------
export function validateSpecConsistency(spec: BindingSpec): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const fields = spec.field_map.map((f) => f.field);
  for (const rf of REQUIRED_FIELDS) if (!fields.includes(rf)) issues.push(`missing required field ${rf}`);
  if (spec.field_map.length !== 8) issues.push('field_map must cover all 8 identity fields');
  for (const f of spec.field_map) {
    if (f.required_for_completeness !== REQUIRED_FIELDS.includes(f.field)) issues.push(`required flag wrong for ${f.field}`);
    if ((f.field === 'channel' || f.field === 'binary_sha256') && f.min_provenance !== 'CONTROLLED_OBSERVATION') issues.push(`${f.field} min provenance must be CONTROLLED_OBSERVATION`);
    for (const st of [f.status_if_missing, f.status_if_contradictory, f.status_if_insufficient_provenance]) if (!M19_STATES.includes(st)) issues.push(`invalid state ${st} for ${f.field}`);
  }
  if (spec.m4_failure_matrix.length < 21) issues.push('failure matrix must have >= 21 rows');
  for (const row of spec.m4_failure_matrix) {
    if (!M19_STATES.includes(row.attestation_state)) issues.push(`failure row ${row.case_id} uses non-M19 state ${row.attestation_state}`);
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(row.m4_gate_result)) issues.push(`failure row ${row.case_id} invalid gate result`);
    if (row.m4_gate_result === 'PASS') issues.push(`failure row ${row.case_id} must not PASS`);
    if (row.certification_consequence === ('CERTIFIED' as any)) issues.push(`failure row ${row.case_id} must not certify`);
  }
  for (const c of spec.contradiction_rules) if (!M19_STATES.includes(c.result)) issues.push(`contradiction rule uses non-M19 state ${c.result}`);
  if (!spec.m4_consumption_gate.complete_unsigned_is_not_certified) issues.push('COMPLETE_UNSIGNED must not equal CERTIFIED');
  if (spec.open_design_gaps.length < 4) issues.push('must preserve >= 4 open design gaps');
  if (spec.fixture_specs.length < 18) issues.push('must specify >= 18 fixtures');
  if (spec.fixture_specs.some((f) => f.label !== 'SYNTHETIC_TEST_ONLY')) issues.push('all fixtures must be SYNTHETIC_TEST_ONLY');
  if (spec.hash_binding_model.algorithm !== 'sha256') issues.push('hash algorithm must be sha256 (no new crypto)');
  return { ok: issues.length === 0, issues };
}
export function verifySpec(spec: BindingSpec): boolean { const { spec_hash, ...rest } = spec; return sha256(canonicalJson(rest)) === spec_hash; }
export function specHasSecret(spec: BindingSpec): boolean { return /(access_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6}|sk-[a-z0-9]{6}|password=\S)/i.test(canonicalJson(spec)); }
