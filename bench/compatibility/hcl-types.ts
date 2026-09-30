// M3 — Host Compatibility Layer (HCL) types. Repository-side data contract only; no runtime enforcement,
// no Claude execution, no version/platform branching. Version/platform behavior lives in the M1 registry +
// facets + M0 capability evidence; these types never encode a specific version.

export type IdentityStatus = 'IDENTIFIED' | 'PARTIALLY_IDENTIFIED' | 'UNIDENTIFIED';
export type ProfileResolutionState = 'EXACT_MATCH' | 'NO_MATCH' | 'AMBIGUOUS_MATCH' | 'INVALID_PROFILE' | 'REVOKED_PROFILE';
export type CapabilityState = 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'NOT_YET_VALIDATED' | 'NOT_AVAILABLE' | 'DEGRADED_AT_RUNTIME';
export type FacetResolutionState = 'RESOLVED' | 'UNRESOLVED';
export type SelfCheckResult = 'NOT_RUN' | 'PASS' | 'FAIL' | 'UNKNOWN';
export type EnforcementDecision = 'ENFORCEMENT_ALLOWED' | 'ENFORCEMENT_REFUSED' | 'ENFORCEMENT_DEGRADED';

// Host identity is a TUPLE, never just a version string.
export interface HostIdentity {
  product: string | null;
  version: string | null;
  platform: string | null;
  architecture: string | null;
  channel: string | null;
  binary_sha256: string | null;
  executable_source: string | null;
}

export interface FieldSource { field: string; value: string | null; source: string }

export interface ProbeResult {
  identity: HostIdentity;
  identity_status: IdentityStatus;
  field_sources: FieldSource[];
  missing_fields: string[];
}

export interface CapabilityResultRow {
  capability_id: string;
  state: CapabilityState;
  criticality: string;
  required_for: string;
  safety_critical: boolean;
  required: boolean;
  min_state: CapabilityState | null;
  satisfied: boolean | null;   // null when not part of the feature requirement
}

export interface FacetResultRow {
  family: string;
  facet_id: string | null;
  state: FacetResolutionState;
  validation_status: string | null;
}

export interface SelfCheckRow {
  id: string;
  description: string;
  critical: boolean;
  result: SelfCheckResult;
}

export interface CapabilityRequirement { cap_id: string; min_state: CapabilityState }
export interface FeatureRequirement {
  feature_id: string;
  optional: boolean;                       // true only for explicitly-optional features (may DEGRADE)
  required_capabilities: CapabilityRequirement[];
  required_facets: string[];
}

export interface AttributionResolution {
  facet: string | null;
  table_valid_scope: string[];
  in_scope: boolean;
  real_host: 'NOT_VALIDATED' | 'VALIDATED';
  note: string;
}

export interface HclResult {
  schema: 'dkskill.host_compatibility_result/1';
  version: 1;
  feature_id: string | null;
  observed_identity: HostIdentity;
  identity_status: IdentityStatus;
  field_sources: FieldSource[];
  missing_fields: string[];
  profile_resolution: ProfileResolutionState;
  profile_id: string | null;
  validation_status: string | null;
  certification_status: string | null;
  attribution: AttributionResolution;
  capability_results: CapabilityResultRow[];
  facet_results: FacetResultRow[];
  self_check_results: SelfCheckRow[];
  limitations: string[];
  enforcement_decision: EnforcementDecision;
  reason_codes: string[];
}
