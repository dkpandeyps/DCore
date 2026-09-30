// M13-UNIVERSAL — Global Certification Matrix types. A universal matrix over platform × architecture × channel ×
// version × facets. Every individual combination has an explicit state; NO missing combination is ever certified;
// NO automatic inheritance. Records are immutable and auditable. Repository-local, deterministic, fail-closed.
import type { Platform } from './universal-compatibility-types.ts';

export type CertState = 'CERTIFIED' | 'NOT_CERTIFIED' | 'NOT_VALIDATED' | 'BLOCKED' | 'FAILED' | 'REVOKED' | 'SUPERSEDED';
export type RegistryRecordState = 'PROBED' | 'VALIDATED' | 'CERTIFIED' | 'PUBLISHED' | 'REVOKED' | 'SUPERSEDED' | 'NOT_VALIDATED' | 'NOT_CERTIFIED';
export type VersionLifecycle =
  | 'NEW_RELEASE_SEEN' | 'UNVERIFIED' | 'PROBING' | 'REGRESSION' | 'BEHAVIORAL_DIFF' | 'CERTIFICATION_REVIEW'
  | 'CERTIFIED' | 'PUBLISHED' | 'FAILED' | 'BLOCKED' | 'REVOKED' | 'SUPERSEDED';

export interface MatrixCombo {
  platform: Platform;
  architecture: string;
  channel: string;
  version: string;
}

export interface GlobalCertificationRecord {
  schema: 'dkskill.global_certification_record/1';
  combo: MatrixCombo;
  profile_id: string | null;
  binary_sha256: string | null;
  cert_state: CertState;
  registry_state: RegistryRecordState;
  version_lifecycle: VersionLifecycle;
  facet_states: { family: string; state: string }[];
  capability_summary: { verified: number; total: number };
  attribution_in_scope: boolean;
  evidence_ref: string | null;
  signed: boolean;                   // registry updates require signed authorization (H-Q6)
  immutable: true;
  synthetic_test_only: boolean;
}

export interface GlobalCertificationMatrix {
  schema: 'dkskill.global_certification_matrix/1';
  version: 1;
  synthetic_test_only: boolean;
  dimensions: { platforms: Platform[]; architectures: string[]; channels: string[]; versions: string[] };
  records: GlobalCertificationRecord[];
  certified_count: number;
  latest_3_certified_versions: string[];
  no_inheritance: { version: true; platform: true; architecture: true; channel: true };
  requires_signed_authorization: true;
  matrix_hash?: string;
}
