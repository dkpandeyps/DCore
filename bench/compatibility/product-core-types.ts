// M14 — Universal dkskill Product Core Specification types.
// Specification only: deterministic, repository-local, FAIL-CLOSED. It defines WHAT dkskill is before any runtime or
// user-facing skill is implemented. It certifies nothing, executes no Claude, accesses no credentials, creates no
// /runtime/ directory, and encodes NO Windows/version-specific assumption. Compatibility/certification authority
// stays with the frozen M0–M13 layers (M3/M4/M5/M6/M8/M9). ONE universal core + many explicitly certified facets.

export type DecisionState = 'FROZEN' | 'NOT_YET_DECIDED';
export type SkillTaxonomyChoice = 'ONE_PRIMARY_WITH_MODULES' | 'FAMILY_OF_SKILLS' | 'OTHER';
export type BuildBoundary = 'BUILD_NOW' | 'BUILD_LATER' | 'REQUIRES_CERTIFICATION' | 'REQUIRES_OWNER_DECISION';
export type FailBehavior = 'FAIL_CLOSED' | 'PROCEED' | 'DEGRADE';
export type CapabilityState = 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'NOT_YET_VALIDATED' | 'NOT_AVAILABLE' | 'DEGRADED_AT_RUNTIME';
export type PermissionStatus = 'GRANTED' | 'DENIED' | 'UNKNOWN';
export type Purity = 'PURE' | 'DETERMINISTIC_OVER_INPUTS' | 'ENVIRONMENT_DEPENDENT' | 'ADAPTER_DEPENDENT' | 'REGISTRY_DEPENDENT' | 'EVIDENCE_DEPENDENT';

export interface ProductIdentity {
  product: string;                     // 'dkskill'
  product_id: string;                  // immutable id
  purpose: string;
  user_value: string;
  license: string;                     // Apache-2.0 (Q2)
  scope: string;                       // Claude-Code-only until R8 (Q5)
  not_platform_specific: true;
  not_version_specific: true;
}

export interface Responsibilities {
  core_runtime: string[];
  capabilities: string[];
  adapters: string[];
  compatibility: string[];
  security: string[];
  installation: string[];
  configuration: string[];
  update: string[];
  failure: string[];
}

export interface OperationDescriptor {
  operation_id: string;
  name: string;
  read_only: boolean;
  affects_filesystem: boolean;
  affects_process_execution: boolean;
  affects_network: boolean;
  affects_credentials: boolean;
  affects_external_services: boolean;
  required_permission_id: string;
  required_capabilities: string[];
  on_unknown_permission: 'DENY';       // never silently allowed
}

export interface CapabilityDescriptor {
  capability_id: string;               // stable M0 id or a product capability referencing M0
  name: string;
  depends_on_m0_capability: string | null;
  min_state: CapabilityState;
  safety_critical: boolean;
  operations: string[];
}

export interface PermissionDescriptor {
  permission_id: string;
  name: string;
  reason: string;
  read_only: boolean;
  affects_filesystem: boolean;
  affects_process_execution: boolean;
  affects_network: boolean;
  affects_credentials: boolean;
  affects_external_services: boolean;
  on_unknown: 'DENY';                  // unknown permission never becomes allowed
}

export interface SkillDescriptor {
  skill_id: string;
  name: string;
  purpose: string;
  independently_installable: boolean;
  dependencies: string[];
  required_capabilities: string[];
  required_facets: string[];
  required_permissions: string[];
  decision_state: DecisionState;
}

export interface Manifest {
  schema: 'dkskill.product_manifest/1';
  product: string;
  skill_id: string;
  product_version: string;             // dkskill release version, not a Claude version
  schema_version: string;
  capabilities: string[];
  required_facets: string[];
  permissions: string[];
  compatibility_requirements: string[];
  security_requirements: string[];
  dependencies: string[];
  update_policy: string;
  integrity: { algorithm: 'sha256'; manifest_hash: string | null };
  immutable_identifiers: string[];
  no_windows_assumption: true;
  no_single_version_identity: true;
}

export interface LifecycleStageSpec { stage: string; on_unsafe: FailBehavior; note: string }
export interface LifecycleFailureCase { condition: string; behavior: FailBehavior; outcome: string }

export interface ApiContract {
  fn: string;
  purity: Purity[];
  inputs: string[];
  output: string;
  fail_closed: boolean;
  maps_to: string;                     // which M13/M3 function realizes it
}

export interface AdapterContract {
  interface_id: string;
  may_provide: string[];
  must_not: string[];                  // e.g. must not declare certification
  core_contains_platform_behavior: false;
}

export interface SecurityRequirement { threat: string; product_control: string; failure_behavior: FailBehavior }

export interface InstallationStageSpec { stage: string; behavior: string; on_failure: FailBehavior }

export interface UpdateModel {
  dkskill_release_versions: string;
  registry_versions: string;
  claude_version_changes: string;
  adapter_versions: string;
  capability_changes: string;
  skill_changes: string;
  migration_rules: string;
  rollback_rules: string;
  new_environment_starts: 'UNVERIFIED';
  automatic_inheritance: false;
}

export interface OfflineModel {
  registry_unreachable: string;
  registry_stale: string;
  evidence_unrefreshable: string;
  no_network: string;
  local_package_available: string;
  incomplete_compatibility: string;
  missing_info_is_compatible: false;
}

export interface TrustBoundary { public_items: string[]; private_items: string[]; public_requires_private: false }

export interface RepositoryLayout { path: string; purpose: string; visibility: 'PUBLIC' | 'PRIVATE' }

export interface TestLayerSpec { layer: string; runs_on_user_machine: boolean; requires_certification_env: boolean }

export interface ReleaseStageSpec { stage: string; gate: string }

export interface DecisionItem { id: string; description: string; boundary: BuildBoundary; blocker: string | null }

export interface ProductSpec {
  schema: 'dkskill.product_core_spec/1';
  version: 1;
  synthetic_test_only: false;          // this is a real specification, not synthetic evidence
  identity: ProductIdentity;
  responsibilities: Responsibilities;
  taxonomy: {
    choice: SkillTaxonomyChoice;
    rationale: string;
    initial_release_skill_count: number | null;
    initial_release_skill_count_state: DecisionState;
    skills: SkillDescriptor[];
    future_skills_state: DecisionState;
    future_skill_decision_inputs: string[];
    evaluation: Record<string, string>;
  };
  hierarchy: string[];
  manifest_template: Manifest;
  runtime_lifecycle: LifecycleStageSpec[];
  lifecycle_failure_cases: LifecycleFailureCase[];
  compatibility_api: ApiContract[];
  adapter_contract: AdapterContract;
  capabilities: CapabilityDescriptor[];
  operations: OperationDescriptor[];
  permissions: PermissionDescriptor[];
  security_requirements: SecurityRequirement[];
  installation_lifecycle: InstallationStageSpec[];
  update_model: UpdateModel;
  offline_model: OfflineModel;
  trust_boundary: TrustBoundary;
  repository_layout: RepositoryLayout[];
  test_layers: TestLayerSpec[];
  release_model: ReleaseStageSpec[];
  future_runtime_location: string;     // DEFINED here; the directory is NOT created by this phase
  decision_boundary: DecisionItem[];
  frozen_foundation: string[];
  current_state: Record<string, string>;
  spec_hash?: string;
}
