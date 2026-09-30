// M5 — Certification Profile & Evidence Publication builder. Deterministic; consumes an M4 CertificationResult
// (+ its evidence chain) and produces an immutable certification-profile candidate, a publication decision (15
// gates), and a registry-update PROPOSAL. It NEVER mutates the production registry, NEVER publishes, NEVER
// upgrades a NOT_CERTIFIED result, and NEVER lets a SYNTHETIC_TEST_ONLY profile reach production.
import { sha256, canonicalJson } from '../src/canonical.ts';
import { validateEvidenceChain } from './certification.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import type { CertificationResult, EvidenceRecord } from './certification-types.ts';
import type {
  CertificationProfile, PublicationGate, PublicationDecision, PgOutcome, PublicationState,
  RegistryUpdateProposal, RegistryOperation, Issuer, SignatureStatus, M5Artifact,
} from './profile-types.ts';

export interface BuildOpts {
  clock: () => string;
  issuer?: Issuer | null;
  signature_status?: SignatureStatus;
  publication_authorized?: boolean;
  previous_artifact_hash?: string | null;
}

function hashProfile(p: Omit<CertificationProfile, 'artifact_hash'>): string {
  return sha256(canonicalJson(p));
}
function hashProposal(p: Omit<RegistryUpdateProposal, 'proposal_hash'>): string {
  return sha256(canonicalJson(p));
}

export function buildProfileCandidate(cert: CertificationResult, chain: EvidenceRecord[], opts: BuildOpts): Omit<CertificationProfile, 'artifact_hash' | 'publication_status'> {
  const id = cert.host_identity;
  const capRefs = cert.probe_results.filter((p) => p.kind === 'capability').map((p) => p.evidence_ref!).filter(Boolean);
  const facetRefs = cert.probe_results.filter((p) => p.kind === 'facet').map((p) => p.evidence_ref!).filter(Boolean);
  const attrRef = cert.probe_results.find((p) => p.kind === 'attribution')?.evidence_ref ?? null;
  return {
    schema: 'dkskill.certification_profile/1', version: 1,
    profile_id: cert.synthetic ? 'synthetic-test-only-profile@1' : `certprofile-${cert.profile_id ?? 'unresolved'}@candidate`,
    synthetic_test_only: cert.synthetic,
    lifecycle_state: cert.final_decision,
    host_identity: id, platform: id.platform, architecture: id.architecture, claude_code_version: id.version, channel: id.channel, binary_sha256: id.binary_sha256,
    compatibility_profile_ref: cert.profile_id,
    capability_evidence_refs: capRefs, facet_evidence_refs: facetRefs, attribution_evidence_ref: attrRef,
    certification_result_ref: cert.run_id,
    evidence_chain_head: chain.length ? chain[chain.length - 1].record_hash ?? null : null,
    certification_environment_id: cert.environment_id,
    certification_timestamp: opts.clock(),
    owner_review_ref: cert.owner_review ? `review:${cert.owner_review.reviewer}:${cert.owner_review.decision}` : null,
    issuer: opts.issuer ?? null,
    signature_status: opts.signature_status ?? (cert.synthetic ? 'SIGNED' : 'SIGNATURE_MISSING'),
    supersedes: null,
    revocation: cert.final_decision === 'REVOKED' ? { reason: 'M4 profile revoked', at: opts.clock(), authority: 'registry' } : null,
    previous_artifact_hash: opts.previous_artifact_hash ?? null,
  };
}

export function decidePublication(profile: Omit<CertificationProfile, 'artifact_hash' | 'publication_status'>, cert: CertificationResult, chain: EvidenceRecord[], opts: BuildOpts): PublicationDecision {
  const gates: PublicationGate[] = [];
  const G = (gate_id: string, name: string, result: PgOutcome, reasons: string[] = []) => gates.push({ gate_id, name, result, reasons });
  const id = profile.host_identity;
  const allDims = ['product', 'version', 'platform', 'architecture', 'channel'].every((d) => (id as any)[d] != null);
  const m4Certified = cert.final_decision === 'CERTIFIED';
  const m4AllGatesPass = cert.gate_results.every((g) => g.result === 'PASS');
  const cg05 = cert.gate_results.find((g) => g.gate_id === 'CG-05')?.result;
  const anyNotRun = cert.gate_results.some((g) => g.result === 'NOT_RUN');
  const validSig = profile.signature_status === 'SIGNED' && !!profile.issuer && !profile.issuer.synthetic;

  G('PG-01', 'exact host identity', allDims ? 'PASS' : 'FAIL', [`identity_complete=${allDims}`]);
  G('PG-02', 'exact compatibility-profile reference', profile.compatibility_profile_ref ? 'PASS' : 'FAIL', [`ref=${profile.compatibility_profile_ref ?? 'null'}`]);
  G('PG-03', 'exact Claude Code version', profile.claude_code_version ? 'PASS' : 'FAIL', [`version=${profile.claude_code_version ?? 'null'}`]);
  G('PG-04', 'exact binary identity', profile.binary_sha256 ? 'PASS' : 'FAIL', [`sha256=${profile.binary_sha256 ? 'present' : 'absent'}`]);
  G('PG-05', 'platform/architecture/channel identity', (profile.platform && profile.architecture && profile.channel) ? 'PASS' : 'FAIL', [`${profile.platform}/${profile.architecture}/${profile.channel}`]);
  G('PG-06', 'M4 certification state', m4Certified ? 'PASS' : 'FAIL', [`m4_decision=${cert.final_decision}`]);
  G('PG-07', 'all mandatory M4 gates passed', m4AllGatesPass ? 'PASS' : 'FAIL', m4AllGatesPass ? [] : cert.gate_results.filter((g) => g.result !== 'PASS').map((g) => `${g.gate_id}:${g.result}`).slice(0, 6));
  G('PG-08', 'evidence-chain integrity', chain.length ? (validateEvidenceChain(chain) ? 'PASS' : 'FAIL') : 'BLOCKED', [`records=${chain.length}`]);
  G('PG-09', 'no required evidence missing', (profile.evidence_chain_head && !anyNotRun) ? 'PASS' : 'BLOCKED', [`chain_head=${profile.evidence_chain_head ? 'present' : 'absent'}`, `m4_not_run=${anyNotRun}`]);
  G('PG-10', 'no unresolved safety-critical limitation', cg05 === 'PASS' ? 'PASS' : 'BLOCKED', [`CG-05=${cg05 ?? 'n/a'}`]);
  G('PG-11', 'owner approval', cert.owner_review?.decision === 'APPROVE' ? 'PASS' : 'NOT_RUN', [`owner=${cert.owner_review?.decision ?? 'ABSENT'}`]);
  G('PG-12', 'certification environment validity', profile.certification_environment_id ? 'PASS' : 'BLOCKED', [`env=${profile.certification_environment_id ?? 'absent'}`]);
  G('PG-13', 'no synthetic-test-only publication', profile.synthetic_test_only ? 'FAIL' : 'PASS', [`synthetic=${profile.synthetic_test_only}`]);
  G('PG-14', 'publication authorization', (opts.publication_authorized === true && validSig) ? 'PASS' : 'NOT_RUN', [`authorized=${opts.publication_authorized === true}`, `signature=${profile.signature_status}`, `issuer_synthetic=${profile.issuer?.synthetic ?? 'none'}`]);
  G('PG-15', 'supersession/revocation consistency', profile.revocation ? 'FAIL' : 'PASS', [`revoked=${!!profile.revocation}`]);

  const allPass = gates.every((g) => g.result === 'PASS');
  let state: PublicationState;
  if (profile.synthetic_test_only) state = 'REJECTED';                        // synthetic can NEVER publish
  else if (profile.revocation) state = 'REVOKED';
  else if (allPass) state = 'PUBLISHED';
  else if (!m4Certified) state = 'DRAFT';
  else state = 'REVIEW_REQUIRED';
  const reason_codes = gates.filter((g) => g.result !== 'PASS').map((g) => `${g.gate_id}:${g.result}`);
  return { gates, state, eligible: allPass && !profile.synthetic_test_only, reason_codes };
}

export function buildProposal(profile: CertificationProfile, cert: CertificationResult, decision: PublicationDecision, opts: BuildOpts): RegistryUpdateProposal {
  let operation: RegistryOperation = 'NONE';
  if (decision.state === 'PUBLISHED') operation = profile.supersedes ? 'SUPERSEDE_PROFILE' : 'ADD_PROFILE';
  else if (profile.revocation) operation = 'REVOKE_PROFILE';
  else operation = 'UPDATE_STATUS';
  const base: Omit<RegistryUpdateProposal, 'proposal_hash'> = {
    schema: 'dkskill.compatibility_registry_update_proposal/1', version: 1,
    proposal_id: `proposal-${profile.profile_id}`,
    source_profile_id: profile.profile_id,
    source_certification_result_id: cert.run_id,
    operation,
    target_identity: { product: profile.host_identity.product, version: profile.claude_code_version, platform: profile.platform, architecture: profile.architecture, channel: profile.channel, binary_sha256: profile.binary_sha256 },
    capability_refs: profile.capability_evidence_refs,
    facet_refs: profile.facet_evidence_refs,
    attribution_ref: profile.attribution_evidence_ref,
    evidence_chain_head: profile.evidence_chain_head,
    owner_approval_ref: profile.owner_review_ref,
    publication_state: decision.state,
    created_at: opts.clock(),
    supersedes: profile.supersedes?.profile_id ?? null,
    revokes: profile.revocation ? profile.compatibility_profile_ref : null,
    applies_to_registry: false,                                              // NEVER a mutation
  };
  return { ...base, proposal_hash: hashProposal(base) };
}

export function buildM5Artifact(cert: CertificationResult, chain: EvidenceRecord[], opts: BuildOpts): M5Artifact {
  const candidate = buildProfileCandidate(cert, chain, opts);
  const decision = decidePublication(candidate, cert, chain, opts);
  const withStatus = { ...candidate, publication_status: decision.state } as Omit<CertificationProfile, 'artifact_hash'>;
  const profile: CertificationProfile = { ...withStatus, artifact_hash: hashProfile(withStatus) };
  const proposal = buildProposal(profile, cert, decision, opts);
  return { schema: 'dkskill.certification_publication/1', version: 1, synthetic_test_only: profile.synthetic_test_only, profile, publication: decision, proposal };
}

// H-Q2 latest-3: derived ONLY from actually PUBLISHED + CERTIFIED, non-revoked, non-superseded profiles.
export function activeCertifiedSet(publishedProfiles: CertificationProfile[]): CertificationProfile[] {
  return publishedProfiles
    .filter((p) => p.publication_status === 'PUBLISHED' && p.lifecycle_state === 'CERTIFIED' && !p.revocation && !p.synthetic_test_only)
    .slice(-3);
}

// The production registry currently holds ZERO certified profiles (do not fabricate any).
export function productionCertifiedCount(): number {
  return buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length;
}
