#!/usr/bin/env node
// dkskill installer — portable, deterministic, confined, idempotent, offline.
// Copies the dkskill skill into <target>/dkskill. No network, no credentials, no ~/.claude credential access, no
// privileged execution, no subprocess. Path-traversal protected; refuses credential files and `runtime` segments.
// Usage:
//   node install.mjs --target <skills-dir> [--dry-run]
//   node install.mjs --project           (installs into ./.claude/skills)
//   node install.mjs --user              (installs into ~/.claude/skills — documented; asks nothing, writes only skill files)
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, relative, dirname, basename, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');   // skills/dkskill
const SKILL_NAME = 'dkskill';
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
    const safe = confine(dest, relative(dest, d));   // confine within <target>/dkskill
    const content = readFileSync(src);
    const existsSame = existsSync(safe) && readFileSync(safe).equals(content);
    actions.push({ path: safe, op: existsSame ? 'unchanged' : (existsSync(safe) ? 'update' : 'create') });
    if (!dryRun && !existsSame) { mkdirSync(dirname(safe), { recursive: true }); writeFileSync(safe, content); }
  }
  return { ok: true, dry_run: dryRun, skill_dir: dest, files: actions.length, created: actions.filter((a) => a.op === 'create').length, updated: actions.filter((a) => a.op === 'update').length, unchanged: actions.filter((a) => a.op === 'unchanged').length, actions, network_contacted: false, credentials_accessed: false, subprocesses_spawned: false };
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  let target = null;
  const ti = argv.indexOf('--target'); if (ti >= 0) target = argv[ti + 1];
  if (argv.includes('--project')) target = join(process.cwd(), '.claude', 'skills');
  if (argv.includes('--user')) target = join(homedir(), '.claude', 'skills');
  const r = install({ target, dryRun });
  if (!r.ok) { process.stderr.write(`dkskill install: ${r.error}\n`); process.exitCode = 2; return; }
  process.stdout.write(`dkskill ${dryRun ? '(dry-run) would install' : 'installed'} -> ${r.skill_dir}\n  files=${r.files} create=${r.created} update=${r.updated} unchanged=${r.unchanged}\n  network=${r.network_contacted} credentials=${r.credentials_accessed} subprocess=${r.subprocesses_spawned}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('install.mjs')) main();
