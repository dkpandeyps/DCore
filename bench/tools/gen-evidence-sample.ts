// M7 — deterministic evidence-acquisition demonstration artifacts + SYNTHETIC_TEST_ONLY fixtures.
// Executes NO Claude, authenticates nothing, spends nothing, certifies nothing, publishes nothing, mutates no
// registry. Real 2.1.283 produces an INCOMPLETE package with NO fabricated live observations (TS-07/TS-11 stay
// unresolved). All synthetic fixtures are labelled SYNTHETIC_TEST_ONLY. main() is guarded; the clock is fixed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import {
  buildEvidenceRequest, captureRawEvidence, normalizeEvidence, evaluateAssertion, validateItem,
  buildEvidencePackage, withValidity, EVIDENCE_CLASSES,
} from '../compatibility/evidence.ts';
import type {
  EvidenceClass, EvidenceScope, EvidenceAuthorization, EvidenceEnvironment, EvidenceItem, EvidenceArtifact,
  EvidencePackage, EvidenceStatus,
} from '../compatibility/evidence-types.ts';
import type { HostIdentity } from '../compatibility/hcl-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-29T00:00:00Z';
export const SYN = 'SYNTHETIC_TEST_ONLY';

// ---- identities -------------------------------------------------------------------------------------------
export const REAL283: HostIdentity = { product: 'claude-code', version: '2.1.283', platform: 'win32', architecture: 'x64', channel: 'native', binary_sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A', executable_source: 'native' };
export const SYN_ID: HostIdentity = { product: 'claude-code-SYNTHETIC-DEMO', version: '0.0.0-demo', platform: 'synthetic-os', architecture: 'synthetic', channel: 'synthetic', binary_sha256: 'C'.repeat(64), executable_source: 'SYNTHETIC_TEST_ONLY' };
export const REAL283_PROFILE = 'cc-2.1.283-win32-x64-native@1';
export const SYN_PROFILE = 'synthetic-ts-demo@1';

// ---- environments -----------------------------------------------------------------------------------------
export function real283Env(over: Partial<EvidenceEnvironment> = {}): EvidenceEnvironment {
  return {
    schema: 'dkskill.evidence_environment/1', environment_id: 'EV-ENV-DK-REAL-01', environment_type: 'evidence-session',
    os: 'Windows 11', platform: 'win32', architecture: 'x64', claude_code_version: '2.1.283',
    binary_sha256: REAL283.binary_sha256, config_directory_identity: 'isolated-cfg://EV-ENV-DK-REAL-01 (empty)',
    isolation_evidence: 'operator-attested isolated profile (reference)', credential_state: 'isolated-empty',
    credential_reference: 'redacted-cred-ref://none', network_isolation_status: 'VERIFIED',
    toolchain_identity: 'node>=24; win32-x64', created_at: FIXED(), verified_at: FIXED(), ...over,
  };
}
export function synEnv(over: Partial<EvidenceEnvironment> = {}): EvidenceEnvironment {
  return { ...real283Env(), environment_id: 'EV-ENV-SYN-01', os: 'synthetic-os', platform: 'synthetic-os', architecture: 'synthetic', claude_code_version: '0.0.0-demo', binary_sha256: SYN_ID.binary_sha256, config_directory_identity: `${SYN} cfg`, credential_state: `${SYN}-empty`, toolchain_identity: `${SYN} toolchain`, ...over };
}

// ---- authorizations ---------------------------------------------------------------------------------------
export function evidenceAuth(target: string, environment: string, tests: string[], over: Partial<EvidenceAuthorization> = {}): EvidenceAuthorization {
  return {
    authorization_id: `evauth-${target}`, scope: 'EVIDENCE_ACQUISITION', authorized_target: target, authorized_tests: tests,
    authorized_environment: environment, authorized_by: 'OWNER-EVIDENCE-REF', authorization_timestamp: FIXED(),
    authorization_expiry: null, authorizes_run_a: false, authorizes_publication: false, ...over,
  };
}

// ---- scopes -----------------------------------------------------------------------------------------------
const IDENTITY_CLASSES: EvidenceClass[] = ['EV-HOST-IDENTITY', 'EV-BINARY-IDENTITY', 'EV-VERSION', 'EV-PLATFORM', 'EV-ARCHITECTURE', 'EV-CHANNEL', 'EV-ENVIRONMENT', 'EV-NETWORK', 'EV-TOOLCHAIN'];
export const TS07_SCOPE: EvidenceScope = { required_evidence_classes: [...IDENTITY_CLASSES, 'EV-STREAM-SCHEMA', 'EV-ATTRIBUTION', 'EV-HOOK-PROTOCOL', 'EV-PERMISSION-MODES', 'EV-TS07'], required_test_ids: ['TS-07'], allow_redaction: true };
export const TS11_SCOPE: EvidenceScope = { required_evidence_classes: [...IDENTITY_CLASSES, 'EV-CAPABILITY', 'EV-BEHAVIORAL-COMPARISON', 'EV-TS11'], required_test_ids: ['TS-11'], allow_redaction: true };
export const REALHOST_SCOPE: EvidenceScope = { required_evidence_classes: [...IDENTITY_CLASSES, 'EV-STREAM-SCHEMA', 'EV-ATTRIBUTION', 'EV-TS07', 'EV-CAPABILITY', 'EV-TS11'], required_test_ids: ['TS-07', 'TS-11'], allow_redaction: true };

// ---- item factories ---------------------------------------------------------------------------------------
function mkValidItem(cls: EvidenceClass, type: string, content: unknown, host: HostIdentity, env: EvidenceEnvironment, authRef: string | null, events?: any[], allowRedaction = true): EvidenceItem {
  const cap = captureRawEvidence({ evidence_id: `evi_${cls.toLowerCase()}_${env.environment_id}`, evidence_class: cls, evidence_type: type, content, source: `probe:${cls}`, environment_id: env.environment_id, host_identity: host, authorization_ref: authRef, allow_redaction: allowRedaction, clock: FIXED });
  if (!cap.ok) return mkMissingItem(cls, `capture failed: ${cap.failure?.code}`);
  const artifact = cap.artifact!;
  const normalized = events ? normalizeEvidence(artifact, events) : null;
  if (normalized) { artifact.provenance.normalization_method = 'deterministic-order-preserving'; artifact.provenance.normalized_hash = normalized.normalized_hash!; }
  const item: EvidenceItem = { evidence_class: cls, artifact, normalized, assertion: { assertion_id: `as_${cls}`, evidence_class: cls, claim: `${cls} observed`, state: 'ASSERTED', supporting_evidence: [], provenance_ref: null, reason: '' }, status: 'CAPTURED' };
  item.status = validateItem(item);
  item.assertion = evaluateAssertion({ assertion_id: `as_${cls}`, evidence_class: cls, claim: `${cls} observed`, item });
  return item;
}
function mkMissingItem(cls: EvidenceClass, claim: string): EvidenceItem {
  return { evidence_class: cls, artifact: null, normalized: null, status: 'INCOMPLETE', assertion: { assertion_id: `as_${cls}`, evidence_class: cls, claim, state: 'UNKNOWN', supporting_evidence: [], provenance_ref: null, reason: 'no evidence acquired' } };
}

function identityItems(host: HostIdentity, env: EvidenceEnvironment, authRef: string | null): EvidenceItem[] {
  return [
    mkValidItem('EV-HOST-IDENTITY', 'identity-tuple', { product: host.product, version: host.version, platform: host.platform }, host, env, authRef),
    mkValidItem('EV-BINARY-IDENTITY', 'binary-sha256', { binary_sha256: host.binary_sha256 }, host, env, authRef),
    mkValidItem('EV-VERSION', 'version-string', { version: host.version }, host, env, authRef),
    mkValidItem('EV-PLATFORM', 'platform', { platform: host.platform }, host, env, authRef),
    mkValidItem('EV-ARCHITECTURE', 'architecture', { architecture: host.architecture }, host, env, authRef),
    mkValidItem('EV-CHANNEL', 'channel', { channel: host.channel }, host, env, authRef),
    mkValidItem('EV-ENVIRONMENT', 'environment-identity', { environment_id: env.environment_id, isolation: env.isolation_evidence }, host, env, authRef),
    mkValidItem('EV-NETWORK', 'network-isolation', { status: env.network_isolation_status }, host, env, authRef),
    mkValidItem('EV-TOOLCHAIN', 'toolchain', { toolchain: env.toolchain_identity }, host, env, authRef),
  ];
}

// Deterministic synthetic stream events (SYNTHETIC_TEST_ONLY) — includes one unknown + one malformed to prove
// preservation. Attribution/permission results are carried verbatim; nothing is upgraded.
export function synStreamEvents(): any[] {
  return [
    { type: 'system', subtype: 'init', attribution: null, permission: null },
    { type: 'assistant', subtype: 'tool_use', attribution: 'A2', permission: 'denied' },
    { type: 'assistant', subtype: 'text', attribution: 'A9', permission: null },
    { type: 'weird_future_event', unknown: true, attribution: null, permission: null },
    { malformed: true },
    { type: 'result', subtype: 'success', attribution: null, permission: null },
  ];
}

// ---- packages ---------------------------------------------------------------------------------------------
function pkg(id: string, req: ReturnType<typeof buildEvidenceRequest>, items: EvidenceItem[], synthetic: boolean, prev: string | null = null): EvidencePackage {
  const assertions = items.map((i) => i.assertion);
  return buildEvidencePackage({ package_id: id, request: req, items, assertions, synthetic_test_only: synthetic, previous_package_hash: prev, clock: FIXED });
}

export function completeTs07Package(): EvidencePackage {
  const env = synEnv(); const auth = evidenceAuth(SYN_PROFILE, env.environment_id, ['TS-07']);
  const req = buildEvidenceRequest({ request_id: 'req-ts07-complete', identity: SYN_ID, profile_id: SYN_PROFILE, scope: TS07_SCOPE, environment_id: env.environment_id, authorization_ref: auth.authorization_id, clock: FIXED });
  const ev = synStreamEvents();
  const items = [
    ...identityItems(SYN_ID, env, auth.authorization_id),
    mkValidItem('EV-STREAM-SCHEMA', 'stream-json', { events: ev.length }, SYN_ID, env, auth.authorization_id, ev),
    mkValidItem('EV-ATTRIBUTION', 'attr@1', { table: 'attr@1', results: ['A2', 'A9'] }, SYN_ID, env, auth.authorization_id, ev),
    mkValidItem('EV-HOOK-PROTOCOL', 'hook', { protocol: 'observed' }, SYN_ID, env, auth.authorization_id),
    mkValidItem('EV-PERMISSION-MODES', 'permission', { modes: ['default', 'denied'] }, SYN_ID, env, auth.authorization_id),
    mkValidItem('EV-TS07', 'live-stream+attribution', { stream: 'captured', attribution: 'parsed', raw: true }, SYN_ID, env, auth.authorization_id, ev),
  ];
  return pkg('pkg-ts07-complete', req, items, true);
}
export function incompleteTs07Package(): EvidencePackage {
  const env = synEnv(); const auth = evidenceAuth(SYN_PROFILE, env.environment_id, ['TS-07']);
  const req = buildEvidenceRequest({ request_id: 'req-ts07-incomplete', identity: SYN_ID, profile_id: SYN_PROFILE, scope: TS07_SCOPE, environment_id: env.environment_id, authorization_ref: auth.authorization_id, clock: FIXED });
  const items = [
    ...identityItems(SYN_ID, env, auth.authorization_id),
    mkMissingItem('EV-STREAM-SCHEMA', 'no live stream captured'),
    mkMissingItem('EV-ATTRIBUTION', 'no live attribution captured'),
    mkMissingItem('EV-HOOK-PROTOCOL', 'not acquired'),
    mkMissingItem('EV-PERMISSION-MODES', 'not acquired'),
    mkMissingItem('EV-TS07', 'no live stream+attribution observations'),
  ];
  return pkg('pkg-ts07-incomplete', req, items, true);
}
export function completeTs11Package(): EvidencePackage {
  const env = synEnv(); const auth = evidenceAuth(SYN_PROFILE, env.environment_id, ['TS-11']);
  const req = buildEvidenceRequest({ request_id: 'req-ts11-complete', identity: SYN_ID, profile_id: SYN_PROFILE, scope: TS11_SCOPE, environment_id: env.environment_id, authorization_ref: auth.authorization_id, clock: FIXED });
  const items = [
    ...identityItems(SYN_ID, env, auth.authorization_id),
    mkValidItem('EV-CAPABILITY', 'capability', { capability: 'nm-dep', observed: 'present' }, SYN_ID, env, auth.authorization_id),
    mkValidItem('EV-BEHAVIORAL-COMPARISON', 'calibration', { expected: 'X', observed: 'X', calibration: 'match' }, SYN_ID, env, auth.authorization_id),
    mkValidItem('EV-TS11', 'nm-calibration', { nm: 'NM-DEMO', calibration_result: 'VERIFIED', limitation_result: 'none' }, SYN_ID, env, auth.authorization_id),
  ];
  return pkg('pkg-ts11-complete', req, items, true);
}
export function incompleteTs11Package(): EvidencePackage {
  const env = synEnv(); const auth = evidenceAuth(SYN_PROFILE, env.environment_id, ['TS-11']);
  const req = buildEvidenceRequest({ request_id: 'req-ts11-incomplete', identity: SYN_ID, profile_id: SYN_PROFILE, scope: TS11_SCOPE, environment_id: env.environment_id, authorization_ref: auth.authorization_id, clock: FIXED });
  const items = [
    ...identityItems(SYN_ID, env, auth.authorization_id),
    mkMissingItem('EV-CAPABILITY', 'not acquired'),
    mkMissingItem('EV-BEHAVIORAL-COMPARISON', 'no calibration evidence'),
    mkMissingItem('EV-TS11', 'no valid calibration evidence'),
  ];
  return pkg('pkg-ts11-incomplete', req, items, true);
}

// REAL host => INCOMPLETE, with NO fabricated live observations. TS-07 UNRESOLVED, TS-11 INCOMPLETE.
export function real283IncompletePackage(): EvidencePackage {
  const env = real283Env(); const auth = evidenceAuth(REAL283_PROFILE, env.environment_id, ['TS-07', 'TS-11']);
  const req = buildEvidenceRequest({ request_id: 'req-real-283', identity: REAL283, profile_id: REAL283_PROFILE, scope: REALHOST_SCOPE, environment_id: env.environment_id, authorization_ref: auth.authorization_id, clock: FIXED });
  const items = [
    ...identityItems(REAL283, env, auth.authorization_id),
    mkMissingItem('EV-STREAM-SCHEMA', 'no live stream captured on the real host (no execution performed)'),
    mkMissingItem('EV-ATTRIBUTION', 'no live attribution captured on the real host'),
    mkMissingItem('EV-TS07', 'TS-07 UNRESOLVED: no live stream+attribution observations from the real host'),
    mkMissingItem('EV-CAPABILITY', 'no live capability probes on the real host'),
    mkMissingItem('EV-TS11', 'TS-11 UNRESOLVED: no valid NM calibration evidence from the real host'),
  ];
  return pkg('pkg-real-283-incomplete', req, items, false);
}

export function tamperedPackageDemo(): EvidencePackage {
  const p = JSON.parse(JSON.stringify(completeTs07Package())) as EvidencePackage;   // deep copy
  const target = p.evidence_items.find((i) => i.artifact);
  if (target && target.artifact) (target.artifact.stored_content as any) = { tampered: true };  // change content, leave hashes stale
  return p;   // verifyEvidencePackage will flag RAW_HASH_CHANGED + PACKAGE_HASH_MISMATCH
}
export function revokedPackageDemo(): EvidencePackage { return withValidity(completeTs11Package(), 'REVOKED', FIXED); }

// ---- fixtures used directly by tests (SYNTHETIC_TEST_ONLY) -------------------------------------------------
export const fixtures = {
  wrongBinaryEnv: () => real283Env({ binary_sha256: 'A'.repeat(64) }),
  wrongVersionEnv: () => real283Env({ claude_code_version: '2.1.999' }),
  wrongPlatformEnv: () => real283Env({ platform: 'linux' }),
  wrongArchEnv: () => real283Env({ architecture: 'arm64' }),
  crossEnv: () => real283Env({ environment_id: 'EV-ENV-OTHER-99' }),
  noIsolationEnv: () => real283Env({ isolation_evidence: null }),
  networkUnresolvedEnv: () => real283Env({ network_isolation_status: 'NOT_VALIDATED' }),
  secretEnv: () => real283Env({ credential_reference: 'access_token=abcdef123456' }),
  runAAuth: (): EvidenceAuthorization => evidenceAuth(REAL283_PROFILE, 'EV-ENV-DK-REAL-01', ['TS-07'], { scope: 'RUN_A', authorizes_run_a: true as any }),
  publicationAuth: (): EvidenceAuthorization => evidenceAuth(REAL283_PROFILE, 'EV-ENV-DK-REAL-01', ['TS-07'], { scope: 'PUBLICATION', authorizes_publication: true as any }),
  outOfScopeAuth: (): EvidenceAuthorization => evidenceAuth('someone-else@9', 'EV-ENV-DK-REAL-01', [], {}),
  secretContent: () => ({ log: 'user token access_token=sk-abc123deadbeef and bearer aa11bb22' }),
  unknownEvents: () => [{ type: 'future', unknown: true, attribution: null, permission: null }],
  malformedEvents: () => [{ malformed: true }, { type: 'ok' }],
};

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const files: [string, EvidencePackage][] = [
    ['evidence-sample-ts07-complete-synthetic.json', completeTs07Package()],
    ['evidence-sample-ts07-incomplete.json', incompleteTs07Package()],
    ['evidence-sample-ts11-complete-synthetic.json', completeTs11Package()],
    ['evidence-sample-ts11-incomplete.json', incompleteTs11Package()],
    ['evidence-sample-real-283-incomplete.json', real283IncompletePackage()],
    ['evidence-sample-tampered-demo.json', tamperedPackageDemo()],
    ['evidence-sample-revoked-demo.json', revokedPackageDemo()],
  ];
  for (const [name, p] of files) writeFileSync(join(OUT, name), canonicalFile(p));
  console.log(`M7 samples: ts07=${completeTs07Package().completeness}/${completeTs07Package().ts07_status}; ts07-incomplete=${incompleteTs07Package().ts07_status}; ts11=${completeTs11Package().ts11_status}; real283=${real283IncompletePackage().completeness} ts07=${real283IncompletePackage().ts07_status} ts11=${real283IncompletePackage().ts11_status}; classes=${EVIDENCE_CLASSES.length}`);
}

if (process.argv[1]?.endsWith('gen-evidence-sample.ts')) main();
