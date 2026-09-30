// M12-PREP — Network-Isolation Environment Preparation (under M12-AUTH) types.
// Repository-local, deterministic, FAIL-CLOSED. Records the preparation DECISION and change-control ledger. It never
// executes Claude, authenticates, spends, runs TS-07/TS-11/Run A/benchmark, certifies, publishes, or mutates the
// registry. It never emits VERIFIED and never transitions M8 to READY. A genuine independent observer that is NOT the
// host self-report is REQUIRED to prepare; if it cannot be established, the result is BLOCKED and NO OS/network
// change is performed (per the M12-AUTH fail-closed STOP conditions).
import type { HostIdentity } from './hcl-types.ts';

export type PrepFinalState = 'PREPARED_FOR_L4_VERIFICATION' | 'BLOCKED' | 'FAILED';   // never VERIFIED
export type ApplyOutcome = 'NOT_ATTEMPTED' | 'APPLIED' | 'FAILED';
export type PrepEvidenceClass = 'CONFIGURATION_EVIDENCE' | 'HOST_OBSERVATION' | 'CONTROLLED_BEHAVIOR' | 'INDEPENDENT_VERIFICATION';
export type M9Result = 'UNVERIFIED' | 'FAILED' | 'BLOCKED';   // preparation can never emit VERIFIED

export interface PrepAuthorization {
  schema: 'dkskill.network_isolation_prep_authorization/1';
  version: 1;
  authorization_id: string;
  owner: string;
  organization: string;
  project: string;
  scope: 'NETWORK_ISOLATION_ENVIRONMENT_PREPARATION_ONLY';
  environment_id: string;
  target_profile_id: string;
  // Explicit NOT-authorized set (mirrors M12-AUTH mandatory limitations).
  claude_execution_authorized: false;
  authentication_authorized: false;
  ts07_authorized: false;
  ts11_authorized: false;
  run_a_authorized: false;
  benchmark_authorized: false;
  certification_authorized: false;
  publication_authorized: false;
  registry_mutation_authorized: false;
  timestamp: string;
}

export interface IndependentObserver {
  proposed: boolean;
  identity: string | null;
  enforcement_identity: string | null;     // who enforces the boundary (must differ from the observer)
  observation_mechanism: string | null;
  is_same_host_self_report: boolean;        // true => NOT independent (rejected)
  external: boolean;                        // observer lives outside the enforced environment
  binds_to_environment: boolean;            // observations bound to PTPL-DK-BENCH-WIN-01
  freshness_established: boolean;
  tamper_protected: boolean;
}

export interface PlannedChange {
  schema: 'dkskill.network_isolation_prep_change/1';
  change_id: string;
  operation: string;
  reason: string;
  component: string;
  previous_state: string;
  new_state: string;
  authorization_scope: string;
  rollback_operation: string;
  applied: boolean;                         // false for the REAL host in this milestone (nothing was applied)
  synthetic_only: boolean;
  verification_result: string;
  timestamp: string;
}

export interface IsolationBoundary {
  establishable: boolean;
  minimal: boolean;                         // minimum necessary, not host-wide overbroad
  requires_overbroad_change: boolean;
  demonstrates_denied_connectivity: boolean;
  enforcement_actually_enforced: boolean;
}

export interface PrepPlan {
  schema: 'dkskill.network_isolation_prep_plan/1';
  option_id: string;
  option_name: string;
  independence_rationale: string;
  required_changes: PlannedChange[];        // planned; only applied when a genuine observer exists (synthetic demos)
  boundary: IsolationBoundary;
  observer: IndependentObserver;
}

export interface PrepResult {
  schema: 'dkskill.network_isolation_prep_result/1';
  version: 1;
  synthetic_test_only: boolean;
  prep_id: string;
  environment_id: string;
  target_profile_id: string;
  authorization: PrepAuthorization;
  plan: PrepPlan;
  final_state: PrepFinalState;
  independent_observer_established: boolean;
  changes_applied: PlannedChange[];         // for the REAL host: empty (no OS/network change performed)
  rollback_ledger: { change_id: string; rollback_operation: string }[];
  evidence_class_of_preparation: PrepEvidenceClass;   // NEVER INDEPENDENT_VERIFICATION for preparation
  m9_state_observed: 'UNVERIFIED';
  m8_state_observed: 'EXECUTION_BLOCKED';
  stop_reasons: string[];
  limitations: string[];
  future_l4_still_required: string[];
  network_isolation: 'UNVERIFIED';          // preparation never verifies
  timestamp: string;
  audit_hash?: string;
}

export interface PrepAudit {
  schema: 'dkskill.network_isolation_prep_audit/1';
  version: 1;
  audit_id: string;
  prep_id: string;
  environment_id: string;
  final_state: PrepFinalState;
  independent_observer_established: boolean;
  changes_applied_count: number;
  m9_state: string;
  m8_state: string;
  timestamp: string;
  previous_record_hash: string | null;
  record_hash?: string;
}
