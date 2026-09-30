// M22 — End-to-End Certification Governance State Machine & Gap-Closure Prerequisites SPECIFICATION (DESIGN ONLY).
// Deterministic SPEC DATA + consistency validator. NOT runtime certification: no Claude execution, no authentication,
// no ~/.claude / credential access, no network, no key generation, no signing, no registry mutation. It assembles
// M19/M20/M21 into ONE normative state machine, preserves M4/M5/M6/M19 terminology (no new state), and NEVER converts
// an OPEN design gap into an assumption. Unknown stays unknown; unverified stays unverified; blocked stays blocked;
// synthetic stays synthetic; historical records stay immutable. The project remains NOT_READY / certified count 0.
import { sha256, canonicalJson } from '../src/canonical.ts';

export type Readiness = 'READY' | 'NOT_READY' | 'BLOCKED' | 'UNKNOWN';
export type GapStatus = 'OPEN_DESIGN_GAP' | 'OPEN_OWNER_DECISION' | 'REFINED' | 'PARTIALLY_DEFINED';
export type CandidateClass = 'PROVEN' | 'UNPROVEN' | 'INSUFFICIENT' | 'REJECTED' | 'AUTHORITATIVE' | 'SUPPORTING';

export const MAIN_STATES = ['IDENTITY_EVIDENCE', 'ATTESTATION_INCOMPLETE', 'ATTESTATION_COMPLETE_UNSIGNED', 'M4_EVALUATION', 'CERTIFICATION_DECISION', 'M5_PUBLICATION_PROPOSAL', 'M6_AUTHORIZATION', 'SIGNATURE_VALIDATION', 'REGISTRY_PRECONDITION_VALIDATION', 'PUBLICATION', 'M13_CELL_CERTIFIED'] as const;
export const TERMINAL_STATES = ['CONTRADICTED', 'AMBIGUOUS', 'EXPIRED', 'REVOKED', 'SUPERSEDED', 'TAMPERED', 'NOT_CERTIFIED', 'REJECTED', 'FAILED', 'ROLLED_BACK', 'BLOCKED'] as const;
export const READINESS_COMPONENTS = ['IDENTITY_READY', 'EVIDENCE_READY', 'M9_L4_READY', 'M4_READY', 'M5_READY', 'M6_AUTH_READY', 'SIGNING_READY', 'REGISTRY_READY'] as const;

export interface StateNode {
  state: string;
  entry_conditions: string[];
  required_evidence: string[];
  required_hashes: string[];
  required_authority: string;
  allowed_transitions: string[];
  forbidden_transitions: string[];
  terminal: boolean;
  registry_mutation_possible: boolean;
  certification_exists: boolean;
  publication_exists: boolean;
}
export interface PreconditionRow { id: string; precondition: string; pass: string; fail: string; blocked: string; resulting_state: string; remediation: string; fresh_evidence_required: boolean }
export interface GapAssessment { id: string; question: string; status: GapStatus; concrete_prerequisites: string[]; candidates: { candidate: string; classification: CandidateClass }[]; authoritative_finding: string }
export interface ReadinessRow { component: string; status: Readiness; reason: string }
export interface OwnerDecision { id: string; decision_required: string; why: string; current_status: GapStatus; options: string[]; prohibited_inference: string; evidence_needed: string; owner_authority: string }
export interface RecoveryRow { condition: string; state: string; block_point: string; remediation: string; fresh_evidence_required: boolean; history_intact: true }
export interface ThreatRow { threat: string; control: string; failure_state: string; certification_blocked: true }
export interface FixtureSpec { id: string; name: string; kind: 'POSITIVE' | 'NEGATIVE'; expected: string; label: 'SYNTHETIC_TEST_ONLY' }

export interface GovernanceStateMachineSpec {
  schema: 'dkskill.certification_governance_state_machine_spec/1';
  version: 1;
  design_only: true;
  objective: string;
  state_machine: StateNode[];
  terminal_states: string[];
  precondition_table: PreconditionRow[];
  complete_unsigned_gate: { conditions: string[]; complete_unsigned_is_not_certified: true; authorizes: string[] };
  m4_gate: { requires: string[]; no_real_certification: true };
  m5_gate: { binds: string[]; fail_on: string[] };
  m6_gate: { binds: string[]; no_signing: true };
  signature_boundary: { binds: string[]; algorithm_status: GapStatus };
  registry_mutation_boundary: { only_after: string[]; otherwise: 'NO_REGISTRY_MUTATION' };
  m13_cell_rule: { exact: string; no: string[]; every_object_same_cell: true };
  gap_assessments: GapAssessment[];
  readiness_vector: ReadinessRow[];
  overall_readiness: Readiness;
  universal_platform_readiness: { per_cell: string; no_inference: true; certified_count: 0 };
  owner_decision_register: OwnerDecision[];
  certification_activation_prerequisites: { requirement: string; met: false }[];
  activation_all_met: false;
  first_certification_safety_boundary: string[];
  failure_recovery_matrix: RecoveryRow[];
  synthetic_e2e_fixture: { positive: FixtureSpec; negatives: FixtureSpec[] };
  security_review: ThreatRow[];
  future_test_specs: string[];
  open_design_gaps: { id: string; status: GapStatus }[];
  spec_hash?: string;
}

function stateMachine(): StateNode[] {
  const s = (state: string, o: Partial<StateNode>): StateNode => ({
    state, entry_conditions: o.entry_conditions ?? [], required_evidence: o.required_evidence ?? [], required_hashes: o.required_hashes ?? [],
    required_authority: o.required_authority ?? 'certification system', allowed_transitions: o.allowed_transitions ?? [], forbidden_transitions: o.forbidden_transitions ?? [],
    terminal: o.terminal ?? false, registry_mutation_possible: o.registry_mutation_possible ?? false, certification_exists: o.certification_exists ?? false, publication_exists: o.publication_exists ?? false,
  });
  return [
    s('IDENTITY_EVIDENCE', { entry_conditions: ['M7 evidence acquired in an L4 cert env'], required_evidence: ['per-field observations'], required_hashes: ['evidence_hash'], allowed_transitions: ['ATTESTATION_INCOMPLETE', 'ATTESTATION_COMPLETE_UNSIGNED', 'CONTRADICTED', 'AMBIGUOUS'], forbidden_transitions: ['M13_CELL_CERTIFIED'] }),
    s('ATTESTATION_INCOMPLETE', { entry_conditions: ['a required field not authoritatively OBSERVED'], terminal: true, allowed_transitions: ['IDENTITY_EVIDENCE (with fresh evidence)'] }),
    s('ATTESTATION_COMPLETE_UNSIGNED', { entry_conditions: ['all required fields OBSERVED at threshold', 'no contradiction/ambiguity/expiry/revocation/supersession/tamper'], required_hashes: ['attestation_hash'], allowed_transitions: ['M4_EVALUATION'], forbidden_transitions: ['PUBLICATION', 'M13_CELL_CERTIFIED', 'SIGNATURE_VALIDATION'] }),
    s('M4_EVALUATION', { entry_conditions: ['CG-ATT preconditions', 'M9 L4 verified', 'all mandatory M4 gates evaluable'], required_hashes: ['attestation_hash'], required_authority: 'M4 + owner review', allowed_transitions: ['CERTIFICATION_DECISION', 'NOT_CERTIFIED', 'BLOCKED', 'FAILED'] }),
    s('CERTIFICATION_DECISION', { entry_conditions: ['all mandatory M4 gates PASS', 'owner authorization'], required_hashes: ['certification_result_hash'], required_authority: 'M4 owner', certification_exists: true, allowed_transitions: ['M5_PUBLICATION_PROPOSAL', 'NOT_CERTIFIED'], forbidden_transitions: ['PUBLICATION (without M5/M6)'] }),
    s('M5_PUBLICATION_PROPOSAL', { entry_conditions: ['exact certification + attestation + profile + cell bound'], required_hashes: ['proposal_hash', 'profile_hash'], required_authority: 'M5', certification_exists: true, allowed_transitions: ['M6_AUTHORIZATION', 'REJECTED', 'SUPERSEDED', 'REVOKED'] }),
    s('M6_AUTHORIZATION', { entry_conditions: ['authorization_payload_hash binds exact proposal', 'authorized signer role', 'not expired/revoked'], required_hashes: ['authorization_payload_hash'], required_authority: 'M6 owner authority', certification_exists: true, allowed_transitions: ['SIGNATURE_VALIDATION', 'REJECTED'] }),
    s('SIGNATURE_VALIDATION', { entry_conditions: ['valid signer + ACTIVE key + signature over exact payload'], required_hashes: ['payload_hash', 'signature'], required_authority: 'M6 signing authority', certification_exists: true, allowed_transitions: ['REGISTRY_PRECONDITION_VALIDATION', 'REJECTED'] }),
    s('REGISTRY_PRECONDITION_VALIDATION', { entry_conditions: ['expected registry hash matches (compare-and-swap)'], required_hashes: ['registry precondition hash'], required_authority: 'M6', certification_exists: true, allowed_transitions: ['PUBLICATION', 'BLOCKED'] }),
    s('PUBLICATION', { entry_conditions: ['all prior validations PASS (atomic)'], required_hashes: ['record_hash', 'resulting registry hash'], required_authority: 'M6', registry_mutation_possible: true, certification_exists: true, publication_exists: true, allowed_transitions: ['M13_CELL_CERTIFIED', 'FAILED', 'ROLLED_BACK'] }),
    s('M13_CELL_CERTIFIED', { entry_conditions: ['immutable signed publication applied to the exact cell'], required_hashes: ['registry version hash'], required_authority: 'M13 (derived)', terminal: true, certification_exists: true, publication_exists: true, allowed_transitions: ['SUPERSEDED (new record)', 'REVOKED (new record)'], forbidden_transitions: ['in-place mutation'] }),
  ];
}

function preconditionTable(): PreconditionRow[] {
  const r = (id: string, precondition: string, pass: string, fail: string, blocked: string, resulting_state: string, remediation: string, fresh: boolean): PreconditionRow => ({ id, precondition, pass, fail, blocked, resulting_state, remediation, fresh_evidence_required: fresh });
  return [
    r('P-01', 'identity evidence', 'M7 evidence present', 'no evidence', 'evidence unavailable', 'ATTESTATION_INCOMPLETE', 'acquire evidence', true),
    r('P-02', 'identity completeness', 'all required fields OBSERVED', 'missing field', '-', 'ATTESTATION_INCOMPLETE', 'obtain missing field', true),
    r('P-03', 'provenance threshold', 'channel/binary >= CONTROLLED', 'weak provenance', '-', 'ATTESTATION_INCOMPLETE', 'stronger observation', true),
    r('P-04', 'contradiction status', 'no divergent values', 'divergent values', '-', 'CONTRADICTED', 're-observe', true),
    r('P-05', 'ambiguity status', 'exact installation', '-', 'multiple installs', 'AMBIGUOUS', 'select exact install', true),
    r('P-06', 'freshness', 'within window', 'expired', '-', 'EXPIRED', 're-acquire', true),
    r('P-07', 'environment binding', 'same environment_id', 'wrong env', '-', 'ATTESTATION_INCOMPLETE', 're-observe in cert env', true),
    r('P-08', 'evidence hash integrity', 'hashes match', 'mismatch', '-', 'TAMPERED', 're-acquire', true),
    r('P-09', 'M9 L4 status', 'L4 VERIFIED', 'L4 FAILED', 'L4 absent/stale/revoked', 'BLOCKED', 'independent L4 verification', true),
    r('P-10', 'binary binding', 'exact executable hash (L4)', 'weak/insufficient', 'unproven mechanism', 'ATTESTATION_INCOMPLETE', 'GAP-02 closure', true),
    r('P-11', 'channel binding', 'directly evidenced (>= CONTROLLED)', 'inferred/self-reported', 'no source', 'ATTESTATION_INCOMPLETE', 'GAP-01 closure', true),
    r('P-12', 'M13 exact cell', 'same exact cell across objects', 'cell differs', '-', 'REJECTED', 'align exact cell', false),
    r('P-13', 'capability state', 'required capabilities VERIFIED', 'unverified', '-', 'NOT_CERTIFIED', 'capability evidence', true),
    r('P-14', 'critical safety gates', 'all PASS', 'a gate FAIL', 'a gate BLOCKED', 'NOT_CERTIFIED', 'resolve gate', true),
    r('P-15', 'M4 owner authorization', 'owner APPROVE', 'owner REJECT', 'absent', 'NOT_CERTIFIED', 'owner review', false),
    r('P-16', 'certification decision', 'all M4 gates PASS', 'any FAIL', 'any BLOCKED', 'NOT_CERTIFIED', 'remediate gates', true),
    r('P-17', 'M5 proposal integrity', 'exact binds match', 'mismatch', 'stale', 'REJECTED', 'rebuild proposal', false),
    r('P-18', 'M6 authorization', 'bound to exact proposal', 'proposal mismatch', 'expired', 'REJECTED', 're-authorize', false),
    r('P-19', 'signing-key validity', 'key ACTIVE', 'key REVOKED/COMPROMISED', 'key RETIRED', 'REJECTED', 'valid key', false),
    r('P-20', 'signature validity', 'signature over exact payload', 'invalid', '-', 'REJECTED', 're-sign (governed)', false),
    r('P-21', 'registry precondition', 'expected hash matches', 'stale registry', '-', 'BLOCKED', 'refresh precondition', false),
    r('P-22', 'publication atomicity', 'all validations PASS', 'partial', '-', 'FAILED', 'retry atomically', false),
    r('P-23', 'immutable history', 'no in-place mutation', 'rewrite attempt', '-', 'REJECTED', 'append new record', false),
  ];
}

function gapAssessments(): GapAssessment[] {
  return [
    { id: 'GAP-01', question: 'concrete direct channel evidence source (>= CONTROLLED) for Claude Code', status: 'OPEN_DESIGN_GAP', concrete_prerequisites: ['exact required observation: the installed channel of the certified installation', 'min provenance CONTROLLED_OBSERVATION', 'observer class: controlled or independent (M9 L4)', 'environment binding to the cert env', 'evidence_hash', 'freshness', 'contradiction => CONTRADICTED', 'independent verification for authoritative', 'owner approval of the source'], candidates: [{ candidate: 'controlled-install attestation', classification: 'UNPROVEN' }, { candidate: 'independent observer of installed channel', classification: 'UNPROVEN' }, { candidate: 'infer from version/filename/OS/registry', classification: 'REJECTED' }], authoritative_finding: 'M18: no proven safe autonomous local channel source currently exists' },
    { id: 'GAP-02', question: 'exact certified-executable binary-binding mechanism', status: 'OPEN_DESIGN_GAP', concrete_prerequisites: ['binary_sha256 = exact executable being certified', 'bytes-only read in an L4 cert env', 'freshness + env binding', 'contradiction => CONTRADICTED'], candidates: [{ candidate: 'exact executable byte hash', classification: 'AUTHORITATIVE' }, { candidate: 'embedded executable metadata', classification: 'UNPROVEN' }, { candidate: 'package/archive hash', classification: 'SUPPORTING' }, { candidate: 'explicit install manifest', classification: 'SUPPORTING' }, { candidate: 'benchmark binary', classification: 'INSUFFICIENT' }, { candidate: 'filename/path', classification: 'INSUFFICIENT' }, { candidate: 'registry metadata', classification: 'INSUFFICIENT' }], authoritative_finding: 'exact-byte-hash is authoritative but its authority depends on L4 cert-env control; GAP remains OPEN until proven end-to-end' },
    { id: 'GAP-03R', question: 'signature-payload field-contract completeness', status: 'OPEN_OWNER_DECISION', concrete_prerequisites: ['mandatory fields: attestation/certification/proposal/authorization hashes, exact cell, registry identity+version+precondition, publication record id, signer identity, key identity/version, canonical+schema version, timestamp', 'optional fields: none by default', 'canonical ordering: project canonical JSON', 'full hash coverage'], candidates: [{ candidate: 'M21 payload contract', classification: 'PROVEN' }], authoritative_finding: 'payload contract specified; any M6-undefined field is an owner decision; algorithm kept separate (GAP-04R-ALGO)' },
    { id: 'GAP-04R-ALGO', question: 'signing algorithm selection', status: 'OPEN_OWNER_DECISION', concrete_prerequisites: ['security properties', 'verification support', 'deterministic encoding', 'long-term verification', 'key rotation', 'library/runtime availability', 'cross-platform reproducibility', 'governance compatibility'], candidates: [], authoritative_finding: 'OPEN OWNER DECISION — no approved algorithm exists; none inferred' },
    { id: 'GAP-04R-ROOT', question: 'trust-root bootstrap', status: 'OPEN_OWNER_DECISION', concrete_prerequisites: ['root identity', 'root authorization', 'initial signer registration', 'root rotation/compromise/revocation/recovery', 'audit history'], candidates: [], authoritative_finding: 'OPEN OWNER DECISION — no root created or selected' },
    { id: 'GAP-04R-STORE', question: 'key-storage model', status: 'OPEN_OWNER_DECISION', concrete_prerequisites: ['private-key non-exportability where required', 'access control', 'auditability', 'backup/recovery', 'rotation', 'revocation', 'environment isolation'], candidates: [{ candidate: 'OS key store', classification: 'UNPROVEN' }, { candidate: 'HSM', classification: 'UNPROVEN' }, { candidate: 'KMS', classification: 'UNPROVEN' }, { candidate: 'dedicated signing service', classification: 'UNPROVEN' }, { candidate: 'offline signing environment', classification: 'UNPROVEN' }], authoritative_finding: 'OPEN OWNER DECISION — no provider chosen or accessed' },
    { id: 'GAP-04R-RECOVERY', question: 'compromised-key recovery governance', status: 'OPEN_OWNER_DECISION', concrete_prerequisites: ['detection', 'signing halt', 'key revocation', 'affected-publication identification', 'trustworthy cutoff', 'replacement signer/key', 'historical verification', 'profile/registry response', 'incident audit'], candidates: [], authoritative_finding: 'OPEN OWNER DECISION — no operational recovery procedure established' },
  ];
}

function readinessVector(): ReadinessRow[] {
  return [
    { component: 'IDENTITY_READY', status: 'NOT_READY', reason: 'channel/binary cannot be authoritatively established (GAP-01/GAP-02)' },
    { component: 'EVIDENCE_READY', status: 'NOT_READY', reason: 'no L4 evidence session performed; TS-07/TS-11 unresolved' },
    { component: 'M9_L4_READY', status: 'BLOCKED', reason: 'current environment UNVERIFIED (L0)' },
    { component: 'M4_READY', status: 'NOT_READY', reason: 'TS-07/TS-11 unresolved; capability/attribution evidence absent' },
    { component: 'M5_READY', status: 'NOT_READY', reason: 'no valid certification result to propose' },
    { component: 'M6_AUTH_READY', status: 'NOT_READY', reason: 'no signing authority/keys; GAP-04R-*' },
    { component: 'SIGNING_READY', status: 'NOT_READY', reason: 'algorithm/root/store/recovery all OPEN OWNER DECISION' },
    { component: 'REGISTRY_READY', status: 'NOT_READY', reason: 'no valid signed proposal; production registry immutable, certified 0' },
  ];
}

function ownerDecisions(): OwnerDecision[] {
  const d = (id: string, decision: string, why: string, options: string[], evidence: string): OwnerDecision => ({ id, decision_required: decision, why, current_status: 'OPEN_OWNER_DECISION', options, prohibited_inference: 'no inference; explicit owner decision required', evidence_needed: evidence, owner_authority: 'PTPL / DK Pandey' });
  return [
    d('OD-01', 'channel evidence source', 'authoritative channel identity', ['controlled-install attestation', 'independent observer'], 'proven machine-readable channel evidence'),
    d('OD-02', 'binary-binding mechanism', 'exact executable identity', ['exact byte hash in L4 env', 'embedded metadata (unproven)'], 'end-to-end proof binding hash to the certified executable'),
    d('OD-03', 'signature algorithm', 'signature validity + long-term verification', ['(none approved)'], 'owner-approved algorithm'),
    d('OD-04', 'trust-root bootstrap', 'establish initial trust', ['(none selected)'], 'governed root establishment'),
    d('OD-05', 'key-storage model', 'protect signing keys', ['OS key store', 'HSM', 'KMS', 'dedicated service', 'offline env'], 'selected provider + isolation'),
    d('OD-06', 'compromised-key recovery', 'incident response', ['(policy undefined)'], 'owner-approved recovery policy'),
    d('OD-07', 'signing authority', 'who signs', ['(per M6 governance)'], 'M6 signer authority contract'),
    d('OD-08', 'publication authority', 'who approves publication', ['(per M6 governance)'], 'M6 publication authority contract'),
    d('OD-09', 'trust-root governance', 'root change control', ['(undefined)'], 'root governance policy'),
    d('OD-10', 'production certification activation criteria', 'when first real cert may occur', ['(all prerequisites closed)'], 'activation prerequisite checklist met'),
  ];
}

function activationPrereqs(): { requirement: string; met: false }[] {
  return ['GAP-01 closed', 'GAP-02 closed', 'GAP-03R closed', 'GAP-04R-ALGO closed', 'GAP-04R-ROOT closed', 'GAP-04R-STORE closed', 'GAP-04R-RECOVERY closed', 'M8 execution gate independently READY', 'M9 L4 independently VERIFIED', 'TS-07 resolved', 'TS-11 resolved', 'exact benchmark pin validated', 'required M4 gates PASS', 'owner authorization', 'signing governance READY'].map((requirement) => ({ requirement, met: false as const }));
}

function recoveryMatrix(): RecoveryRow[] {
  const r = (condition: string, state: string, block_point: string, remediation: string, fresh: boolean): RecoveryRow => ({ condition, state, block_point, remediation, fresh_evidence_required: fresh, history_intact: true });
  return [
    r('incomplete identity', 'ATTESTATION_INCOMPLETE', 'attestation', 'obtain missing field', true), r('weak provenance', 'ATTESTATION_INCOMPLETE', 'attestation', 'stronger observation', true),
    r('contradiction', 'CONTRADICTED', 'attestation', 're-observe', true), r('ambiguity', 'AMBIGUOUS', 'attestation', 'select exact install', true),
    r('stale evidence', 'EXPIRED', 'attestation/M4', 're-acquire', true), r('environment mismatch', 'ATTESTATION_INCOMPLETE', 'attestation', 're-observe in cert env', true),
    r('M9 L4 missing', 'BLOCKED', 'M4', 'independent L4 verification', true), r('M9 L4 stale', 'BLOCKED', 'M4', 're-verify L4', true), r('M9 L4 revoked', 'BLOCKED', 'M4', 're-verify L4', true),
    r('TS-07 unresolved', 'NOT_CERTIFIED', 'M4', 'resolve TS-07 (live evidence)', true), r('TS-11 unresolved', 'NOT_CERTIFIED', 'M4', 'resolve TS-11', true), r('capability unresolved', 'NOT_CERTIFIED', 'M4', 'capability evidence', true),
    r('M4 failure', 'NOT_CERTIFIED', 'M4', 'remediate gates', true), r('M5 proposal mismatch', 'REJECTED', 'M5', 'rebuild proposal', false), r('M6 authorization mismatch', 'REJECTED', 'M6', 're-authorize', false),
    r('key invalid', 'REJECTED', 'signature', 'valid key', false), r('key revoked', 'REJECTED', 'signature', 'replacement key', false), r('signature invalid', 'REJECTED', 'signature', 're-sign (governed)', false),
    r('registry precondition mismatch', 'BLOCKED', 'registry', 'refresh precondition', false), r('concurrent proposal', 'BLOCKED', 'registry', 'compare-and-swap retry', false), r('publication failure', 'FAILED', 'publication', 'retry atomically', false),
    r('rollback', 'ROLLED_BACK', 'governance', 'explicit reversal record', false), r('supersession', 'SUPERSEDED', 'governance', 'new record', false), r('revocation', 'REVOKED', 'governance', 'new record', false),
  ];
}

function threats(): ThreatRow[] {
  const t = (threat: string, control: string, failure_state: string): ThreatRow => ({ threat, control, failure_state, certification_blocked: true });
  return [
    t('confused deputy', 'exact object/authority binding per state', 'REJECTED'), t('trust-boundary bypass', 'per-state required_authority + verification layers', 'BLOCKED'),
    t('stale evidence', 'freshness + environment binding', 'EXPIRED'), t('replay', 'bound identities/hashes (M21)', 'REJECTED'),
    t('object substitution', 'exact hash references', 'REJECTED'), t('cell substitution', 'same exact cell across objects', 'REJECTED'),
    t('signer substitution', 'signer authorization layer + trust root', 'REJECTED'), t('key substitution', 'key validity + distinct key_id', 'REJECTED'),
    t('trust-root substitution', 'governed root; bootstrap OPEN', 'REJECTED'), t('authorization substitution', 'authorization_payload_hash', 'REJECTED'),
    t('registry precondition bypass', 'atomic compare-and-swap', 'NO_REGISTRY_MUTATION'), t('history mutation', 'immutability + hash chain', 'REJECTED'),
    t('cross-platform inheritance', 'exact cell; no inheritance', 'REJECTED'), t('cross-version inheritance', 'exact cell; no inheritance', 'REJECTED'),
    t('cross-channel inheritance', 'exact cell; no inheritance', 'REJECTED'), t('cross-environment replay', 'environment_id binding', 'REJECTED'),
    t('synthetic-to-production escalation', 'synthetic_test_only isolation; M5 PG-13 / M6 GG-18 reject synthetic', 'REJECTED'),
  ];
}

export function buildGovernanceSpec(): GovernanceStateMachineSpec {
  const base: Omit<GovernanceStateMachineSpec, 'spec_hash'> = {
    schema: 'dkskill.certification_governance_state_machine_spec/1', version: 1, design_only: true,
    objective: 'Assemble M19/M20/M21 into ONE normative end-to-end certification-governance state machine and define the concrete prerequisites, owner decisions, and evidence required before any real certification can occur — design only; no execution/signing/certification; no OPEN gap converted to an assumption.',
    state_machine: stateMachine(), terminal_states: [...TERMINAL_STATES], precondition_table: preconditionTable(),
    complete_unsigned_gate: { conditions: ['all required fields OBSERVED at threshold', 'no contradiction/ambiguity/expiry/revocation/supersession/tamper', 'valid environment binding', 'valid evidence hash chain'], complete_unsigned_is_not_certified: true, authorizes: ['M4 evaluation only'] },
    m4_gate: { requires: ['exact identity', 'provenance thresholds', 'M9 L4 verified', 'capability/facet requirements', 'critical-capability gate', 'behavioral evidence', 'TS-07 resolved', 'TS-11 resolved', 'owner authorization', 'all mandatory M4 gates'], no_real_certification: true },
    m5_gate: { binds: ['certification_result_hash', 'attestation_hash', 'profile_hash', 'exact M13 cell', 'proposal_hash', 'expected registry state'], fail_on: ['stale certification', 'changed attestation', 'changed profile', 'changed cell', 'changed registry precondition', 'revoked/superseded certification'] },
    m6_gate: { binds: ['authorization authority', 'authorization scope', 'authorization expiry', 'signer authorization', 'key status', 'signature payload', 'signature verification', 'registry precondition'], no_signing: true },
    signature_boundary: { binds: ['attestation', 'certification', 'proposal', 'authorization', 'exact matrix cell', 'registry identity', 'registry version/precondition', 'publication record', 'signer identity', 'key identity', 'schema/canonicalization version'], algorithm_status: 'OPEN_OWNER_DECISION' },
    registry_mutation_boundary: { only_after: ['exact attestation binding', 'valid certification', 'valid publication proposal', 'valid authorization', 'valid signer/key', 'valid signature', 'valid registry precondition'], otherwise: 'NO_REGISTRY_MUTATION' },
    m13_cell_rule: { exact: 'platform × architecture × channel × version (+ runtime facet where required)', no: ['inheritance', 'sibling reuse', 'latest substitution', 'platform substitution', 'architecture substitution', 'channel substitution', 'version substitution'], every_object_same_cell: true },
    gap_assessments: gapAssessments(), readiness_vector: readinessVector(), overall_readiness: 'NOT_READY',
    universal_platform_readiness: { per_cell: 'evaluated per exact platform × OS version × architecture × channel × Claude version × runtime facet; independently certified', no_inference: true, certified_count: 0 },
    owner_decision_register: ownerDecisions(), certification_activation_prerequisites: activationPrereqs(), activation_all_met: false,
    first_certification_safety_boundary: ['no bootstrap from synthetic certification', 'no version inheritance', 'no platform inheritance', 'no channel inheritance', 'no architecture inheritance', 'no M9 bypass', 'no M8 bypass', 'no M4 bypass', 'no M5 bypass', 'no M6 bypass', 'no stale evidence reuse', 'no other-installation evidence reuse', 'no weak identity inference', 'the first production-certified cell must be independently evidenced'],
    failure_recovery_matrix: recoveryMatrix(),
    synthetic_e2e_fixture: {
      positive: { id: 'E2E-01', name: 'identity→attestation→M4 decision→M5 proposal→M6 authorization→signature placeholder→publication placeholder→M13 cell', kind: 'POSITIVE', expected: 'design-only walkthrough; UNSIGNED placeholders; never certified/published; production registry untouched', label: 'SYNTHETIC_TEST_ONLY' },
      negatives: ['incomplete identity', 'weak provenance', 'contradiction', 'ambiguity', 'M9 L4 absent', 'TS-07 unresolved', 'M4 fail', 'M5 mismatch', 'M6 auth mismatch', 'key revoked', 'signature invalid', 'registry precondition mismatch', 'synthetic-to-production escalation'].map((name, i) => ({ id: `E2E-N${String(i + 1).padStart(2, '0')}`, name, kind: 'NEGATIVE' as const, expected: 'fail-closed; no certification/publication/mutation', label: 'SYNTHETIC_TEST_ONLY' as const })),
    },
    security_review: threats(),
    future_test_specs: ['state-machine completeness', 'allowed transitions', 'forbidden transitions', 'every precondition', 'exact object hashes', 'exact cell binding', 'M9 dependency', 'M8 dependency', 'M4 dependency', 'M5 dependency', 'M6 dependency', 'key lifecycle', 'replay protection', 'immutable history', 'owner-decision gates', 'synthetic/production separation', 'no-secret boundary', 'static no-execution/no-network/no-signing guarantees'],
    open_design_gaps: [
      { id: 'GAP-01', status: 'OPEN_DESIGN_GAP' }, { id: 'GAP-02', status: 'OPEN_DESIGN_GAP' }, { id: 'GAP-03R', status: 'OPEN_OWNER_DECISION' },
      { id: 'GAP-04R-ALGO', status: 'OPEN_OWNER_DECISION' }, { id: 'GAP-04R-ROOT', status: 'OPEN_OWNER_DECISION' }, { id: 'GAP-04R-STORE', status: 'OPEN_OWNER_DECISION' }, { id: 'GAP-04R-RECOVERY', status: 'OPEN_OWNER_DECISION' },
    ],
  };
  return { ...base, spec_hash: sha256(canonicalJson(base)) };
}

// ---- consistency validator --------------------------------------------------------------------------------
export function validateGovernanceSpec(spec: GovernanceStateMachineSpec): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const states = spec.state_machine.map((s) => s.state);
  for (const s of MAIN_STATES) if (!states.includes(s)) issues.push(`missing main state ${s}`);
  if (spec.precondition_table.length < 23) issues.push('precondition table must have >= 23 rows');
  // registry mutation possible ONLY at PUBLICATION; certification only from CERTIFICATION_DECISION onward
  for (const n of spec.state_machine) {
    if (n.registry_mutation_possible && n.state !== 'PUBLICATION') issues.push(`registry mutation must only be possible at PUBLICATION, not ${n.state}`);
    if (['IDENTITY_EVIDENCE', 'ATTESTATION_INCOMPLETE', 'ATTESTATION_COMPLETE_UNSIGNED', 'M4_EVALUATION'].includes(n.state) && n.certification_exists) issues.push(`certification must not exist at ${n.state}`);
  }
  if (spec.overall_readiness !== 'NOT_READY') issues.push('overall readiness must be NOT_READY (prerequisites unresolved)');
  if (spec.readiness_vector.some((r) => r.status === 'READY')) issues.push('no readiness component may be READY yet');
  if (spec.activation_all_met !== false || spec.certification_activation_prerequisites.some((p) => p.met !== false)) issues.push('no activation prerequisite may be met');
  if (spec.universal_platform_readiness.certified_count !== 0) issues.push('certified count must be 0');
  for (const g of ['GAP-01', 'GAP-02']) if (!spec.open_design_gaps.some((x) => x.id === g && x.status === 'OPEN_DESIGN_GAP')) issues.push(`${g} must remain OPEN_DESIGN_GAP`);
  if (spec.gap_assessments.some((g) => g.status === 'REFINED' && g.id === 'GAP-01')) issues.push('GAP-01 must not be closed');
  if (spec.security_review.some((t) => t.certification_blocked !== true)) issues.push('every threat must block certification');
  if (spec.synthetic_e2e_fixture.positive.label !== 'SYNTHETIC_TEST_ONLY') issues.push('e2e fixture must be SYNTHETIC_TEST_ONLY');
  if (spec.complete_unsigned_gate.complete_unsigned_is_not_certified !== true) issues.push('COMPLETE_UNSIGNED must not equal CERTIFIED');
  if (spec.registry_mutation_boundary.otherwise !== 'NO_REGISTRY_MUTATION') issues.push('mutation boundary must be NO_REGISTRY_MUTATION otherwise');
  if (!spec.m13_cell_rule.every_object_same_cell) issues.push('every object must bind the same exact cell');
  return { ok: issues.length === 0, issues };
}
export function verifySpec(spec: GovernanceStateMachineSpec): boolean { const { spec_hash, ...rest } = spec; return sha256(canonicalJson(rest)) === spec_hash; }
export function specHasSecret(spec: GovernanceStateMachineSpec): boolean { return /(access_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6}|sk-[a-z0-9]{6}|password=\S)/i.test(canonicalJson(spec)); }
