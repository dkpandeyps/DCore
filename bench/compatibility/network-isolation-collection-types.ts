// M10 — Authorized Read-Only Network Isolation Evidence Collection types.
// Repository-side, deterministic, FAIL-CLOSED. Collection is strictly READ-ONLY: it queries existing OS state via a
// fixed command allowlist, never modifies firewall/routing/DNS/proxy/VPN/adapters/policy/services/Claude config/
// credentials, never contacts an external network, never executes Claude, never authenticates, never spends. It
// NEVER promotes CONFIGURATION_EVIDENCE or host inspection to INDEPENDENT_VERIFICATION: host self-inspection can
// never be L4, so it cannot by itself reach VERIFIED. It never modifies or authorizes M8.
import type { HostIdentity } from './hcl-types.ts';

export type CollectionMode = 'READ_ONLY';
export type CollectionResultState = 'COMPLETE' | 'PARTIAL' | 'BLOCKED' | 'FAILED' | 'UNAVAILABLE';
export type NetworkIsolationResult = 'VERIFIED' | 'UNVERIFIED' | 'FAILED' | 'BLOCKED';
export type SourceStatus = 'OBSERVED' | 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN' | 'ERROR';
export type SafetyOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';
export type FreshnessState = 'FRESH' | 'STALE' | 'EXPIRED' | 'UNKNOWN';
export type Signal = 'ISOLATION_SUPPORTING' | 'LEAK_OBSERVED' | 'UNKNOWN_TRAFFIC' | 'NEUTRAL';

// Collection-level evidence classification (never auto-promoted upward).
export type CollectionEvidenceClass = 'CONFIGURATION_EVIDENCE' | 'HOST_OBSERVATION' | 'CONTROLLED_BEHAVIOR_EVIDENCE' | 'INDEPENDENT_VERIFICATION';
export type VerificationLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export type CollectionScope =
  | 'PROCESS_ONLY' | 'APPLICATION_ONLY' | 'ENVIRONMENT_ONLY' | 'HOST_ONLY' | 'NETWORK_NAMESPACE'
  | 'FIREWALL_POLICY' | 'OUTBOUND_DENY' | 'DESTINATION_ALLOWLIST' | 'OTHER';

export type CollectionMechanism =
  | 'WINDOWS_FIREWALL_STATE' | 'FIREWALL_PROFILES' | 'EFFECTIVE_FIREWALL_RULES' | 'NETWORK_ADAPTER_STATE'
  | 'ROUTING_STATE' | 'ACTIVE_CONNECTIONS' | 'DNS_CONFIG' | 'PROXY_CONFIG' | 'PROCESS_NETWORK_ASSOCIATION'
  | 'OS_NETWORK_POLICY' | 'ISOLATED_ENV_CONTROLS';

// A fixed, read-only command definition. Dynamic command construction is rejected.
export interface CommandDefinition {
  command_id: string;
  mechanism: CollectionMechanism;
  executable_path: string;
  args: string[];                       // exact argument vector (no free-form input)
  expected_output_type: 'text';
  read_only: true;
}

export interface CommandOutcome {
  command_id: string;
  ok: boolean;
  status: SourceStatus;
  raw_output: string;                   // pre-redaction; never persisted raw if it may contain secrets
  error_code: string | null;
}

// A classified source result fed to the deterministic engine (tests supply these directly).
export interface SourceResult {
  command_id: string;
  mechanism: CollectionMechanism;
  evidence_class: CollectionEvidenceClass;
  scope: CollectionScope;
  signal: Signal;
  status: SourceStatus;
  raw_output: string;
  observed_at: string | null;
  expires_at: string | null;
  max_age_ms: number | null;
  revoked: boolean;
  source_environment_id?: string;       // where the observation actually came from (defaults to the request env)
  source_host_id?: string | null;       // the host the observation actually came from (defaults to the request host)
}

export interface CollectionRequest {
  schema: 'dkskill.network_isolation_collection_request/1';
  version: 1;
  request_id: string;
  environment_id: string;
  host_identity: HostIdentity;
  os: string | null;
  architecture: string | null;
  collection_mode: CollectionMode;      // must be READ_ONLY
  requested_scope: CollectionScope;
  requested_at: string;
}

export interface CollectionObservation {
  schema: 'dkskill.network_isolation_collection_observation/1';
  observation_id: string;
  environment_id: string;
  host_id: string | null;
  source: string;                       // command_id
  source_type: 'CONFIGURATION' | 'OBSERVATIONAL' | 'CONTROLLED' | 'INDEPENDENT';
  mechanism: CollectionMechanism;
  collection_method: string;
  timestamp: string | null;
  scope: CollectionScope;
  evidence_class: CollectionEvidenceClass;
  status: SourceStatus;
  signal: Signal;
  normalized: string;                   // secret-safe normalized representation
  limitations: string[];
}

export interface CollectionEvidence {
  schema: 'dkskill.network_isolation_collection_evidence/1';
  evidence_id: string;
  observation: CollectionObservation;
  freshness: FreshnessState;
  raw_hash: string;
  normalized_hash: string;
  redaction_applied: boolean;
  in_scope: boolean;
  applicable: boolean;
}

export interface SafetyGate { gate_id: string; name: string; result: SafetyOutcome; reasons: string[] }
export interface MechanismSummary { mechanism: CollectionMechanism; status: SourceStatus; note: string }

export interface CollectionResult {
  schema: 'dkskill.network_isolation_collection_result/1';
  version: 1;
  synthetic_test_only: boolean;
  collection_id: string;
  environment_id: string;
  host_identity: HostIdentity;
  collection_mode: CollectionMode;
  safety_gates: SafetyGate[];
  result_state: CollectionResultState;
  observations: CollectionObservation[];
  evidence: CollectionEvidence[];
  evidence_hashes: string[];
  mechanisms: MechanismSummary[];
  contradictions: string[];
  independence_satisfied: boolean;
  achieved_level: VerificationLevel;
  network_isolation: NetworkIsolationResult;
  proven_scope: CollectionScope | null;
  limitations: string[];
  reasons: string[];
  performed_real_inspection: boolean;
  timestamp: string;
  audit_hash?: string;
}

export interface CollectionAudit {
  schema: 'dkskill.network_isolation_collection_audit/1';
  version: 1;
  audit_id: string;
  collection_id: string;
  environment_id: string;
  result_state: CollectionResultState;
  network_isolation: NetworkIsolationResult;
  achieved_level: VerificationLevel;
  evidence_hashes: string[];
  timestamp: string;
  previous_record_hash: string | null;
  record_hash?: string;
}
