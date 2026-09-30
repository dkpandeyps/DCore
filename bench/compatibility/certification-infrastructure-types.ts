// M13 — Global Compatibility Certification Infrastructure (design + provisioning planning) types.
// Repository-local, deterministic, FAIL-CLOSED, DESIGN ONLY. It provisions nothing real, spends nothing, executes no
// Claude, authenticates nothing, and makes NO OS/network change to PTPL-DK-BENCH-WIN-01. It never emits VERIFIED,
// CERTIFIED, EXECUTION_ALLOWED, or PUBLISHED. M4/M5/M6 remain the certification/publication authorities; M8 remains
// the execution gate; M9 remains the L4 authority. Trust boundaries (control plane / test env / evidence store /
// registry-publication control) are distinct and never collapsed. No cross-platform / cross-version inheritance.
import type { HostIdentity } from './hcl-types.ts';

export type TrustPlane = 'CERTIFICATION_CONTROL_PLANE' | 'CERTIFICATION_TEST_ENVIRONMENT' | 'EVIDENCE_STORE' | 'REGISTRY_PUBLICATION_CONTROL';
export type Platform = 'windows' | 'macos' | 'linux';

export type InfrastructureStatus = 'DESIGN_VALIDATED' | 'DESIGN_INCOMPLETE' | 'BLOCKED';
export type ProvisioningStatus = 'PLANNED' | 'REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION' | 'NOT_PROVISIONED';
export type EnvReadiness = 'READY_FOR_L4_VERIFICATION' | 'BLOCKED' | 'FAILED' | 'REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION';
// Deliberately absent from every M13 output: VERIFIED, CERTIFIED, EXECUTION_ALLOWED, PUBLISHED.

export type LifecycleState =
  | 'PROVISIONED' | 'READY' | 'PROBING' | 'EVIDENCE_CAPTURED' | 'EVIDENCE_VALIDATED' | 'CERTIFICATION_REVIEW'
  | 'CERTIFIED' | 'PUBLISHED' | 'REVOKED' | 'DESTROYED';

export type Visibility = 'PUBLIC' | 'PRIVATE';

export interface CertificationObserver {
  schema: 'dkskill.certification_observer/1';
  observer_id: string;
  identity: string | null;
  enforcement_identity: string | null;     // must differ from observer_id where required
  trust_plane: TrustPlane;
  external_to_certified_host: boolean;
  is_host_self_report: boolean;             // true => not independent (rejected)
  observation_path: string | null;
  evidence_path: string | null;
  environment_bound: boolean;
  freshness_established: boolean;
  tamper_evident: boolean;
  provenance: string | null;
  failure_behavior: string;
}

export interface EnforcementBoundary {
  schema: 'dkskill.certification_enforcement_boundary/1';
  boundary_id: string;
  kind: 'INFRA_EGRESS' | 'HYPERVISOR' | 'HOST_FIREWALL' | 'NETWORK_NAMESPACE' | 'DEDICATED_MACHINE' | 'NONE';
  enforcement_identity: string | null;
  establishable: boolean;
  minimal: boolean;
  requires_overbroad_change: boolean;
  demonstrates_denied_connectivity: boolean;
  enforcement_actually_enforced: boolean;
}

export interface EvidenceStore {
  schema: 'dkskill.certification_evidence_store/1';
  store_id: string;
  trust_plane: 'EVIDENCE_STORE';
  hashing: 'sha256';
  tamper_detection: boolean;
  freshness_tracking: boolean;
  environment_binding: boolean;
  secret_free: boolean;                     // never stores tokens/keys/credentials
  retention_policy: string;
  visibility: Visibility;                   // PRIVATE (evidence payloads are not public)
}

export interface CertificationEnvironment {
  schema: 'dkskill.certification_environment/1';
  environment_id: string;
  trust_plane: TrustPlane;
  platform: Platform | null;
  architecture: string | null;
  channel: string | null;
  claude_code_version: string | null;
  binary_sha256: string | null;
  reproducible_identity: boolean;
  credentials_isolated: boolean;            // isolated from developer credentials; no reuse
  is_current_workstation: boolean;          // the current host must NEVER be a control plane
  requires_paid_infrastructure: boolean;
  observer: CertificationObserver | null;
  enforcement_boundary: EnforcementBoundary | null;
  lifecycle_state: LifecycleState;
  readiness: EnvReadiness;
  reasons: string[];
}

export interface EnvironmentLifecycle {
  schema: 'dkskill.certification_environment_lifecycle/1';
  states: LifecycleState[];
  forbidden_auto_transitions: { from: LifecycleState; to: LifecycleState; reason: string }[];
  destroy_recreate_supported: true;
}

export interface Threat {
  threat_id: string;
  threat: string;
  control: string;
  evidence: string;
  failure_behavior: string;
  residual_risk: string;
}

export interface ScaleModel {
  per_platform_environment: string;
  per_version_environment: string;
  environment_recreation: string;
  evidence_retention: string;
  credential_isolation: string;
  concurrency: string;
  audit_retention: string;
  cost_boundaries: string;
}

export interface PublicPrivateBoundary {
  public_items: string[];
  private_items: string[];
  rule: string;
}

export interface VersionMatrixPolicy {
  no_version_inheritance: true;
  no_platform_inheritance: true;
  no_architecture_inheritance: true;
  no_channel_inheritance: true;
  rule: string;                             // one certified facet = one independently evidenced identity
}

export interface CertificationInfrastructurePlan {
  schema: 'dkskill.certification_infrastructure/1';
  version: 1;
  synthetic_test_only: boolean;
  plan_id: string;
  infrastructure_status: InfrastructureStatus;
  provisioning_status: ProvisioningStatus;
  trust_planes: TrustPlane[];
  environment_templates: CertificationEnvironment[];
  observer_architecture: CertificationObserver;
  evidence_store: EvidenceStore;
  lifecycle: EnvironmentLifecycle;
  version_matrix_policy: VersionMatrixPolicy;
  threat_model: Threat[];
  scale_model: ScaleModel;
  public_private_boundary: PublicPrivateBoundary;
  supported_platforms: Platform[];
  current_workstation_role: string;         // explicitly NOT a control plane
  l4_readiness_current_host: 'BLOCKED';
  m8_state: 'EXECUTION_BLOCKED';
  m9_state: 'UNVERIFIED';
  certified_profiles: 0;
  publication: 'NONE';
  reasons: string[];
  audit_hash?: string;
}

export interface InfrastructureAudit {
  schema: 'dkskill.certification_infrastructure_audit/1';
  version: 1;
  audit_id: string;
  plan_id: string;
  infrastructure_status: InfrastructureStatus;
  provisioning_status: ProvisioningStatus;
  environments: number;
  threats: number;
  certified_profiles: 0;
  timestamp: string;
  previous_record_hash: string | null;
  record_hash?: string;
}
