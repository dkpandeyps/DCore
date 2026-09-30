// M5 — Certification Profile & Evidence Publication types. Repository-side; never mutates the production
// registry, never certifies a real host, never publishes. Synthetic profiles can never become production.
import type { HostIdentity } from './hcl-types.ts';

export type PublicationState = 'DRAFT' | 'REVIEW_REQUIRED' | 'APPROVED_FOR_PUBLICATION' | 'PUBLISHED' | 'REJECTED' | 'REVOKED' | 'SUPERSEDED';
export type SignatureStatus = 'UNSIGNED' | 'SIGNED' | 'SIGNATURE_INVALID' | 'SIGNATURE_MISSING';
export type PgOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';
export type RegistryOperation = 'ADD_PROFILE' | 'UPDATE_STATUS' | 'SUPERSEDE_PROFILE' | 'REVOKE_PROFILE' | 'NONE';

export interface Issuer { authority: string; synthetic: boolean }

export interface CertificationProfile {
  schema: 'dkskill.certification_profile/1';
  version: 1;
  profile_id: string;
  synthetic_test_only: boolean;
  lifecycle_state: string;                 // mirrors the M4 certification decision (CERTIFIED / NOT_CERTIFIED / ...)
  host_identity: HostIdentity;
  platform: string | null;
  architecture: string | null;
  claude_code_version: string | null;
  channel: string | null;
  binary_sha256: string | null;
  compatibility_profile_ref: string | null;
  capability_evidence_refs: string[];
  facet_evidence_refs: string[];
  attribution_evidence_ref: string | null;
  certification_result_ref: string;
  evidence_chain_head: string | null;
  certification_environment_id: string | null;
  certification_timestamp: string;
  owner_review_ref: string | null;
  issuer: Issuer | null;
  signature_status: SignatureStatus;
  publication_status: PublicationState;
  supersedes: { profile_id: string; version: string | null; binary_sha256: string | null } | null;
  revocation: { reason: string; at: string; authority: string } | null;
  previous_artifact_hash: string | null;
  artifact_hash?: string;
}

export interface PublicationGate { gate_id: string; name: string; result: PgOutcome; reasons: string[] }

export interface PublicationDecision {
  gates: PublicationGate[];
  state: PublicationState;
  eligible: boolean;
  reason_codes: string[];
}

export interface RegistryUpdateProposal {
  schema: 'dkskill.compatibility_registry_update_proposal/1';
  version: 1;
  proposal_id: string;
  source_profile_id: string;
  source_certification_result_id: string;
  operation: RegistryOperation;
  target_identity: { product: string | null; version: string | null; platform: string | null; architecture: string | null; channel: string | null; binary_sha256: string | null };
  capability_refs: string[];
  facet_refs: string[];
  attribution_ref: string | null;
  evidence_chain_head: string | null;
  owner_approval_ref: string | null;
  publication_state: PublicationState;
  created_at: string;
  supersedes: string | null;
  revokes: string | null;
  applies_to_registry: false;              // ALWAYS false: a proposal is never a mutation
  proposal_hash?: string;
}

export interface M5Artifact {
  schema: 'dkskill.certification_publication/1';
  version: 1;
  synthetic_test_only: boolean;
  profile: CertificationProfile;
  publication: PublicationDecision;
  proposal: RegistryUpdateProposal;
}
