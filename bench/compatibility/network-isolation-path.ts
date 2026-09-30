// M11 — Independently Verifiable Network-Isolation Path Assessment engine.
// DESIGN / READINESS ASSESSMENT ONLY. Pure, deterministic, FAIL-CLOSED, repository-local. No network, no shell, no
// OS/network change, no Claude, no auth, no spend. It never emits VERIFIED for the real environment and never feeds
// a VERIFIED result to M8/M9. It preserves the M9 L4 definition (INDEPENDENT_VERIFICATION + OBSERVED + FRESH +
// in-scope + isolation-supporting + non-revoked + no contradiction) — reused via assessFreshness — and records every
// environment-changing prerequisite as REQUIRES_SEPARATE_AUTHORIZATION without performing it.
import { sha256, canonicalJson } from '../src/canonical.ts';
import { assessFreshness, FROZEN_HOST, FROZEN_ENVIRONMENT } from './network-isolation.ts';
import type {
  PathAssessmentRequest, PathRequirement, PathEvidenceSource, IndependenceFinding, PathOption, PathGap,
  PathEvidencePlan, PathAssessment, PathAudit, PathStatus, IndependenceClass, VerificationLevel, M9Result,
} from './network-isolation-path-types.ts';

export const TARGET_PROFILE = 'cc-2.1.283-win32-x64-native@1';

// Independence class -> M9 level it can support, and whether it can contribute to L4 (only genuine independence can).
const CLASS_LEVEL: Record<IndependenceClass, VerificationLevel> = {
  SELF_REPORTED: 'L0', CONFIGURATION_OBSERVED: 'L1', HOST_STATE_OBSERVED: 'L2', CONTROLLED_BEHAVIOR_OBSERVED: 'L3',
  INDEPENDENT_OBSERVER: 'L4', EXTERNAL_CONTROL_PLANE: 'L4', SYNTHETIC_ONLY: 'L0', INFERRED: 'L0', UNKNOWN: 'L0',
};
export function canContributeToL4(c: IndependenceClass): boolean { return c === 'INDEPENDENT_OBSERVER' || c === 'EXTERNAL_CONTROL_PLANE'; }
const RANK: Record<VerificationLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };

// ---- requirement catalogue (fixed) ------------------------------------------------------------------------
export function buildRequirements(): PathRequirement[] {
  const r = (requirement_id: string, name: string, category: string, description: string, required_for_l4 = true): PathRequirement =>
    ({ schema: 'dkskill.network_isolation_path_requirement/1', requirement_id, name, category, description, required_for_l4 });
  return [
    r('REQ-01', 'environment identity', 'binding', 'exact PTPL-DK-BENCH-WIN-01 identity'),
    r('REQ-02', 'exact target profile', 'binding', 'cc-2.1.283-win32-x64-native@1'),
    r('REQ-03', 'host/platform binding', 'binding', 'exact host/platform/arch'),
    r('REQ-04', 'isolation boundary', 'enforcement', 'a defined boundary at which egress is denied'),
    r('REQ-05', 'network-control authority', 'enforcement', 'an authority that controls the boundary'),
    r('REQ-06', 'enforcement point', 'enforcement', 'the point where denial is enforced'),
    r('REQ-07', 'observation source', 'observation', 'a source that observes enforcement'),
    r('REQ-08', 'observation independence', 'observation', 'the observer is not the enforcer/self'),
    r('REQ-09', 'controlled test capability', 'observation', 'ability to attempt and observe a denied connection'),
    r('REQ-10', 'external observer or equivalent', 'observation', 'independent verifier or external control plane'),
    r('REQ-11', 'evidence provenance', 'evidence', 'who/what/when/where/how'),
    r('REQ-12', 'evidence freshness', 'evidence', 'fresh, non-stale, non-expired'),
    r('REQ-13', 'tamper evidence', 'evidence', 'hash-chained, tamper-detectable'),
    r('REQ-14', 'contradiction handling', 'evidence', 'material contradiction fails closed'),
    r('REQ-15', 'environment binding of evidence', 'binding', 'evidence bound to this environment'),
    r('REQ-16', 'scope binding', 'binding', 'claim never exceeds proven scope'),
    r('REQ-17', 'replay resistance', 'evidence', 'evidence cannot be replayed to fake current state', false),
    r('REQ-18', 'secret safety', 'safety', 'no secret persisted'),
    r('REQ-19', 'no self-attestation as sole proof', 'independence', 'self-report alone insufficient'),
    r('REQ-20', 'no inferred isolation', 'independence', 'absence of connections is not proof'),
    r('REQ-21', 'demonstrate denied connectivity', 'behavior', 'a real denied attempt is observed'),
    r('REQ-22', 'demonstrate denial is enforced', 'behavior', 'the denial is actually enforced, not just configured'),
    r('REQ-23', 'distinguish self-report from independent observation', 'independence', 'host self-report != independent'),
  ];
}

// ---- path option catalogue (assessment, not instructions) -------------------------------------------------
export function buildOptions(): PathOption[] {
  const o = (p: Omit<PathOption, 'schema'>): PathOption => ({ schema: 'dkskill.network_isolation_path_option/1', ...p });
  return [
    o({ option_id: 'OPT-EXT-EGRESS', name: 'infrastructure-level egress policy with independent observation', architecture: 'network/infrastructure enforces outbound-deny; a separate control plane independently observes and attests enforcement', enforcement_point: 'network/infrastructure egress', observation_point: 'external control plane / independent collector', controls_enforcement: 'infrastructure operator', observes_enforcement: 'independent control plane', observer_independent: true, evidence_produced: 'independently attested denied-egress observations', m9_level_supported: 'L4', additional_evidence_for_l4: ['fresh independent attestation bound to this environment', 'controlled denied-connection test observed by the independent plane'], requires_config_change: true, requires_external_infra: true, coexists_with_benchmark_isolation: true, false_positive_risks: ['attestation actually produced by the enforcer itself (not independent)', 'stale attestation replayed'], unresolved_gaps: ['no such infrastructure present on the current host'], prerequisites: ['provision infrastructure egress policy', 'provision independent control plane'], authorization: 'REQUIRES_SEPARATE_AUTHORIZATION', path_status: 'FEASIBLE_WITH_PREREQUISITES' }),
    o({ option_id: 'OPT-HYPERVISOR', name: 'hypervisor / VM-level network isolation with independent host observer', architecture: 'guest VM has no egress; the hypervisor host independently observes the guest has no outbound path', enforcement_point: 'hypervisor virtual network', observation_point: 'hypervisor host (outside the guest)', controls_enforcement: 'hypervisor', observes_enforcement: 'hypervisor host observer', observer_independent: true, evidence_produced: 'host-observed guest egress denial', m9_level_supported: 'L4', additional_evidence_for_l4: ['host observer attestation bound to the guest environment', 'controlled test from guest observed denied by host'], requires_config_change: true, requires_external_infra: true, coexists_with_benchmark_isolation: true, false_positive_risks: ['guest self-report mistaken for host observation'], unresolved_gaps: ['current environment is not a guest under an observing hypervisor'], prerequisites: ['provision VM with no egress', 'provision hypervisor-side observer'], authorization: 'REQUIRES_SEPARATE_AUTHORIZATION', path_status: 'FEASIBLE_WITH_PREREQUISITES' }),
    o({ option_id: 'OPT-HOST-PLUS-OBSERVER', name: 'host-level enforcement combined with an independent observation point', architecture: 'host firewall denies outbound; a separate, independent observer confirms denial', enforcement_point: 'host firewall (outbound-deny)', observation_point: 'independent observer outside the host', controls_enforcement: 'host admin', observes_enforcement: 'independent observer', observer_independent: true, evidence_produced: 'independently confirmed host egress denial', m9_level_supported: 'L4', additional_evidence_for_l4: ['independent observer (not the host) attests denial', 'outbound-deny policy actually enforced'], requires_config_change: true, requires_external_infra: true, coexists_with_benchmark_isolation: true, false_positive_risks: ['host self-inspection substituted for the independent observer', 'firewall configured but not enforced'], unresolved_gaps: ['no independent observer present', 'no outbound-deny policy present'], prerequisites: ['configure host outbound-deny', 'provision an independent observer'], authorization: 'REQUIRES_SEPARATE_AUTHORIZATION', path_status: 'BLOCKED_BY_REQUIRED_CONFIGURATION_CHANGE' }),
    o({ option_id: 'OPT-NETNS-SANDBOX', name: 'controlled network namespace / sandbox boundary', architecture: 'process runs in a sandbox/namespace with no egress; independence depends on who observes it', enforcement_point: 'namespace/sandbox network', observation_point: 'depends (self vs external)', controls_enforcement: 'sandbox runtime', observes_enforcement: 'undetermined — must be independent', observer_independent: false, evidence_produced: 'process-scoped egress denial', m9_level_supported: 'L3', additional_evidence_for_l4: ['an INDEPENDENT observer of the sandbox (not the sandbox self-report)'], requires_config_change: true, requires_external_infra: false, coexists_with_benchmark_isolation: true, false_positive_risks: ['sandbox self-report treated as independent', 'scope broadened from PROCESS_ONLY to HOST_ONLY'], unresolved_gaps: ['no independent observer of the sandbox', 'scope is process-only, not host-only'], prerequisites: ['provision sandbox', 'provision independent observer of the sandbox'], authorization: 'REQUIRES_SEPARATE_AUTHORIZATION', path_status: 'BLOCKED_BY_MISSING_INDEPENDENT_OBSERVER' }),
    o({ option_id: 'OPT-SEPARATE-OBSERVER', name: 'separate observer environment', architecture: 'a dedicated observer environment watches the target’s egress from outside', enforcement_point: 'must exist elsewhere', observation_point: 'separate observer environment', controls_enforcement: 'undetermined', observes_enforcement: 'separate observer', observer_independent: true, evidence_produced: 'independent observation of egress attempts', m9_level_supported: 'L4', additional_evidence_for_l4: ['a real enforcement boundary to observe', 'controlled denied-connection test'], requires_config_change: true, requires_external_infra: true, coexists_with_benchmark_isolation: true, false_positive_risks: ['observing an environment that is not actually the target', 'no enforcement to observe'], unresolved_gaps: ['no enforcement boundary present to observe'], prerequisites: ['provision enforcement boundary', 'provision separate observer environment'], authorization: 'REQUIRES_SEPARATE_AUTHORIZATION', path_status: 'BLOCKED_BY_ENVIRONMENT' }),
    o({ option_id: 'OPT-DEDICATED-MACHINE', name: 'dedicated isolated machine/environment', architecture: 'a dedicated machine with enforced no-egress plus an independent verifier', enforcement_point: 'dedicated machine network boundary', observation_point: 'independent verifier', controls_enforcement: 'environment owner', observes_enforcement: 'independent verifier', observer_independent: true, evidence_produced: 'independently verified no-egress on a dedicated machine', m9_level_supported: 'L4', additional_evidence_for_l4: ['fresh independent verification bound to the dedicated environment', 'controlled test showing enforced denial'], requires_config_change: true, requires_external_infra: true, coexists_with_benchmark_isolation: true, false_positive_risks: ['reusing the current non-isolated host', 'self-attestation'], unresolved_gaps: ['current host is not a dedicated isolated machine'], prerequisites: ['provision dedicated isolated machine', 'provision independent verifier'], authorization: 'REQUIRES_SEPARATE_AUTHORIZATION', path_status: 'FEASIBLE_WITH_PREREQUISITES' }),
  ];
}

// ---- independence classification of candidate sources ------------------------------------------------------
export function classifySources(sources: PathEvidenceSource[], now: string): IndependenceFinding[] {
  return sources.map((s) => {
    const freshness = s.revoked ? 'UNKNOWN' : assessFreshness(s.observed_at, s.expires_at, s.max_age_ms, now);
    const usable = canContributeToL4(s.independence_class) && s.signal === 'ISOLATION_SUPPORTING' && freshness === 'FRESH' && s.applicable && !s.revoked && s.enforcement_demonstrated;
    return {
      source_id: s.source_id, independence_class: s.independence_class, supportable_level: usable ? 'L4' : CLASS_LEVEL[s.independence_class],
      can_contribute_to_l4: usable, freshness,
      note: canContributeToL4(s.independence_class)
        ? (usable ? 'independent + fresh + enforcement-demonstrated: can contribute to L4' : 'independent class but not usable (stale/expired/revoked/not-applicable/not-enforced/not-isolation-supporting)')
        : `class ${s.independence_class} can never contribute to L4 (host self-report / configuration / inference / synthetic are not independent)`,
    };
  });
}

// ---- assessment (fail-closed; never VERIFIED for the real environment) --------------------------------------
export function assessPath(input: {
  request: PathAssessmentRequest; sources: PathEvidenceSource[]; now: string; synthetic_test_only?: boolean;
  environment_matches?: boolean; profile_matches?: boolean; tampered?: boolean;
  outbound_connections_observed?: boolean; outbound_deny_policy_observed?: boolean;
}): PathAssessment {
  const req = input.request;
  const environment_matches = input.environment_matches ?? (req.environment_id === FROZEN_ENVIRONMENT);
  const profile_matches = input.profile_matches ?? (req.target_profile_id === TARGET_PROFILE);
  const findings = classifySources(input.sources, input.now);
  const requirements = buildRequirements();
  const options = buildOptions();

  // Contradiction: any fresh, applicable leak/unknown-traffic while an isolation source is present.
  const freshLeak = input.sources.some((s, i) => (s.signal === 'LEAK_OBSERVED' || s.signal === 'UNKNOWN_TRAFFIC') && s.applicable && findings[i].freshness === 'FRESH');
  const isolationPresent = input.sources.some((s) => s.signal === 'ISOLATION_SUPPORTING');
  const contradictions: string[] = [];
  if (freshLeak && isolationPresent) contradictions.push('CONTRADICTION: isolation-supporting evidence present alongside fresh leak/unknown-traffic observation');
  if (input.outbound_connections_observed && input.outbound_deny_policy_observed) contradictions.push('CONTRADICTION: outbound-deny policy observed but active outbound connections present');

  const usableIndependent = findings.some((f) => f.can_contribute_to_l4);
  const independentClassPresent = input.sources.some((s) => canContributeToL4(s.independence_class));

  let path_status: PathStatus;
  if (!environment_matches || !profile_matches) path_status = 'BLOCKED_BY_ENVIRONMENT';
  else if (input.tampered) path_status = 'UNKNOWN';
  else if (contradictions.length) path_status = 'UNVERIFIED';
  else if (usableIndependent) path_status = 'FEASIBLE_WITH_PREREQUISITES';
  else if (independentClassPresent) path_status = 'BLOCKED_BY_REQUIRED_CONFIGURATION_CHANGE';   // observer present but not fresh/enforced
  else path_status = 'BLOCKED_BY_MISSING_INDEPENDENT_OBSERVER';

  const supportable_level: VerificationLevel = findings.reduce<VerificationLevel>((best, f) => RANK[f.supportable_level] > RANK[best] ? f.supportable_level : best, 'L0');
  const would_support_l4 = usableIndependent && path_status === 'FEASIBLE_WITH_PREREQUISITES';

  const gap_matrix = buildGapMatrix(requirements, { environment_matches, profile_matches, usableIndependent, independentClassPresent, outbound: input.outbound_connections_observed ?? false, deny: input.outbound_deny_policy_observed ?? false });
  const future_authorizations_required = collectAuthorizations(options, gap_matrix);
  const evidence_plan = buildEvidencePlan();
  const reasons = buildReasons(path_status, usableIndependent, independentClassPresent, contradictions);

  const base: Omit<PathAssessment, 'audit_hash'> = {
    schema: 'dkskill.network_isolation_path_assessment/1', version: 1, synthetic_test_only: input.synthetic_test_only ?? false,
    assessment_id: `path-${req.request_id}`, environment_id: req.environment_id, target_profile_id: req.target_profile_id,
    m9_state_observed: 'UNVERIFIED', m8_state_observed: 'EXECUTION_BLOCKED (STOP-NETWORK-UNVERIFIED)',
    requirements, options, independence_findings: findings, gap_matrix,
    evidence_classes_assessed: [...new Set(input.sources.map((s) => s.independence_class))],
    evidence_plan, path_status, supportable_level, would_support_l4,
    current_real_network_isolation: 'UNVERIFIED', current_real_achieved_level: 'L0', current_real_independence_satisfied: false,
    future_authorizations_required, contradictions,
    limitations: ['M11 is assessment/design only; it changes nothing and verifies nothing. The current real environment remains UNVERIFIED / L0.'],
    reasons,
  };
  return { ...base, audit_hash: sha256(canonicalJson(base)) };
}

function buildReasons(status: PathStatus, usable: boolean, present: boolean, contradictions: string[]): string[] {
  const out = [`path_status=${status}`];
  if (contradictions.length) out.push(...contradictions);
  if (!usable && !present) out.push('no INDEPENDENT_OBSERVER / EXTERNAL_CONTROL_PLANE source: host self-inspection, configuration, host-state, controlled-behavior, inference, and synthetic sources cannot satisfy M9 L4');
  if (present && !usable) out.push('an independent-class source exists but is not usable (stale/expired/revoked/not-applicable/not-enforced), or enforcement is not yet in place — requires configuration change');
  return out;
}

// ---- gap matrix -------------------------------------------------------------------------------------------
export function buildGapMatrix(requirements: PathRequirement[], facts: { environment_matches: boolean; profile_matches: boolean; usableIndependent: boolean; independentClassPresent: boolean; outbound: boolean; deny: boolean }): PathGap[] {
  const gap = (r: PathRequirement, current_evidence: string, current_level: VerificationLevel, gapText: string, future_authorization_required: boolean, blocking: boolean): PathGap =>
    ({ schema: 'dkskill.network_isolation_path_gap/1', requirement_id: r.requirement_id, requirement: r.name, current_evidence, required_evidence: r.description, current_level, gap: gapText, can_m11_close: false, future_authorization_required, blocking });
  const byId = new Map(requirements.map((r) => [r.requirement_id, r]));
  const rows: PathGap[] = [
    gap(byId.get('REQ-04')!, facts.deny ? 'outbound-deny observed' : 'no outbound-deny policy observed (M10)', 'L0', facts.deny ? 'none' : 'no isolation boundary exists', true, !facts.deny),
    gap(byId.get('REQ-06')!, 'no enforcement point present', 'L0', 'enforcement point must be provisioned', true, true),
    gap(byId.get('REQ-08')!, facts.usableIndependent ? 'independent observer available' : 'no independent observer', facts.usableIndependent ? 'L4' : 'L0', facts.usableIndependent ? 'none' : 'independent observer absent', true, !facts.usableIndependent),
    gap(byId.get('REQ-10')!, facts.independentClassPresent ? 'independent-class source present' : 'no external observer / control plane', facts.independentClassPresent ? 'L4' : 'L0', facts.independentClassPresent ? 'must be fresh + enforcement-demonstrated' : 'external observer / control plane absent', true, !facts.usableIndependent),
    gap(byId.get('REQ-21')!, facts.outbound ? 'active outbound connections observed (M10)' : 'no denied-connection test observed', 'L0', 'a controlled denied-connection test must be observed', true, true),
    gap(byId.get('REQ-22')!, 'denial not demonstrated as enforced', 'L0', 'enforcement (not mere configuration) must be demonstrated', true, true),
    gap(byId.get('REQ-01')!, facts.environment_matches ? 'environment matches PTPL-DK-BENCH-WIN-01' : 'environment mismatch', facts.environment_matches ? 'L1' : 'L0', facts.environment_matches ? 'none' : 'evidence not bound to this environment', false, !facts.environment_matches),
    gap(byId.get('REQ-02')!, facts.profile_matches ? 'profile matches' : 'profile mismatch', facts.profile_matches ? 'L1' : 'L0', facts.profile_matches ? 'none' : 'evidence not bound to the target profile', false, !facts.profile_matches),
  ];
  return rows;
}
function collectAuthorizations(options: PathOption[], gaps: PathGap[]): string[] {
  const set = new Set<string>();
  for (const o of options) if (o.authorization === 'REQUIRES_SEPARATE_AUTHORIZATION') for (const p of o.prerequisites) set.add(`${o.option_id}: ${p} (REQUIRES_SEPARATE_AUTHORIZATION)`);
  for (const g of gaps) if (g.future_authorization_required && g.blocking) set.add(`${g.requirement_id}: close "${g.gap}" (REQUIRES_SEPARATE_AUTHORIZATION)`);
  return [...set].sort();
}

// ---- hypothetical future evidence plan (never executed) ----------------------------------------------------
export function buildEvidencePlan(): PathEvidencePlan {
  return {
    schema: 'dkskill.network_isolation_path_evidence_plan/1', hypothetical: true,
    prerequisite_environment: 'a dedicated environment with an enforced egress-deny boundary, provisioned under a separate owner authorization',
    isolation_boundary: 'outbound-deny at an enforcement point outside the observed process (infrastructure, hypervisor, or dedicated host)',
    enforcement_mechanism: 'egress policy actually enforced (not merely configured)',
    independent_observer: 'an observer that is NOT the enforcer and NOT the host self-report (external control plane / hypervisor host / separate observer environment)',
    controlled_test: 'a controlled outbound-connection attempt that is observed to be denied by the independent observer',
    expected_observations: ['denied outbound attempt observed independently', 'no successful egress', 'enforcement confirmed active at test time'],
    evidence_artifacts: ['independent observer attestation', 'controlled-test transcript (metadata only)', 'enforcement-state observation'],
    provenance: 'who/what/when/where/how, bound to environment + profile, verifier identity recorded',
    hashing: 'raw + normalized SHA-256; hash-chained audit',
    freshness: 'observed_at + expiry; stale/expired cannot verify',
    contradiction_handling: 'any leak/unknown-traffic during the test fails closed',
    m9_validation: 'submit as an M9 INDEPENDENT_VERIFICATION observation; M9 runVerification decides VERIFIED (L4) — never weakened',
    m8_consumption: 'only a genuine M9 VERIFIED result may satisfy M8 EP-13; a further explicit M8 authorization and full preflight are still required',
    steps: [
      { step: '1. authorize', detail: 'obtain a new explicit owner authorization for environment provisioning + evidence acquisition' },
      { step: '2. provision', detail: 'provision the enforced egress-deny boundary + independent observer (separate authorization)' },
      { step: '3. controlled test', detail: 'run a controlled denied-connection test observed independently' },
      { step: '4. collect', detail: 'collect independent attestation + enforcement observation (secret-safe, hashed)' },
      { step: '5. M9 validate', detail: 'run M9 verification; only genuine L4 yields VERIFIED' },
      { step: '6. M8 gate', detail: 'if VERIFIED, a separate M8 authorization + preflight may then be sought' },
    ],
    requires_new_owner_authorization: true,
  };
}

// ---- adapters (fail-closed; M11 can NEVER emit VERIFIED to M9/M8) -------------------------------------------
export function pathAssessmentToM9(_a: PathAssessment): M9Result { return 'UNVERIFIED'; }
export function pathAssessmentToM8(_a: PathAssessment): 'UNVERIFIED' { return 'UNVERIFIED'; }

// ---- audit chain ------------------------------------------------------------------------------------------
export function auditRecordHash(rec: Omit<PathAudit, 'record_hash'>): string { return sha256(canonicalJson(rec)); }
export function buildAuditRecord(a: PathAssessment, now: string, artifact_hashes: string[] = [], previous_record_hash: string | null = null): PathAudit {
  const base: Omit<PathAudit, 'record_hash'> = {
    schema: 'dkskill.network_isolation_path_audit/1', version: 1, audit_id: `audit-${a.assessment_id}`, assessment_id: a.assessment_id,
    environment_id: a.environment_id, m9_state: a.m9_state_observed, m8_state: a.m8_state_observed,
    requirements_assessed: a.requirements.length, options_assessed: a.options.length, evidence_classes: a.evidence_classes_assessed,
    gaps: a.gap_matrix.length, path_status: a.path_status, artifact_hashes, timestamp: now, previous_record_hash,
  };
  return { ...base, record_hash: auditRecordHash(base) };
}
export function chainAuditRecords(records: Omit<PathAudit, 'record_hash' | 'previous_record_hash'>[]): PathAudit[] {
  const out: PathAudit[] = []; let prev: string | null = null;
  for (const r of records) { const b = { ...r, previous_record_hash: prev } as Omit<PathAudit, 'record_hash'>; const record_hash = auditRecordHash(b); out.push({ ...b, record_hash }); prev = record_hash; }
  return out;
}
export function verifyAuditChain(records: PathAudit[]): boolean {
  let prev: string | null = null;
  for (const r of records) { if (r.previous_record_hash !== prev) return false; const { record_hash, ...rest } = r; if (auditRecordHash(rest) !== record_hash) return false; prev = record_hash!; }
  return true;
}
