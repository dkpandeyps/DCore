// M11 — Independently Verifiable Network-Isolation Path Assessment types.
// DESIGN / READINESS ASSESSMENT ONLY. Repository-local, deterministic, FAIL-CLOSED. It never executes Claude,
// authenticates, spends, contacts a network, changes OS/network configuration, modifies M8/M9/registry, certifies,
// or publishes. It never marks the current real environment VERIFIED: the real baseline is immutably UNVERIFIED /
// L0 / independence=false. It only assesses the concrete path that COULD produce genuine M9-L4 evidence, and every
// environment-changing prerequisite is recorded as REQUIRES_SEPARATE_AUTHORIZATION (never performed).
import type { HostIdentity } from './hcl-types.ts';

export type VerificationLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

// How independent a candidate evidence source is (drives whether it can contribute to M9 L4).
export type IndependenceClass =
  | 'SELF_REPORTED' | 'CONFIGURATION_OBSERVED' | 'HOST_STATE_OBSERVED' | 'CONTROLLED_BEHAVIOR_OBSERVED'
  | 'INDEPENDENT_OBSERVER' | 'EXTERNAL_CONTROL_PLANE' | 'SYNTHETIC_ONLY' | 'INFERRED' | 'UNKNOWN';

export type Signal = 'ISOLATION_SUPPORTING' | 'LEAK_OBSERVED' | 'UNKNOWN_TRAFFIC' | 'NEUTRAL';
export type FreshnessState = 'FRESH' | 'STALE' | 'EXPIRED' | 'UNKNOWN';

// Fail-closed path status. VERIFIED is intentionally NOT a member: M11 never verifies anything.
export type PathStatus =
  | 'FEASIBLE_WITH_PREREQUISITES' | 'BLOCKED_BY_MISSING_INDEPENDENT_OBSERVER' | 'BLOCKED_BY_ENVIRONMENT'
  | 'BLOCKED_BY_REQUIRED_CONFIGURATION_CHANGE' | 'UNVERIFIED' | 'UNKNOWN';

export type AuthorizationTag = 'REQUIRES_SEPARATE_AUTHORIZATION' | 'NONE';
export type M9Result = 'UNVERIFIED' | 'FAILED' | 'BLOCKED';   // M11 can never emit VERIFIED to M9/M8

export interface PathAssessmentRequest {
  schema: 'dkskill.network_isolation_path_assessment/1';
  version: 1;
  request_id: string;
  environment_id: string;
  target_profile_id: string;
  host_identity: HostIdentity;
  os: string | null;
  architecture: string | null;
  requested_at: string;
}

export interface PathRequirement {
  schema: 'dkskill.network_isolation_path_requirement/1';
  requirement_id: string;
  name: string;
  category: string;
  description: string;
  required_for_l4: boolean;
}

export interface PathEvidenceSource {
  source_id: string;
  description: string;
  independence_class: IndependenceClass;
  signal: Signal;
  observed_at: string | null;
  expires_at: string | null;
  max_age_ms: number | null;
  revoked: boolean;
  applicable: boolean;
  enforcement_demonstrated: boolean;      // does the source show the denial is actually ENFORCED (not just configured)?
}

export interface IndependenceFinding {
  source_id: string;
  independence_class: IndependenceClass;
  supportable_level: VerificationLevel;
  can_contribute_to_l4: boolean;
  freshness: FreshnessState;
  note: string;
}

export interface PathOption {
  schema: 'dkskill.network_isolation_path_option/1';
  option_id: string;
  name: string;
  architecture: string;
  enforcement_point: string;
  observation_point: string;
  controls_enforcement: string;
  observes_enforcement: string;
  observer_independent: boolean;
  evidence_produced: string;
  m9_level_supported: VerificationLevel;
  additional_evidence_for_l4: string[];
  requires_config_change: boolean;
  requires_external_infra: boolean;
  coexists_with_benchmark_isolation: boolean;
  false_positive_risks: string[];
  unresolved_gaps: string[];
  prerequisites: string[];
  authorization: AuthorizationTag;
  path_status: PathStatus;
}

export interface PathGap {
  schema: 'dkskill.network_isolation_path_gap/1';
  requirement_id: string;
  requirement: string;
  current_evidence: string;
  required_evidence: string;
  current_level: VerificationLevel;
  gap: string;
  can_m11_close: false;                   // M11 changes nothing
  future_authorization_required: boolean;
  blocking: boolean;
}

export interface EvidencePlanStep { step: string; detail: string }
export interface PathEvidencePlan {
  schema: 'dkskill.network_isolation_path_evidence_plan/1';
  hypothetical: true;
  prerequisite_environment: string;
  isolation_boundary: string;
  enforcement_mechanism: string;
  independent_observer: string;
  controlled_test: string;
  expected_observations: string[];
  evidence_artifacts: string[];
  provenance: string;
  hashing: string;
  freshness: string;
  contradiction_handling: string;
  m9_validation: string;
  m8_consumption: string;
  steps: EvidencePlanStep[];
  requires_new_owner_authorization: true;
}

export interface PathAssessment {
  schema: 'dkskill.network_isolation_path_assessment/1';
  version: 1;
  synthetic_test_only: boolean;
  assessment_id: string;
  environment_id: string;
  target_profile_id: string;
  m9_state_observed: string;
  m8_state_observed: string;
  requirements: PathRequirement[];
  options: PathOption[];
  independence_findings: IndependenceFinding[];
  gap_matrix: PathGap[];
  evidence_classes_assessed: IndependenceClass[];
  evidence_plan: PathEvidencePlan;
  path_status: PathStatus;
  supportable_level: VerificationLevel;         // design-time: highest level the assessed evidence COULD support
  would_support_l4: boolean;
  // Immutable REAL baseline — M11 never changes these:
  current_real_network_isolation: 'UNVERIFIED';
  current_real_achieved_level: 'L0';
  current_real_independence_satisfied: false;
  future_authorizations_required: string[];
  contradictions: string[];
  limitations: string[];
  reasons: string[];
  audit_hash?: string;
}

export interface PathAudit {
  schema: 'dkskill.network_isolation_path_audit/1';
  version: 1;
  audit_id: string;
  assessment_id: string;
  environment_id: string;
  m9_state: string;
  m8_state: string;
  requirements_assessed: number;
  options_assessed: number;
  evidence_classes: IndependenceClass[];
  gaps: number;
  path_status: PathStatus;
  artifact_hashes: string[];
  timestamp: string;
  previous_record_hash: string | null;
  record_hash?: string;
}
