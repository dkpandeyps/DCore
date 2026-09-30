// M15 — Universal dkskill Public Product Foundation types.
// Deterministic, typed, platform-neutral, FAIL-CLOSED, secret-free. This is the public product foundation: package
// manifest + integrity + environment detection + platform adapters + `dkskill doctor` + installation. It consumes
// the frozen M13/M3 compatibility resolver through stable interfaces and NEVER reimplements it, certifies anything,
// executes Claude, authenticates, accesses credentials or real ~/.claude, contacts the network, or creates /runtime/.
import type { UniversalHost, UserCompatibilityOutcome, Platform, CapabilityRow, FacetRow } from '../compatibility/universal-compatibility-types.ts';

export type Tri = 'YES' | 'NO' | 'UNKNOWN';
export type IntegrityStatus = 'INTEGRITY_VERIFIED' | 'INTEGRITY_FAILED' | 'INTEGRITY_UNKNOWN';
export type SignatureStatus = 'SIGNATURE_VERIFIED' | 'SIGNATURE_NOT_AVAILABLE' | 'SIGNATURE_INVALID';
export type InstallState = 'READY' | 'BLOCKED' | 'FAILED';
export type PermissionEffect = { filesystem: boolean; process: boolean; network: boolean; credentials: false; external_service: boolean };

export interface IntegrityEntry { path: string; hash: string }
export interface IntegrityManifest {
  schema: 'dkskill.integrity_manifest/1';
  algorithm: 'sha256';
  entries: IntegrityEntry[];
  signature_status: SignatureStatus;       // M15 never signs: SIGNATURE_NOT_AVAILABLE
}
export interface IntegrityResult {
  status: IntegrityStatus;
  signature_status: SignatureStatus;
  is_certification: false;                  // hash verification is NEVER certification
  modified: string[];
  missing: string[];
  unexpected: string[];
  invalid_hash: string[];
  unsupported_scheme: boolean;
  reasons: string[];
}

export interface EnvironmentFacts {
  os: string | null;
  os_version: string | null;
  architecture: string | null;
  runtime: string | null;
  claude_code_version: string | null;      // null => UNKNOWN (never guessed)
  channel: string | null;
  binary_sha256: string | null;
}
export interface EnvironmentDetection {
  schema: 'dkskill.environment_detection/1';
  facts: EnvironmentFacts;
  host: UniversalHost;
  platform: Platform | null;
  supported_platform: boolean;
  unknown_fields: string[];
  reasons: string[];
}

export interface AdapterFacts { adapter_id: string; platform: Platform; registry_platform_token: string; supported_architectures: string[]; supported_channels: string[] }

export interface DoctorReport {
  schema: 'dkskill.doctor_report/1';
  synthetic_test_only: boolean;
  dkskill_version: string;
  product: string;
  environment: {
    platform: Platform | null;
    os_version: string | null;
    architecture: string | null;
    claude_code_version: string | null;
    channel: string | null;
    binary_identity_status: Tri;
    supported_platform: boolean;
  };
  compatibility: {
    status: UserCompatibilityOutcome;
    profile_id: string | null;
    certification_status: string | null;
    enforcement_decision: string;
  };
  capabilities: CapabilityRow[];
  required_facets: FacetRow[];
  attribution_status: { in_scope: boolean; note: string };
  blocked_reasons: string[];
  unknown_reasons: string[];
  safe_next_action: string;
  redaction_applied: boolean;
}

export interface InstallStageResult { stage: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; reasons: string[] }
export interface InstallState_Record {
  schema: 'dkskill.install_state/1';
  product: string;
  product_version: string;
  installed_at: string;
  state_dir: string;
  integrity_status: IntegrityStatus;
  compatibility_status: UserCompatibilityOutcome | 'NOT_CHECKED';
  contains_credentials: false;
  runtime_dir_created: false;
}
export interface InstallResult {
  schema: 'dkskill.install_result/1';
  state: InstallState;
  stages: InstallStageResult[];
  created_paths: string[];
  integrity: IntegrityResult;
  compatibility_status: UserCompatibilityOutcome | 'NOT_CHECKED';
  install_state_record: InstallState_Record | null;
  reasons: string[];
}

// A minimal virtual filesystem so installation logic is deterministic and NEVER touches the real machine in tests.
export interface VirtualFs {
  exists(path: string): boolean;
  mkdir(path: string): void;
  writeFile(path: string, content: string): void;
  readFile(path: string): string | null;
  list(): string[];
}
