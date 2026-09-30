// M16 — real-node-filesystem adapter implementing the M15 VirtualFs, confined to an explicit install root.
// Read/write ONLY inside the selected root; refuse path escapes; refuse `runtime` and `.claude` segments; never
// spawn subprocesses, never contact the network, never elevate privileges, never touch ~/.claude, never read
// credentials. Platform-neutral (node:path). It reuses M15 runInstall unchanged and adds a fail-closed wrapper.
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute, sep } from 'node:path';
import { runInstall, isSafeInstallDir } from './install.ts';
import type { VirtualFs, InstallResult } from './product-foundation-types.ts';
import type { Manifest } from '../compatibility/product-core-types.ts';
import type { IntegrityManifest } from './product-foundation-types.ts';
import type { UniversalHost } from '../compatibility/universal-compatibility-types.ts';
import type { Registry } from '../tools/gen-compatibility-registry.ts';

// Resolve a path and confine it under `root`; throw (fail closed) on escape or an unsafe segment.
export function confinePath(root: string, p: string): string {
  const rootAbs = resolve(root);
  const abs = isAbsolute(p) ? resolve(p) : resolve(rootAbs, p);
  const rel = relative(rootAbs, abs);
  if (rel !== '' && (rel === '..' || rel.startsWith('..' + sep) || rel.startsWith('../') || isAbsolute(rel))) throw new Error(`path escapes install root: ${p}`);
  const segs = rel.split(/[\\/]/).filter(Boolean);
  if (segs.some((s) => s.toLowerCase() === 'runtime' || s.toLowerCase() === '.claude')) throw new Error(`unsafe path segment (runtime/.claude): ${p}`);
  return abs;
}

export function nodeFs(root: string): VirtualFs {
  const rootAbs = resolve(root);
  const created = new Set<string>();
  return {
    exists: (p) => { try { return existsSync(confinePath(rootAbs, p)); } catch { return false; } },
    mkdir: (p) => { const abs = confinePath(rootAbs, p); mkdirSync(abs, { recursive: true }); created.add(abs); },
    writeFile: (p, c) => { const abs = confinePath(rootAbs, p); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, c, { encoding: 'utf8' }); created.add(abs); },
    readFile: (p) => { try { const abs = confinePath(rootAbs, p); return existsSync(abs) ? readFileSync(abs, 'utf8') : null; } catch { return null; } },
    list: () => { try { return walk(rootAbs).sort(); } catch { return []; } },
  };
}
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    const p = `${dir}${sep}${name}`;
    if (statSync(p).isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

// Fail-closed real install: reuse the frozen M15 runInstall against a real, confined filesystem.
export function runInstallReal(input: {
  packageFiles: { path: string; content: string }[]; integrity: IntegrityManifest; manifest: Manifest;
  root: string; targetDir: string; stateDir: string; host?: UniversalHost; registry?: Registry; now: string;
}): InstallResult {
  if (!isSafeInstallDir(input.targetDir) || !isSafeInstallDir(input.stateDir)) {
    return { schema: 'dkskill.install_result/1', state: 'BLOCKED', stages: [{ stage: 'INSTALL', result: 'BLOCKED', reasons: ['unsafe install/state directory'] }], created_paths: [], integrity: { status: 'INTEGRITY_UNKNOWN', signature_status: 'SIGNATURE_NOT_AVAILABLE', is_certification: false, modified: [], missing: [], unexpected: [], invalid_hash: [], unsupported_scheme: false, reasons: ['unsafe directory'] }, compatibility_status: 'NOT_CHECKED', install_state_record: null, reasons: ['unsafe directory'] };
  }
  try {
    return runInstall({ ...input, fs: nodeFs(input.root) });
  } catch (e: any) {
    return { schema: 'dkskill.install_result/1', state: 'FAILED', stages: [{ stage: 'INSTALL', result: 'FAIL', reasons: [String(e?.message ?? e)] }], created_paths: [], integrity: { status: 'INTEGRITY_UNKNOWN', signature_status: 'SIGNATURE_NOT_AVAILABLE', is_certification: false, modified: [], missing: [], unexpected: [], invalid_hash: [], unsupported_scheme: false, reasons: ['fs error'] }, compatibility_status: 'NOT_CHECKED', install_state_record: null, reasons: [`fail-closed: ${String(e?.message ?? e)}`] };
  }
}
