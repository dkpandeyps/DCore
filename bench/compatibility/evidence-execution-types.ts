// M8 — Controlled Real Evidence Session Authorization & Execution Gate types.
// Repository-side SAFETY/AUTHORIZATION GATE only. It NEVER executes Claude, authenticates, spends, runs Run A or
// the benchmark, certifies, publishes, or mutates the production registry. It decides ONLY whether a FUTURE
// evidence-session executor MAY execute. Default EXECUTION_DISABLED / DRY_RUN. The current real target MUST
// return EXECUTION_BLOCKED (network isolation UNVERIFIED). No bypass flags exist.
import type { HostIdentity } from './hcl-types.ts';

export type ExecutionState =
  | 'DISABLED' | 'REQUESTED' | 'AUTHORIZED' | 'PREFLIGHTING' | 'READY' | 'EXECUTING' | 'STOPPED' | 'COMPLETED'
  | 'FAILED' | 'BLOCKED' | 'REVOKED';
export type AuthorizationState = 'VALID' | 'EXPIRED' | 'REVOKED' | 'MISMATCHED' | 'MISSING';
export type NetworkIsolationStatus = 'VERIFIED' | 'UNVERIFIED' | 'FAILED' | 'NOT_APPLICABLE';
export type GateOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';
export type ExecutionDecision = 'EXECUTION_ALLOWED' | 'EXECUTION_BLOCKED' | 'EXECUTION_REVOKED' | 'EXECUTION_EXPIRED' | 'EXECUTION_FAILED';
export type ExecutionMode = 'DRY_RUN' | 'EXECUTION_DISABLED' | 'LIVE';
export type EvidenceTest = 'TS-07' | 'TS-11';
export type PostflightOutcome = 'PASS' | 'FAIL' | 'NOT_RUN';

export type StopCode =
  | 'STOP-BINARY-MISMATCH' | 'STOP-VERSION-MISMATCH' | 'STOP-PLATFORM-MISMATCH' | 'STOP-ARCHITECTURE-MISMATCH'
  | 'STOP-CHANNEL-MISMATCH' | 'STOP-ENVIRONMENT-MISMATCH' | 'STOP-CONFIG-DIR-UNSAFE' | 'STOP-REAL-CLAUDE-DIR-DETECTED'
  | 'STOP-CREDENTIAL-AMBIGUOUS' | 'STOP-NETWORK-UNVERIFIED' | 'STOP-NETWORK-VIOLATION' | 'STOP-PROCESS-VIOLATION'
  | 'STOP-FILESYSTEM-VIOLATION' | 'STOP-AUTHORIZATION-MISSING' | 'STOP-AUTHORIZATION-MISMATCH'
  | 'STOP-AUTHORIZATION-EXPIRED' | 'STOP-AUTHORIZATION-REVOKED' | 'STOP-SCOPE-VIOLATION' | 'STOP-RUN-A-DETECTED'
  | 'STOP-BENCHMARK-DETECTED' | 'STOP-PUBLICATION-DETECTED' | 'STOP-REGISTRY-MUTATION-DETECTED' | 'STOP-SECRET-DETECTED'
  | 'STOP-EVIDENCE-INTEGRITY' | 'STOP-UNKNOWN-CONDITION';

export interface ExecutionTarget {
  profile_id: string;
  version: string | null;
  binary_sha256: string | null;
  platform: string | null;
  architecture: string | null;
  channel: string | null;
  environment_id: string;
}

export interface ExecutionAuthorization {
  schema: 'dkskill.evidence_execution_authorization/1';
  version: 1;
  authorization_id: string;
  authorized_by: string;
  authorized_role: string;
  target_profile_id: string;
  target_version: string | null;
  target_binary_sha256: string | null;
  target_platform: string | null;
  target_architecture: string | null;
  target_channel: string | null;
  allowed_tests: EvidenceTest[];
  allowed_environment_id: string;
  authorization_timestamp: string;
  expiration: string | null;
  authorization_payload_hash: string;    // binds to the exact target; any change invalidates it
  authorization_state: AuthorizationState;
}

export interface EnvironmentSnapshot {
  schema: 'dkskill.evidence_execution_env_snapshot/1';
  environment_id: string;
  os: string | null;
  platform: string | null;
  architecture: string | null;
  claude_code_version: string | null;
  binary_sha256: string | null;
  config_directory_identity: string | null;    // identity/description only
  isolation_status: 'ISOLATED' | 'NOT_ISOLATED' | 'UNKNOWN';
  credential_status: 'ISOLATED_EMPTY' | 'REDACTED_REF' | 'AMBIGUOUS' | 'UNKNOWN';
  network_status: NetworkIsolationStatus;
  toolchain_identity: string | null;
  timestamp: string;
}

export interface ConfigDirObservation {
  expected_config_dir: string;
  observed_config_dir: string | null;
  is_dedicated_isolated: boolean;
  points_to_real_claude: boolean;          // symlink/junction/overlap to real ~/.claude
  path_overlaps_real_claude: boolean;
  credential_copied_from_real: boolean;
  ownership_ok: boolean;
}

export interface CredentialObservation {
  api_key_injected: boolean;
  unauthorized_token_present: boolean;
  dedicated_config_dir: boolean;
  real_claude_credential_copy: boolean;
  credential_state_known: boolean;
  secret_persisted_in_evidence: boolean;
}

export interface ProcessObservation {
  process_identity: string;
  executable_path: string | null;
  hash: string | null;
  start_time: string | null;
  parent: string | null;
  approved: boolean;
}

export interface FilesystemObservation {
  allowed_roots: string[];
  observed_write_roots: string[];
  unexpected_write: boolean;
  touches_real_claude: boolean;
  touches_production_registry: boolean;
  touches_runtime_dir: boolean;
  state_known: boolean;
}

export interface NetworkObservation {
  isolation_status: NetworkIsolationStatus;
  observation_source: string;              // e.g. 'live-probe' | 'UNAVAILABLE' | 'MECHANICS_DEMO'
  destinations: { process: string; host: string; port: number; protocol: string; timestamp: string; allowed: boolean; source: string }[];
  violation: boolean;
  secret_in_payload: boolean;
}

export interface ResourceLimits {
  max_wall_clock_ms: number;
  max_process_count: number;
  max_filesystem_output_bytes: number;
  max_evidence_artifact_bytes: number;
  max_network_destinations: number;
  max_retries: number;
}
export interface ResourceUsage {
  wall_clock_ms: number;
  process_count: number;
  filesystem_output_bytes: number;
  evidence_artifact_bytes: number;
  network_destinations: number;
  retries: number;
}

export interface PreflightGate { gate_id: string; name: string; result: GateOutcome; safety_critical: boolean; reasons: string[] }

export interface ExecutionPreflight {
  schema: 'dkskill.evidence_execution_preflight/1';
  version: 1;
  request_id: string;
  target: ExecutionTarget;
  environment: EnvironmentSnapshot;
  gates: PreflightGate[];
  network_isolation: NetworkIsolationStatus;
  all_safety_critical_pass: boolean;
}

export interface ExecutionRequest {
  request_id: string;
  m7_plan_id: string | null;
  target: ExecutionTarget;
  authorization: ExecutionAuthorization | null;
  environment: EnvironmentSnapshot;
  requested_tests: EvidenceTest[];
  config_dir: ConfigDirObservation;
  credential: CredentialObservation;
  processes: ProcessObservation[];
  filesystem: FilesystemObservation;
  network: NetworkObservation;
  m3_resolution: string;                   // from M3; must be EXACT_MATCH
  synthetic_target: boolean;               // true => a synthetic profile (must be excluded from real execution)
  mechanics_demo: boolean;                 // SYNTHETIC_TEST_ONLY gate-mechanics demonstration only
  requested_run_a: boolean;
  requested_benchmark: boolean;
  requested_publication: boolean;
  requested_registry_mutation: boolean;
  substitute_binary: boolean;
  substitute_model: boolean;
  toolchain_identity: string | null;
}

export interface StopCondition { code: StopCode; description: string; triggered: boolean; fail_closed: true }

export interface ExecutionGate {
  schema: 'dkskill.evidence_execution_gate/1';
  version: 1;
  request_id: string;
  synthetic_test_only: boolean;
  target: ExecutionTarget;
  preflight: ExecutionPreflight;
  authorization_state: AuthorizationState;
  network_isolation: NetworkIsolationStatus;
  decision: ExecutionDecision;
  execution_state: ExecutionState;
  stop_codes: StopCode[];
  reasons: string[];
  execution_mode: ExecutionMode;           // ALWAYS EXECUTION_DISABLED here
  execution_enabled: false;
}

export interface PostflightCheck { check_id: string; name: string; result: PostflightOutcome; reasons: string[] }

export interface PostflightResult {
  checks: PostflightCheck[];
  session_result: 'SESSION_OK' | 'SESSION_FAILED' | 'NOT_RUN';
  auto_certification_invoked: false;
}

export interface ExecutionRecord {
  schema: 'dkskill.evidence_execution_record/1';
  version: 1;
  execution_id: string;
  authorization_id: string | null;
  plan_id: string | null;
  target: ExecutionTarget;
  binary_sha256: string | null;
  environment_id: string;
  preflight_results: { gate_id: string; result: GateOutcome }[];
  execution_state: ExecutionState;
  decision: ExecutionDecision;
  stop_reason: StopCode | null;
  postflight_results: { check_id: string; result: PostflightOutcome }[];
  evidence_hashes: string[];
  timestamp: string;
  previous_audit_hash: string | null;
  audit_hash?: string;
}
