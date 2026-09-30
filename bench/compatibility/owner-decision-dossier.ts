// M23 — Owner Decision Package & Certification Activation-Readiness Dossier (DESIGN ONLY / NO DECISIONS).
// Deterministic SPEC DATA + a pure readiness-recomputation function + a decision tree. It MAKES NO owner decision,
// recommends nothing, selects no implementation, and closes no gap by inference. It executes nothing, signs nothing,
// certifies nothing, generates no keys, contacts no network, accesses no ~/.claude/credentials, and mutates no
// registry. Safe default for every unresolved item: OPEN / NOT_READY / NO_CERTIFICATION / NO_PUBLICATION.
import { sha256, canonicalJson } from '../src/canonical.ts';

export type Readiness = 'READY' | 'NOT_READY' | 'BLOCKED' | 'UNKNOWN';
export type DecisionState = 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'DEFERRED';
export type GapState = 'OPEN' | 'CLOSED';
export type CandidateClass = 'PROVEN' | 'UNPROVEN' | 'INSUFFICIENT' | 'REJECTED' | 'AUTHORITATIVE' | 'SUPPORTING';

export const OD_IDS = ['OD-01', 'OD-02', 'OD-03', 'OD-04', 'OD-05', 'OD-06', 'OD-07', 'OD-08', 'OD-09', 'OD-10'] as const;
export const GAP_IDS = ['GAP-01', 'GAP-02', 'GAP-03R', 'GAP-04R-ALGO', 'GAP-04R-ROOT', 'GAP-04R-STORE', 'GAP-04R-RECOVERY'] as const;
export const READINESS_DIMS = ['CHANNEL_READY', 'BINARY_READY', 'IDENTITY_READY', 'EVIDENCE_READY', 'M9_L4_READY', 'M4_READY', 'M5_READY', 'M6_AUTH_READY', 'SIGNING_READY', 'REGISTRY_READY', 'OVERALL_READINESS'] as const;
export type OdId = typeof OD_IDS[number];
export type GapId = typeof GAP_IDS[number];

export interface OwnerDecision {
  decision_id: OdId; question: string; why: string; current_status: DecisionState; current_evidence: string;
  missing_evidence: string; minimum_evidence_required: string; acceptable_evidence_sources: string[]; prohibited_inference: string;
  options: string[]; consequences: Record<string, string>; safe_default: string; owner_authority: string; dependencies: string[];
  dependent_gaps: GapId[]; readiness_dimensions_affected: string[]; if_accepted: string; if_rejected: string; if_deferred: string;
}
export interface GapEntry {
  gap_id: GapId; definition: string; source_milestone: string; why_unresolved: string; evidence_needed: string; owner_decision_needed: string;
  blocks_certification_stages: string[]; blocks_publication_stages: string[]; blocks_signing_stages: string[]; scope: 'ALL_PLATFORMS' | 'PARTICULAR_FACETS';
  safe_default: string; closure_criteria: string; verification_criteria: string; requires_real_world_evidence: boolean; requires_owner_authorization: boolean; status: GapState;
}
export interface EvidenceRequest { evidence_id: string; decision_id: OdId; purpose: string; required_provenance: string; required_observer: string; required_environment: string; required_freshness: string; required_hash: string; required_m7_class: string; m9_dependency: boolean; expected_result: string; failure_result: string }
export interface ReviewPacket { decision_id: OdId; question: string; why_it_matters: string; current_state: string; known: string; unknown: string; minimum_evidence: string; options: string[]; risks_tradeoffs: string; safe_default: string; dependencies: string[]; readiness_impact: string; owner_action_required: string }
export interface ChecklistItem { item: string; met: boolean }
export interface ScenarioRow { decision_id: OdId; outcome: 'ACCEPTED' | 'REJECTED' | 'DEFERRED'; immediate_status: string; affected_gaps: GapId[]; affected_readiness: string[]; affected_stages: string[]; new_evidence_required: boolean; re_review_required: boolean }
export interface PlatformImpact { decision_id: OdId; windows: string; macos: string; linux: string; architecture: string; channel: string; version: string; runtime_facet: string; no_cross_platform_inference: true }
export interface ThreatRow { threat: string; control: string; unresolved_remains: 'certification_blocked=true' }
export interface DecisionFixture { id: string; name: string; label: 'SYNTHETIC_TEST_ONLY'; inputs: ReadinessInputs; expected_overall: Readiness }

// ---- deterministic readiness recomputation (design function; never certifies) ------------------------------
export interface ReadinessInputs {
  decisions: Record<OdId, DecisionState>;
  gaps: Record<GapId, GapState>;
  m8: 'BLOCKED' | 'READY';
  m9_l4: 'UNVERIFIED' | 'VERIFIED' | 'STALE' | 'REVOKED';
  ts07: 'UNRESOLVED' | 'RESOLVED';
  ts11: 'UNRESOLVED' | 'RESOLVED';
  m4_gates: 'NOT_PASS' | 'PASS';
  m5: 'NOT_READY' | 'READY';
  m6: 'NOT_READY' | 'READY';
  benchmark_pin_validated: boolean;
  owner_activation_authorized: boolean;
  exact_cell_bound: boolean;
}
export interface ReadinessResult { dimensions: Record<string, Readiness>; overall: Readiness; conceptually_eligible: boolean; certified: false; reasons: string[] }

export function currentInputs(): ReadinessInputs {
  const decisions = Object.fromEntries(OD_IDS.map((id) => [id, 'OPEN'])) as Record<OdId, DecisionState>;
  const gaps = Object.fromEntries(GAP_IDS.map((id) => [id, 'OPEN'])) as Record<GapId, GapState>;
  return { decisions, gaps, m8: 'BLOCKED', m9_l4: 'UNVERIFIED', ts07: 'UNRESOLVED', ts11: 'UNRESOLVED', m4_gates: 'NOT_PASS', m5: 'NOT_READY', m6: 'NOT_READY', benchmark_pin_validated: false, owner_activation_authorized: false, exact_cell_bound: false };
}
export function fullySatisfiedInputs(): ReadinessInputs {
  const decisions = Object.fromEntries(OD_IDS.map((id) => [id, 'ACCEPTED'])) as Record<OdId, DecisionState>;
  const gaps = Object.fromEntries(GAP_IDS.map((id) => [id, 'CLOSED'])) as Record<GapId, GapState>;
  return { decisions, gaps, m8: 'READY', m9_l4: 'VERIFIED', ts07: 'RESOLVED', ts11: 'RESOLVED', m4_gates: 'PASS', m5: 'READY', m6: 'READY', benchmark_pin_validated: true, owner_activation_authorized: true, exact_cell_bound: true };
}

export function recomputeReadiness(i: ReadinessInputs): ReadinessResult {
  const reasons: string[] = [];
  const acc = (id: OdId) => i.decisions[id] === 'ACCEPTED';
  const CHANNEL_READY: Readiness = i.gaps['GAP-01'] === 'CLOSED' && acc('OD-01') ? 'READY' : 'NOT_READY';
  const BINARY_READY: Readiness = i.gaps['GAP-02'] === 'CLOSED' && acc('OD-02') ? 'READY' : 'NOT_READY';
  const M9_L4_READY: Readiness = i.m9_l4 === 'VERIFIED' ? 'READY' : 'BLOCKED';
  const IDENTITY_READY: Readiness = CHANNEL_READY === 'READY' && BINARY_READY === 'READY' && i.exact_cell_bound ? 'READY' : 'NOT_READY';
  const EVIDENCE_READY: Readiness = M9_L4_READY === 'BLOCKED' ? 'BLOCKED' : (IDENTITY_READY === 'READY' && i.ts07 === 'RESOLVED' && i.ts11 === 'RESOLVED' ? 'READY' : 'NOT_READY');
  const M4_READY: Readiness = M9_L4_READY === 'BLOCKED' ? 'BLOCKED' : (EVIDENCE_READY === 'READY' && i.m4_gates === 'PASS' && i.benchmark_pin_validated ? 'READY' : 'NOT_READY');
  const M5_READY: Readiness = M4_READY === 'READY' && i.m5 === 'READY' ? 'READY' : (M4_READY === 'BLOCKED' ? 'BLOCKED' : 'NOT_READY');
  const M6_AUTH_READY: Readiness = acc('OD-07') && acc('OD-08') && acc('OD-09') && i.m6 === 'READY' ? 'READY' : 'NOT_READY';
  const SIGNING_READY: Readiness = i.gaps['GAP-03R'] === 'CLOSED' && acc('OD-03') && acc('OD-04') && acc('OD-05') && acc('OD-06') ? 'READY' : 'NOT_READY';
  const REGISTRY_READY: Readiness = M6_AUTH_READY === 'READY' && SIGNING_READY === 'READY' && i.exact_cell_bound ? 'READY' : 'NOT_READY';
  const dims: Record<string, Readiness> = { CHANNEL_READY, BINARY_READY, IDENTITY_READY, EVIDENCE_READY, M9_L4_READY, M4_READY, M5_READY, M6_AUTH_READY, SIGNING_READY, REGISTRY_READY };
  const allReady = ['IDENTITY_READY', 'EVIDENCE_READY', 'M9_L4_READY', 'M4_READY', 'M5_READY', 'M6_AUTH_READY', 'SIGNING_READY', 'REGISTRY_READY'].every((k) => dims[k] === 'READY');
  const overall: Readiness = allReady && i.owner_activation_authorized ? 'READY' : 'NOT_READY';
  if (!allReady) reasons.push('one or more readiness dimensions are not READY');
  if (!i.owner_activation_authorized) reasons.push('owner activation not authorized');
  const conceptually_eligible = overall === 'READY';
  dims.OVERALL_READINESS = overall;
  return { dimensions: dims, overall, conceptually_eligible, certified: false, reasons };
}

// ---- first-certification decision tree (design; never executed) -------------------------------------------
export function evaluateFirstCertificationTree(i: ReadinessInputs): { result: string; stopped_at: string } {
  const r = recomputeReadiness(i);
  if (r.dimensions.IDENTITY_READY !== 'READY') return { result: 'NOT_READY', stopped_at: 'identity fields not authoritative' };
  if (!i.exact_cell_bound) return { result: 'NOT_READY', stopped_at: 'evidence not environment-bound/cell-bound' };
  if (r.dimensions.M9_L4_READY !== 'READY') return { result: 'BLOCKED', stopped_at: 'M9 L4 not verified' };
  if (i.ts07 !== 'RESOLVED' || i.ts11 !== 'RESOLVED') return { result: 'BLOCKED', stopped_at: 'TS-07/TS-11 unresolved' };
  if (r.dimensions.M4_READY !== 'READY') return { result: 'NOT_READY', stopped_at: 'M4 gates not satisfied' };
  if (r.dimensions.M5_READY !== 'READY') return { result: 'NOT_READY', stopped_at: 'M5 proposal not exact/ready' };
  if (r.dimensions.M6_AUTH_READY !== 'READY') return { result: 'NOT_READY', stopped_at: 'M6 authorization not valid' };
  if (r.dimensions.SIGNING_READY !== 'READY') return { result: 'NOT_READY', stopped_at: 'signing governance not ready' };
  if (r.dimensions.REGISTRY_READY !== 'READY') return { result: 'NOT_READY', stopped_at: 'registry precondition not valid' };
  if (!i.owner_activation_authorized) return { result: 'NOT_READY', stopped_at: 'owner activation not authorized' };
  return { result: 'CONCEPTUALLY_ELIGIBLE_FOR_AUTHORIZED_PUBLICATION', stopped_at: 'all gates satisfied (synthetic; no real certification)' };
}

// ---- dossier data -----------------------------------------------------------------------------------------
export interface OwnerDecisionDossier {
  schema: 'dkskill.owner_decision_dossier/1';
  version: 1;
  design_only: true;
  decisions_made: 0;
  master_decision_register: OwnerDecision[];
  gap_register: GapEntry[];
  evidence_requests: EvidenceRequest[];
  review_packet: ReviewPacket[];
  activation_checklist: ChecklistItem[];
  activation_all_met: false;
  scenario_table: ScenarioRow[];
  dependency_map: { decision_or_gap: string; affects: string[] }[];
  platform_impact: PlatformImpact[];
  security_review: ThreatRow[];
  decision_fixtures: DecisionFixture[];
  future_test_specs: string[];
  current_readiness: ReadinessResult;
  safe_default: 'OPEN / NOT_READY / NO_CERTIFICATION / NO_PUBLICATION';
  open_gaps: { id: GapId; status: GapState }[];
  dossier_hash?: string;
}

function decisionRegister(): OwnerDecision[] {
  const d = (decision_id: OdId, question: string, why: string, minEv: string, sources: string[], options: string[], deps: string[], gaps: GapId[], dims: string[]): OwnerDecision => ({
    decision_id, question, why, current_status: 'OPEN', current_evidence: 'none', missing_evidence: minEv, minimum_evidence_required: minEv,
    acceptable_evidence_sources: sources, prohibited_inference: 'no inference; explicit owner decision + real evidence required', options,
    consequences: Object.fromEntries(options.map((o) => [o, `selecting "${o}" requires the minimum evidence and re-review; no auto-effect`])),
    safe_default: 'OPEN / NOT_READY', owner_authority: 'PTPL / DK Pandey', dependencies: deps, dependent_gaps: gaps, readiness_dimensions_affected: dims,
    if_accepted: 'status ACCEPTED pending evidence; readiness recomputed', if_rejected: 'status REJECTED; affected readiness NOT_READY', if_deferred: 'status DEFERRED; remains NOT_READY',
  });
  return [
    d('OD-01', 'What evidence establishes the exact Claude Code channel at certification time without inference?', 'channel is required for the exact M13 cell', 'a proven machine-readable channel evidence source (>= CONTROLLED_OBSERVATION)', ['controlled-install attestation', 'independent observer'], ['controlled-install attestation', 'independent observer', 'remain OPEN'], ['M7', 'M9'], ['GAP-01'], ['CHANNEL_READY', 'IDENTITY_READY']),
    d('OD-02', 'What evidence proves binary_sha256 = the exact executable certified?', 'binary identity anchors certification', 'exact executable byte hash captured in an L4 cert env', ['exact byte hash (L4)'], ['exact byte hash (L4)', 'remain OPEN'], ['M7', 'M9'], ['GAP-02'], ['BINARY_READY', 'IDENTITY_READY']),
    d('OD-03', 'Which signature algorithm?', 'signatures authenticate publication', 'owner-approved algorithm meeting the decision criteria', ['(none approved)'], ['remain OPEN'], ['GAP-04R-ALGO'], ['GAP-04R-ALGO'], ['SIGNING_READY']),
    d('OD-04', 'How is the initial signing trust root established?', 'trust root authenticates signer keys', 'governed root establishment record', ['(none)'], ['remain OPEN'], ['GAP-04R-ROOT'], ['GAP-04R-ROOT'], ['SIGNING_READY']),
    d('OD-05', 'Which key-storage model?', 'protect private signing keys', 'selected provider + isolation properties', ['OS key store', 'HSM', 'KMS', 'dedicated service', 'offline env'], ['remain OPEN'], ['GAP-04R-STORE'], ['GAP-04R-STORE'], ['SIGNING_READY']),
    d('OD-06', 'What is the compromised-key recovery policy?', 'incident response for key compromise', 'owner-approved recovery governance', ['(none)'], ['remain OPEN'], ['GAP-04R-RECOVERY'], ['GAP-04R-RECOVERY'], ['SIGNING_READY']),
    d('OD-07', 'Who may authorize/sign production publication?', 'separation of duties', 'M6 signer-authority contract', ['(per M6 governance)'], ['remain OPEN'], ['OD-09'], [], ['M6_AUTH_READY']),
    d('OD-08', 'Who may cause a signed publication to enter the registry?', 'publication authority + separation of duties', 'M6 publication-authority contract', ['(per M6 governance)'], ['remain OPEN'], ['OD-07'], [], ['M6_AUTH_READY']),
    d('OD-09', 'How is trust-root governance handled (create/rotate/revoke/recover)?', 'root lifecycle integrity', 'root governance policy', ['(undefined)'], ['remain OPEN'], ['OD-04'], ['GAP-04R-ROOT'], ['M6_AUTH_READY', 'SIGNING_READY']),
    d('OD-10', 'What must be true before the first real production certification is authorized?', 'activation gate', 'every activation prerequisite met', ['(all prerequisites)'], ['remain OPEN'], ['OD-01', 'OD-02', 'OD-03', 'OD-04', 'OD-05', 'OD-06', 'OD-07', 'OD-08', 'OD-09'], ['GAP-01', 'GAP-02', 'GAP-03R', 'GAP-04R-ALGO', 'GAP-04R-ROOT', 'GAP-04R-STORE', 'GAP-04R-RECOVERY'], ['OVERALL_READINESS']),
  ];
}

function gapRegister(): GapEntry[] {
  const g = (gap_id: GapId, definition: string, source: string, why: string, evidence: string, decision: string, scope: 'ALL_PLATFORMS' | 'PARTICULAR_FACETS', closure: string, realWorld: boolean): GapEntry => ({
    gap_id, definition, source_milestone: source, why_unresolved: why, evidence_needed: evidence, owner_decision_needed: decision,
    blocks_certification_stages: ['M4_EVALUATION', 'CERTIFICATION_DECISION'], blocks_publication_stages: ['M5_PUBLICATION_PROPOSAL', 'PUBLICATION'], blocks_signing_stages: ['SIGNATURE_VALIDATION'],
    scope, safe_default: 'OPEN / NOT_READY', closure_criteria: closure, verification_criteria: `${closure} — independently verified`, requires_real_world_evidence: realWorld, requires_owner_authorization: true, status: 'OPEN',
  });
  return [
    g('GAP-01', 'direct Claude Code channel evidence source (>= CONTROLLED)', 'M18/M20/M22', 'no proven machine-readable channel source', 'controlled/independent channel observation bound to the cert env', 'OD-01', 'PARTICULAR_FACETS', 'a proven channel evidence source demonstrated', true),
    g('GAP-02', 'exact certified-executable binary-binding mechanism', 'M19/M20/M22', 'authority of the byte hash depends on unproven L4 cert-env control', 'exact byte hash in an L4 env bound to the certified installation', 'OD-02', 'PARTICULAR_FACETS', 'binary binding proven end-to-end in an L4 env', true),
    g('GAP-03R', 'signature-payload field-contract completeness', 'M21/M22', 'some M6 payload fields require an owner decision', 'finalized payload field contract', 'OD-03', 'ALL_PLATFORMS', 'payload contract finalized', false),
    g('GAP-04R-ALGO', 'signature algorithm', 'M21/M22', 'no approved algorithm', 'owner-approved algorithm', 'OD-03', 'ALL_PLATFORMS', 'algorithm approved', false),
    g('GAP-04R-ROOT', 'trust-root bootstrap', 'M21/M22', 'no root established', 'governed root establishment', 'OD-04', 'ALL_PLATFORMS', 'trust root established', true),
    g('GAP-04R-STORE', 'key-storage model', 'M21/M22', 'no provider chosen', 'selected key-storage model', 'OD-05', 'ALL_PLATFORMS', 'key storage selected + isolated', true),
    g('GAP-04R-RECOVERY', 'compromised-key recovery governance', 'M21/M22', 'no recovery policy', 'owner-approved recovery policy', 'OD-06', 'ALL_PLATFORMS', 'recovery policy established', false),
  ];
}

function evidenceRequests(): EvidenceRequest[] {
  const e = (evidence_id: string, decision_id: OdId, purpose: string, prov: string, observer: string, m7: string, m9: boolean): EvidenceRequest => ({
    evidence_id, decision_id, purpose, required_provenance: prov, required_observer: observer, required_environment: 'PTPL certification environment (M9-L4)', required_freshness: 'within evidence validity window',
    required_hash: 'sha256 evidence hash bound to attestation', required_m7_class: m7, m9_dependency: m9, expected_result: 'field OBSERVED at required provenance', failure_result: 'UNKNOWN / INCOMPLETE / CONTRADICTED (fail closed)',
  });
  return [
    e('ER-01', 'OD-01', 'establish channel', 'CONTROLLED_OBSERVATION', 'controlled/independent observer', 'EV-CHANNEL', true),
    e('ER-02', 'OD-02', 'establish exact binary hash', 'CONTROLLED/INDEPENDENT', 'independent observer in L4 env', 'EV-BINARY-IDENTITY', true),
    e('ER-03', 'OD-03', 'algorithm decision analysis', 'CERTIFICATION_ATTESTATION', 'owner', 'n/a', false),
    e('ER-04', 'OD-04', 'trust-root establishment record', 'CERTIFICATION_ATTESTATION', 'owner', 'n/a', false),
    e('ER-05', 'OD-05', 'key-storage selection', 'CERTIFICATION_ATTESTATION', 'owner', 'n/a', false),
    e('ER-06', 'OD-06', 'recovery policy', 'CERTIFICATION_ATTESTATION', 'owner', 'n/a', false),
    e('ER-07', 'OD-10', 'activation prerequisite proof', 'CERTIFICATION_ATTESTATION', 'owner + certification system', 'n/a', true),
  ];
}

function reviewPacket(reg: OwnerDecision[]): ReviewPacket[] {
  return reg.map((d) => ({
    decision_id: d.decision_id, question: d.question, why_it_matters: d.why, current_state: 'OPEN / NOT_READY', known: d.current_evidence, unknown: d.missing_evidence,
    minimum_evidence: d.minimum_evidence_required, options: d.options, risks_tradeoffs: 'each option requires real evidence + re-review; no inference; safe default is OPEN', safe_default: 'OPEN / NOT_READY / NO_CERTIFICATION',
    dependencies: d.dependencies, readiness_impact: d.readiness_dimensions_affected.join(', '), owner_action_required: 'review and, only when ready, explicitly decide with the required evidence',
  }));
}

function activationChecklist(): ChecklistItem[] {
  return ['channel evidence', 'binary binding', 'M9 L4', 'TS-07', 'TS-11', 'M4', 'M5', 'M6', 'signing algorithm', 'trust root', 'key storage', 'recovery', 'owner authorization', 'exact M13 cell', 'registry precondition'].map((item) => ({ item, met: false }));
}

function scenarioTable(): ScenarioRow[] {
  const rows: ScenarioRow[] = [];
  for (const id of OD_IDS) for (const outcome of ['ACCEPTED', 'REJECTED', 'DEFERRED'] as const) {
    rows.push({ decision_id: id, outcome, immediate_status: outcome, affected_gaps: gapRegister().filter((g) => g.owner_decision_needed === id).map((g) => g.gap_id), affected_readiness: decisionRegister().find((d) => d.decision_id === id)!.readiness_dimensions_affected, affected_stages: ['M4', 'M5', 'M6'], new_evidence_required: outcome === 'ACCEPTED', re_review_required: true });
  }
  return rows;
}

function platformImpact(): PlatformImpact[] {
  return OD_IDS.map((decision_id) => ({ decision_id, windows: 'per exact Windows cell only', macos: 'per exact macOS cell only', linux: 'per exact Linux cell only', architecture: 'per exact architecture', channel: 'per exact channel', version: 'per exact version', runtime_facet: 'per exact runtime facet', no_cross_platform_inference: true }));
}

function threats(): ThreatRow[] {
  const t = (threat: string, control: string): ThreatRow => ({ threat, control, unresolved_remains: 'certification_blocked=true' });
  return [
    t('decision spoofing', 'owner authority + audit'), t('unauthorized approval', 'owner authority binding'), t('evidence laundering', 'required provenance + M9 L4 + hash binding'),
    t('inferred evidence', 'no inference; explicit evidence'), t('stale evidence', 'freshness + env binding'), t('option substitution', 'exact option + re-review'),
    t('owner-decision replay', 'decision bound to exact evidence + timestamp'), t('trust-root substitution', 'governed root; bootstrap OPEN'), t('key-provider substitution', 'selected provider only'),
    t('recovery-policy ambiguity', 'explicit policy required'), t('synthetic-to-production escalation', 'SYNTHETIC_TEST_ONLY isolation; fixtures never certify'), t('accidental activation', 'activation_all_met=false; owner authorization required'),
  ];
}

function decisionFixtures(): DecisionFixture[] {
  const f = (id: string, name: string, mutate: (i: ReadinessInputs) => ReadinessInputs, base: 'current' | 'full', expected: Readiness): DecisionFixture => {
    const inputs = mutate(base === 'current' ? currentInputs() : fullySatisfiedInputs());
    return { id, name, label: 'SYNTHETIC_TEST_ONLY', inputs, expected_overall: expected };
  };
  return [
    f('DF-01', 'all decisions OPEN', (i) => i, 'current', 'NOT_READY'),
    f('DF-02', 'one decision accepted (OD-01)', (i) => ({ ...i, decisions: { ...i.decisions, 'OD-01': 'ACCEPTED' }, gaps: { ...i.gaps, 'GAP-01': 'CLOSED' } }), 'current', 'NOT_READY'),
    f('DF-03', 'one decision rejected (OD-01)', (i) => ({ ...i, decisions: { ...i.decisions, 'OD-01': 'REJECTED' } }), 'current', 'NOT_READY'),
    f('DF-04', 'one decision deferred (OD-01)', (i) => ({ ...i, decisions: { ...i.decisions, 'OD-01': 'DEFERRED' } }), 'current', 'NOT_READY'),
    f('DF-05', 'all satisfied except M9', (i) => ({ ...i, m9_l4: 'UNVERIFIED' }), 'full', 'NOT_READY'),
    f('DF-06', 'all satisfied except GAP-01', (i) => ({ ...i, gaps: { ...i.gaps, 'GAP-01': 'OPEN' }, decisions: { ...i.decisions, 'OD-01': 'OPEN' } }), 'full', 'NOT_READY'),
    f('DF-07', 'all satisfied except GAP-02', (i) => ({ ...i, gaps: { ...i.gaps, 'GAP-02': 'OPEN' }, decisions: { ...i.decisions, 'OD-02': 'OPEN' } }), 'full', 'NOT_READY'),
    f('DF-08', 'all satisfied except signing governance', (i) => ({ ...i, gaps: { ...i.gaps, 'GAP-03R': 'OPEN' }, decisions: { ...i.decisions, 'OD-03': 'OPEN' } }), 'full', 'NOT_READY'),
    f('DF-09', 'all satisfied except owner activation', (i) => ({ ...i, owner_activation_authorized: false }), 'full', 'NOT_READY'),
    f('DF-10', 'fully satisfied synthetic readiness', (i) => i, 'full', 'READY'),
  ];
}

export function buildOwnerDecisionDossier(): OwnerDecisionDossier {
  const reg = decisionRegister();
  const base: Omit<OwnerDecisionDossier, 'dossier_hash'> = {
    schema: 'dkskill.owner_decision_dossier/1', version: 1, design_only: true, decisions_made: 0,
    master_decision_register: reg, gap_register: gapRegister(), evidence_requests: evidenceRequests(), review_packet: reviewPacket(reg),
    activation_checklist: activationChecklist(), activation_all_met: false, scenario_table: scenarioTable(),
    dependency_map: [
      { decision_or_gap: 'OD-01/GAP-01', affects: ['CHANNEL_READY', 'IDENTITY_READY', 'EVIDENCE_READY', 'OVERALL_READINESS'] },
      { decision_or_gap: 'OD-02/GAP-02', affects: ['BINARY_READY', 'IDENTITY_READY', 'EVIDENCE_READY', 'OVERALL_READINESS'] },
      { decision_or_gap: 'M9 L4', affects: ['M9_L4_READY', 'EVIDENCE_READY', 'M4_READY', 'OVERALL_READINESS'] },
      { decision_or_gap: 'TS-07/TS-11', affects: ['EVIDENCE_READY', 'M4_READY', 'OVERALL_READINESS'] },
      { decision_or_gap: 'OD-03/04/05/06 + GAP-03R', affects: ['SIGNING_READY', 'REGISTRY_READY', 'OVERALL_READINESS'] },
      { decision_or_gap: 'OD-07/08/09', affects: ['M6_AUTH_READY', 'REGISTRY_READY', 'OVERALL_READINESS'] },
      { decision_or_gap: 'OD-10 owner activation', affects: ['OVERALL_READINESS'] },
    ],
    platform_impact: platformImpact(), security_review: threats(), decision_fixtures: decisionFixtures(),
    future_test_specs: ['decision register schema', 'gap dependency graph', 'readiness recomputation', 'scenario transitions', 'evidence requirements', 'activation checklist', 'decision tree', 'platform/cell isolation', 'owner authority boundaries', 'fail-closed behavior', 'synthetic/production separation', 'static no-execution/no-network/no-signing/no-key-generation guarantees'],
    current_readiness: recomputeReadiness(currentInputs()), safe_default: 'OPEN / NOT_READY / NO_CERTIFICATION / NO_PUBLICATION',
    open_gaps: GAP_IDS.map((id) => ({ id, status: 'OPEN' as GapState })),
  };
  return { ...base, dossier_hash: sha256(canonicalJson(base)) };
}

export function validateDossier(d: OwnerDecisionDossier): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (d.master_decision_register.length !== 10) issues.push('must have OD-01..OD-10');
  if (d.master_decision_register.some((x) => x.current_status !== 'OPEN')) issues.push('no decision may be pre-decided (all OPEN)');
  if (d.gap_register.length !== 7) issues.push('must have 7 gaps');
  if (d.gap_register.some((g) => g.status !== 'OPEN')) issues.push('no gap may be marked closed');
  if (d.decisions_made !== 0) issues.push('decisions_made must be 0');
  if (d.activation_all_met !== false || d.activation_checklist.some((c) => c.met !== false)) issues.push('no activation item may be met');
  if (d.current_readiness.overall !== 'NOT_READY') issues.push('current readiness must be NOT_READY');
  if (d.current_readiness.certified !== false) issues.push('never certified');
  for (const fx of d.decision_fixtures) if (fx.label !== 'SYNTHETIC_TEST_ONLY') issues.push(`fixture ${fx.id} must be SYNTHETIC_TEST_ONLY`);
  // every fixture's recomputation must match its expected overall (design determinism)
  for (const fx of d.decision_fixtures) if (recomputeReadiness(fx.inputs).overall !== fx.expected_overall) issues.push(`fixture ${fx.id} readiness mismatch`);
  if (d.security_review.some((t) => t.unresolved_remains !== 'certification_blocked=true')) issues.push('unresolved must stay certification_blocked');
  return { ok: issues.length === 0, issues };
}
export function verifyDossier(d: OwnerDecisionDossier): boolean { const { dossier_hash, ...rest } = d; return sha256(canonicalJson(rest)) === dossier_hash; }
export function dossierHasSecret(d: OwnerDecisionDossier): boolean { return /(access_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6}|sk-[a-z0-9]{6}|password=\S)/i.test(canonicalJson(d)); }
