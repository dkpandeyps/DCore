// M6 — Signed Registry Publication & Governance types. Repository-side, deterministic, fail-closed.
// Governs already-created M5 publication proposals; never certifies, probes, executes Claude, or mutates the
// production registry during ordinary tests. Mutations operate on an in-memory registry STATE object only.
import type { CertificationProfile, RegistryUpdateProposal } from './profile-types.ts';

export type GovernanceState = 'REQUESTED' | 'VALIDATING' | 'APPROVED' | 'APPLYING' | 'PUBLISHED' | 'REJECTED' | 'FAILED' | 'REVOKED' | 'SUPERSEDED' | 'ROLLED_BACK';
export type SignatureState = 'UNSIGNED' | 'SIGNED' | 'SIGNATURE_INVALID' | 'SIGNATURE_MISSING' | 'SIGNER_UNAUTHORIZED';
export type GgOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';
export type MutationType = 'ADD_PROFILE' | 'UPDATE_STATUS' | 'SUPERSEDE_PROFILE' | 'REVOKE_PROFILE' | 'NONE';

export interface Signature {
  issuer_id: string;
  issuer_role: string;
  signature_algorithm: string;
  signature: string;                 // deterministic stand-in token; NOT a real cryptographic signature
  signed_payload_hash: string;
  signature_state: SignatureState;
  key_reference: string | null;
  synthetic_test_signer: boolean;    // true => never valid for production
}

export interface PublicationAuthorization {
  authorization_id: string;
  authorized_by: string;
  authorized_role: string;
  target_profile_id: string;
  target_proposal_id: string;
  authorized_action: MutationType;
  authorization_timestamp: string;
  authorization_expiry: string | null;
  authorization_payload_hash: string;   // binds to the exact proposal identity
}

export interface RegistryPrecondition {
  expected_registry_hash: string;
  expected_registry_schema: string;
  expected_registry_version: number;
  target_profile_id: string;
  expected_target_absent?: boolean;      // for ADD_PROFILE
  expected_target_state?: string;        // for UPDATE_STATUS/REVOKE/SUPERSEDE
}

export interface RegistryMutation {
  mutation_type: MutationType;
  target_profile_id: string;
  profile_payload: unknown | null;       // the profile to add (for ADD_PROFILE)
  status_change: { from: string; to: string } | null;
  supersedes_profile_id: string | null;
}

export interface GovernanceGate { gate_id: string; name: string; result: GgOutcome; reasons: string[] }

export interface PublicationRecord {
  schema: 'dkskill.registry_publication_record/1';
  publication_id: string;
  proposal_id: string;
  profile_id: string;
  mutation_type: MutationType;
  identity: { product: string | null; version: string | null; platform: string | null; architecture: string | null; channel: string | null; binary_sha256: string | null };
  signer: string;
  authorization_id: string | null;
  previous_registry_hash: string;
  resulting_registry_hash: string;
  timestamp: string;
  previous_record_hash: string | null;
  record_hash?: string;
}

export interface RevocationRecord {
  schema: 'dkskill.registry_publication_record/1';
  kind: 'REVOCATION';
  revocation_id: string;
  profile_id: string;
  reason_code: string;
  authorized_by: string;
  authorization_ref: string | null;
  prior_state: string;
  resulting_state: 'REVOKED';
  timestamp: string;
  previous_record_hash: string | null;
  record_hash?: string;
}

export interface SupersessionRecord {
  schema: 'dkskill.registry_publication_record/1';
  kind: 'SUPERSESSION';
  supersession_id: string;
  new_profile_id: string;
  supersedes_profile_id: string;
  new_binary_sha256: string | null;
  superseded_binary_sha256: string | null;
  authorized_by: string;
  timestamp: string;
  previous_record_hash: string | null;
  record_hash?: string;
}

export interface ReversalRecord {
  schema: 'dkskill.registry_publication_record/1';
  kind: 'REVERSAL';
  reversal_id: string;
  target_publication_id: string;
  reason_code: string;
  authorized_by: string;
  timestamp: string;
  previous_record_hash: string | null;
  record_hash?: string;
}

export interface GovernanceResult {
  schema: 'dkskill.registry_governance/1';
  version: 1;
  request_id: string;
  synthetic_demo: boolean;
  state: GovernanceState;
  gates: GovernanceGate[];
  decision_reasons: string[];
  mutation: RegistryMutation | null;
  publication_record: PublicationRecord | null;
  registry_hash_before: string;
  registry_hash_after: string;
  registry_changed: boolean;
}
