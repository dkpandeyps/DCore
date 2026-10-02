// dcore-run — bounded, intentional execution of repository-local commands with evidence.
// Spawns ONE user-requested command (through the platform shell), with a timeout, captured + redacted output and
// a failure classification. Destructive commands need an explicit approval; force-push/history-rewrite are refused.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { report, check, redact, gate } from './evidence.mjs';
import { discoverCommands } from '../explore.mjs';

// Classify a command line before running it. Returns { gate } when an approval is needed, or { forbidden }.
const RULES = [
  [/\bgit\s+push\b[^|;&]*\s(--force(-with-lease)?|-f)\b|\bgit\s+push\b[^|;&]*\s\+\S+/i, 'forbidden', 'force-push'],
  [/\bgit\s+(filter-branch|filter-repo)\b|\bbfg\b|\bgit\s+rebase\b|\bgit\s+commit\b[^|;&]*--amend\b|\bgit\s+replace\b/i, 'forbidden', 'history-rewrite'],
  [/\bgit\s+push\b/i, 'gate', 'git-push'],
  [/\bgit\s+commit\b/i, 'gate', 'git-commit'],
  [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s|checkout\s+\.\s*$|restore\s|branch\s+-D|stash\s+(drop|clear)|tag\s+-d|push\s+\S+\s+--delete)/i, 'gate', 'destructive-command'],
  [/\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b|\brm\s+-r\b|\brmdir\s+\/s\b|\bdel\s+\/[sfq]|\bRemove-Item\b[^|;&]*-Recurse|\brd\s+\/s\b|\bformat\s+[a-z]:|\bmkfs\b|\bdd\s+if=|\bshred\b/i, 'gate', 'delete'],
  [/\b(drop\s+(database|table|schema)|truncate\s+table|delete\s+from\s+\w+\s*(;|$))/i, 'gate', 'db-destructive'],
  [/\b(npm|pnpm|yarn)\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgh\s+release\s+create\b|\bdocker\s+push\b|\bgem\s+push\b/i, 'gate', 'release'],
  [/\b(kubectl\s+(apply|delete|rollout|scale)|helm\s+(install|upgrade|uninstall)|terraform\s+(apply|destroy)|pulumi\s+up|vercel\b.*--prod|netlify\s+deploy|fly\s+deploy|flyctl\s+deploy|heroku\b|serverless\s+deploy|sls\s+deploy|gcloud\s+.*deploy|aws\s+.*deploy|az\s+.*deploy|eb\s+deploy|cap\s+production)/i, 'gate', 'deploy'],
  [/\b(shutdown|reboot|halt|poweroff)\b|:\(\)\s*\{|\bchmod\s+-R\s+777\b|\bchown\s+-R\b/i, 'gate', 'destructive-command'],
  [/\b(curl|wget|iwr|Invoke-WebRequest)\b[^|]*\|\s*(sh|bash|zsh|iex|powershell|pwsh)\b/i, 'gate', 'destructive-command'],
];
export function classifyCommand(cmd) {
  const c = String(cmd ?? '');
  for (const [re, kind, category] of RULES) if (re.test(c)) return kind === 'forbidden' ? { forbidden: category } : { gate: category };
  return {};
}

// Failure classification from exit status + output (heuristic, evidence-backed: the matched line is returned).
const FAIL_PATTERNS = [
  ['TYPE_ERROR', /\berror TS\d{4}\b|\bTypeError\b.*cannot|mypy.*error|\bType error\b/i],
  ['TEST_FAILURE', /\b(\d+) (failing|failed)\b|^\s*(✖|FAIL|not ok)\b|AssertionError|Tests:\s+\d+ failed|ℹ fail [1-9]|FAILED .*::|\bassert(ion)? (failed|error)/im],
  ['LINT', /\b\d+ problems? \(\d+ errors?|eslint|✖ \d+ problems?|\bflake8\b|\bruff\b.*error/i],
  ['BUILD_ERROR', /\b(build failed|compilation failed|cannot find module|module not found|SyntaxError|BUILD FAILURE|error\[E\d+\])/i],
  ['DEPENDENCY', /\b(ERESOLVE|ENOENT.*node_modules|No module named|could not resolve dependencies|npm ERR! code E)/i],
  ['PERMISSION', /\b(EACCES|EPERM|permission denied|access is denied)\b/i],
  ['NETWORK', /\b(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|getaddrinfo|network is unreachable)\b/i],
];
export function classifyFailure({ exit_code, timed_out, spawn_error, output }) {
  if (spawn_error) return { kind: 'SPAWN_ERROR', line: spawn_error };
  if (timed_out) return { kind: 'TIMEOUT', line: null };
  if (exit_code === 0) return null;
  const out = String(output ?? '');
  if (exit_code === 127 || /is not recognized as an internal or external command|command not found|not found: /i.test(out)) return { kind: 'COMMAND_NOT_FOUND', line: (out.match(/.*(not recognized|command not found|not found).*/i) ?? [null])[0] };
  for (const [kind, re] of FAIL_PATTERNS) { const m = out.match(new RegExp(`.*(?:${re.source}).*`, re.flags.replace('g', ''))); if (m) return { kind, line: m[0].trim().slice(0, 240) }; }
  return { kind: 'NONZERO_EXIT', line: null };
}

// Test counts from common runners (only when the runner printed them; never inferred).
export function parseTestCounts(output) {
  const o = String(output ?? '');
  const n = (re) => { const m = o.match(re); return m ? Number(m[1]) : null; };
  const node = { tests: n(/ℹ tests (\d+)/), pass: n(/ℹ pass (\d+)/), fail: n(/ℹ fail (\d+)/) };
  if (node.tests !== null) return { runner: 'node:test', ...node };
  const jm = o.match(/Tests:\s+(?:(\d+) failed, )?(?:\d+ skipped, )?(\d+) passed, (\d+) total/);
  if (jm) return { runner: 'jest/vitest', tests: Number(jm[3]), pass: Number(jm[2]), fail: Number(jm[1] ?? 0) };
  const py = o.match(/=+ (?:(\d+) failed, )?(\d+) passed/);
  if (py) return { runner: 'pytest', tests: Number(py[2]) + Number(py[1] ?? 0), pass: Number(py[2]), fail: Number(py[1] ?? 0) };
  const mo = o.match(/(\d+) passing/);
  if (mo) return { runner: 'mocha', tests: null, pass: Number(mo[1]), fail: n(/(\d+) failing/) ?? 0 };
  return null;
}

const MAX_OUT = 64 * 1024;
const tail = (s) => (s.length > MAX_OUT ? `…[${s.length - MAX_OUT} bytes truncated]…\n` + s.slice(-MAX_OUT) : s);

export function runCommand(cmd, { cwd = '.', timeoutMs = 600_000, approvals = [], secrets = [], env } = {}) {
  const started_at = new Date().toISOString();
  const command = String(cmd ?? '').trim();
  const base = { module: 'dcore-run', action: `run: ${redact(command, secrets)}`, started_at, secrets };
  if (!command) return Promise.resolve(report({ ...base, result: 'BLOCKED', limitations: ['no command given'] }));
  const dir = resolve(cwd);
  if (!existsSync(dir)) return Promise.resolve(report({ ...base, result: 'BLOCKED', limitations: [`cwd does not exist: ${cwd}`] }));
  const cls = classifyCommand(command);
  if (cls.forbidden) { const g = gate(cls.forbidden, approvals); return Promise.resolve(report({ ...base, result: 'BLOCKED', checks: [check('gate', g.reason, 'BLOCKED')], limitations: ['not executed'] })); }
  if (cls.gate) {
    const g = gate(cls.gate, approvals);
    if (!g.allowed) return Promise.resolve(report({ ...base, result: 'BLOCKED', checks: [check('gate', g.reason, 'NOT_AUTHORIZED')], evidence: { approval: 'NOT_AUTHORIZED', gate: cls.gate }, limitations: ['not executed: approval required'] }));
  }
  return new Promise((done) => {
    const t0 = Date.now();
    let out = '';
    let timedOut = false;
    let spawnError = null;
    const child = spawn(command, { cwd: dir, shell: true, windowsHide: true, env: { ...process.env, ...(env ?? {}), CI: process.env.CI ?? '1', FORCE_COLOR: '0', NO_COLOR: '1' } });
    const onData = (d) => { out += d.toString(); if (out.length > MAX_OUT * 4) out = out.slice(-MAX_OUT * 2); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
      else child.kill('SIGKILL');
    }, timeoutMs);
    child.on('error', (e) => { spawnError = e.message; });
    child.on('close', (code) => {
      clearTimeout(timer);
      const output = tail(out);
      const failure = classifyFailure({ exit_code: code, timed_out: timedOut, spawn_error: spawnError, output });
      const counts = parseTestCounts(output);
      const checks = [check('exit', `exit code ${code}${timedOut ? ' (timed out)' : ''}`, !failure ? 'PASS' : 'FAIL', { expected: 0, actual: code })];
      if (counts && counts.fail !== null) checks.push(check('tests', `test runner reported ${counts.fail} failing`, counts.fail === 0 ? 'PASS' : 'FAIL', { actual: counts }));
      done(report({
        ...base, checks,
        result: spawnError ? 'BLOCKED' : undefined,
        evidence: { cwd: dir, exit_code: code, duration_ms: Date.now() - t0, timed_out: timedOut, failure, test_counts: counts, output },
        limitations: [...(timedOut ? [`killed after ${timeoutMs} ms`] : []), ...(out.length > MAX_OUT ? ['output truncated to the last 64 KB'] : [])],
      }));
    });
  });
}

export function listCommands(repo = '.') {
  return { module: 'dcore-run', action: 'discover', commands: discoverCommands(repo) };
}
