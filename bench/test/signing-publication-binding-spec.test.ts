import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSigningBindingSpec, validateSigningSpec, verifySpec, specHasSecret, M6_GOVERNANCE_STATES, M5_PUBLICATION_STATES,
  KEY_LIFECYCLE_STATES, VERIFICATION_LAYERS,
} from '../compatibility/signing-publication-binding-spec.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const spec = buildSigningBindingSpec();

test('1. schema + design_only + deterministic + verifiable + consistent', () => {
  assert.equal(spec.schema, 'dkskill.signing_publication_binding_spec/1');
  assert.equal(spec.design_only, true);
  assert.equal(canonicalFile(buildSigningBindingSpec()), canonicalFile(buildSigningBindingSpec()));
  assert.equal(verifySpec(spec), true);
  assert.equal(validateSigningSpec(spec).ok, true);
});

test('2. authoritative object graph: 9 objects, chained, immutable fields + trust boundaries', () => {
  assert.equal(spec.object_graph.length, 9);
  assert.equal(spec.object_graph[0].object, 'identity attestation');
  assert.equal(spec.object_graph[spec.object_graph.length - 1].object, 'M13 matrix cell');
  assert.ok(spec.object_graph.every((o) => o.canonical_identifier && o.content_hash && o.immutable_fields.length > 0 && o.trust_boundary));
});

test('3. signature payload binds all identities + prevents transplant', () => {
  for (const b of ['attestation_hash', 'certification_result_hash', 'publication_proposal_hash', 'signing-key identity/version', 'authorization identity/hash']) assert.ok(spec.signature_payload.binds.includes(b), b);
  for (const p of ['signing one attestation while publishing another', 'signing one matrix cell while publishing another', 'cross-product replay', 'cross-environment replay']) assert.ok(spec.signature_payload.prevents.includes(p), p);
  assert.equal(spec.signature_payload.algorithm_status, 'OPEN_DESIGN_DECISION');   // algorithm not frozen
});

test('4. attestation↔certification: exact hash reference; never "latest"', () => {
  const b = spec.attestation_certification_binding;
  assert.ok(b.binds.some((x) => /attestation_hash/i.test(x)));
  assert.ok(/FORBIDDEN/i.test(b.failure_behavior.latest_attestation));
  for (const k of ['mismatch', 'superseded', 'revoked', 'replay']) assert.equal(b.failure_behavior[k], 'REJECTED');
});

test('5. certification↔proposal + proposal↔authorization fail closed; no wildcard/latest/inheritance', () => {
  const cp = spec.certification_publication_binding;
  assert.equal(cp.failure_behavior.different_attestation, 'REJECTED');
  assert.equal(cp.failure_behavior.cell_differs, 'REJECTED');
  const pa = spec.publication_authorization_binding;
  assert.equal(pa.failure_behavior.proposal_b_with_auth_a, 'REJECTED');
  assert.equal(pa.failure_behavior.wildcard, 'FORBIDDEN');
  assert.equal(pa.failure_behavior.latest_proposal, 'FORBIDDEN');
  assert.equal(pa.failure_behavior.implicit_inheritance, 'FORBIDDEN');
});

test('6. signer identity model distinguishes owner/authority/key/root/system', () => {
  const roles = spec.signer_identity_model.map((s) => s.role);
  for (const r of ['human owner/approver', 'signing authority', 'signing key', 'trust root', 'publication system']) assert.ok(roles.includes(r), r);
});

test('7. key identity model + 7-state lifecycle with validity semantics', () => {
  for (const f of ['key_id', 'algorithm', 'public-key fingerprint', 'status', 'predecessor key', 'successor key', 'trust-root reference']) assert.ok(spec.key_identity_model.includes(f), f);
  assert.deepEqual(spec.key_lifecycle.map((k) => k.state), [...KEY_LIFECYCLE_STATES]);
  const active = spec.key_lifecycle.find((k) => k.state === 'ACTIVE')!;
  assert.equal(active.new_signatures_permitted, true);
  const retired = spec.key_lifecycle.find((k) => k.state === 'RETIRED')!;
  assert.equal(retired.new_signatures_permitted, false);
  assert.equal(retired.prior_signatures_remain_valid, true);
});

test('8. key rotation/revocation/compromise: history immutable; old signatures verifiable', () => {
  assert.ok(/independently verifiable/i.test(spec.key_rotation.old_signatures));
  assert.ok(/cannot sign/i.test(spec.key_rotation.old_key_after_retirement));
  assert.ok(spec.key_revocation.distinct_from.includes('PROFILE REVOKED') && spec.key_revocation.distinct_from.includes('ATTESTATION REVOKED'));
  assert.ok(/OPEN_DESIGN_GAP/i.test(spec.compromised_key.production_recovery_policy));
});

test('9. signed publication record: integrity verification separate from authorization/key/publication/cert', () => {
  for (const c of ['integrity verification', 'signer authorization', 'key validity', 'publication authorization', 'certification validity']) assert.ok(spec.signed_publication_record.separate_verification_concerns.includes(c), c);
});

test('10. registry atomicity: NO_REGISTRY_MUTATION on any failure; concurrency protections', () => {
  assert.equal(spec.registry_atomicity.on_any_failure, 'NO_REGISTRY_MUTATION');
  assert.equal(spec.registry_atomicity.transaction_boundary[0], 'proposal validated');
  assert.ok(spec.registry_atomicity.protections.some((p) => /compare-and-swap/i.test(p)));
});

test('11. immutable history: supersession new record, revocation no rewrite, rotation no rewrite', () => {
  assert.ok(spec.immutable_history.some((h) => /supersession creates a NEW record/i.test(h)));
  assert.ok(spec.immutable_history.some((h) => /revocation never rewrites/i.test(h)));
  assert.ok(spec.immutable_history.some((h) => /key rotation never rewrites/i.test(h)));
});

test('12. trust root: bootstrap OPEN_DESIGN_GAP; governed; revoked keys untrusted', () => {
  assert.equal(spec.trust_root_model.bootstrap, 'OPEN_DESIGN_GAP');
  assert.ok(/revoked keys cease/i.test(spec.trust_root_model.revocation));
});

test('13. verification layers: 10, ordered, lower success never implies higher', () => {
  assert.equal(spec.verification_layers.length, 10);
  assert.deepEqual(spec.verification_layers.map((l) => l.layer), [...VERIFICATION_LAYERS]);
  assert.ok(spec.verification_layers.every((l) => l.lower_success_implies_higher === false));
});

test('14. replay protection: 9 vectors with bound identities', () => {
  assert.ok(spec.replay_protection.length >= 9);
  const vectors = spec.replay_protection.map((r) => r.vector);
  for (const v of ['signature replay', 'cross-registry replay', 'cross-product replay', 'cross-environment replay', 'superseded-record replay']) assert.ok(vectors.includes(v), v);
  assert.ok(spec.replay_protection.find((r) => r.vector === 'signature replay')!.bound_identities.includes('matrix cell'));
});

test('15. M13 exact-cell binding: reject if cell differs across all objects; no inheritance', () => {
  assert.equal(spec.m13_matrix_binding.no_inheritance, true);
  for (const o of ['attestation', 'certification', 'proposal', 'signature payload', 'publication record', 'registry entry']) assert.ok(spec.m13_matrix_binding.reject_if_cell_differs_across.includes(o), o);
});

test('16. M5 + M6 states preserved (no new state); forbidden transitions defined', () => {
  for (const s of M5_PUBLICATION_STATES) assert.ok(spec.m5_lifecycle.states.includes(s), s);
  for (const s of M6_GOVERNANCE_STATES) assert.ok(spec.m6_lifecycle.states.includes(s), s);
  assert.ok(spec.m6_lifecycle.forbidden_transitions.some((t) => t.from === 'REQUESTED' && t.to === 'PUBLISHED'));
  assert.deepEqual(spec.m5_lifecycle.signable, ['APPROVED_FOR_PUBLICATION']);
});

test('17. threat model: 20 threats, all history-intact + fail-closed', () => {
  assert.equal(spec.security_threat_model.length, 20);
  assert.ok(spec.security_threat_model.every((t) => t.history_intact === true && !!t.binding_control && !!t.fail_closed_state));
  for (const a of ['signature replay', 'revoked-key signing', 'trust-root substitution', 'canonicalization mismatch']) assert.ok(spec.security_threat_model.some((t) => t.attack === a), a);
});

test('18. GAP-03 REFINED, GAP-04 PARTIALLY_DEFINED; GAP-01/02 preserved OPEN; new gaps recorded', () => {
  assert.equal(spec.gap03_status, 'REFINED');
  assert.equal(spec.gap04_status, 'PARTIALLY_DEFINED');
  assert.ok(spec.preserved_open_gaps.every((g) => g.status === 'OPEN_DESIGN_GAP'));
  assert.ok(spec.preserved_open_gaps.some((g) => g.id === 'GAP-01') && spec.preserved_open_gaps.some((g) => g.id === 'GAP-02'));
  assert.ok(spec.newly_discovered_gaps.some((g) => g.id === 'GAP-04R-ROOT') && spec.newly_discovered_gaps.some((g) => g.id === 'GAP-04R-ALGO'));
});

test('19. privacy: no private key material; secret exclusion; 20 fixtures + test specs', () => {
  assert.equal(spec.privacy_secret_boundary.assertion, 'NO_PRIVATE_KEY_MATERIAL_IN_PUBLIC_ARTIFACTS');
  assert.ok(spec.privacy_secret_boundary.forbidden.includes('private keys'));
  assert.equal(specHasSecret(spec), false);
  assert.equal(spec.fixture_specs.length, 20);
  assert.ok(spec.fixture_specs.every((f) => f.label === 'SYNTHETIC_TEST_ONLY'));
  assert.ok(spec.future_test_specs.length >= 18);
});

test('20. committed == fresh; production immutable; certified 0; /runtime absent; static safety', () => {
  const before = sha256(canonicalFile(buildRegistry()));
  assert.equal(readFileSync(join(DIR, 'signing-publication-binding-spec.json'), 'utf8'), canonicalFile(buildSigningBindingSpec()));
  assert.equal(sha256(canonicalFile(buildRegistry())), before);
  assert.equal(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length, 0);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  const mod = readFileSync(join(DIR, 'signing-publication-binding-spec.ts'), 'utf8');
  // real signing/key-gen/network/exec API calls only (not safety-comment prose)
  assert.ok(!/\bfetch\s*\(|https?:\/\/[a-z]|child_process|execSync|execFileSync|\bspawn\s*\(|writeFileSync|createSign\s*\(|createHmac\s*\(|generateKeyPair|crypto\.sign\s*\(|privateKey/i.test(mod));
});
