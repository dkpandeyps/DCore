// M6 — deterministic governance demonstration artifacts. Executes no Claude, mutates NO production registry.
// The mechanics fixture uses a DEMO in-memory registry + a clearly-labelled DEMO host (never a real Claude Code
// profile). Real 2.1.283 and the M4 synthetic profile are proven UNPUBLISHABLE. main() guarded; fixed clock.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { real283Artifact, syntheticArtifact } from './gen-profile-sample.ts';
import { real283Input, syntheticInput } from './gen-certification-sample.ts';
import { runCertification, chainEvidence } from '../compatibility/certification.ts';
import { buildRegistry } from './gen-compatibility-registry.ts';
import {
  runGovernance, registryHash, signPayload, authorizationPayloadHash, buildRevocationRecord, buildSupersessionRecord,
  type GovernanceRequest,
} from '../compatibility/registry-governance.ts';
import type { CertificationProfile } from '../compatibility/profile-types.ts';
import type { CertificationResult, EvidenceRecord } from '../compatibility/certification-types.ts';
import type { HostIdentity } from '../compatibility/hcl-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
const FIXED = () => '2026-09-29T00:00:00Z';

function prodRegistryState() { return JSON.parse(JSON.stringify(buildRegistry())); }

// ---- 1 & 2: real host + synthetic profile => governance REJECTED (no mutation) ----
export function real283GovResult() {
  const input = real283Input();
  const cert = runCertification(input);
  const art = real283Artifact();
  const reg = prodRegistryState();
  const req: GovernanceRequest = {
    request_id: 'gov-real-283', proposal: art.proposal, profile: art.profile, publication: art.publication, certResult: cert,
    evidenceChain: input.evidence, authorization: null, signature: null, registry: reg,
    precondition: { expected_registry_hash: registryHash(reg), expected_registry_schema: 'dkskill.compat_registry/1', expected_registry_version: 1, target_profile_id: art.profile.profile_id, expected_target_absent: true },
    authorizedSigners: ['PTPL-PUBLISHER'], clock: FIXED, synthetic_demo: false,
  };
  return runGovernance(req).result;
}
export function syntheticGovResult() {
  const input = syntheticInput();
  const cert = runCertification(input);
  const art = syntheticArtifact();
  const reg = prodRegistryState();
  const req: GovernanceRequest = {
    request_id: 'gov-synthetic', proposal: art.proposal, profile: art.profile, publication: art.publication, certResult: cert,
    evidenceChain: input.evidence, authorization: null, signature: signPayload('x', 'SYN-SIGNER', 'publisher', { synthetic: true }), registry: reg,
    precondition: { expected_registry_hash: registryHash(reg), expected_registry_schema: 'dkskill.compat_registry/1', expected_registry_version: 1, target_profile_id: art.profile.profile_id, expected_target_absent: true },
    authorizedSigners: ['PTPL-PUBLISHER'], clock: FIXED, synthetic_demo: true,
  };
  return runGovernance(req).result;
}

// ---- 3: DEMO mechanics fixture (SYNTHETIC_TEST_ONLY) — exercises the atomic mutation on a DEMO registry ----
const DEMO_ID: HostIdentity = { product: 'claude-code-MECHANICS-DEMO', version: '0.0.0-demo', platform: 'mechanics-demo', architecture: 'demo', channel: 'demo', binary_sha256: 'D'.repeat(64), executable_source: 'DEMO' };
export function demoMechanicsRequest(opts: { registry?: any; staleHash?: string } = {}): GovernanceRequest {
  const registry = opts.registry ?? { schema: 'dkskill.compat_registry/1', registry_version: 1, generated_at: '2026-09-29', metadata: {}, facets: {}, profiles: [], integrity: {} };
  const profile: CertificationProfile = {
    schema: 'dkskill.certification_profile/1', version: 1, profile_id: 'demo-mechanics@1', synthetic_test_only: false,
    lifecycle_state: 'CERTIFIED', host_identity: DEMO_ID, platform: DEMO_ID.platform, architecture: DEMO_ID.architecture,
    claude_code_version: DEMO_ID.version, channel: DEMO_ID.channel, binary_sha256: DEMO_ID.binary_sha256,
    compatibility_profile_ref: 'demo-compat@1', capability_evidence_refs: ['evi_demo_cap'], facet_evidence_refs: ['evi_demo_facet'],
    attribution_evidence_ref: 'evi_demo_attr', certification_result_ref: 'run_demo', evidence_chain_head: null,
    certification_environment_id: 'CERT-ENV-DEMO', certification_timestamp: FIXED(), owner_review_ref: 'review:DEMO-OWNER:APPROVE',
    issuer: { authority: 'PTPL-DEMO', synthetic: false }, signature_status: 'SIGNED', publication_status: 'PUBLISHED',
    supersedes: null, revocation: null, previous_artifact_hash: null,
  };
  const chain: EvidenceRecord[] = chainEvidence([{ schema: 'dkskill.certification_evidence/1', evidence_id: 'evi_demo', environment_id: 'CERT-ENV-DEMO', host_identity: DEMO_ID, profile_id: 'demo-mechanics@1', probe_id: null, observed_result: 'PASS', source: 'demo', timestamp: FIXED(), input_hash: null, output_hash: null, redaction_status: 'NONE', validation_status: 'RECORDED' }]);
  profile.evidence_chain_head = chain[chain.length - 1].record_hash ?? null;
  const cert = { schema: 'dkskill.certification_result/1', version: 1, synthetic: false, run_id: 'run_demo', environment_id: 'CERT-ENV-DEMO', host_identity: DEMO_ID, profile_id: 'demo-compat@1', lifecycle_state: 'CERTIFIED', hcl_enforcement: 'ENFORCEMENT_ALLOWED', probe_results: [], gate_results: Array.from({ length: 15 }, (_, i) => ({ gate_id: `CG-${String(i + 1).padStart(2, '0')}`, name: 'demo', mandatory: true, result: 'PASS', reasons: [] })), capability_results: [], facet_results: [], regression: { result: 'NO_BEHAVIORAL_CHANGE', diffs: [] }, limitations: [], evidence_refs: ['evi_demo'], owner_review: { reviewer: 'DEMO-OWNER', profile_id: 'demo-mechanics@1', review_status: 'APPROVED', reviewed_evidence: ['evi_demo'], reviewed_limitations: [], decision: 'APPROVE', timestamp: FIXED() }, final_decision: 'CERTIFIED', reason_codes: [], proposed_update: null } as unknown as CertificationResult;
  const publication = { gates: Array.from({ length: 15 }, (_, i) => ({ gate_id: `PG-${String(i + 1).padStart(2, '0')}`, name: 'demo', result: 'PASS' as const, reasons: [] })), state: 'PUBLISHED' as const, eligible: true, reason_codes: [] };
  const proposal = { schema: 'dkskill.compatibility_registry_update_proposal/1' as const, version: 1 as const, proposal_id: 'proposal-demo-mechanics@1', source_profile_id: 'demo-mechanics@1', source_certification_result_id: 'run_demo', operation: 'ADD_PROFILE' as const, target_identity: { product: DEMO_ID.product, version: DEMO_ID.version, platform: DEMO_ID.platform, architecture: DEMO_ID.architecture, channel: DEMO_ID.channel, binary_sha256: DEMO_ID.binary_sha256 }, capability_refs: ['evi_demo_cap'], facet_refs: ['evi_demo_facet'], attribution_ref: 'evi_demo_attr', evidence_chain_head: profile.evidence_chain_head, owner_approval_ref: 'review:DEMO-OWNER:APPROVE', publication_state: 'PUBLISHED' as const, created_at: FIXED(), supersedes: null, revokes: null, applies_to_registry: false as const };
  const payloadHash = authorizationPayloadHash(proposal, profile);
  const authorization = { authorization_id: 'auth-demo', authorized_by: 'DEMO-OWNER', authorized_role: 'publisher', target_profile_id: profile.profile_id, target_proposal_id: proposal.proposal_id, authorized_action: 'ADD_PROFILE' as const, authorization_timestamp: FIXED(), authorization_expiry: null, authorization_payload_hash: payloadHash };
  const signature = signPayload(payloadHash, 'PTPL-DEMO-SIGNER', 'publisher', { synthetic: false });
  return {
    request_id: 'gov-demo-mechanics', proposal, profile, publication, certResult: cert, evidenceChain: chain,
    authorization, signature, registry,
    precondition: { expected_registry_hash: opts.staleHash ?? registryHash(registry), expected_registry_schema: 'dkskill.compat_registry/1', expected_registry_version: 1, target_profile_id: profile.profile_id, expected_target_absent: true },
    authorizedSigners: ['PTPL-DEMO-SIGNER'], clock: FIXED, synthetic_demo: true,
  };
}
export function demoMechanicsResult() { return runGovernance(demoMechanicsRequest()); }
export function staleResult() { return runGovernance(demoMechanicsRequest({ staleHash: 'sha256:' + '0'.repeat(64) })).result; }

export function revocationSample() {
  return buildRevocationRecord({ schema: 'dkskill.registry_publication_record/1', kind: 'REVOCATION', revocation_id: 'rev-demo', profile_id: 'demo-mechanics@1', reason_code: 'DEMO_REVOKE', authorized_by: 'DEMO-OWNER', authorization_ref: 'auth-demo', prior_state: 'PUBLISHED', resulting_state: 'REVOKED', timestamp: FIXED(), previous_record_hash: null });
}
export function supersessionSample() {
  return buildSupersessionRecord({ schema: 'dkskill.registry_publication_record/1', kind: 'SUPERSESSION', supersession_id: 'sup-demo', new_profile_id: 'demo-mechanics@2', supersedes_profile_id: 'demo-mechanics@1', new_binary_sha256: 'E'.repeat(64), superseded_binary_sha256: 'D'.repeat(64), authorized_by: 'DEMO-OWNER', timestamp: FIXED(), previous_record_hash: null });
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'governance-sample-2.1.283-rejected.json'), canonicalFile(real283GovResult()));
  writeFileSync(join(OUT, 'governance-sample-synthetic-rejected.json'), canonicalFile(syntheticGovResult()));
  writeFileSync(join(OUT, 'governance-sample-demo-mechanics.json'), canonicalFile(demoMechanicsResult().result));
  writeFileSync(join(OUT, 'governance-sample-stale-rejected.json'), canonicalFile(staleResult()));
  writeFileSync(join(OUT, 'governance-sample-revocation.json'), canonicalFile(revocationSample()));
  writeFileSync(join(OUT, 'governance-sample-supersession.json'), canonicalFile(supersessionSample()));
  console.log(`M6 samples: real=${real283GovResult().state}; synthetic=${syntheticGovResult().state}; demo-mechanics=${demoMechanicsResult().result.state} (changed=${demoMechanicsResult().result.registry_changed}); stale=${staleResult().state}`);
}

if (process.argv[1]?.endsWith('gen-registry-governance-sample.ts')) main();
