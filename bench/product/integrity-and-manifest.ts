// M15 — integrity verification + public manifest validation. Deterministic, fail-closed, secret-free, no network.
// Hash verification is NEVER certification and NEVER a signature (M15 has no signing authority).
import { sha256, canonicalJson } from '../src/canonical.ts';
import { validateManifest as m14ValidateManifest, buildProductSpec } from '../compatibility/product-core-spec.ts';
import type { Manifest } from '../compatibility/product-core-types.ts';
import type { IntegrityManifest, IntegrityEntry, IntegrityResult } from './product-foundation-types.ts';

export function hashContent(content: string): string { return sha256(content); }

export function buildIntegrityManifest(files: { path: string; content: string }[]): IntegrityManifest {
  const entries: IntegrityEntry[] = files.map((f) => ({ path: f.path, hash: hashContent(f.content) })).sort((a, b) => (a.path < b.path ? -1 : 1));
  return { schema: 'dkskill.integrity_manifest/1', algorithm: 'sha256', entries, signature_status: 'SIGNATURE_NOT_AVAILABLE' };
}

// Verify actual package files against a protected integrity manifest. Fail-closed.
export function verifyIntegrity(integrity: IntegrityManifest, actual: { path: string; content: string }[]): IntegrityResult {
  const reasons: string[] = [];
  if (integrity.schema !== 'dkskill.integrity_manifest/1' || integrity.algorithm !== 'sha256') {
    return { status: 'INTEGRITY_FAILED', signature_status: integrity.signature_status ?? 'SIGNATURE_NOT_AVAILABLE', is_certification: false, modified: [], missing: [], unexpected: [], invalid_hash: [], unsupported_scheme: true, reasons: ['unsupported integrity scheme'] };
  }
  const actualByPath = new Map(actual.map((f) => [f.path, f.content]));
  const protectedPaths = new Set(integrity.entries.map((e) => e.path));
  const modified: string[] = [], missing: string[] = [], invalid_hash: string[] = [];
  for (const e of integrity.entries) {
    if (!/^sha256:[0-9a-f]{64}$/.test(e.hash)) { invalid_hash.push(e.path); continue; }
    const content = actualByPath.get(e.path);
    if (content === undefined) { missing.push(e.path); continue; }
    if (hashContent(content) !== e.hash) modified.push(e.path);
  }
  const unexpected = actual.map((f) => f.path).filter((p) => !protectedPaths.has(p));
  const ok = modified.length === 0 && missing.length === 0 && invalid_hash.length === 0;
  if (modified.length) reasons.push(`modified: ${modified.join(',')}`);
  if (missing.length) reasons.push(`missing: ${missing.join(',')}`);
  if (invalid_hash.length) reasons.push(`invalid hash: ${invalid_hash.join(',')}`);
  if (unexpected.length) reasons.push(`unexpected (not protected): ${unexpected.join(',')}`);
  return {
    status: ok ? 'INTEGRITY_VERIFIED' : 'INTEGRITY_FAILED', signature_status: integrity.signature_status,
    is_certification: false, modified, missing, unexpected, invalid_hash, unsupported_scheme: false,
    reasons: reasons.length ? reasons : ['all protected files match'],
  };
}

// ---- manifest ---------------------------------------------------------------------------------------------
const ID_RE = /^[a-z][a-z0-9._-]*$/i;
const VER_RE = /^\d+\.\d+\.\d+(?:-[0-9a-z.]+)?$/i;

export function buildProductManifest(): Manifest {
  const m = buildProductSpec().manifest_template;
  const withoutHash = { ...m, integrity: { ...m.integrity, manifest_hash: null } };
  return { ...withoutHash, integrity: { algorithm: 'sha256', manifest_hash: sha256(canonicalJson(withoutHash)) } };
}

// Fail-closed manifest validation: M14 structural checks + identifier/version/reference format checks.
export function validateProductManifest(m: Manifest): { ok: boolean; issues: string[] } {
  const base = m14ValidateManifest(m);
  const issues = [...base.issues];
  if (!ID_RE.test(m.product ?? '')) issues.push('invalid product id format');
  if (!ID_RE.test(m.skill_id ?? '')) issues.push('invalid skill id format');
  if (!VER_RE.test(m.product_version ?? '')) issues.push('invalid product_version format');
  if (!/^\d+$/.test(m.schema_version ?? '')) issues.push('invalid schema_version');
  for (const k of ['capabilities', 'required_facets', 'permissions', 'compatibility_requirements', 'security_requirements', 'dependencies'] as const)
    if (!Array.isArray((m as any)[k])) issues.push(`${k} not a list`);
  // unknown critical security requirement must not be implicitly accepted
  const knownSecurity = new Set(buildProductSpec().manifest_template.security_requirements);
  const unknownSecurity = (m.security_requirements ?? []).filter((s) => !knownSecurity.has(s));
  if (unknownSecurity.length) issues.push(`unknown security requirement(s) rejected: ${unknownSecurity.join(',')}`);
  if (m.integrity && m.integrity.manifest_hash !== null) {
    const { integrity, ...rest } = m;
    const recomputed = sha256(canonicalJson({ ...rest, integrity: { ...integrity, manifest_hash: null } }));
    if (recomputed !== integrity.manifest_hash) issues.push('manifest_hash mismatch (tampered manifest)');
  }
  return { ok: issues.length === 0, issues };
}
