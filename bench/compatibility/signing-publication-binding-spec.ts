// M21 — M6 Signing ↔ Publication Binding & Key-Management Lifecycle SPECIFICATION (DESIGN ONLY).
// Deterministic SPEC DATA + consistency validator. NOT runtime signing/key-management: it generates no keys, imports
// none, signs nothing, accesses no keychain/HSM/KMS/credentials/~/.claude, contacts no network, and mutates no
// registry. It preserves existing M5/M6 terminology, introduces no new governance state, and closes/refines ONLY
// GAP-03/GAP-04 (GAP-01/GAP-02 remain OPEN). A signature authenticates an exact governed publication payload; a valid
// signature may never be transplanted to another object/cell/registry/product/environment. Historical records are
// immutable; rotation/revocation never rewrite history.
import { sha256, canonicalJson } from '../src/canonical.ts';

// Existing vocabularies (preserved, not redefined).
export const M6_GOVERNANCE_STATES = ['REQUESTED', 'VALIDATING', 'APPROVED', 'APPLYING', 'PUBLISHED', 'REJECTED', 'FAILED', 'REVOKED', 'SUPERSEDED', 'ROLLED_BACK'] as const;
export const M5_PUBLICATION_STATES = ['DRAFT', 'REVIEW_REQUIRED', 'APPROVED_FOR_PUBLICATION', 'PUBLISHED', 'REJECTED', 'REVOKED', 'SUPERSEDED'] as const;
export const KEY_LIFECYCLE_STATES = ['PROPOSED', 'GENERATED', 'REGISTERED', 'ACTIVE', 'RETIRED', 'REVOKED', 'COMPROMISED'] as const;
export const VERIFICATION_LAYERS = ['canonical hash integrity', 'signature cryptographic validity', 'key validity', 'signer authorization', 'publication authorization', 'attestation validity', 'certification validity', 'matrix-cell validity', 'registry precondition', 'registry resulting-state consistency'] as const;

export type GapStatus = 'OPEN_DESIGN_GAP' | 'REFINED' | 'PARTIALLY_DEFINED' | 'OPEN_DESIGN_DECISION';

export interface GraphObject { object: string; canonical_identifier: string; content_hash: string; predecessor: string | null; successor: string | null; immutable_fields: string[]; mutable_lifecycle_metadata: string[]; trust_boundary: string; authority: string; publication_state_ref: string }
export interface BindingRule { from: string; to: string; binds: string[]; failure_behavior: Record<string, string> }
export interface KeyState { state: string; allowed_predecessor: string[]; allowed_successor: string[]; authorization_requirement: string; publication_impact: string; prior_signatures_remain_valid: boolean; new_signatures_permitted: boolean }
export interface VerificationLayer { order: number; layer: string; fail_closed: string; lower_success_implies_higher: false }
export interface ThreatRow { attack: string; binding_control: string; detection: string; fail_closed_state: string; history_intact: true }
export interface FixtureSpec { id: string; name: string; expected: string; label: 'SYNTHETIC_TEST_ONLY' }
export interface OpenGap { id: string; question: string; status: GapStatus; note: string }

export interface SigningBindingSpec {
  schema: 'dkskill.signing_publication_binding_spec/1';
  version: 1;
  design_only: true;
  objective: string;
  object_graph: GraphObject[];
  signature_payload: { binds: string[]; prevents: string[]; canonical_serialization: string; algorithm_status: GapStatus };
  attestation_certification_binding: BindingRule;
  certification_publication_binding: BindingRule;
  publication_authorization_binding: BindingRule;
  signer_identity_model: { role: string; distinct_from: string[]; authority: string }[];
  key_identity_model: string[];
  key_lifecycle: KeyState[];
  key_rotation: Record<string, string>;
  key_revocation: { authority: string; distinct_from: string[]; rules: Record<string, string> };
  compromised_key: Record<string, string>;
  signed_publication_record: { binds: string[]; separate_verification_concerns: string[] };
  registry_atomicity: { transaction_boundary: string[]; on_any_failure: 'NO_REGISTRY_MUTATION'; protections: string[] };
  immutable_history: string[];
  trust_root_model: { authenticates: string; key_trust: string; rotation_continuity: string; revocation: string; governance: string; bootstrap: GapStatus };
  verification_layers: VerificationLayer[];
  replay_protection: { vector: string; bound_identities: string[] }[];
  m13_matrix_binding: { rule: string; reject_if_cell_differs_across: string[]; no_inheritance: true };
  m5_lifecycle: { states: string[]; signable: string[]; publishable: string[]; supersedable: string[]; revocable: string[] };
  m6_lifecycle: { states: string[]; forbidden_transitions: { from: string; to: string; reason: string }[] };
  security_threat_model: ThreatRow[];
  privacy_secret_boundary: { forbidden: string[]; assertion: 'NO_PRIVATE_KEY_MATERIAL_IN_PUBLIC_ARTIFACTS' };
  fixture_specs: FixtureSpec[];
  future_test_specs: string[];
  gap03_status: GapStatus;
  gap04_status: GapStatus;
  preserved_open_gaps: OpenGap[];
  newly_discovered_gaps: OpenGap[];
  spec_hash?: string;
}

function objectGraph(): GraphObject[] {
  const o = (object: string, id: string, pred: string | null, succ: string | null, immutable: string[], mutable: string[], boundary: string, authority: string, pubRef: string): GraphObject =>
    ({ object, canonical_identifier: id, content_hash: `sha256(canonical(${object}))`, predecessor: pred, successor: succ, immutable_fields: immutable, mutable_lifecycle_metadata: mutable, trust_boundary: boundary, authority, publication_state_ref: pubRef });
  return [
    o('identity attestation', 'attestation_id', null, 'certification_result', ['identity tuple', 'observation_sources', 'evidence_hashes', 'attestation_hash'], ['attestation_status'], 'certification system', 'certification env + independent observer', 'n/a'),
    o('M4 certification result', 'run_id', 'attestation_hash', 'certification_profile', ['gate_results', 'attestation_hash ref', 'final_decision'], ['owner_review'], 'certification system', 'M4 + owner review', 'n/a'),
    o('M5 certification profile', 'profile_id', 'certification_result_hash', 'publication_proposal', ['identity', 'certification_result_ref', 'artifact_hash'], ['publication_status'], 'publication layer', 'M5', 'M5 lifecycle'),
    o('M5 publication proposal', 'proposal_id', 'profile_hash', 'authorization', ['source_profile_id', 'certification_result ref', 'attestation ref', 'matrix cell', 'proposed delta', 'expected registry precondition', 'proposal_hash'], ['publication_state'], 'publication layer', 'M5', 'M5 lifecycle'),
    o('M6 authorization', 'authorization_id', 'proposal_hash', 'signature_payload', ['authorization_payload_hash', 'authorized signer role', 'authorized matrix cell', 'expected registry precondition'], ['authorization_state'], 'governance', 'M6 owner authority', 'M6 lifecycle'),
    o('M6 signature payload', 'payload_hash', 'authorization_payload_hash', 'publication_record', ['all bound hashes', 'signer identity', 'key identity', 'schema versions', 'timestamp'], [], 'governance', 'M6 signing authority', 'M6 lifecycle'),
    o('M6 publication record', 'publication_id', 'payload_hash', 'registry_version', ['signature', 'signer', 'key', 'authorization', 'attestation', 'certification', 'proposal', 'matrix cell', 'registry precondition', 'resulting state', 'record_hash', 'previous_record_hash'], [], 'governance', 'M6', 'M6 lifecycle'),
    o('registry entry/version', 'registry_version', 'publication_id', 'matrix_cell', ['registry hash', 'entry', 'previous registry hash'], [], 'registry', 'M6 governance', 'PUBLISHED'),
    o('M13 matrix cell', 'platform×arch×channel×version', 'registry_version', null, ['cert_state', 'profile_id', 'binary_sha256'], [], 'compatibility matrix', 'M13 (derived)', 'CERTIFIED (only when published)'),
  ];
}

function keyLifecycle(): KeyState[] {
  const k = (state: string, pred: string[], succ: string[], auth: string, impact: string, priorValid: boolean, newSign: boolean): KeyState =>
    ({ state, allowed_predecessor: pred, allowed_successor: succ, authorization_requirement: auth, publication_impact: impact, prior_signatures_remain_valid: priorValid, new_signatures_permitted: newSign });
  return [
    k('PROPOSED', [], ['GENERATED', 'REJECTED'], 'owner proposal', 'none', false, false),
    k('GENERATED', ['PROPOSED'], ['REGISTERED'], 'key generation ceremony (out of scope; OPEN_DESIGN_DECISION)', 'none', false, false),
    k('REGISTERED', ['GENERATED'], ['ACTIVE'], 'trust-root registration', 'recognized by trust root', false, false),
    k('ACTIVE', ['REGISTERED'], ['RETIRED', 'REVOKED', 'COMPROMISED'], 'authorized signer role', 'may sign publications', true, true),
    k('RETIRED', ['ACTIVE'], ['REVOKED'], 'planned rotation', 'no new signing; prior signatures remain verifiable', true, false),
    k('REVOKED', ['ACTIVE', 'RETIRED', 'COMPROMISED'], [], 'revocation authority', 'no new signing; prior-signature validity per revocation effective time', true, false),
    k('COMPROMISED', ['ACTIVE'], ['REVOKED'], 'incident authority', 'stop new signing; signatures after earliest-trustworthy-boundary suspect', false, false),
  ];
}

function threats(): ThreatRow[] {
  const t = (attack: string, binding_control: string, detection: string, fail: string): ThreatRow => ({ attack, binding_control, detection, fail_closed_state: fail, history_intact: true });
  return [
    t('attestation substitution', 'signature payload binds attestation_hash', 'hash mismatch', 'REJECTED'),
    t('certification substitution', 'binds certification_result_hash', 'hash mismatch', 'REJECTED'),
    t('proposal substitution', 'binds publication_proposal_hash', 'hash mismatch', 'REJECTED'),
    t('authorization substitution', 'authorization_payload_hash binds exact proposal', 'hash mismatch', 'REJECTED'),
    t('signature replay', 'payload binds registry version + matrix cell + product + environment', 'replay across any bound identity fails', 'REJECTED'),
    t('wrong matrix-cell publication', 'exact cell bound across all objects', 'cell mismatch', 'REJECTED'),
    t('cross-registry replay', 'binds registry identity + version', 'registry mismatch', 'REJECTED'),
    t('cross-product replay', 'binds product identity', 'product mismatch', 'REJECTED'),
    t('stale authorization', 'authorization expiration + precondition', 'expired/mismatched', 'BLOCKED'),
    t('revoked-key signing', 'key validity layer', 'key REVOKED at signing time', 'REJECTED'),
    t('compromised signing key', 'earliest-trustworthy-boundary + revoke + replace', 'incident detection', 'BLOCKED (supersede/revoke affected)'),
    t('signer impersonation', 'signer authorization layer + trust root', 'unauthorized signer', 'REJECTED'),
    t('trust-root substitution', 'governed trust-root; bootstrap OPEN_DESIGN_GAP', 'root not recognized', 'REJECTED'),
    t('key-rotation confusion', 'distinct key_id + trusted successor; old signatures independently verifiable', 'wrong key_id', 'REJECTED'),
    t('publication rollback attack', 'immutable history; rollback creates explicit reversal record', 'history mutation attempt', 'REJECTED'),
    t('concurrent stale proposal', 'compare-and-swap registry precondition', 'stale registry hash', 'BLOCKED (no mutation)'),
    t('registry precondition bypass', 'atomic precondition validation before apply', 'precondition mismatch', 'NO_REGISTRY_MUTATION'),
    t('historical-record mutation', 'immutability + hash chain', 'chain break', 'REJECTED'),
    t('signature payload ambiguity', 'payload binds ALL identities/hashes + schema versions', 'ambiguous payload', 'REJECTED'),
    t('canonicalization mismatch', 'single canonical serialization + version', 'canonical hash mismatch', 'REJECTED'),
  ];
}

function fixtures(): FixtureSpec[] {
  const names = ['valid complete binding', 'attestation mismatch', 'certification mismatch', 'proposal mismatch', 'authorization mismatch', 'matrix-cell mismatch', 'stale authorization', 'revoked key', 'retired key', 'compromised key', 'key rotation', 'signature replay', 'cross-registry replay', 'cross-product replay', 'registry precondition mismatch', 'concurrent stale proposal', 'trust-root mismatch', 'canonicalization mismatch', 'historical supersession', 'historical revocation'];
  return names.map((name, i) => ({ id: `SX-${String(i + 1).padStart(2, '0')}`, name, expected: i === 0 ? 'binding valid (still unsigned; M21 signs nothing)' : 'REJECTED/BLOCKED fail-closed', label: 'SYNTHETIC_TEST_ONLY' }));
}

export function buildSigningBindingSpec(): SigningBindingSpec {
  const br = (from: string, to: string, binds: string[], failure: Record<string, string>): BindingRule => ({ from, to, binds, failure_behavior: failure });
  const base: Omit<SigningBindingSpec, 'spec_hash'> = {
    schema: 'dkskill.signing_publication_binding_spec/1', version: 1, design_only: true,
    objective: 'Define the exact conceptual chain from a COMPLETE_UNSIGNED attestation through M4/M5/M6 signing/governance to an immutable registry update bound to exactly one M13 matrix cell, and the signing-key lifecycle — without signing, generating keys, or mutating the registry. Closes/refines GAP-03/GAP-04 only.',
    object_graph: objectGraph(),
    signature_payload: {
      binds: ['attestation_hash', 'certification_result_hash', 'publication_proposal_hash', 'exact M13 matrix-cell identity', 'registry identity', 'registry version/update identity', 'publication record identity', 'signer identity', 'signing-key identity/version', 'authorization identity/hash', 'canonical serialization version', 'schema versions', 'timestamp/freshness'],
      prevents: ['signing one attestation while publishing another', 'signing one matrix cell while publishing another', 'signing one proposal while applying another', 'signature reuse across registry versions', 'signature reuse after supersession', 'cross-product replay', 'cross-environment replay'],
      canonical_serialization: 'project canonical JSON + sha256:<hex> (single version)', algorithm_status: 'OPEN_DESIGN_DECISION',
    },
    attestation_certification_binding: br('M4 certification', 'identity attestation', ['exact attestation_hash reference'], { mismatch: 'REJECTED', missing: 'BLOCKED', superseded: 'REJECTED', revoked: 'REJECTED', tampered: 'REJECTED', replay: 'REJECTED', latest_attestation: 'FORBIDDEN — reference must be exact, never "latest"' }),
    certification_publication_binding: br('M5 publication proposal', 'M4 certification result', ['certification_result_hash', 'attestation_hash', 'exact profile identity', 'exact matrix cell', 'compatibility profile identity/version', 'proposed registry delta', 'expected pre-publication registry state', 'publication proposal identity'], { different_certification: 'REJECTED', different_attestation: 'REJECTED', cell_differs: 'REJECTED', precondition_differs: 'BLOCKED', profile_hash_differs: 'REJECTED', stale: 'BLOCKED', superseded: 'REJECTED', revoked: 'REJECTED' }),
    publication_authorization_binding: br('M6 authorization', 'M5 publication proposal', ['authorization_payload_hash over exact proposal', 'proposal hash', 'authorized matrix cell', 'authorized registry version/precondition', 'authorized signer role', 'authorization expiration'], { proposal_b_with_auth_a: 'REJECTED', wildcard: 'FORBIDDEN', latest_proposal: 'FORBIDDEN', implicit_inheritance: 'FORBIDDEN', expired: 'BLOCKED', revoked: 'REJECTED', replay: 'REJECTED' }),
    signer_identity_model: [
      { role: 'human owner/approver', distinct_from: ['signing authority', 'signing key', 'trust root', 'publication system'], authority: 'approves publication per existing M6 governance (OPEN GAP if M6 underspecifies)' },
      { role: 'signing authority', distinct_from: ['human owner', 'signing key', 'trust root'], authority: 'holds authorized signer role' },
      { role: 'signing key', distinct_from: ['signer', 'trust root'], authority: 'produces the signature (no private material in artifacts)' },
      { role: 'trust root', distinct_from: ['signing key', 'signer'], authority: 'authenticates signer keys' },
      { role: 'publication system', distinct_from: ['signer', 'trust root'], authority: 'applies validated, signed, authorized updates only' },
    ],
    key_identity_model: ['key_id', 'signer identity', 'algorithm', 'public-key fingerprint', 'creation time', 'activation time', 'expiration time', 'status', 'predecessor key', 'successor key', 'trust-root reference'],
    key_lifecycle: keyLifecycle(),
    key_rotation: { distinct_key_id: 'new key has a distinct key_id', successor_trust: 'trust root recognizes the authorized successor', old_signatures: 'remain independently verifiable', old_key_after_retirement: 'cannot sign', historical_records: 'unchanged (immutable)', registry_history: 'immutable', auditable: 'key transition is auditable', trust_root_continuity: 'OPEN_DESIGN_GAP if undefined by M6' },
    key_revocation: { authority: 'revocation authority (M6/owner)', distinct_from: ['ARTIFACT REVOKED', 'PROFILE REVOKED', 'ATTESTATION REVOKED', 'REGISTRY ENTRY REVOKED'], rules: { effective_time: 'recorded', affected_key_id: 'recorded', affected_signatures: 'identified', historical_publication: 'remains valid if before effective time (policy per trust root)', future_publication: 'blocked', registry_response: 'no historical mutation; explicit records', profile_response: 'unaffected unless separately revoked' } },
    compromised_key: { stop_new_signing: 'immediate', identify_affected_signatures: 'by key_id + time', earliest_trustworthy_boundary: 'determined by incident authority', revoke_key: 'yes', replacement_key: 'new distinct key registered', assess_historical: 'records after boundary are suspect', supersede_or_revoke_affected: 'as required', preserve_audit: 'immutable history preserved', production_recovery_policy: 'OPEN_DESIGN_GAP — not invented for existing data' },
    signed_publication_record: {
      binds: ['signature payload', 'signature', 'signer identity', 'key identity', 'authorization', 'attestation', 'certification result', 'publication proposal', 'matrix cell', 'registry precondition', 'registry resulting state', 'publication timestamp', 'schema versions'],
      separate_verification_concerns: ['integrity verification', 'signer authorization', 'key validity', 'publication authorization', 'certification validity'],
    },
    registry_atomicity: {
      transaction_boundary: ['proposal validated', 'authorization validated', 'signature validated', 'registry precondition validated', 'publication applied', 'resulting registry hash recorded'],
      on_any_failure: 'NO_REGISTRY_MUTATION',
      protections: ['concurrent proposals (compare-and-swap)', 'stale proposals (precondition hash)', 'replayed signatures (bound identities)', 'duplicate publication (publication_id uniqueness)', 'wrong registry version (precondition)', 'wrong matrix cell (exact cell)', 'partial application (all-or-nothing)'],
    },
    immutable_history: ['old attestation→certification→proposal→publication→registry state remain auditable', 'supersession creates a NEW record', 'revocation never rewrites history', 'key rotation never rewrites historical signatures', 'no in-place mutation of historical certification evidence'],
    trust_root_model: { authenticates: 'authorized signer keys', key_trust: 'a key becomes trusted via trust-root registration', rotation_continuity: 'trust root recognizes authorized successors', revocation: 'revoked keys cease to be trusted', governance: 'trust-root changes are governed (owner)', bootstrap: 'OPEN_DESIGN_GAP' },
    verification_layers: VERIFICATION_LAYERS.map((layer, i) => ({ order: i + 1, layer, fail_closed: `layer ${i + 1} failure => REJECTED/BLOCKED; never proceeds`, lower_success_implies_higher: false })),
    replay_protection: [
      { vector: 'signature replay', bound_identities: ['payload_hash', 'registry version', 'matrix cell', 'product', 'environment'] },
      { vector: 'publication replay', bound_identities: ['publication_id', 'registry precondition'] },
      { vector: 'authorization replay', bound_identities: ['authorization_payload_hash', 'proposal hash', 'expiration'] },
      { vector: 'attestation replay', bound_identities: ['attestation_hash', 'environment_id', 'freshness'] },
      { vector: 'cross-registry replay', bound_identities: ['registry identity', 'registry version'] },
      { vector: 'cross-product replay', bound_identities: ['product identity'] },
      { vector: 'cross-cell replay', bound_identities: ['exact matrix cell'] },
      { vector: 'cross-environment replay', bound_identities: ['environment_id'] },
      { vector: 'superseded-record replay', bound_identities: ['previous_record_hash', 'supersession reference'] },
    ],
    m13_matrix_binding: { rule: 'every publication identifies exactly platform × architecture × channel × version (+ runtime facet where applicable)', reject_if_cell_differs_across: ['attestation', 'certification', 'proposal', 'signature payload', 'publication record', 'registry entry'], no_inheritance: true },
    m5_lifecycle: { states: [...M5_PUBLICATION_STATES], signable: ['APPROVED_FOR_PUBLICATION'], publishable: ['APPROVED_FOR_PUBLICATION'], supersedable: ['PUBLISHED'], revocable: ['PUBLISHED', 'APPROVED_FOR_PUBLICATION'] },
    m6_lifecycle: { states: [...M6_GOVERNANCE_STATES], forbidden_transitions: [
      { from: 'REQUESTED', to: 'PUBLISHED', reason: 'must pass VALIDATING + APPROVED + APPLYING with valid signature' },
      { from: 'VALIDATING', to: 'APPLYING', reason: 'requires APPROVED (authorization + signature) first' },
      { from: 'REJECTED', to: 'PUBLISHED', reason: 'rejected proposals cannot publish' },
      { from: 'PUBLISHED', to: 'APPLYING', reason: 'no re-apply; supersession creates a new record' },
    ] },
    security_threat_model: threats(),
    privacy_secret_boundary: { forbidden: ['private keys', 'credentials', 'OAuth tokens', 'cookies', 'API keys', 'user files', '~/.claude contents', 'secrets', 'environment secrets'], assertion: 'NO_PRIVATE_KEY_MATERIAL_IN_PUBLIC_ARTIFACTS' },
    fixture_specs: fixtures(),
    future_test_specs: ['attestation binding', 'certification binding', 'proposal binding', 'authorization binding', 'signature payload determinism', 'key identity validation', 'key lifecycle transitions', 'key rotation', 'key revocation', 'compromised-key handling', 'trust-root validation', 'replay protection', 'matrix-cell exactness', 'registry precondition', 'immutable history', 'publication atomicity', 'secret exclusion', 'static no-execution/no-network/no-real-key guarantees'],
    gap03_status: 'REFINED',
    gap04_status: 'PARTIALLY_DEFINED',
    preserved_open_gaps: [
      { id: 'GAP-01', question: 'direct Claude Code channel evidence source', status: 'OPEN_DESIGN_GAP', note: 'unchanged by M21' },
      { id: 'GAP-02', question: 'exact certified-executable binary-binding mechanism', status: 'OPEN_DESIGN_GAP', note: 'unchanged by M21' },
    ],
    newly_discovered_gaps: [
      { id: 'GAP-03R', question: 'M6 signature payload field contract completeness (does M6 define every bound field?)', status: 'OPEN_DESIGN_DECISION', note: 'signature payload contract specified; any M6-undefined field is an owner decision' },
      { id: 'GAP-04R-ALGO', question: 'signing algorithm selection (not frozen by the project)', status: 'OPEN_DESIGN_DECISION', note: 'no algorithm inferred' },
      { id: 'GAP-04R-ROOT', question: 'trust-root bootstrap (how initial trust is established)', status: 'OPEN_DESIGN_GAP', note: 'requires owner decision' },
      { id: 'GAP-04R-STORE', question: 'key-storage provider (HSM/KMS/other)', status: 'OPEN_DESIGN_DECISION', note: 'no provider chosen' },
      { id: 'GAP-04R-RECOVERY', question: 'compromised-key recovery policy for existing production data', status: 'OPEN_DESIGN_GAP', note: 'not invented; none exists yet' },
    ],
  };
  return { ...base, spec_hash: sha256(canonicalJson(base)) };
}

// ---- consistency validator (design self-check) ------------------------------------------------------------
export function validateSigningSpec(spec: SigningBindingSpec): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (spec.object_graph.length !== 9) issues.push('object graph must have 9 objects');
  if (spec.verification_layers.length !== 10) issues.push('must have 10 verification layers');
  if (spec.verification_layers.some((l, i) => l.order !== i + 1 || l.lower_success_implies_higher !== false)) issues.push('verification layers must be ordered and non-implying');
  if (spec.key_lifecycle.length !== 7) issues.push('key lifecycle must have 7 states');
  const kStates = spec.key_lifecycle.map((k) => k.state);
  for (const s of KEY_LIFECYCLE_STATES) if (!kStates.includes(s)) issues.push(`missing key state ${s}`);
  for (const s of M6_GOVERNANCE_STATES) if (!spec.m6_lifecycle.states.includes(s)) issues.push(`missing M6 state ${s} (must preserve terminology)`);
  for (const s of M5_PUBLICATION_STATES) if (!spec.m5_lifecycle.states.includes(s)) issues.push(`missing M5 state ${s}`);
  if (spec.security_threat_model.length < 20) issues.push('threat model must have >= 20 threats');
  if (spec.security_threat_model.some((t) => t.history_intact !== true)) issues.push('every threat must preserve history');
  if (spec.fixture_specs.length !== 20) issues.push('must specify 20 fixtures');
  if (spec.fixture_specs.some((f) => f.label !== 'SYNTHETIC_TEST_ONLY')) issues.push('all fixtures SYNTHETIC_TEST_ONLY');
  if (!spec.preserved_open_gaps.some((g) => g.id === 'GAP-01' && g.status === 'OPEN_DESIGN_GAP')) issues.push('GAP-01 must remain OPEN');
  if (!spec.preserved_open_gaps.some((g) => g.id === 'GAP-02' && g.status === 'OPEN_DESIGN_GAP')) issues.push('GAP-02 must remain OPEN');
  if (spec.registry_atomicity.on_any_failure !== 'NO_REGISTRY_MUTATION') issues.push('atomicity must be NO_REGISTRY_MUTATION on failure');
  if (spec.privacy_secret_boundary.assertion !== 'NO_PRIVATE_KEY_MATERIAL_IN_PUBLIC_ARTIFACTS') issues.push('missing private-key-material assertion');
  if (!spec.m13_matrix_binding.no_inheritance) issues.push('matrix binding must forbid inheritance');
  return { ok: issues.length === 0, issues };
}
export function verifySpec(spec: SigningBindingSpec): boolean { const { spec_hash, ...rest } = spec; return sha256(canonicalJson(rest)) === spec_hash; }
export function specHasSecret(spec: SigningBindingSpec): boolean { return /(access_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6}|sk-[a-z0-9]{6}|password=\S|private[_-]?key\s*[:=]\s*['\"]?[A-Za-z0-9+/=]{16})/i.test(canonicalJson(spec)); }
