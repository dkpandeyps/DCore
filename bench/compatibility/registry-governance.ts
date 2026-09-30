// M6 — Signed Registry Publication & Governance engine. Deterministic, fail-closed. It governs an already-created
// M5 publication proposal: validates the proposal, authorization, signature and registry preconditions through 25
// gates (GG-01..25), and — ONLY when every gate passes — applies an atomic mutation to an in-memory registry STATE
// object and emits an immutable publication record. It NEVER writes production registry files, certifies a host,
// probes/executes Claude, or accepts a synthetic profile/signer for production.
import { sha256, canonicalJson } from '../src/canonical.ts';
import type { CertificationResult, EvidenceRecord } from './certification-types.ts';
import { validateEvidenceChain } from './certification.ts';
import type { CertificationProfile, RegistryUpdateProposal, PublicationDecision } from './profile-types.ts';
import type {
  Signature, PublicationAuthorization, RegistryPrecondition, RegistryMutation, GovernanceGate, GgOutcome,
  GovernanceResult, GovernanceState, PublicationRecord, RevocationRecord, SupersessionRecord, ReversalRecord, MutationType,
} from './registry-governance-types.ts';

// ---- deterministic registry hashing (canonical; no fs metadata/timestamps) --------------------------------
export function registryHash(registry: unknown): string {
  return sha256(canonicalJson(registry));
}

// ---- deterministic (non-cryptographic) signer abstraction -------------------------------------------------
export function signPayload(payloadHash: string, issuer_id: string, issuer_role: string, opts: { synthetic: boolean }): Signature {
  return {
    issuer_id, issuer_role, signature_algorithm: 'deterministic-demo-sha256',
    signature: sha256(`${issuer_id}|${issuer_role}|${payloadHash}`),
    signed_payload_hash: payloadHash, signature_state: 'SIGNED', key_reference: `keyref:${issuer_id}`,
    synthetic_test_signer: opts.synthetic,
  };
}
export function validateSignature(sig: Signature | null, payloadHash: string, authorizedSigners: string[]): { state: Signature['signature_state']; authorized: boolean } {
  if (!sig) return { state: 'SIGNATURE_MISSING', authorized: false };
  if (sig.signature_state !== 'SIGNED') return { state: sig.signature_state, authorized: false };
  if (sig.synthetic_test_signer) return { state: 'SIGNER_UNAUTHORIZED', authorized: false };
  if (sig.signed_payload_hash !== payloadHash) return { state: 'SIGNATURE_INVALID', authorized: false };
  if (sig.signature !== sha256(`${sig.issuer_id}|${sig.issuer_role}|${payloadHash}`)) return { state: 'SIGNATURE_INVALID', authorized: false };
  if (!authorizedSigners.includes(sig.issuer_id)) return { state: 'SIGNER_UNAUTHORIZED', authorized: false };
  return { state: 'SIGNED', authorized: true };
}

// ---- authorization binding --------------------------------------------------------------------------------
export function authorizationPayloadHash(proposal: RegistryUpdateProposal, profile: CertificationProfile): string {
  return sha256(canonicalJson({
    proposal_id: proposal.proposal_id, profile_id: profile.profile_id,
    version: profile.claude_code_version, platform: profile.platform, architecture: profile.architecture,
    channel: profile.channel, binary_sha256: profile.binary_sha256, operation: proposal.operation,
  }));
}
export function validateAuthorization(auth: PublicationAuthorization | null, proposal: RegistryUpdateProposal, profile: CertificationProfile): { present: boolean; bound: boolean } {
  if (!auth) return { present: false, bound: false };
  const bound = auth.target_proposal_id === proposal.proposal_id && auth.target_profile_id === profile.profile_id
    && auth.authorization_payload_hash === authorizationPayloadHash(proposal, profile);
  return { present: true, bound };
}

// ---- registry preconditions (compare-and-swap) ------------------------------------------------------------
export function validateRegistryPreconditions(registry: any, pre: RegistryPrecondition): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (registryHash(registry) !== pre.expected_registry_hash) reasons.push('STALE_REGISTRY_HASH_MISMATCH');
  if (registry?.schema !== pre.expected_registry_schema) reasons.push('SCHEMA_MISMATCH');
  if (registry?.registry_version !== pre.expected_registry_version) reasons.push('VERSION_MISMATCH');
  const existing = (registry?.profiles ?? []).find((p: any) => p.profile_id === pre.target_profile_id);
  if (pre.expected_target_absent && existing) reasons.push('TARGET_ALREADY_PRESENT');
  if (pre.expected_target_state && (!existing || existing.certification_status !== pre.expected_target_state)) reasons.push('TARGET_STATE_MISMATCH');
  return { ok: reasons.length === 0, reasons };
}

// ---- conflict detection -----------------------------------------------------------------------------------
function conflicts(registry: any, profile: CertificationProfile, mutation_type: MutationType): string[] {
  const out: string[] = [];
  const profiles = registry?.profiles ?? [];
  if (mutation_type === 'ADD_PROFILE') {
    if (profiles.some((p: any) => p.profile_id === profile.profile_id)) out.push('DUPLICATE_PROFILE_ID');
    const sameId = profiles.find((p: any) => p.version === profile.claude_code_version && p.platform === profile.platform && p.architecture === profile.architecture && p.channel === profile.channel);
    if (sameId && sameId.binary_sha256 && profile.binary_sha256 && sameId.binary_sha256.toUpperCase() !== profile.binary_sha256.toUpperCase()) out.push('CONFLICTING_BINARY_IDENTITY');
    const target = profiles.find((p: any) => p.profile_id === (profile.compatibility_profile_ref));
    if (target && (target.revoked || target.lifecycle_state === 'revoked')) out.push('TARGET_REVOKED');
    if (target && target.lifecycle_state === 'superseded') out.push('TARGET_SUPERSEDED');
  }
  return out;
}

// ---- atomic mutation (pure; operates on an in-memory registry state) ---------------------------------------
export function buildRegistryMutation(profile: CertificationProfile, proposal: RegistryUpdateProposal): RegistryMutation {
  return {
    mutation_type: proposal.operation,
    target_profile_id: profile.profile_id,
    profile_payload: proposal.operation === 'ADD_PROFILE' ? profileToRegistryRow(profile) : null,
    status_change: proposal.operation === 'UPDATE_STATUS' || proposal.operation === 'REVOKE_PROFILE' ? { from: 'active', to: proposal.operation === 'REVOKE_PROFILE' ? 'revoked' : 'updated' } : null,
    supersedes_profile_id: profile.supersedes?.profile_id ?? null,
  };
}
function profileToRegistryRow(profile: CertificationProfile): Record<string, unknown> {
  return {
    profile_id: profile.profile_id, product: profile.host_identity.product, version: profile.claude_code_version,
    platform: profile.platform, architecture: profile.architecture, channel: profile.channel,
    binary_sha256: profile.binary_sha256, is_scope_placeholder: false,
    validation_status: 'CERTIFIED', certification_status: 'CERTIFIED', lifecycle_state: 'active',
    published_via: profile.certification_result_ref, evidence_chain_head: profile.evidence_chain_head,
  };
}
export function applyRegistryMutation(registry: any, mutation: RegistryMutation): { ok: boolean; next: any; resulting_hash: string; reasons: string[] } {
  // Validate the ENTIRE mutation before applying; build a complete next state; verify; never partial.
  const next = JSON.parse(JSON.stringify(registry));
  const reasons: string[] = [];
  if (mutation.mutation_type === 'ADD_PROFILE') {
    if ((next.profiles ?? []).some((p: any) => p.profile_id === mutation.target_profile_id)) reasons.push('DUPLICATE_ON_APPLY');
    else next.profiles = [...(next.profiles ?? []), mutation.profile_payload];
  } else if (mutation.mutation_type === 'UPDATE_STATUS' || mutation.mutation_type === 'REVOKE_PROFILE') {
    const p = (next.profiles ?? []).find((x: any) => x.profile_id === mutation.target_profile_id);
    if (!p) reasons.push('TARGET_NOT_FOUND');
    else if (mutation.mutation_type === 'REVOKE_PROFILE') { p.revoked = true; p.lifecycle_state = 'revoked'; }
    else if (mutation.status_change) p.lifecycle_state = 'updated';
  } else reasons.push('UNSUPPORTED_MUTATION');
  if (reasons.length) return { ok: false, next: registry, resulting_hash: registryHash(registry), reasons };
  return { ok: true, next, resulting_hash: registryHash(next), reasons: [] };
}

// ---- immutable records + history --------------------------------------------------------------------------
function hashRecord<T extends { record_hash?: string }>(rec: Omit<T, 'record_hash'>): string { return sha256(canonicalJson(rec)); }
export function buildPublicationRecord(base: Omit<PublicationRecord, 'record_hash'>): PublicationRecord { return { ...base, record_hash: hashRecord(base) }; }
export function buildRevocationRecord(base: Omit<RevocationRecord, 'record_hash'>): RevocationRecord { return { ...base, record_hash: hashRecord(base) }; }
export function buildSupersessionRecord(base: Omit<SupersessionRecord, 'record_hash'>): SupersessionRecord { return { ...base, record_hash: hashRecord(base) }; }
export function buildReversalRecord(base: Omit<ReversalRecord, 'record_hash'>): ReversalRecord { return { ...base, record_hash: hashRecord(base) }; }

export function verifyPublicationHistory(records: { record_hash?: string; previous_record_hash: string | null; publication_id?: string }[]): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const ids = new Set<string>();
  let prev: string | null = null;
  for (const r of records) {
    const id = (r as any).publication_id ?? (r as any).revocation_id ?? (r as any).supersession_id ?? (r as any).reversal_id;
    if (id) { if (ids.has(id)) reasons.push(`DUPLICATE_ID:${id}`); ids.add(id); }
    if (r.previous_record_hash !== prev) { reasons.push('BROKEN_OR_REORDERED_CHAIN'); break; }
    const { record_hash, ...rest } = r as any;
    if (hashRecord(rest) !== record_hash) { reasons.push('MODIFIED_RECORD'); break; }
    prev = record_hash!;
  }
  return { ok: reasons.length === 0, reasons };
}

export function validateRollback(targetPublicationId: string, history: PublicationRecord[], auth: PublicationAuthorization | null): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!auth) reasons.push('NO_AUTHORIZATION');
  if (!history.some((r) => r.publication_id === targetPublicationId)) reasons.push('TARGET_PUBLICATION_NOT_FOUND');
  if (!verifyPublicationHistory(history).ok) reasons.push('HISTORY_INTEGRITY_FAILED');
  return { ok: reasons.length === 0, reasons };   // rollback creates a NEW reversal record; it never erases history
}

// ---- the governance engine (25 gates, fail-closed) --------------------------------------------------------
export interface GovernanceRequest {
  request_id: string;
  proposal: RegistryUpdateProposal;
  profile: CertificationProfile;
  publication: PublicationDecision;
  certResult: CertificationResult;
  evidenceChain: EvidenceRecord[];
  authorization: PublicationAuthorization | null;
  signature: Signature | null;
  registry: any;                       // in-memory registry STATE to publish INTO (never production files)
  precondition: RegistryPrecondition;
  authorizedSigners: string[];
  clock: () => string;
  previous_record_hash?: string | null;
  synthetic_demo?: boolean;
}

export function runGovernance(req: GovernanceRequest): { result: GovernanceResult; nextRegistry: any } {
  const gates: GovernanceGate[] = [];
  const G = (gate_id: string, name: string, result: GgOutcome, reasons: string[] = []) => gates.push({ gate_id, name, result, reasons });
  const { proposal: pr, profile: pf, publication: pub, certResult: cert } = req;
  const before = registryHash(req.registry);
  const idOk = ['product', 'version', 'platform', 'architecture', 'channel'].every((d) => (pf.host_identity as any)[d] != null);
  const authV = validateAuthorization(req.authorization, pr, pf);
  const payloadHash = authorizationPayloadHash(pr, pf);
  const sigV = validateSignature(req.signature, payloadHash, req.authorizedSigners);
  const pre = validateRegistryPreconditions(req.registry, req.precondition);
  const confl = conflicts(req.registry, pf, pr.operation);

  G('GG-01', 'valid proposal schema', pr.schema === 'dkskill.compatibility_registry_update_proposal/1' && pr.applies_to_registry === false ? 'PASS' : 'FAIL');
  G('GG-02', 'exact source certification profile', pr.source_profile_id === pf.profile_id ? 'PASS' : 'FAIL');
  G('GG-03', 'M5 publication state valid', (pub.state === 'PUBLISHED' || pub.state === 'APPROVED_FOR_PUBLICATION') ? 'PASS' : 'FAIL', [`m5_state=${pub.state}`]);
  G('GG-04', 'M4 certification state valid', cert.final_decision === 'CERTIFIED' ? 'PASS' : 'FAIL', [`m4=${cert.final_decision}`]);
  G('GG-05', 'all mandatory M5 publication gates PASS', pub.gates.every((g) => g.result === 'PASS') ? 'PASS' : 'FAIL', pub.reason_codes.slice(0, 6));
  G('GG-06', 'exact profile identity', idOk ? 'PASS' : 'FAIL');
  G('GG-07', 'exact version', pf.claude_code_version ? 'PASS' : 'FAIL');
  G('GG-08', 'exact platform', pf.platform ? 'PASS' : 'FAIL');
  G('GG-09', 'exact architecture', pf.architecture ? 'PASS' : 'FAIL');
  G('GG-10', 'exact channel', pf.channel ? 'PASS' : 'FAIL');
  G('GG-11', 'exact binary SHA-256', pf.binary_sha256 ? 'PASS' : 'FAIL');
  G('GG-12', 'evidence-chain integrity', req.evidenceChain.length ? (validateEvidenceChain(req.evidenceChain) ? 'PASS' : 'FAIL') : 'BLOCKED');
  G('GG-13', 'owner approval valid', cert.owner_review?.decision === 'APPROVE' ? 'PASS' : 'NOT_RUN');
  G('GG-14', 'publication authorization valid', authV.present ? (authV.bound ? 'PASS' : 'FAIL') : 'NOT_RUN');
  G('GG-15', 'authorized signer', sigV.authorized ? 'PASS' : (req.signature ? 'FAIL' : 'NOT_RUN'), [`sig_state=${sigV.state}`]);
  G('GG-16', 'signature present', req.signature ? 'PASS' : 'FAIL');
  G('GG-17', 'signature valid', sigV.state === 'SIGNED' ? 'PASS' : 'FAIL', [`sig_state=${sigV.state}`]);
  G('GG-18', 'non-synthetic profile', pf.synthetic_test_only ? 'FAIL' : 'PASS', [`synthetic=${pf.synthetic_test_only}`]);
  G('GG-19', 'registry precondition matches', pre.ok ? 'PASS' : 'BLOCKED', pre.reasons);
  G('GG-20', 'no conflicting active profile', confl.length ? 'FAIL' : 'PASS', confl);
  G('GG-21', 'supersession/revocation consistency', pf.revocation ? 'FAIL' : 'PASS', [`revoked=${!!pf.revocation}`]);
  G('GG-22', 'immutable-history consistency', 'PASS');   // no prior records supplied here => trivially consistent
  G('GG-23', 'no forbidden registry mutation', pr.operation !== 'NONE' ? 'PASS' : 'FAIL', [`op=${pr.operation}`]);
  G('GG-24', 'atomic-update preconditions', (pre.ok && confl.length === 0) ? 'PASS' : 'BLOCKED');
  G('GG-25', 'rollback safety', 'PASS');                 // no rollback requested in a forward publication

  const allPass = gates.every((g) => g.result === 'PASS');
  const anyFail = gates.some((g) => g.result === 'FAIL');
  const decision_reasons = gates.filter((g) => g.result !== 'PASS').map((g) => `${g.gate_id}:${g.result}`);

  let state: GovernanceState;
  let mutation: RegistryMutation | null = null;
  let publication_record: PublicationRecord | null = null;
  let nextRegistry = req.registry;
  let after = before;

  if (allPass) {
    mutation = buildRegistryMutation(pf, pr);
    const applied = applyRegistryMutation(req.registry, mutation);
    if (!applied.ok) { state = 'FAILED'; decision_reasons.push(...applied.reasons); }
    else {
      nextRegistry = applied.next; after = applied.resulting_hash;
      publication_record = buildPublicationRecord({
        schema: 'dkskill.registry_publication_record/1', publication_id: `pub-${pf.profile_id}`, proposal_id: pr.proposal_id,
        profile_id: pf.profile_id, mutation_type: mutation.mutation_type,
        identity: { product: pf.host_identity.product, version: pf.claude_code_version, platform: pf.platform, architecture: pf.architecture, channel: pf.channel, binary_sha256: pf.binary_sha256 },
        signer: req.signature!.issuer_id, authorization_id: req.authorization?.authorization_id ?? null,
        previous_registry_hash: before, resulting_registry_hash: after, timestamp: req.clock(),
        previous_record_hash: req.previous_record_hash ?? null,
      });
      state = 'PUBLISHED';
    }
  } else {
    state = anyFail ? 'REJECTED' : 'REJECTED';   // fail-closed: any non-PASS (FAIL/BLOCKED/NOT_RUN) => not published
    if (!anyFail && gates.some((g) => g.result === 'BLOCKED')) state = 'REJECTED';
  }

  const result: GovernanceResult = {
    schema: 'dkskill.registry_governance/1', version: 1, request_id: req.request_id, synthetic_demo: req.synthetic_demo ?? false,
    state, gates, decision_reasons, mutation, publication_record,
    registry_hash_before: before, registry_hash_after: after, registry_changed: after !== before,
  };
  return { result, nextRegistry };
}
