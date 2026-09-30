// M13-UNIVERSAL — Universal Compatibility Architecture types.
// ONE universal core + MANY explicitly certified host facets. Repository-local, deterministic, FAIL-CLOSED. It
// composes the frozen M0–M9 logic (M3 HCL / M0 catalogue / M2 attribution) behind one pipeline; it never modifies
// them, never certifies, never publishes, never mutates the production registry, executes no Claude, and never
// treats UNKNOWN/NOT_YET_VALIDATED as VERIFIED. Not Windows-only: platform behavior is isolated behind adapters.
import type { HostIdentity, CapabilityState, FacetResolutionState, EnforcementDecision } from './hcl-types.ts';

export type Platform = 'windows' | 'macos' | 'linux';
export type EnforcementLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';   // H-Q7 default L1

export type UserCompatibilityOutcome =
  | 'COMPATIBLE' | 'PARTIALLY_COMPATIBLE' | 'UNVERIFIED' | 'UNSUPPORTED' | 'BLOCKED' | 'REVOKED'
  | 'PROFILE_NOT_FOUND' | 'PROFILE_MISMATCH' | 'CAPABILITY_UNVERIFIED';

// Universal host tuple — NEVER identified by version alone or platform alone.
export interface UniversalHost {
  product: string | null;
  version: string | null;
  os: string | null;                 // raw OS string (e.g. 'Windows 11', 'darwin', 'linux')
  os_version: string | null;
  architecture: string | null;
  channel: string | null;
  binary_sha256: string | null;
  runtime_facet: string | null;
}

export interface HostFacet {
  schema: 'dkskill.host_facet/1';
  facet_id: string;
  family: string;
  schema_version: string;
  scope: string;
  evidence_requirements: string[];
  compatibility_relationship: string;
  validation_status: string;
  lifecycle: string;
  provenance: string;
}

export interface CapabilityRow { capability_id: string; state: CapabilityState; required: boolean; satisfied: boolean | null; safety_critical: boolean }
export interface FacetRow { family: string; facet_id: string | null; state: FacetResolutionState; validation_status: string | null }

export interface UserCompatibilityResult {
  schema: 'dkskill.user_compatibility_result/1';
  version: 1;
  synthetic_test_only: boolean;
  observed_host: UniversalHost;
  normalized_identity: HostIdentity;
  platform: Platform | null;
  supported_platform: boolean;
  profile_id: string | null;
  profile_resolution: string;
  certification_status: string | null;
  validation_status: string | null;
  capabilities: CapabilityRow[];
  facets: FacetRow[];
  attribution: { facet: string | null; in_scope: boolean; table_valid_scope: string[]; real_host: string; note: string };
  enforcement_level: EnforcementLevel;
  enforcement_decision: EnforcementDecision;
  outcome: UserCompatibilityOutcome;
  explanation: string;                // actionable: what is known and what is not
  known: string[];
  unknown: string[];
  fail_closed: true;
  reason_codes: string[];
}

export interface UniversalCompatibility {
  schema: 'dkskill.universal_compatibility/1';
  version: 1;
  pipeline: string[];
  supported_platforms: Platform[];
  default_enforcement_level: EnforcementLevel;
  latest_certified_policy: 'latest-3';
  facet_catalogue: HostFacet[];
  attribution_valid_for: string[];
  no_inheritance: { version: true; platform: true; architecture: true; channel: true };
}

export interface UniversalAudit {
  schema: 'dkskill.universal_compatibility_audit/1';
  version: 1;
  audit_id: string;
  outcome: UserCompatibilityOutcome;
  profile_id: string | null;
  platform: Platform | null;
  synthetic_test_only: boolean;
  timestamp: string;
  previous_record_hash: string | null;
  record_hash?: string;
}
