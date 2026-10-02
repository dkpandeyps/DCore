#!/usr/bin/env node
// dcore installer — portable, deterministic, confined, idempotent, offline.
// Copies the dcore skill into <target>/dcore. No network, no credentials, no ~/.claude credential access, no
// privileged execution, no subprocess. Path-traversal protected; refuses credential files and `runtime` segments.
// Upgrades: a record (.dcore-install.json) lists the files DCore installed; on reinstall, files that a PREVIOUS
// DCore install wrote and the current version no longer ships are removed. Files DCore never installed are only
// reported (`unmanaged`), never deleted.
// Usage:
//   node install.mjs --target <skills-dir> [--dry-run]
//   node install.mjs --project           (installs into ./.claude/skills)
//   node install.mjs --user              (installs into ~/.claude/skills — documented; asks nothing, writes only skill files)
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, relative, dirname, basename, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');   // skills/dcore
const SKILL_NAME = 'dcore';
const RECORD = '.dcore-install.json';
const CRED_RE = /(\.credentials|credentials\.json|oauth|cookie|token|api[_-]?key|id_rsa|\.pem|session)/i;

export function isSafeDestRoot(root) {
  const abs = resolve(root).replace(/\\/g, '/');
  const segs = abs.split('/').filter(Boolean);
  if (segs.some((s) => s.toLowerCase() === 'runtime')) return false;     // never a `runtime` dir
  if (CRED_RE.test(abs)) return false;                                   // never a credential path
  return true;
}
function confine(root, p) {
  const rootAbs = resolve(root);
  const abs = resolve(rootAbs, p);
  const rel = relative(rootAbs, abs);
  if (rel && (rel === '..' || rel.startsWith('..' + sep) || rel.startsWith('../'))) throw new Error(`path escapes install root: ${p}`);
  if (CRED_RE.test(basename(abs))) throw new Error(`refusing to write credential-like file: ${basename(abs)}`);
  return abs;
}
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

export function planInstall(targetRoot) {
  const dest = resolve(targetRoot, SKILL_NAME);
  const files = walk(SKILL_DIR).filter((f) => !/[\\/]node_modules[\\/]/.test(f));
  return files.map((src) => ({ src, dest: join(dest, relative(SKILL_DIR, src)) }));
}

export function install({ target, dryRun = false } = {}) {
  if (!target) return { ok: false, error: 'missing --target', actions: [] };
  if (!isSafeDestRoot(target)) return { ok: false, error: `unsafe target (runtime/credential path): ${target}`, actions: [] };
  const dest = resolve(target, SKILL_NAME);
  const plan = planInstall(target);
  const actions = [];
  for (const { src, dest: d } of plan) {
    const safe = confine(dest, relative(dest, d));   // confine within <target>/dcore
    const content = readFileSync(src);
    const existsSame = existsSync(safe) && readFileSync(safe).equals(content);
    actions.push({ path: safe, op: existsSame ? 'unchanged' : (existsSync(safe) ? 'update' : 'create') });
    if (!dryRun && !existsSame) { mkdirSync(dirname(safe), { recursive: true }); writeFileSync(safe, content); }
  }
  // stale files from a previous DCore install (per its record) are removed; anything else is only reported
  const rels = plan.map(({ dest: d }) => relative(dest, d).replace(/\\/g, '/')).sort();
  const recordPath = join(dest, RECORD);
  let previous = [];
  try { previous = JSON.parse(readFileSync(recordPath, 'utf8')).files ?? []; } catch { /* first install or unreadable record */ }
  const removed = [];
  for (const rel of previous.filter((p) => typeof p === 'string' && !rels.includes(p)).sort()) {
    const abs = confine(dest, rel);
    if (existsSync(abs) && statSync(abs).isFile()) { if (!dryRun) rmSync(abs); removed.push(rel); }
  }
  const present = existsSync(dest) ? walk(dest).map((f) => relative(dest, f).replace(/\\/g, '/')) : [];
  const unmanaged = present.filter((p) => p !== RECORD && !rels.includes(p) && !removed.includes(p)).sort();
  const record = JSON.stringify({ schema: 'dcore.install_record/1', files: rels }, null, 2) + '\n';
  if (!dryRun && (!existsSync(recordPath) || readFileSync(recordPath, 'utf8') !== record)) writeFileSync(recordPath, record);
  return { ok: true, dry_run: dryRun, skill_dir: dest, files: actions.length, removed: dryRun ? [] : removed, would_remove: dryRun ? removed : [], unmanaged, created: actions.filter((a) => a.op === 'create').length, updated: actions.filter((a) => a.op === 'update').length, unchanged: actions.filter((a) => a.op === 'unchanged').length, actions, network_contacted: false, credentials_accessed: false, subprocesses_spawned: false };
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  let target = null;
  const ti = argv.indexOf('--target'); if (ti >= 0) target = argv[ti + 1];
  if (argv.includes('--project')) target = join(process.cwd(), '.claude', 'skills');
  if (argv.includes('--user')) target = join(homedir(), '.claude', 'skills');
  const r = install({ target, dryRun });
  if (!r.ok) { process.stderr.write(`DCore install: ${r.error}\n`); process.exitCode = 2; return; }
  process.stdout.write(`DCore ${dryRun ? '(dry-run) would install' : 'installed'} -> ${r.skill_dir}\n  files=${r.files} create=${r.created} update=${r.updated} unchanged=${r.unchanged} removed=${r.removed.length}${r.unmanaged.length ? `\n  unmanaged=${r.unmanaged.length} (not installed by DCore; left in place): ${r.unmanaged.join(', ')}` : ''}\n  network=${r.network_contacted} credentials=${r.credentials_accessed} subprocess=${r.subprocesses_spawned}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('install.mjs')) main();
