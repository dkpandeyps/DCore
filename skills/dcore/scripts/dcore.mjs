#!/usr/bin/env node
// dcore CLI — portable, offline by default. Usage:
//   node dcore.mjs "<natural-language task>"        (router: which capabilities, in which order)
//   node dcore.mjs list
//   node dcore.mjs <module> "<text>"           (positional input)
//   node dcore.mjs <module> --input "<text>" [--json]
//   node dcore.mjs <module>                    (reads text from stdin)
// Reasoning/analysis modules: no network, no credentials, no ~/.claude access, no subprocess, no destructive action.
// Execution modules (dcore-run/api/browse/git/verify, dcore-release --repo) live in ./exec and are loaded ONLY when
// invoked; their side effects are bounded and consequential ones require an explicit --approve.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { MODULES, EXECUTION_MODULES, runModule, renderMarkdown, summarizeImpact } from './modules.mjs';

const BOOL = new Set(['json', 'summary', 'staged', 'push', 'headed', 'allow-dirty', 'allow-console-errors', 'browse', 'list']);
const VALUE = new Set(['input', 'repo', 'cwd', 'timeout', 'approve', 'url', 'method', 'header', 'auth-env', 'auth-scheme', 'body', 'json-body', 'expect-status', 'expect-text', 'expect-json', 'schema', 'repeat', 'retries', 'spec', 'steps', 'out', 'profile', 'range', 'n', 'path', 'ref', 'message', 'files', 'remote', 'branch', 'test-cmd', 'deploy-cmd', 'verify-url', 'health', 'max-ms', 'report']);
const MULTI = new Set(['header', 'expect-text', 'expect-json', 'approve', 'health']);

export function parseArgs(argv) {
  const args = { _: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = a.match(/^--([a-z][\w-]*)$/);
    if (m && BOOL.has(m[1])) args[m[1]] = true;
    else if (m && VALUE.has(m[1])) {
      const v = argv[++i] ?? '';
      if (MULTI.has(m[1])) (args[m[1]] ??= []).push(v); else args[m[1]] = v;
    } else args._.push(a);
  }
  return args;
}

// Resolve module input, deterministically, from three sources in priority order:
//   1. an explicit --input flag, 2. positional text after the module name, 3. stdin.
// `readStdin` is a thunk so stdin is only consulted when nothing else supplied input.
export function resolveInput(args, readStdin) {
  if (args.input !== undefined) return args.input;
  const positional = args._.slice(1).join(' ').trim();
  if (positional !== '') return positional;
  return typeof readStdin === 'function' ? readStdin() : '';
}

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

class ArgError extends Error {}
// JSON arguments (--steps/--spec/--schema/--json-body) may be a file path or inline JSON; bad JSON fails closed.
const jsonArg = (v, name = 'argument') => {
  if (v === undefined) return undefined;
  try { return JSON.parse(existsSync(v) ? readFileSync(v, 'utf8') : v); } catch (e) { throw new ArgError(`${name} is not valid JSON (${e.message.split('\n')[0]})`); }
};
const blocked = (module, reason) => ({ schema: 'dcore.evidence/1', module, action: 'parse arguments', result: 'BLOCKED', checks: [], evidence: {}, limitations: [reason, 'nothing was executed'], started_at: null, ended_at: new Date().toISOString(), environment: { platform: process.platform, arch: process.arch, node: process.version } });

export function renderEvidence(r) {
  const lines = [`# DCore · ${r.module} — ${r.result}${r.verdict ? ` (verdict: ${r.verdict})` : ''}`, '', `action: ${r.action}`, ''];
  if (r.checks?.length) { lines.push('## checks'); for (const c of r.checks) lines.push(`- [${c.result}] ${c.title}${c.actual !== undefined && c.result === 'FAIL' ? ` (actual: ${JSON.stringify(c.actual).slice(0, 160)})` : ''}`); lines.push(''); }
  if (r.actions?.length) { lines.push('## actions'); for (const a of r.actions) lines.push(`- [${a.result}] ${a.action}${a.reason ? `: ${a.reason}` : ''}`); lines.push(''); }
  if (r.evidence && Object.keys(r.evidence).length) { lines.push('## evidence', '```json', JSON.stringify(r.evidence, null, 2).slice(0, 12000), '```', ''); }
  if (r.limitations?.length) { lines.push('## limitations', ...r.limitations.map((l) => `- ${l}`), ''); }
  return lines.join('\n');
}

// --report <file.md>: the same (already redacted) evidence as Markdown, plus screenshot links relative to the report.
function writeReport(file, r) {
  const path = resolve(file);
  const shots = r.evidence?.screenshots ?? [];
  const md = renderEvidence(r) + (shots.length ? `\n## screenshots\n${shots.map((s) => `![${s.split(/[\\/]/).pop()}](${relative(dirname(path), s).replace(/\\/g, '/')})`).join('\n')}\n` : '');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, md);
}

async function runExecution(cmd, args) {
  const approvals = args.approve ?? [];
  const rest = args._.slice(1);
  switch (cmd) {
    case 'dcore-run': {
      const { runCommand, listCommands } = await import('./exec/run.mjs');
      if (args.list || rest.length === 0) return listCommands(args.repo ?? '.');
      return runCommand(rest.join(' '), { cwd: args.cwd ?? args.repo ?? '.', timeoutMs: args.timeout ? Number(args.timeout) : undefined, approvals });
    }
    case 'dcore-api': {
      const { apiRequest } = await import('./exec/api.mjs');
      const spec = jsonArg(args.spec, '--spec') ?? {};
      if (args.url ?? rest[0]) spec.url = args.url ?? rest[0];
      if (args.method) spec.method = args.method;
      for (const h of args.header ?? []) { const i = h.indexOf(':'); (spec.headers ??= {})[h.slice(0, i).trim()] = h.slice(i + 1).trim(); }
      if (args['auth-env']) { spec.authEnv = args['auth-env']; if (args['auth-scheme']) spec.authScheme = args['auth-scheme']; }
      if (args['json-body']) spec.json = jsonArg(args['json-body'], '--json-body');
      if (args.body) spec.body = args.body;
      if (args.repeat) spec.repeat = Number(args.repeat);
      if (args.retries) spec.retries = Number(args.retries);
      if (args.timeout) spec.timeoutMs = Number(args.timeout);
      const e = (spec.expect ??= {});
      if (args['expect-status']) e.status = Number(args['expect-status']);
      if (args['expect-text']) e.bodyContains = args['expect-text'];
      for (const kv of args['expect-json'] ?? []) { const i = kv.indexOf('='); let v = kv.slice(i + 1); try { v = JSON.parse(v); } catch { /* string */ } (e.json ??= {})[kv.slice(0, i)] = v; }
      if (args.schema) e.schema = jsonArg(args.schema, '--schema');
      if (args['max-ms']) e.maxMs = Number(args['max-ms']);
      return apiRequest(spec, { approvals });
    }
    case 'dcore-browse': {
      const { browse } = await import('./exec/browse.mjs');
      let steps = jsonArg(args.steps, '--steps');
      if (!steps && rest[0] === 'open' && rest[1]) steps = [{ goto: rest[1] }, { inspect: {} }, { a11y: true }, { perf: true }, { screenshot: 'page' }];
      return browse(steps ?? [], { outDir: args.out, profile: args.profile, headed: args.headed, allowConsoleErrors: args['allow-console-errors'], stepTimeoutMs: args.timeout ? Number(args.timeout) : undefined });
    }
    case 'dcore-git': {
      const { gitOp } = await import('./exec/git.mjs');
      return gitOp(rest[0] ?? 'status', { repo: args.repo, range: args.range, staged: args.staged, n: args.n, path: args.path, ref: args.ref, message: args.message, files: args.files ? args.files.split(',') : undefined, remote: args.remote, branch: args.branch, approvals, args: rest.slice(1) });
    }
    case 'dcore-verify': {
      const { verifyDeployment } = await import('./exec/verify.mjs');
      return verifyDeployment({ url: args.url ?? rest[0], health: (args.health ?? []).flatMap((h) => h.split(',')), expectText: args['expect-text'], maxMs: args['max-ms'] ? Number(args['max-ms']) : undefined, browse: args.browse, steps: jsonArg(args.steps, '--steps') }, { outDir: args.out });
    }
    case 'dcore-release': {
      const { releaseReadiness } = await import('./exec/release.mjs');
      return releaseReadiness({ repo: args.repo, testCmd: args['test-cmd'], push: args.push, deployCmd: args['deploy-cmd'], verifyUrl: args['verify-url'], health: args.health?.flatMap((h) => h.split(',')), allowDirty: args['allow-dirty'], approvals });
    }
    default: return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || cmd === 'help' || cmd === '--help') {
    process.stdout.write(['DCore — universal Claude Code skill', '', 'Usage:', '  node dcore.mjs "<task in plain English>"  (router)', '  node dcore.mjs list', '  node dcore.mjs <module> "<text>"           (positional)', '  node dcore.mjs <module> --input "<text>" [--json]', '  node dcore.mjs <module>                    (stdin)', '', 'Modules:', ...MODULES.map((m) => `  ${m.module_id.padEnd(14)} ${m.status.padEnd(11)} ${m.kind.padEnd(9)} ${m.module_name}`), ''].join('\n'));
    return;
  }
  if (cmd === 'list') {
    if (args.json) process.stdout.write(JSON.stringify(MODULES, null, 2) + '\n');
    else process.stdout.write(MODULES.map((m) => `${m.module_id.padEnd(14)} ${m.status.padEnd(11)} ${m.kind.padEnd(9)} ${m.module_name} — ${m.purpose}`).join('\n') + '\n');
    return;
  }
  // execution modules (and dcore-release with --repo / publish flags) produce evidence reports
  if (EXECUTION_MODULES.includes(cmd) || (cmd === 'dcore-release' && (args.repo || args.push || args['deploy-cmd']))) {
    let r;
    try { r = await runExecution(cmd, args); } catch (e) { if (!(e instanceof ArgError)) throw e; r = blocked(cmd, e.message); }
    if (args.report) writeReport(args.report, r);
    process.stdout.write((args.json ? JSON.stringify(r, null, 2) : r.schema ? renderEvidence(r) : JSON.stringify(r, null, 2)) + '\n');
    if (r.result === 'FAIL' || r.verdict === 'FAILED') process.exitCode = 1;
    else if (r.result === 'BLOCKED' || r.verdict === 'BLOCKED' || r.verdict === 'NOT_AUTHORIZED') process.exitCode = 3;
    return;
  }
  // plain-language task (not a module id): route it
  const isModule = cmd.startsWith('dcore-');
  const input = cmd === 'route' || !isModule ? (cmd === 'route' ? resolveInput(args, readStdin) : args._.join(' ')) : resolveInput(args, readStdin);
  const result = cmd === 'route' || !isModule ? runModule('dcore-route', input) : runModule(cmd, input, { repo: args.repo });
  // --summary: compact presentation of a dcore-impact result (same evidence; nothing hidden). Shown even on a
  // soft repo error so the UNKNOWN/identifier context is still visible.
  if (args.summary && result.module_id === 'dcore-impact') {
    process.stdout.write(summarizeImpact(result) + '\n');
    if (result.error) process.exitCode = 2;
    return;
  }
  if (result.error) { process.stderr.write(renderMarkdown(result) + '\n'); process.exitCode = 2; return; }
  process.stdout.write((args.json ? JSON.stringify(result, null, 2) : renderMarkdown(result)) + '\n');
}

if (process.argv[1] && process.argv[1].endsWith('dcore.mjs')) main();
