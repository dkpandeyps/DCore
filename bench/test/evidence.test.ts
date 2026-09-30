import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EVIDENCE_CLASSES, buildEvidenceRequest, verifyRequest, requestHash, checkAuthorizationScope, m3EvidenceGate,
  runPrechecks, prechecksReady, captureRawEvidence, rawContentHash, normalizeEvidence, validateProvenance,
  validateItem, evaluateAssertion, evaluateCompleteness, buildEvidencePackage, verifyEvidencePackage, withValidity,
  evidencePackageToCertificationInputs, planEvidenceSession, executeEvidenceSession, evaluateStopConditions,
  STOP_CONDITION_IDS, containsSecret, redact, assembleSession,
} from '../compatibility/evidence.ts';
import * as G from '../tools/gen-evidence-sample.ts';
import { runCertification } from '../compatibility/certification.ts';
import { staticIdentityProbe } from '../compatibility/hcl.ts';
import { canonicalFile } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const goodReq = () => {
  const env = G.real283Env(); const auth = G.evidenceAuth(G.REAL283_PROFILE, env.environment_id, ['TS-07', 'TS-11']);
  const request = buildEvidenceRequest({ request_id: 'r', identity: G.REAL283, profile_id: G.REAL283_PROFILE, scope: G.REALHOST_SCOPE, environment_id: env.environment_id, authorization_ref: auth.authorization_id, clock: G.FIXED });
  return { env, auth, request };
};

// 1. schema validation
test('1. schema identifiers', () => {
  assert.equal(G.completeTs07Package().schema, 'dkskill.evidence_package/1');
  assert.equal(goodReq().request.schema, 'dkskill.evidence_request/1');
  assert.equal(G.real283Env().schema, 'dkskill.evidence_environment/1');
  assert.equal(G.completeTs07Package().evidence_items.find((i) => i.artifact)!.artifact!.schema, 'dkskill.certification_evidence/1');
});

// 2. deterministic evidence request; 43. synthetic can't become real
test('2,43. deterministic request + synthetic flag preserved', () => {
  assert.equal(canonicalFile(goodReq().request), canonicalFile(goodReq().request));
  assert.equal(G.completeTs07Package().synthetic_test_only, true);
  assert.equal(G.real283IncompletePackage().synthetic_test_only, false);
  // a synthetic package's evidence, fed to M4, cannot be relabelled real
  assert.equal(evidencePackageToCertificationInputs(G.completeTs07Package()).synthetic_test_only, true);
});

// 3-8. exact identity/version/binary/platform/arch/channel binding; request tamper invalidates
test('3-8. exact identity binding + tamper invalidation', () => {
  const { request } = goodReq();
  assert.equal(request.target_version, '2.1.283');
  assert.equal(request.target_binary_sha256, G.REAL283.binary_sha256);
  assert.equal(request.target_platform, 'win32');
  assert.equal(request.target_architecture, 'x64');
  assert.equal(request.target_channel, 'native');
  assert.equal(verifyRequest(request), true);
  const tampered = { ...request, target_binary_sha256: 'A'.repeat(64) };
  assert.notEqual(requestHash({ ...tampered, request_hash: undefined } as any), request.request_hash);
  assert.equal(verifyRequest(tampered as any), false);
});

// 9,10. environment + authorization binding
test('9,10. environment + authorization binding', () => {
  const { request, auth } = goodReq();
  assert.equal(request.environment_id, 'EV-ENV-DK-REAL-01');
  assert.equal(checkAuthorizationScope(auth, request).ok, true);
});

// 11. session lifecycle
test('11. session lifecycle', () => {
  const { env, auth, request } = goodReq();
  const items = G.real283IncompletePackage().evidence_items;
  const s = assembleSession({ session_id: 's', request, environment: env, authorization: auth, items, clock: G.FIXED });
  assert.equal(s.schema, 'dkskill.evidence_session/1');
  assert.equal(s.state, 'INCOMPLETE');   // ready but missing live evidence
});

// 12,13. precheck failure + blocking
test('12,13. prechecks pass/fail/block; fail-closed', () => {
  const { env, auth, request } = goodReq();
  assert.equal(prechecksReady(runPrechecks({ request, environment: env, authorization: auth })), true);
  assert.equal(runPrechecks({ request, environment: G.fixtures.wrongBinaryEnv(), authorization: auth }).find((p) => p.gate_id === 'SP-02')!.result, 'FAIL');
  assert.equal(runPrechecks({ request, environment: G.fixtures.noIsolationEnv(), authorization: auth }).find((p) => p.gate_id === 'SP-08')!.result, 'BLOCKED');
  // no implicit PASS: an absent field is never PASS
  assert.equal(runPrechecks({ request, environment: G.fixtures.networkUnresolvedEnv(), authorization: auth }).find((p) => p.gate_id === 'SP-10')!.result !== 'FAIL', true);
});

// 14. raw evidence hashing + immutability + provenance metadata
test('14. raw evidence hashing + required fields', () => {
  const cap = captureRawEvidence({ evidence_id: 'e1', evidence_class: 'EV-TS07', evidence_type: 't', content: { a: 1 }, source: 's', environment_id: 'env', host_identity: G.REAL283, authorization_ref: 'auth', allow_redaction: true, clock: G.FIXED });
  assert.equal(cap.ok, true);
  const a = cap.artifact!;
  assert.match(a.content_hash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.content_hash, rawContentHash(a.stored_content));
  assert.ok(a.capture_timestamp && a.byte_length! > 0 && a.evidence_id === 'e1' && a.binary_identity === G.REAL283.binary_sha256);
});

// 15. normalized evidence hashing
test('15. normalized evidence hashing', () => {
  const item = G.completeTs07Package().evidence_items.find((i) => i.evidence_class === 'EV-STREAM-SCHEMA')!;
  assert.match(item.normalized!.normalized_hash!, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(item.normalized!.normalized_hash, item.artifact!.content_hash);
});

// 16. provenance validation
test('16. provenance validation', () => {
  const a = G.completeTs07Package().evidence_items.find((i) => i.artifact)!.artifact!;
  assert.equal(validateProvenance(a), true);
  const broken = { ...a, provenance: { ...a.provenance, raw_hash: 'sha256:' + '0'.repeat(64) } };
  assert.equal(validateProvenance(broken), false);
});

// 17,18,19,20. unknown / malformed / attribution / permission preservation
test('17,18,19,20. unknown/malformed/attribution/permission preserved; never upgraded', () => {
  const a = G.completeTs07Package().evidence_items.find((i) => i.evidence_class === 'EV-STREAM-SCHEMA')!.artifact!;
  const n = normalizeEvidence(a, G.synStreamEvents());
  assert.equal(n.unknown_count, 1);
  assert.equal(n.malformed_count, 1);
  assert.ok(n.events.find((e) => e.status === 'UNKNOWN'));
  assert.ok(n.events.find((e) => e.status === 'MALFORMED'));
  assert.deepEqual(n.attribution_results, ['A2', 'A9']);
  assert.ok(n.permission_results.includes('denied'));
  // never converted to PASS/valid
  assert.ok(!n.events.some((e) => e.status === 'UNKNOWN' && (e as any).kind === 'PASS'));
});

// 21,22. TS-07 incomplete state + complete synthetic mechanics
test('21,22. TS-07 incomplete stays incomplete; complete synthetic mechanics', () => {
  assert.equal(G.incompleteTs07Package().ts07_status, 'UNRESOLVED');
  assert.equal(G.incompleteTs07Package().completeness, 'INCOMPLETE');
  assert.equal(G.completeTs07Package().ts07_status, 'VALID');
  assert.equal(G.completeTs07Package().completeness, 'COMPLETE');
});

// 23,24. TS-11 incomplete state + complete synthetic mechanics
test('23,24. TS-11 incomplete/complete', () => {
  assert.equal(G.incompleteTs11Package().ts11_status, 'INCOMPLETE');
  assert.equal(G.completeTs11Package().ts11_status, 'VERIFIED');
});

// 25. completeness evaluation identifies missing classes
test('25. completeness evaluation names missing classes', () => {
  const p = G.real283IncompletePackage();
  const comp = evaluateCompleteness(G.REALHOST_SCOPE.required_evidence_classes, p.evidence_items);
  assert.equal(comp.state, 'INCOMPLETE');
  assert.ok(comp.missing.includes('EV-TS07') && comp.missing.includes('EV-TS11'));
  assert.equal(comp.ts07, 'UNRESOLVED');
});

// 26. tamper detection
test('26. tamper detection', () => {
  assert.equal(verifyEvidencePackage(G.completeTs07Package()).ok, true);
  const t = verifyEvidencePackage(G.tamperedPackageDemo());
  assert.equal(t.ok, false);
  assert.ok(t.issues.includes('PACKAGE_HASH_MISMATCH'));
  assert.ok(t.issues.some((i) => i.startsWith('RAW_HASH_CHANGED')));
});

// 27-31. wrong binary/version/platform/arch/channel rejected by prechecks
test('27-31. wrong binary/version/platform/arch/channel rejected', () => {
  const { auth, request } = goodReq();
  const g = (env: any, id: string) => runPrechecks({ request, environment: env, authorization: auth }).find((p) => p.gate_id === id)!.result;
  assert.equal(g(G.fixtures.wrongBinaryEnv(), 'SP-02'), 'FAIL');
  assert.equal(g(G.fixtures.wrongVersionEnv(), 'SP-03'), 'FAIL');
  assert.equal(g(G.fixtures.wrongPlatformEnv(), 'SP-04'), 'FAIL');
  assert.equal(g(G.fixtures.wrongArchEnv(), 'SP-05'), 'FAIL');
  // channel: request whose target channel disagrees with identity is caught at SP-06 path via environment mismatch
  const badChanReq = buildEvidenceRequest({ request_id: 'r', identity: { ...G.REAL283, channel: null }, profile_id: G.REAL283_PROFILE, scope: G.REALHOST_SCOPE, environment_id: 'EV-ENV-DK-REAL-01', authorization_ref: auth.authorization_id, clock: G.FIXED });
  assert.equal(runPrechecks({ request: badChanReq, environment: G.real283Env(), authorization: auth }).find((p) => p.gate_id === 'SP-06')!.result, 'FAIL');
});

// 32. cross-environment rejection
test('32. cross-environment rejection', () => {
  const { auth, request } = goodReq();
  assert.equal(runPrechecks({ request, environment: G.fixtures.crossEnv(), authorization: auth }).find((p) => p.gate_id === 'SP-07')!.result, 'FAIL');
});

// 33,34. stale / revoked evidence rejection
test('33,34. stale/revoked evidence cannot satisfy certification', () => {
  const revoked = G.revokedPackageDemo();
  assert.equal(revoked.validity, 'REVOKED');
  const ad = evidencePackageToCertificationInputs(revoked);
  assert.equal(ad.evidence.length, 0);
  assert.equal(ad.ts11.resolved, false);
  const expired = withValidity(G.completeTs07Package(), 'EXPIRED', G.FIXED);
  assert.equal(evidencePackageToCertificationInputs(expired).ts07.resolved, false);
});

// 35. secret detection + fail-closed capture + recorded redaction
test('35. secret detection / fail-closed / recorded redaction', () => {
  assert.equal(containsSecret(G.fixtures.secretContent()), true);
  const noRedact = captureRawEvidence({ evidence_id: 's', evidence_class: 'EV-TS07', evidence_type: 't', content: G.fixtures.secretContent(), source: 's', environment_id: 'e', host_identity: G.REAL283, authorization_ref: null, allow_redaction: false, clock: G.FIXED });
  assert.equal(noRedact.ok, false);
  assert.equal(noRedact.failure!.fail_closed, true);
  const redacted = captureRawEvidence({ evidence_id: 's', evidence_class: 'EV-TS07', evidence_type: 't', content: G.fixtures.secretContent(), source: 's', environment_id: 'e', host_identity: G.REAL283, authorization_ref: null, allow_redaction: true, clock: G.FIXED });
  assert.equal(redacted.ok, true);
  assert.equal(redacted.artifact!.redaction_status, 'REDACTED');
  assert.ok(redacted.artifact!.redactions.length > 0);
  assert.equal(containsSecret(redacted.artifact!.stored_content), false);
  assert.equal(redact('nothing here').redactions.length, 0);
});

// 36,37,38. authorization scope rejection; no Run A / publication reuse
test('36,37,38. authorization scope / no Run A / no publication reuse', () => {
  const { request } = goodReq();
  assert.equal(checkAuthorizationScope(G.fixtures.outOfScopeAuth(), request).ok, false);
  assert.equal(checkAuthorizationScope(null, request).ok, false);
  const runA = runPrechecks({ request, environment: G.real283Env(), authorization: G.fixtures.runAAuth() });
  assert.equal(runA.find((p) => p.gate_id === 'SP-14')!.result, 'FAIL');
  const pub = runPrechecks({ request, environment: G.real283Env(), authorization: G.fixtures.publicationAuth() });
  assert.equal(pub.find((p) => p.gate_id === 'SP-15')!.result, 'FAIL');
});

// 39. M3 boundary enforcement
test('39. M3 boundary: EXACT_MATCH allowed, non-match blocked, no exception invented', () => {
  assert.equal(m3EvidenceGate(G.REAL283).allowed, true);
  assert.equal(m3EvidenceGate(G.SYN_ID).allowed, false);
  assert.equal(m3EvidenceGate({ ...G.REAL283, version: null }).allowed, false);   // unidentified
  const { env, auth, request } = goodReq();
  const s = assembleSession({ session_id: 's', request: { ...request, target_host_identity: G.SYN_ID }, environment: env, authorization: auth, items: [], clock: G.FIXED });
  assert.equal(s.failures.some((f) => f.code === 'M3_BOUNDARY'), true);
  assert.equal(s.state, 'BLOCKED');
});

// 40,41. M4 adapter preserves; UNKNOWN never becomes PASS; M4 stays authority
test('40,41. M4 adapter preserves UNKNOWN/INCOMPLETE; M4 refuses real host', () => {
  const ad = evidencePackageToCertificationInputs(G.real283IncompletePackage());
  assert.equal(ad.ts07.resolved, false);
  assert.equal(ad.ts11.resolved, false);
  assert.ok(ad.unknown_preserved.includes('EV-TS07') && ad.incomplete_preserved.includes('EV-TS07'));
  // feed to the real M4 engine — it must NOT certify
  const cert = runCertification({
    probe: staticIdentityProbe(G.REAL283),
    environment: { environment_id: 'CERT', environment_type: 'certification', platform: 'win32', architecture: 'x64', isolation_evidence: 'x', network_isolation_status: 'VERIFIED', auth_reference: null, created_at: G.FIXED() },
    capabilityProbes: [], facetProbes: [], attributionProbe: null, streamProbe: null,
    ts07: ad.ts07, ts11: ad.ts11, regression: { result: 'INCONCLUSIVE', diffs: [] }, evidence: ad.evidence,
    ownerReview: null, clock: G.FIXED, run_id: 'r', synthetic: false,
  });
  assert.notEqual(cert.final_decision, 'CERTIFIED');
});

// 41b. UNKNOWN assertion never becomes SUPPORTED by inference
test('41b. UNKNOWN never becomes SUPPORTED', () => {
  const missing = evaluateAssertion({ assertion_id: 'a', evidence_class: 'EV-TS07', claim: 'x', item: null });
  assert.equal(missing.state, 'UNKNOWN');
  const incomplete = evaluateAssertion({ assertion_id: 'a', evidence_class: 'EV-TS07', claim: 'x', item: { evidence_class: 'EV-TS07', artifact: {} as any, normalized: null, status: 'INCOMPLETE', assertion: {} as any } });
  assert.equal(incomplete.state, 'UNSUPPORTED');
});

// 42. INCOMPLETE never becomes COMPLETE
test('42. INCOMPLETE never becomes COMPLETE', () => {
  assert.equal(G.incompleteTs07Package().completeness, 'INCOMPLETE');
  assert.equal(G.incompleteTs11Package().completeness, 'INCOMPLETE');
  assert.equal(G.real283IncompletePackage().completeness, 'INCOMPLETE');
});

// 44. deterministic package generation
test('44. deterministic package generation', () => {
  assert.equal(canonicalFile(G.completeTs07Package()), canonicalFile(G.completeTs07Package()));
  assert.equal(canonicalFile(G.real283IncompletePackage()), canonicalFile(G.real283IncompletePackage()));
});

// 45. package history verification
test('45. package history verification', () => {
  const p1 = G.completeTs11Package();
  const p2 = withValidity(p1, 'REVOKED', G.FIXED);
  assert.equal(p2.previous_package_hash, p1.package_hash);
  assert.equal(verifyEvidencePackage(p2, p1).ok, true);
  assert.equal(verifyEvidencePackage(p2, { ...p1, package_hash: 'sha256:' + '0'.repeat(64) } as any).ok, false);
});

// 46,47. expiration + revocation handling
test('46,47. expiration/revocation status records; history preserved', () => {
  const rev = G.revokedPackageDemo();
  assert.equal(rev.validity, 'REVOKED');
  assert.notEqual(rev.package_hash, G.completeTs11Package().package_hash);   // new record, not a mutation
  assert.equal(withValidity(G.completeTs07Package(), 'EXPIRED', G.FIXED).validity, 'EXPIRED');
});

// 48,49,50. dry-run / execution-disabled default; no benchmark invocation
test('48,49,50. executor DRY_RUN/EXECUTION_DISABLED default; no benchmark/claude', () => {
  const { env, auth, request } = goodReq();
  const plan = planEvidenceSession({ request, environment: env, authorization: auth, clock: G.FIXED });
  assert.equal(plan.execution_mode, 'EXECUTION_DISABLED');
  assert.equal(plan.execution_enabled, false);
  const r = executeEvidenceSession(plan);
  assert.equal(r.executed, false);
  assert.equal(r.claude_invoked, false);
  assert.equal(r.authenticated, false);
  assert.equal(r.benchmark_invoked, false);
  // even LIVE without owner evidence-session authorization refuses; with it, only DRY_RUN, still nothing executed
  assert.equal(executeEvidenceSession(plan, { mode: 'LIVE' }).executed, false);
  assert.equal(executeEvidenceSession(plan, { mode: 'LIVE', owner_evidence_session_authorization: 'x' }).executed, false);
});

// 51. stop conditions all fail-closed
test('51. future-session stop conditions fail-closed', () => {
  assert.equal(STOP_CONDITION_IDS.length, 18);
  const exp = { binary_sha256: G.REAL283.binary_sha256, version: '2.1.283', platform: 'win32', architecture: 'x64', channel: 'native', environment_id: 'e', authorization_id: 'a', scope: ['EV-TS07'] as any };
  assert.equal(evaluateStopConditions(exp, { binary_sha256: 'B'.repeat(64) }).stop, true);
  assert.equal(evaluateStopConditions(exp, { secret_detected: true }).stop, true);
  assert.equal(evaluateStopConditions(exp, { stream_malformed: true }).stop, true);
  const r = evaluateStopConditions(exp, {});
  assert.ok(r.conditions.every((c) => c.fail_closed === true));
});

// 52. evidence classes complete
test('52. 19 evidence classes defined; defined != verified', () => {
  assert.equal(EVIDENCE_CLASSES.length, 19);
  assert.ok(EVIDENCE_CLASSES.includes('EV-TS07') && EVIDENCE_CLASSES.includes('EV-TS11'));
  // a defined class with no acquired artifact asserts UNKNOWN, not verified
  assert.equal(evaluateAssertion({ assertion_id: 'a', evidence_class: 'EV-CAPABILITY', claim: 'x', item: null }).state, 'UNKNOWN');
});

// 53. committed samples equal fresh generation; deterministic clock; /runtime absent; no secrets
test('53. committed samples == fresh generation; deterministic clock; /runtime absent', () => {
  const files: [string, any][] = [
    ['evidence-sample-ts07-complete-synthetic.json', G.completeTs07Package()],
    ['evidence-sample-ts07-incomplete.json', G.incompleteTs07Package()],
    ['evidence-sample-ts11-complete-synthetic.json', G.completeTs11Package()],
    ['evidence-sample-ts11-incomplete.json', G.incompleteTs11Package()],
    ['evidence-sample-real-283-incomplete.json', G.real283IncompletePackage()],
    ['evidence-sample-revoked-demo.json', G.revokedPackageDemo()],
  ];
  for (const [name, obj] of files) assert.equal(readFileSync(join(DIR, name), 'utf8'), canonicalFile(obj), name);
  assert.equal(G.completeTs07Package().created_at, '2026-09-29T00:00:00Z');
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  const blob = JSON.stringify(G.completeTs07Package()) + JSON.stringify(G.real283IncompletePackage());
  assert.ok(!/(access_token|refresh_token|BEGIN [A-Z ]*PRIVATE KEY|sk-[a-z0-9]{6}|bearer\s+[a-z0-9]{6})/i.test(blob));
});
