// M9 — Real Evidence Session Readiness & Independently Verifiable Network-Isolation Gate types.
// Repository-side, deterministic, READ-ONLY, FAIL-CLOSED, OFFLINE. It NEVER executes Claude, authenticates,
// spends, runs Run A / benchmark, certifies, publishes, mutates the production registry, contacts any network, or
// changes any system/network configuration. Only L4 (INDEPENDENTLY_VERIFIED) evidence can yield VERIFIED. The
// current environment remains UNVERIFIED unless genuinely authoritative evidence already exists. It never weakens
// or bypasses the M8 network gate; it only supplies a fail-closed adapter result M8 may consume.
import type { HostIdentity } from './hcl-types.ts';

export type VerificationState =
  | 'REQUESTED' | 'ASSESSING' | 'OBSERVING' | 'SUPPORTED' | 'VERIFIED' | 'UNVERIFIED' | 'FAILED' | 'BLOCKED'
  | 'EXPIRED' | 'REVOKED';
// Only VERIFIED may satisfy the M8 network gate (EP-13). Everything else keeps M8 EXECUTION_BLOCKED.

export type VerificationLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
// L0 CLAIMED, L1 CONFIGURATION_OBSERVED, L2 HOST_STATE_OBSERVED, L3 CONTROLLED_BEHAVIOR_OBSERVED,
// L4 INDEPENDENTLY_VERIFIED. Only L4 can produce NETWORK_ISOLATION = VERIFIED.

export type EvidenceClass = 'CLAIM' | 'CONFIGURATION_EVIDENCE' | 'OBSERVATIONAL_EVIDENCE' | 'INDEPENDENT_VERIFICATION';
export type ObservationResult = 'OBSERVED' | 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';
export type FreshnessState = 'FRESH' | 'STALE' | 'EXPIRED' | 'UNKNOWN';
export type Signal = 'ISOLATION_SUPPORTING' | 'LEAK_OBSERVED' | 'UNKNOWN_TRAFFIC' | 'NEUTRAL';
export type M8NetworkResult = 'VERIFIED' | 'UNVERIFIED' | 'FAILED' | 'BLOCKED';

export type IsolationScope =
  | 'PROCESS_ONLY' | 'ENVIRONMENT_ONLY' | 'HOST_ONLY' | 'NETWORK_NAMESPACE' | 'FIREWALL_POLICY'
  | 'OUTBOUND_DENY' | 'DESTINATION_ALLOWLIST' | 'OTHER';

export type WindowsMechanism =
  | 'WINDOWS_FIREWALL_STATE' | 'FIREWALL_PROFILES' | 'EFFECTIVE_FIREWALL_RULES' | 'NETWORK_ADAPTER_STATE'
  | 'ROUTING_STATE' | 'ACTIVE_CONNECTIONS' | 'DNS_CONFIG' | 'PROXY_CONFIG' | 'PROCESS_NETWORK_ASSOCIATION'
  | 'OS_NETWORK_POLICY' | 'EXTERNAL_CONNECTION_ATTEMPTS' | 'ISOLATED_ENV_CONTROLS';

export interface NetworkIsolationRequest {
  schema: 'dkskill.network_isolation_request/1';
  version: 1;
  request_id: string;
  environment_id: string;
  host_identity: HostIdentity;
  os: string | null;
  architecture: string | null;
  requested_scope: IsolationScope;
  m8_context: string;                    // the future M8 evidence-session context this binds to
  requested_at: string;
}

export interface NetworkIsolationObservation {
  schema: 'dkskill.network_isolation_observation/1';
  observation_id: string;
  mechanism: WindowsMechanism | 'OTHER';
  evidence_class: EvidenceClass;
  level: VerificationLevel;              // the level this observation can contribute
  environment_id: string;
  host_id: string | null;
  os: string | null;
  architecture: string | null;
  scope: IsolationScope;
  result: ObservationResult;
  signal: Signal;
  claim: string;                        // human-readable, never a secret
  source: string;
  source_type: 'CLAIM' | 'CONFIGURATION' | 'OBSERVATIONAL' | 'INDEPENDENT';
  collection_method: string;
  observed_at: string | null;
  expires_at: string | null;
  max_age_ms: number | null;
  verifier: string | null;
  limitations: string[];
  revoked: boolean;
}

export interface NetworkIsolationEvidence {
  schema: 'dkskill.network_isolation_evidence/1';
  evidence_id: string;
  observation: NetworkIsolationObservation;
  freshness: FreshnessState;
  raw_hash: string;
  normalized_hash: string;
  in_scope: boolean;
  applicable: boolean;                  // environment/host/os/arch match the request
}

export interface MechanismAssessment { mechanism: WindowsMechanism; result: ObservationResult; note: string }

export interface NetworkIsolationVerification {
  schema: 'dkskill.network_isolation_verification/1';
  version: 1;
  synthetic_test_only: boolean;
  verification_id: string;
  environment_id: string;
  host_identity: HostIdentity;
  os: string | null;
  architecture: string | null;
  verification_method: string;
  observation_source: string;
  observation_timestamp: string;
  requested_scope: IsolationScope;
  proven_scope: IsolationScope | null;   // never exceeds the evidence
  achieved_level: VerificationLevel;
  freshness_state: FreshnessState;
  evidence_items: NetworkIsolationEvidence[];
  evidence_hashes: string[];
  mechanisms_evaluated: MechanismAssessment[];
  contradictions: string[];
  limitations: string[];
  verifier: string | null;
  state: VerificationState;
  network_isolation: M8NetworkResult;    // the fail-closed result M8 may consume (VERIFIED only)
  reasons: string[];
  audit_hash?: string;
}

export interface NetworkIsolationAudit {
  schema: 'dkskill.network_isolation_audit/1';
  version: 1;
  audit_id: string;
  verification_id: string;
  environment_id: string;
  state: VerificationState;
  network_isolation: M8NetworkResult;
  achieved_level: VerificationLevel;
  evidence_hashes: string[];
  timestamp: string;
  previous_record_hash: string | null;
  record_hash?: string;
}
