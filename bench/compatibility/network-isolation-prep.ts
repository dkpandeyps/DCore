// M12-PREP — Network-Isolation Environment Preparation engine (under M12-AUTH).
// Pure, deterministic, FAIL-CLOSED, repository-local. No network, no shell, no OS/network change, no Claude, no auth,
// no spend. It enforces the M12-AUTH STOP conditions: a genuine independent observer (NOT the host self-report) is
// REQUIRED; the boundary must be minimal (not overbroad) and demonstrate denied connectivity. If any condition fails,
// final_state = BLOCKED and NO change is applied. Preparation is never labelled L4/VERIFIED, and never transitions M8
// to READY. M9 remains the L4 authority. On the REAL single host no independent observer exists, so the real result
// is BLOCKED with zero changes applied.
import { sha256, canonicalJson } from '../src/canonical.ts';
import { FROZEN_ENVIRONMENT } from './network-isolation.ts';
import { TARGET_PROFILE } from './network-isolation-path.ts';
import type {
  PrepAuthorization, PrepPlan, PrepResult, PrepFinalState, IndependentObserver, IsolationBoundary, PlannedChange,
  ApplyOutcome, PrepAudit, M9Result, PrepEvidenceClass,
} from './network-isolation-prep-types.ts';

export function buildAuthorization(now: string): PrepAuthorization {
  return {
    schema: 'dkskill.network_isolation_prep_authorization/1', version: 1, authorization_id: 'M12-AUTH',
    owner: 'DK Pandey', organization: 'PTPL', project: 'dkskill', scope: 'NETWORK_ISOLATION_ENVIRONMENT_PREPARATION_ONLY',
    environment_id: FROZEN_ENVIRONMENT, target_profile_id: TARGET_PROFILE,
    claude_execution_authorized: false, authentication_authorized: false, ts07_authorized: false, ts11_authorized: false,
    run_a_authorized: false, benchmark_authorized: false, certification_authorized: false, publication_authorized: false,
    registry_mutation_authorized: false, timestamp: now,
  };
}

// A genuine independent observer: proposed, external, not the host self-report, with a real mechanism, bound to the
// environment, fresh, and tamper-protected. Anything else is NOT independent (fail-closed).
export function observerIsIndependent(o: IndependentObserver): boolean {
  return o.proposed && o.external && !o.is_same_host_self_report && !!o.identity && !!o.observation_mechanism &&
    !!o.enforcement_identity && o.enforcement_identity !== o.identity && o.binds_to_environment && o.freshness_established && o.tamper_protected;
}

export function runPreparation(input: {
  request: { environment_id: string; target_profile_id: string };
  plan: PrepPlan; now: string; apply_outcome?: ApplyOutcome; synthetic_test_only?: boolean;
}): PrepResult {
  const { plan } = input;
  const auth = buildAuthorization(input.now);
  const environment_matches = input.request.environment_id === FROZEN_ENVIRONMENT;
  const profile_matches = input.request.target_profile_id === TARGET_PROFILE;
  const observerOk = observerIsIndependent(plan.observer);
  const b: IsolationBoundary = plan.boundary;
  const stop_reasons: string[] = [];

  let final_state: PrepFinalState;
  if (!environment_matches || !profile_matches) { final_state = 'BLOCKED'; stop_reasons.push('environment/profile does not match the authorized target'); }
  else if (!plan.observer.proposed) { final_state = 'BLOCKED'; stop_reasons.push('no independent observer proposed — M12-AUTH STOP: "If an independent observer cannot be established, STOP"'); }
  else if (plan.observer.is_same_host_self_report) { final_state = 'BLOCKED'; stop_reasons.push('proposed observer is host self-report — rejected: the observer MUST NOT be the same host reporting its own configuration'); }
  else if (!observerOk) { final_state = 'BLOCKED'; stop_reasons.push('proposed observer is not genuinely independent (external/enforcer-distinct/bound/fresh/tamper-protected required)'); }
  else if (!b.establishable) { final_state = 'BLOCKED'; stop_reasons.push('isolation boundary cannot be established'); }
  else if (b.requires_overbroad_change || !b.minimal) { final_state = 'BLOCKED'; stop_reasons.push('boundary would require overbroad/unsafe host-wide changes — M12-AUTH STOP rather than weakening'); }
  else if (!b.demonstrates_denied_connectivity || !b.enforcement_actually_enforced) { final_state = 'BLOCKED'; stop_reasons.push('boundary cannot demonstrate ENFORCED denied outbound connectivity'); }
  else if (input.apply_outcome === 'FAILED') { final_state = 'FAILED'; stop_reasons.push('applying the prepared changes failed'); }
  else final_state = 'PREPARED_FOR_L4_VERIFICATION';

  // Changes are applied ONLY when preparation genuinely proceeds (synthetic demos). On the REAL host the observer is
  // absent, so final_state is BLOCKED and nothing is applied.
  const proceed = final_state === 'PREPARED_FOR_L4_VERIFICATION';
  const changes_applied = proceed ? plan.required_changes.map((c) => ({ ...c, applied: true })) : [];
  const rollback_ledger = changes_applied.map((c) => ({ change_id: c.change_id, rollback_operation: c.rollback_operation }));

  const base: Omit<PrepResult, 'audit_hash'> = {
    schema: 'dkskill.network_isolation_prep_result/1', version: 1, synthetic_test_only: input.synthetic_test_only ?? false,
    prep_id: `prep-${input.request.environment_id}`, environment_id: input.request.environment_id, target_profile_id: input.request.target_profile_id,
    authorization: auth, plan, final_state, independent_observer_established: proceed && observerOk,
    changes_applied, rollback_ledger,
    // Preparation is configuration/host-level at most — NEVER independent verification.
    evidence_class_of_preparation: 'CONFIGURATION_EVIDENCE',
    m9_state_observed: 'UNVERIFIED', m8_state_observed: 'EXECUTION_BLOCKED', stop_reasons,
    limitations: ['Preparation is not verification. Even PREPARED_FOR_L4_VERIFICATION is not L4: a separate M9 independent-verification session (new owner authorization) is required. M8 stays EXECUTION_BLOCKED.'],
    future_l4_still_required: [
      'a controlled denied-connection test observed by the independent observer',
      'fresh INDEPENDENT_VERIFICATION evidence submitted to M9 runVerification',
      'a separate explicit owner authorization for the real evidence session',
      'a separate M8 authorization + full preflight before any execution',
    ],
    network_isolation: 'UNVERIFIED', timestamp: input.now,
  };
  return { ...base, audit_hash: sha256(canonicalJson(base)) };
}

// ---- adapters (fail-closed; preparation can NEVER emit VERIFIED, never READY) -------------------------------
export function prepToM9(_r: PrepResult): M9Result { return 'UNVERIFIED'; }
export function prepToM8(_r: PrepResult): 'UNVERIFIED' { return 'UNVERIFIED'; }

// ---- audit chain ------------------------------------------------------------------------------------------
export function auditRecordHash(rec: Omit<PrepAudit, 'record_hash'>): string { return sha256(canonicalJson(rec)); }
export function buildAuditRecord(r: PrepResult, now: string, previous_record_hash: string | null = null): PrepAudit {
  const base: Omit<PrepAudit, 'record_hash'> = {
    schema: 'dkskill.network_isolation_prep_audit/1', version: 1, audit_id: `audit-${r.prep_id}`, prep_id: r.prep_id,
    environment_id: r.environment_id, final_state: r.final_state, independent_observer_established: r.independent_observer_established,
    changes_applied_count: r.changes_applied.length, m9_state: r.m9_state_observed, m8_state: r.m8_state_observed,
    timestamp: now, previous_record_hash,
  };
  return { ...base, record_hash: auditRecordHash(base) };
}
export function chainAuditRecords(records: Omit<PrepAudit, 'record_hash' | 'previous_record_hash'>[]): PrepAudit[] {
  const out: PrepAudit[] = []; let prev: string | null = null;
  for (const r of records) { const b = { ...r, previous_record_hash: prev } as Omit<PrepAudit, 'record_hash'>; const record_hash = auditRecordHash(b); out.push({ ...b, record_hash }); prev = record_hash; }
  return out;
}
export function verifyAuditChain(records: PrepAudit[]): boolean {
  let prev: string | null = null;
  for (const r of records) { if (r.previous_record_hash !== prev) return false; const { record_hash, ...rest } = r; if (auditRecordHash(rest) !== record_hash) return false; prev = record_hash!; }
  return true;
}
