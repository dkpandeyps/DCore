// M7 — Certification Evidence Acquisition & Real-Host Validation Orchestration types.
// Repository-side ORCHESTRATION + EVIDENCE-CONTROL data contract ONLY. It NEVER certifies a host, publishes a
// profile, mutates the production registry, authorizes/executes Run A, spends benchmark budget, executes Claude,
// authenticates, or resolves TS-07/TS-11. M7 PRODUCES evidence; M4 decides certification. Execution defaults to
// EXECUTION_DISABLED / DRY_RUN. Synthetic fixtures are SYNTHETIC_TEST_ONLY and can never become real evidence.
import type { HostIdentity } from './hcl-types.ts';
import type { EvidenceRecord } from './certification-types.ts';

// ---- states (every transition explicit) -------------------------------------------------------------------
export type EvidenceStatus =
  | 'REQUESTED' | 'AUTHORIZED' | 'PRECHECKING' | 'ACQUIRING' | 'CAPTURED' | 'NORMALIZING' | 'VALIDATING'
  | 'VALID' | 'INVALID' | 'INCOMPLETE' | 'BLOCKED' | 'EXPIRED' | 'REVOKED';
export type SessionState =
  | 'REQUESTED' | 'AUTHORIZED' | 'PRECHECKING' | 'READY' | 'ACQUIRING' | 'CAPTURED' | 'VALIDATING' | 'COMPLETE'
  | 'BLOCKED' | 'FAILED' | 'INVALID' | 'INCOMPLETE' | 'EXPIRED' | 'REVOKED';
export type AssertionState = 'ASSERTED' | 'SUPPORTED' | 'UNSUPPORTED' | 'CONTRADICTED' | 'UNKNOWN';
export type CompletenessState = 'COMPLETE' | 'INCOMPLETE' | 'BLOCKED' | 'INVALID';
export type PrecheckOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';
export type Ts07Status = 'VALID' | 'INCOMPLETE' | 'UNRESOLVED' | 'BLOCKED';
export type Ts11Result = 'VERIFIED' | 'NOT_VERIFIED' | 'INCOMPLETE' | 'BLOCKED' | 'NOT_APPLICABLE';
export type ExecutionMode = 'DRY_RUN' | 'EXECUTION_DISABLED' | 'LIVE';
export type RedactionStatus = 'NONE' | 'REDACTED';
export type ValidityStatus = 'VALID' | 'EXPIRED' | 'REVOKED';

// ---- evidence classes (defined != verified) ---------------------------------------------------------------
export type EvidenceClass =
  | 'EV-HOST-IDENTITY' | 'EV-BINARY-IDENTITY' | 'EV-VERSION' | 'EV-PLATFORM' | 'EV-ARCHITECTURE' | 'EV-CHANNEL'
  | 'EV-HOOK-PROTOCOL' | 'EV-STREAM-SCHEMA' | 'EV-ATTRIBUTION' | 'EV-SETTINGS' | 'EV-PERMISSION-MODES'
  | 'EV-CAPABILITY' | 'EV-BEHAVIORAL-COMPARISON' | 'EV-TS07' | 'EV-TS11' | 'EV-ENVIRONMENT'
  | 'EV-AUTHORIZATION' | 'EV-NETWORK' | 'EV-TOOLCHAIN';

// Authorization SCOPES are disjoint: evidence acquisition is NEVER Run A / publication / registry mutation.
export type AuthorizationScope = 'EVIDENCE_ACQUISITION' | 'RUN_A' | 'PUBLICATION' | 'REGISTRY_MUTATION';

export interface EvidenceScope {
  required_evidence_classes: EvidenceClass[];
  required_test_ids: string[];        // e.g. ['TS-07','TS-11']
  allow_redaction: boolean;
}

export interface EvidenceAuthorization {
  authorization_id: string;
  scope: AuthorizationScope;          // MUST be EVIDENCE_ACQUISITION to authorize acquisition
  authorized_target: string;          // exact profile/host id
  authorized_tests: string[];
  authorized_environment: string;
  authorized_by: string;
  authorization_timestamp: string;
  authorization_expiry: string | null;
  authorizes_run_a: false;            // structurally impossible to authorize Run A here
  authorizes_publication: false;      // structurally impossible to authorize publication here
}

export interface EvidenceEnvironment {
  schema: 'dkskill.evidence_environment/1';
  environment_id: string;
  environment_type: string;           // e.g. 'evidence-session' (separate from 'benchmark' and 'certification')
  os: string | null;
  platform: string | null;
  architecture: string | null;
  claude_code_version: string | null;
  binary_sha256: string | null;
  config_directory_identity: string | null;   // identity/description only, never contents
  isolation_evidence: string | null;
  credential_state: string;           // DESCRIPTION ONLY, e.g. 'isolated-empty' / 'redacted-ref'; never a secret
  credential_reference: string | null; // redacted reference token only
  network_isolation_status: 'VERIFIED' | 'NOT_VALIDATED' | 'FAILED' | null;
  toolchain_identity: string | null;
  created_at: string;
  verified_at: string | null;
}

export interface EvidenceRequest {
  schema: 'dkskill.evidence_request/1';
  version: 1;
  request_id: string;
  target_host_identity: HostIdentity;
  target_profile_id: string;
  target_version: string | null;
  target_binary_sha256: string | null;
  target_platform: string | null;
  target_architecture: string | null;
  target_channel: string | null;
  scope: EvidenceScope;
  environment_id: string;
  authorization_ref: string | null;
  requested_at: string;
  expires_at: string | null;
  request_hash?: string;              // binds identity + scope; any identity change invalidates the request
}

export interface EvidenceProvenance {
  who: string;                        // authority/operator reference (non-secret)
  what: string;                       // producing tool
  when: string;
  where: string;                      // environment_id
  from_binary: string | null;        // binary sha256
  from_environment: string;
  under_authorization: string | null;
  from_raw_artifact: string;         // raw evidence id
  raw_hash: string;
  normalization_method: string | null;
  normalized_hash: string | null;
}

export interface EvidenceArtifact {
  schema: 'dkskill.certification_evidence/1';   // M4-consumable evidence-artifact family
  evidence_id: string;
  evidence_class: EvidenceClass;
  evidence_type: string;
  capture_timestamp: string;
  content_hash: string;               // sha256 over stored (post-redaction) content
  byte_length: number | null;
  source: string;
  environment_id: string;
  host_identity: HostIdentity;
  binary_identity: string | null;
  provenance: EvidenceProvenance;
  redaction_status: RedactionStatus;
  redactions: string[];               // records THAT redaction occurred (never the secret)
  stored_content: unknown;            // post-redaction content; secrets never persisted
  validity: ValidityStatus;
}

export interface NormalizedEvent {
  index: number;
  kind: string;                       // event kind or 'UNKNOWN' / 'MALFORMED' (never upgraded)
  raw_type: string | null;
  status: 'NORMALIZED' | 'UNKNOWN' | 'MALFORMED';
  attribution_result: string | null; // preserved verbatim (incl. A9/unknown)
  permission_result: string | null;  // preserved verbatim
}

export interface NormalizedEvidence {
  schema: 'dkskill.evidence_normalized/1';
  raw_evidence_id: string;
  raw_hash: string;
  events: NormalizedEvent[];
  attribution_results: string[];
  permission_results: string[];
  unknown_count: number;
  malformed_count: number;
  normalized_hash?: string;
}

export interface EvidenceAssertion {
  assertion_id: string;
  evidence_class: EvidenceClass;
  claim: string;
  state: AssertionState;              // UNKNOWN never becomes SUPPORTED by inference
  supporting_evidence: string[];
  provenance_ref: string | null;
  reason: string;
}

export interface EvidenceValidation {
  evidence_id: string;
  status: EvidenceStatus;
  raw_hash_ok: boolean;
  normalized_hash_ok: boolean;
  provenance_ok: boolean;
  secret_free: boolean;
  reasons: string[];
}

export interface EvidenceItem {
  evidence_class: EvidenceClass;
  artifact: EvidenceArtifact | null;  // null => not acquired
  normalized: NormalizedEvidence | null;
  assertion: EvidenceAssertion;
  status: EvidenceStatus;
}

export interface Precheck { gate_id: string; name: string; result: PrecheckOutcome; reasons: string[] }

export interface EvidenceFailure { code: string; message: string; fail_closed: true }

export interface EvidenceSession {
  schema: 'dkskill.evidence_session/1';
  version: 1;
  session_id: string;
  request_id: string;
  environment_id: string;
  state: SessionState;
  prechecks: Precheck[];
  items: EvidenceItem[];
  failures: EvidenceFailure[];
  started_at: string;
  updated_at: string;
}

export interface EvidencePackage {
  schema: 'dkskill.evidence_package/1';
  version: 1;
  synthetic_test_only: boolean;
  package_id: string;
  target_profile_id: string;
  target_host_identity: HostIdentity;
  target_version: string | null;
  target_binary_sha256: string | null;
  target_platform: string | null;
  target_architecture: string | null;
  target_channel: string | null;
  environment_id: string;
  authorization_ref: string | null;
  evidence_items: EvidenceItem[];
  assertions: EvidenceAssertion[];
  completeness: CompletenessState;
  missing_classes: EvidenceClass[];
  ts07_status: Ts07Status;
  ts11_status: Ts11Result;
  validity: ValidityStatus;
  created_at: string;
  previous_package_hash: string | null;
  package_hash?: string;
}

// ---- future real-session execution (defaults OFF) ---------------------------------------------------------
export interface SessionPlan {
  schema: 'dkskill.evidence_session_plan/1';
  plan_id: string;
  target_profile_id: string;
  target_binary_sha256: string | null;
  requested_evidence: EvidenceClass[];
  requested_tests: string[];
  environment_id: string;
  authorization_ref: string | null;
  expected_artifacts: EvidenceClass[];
  expected_stop_conditions: string[];
  execution_mode: ExecutionMode;      // ALWAYS EXECUTION_DISABLED at plan time in M7
  execution_enabled: false;
  created_at: string;
}

export interface ExecutionResult {
  schema: 'dkskill.evidence_execution_result/1';
  plan_id: string;
  execution_mode: ExecutionMode;
  executed: false;                    // M7 NEVER executes a real session
  claude_invoked: false;
  authenticated: false;
  benchmark_invoked: false;
  reason: string;
}

export interface StopCondition { id: string; description: string; triggered: boolean; fail_closed: true }
