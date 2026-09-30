// M19 — Certification-side Identity Attestation DESIGN types.
// DESIGN ONLY. Repository-local, deterministic, FAIL-CLOSED. It models how the PTPL certification pipeline WOULD bind
// exact identity (product/version/OS/os_version/arch/channel/runtime/binary SHA-256) as authoritative evidence. It
// performs NO certification, NO signing, NO Claude execution, NO authentication, NO network, and mutates nothing.
// Authoritative identity belongs at the certification boundary — never through client-side guessing. It never emits
// CERTIFIED/SIGNED/PUBLISHED and never modifies M4/M5/M6/M7/M8/M9/M13/M17/M18 or the production registry.
import type { Platform } from './universal-compatibility-types.ts';

export type ObsField = 'product' | 'version' | 'operating_system' | 'os_version' | 'architecture' | 'channel' | 'runtime_facet' | 'binary_sha256';
// Provenance strength (ordered; not all evidence classes are equivalent).
export type ProvenanceStrength = 'SELF_REPORTED' | 'LOCAL_OBSERVATION' | 'CONTROLLED_OBSERVATION' | 'INDEPENDENT_OBSERVATION' | 'CERTIFICATION_ATTESTATION';
export type FieldState = 'OBSERVED' | 'UNKNOWN' | 'CONTRADICTED' | 'INSUFFICIENT_PROVENANCE';
// M19 never yields CERTIFIED/SIGNED/PUBLISHED.
export type AttestationStatus = 'INCOMPLETE' | 'COMPLETE_UNSIGNED' | 'CONTRADICTED' | 'AMBIGUOUS' | 'EXPIRED' | 'REVOKED' | 'SUPERSEDED' | 'TAMPERED';
export type SignatureStatus = 'UNSIGNED' | 'SIGNATURE_REQUIRED';   // M19 performs no signing

export interface ObservationSource {
  field: ObsField;
  value: string;
  source: string;                      // e.g. 'EMBEDDED_BINARY_RESOURCE' / 'INDEPENDENT_OBSERVER'
  observer: string;
  observation_time: string;
  environment: string;
  evidence_hash: string;
  provenance_strength: ProvenanceStrength;
}

export interface FieldProvenance { field: ObsField; value: string | null; state: FieldState; strength: ProvenanceStrength | null; source: string | null }

export interface CertificationIdentityAttestation {
  schema: 'dkskill.certification_identity_attestation/1';
  version: 1;
  synthetic_test_only: boolean;
  attestation_id: string;
  product: string | null;
  claude_version: string | null;
  operating_system: string | null;
  os_version: string | null;
  architecture: string | null;
  channel: string | null;
  runtime_facet: string | null;
  binary_sha256: string | null;
  observation_sources: ObservationSource[];
  observation_timestamps: string[];
  evidence_references: string[];
  provenance: FieldProvenance[];
  environment_id: string | null;
  profile_id: string | null;
  installation_ref: string | null;       // the EXACT installation certified (no PATH guess, no default)
  ambiguous_installations: boolean;
  evidence_hashes: string[];
  attestation_status: AttestationStatus;
  signer_identity: null;                  // never invented in M19
  signature_status: SignatureStatus;
  signing_required: true;                 // authorized signing is required before authoritative publication
  created_at: string;
  expires_at: string | null;
  revocation_reference: string | null;
  supersession_reference: string | null;
  previous_attestation_hash: string | null;
  matrix_combo: { platform: Platform | null; architecture: string | null; channel: string | null; version: string | null };
  contradictions: string[];
  reasons: string[];
  attestation_hash?: string;
}

export interface AttestationThreat { threat: string; required_evidence: string; control: string; failure_state: string; certification_blocked: boolean }

export interface IntegrationInterface { stage: 'M7' | 'M8' | 'M9' | 'M4' | 'M5' | 'M6' | 'M13'; role: string; consumes: string; produces: string; m19_executes: false }
