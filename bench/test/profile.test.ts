import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildM5Artifact, buildProfileCandidate, decidePublication, activeCertifiedSet, productionCertifiedCount } from '../compatibility/profile.ts';
import { real283Artifact, syntheticArtifact } from '../tools/gen-profile-sample.ts';
import { real283Input, syntheticInput } from '../tools/gen-certification-sample.ts';
import { runCertification } from '../compatibility/certification.ts';
import { staticIdentityProbe } from '../compatibility/hcl.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { canonicalFile, canonicalJson, sha256 } from '../src/canonical.ts';
import type { CertificationProfile } from '../compatibility/profile-types.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const CLK = () => '2026-09-29T00:00:00Z';
const real = real283Artifact();
const synth = syntheticArtifact();
const pg = (a: any, id: string) => a.publication.gates.find((g: any) => g.gate_id === id);

test('1. schema identifiers', () => {
  assert.equal(real.schema, 'dkskill.certification_publication/1');
  assert.equal(real.profile.schema, 'dkskill.certification_profile/1');
  assert.equal(real.proposal.schema, 'dkskill.compatibility_registry_update_proposal/1');
});

test('2,30. deterministic profile generation with injected clock', () => {
  assert.equal(canonicalFile(real283Artifact()), canonicalFile(real283Artifact()));
  assert.equal(real.profile.certification_timestamp, '2026-09-29T00:00:00Z');
});

test('3,4,5,6,7,8. exact identity/version/platform/architecture/channel/binary preservation', () => {
  const cert = runCertification(real283Input());
  assert.deepEqual(real.profile.host_identity, cert.host_identity);
  assert.equal(real.profile.claude_code_version, '2.1.283');
  assert.equal(real.profile.platform, 'win32');
  assert.equal(real.profile.architecture, 'x64');
  assert.equal(real.profile.channel, 'native');
  assert.equal(real.profile.binary_sha256, '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A');
});

test('9,10. M4 NOT_CERTIFIED stays NOT_CERTIFIED; blocked M4 gates remain visible', () => {
  assert.equal(real.profile.lifecycle_state, 'NOT_CERTIFIED');
  assert.notEqual(real.publication.state, 'PUBLISHED');
  assert.equal(pg(real, 'PG-07').result, 'FAIL');   // reflects M4 blocked gates
});

test('11. synthetic CERTIFIED cannot publish (PG-13)', () => {
  assert.equal(synth.profile.lifecycle_state, 'CERTIFIED');
  assert.equal(synth.synthetic_test_only, true);
  assert.equal(pg(synth, 'PG-13').result, 'FAIL');
  assert.equal(synth.publication.state, 'REJECTED');
  assert.equal(synth.publication.eligible, false);
});

test('12,13,14. missing owner approval / evidence / safety-critical limitation block publication', () => {
  assert.equal(pg(real, 'PG-11').result, 'NOT_RUN');   // no owner approval
  assert.equal(pg(real, 'PG-09').result, 'BLOCKED');   // required evidence missing (no live probes)
  assert.equal(pg(real, 'PG-10').result, 'BLOCKED');   // CG-05 not PASS
});

test('15. invalid evidence hash blocks publication (PG-08 FAIL)', () => {
  const input = syntheticInput();
  const cert = runCertification(input);
  const tampered = input.evidence.map((e, i) => i === 0 ? { ...e, observed_result: 'TAMPERED' } : e);
  const a = buildM5Artifact(cert, tampered as any, { clock: CLK, issuer: { authority: 'X', synthetic: false }, signature_status: 'SIGNED', publication_authorized: true });
  assert.equal(pg(a, 'PG-08').result, 'FAIL');
  assert.notEqual(a.publication.state, 'PUBLISHED');
});

test('16,28. invalid/synthetic signature blocks publication (PG-14)', () => {
  // synthetic signer -> PG-14 not PASS even when authorized
  assert.equal(pg(synth, 'PG-14').result, 'NOT_RUN');
  // an explicitly invalid signature also fails
  const input = syntheticInput();
  const cert = runCertification(input);
  const a = buildM5Artifact(cert, input.evidence, { clock: CLK, issuer: { authority: 'real', synthetic: false }, signature_status: 'SIGNATURE_INVALID', publication_authorized: true });
  assert.equal(pg(a, 'PG-14').result, 'NOT_RUN');   // SIGNATURE_INVALID is not SIGNED
});

test('17. revoked profile blocks publication (PG-15 FAIL -> REVOKED)', () => {
  const input = real283Input();
  const reg = buildRegistry();
  const profiles = reg.profiles.map((p) => p.version === '2.1.283' ? { ...p, revoked: true, lifecycle_state: 'revoked' } : p);
  const cert = runCertification({ ...input, registry: { ...reg, profiles } as any });
  const a = buildM5Artifact(cert, input.evidence, { clock: CLK });
  assert.equal(a.profile.lifecycle_state, 'REVOKED');
  assert.equal(pg(a, 'PG-15').result, 'FAIL');
  assert.equal(a.publication.state, 'REVOKED');
});

test('18. superseded profile handled: supersedes preserved, no mutation of the old profile', () => {
  const input = syntheticInput();
  const cert = runCertification(input);
  const cand = { ...buildProfileCandidate(cert, input.evidence, { clock: CLK }), supersedes: { profile_id: 'old@1', version: '2.1.200', binary_sha256: 'a'.repeat(64) } };
  assert.equal(cand.supersedes!.profile_id, 'old@1');
  const dec = decidePublication(cand, cert, input.evidence, { clock: CLK });
  assert.equal(pg({ publication: dec }, 'PG-15').result, 'PASS');   // supersession consistent (not revoked)
});

test('19,20. cross-platform and cross-version substitution rejected (no exact profile)', () => {
  const base = real283Input();
  const macCert = runCertification({ ...base, probe: staticIdentityProbe({ product: 'claude-code', version: '2.1.283', platform: 'darwin', architecture: 'x64', channel: 'native' }) });
  const macArt = buildM5Artifact(macCert, base.evidence, { clock: CLK });
  assert.equal(macArt.profile.compatibility_profile_ref, null);
  assert.notEqual(macArt.publication.state, 'PUBLISHED');
  const verCert = runCertification({ ...base, probe: staticIdentityProbe({ product: 'claude-code', version: '2.1.285', platform: 'win32', architecture: 'x64', channel: 'native' }) });
  assert.equal(buildM5Artifact(verCert, base.evidence, { clock: CLK }).profile.compatibility_profile_ref, null);
});

test('21. registry unchanged by candidate/proposal generation', () => {
  const before = canonicalFile(buildRegistry());
  real283Artifact(); syntheticArtifact();
  assert.equal(canonicalFile(buildRegistry()), before);
  assert.equal(real.proposal.applies_to_registry, false);
  assert.equal(synth.proposal.applies_to_registry, false);
});

test('22. publication proposal deterministic + hashed', () => {
  assert.equal(canonicalFile(real283Artifact().proposal), canonicalFile(real283Artifact().proposal));
  assert.match(real.proposal.proposal_hash!, /^sha256:[0-9a-f]{64}$/);
});

test('23. artifact tampering detected (profile artifact_hash)', () => {
  const { artifact_hash, ...rest } = real.profile as CertificationProfile;
  assert.equal(sha256(canonicalJson(rest)), artifact_hash);                 // hash recomputes over the untampered record
  const tampered = { ...rest, platform: 'linux' };
  assert.notEqual(sha256(canonicalJson(tampered)), artifact_hash);          // any change breaks the hash
});

test('24,25. latest-3 derives only from published certified profiles; zero-certified represented', () => {
  assert.equal(productionCertifiedCount(), 0);
  assert.equal(activeCertifiedSet([]).length, 0);
  // synthetic/published-but-synthetic excluded
  assert.equal(activeCertifiedSet([synth.profile]).length, 0);
  // four fabricated certified+published fixtures -> latest 3
  const mk = (v: string): CertificationProfile => ({ ...real.profile, profile_id: `p-${v}`, claude_code_version: v, lifecycle_state: 'CERTIFIED', publication_status: 'PUBLISHED', synthetic_test_only: false, revocation: null });
  assert.equal(activeCertifiedSet([mk('1'), mk('2'), mk('3'), mk('4')]).length, 3);
});

test('26. no secrets emitted in M5 artifacts', () => {
  const s = JSON.stringify(real) + JSON.stringify(synth);
  assert.ok(!/(access_token|refresh_token|api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|"cookie"|bearer\s+[a-z0-9]{6})/i.test(s));
});

test('27. no automatic publication (CERTIFIED synthetic still not PUBLISHED)', () => {
  assert.notEqual(synth.publication.state, 'PUBLISHED');
  assert.notEqual(synth.publication.state, 'APPROVED_FOR_PUBLICATION');
});

test('29. historical/profile immutability via artifact_hash recompute', () => {
  const { artifact_hash, ...rest } = real.profile as CertificationProfile;
  assert.equal(sha256(canonicalJson(rest)), artifact_hash);
});

test('samples equal committed artifacts; /runtime absent', () => {
  assert.equal(readFileSync(join(DIR, 'profile-sample-2.1.283.json'), 'utf8'), canonicalFile(real283Artifact()));
  assert.equal(readFileSync(join(DIR, 'profile-sample-synthetic.json'), 'utf8'), canonicalFile(syntheticArtifact()));
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
});
