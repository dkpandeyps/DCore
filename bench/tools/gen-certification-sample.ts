// M4 — deterministic sample certification results (hashable artifacts). Writes:
//  - certification-sample-2.1.283.json : the REAL pinned host => NOT_CERTIFIED (fail-closed).
//  - certification-sample-synthetic.json: a SYNTHETIC_TEST_ONLY fixture => CERTIFIED (engine mechanics only).
// Executes no Claude, certifies no real host, mutates no registry. main() is guarded.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { staticIdentityProbe } from '../compatibility/hcl.ts';
import { buildRegistry } from './gen-compatibility-registry.ts';
import { buildCatalogue } from './gen-capability-catalogue.ts';
import { runCertification, chainEvidence, compareRegression } from '../compatibility/certification.ts';
import type { CertificationInput, Probe, EvidenceRecord, Environment, OwnerReview } from '../compatibility/certification-types.ts';
import type { HostIdentity } from '../compatibility/hcl-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
const FIXED = () => '2026-09-29T00:00:00Z';

const REAL283: Partial<HostIdentity> = { product: 'claude-code', version: '2.1.283', platform: 'win32', architecture: 'x64', channel: 'native', binary_sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A' };

function evidence(host: HostIdentity, env: string | null, profile: string | null, rows: { evidence_id: string; probe_id: string | null; observed_result: string; source: string }[]): EvidenceRecord[] {
  return chainEvidence(rows.map((r) => ({
    schema: 'dkskill.certification_evidence/1' as const, evidence_id: r.evidence_id, environment_id: env, host_identity: host,
    profile_id: profile, probe_id: r.probe_id, observed_result: r.observed_result, source: r.source, timestamp: FIXED(),
    input_hash: null, output_hash: null, redaction_status: 'REDACTED' as const, validation_status: 'RECORDED',
  })));
}

// ---- REAL 2.1.283 => NOT_CERTIFIED (nothing probed live; TS-07 unresolved; owner review absent) ----
export function real283Input(): CertificationInput {
  const probe = staticIdentityProbe(REAL283);
  const host = probe.identity;
  const env: Environment = { environment_id: 'CERT-ENV-DK-01', environment_type: 'certification', platform: 'win32', architecture: 'x64', isolation_evidence: 'operator-attested (reference)', network_isolation_status: 'NOT_VALIDATED', auth_reference: 'isolated-login-ref://cert', created_at: FIXED() };
  return {
    probe, environment: env,
    capabilityProbes: [], facetProbes: [], attributionProbe: null, streamProbe: null,   // no live probes run
    ts07: { resolved: false, evidence_ref: null },
    ts11: { applicable: true, resolved: false, evidence_ref: null },
    regression: compareRegression(null, null),                                          // no baseline => INCONCLUSIVE
    evidence: evidence(host, env.environment_id, 'cc-2.1.283-win32-x64-native@1', [{ evidence_id: 'evi_ident_283', probe_id: null, observed_result: 'EXACT_MATCH', source: 'HCL identity+resolution' }]),
    ownerReview: null,                                                                   // no owner approval
    clock: FIXED, run_id: 'run_cert_283_sample', synthetic: false,
  };
}

// ---- SYNTHETIC_TEST_ONLY => CERTIFIED (engine mechanics only; not a real host) ----
export function syntheticRegistry() {
  const reg = buildRegistry();
  const base = reg.profiles.find((p) => p.version === '2.1.283')!;
  const allVerified: Record<string, string> = {};
  for (const c of buildCatalogue().capabilities) allVerified[c.id] = 'VERIFIED';
  const synthetic = {
    ...base, profile_id: 'synthetic-test-only@1', product: 'claude-code-synthetic', version: '2.1.283',
    platform: 'synthetic-os', architecture: 'synthetic', channel: 'synthetic', binary_sha256: 'F'.repeat(64),
    is_scope_placeholder: false, validation_status: 'CERTIFIED', certification_status: 'CERTIFIED', lifecycle_state: 'active',
    capability_refs: allVerified, limitations: [],
    certification: { certified: true, authority: 'SYNTHETIC_TEST_ONLY', certified_at: FIXED(), certification_review_ref: 'SYNTHETIC-REVIEW' },
  };
  return { ...reg, profiles: [...reg.profiles, synthetic as any] };
}
const SYN_ID: Partial<HostIdentity> = { product: 'claude-code-synthetic', version: '2.1.283', platform: 'synthetic-os', architecture: 'synthetic', channel: 'synthetic', binary_sha256: 'F'.repeat(64) };

export function syntheticInput(): CertificationInput {
  const registry = syntheticRegistry();
  const probe = staticIdentityProbe(SYN_ID);
  const host = probe.identity;
  const cat = buildCatalogue();
  const capProbe = (id: string): Probe => ({ probe_id: `cap:${id}`, kind: 'capability', target: id, profile_id: 'synthetic-test-only@1', preconditions: [], input: 'synthetic', expected_observation: 'VERIFIED', actual_observation: 'VERIFIED', result: 'PASS', evidence_ref: `evi_${id}`, timestamp: FIXED(), probe_version: '1', failure_reason: null });
  const facetProbe = (fam: string): Probe => ({ probe_id: `facet:${fam}`, kind: 'facet', target: fam, profile_id: 'synthetic-test-only@1', preconditions: [], input: 'synthetic', expected_observation: 'RESOLVED', actual_observation: 'RESOLVED', result: 'PASS', evidence_ref: `evi_${fam}`, timestamp: FIXED(), probe_version: '1', failure_reason: null });
  const capabilityProbes = cat.capabilities.map((c) => capProbe(c.id));
  const facetProbes = ['hook_protocol', 'stream_schema', 'attribution', 'settings_layout', 'permission_modes'].map(facetProbe);
  const attributionProbe: Probe = { probe_id: 'attr', kind: 'attribution', target: 'attribution@1', profile_id: 'synthetic-test-only@1', preconditions: [], input: 'synthetic', expected_observation: 'A1-A8 match', actual_observation: 'A1-A8 match', result: 'PASS', evidence_ref: 'evi_attr', timestamp: FIXED(), probe_version: '1', failure_reason: null };
  const streamProbe: Probe = { probe_id: 'stream', kind: 'stream', target: 'stream_schema@1', profile_id: 'synthetic-test-only@1', preconditions: [], input: 'synthetic', expected_observation: 'schema match', actual_observation: 'schema match', result: 'PASS', evidence_ref: 'evi_stream', timestamp: FIXED(), probe_version: '1', failure_reason: null };
  const ownerReview: OwnerReview = { reviewer: 'SYNTHETIC_TEST_ONLY', profile_id: 'synthetic-test-only@1', review_status: 'APPROVED', reviewed_evidence: ['evi_ident_syn'], reviewed_limitations: [], decision: 'APPROVE', timestamp: FIXED() };
  const baseline = { caps: 'all-verified', facets: 'all-resolved' };
  return {
    probe, registry, environment: { environment_id: 'CERT-ENV-SYN', environment_type: 'certification', platform: 'synthetic-os', architecture: 'synthetic', isolation_evidence: 'synthetic-isolation', network_isolation_status: 'VERIFIED', auth_reference: 'synthetic-login-ref', created_at: FIXED() },
    capabilityProbes, facetProbes, attributionProbe, streamProbe,
    ts07: { resolved: true, evidence_ref: 'evi_ts07_synth' }, ts11: { applicable: false, resolved: true, evidence_ref: null },
    regression: compareRegression(baseline, baseline),
    evidence: evidence(host, 'CERT-ENV-SYN', 'synthetic-test-only@1', [{ evidence_id: 'evi_ident_syn', probe_id: null, observed_result: 'EXACT_MATCH', source: 'HCL identity+resolution (synthetic)' }]),
    ownerReview, clock: FIXED, run_id: 'run_cert_synthetic_sample', synthetic: true,
  };
}

export function real283Result() { return runCertification(real283Input()); }
export function syntheticResult() { return runCertification(syntheticInput()); }

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'certification-sample-2.1.283.json'), canonicalFile(real283Result()));
  writeFileSync(join(OUT, 'certification-sample-synthetic.json'), canonicalFile(syntheticResult()));
  console.log(`M4 samples: 2.1.283=${real283Result().final_decision}; synthetic=${syntheticResult().final_decision} (SYNTHETIC_TEST_ONLY)`);
}

if (process.argv[1]?.endsWith('gen-certification-sample.ts')) main();
