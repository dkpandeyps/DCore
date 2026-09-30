// M15 — platform-neutral installation/discovery. Deterministic, fail-closed. Operates over an injected VirtualFs so
// it NEVER touches the real machine, NEVER creates /runtime/, NEVER touches ~/.claude, and NEVER stores credentials.
// Stages: CLONE -> DISCOVER -> VALIDATE -> INSTALL -> INITIALIZE -> COMPATIBILITY_CHECK -> READY_OR_BLOCKED.
import { canonicalJson } from '../src/canonical.ts';
import { verifyIntegrity, validateProductManifest } from './integrity-and-manifest.ts';
import { runDoctor } from './doctor.ts';
import type { Manifest } from '../compatibility/product-core-types.ts';
import type { UniversalHost } from '../compatibility/universal-compatibility-types.ts';
import type { Registry } from '../tools/gen-compatibility-registry.ts';
import type {
  IntegrityManifest, InstallResult, InstallStageResult, InstallState_Record, VirtualFs, IntegrityResult,
} from './product-foundation-types.ts';

export function memFs(): VirtualFs {
  const store = new Map<string, string>(); const dirs = new Set<string>();
  return {
    exists: (p) => store.has(p) || dirs.has(p),
    mkdir: (p) => { dirs.add(p); },
    writeFile: (p, c) => { store.set(p, c); },
    readFile: (p) => (store.has(p) ? store.get(p)! : null),
    list: () => [...dirs, ...store.keys()].sort(),
  };
}

// A target/state dir must never be, or live inside, real ~/.claude, and never be /runtime/.
export function isSafeInstallDir(dir: string): boolean {
  const d = dir.replace(/\\/g, '/').toLowerCase();
  return !d.includes('/.claude') && !/(^|\/)\.claude(\/|$)/.test(d) && !/(^|\/)runtime(\/|$)/.test(d);
}

export function planInstallStages(): string[] { return ['CLONE', 'DISCOVER', 'VALIDATE', 'INSTALL', 'INITIALIZE', 'COMPATIBILITY_CHECK', 'READY_OR_BLOCKED']; }

export function runInstall(input: {
  packageFiles: { path: string; content: string }[]; integrity: IntegrityManifest; manifest: Manifest;
  targetDir: string; stateDir: string; fs?: VirtualFs; host?: UniversalHost; registry?: Registry; now: string;
}): InstallResult {
  const fs = input.fs ?? memFs();
  const stages: InstallStageResult[] = [];
  const created_paths: string[] = [];
  const add = (stage: string, result: 'PASS' | 'FAIL' | 'BLOCKED', reasons: string[] = []) => stages.push({ stage, result, reasons });
  const fail = (integrity: IntegrityResult, reason: string): InstallResult => ({ schema: 'dkskill.install_result/1', state: 'FAILED', stages, created_paths, integrity, compatibility_status: 'NOT_CHECKED', install_state_record: null, reasons: [reason] });

  // CLONE (package present)
  if (!input.packageFiles.length) { add('CLONE', 'FAIL', ['no package files']); return fail(emptyIntegrity(), 'no package'); }
  add('CLONE', 'PASS');

  // DISCOVER (manifest present)
  const hasManifest = input.packageFiles.some((f) => f.path.endsWith('manifest.json'));
  add('DISCOVER', hasManifest ? 'PASS' : 'FAIL', hasManifest ? [] : ['manifest not discovered']);
  if (!hasManifest) return fail(emptyIntegrity(), 'manifest not discovered');

  // VALIDATE (manifest + integrity) — fail closed
  const mv = validateProductManifest(input.manifest);
  const integrity = verifyIntegrity(input.integrity, input.packageFiles);
  const validateOk = mv.ok && integrity.status === 'INTEGRITY_VERIFIED';
  add('VALIDATE', validateOk ? 'PASS' : 'FAIL', [...mv.issues, ...(integrity.status !== 'INTEGRITY_VERIFIED' ? integrity.reasons : [])]);
  if (!validateOk) return fail(integrity, 'validation failed');

  // Safety: target/state dirs must be safe (never ~/.claude, never /runtime/)
  if (!isSafeInstallDir(input.targetDir) || !isSafeInstallDir(input.stateDir)) { add('INSTALL', 'BLOCKED', ['unsafe install/state directory (must not be ~/.claude or /runtime/)']); return { schema: 'dkskill.install_result/1', state: 'BLOCKED', stages, created_paths, integrity, compatibility_status: 'NOT_CHECKED', install_state_record: null, reasons: ['unsafe directory'] }; }

  // INSTALL (write package to targetDir via injected fs)
  fs.mkdir(input.targetDir);
  for (const f of input.packageFiles) { const p = `${input.targetDir}/${f.path}`; fs.writeFile(p, f.content); created_paths.push(p); }
  add('INSTALL', 'PASS');

  // INITIALIZE (minimal, non-secret, versioned local state; never ~/.claude, never /runtime/)
  fs.mkdir(input.stateDir);
  const stateRecord: InstallState_Record = {
    schema: 'dkskill.install_state/1', product: input.manifest.product, product_version: input.manifest.product_version,
    installed_at: input.now, state_dir: input.stateDir, integrity_status: integrity.status, compatibility_status: 'NOT_CHECKED',
    contains_credentials: false, runtime_dir_created: false,
  };
  const statePath = `${input.stateDir}/install-state.json`;
  fs.writeFile(statePath, canonicalJson(stateRecord)); created_paths.push(statePath);
  add('INITIALIZE', 'PASS');

  // COMPATIBILITY_CHECK (offline-first; if no host/registry facts, remain UNVERIFIED-safe = NOT_CHECKED)
  let compatibility_status: InstallResult['compatibility_status'] = 'NOT_CHECKED';
  if (input.host) { compatibility_status = runDoctor({ host: input.host, registry: input.registry, synthetic_test_only: true }).compatibility.status; }
  stateRecord.compatibility_status = compatibility_status;
  fs.writeFile(statePath, canonicalJson(stateRecord));
  add('COMPATIBILITY_CHECK', 'PASS', [`status=${compatibility_status}`]);

  // READY_OR_BLOCKED — READY only for COMPATIBLE; otherwise BLOCKED (fail closed)
  const ready = compatibility_status === 'COMPATIBLE';
  add('READY_OR_BLOCKED', ready ? 'PASS' : 'BLOCKED', [ready ? 'ready' : `not ready: ${compatibility_status}`]);
  return { schema: 'dkskill.install_result/1', state: ready ? 'READY' : 'BLOCKED', stages, created_paths, integrity, compatibility_status, install_state_record: stateRecord, reasons: [ready ? 'installed and compatible' : `installed but ${compatibility_status}`] };
}

function emptyIntegrity(): IntegrityResult { return { status: 'INTEGRITY_UNKNOWN', signature_status: 'SIGNATURE_NOT_AVAILABLE', is_certification: false, modified: [], missing: [], unexpected: [], invalid_hash: [], unsupported_scheme: false, reasons: ['not evaluated'] }; }
