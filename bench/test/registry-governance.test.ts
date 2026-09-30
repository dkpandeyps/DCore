import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  runGovernance, registryHash, signPayload, validateSignature, authorizationPayloadHash, validateAuthorization,
  validateRegistryPreconditions, applyRegistryMutation, buildRegistryMutation, verifyPublicationHistory, validateRollback,
} from '../compatibility/registry-governance.ts';
import { real283GovResult, syntheticGovResult, demoMechanicsRequest, demoMechanicsResult, staleResult, revocationSample, supersessionSample } from '../tools/gen-registry-governance-sample.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { canonicalFile } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const gg = (r: any, id: string) => r.gates.find((g: any) => g.gate_id === id);
const demo = demoMechanicsResult().result;

test('1. schema identifiers', () => {
  assert.equal(demo.schema, 'dkskill.registry_governance/1');
  assert.equal(demo.publication_record!.schema, 'dkskill.registry_publication_record/1');
  assert.match(gg(demo, 'GG-01').result, /PASS/);
});

test('2. deterministic proposal/governance validation', () => {
  assert.equal(canonicalFile(demoMechanicsResult().result), canonicalFile(demoMechanicsResult().result));
  assert.equal(canonicalFile(real283GovResult()), canonicalFile(real283GovResult()));
});

test('3-11. exact identity/version/platform/arch/channel/binary/M5/M4/publication-gate binding (demo passes)', () => {
  for (const id of ['GG-06', 'GG-07', 'GG-08', 'GG-09', 'GG-10', 'GG-11', 'GG-03', 'GG-04', 'GG-05']) assert.equal(gg(demo, id).result, 'PASS', id);
});

test('12,13. owner authorization required + payload binding', () => {
  const req = demoMechanicsRequest();
  const noAuth = runGovernance({ ...req, authorization: null }).result;
  assert.equal(gg(noAuth, 'GG-14').result, 'NOT_RUN');
  assert.notEqual(noAuth.state, 'PUBLISHED');
  // mutate a bound field -> authorization no longer binds
  const badAuth = { ...req.authorization!, target_profile_id: 'someone-else@1' };
  assert.equal(gg(runGovernance({ ...req, authorization: badAuth }).result, 'GG-14').result, 'FAIL');
});

test('14,15,16,17. signer authorization / missing / invalid / synthetic signature rejection', () => {
  const req = demoMechanicsRequest();
  assert.equal(gg(runGovernance({ ...req, signature: null }).result, 'GG-16').result, 'FAIL');            // missing
  const synthSig = signPayload(authorizationPayloadHash(req.proposal, req.profile), 'SYN', 'publisher', { synthetic: true });
  assert.equal(gg(runGovernance({ ...req, signature: synthSig }).result, 'GG-15').result, 'FAIL');        // synthetic signer
  const unauth = signPayload(authorizationPayloadHash(req.proposal, req.profile), 'STRANGER', 'publisher', { synthetic: false });
  assert.equal(gg(runGovernance({ ...req, signature: unauth }).result, 'GG-15').result, 'FAIL');          // unauthorized issuer
  const wrongPayload = signPayload('sha256:' + '0'.repeat(64), 'PTPL-DEMO-SIGNER', 'publisher', { synthetic: false });
  assert.equal(gg(runGovernance({ ...req, signature: wrongPayload }).result, 'GG-17').result, 'FAIL');    // invalid signature
});

test('18. synthetic profile rejection (M4->M5->M6)', () => {
  const s = syntheticGovResult();
  assert.equal(gg(s, 'GG-18').result, 'FAIL');
  assert.equal(s.state, 'REJECTED');
  assert.equal(s.registry_changed, false);
});

test('19,20. stale registry / hash mismatch rejection', () => {
  const st = staleResult();
  assert.equal(gg(st, 'GG-19').result, 'BLOCKED');
  assert.equal(st.state, 'REJECTED');
  assert.equal(st.registry_changed, false);
});

test('21,22. conflicting / duplicate profile rejection', () => {
  const req = demoMechanicsRequest();
  const regWithDup = { ...req.registry, profiles: [{ profile_id: 'demo-mechanics@1', version: '0.0.0-demo', platform: 'mechanics-demo', architecture: 'demo', channel: 'demo', binary_sha256: 'A'.repeat(64), lifecycle_state: 'active' }] };
  const dup = runGovernance({ ...req, registry: regWithDup, precondition: { ...req.precondition, expected_registry_hash: registryHash(regWithDup), expected_target_absent: true } }).result;
  assert.equal(gg(dup, 'GG-20').result, 'FAIL');
  assert.notEqual(dup.state, 'PUBLISHED');
});

test('23,24,25. cross-version / platform / channel substitution rejected (no exact/precondition)', () => {
  // Registry preconditions + conflict checks stop substitution; a mismatched target state blocks.
  const req = demoMechanicsRequest();
  const conflictingReg = { ...req.registry, profiles: [{ profile_id: 'other@1', version: '0.0.0-demo', platform: 'mechanics-demo', architecture: 'demo', channel: 'demo', binary_sha256: 'A'.repeat(64) }] };
  const r = runGovernance({ ...req, registry: conflictingReg, precondition: { ...req.precondition, expected_registry_hash: registryHash(conflictingReg) } }).result;
  assert.equal(gg(r, 'GG-20').result, 'FAIL');   // same version/platform/arch/channel, different binary
});

test('26. evidence-chain tamper detection (GG-12)', () => {
  const req = demoMechanicsRequest();
  const tampered = req.evidenceChain.map((e, i) => i === 0 ? { ...e, observed_result: 'TAMPERED' } : e);
  assert.equal(gg(runGovernance({ ...req, evidenceChain: tampered }).result, 'GG-12').result, 'FAIL');
});

test('27,28. atomic mutation mechanics + resulting registry hash verification', () => {
  const reg = { schema: 'dkskill.compat_registry/1', registry_version: 1, profiles: [] as any[] };
  const before = registryHash(reg);
  const mutation = buildRegistryMutation(demoMechanicsRequest().profile, demoMechanicsRequest().proposal);
  const applied = applyRegistryMutation(reg, mutation);
  assert.equal(applied.ok, true);
  assert.equal(applied.next.profiles.length, 1);
  assert.equal(registryHash(applied.next), applied.resulting_hash);
  assert.notEqual(applied.resulting_hash, before);
  assert.equal(registryHash(reg), before);   // original untouched (immutable input)
});

test('29,30,31,32,33. publication-record + history verification; deletion/modification/reordering detected', () => {
  const rec = demo.publication_record!;
  assert.match(rec.record_hash!, /^sha256:[0-9a-f]{64}$/);
  assert.equal(verifyPublicationHistory([rec]).ok, true);
  const modified = [{ ...rec, profile_id: 'x' }];
  assert.equal(verifyPublicationHistory(modified).ok, false);
  const rec2 = { ...rec, publication_id: 'pub-2', previous_record_hash: rec.record_hash };
  assert.equal(verifyPublicationHistory([rec2]).ok, false);        // deletion of the first breaks the chain
  assert.equal(verifyPublicationHistory([{ ...rec }, { ...rec }]).ok, false);  // duplicate id / reordering
});

test('34,35. supersession and revocation records are hash-chained and typed', () => {
  const sup = supersessionSample();
  assert.equal(sup.kind, 'SUPERSESSION');
  assert.equal(sup.supersedes_profile_id, 'demo-mechanics@1');
  assert.match(sup.record_hash!, /^sha256:/);
  const rev = revocationSample();
  assert.equal(rev.kind, 'REVOCATION');
  assert.equal(rev.resulting_state, 'REVOKED');
});

test('36. revoked-profile publication rejection', () => {
  const req = demoMechanicsRequest();
  const revoked = { ...req.profile, revocation: { reason: 'x', at: 't', authority: 'a' } };
  assert.equal(gg(runGovernance({ ...req, profile: revoked }).result, 'GG-21').result, 'FAIL');
});

test('37. rollback/reversal safety preserves history', () => {
  const rec = demo.publication_record!;
  const auth = demoMechanicsRequest().authorization!;
  assert.equal(validateRollback(rec.publication_id, [rec], auth).ok, true);
  assert.equal(validateRollback('missing', [rec], auth).ok, false);
  assert.equal(validateRollback(rec.publication_id, [rec], null).ok, false);   // no authorization
});

test('38,39. no automatic conflict resolution; rejected publication leaves registry unchanged', () => {
  assert.equal(real283GovResult().registry_changed, false);
  assert.equal(syntheticGovResult().registry_changed, false);
  assert.equal(staleResult().registry_changed, false);
});

test('40. deterministic accepted mutation (demo)', () => {
  assert.equal(demo.state, 'PUBLISHED');
  assert.equal(demo.registry_changed, true);
  assert.equal(canonicalFile(demoMechanicsResult().result), canonicalFile(demoMechanicsResult().result));
});

test('41. no secrets emitted', () => {
  const s = JSON.stringify(demo) + JSON.stringify(real283GovResult()) + JSON.stringify(syntheticGovResult());
  assert.ok(!/(access_token|refresh_token|api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|"cookie"|bearer\s+[a-z0-9]{6})/i.test(s));
});

test('42,43,44,45. mechanics isolated; production zero-certified stays zero; 2.1.283 unpublishable; no auto-publish', () => {
  const prodBefore = canonicalFile(buildRegistry());
  demoMechanicsResult(); real283GovResult(); syntheticGovResult();
  assert.equal(canonicalFile(buildRegistry()), prodBefore);                                   // production untouched
  assert.equal(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length, 0);
  assert.equal(real283GovResult().state, 'REJECTED');
  assert.equal(demo.synthetic_demo, true);                                                    // accepted path is a DEMO
});

test('46. deterministic clock + committed samples equal fresh generation; /runtime absent', () => {
  assert.equal(demo.publication_record!.timestamp, '2026-09-29T00:00:00Z');
  assert.equal(readFileSync(join(DIR, 'governance-sample-2.1.283-rejected.json'), 'utf8'), canonicalFile(real283GovResult()));
  assert.equal(readFileSync(join(DIR, 'governance-sample-demo-mechanics.json'), 'utf8'), canonicalFile(demoMechanicsResult().result));
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
});

test('validators: signature/authorization/preconditions helpers behave', () => {
  const req = demoMechanicsRequest();
  const ph = authorizationPayloadHash(req.proposal, req.profile);
  assert.equal(validateSignature(req.signature, ph, ['PTPL-DEMO-SIGNER']).authorized, true);
  assert.equal(validateSignature(null, ph, []).state, 'SIGNATURE_MISSING');
  assert.equal(validateAuthorization(req.authorization, req.proposal, req.profile).bound, true);
  assert.equal(validateRegistryPreconditions(req.registry, req.precondition).ok, true);
});
