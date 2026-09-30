// M4 — Compatibility Certification Harness types. Repository-side certification machinery only.
// It never certifies a real host by itself, never executes Claude, and never mutates the M1 registry.
import type { HostIdentity, ProbeResult, FeatureRequirement } from './hcl-types.ts';

export type ProbeOutcome = 'PASS' | 'FAIL' | 'NOT_RUN' | 'BLOCKED' | 'UNKNOWN';
export type GateOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';
export type LifecycleState =
  | 'NEW_RELEASE_SEEN' | 'UNVERIFIED' | 'PROBING' | 'REGRESSION' | 'BEHAVIORAL_DIFF'
  | 'CERTIFICATION_REVIEW' | 'CERTIFIED' | 'PUBLISHED' | 'FAILED' | 'BLOCKED' | 'REVOKED';
export type CertificationDecision = 'CERTIFIED' | 'NOT_CERTIFIED' | 'BLOCKED' | 'FAILED' | 'REVOKED';
export type RegressionResult = 'NO_BEHAVIORAL_CHANGE' | 'BEHAVIORAL_CHANGE' | 'INCONCLUSIVE';

export interface Probe {
  probe_id: string;
  kind: 'capability' | 'facet' | 'attribution' | 'stream';
  target: string;                 // capability id / facet family / 'attr@1' / 'stream_schema@1'
  profile_id: string | null;
  preconditions: string[];
  input: string;
  expected_observation: string;
  actual_observation: string;
  result: ProbeOutcome;
  evidence_ref: string | null;
  timestamp: string;
  probe_version: string;
  failure_reason: string | null;
}

export interface Gate { gate_id: string; name: string; mandatory: boolean; result: GateOutcome; reasons: string[] }

export interface EvidenceRecord {
  schema: 'dkskill.certification_evidence/1';
  evidence_id: string;
  environment_id: string | null;
  host_identity: HostIdentity;
  profile_id: string | null;
  probe_id: string | null;
  observed_result: string;
  source: string;
  timestamp: string;
  input_hash: string | null;
  output_hash: string | null;
  previous_record_hash: string | null;
  redaction_status: 'REDACTED' | 'NONE';
  validation_status: string;
  record_hash?: string;
}

export interface Environment {
  environment_id: string;
  environment_type: string;        // e.g. 'certification' (separate from Phase 4 'benchmark')
  platform: string | null;
  architecture: string | null;
  isolation_evidence: string | null;
  network_isolation_status: 'VERIFIED' | 'NOT_VALIDATED' | 'FAILED' | null;
  auth_reference: string | null;   // non-secret reference only
  created_at: string;
}

export interface OwnerReview {
  reviewer: string;
  profile_id: string;
  review_status: 'APPROVED' | 'REJECTED' | 'PENDING';
  reviewed_evidence: string[];
  reviewed_limitations: string[];
  decision: 'APPROVE' | 'REJECT' | 'DEFER';
  timestamp: string;
}

export interface ProposedUpdate {
  profile_id: string;
  proposed_state: CertificationDecision;
  evidence: string[];
  changed_facets: string[];
  capability_changes: { capability_id: string; from: string; to: string }[];
  reason: string;
}

export interface CertificationResult {
  schema: 'dkskill.certification_result/1';
  version: 1;
  synthetic: boolean;              // true => SYNTHETIC_TEST_ONLY, never a real certification
  run_id: string;
  environment_id: string | null;
  host_identity: HostIdentity;
  profile_id: string | null;
  lifecycle_state: LifecycleState;
  hcl_enforcement: string;        // the M3 HCL decision (never bypassed)
  probe_results: Probe[];
  gate_results: Gate[];
  capability_results: unknown[];
  facet_results: unknown[];
  regression: { result: RegressionResult; diffs: string[] };
  limitations: string[];
  evidence_refs: string[];
  owner_review: OwnerReview | null;
  final_decision: CertificationDecision;
  reason_codes: string[];
  proposed_update: ProposedUpdate | null;
}

export interface CertificationInput {
  probe: ProbeResult;
  registry?: unknown;
  feature?: FeatureRequirement;
  environment: Environment | null;
  capabilityProbes: Probe[];
  facetProbes: Probe[];
  attributionProbe: Probe | null;
  streamProbe: Probe | null;
  ts07: { resolved: boolean; evidence_ref: string | null };
  ts11: { applicable: boolean; resolved: boolean; evidence_ref: string | null };
  regression: { result: RegressionResult; diffs: string[] };
  evidence: EvidenceRecord[];
  ownerReview: OwnerReview | null;
  clock: () => string;
  run_id: string;
  synthetic?: boolean;
}
