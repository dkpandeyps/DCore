// dcore execution layer — shared evidence model, secret redaction and authorization gates.
// Pure: no network, no subprocess, no filesystem. Every execution module (run/api/browse/git/verify/release) reports
// through this model so "could not execute" is never confused with "passed".

// ---- outcomes ----------------------------------------------------------------------------------------------
export const OUTCOMES = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'NOT_TESTED', 'NOT_APPLICABLE'];

// Aggregate check outcomes: any FAIL => FAIL; else any BLOCKED => BLOCKED; else at least one PASS => PASS;
// nothing executed => NOT_TESTED. SKIPPED/NOT_APPLICABLE never turn into PASS on their own.
export function aggregate(results) {
  const rs = (results ?? []).map((r) => (typeof r === 'string' ? r : r?.result));
  if (rs.includes('FAIL')) return 'FAIL';
  if (rs.includes('BLOCKED') || rs.includes('NOT_AUTHORIZED')) return 'BLOCKED';
  if (rs.includes('PASS')) return 'PASS';
  if (rs.length && rs.every((r) => r === 'NOT_APPLICABLE')) return 'NOT_APPLICABLE';
  return 'NOT_TESTED';
}

export function environment() {
  return { platform: process.platform, arch: process.arch, node: process.version };
}

// A single evidence report. `checks` are individual assertions; `result` is derived unless forced (e.g. BLOCKED).
export function report({ module, action, checks = [], evidence = {}, limitations = [], result, started_at, secrets = [] }) {
  const out = {
    schema: 'dcore.evidence/1', module, action,
    result: result ?? aggregate(checks),
    checks, evidence, limitations,
    started_at: started_at ?? null, ended_at: new Date().toISOString(),
    environment: environment(),
  };
  return redactDeep(out, secrets);
}

export const check = (id, title, result, extra = {}) => ({ id, title, result, ...extra });

// ---- redaction ---------------------------------------------------------------------------------------------
const REDACTED = '[REDACTED]';
const PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, REDACTED],
  [/\b(authorization|proxy-authorization)(["']?\s*[:=]\s*["']?)([^"'\r\n,}]+)/gi, `$1$2${REDACTED}`],
  [/\b(set-cookie|cookie)(["']?\s*[:=]\s*["']?)([^"'\r\n}]+)/gi, `$1$2${REDACTED}`],
  [/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g, `Bearer ${REDACTED}`],
  [/\bBasic\s+[A-Za-z0-9+/]{8,}=*/g, `Basic ${REDACTED}`],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, REDACTED],                       // JWT
  [/\b(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, REDACTED],
  [/(\b(?:password|passwd|pwd|secret|client_secret|api[_-]?key|access[_-]?token|refresh[_-]?token|token|auth)\b(["']?\s*[:=]\s*["']?))([^"'\s&,;}]+)/gi, `$1${REDACTED}`],
  [/([?&](?:password|pwd|secret|api[_-]?key|access_token|token|auth|signature|sig)=)[^&#\s"']+/gi, `$1${REDACTED}`],
  [/(\/\/[^/\s:@]+:)[^@\s/]+@/g, `$1${REDACTED}@`],                                                  // user:pass@host
];

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Redact secret-shaped substrings, plus any literal secret values the caller knows about (e.g. an env-provided
// password). Literal values shorter than 4 chars are ignored to avoid shredding ordinary text.
export function redact(text, secrets = []) {
  let s = String(text ?? '');
  for (const v of secrets) if (typeof v === 'string' && v.length >= 4) s = s.replace(new RegExp(escapeRe(v), 'g'), REDACTED);
  for (const [re, rep] of PATTERNS) s = s.replace(re, rep);
  return s;
}

const SENSITIVE_KEY = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|password|passwd|secret|client_secret|token|access_token|refresh_token|x-auth-token|x-csrf-token)$/i;
export function redactDeep(value, secrets = []) {
  if (typeof value === 'string') return redact(value, secrets);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, secrets));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) && v != null && v !== '' ? REDACTED : redactDeep(v, secrets);
    return out;
  }
  return value;
}

// ---- authorization gates -----------------------------------------------------------------------------------
// Consequential side effects need an explicit, per-invocation approval (`--approve <category>[,<category>]`).
// Claude passes an approval ONLY after the user explicitly confirmed that specific action in the conversation.
export const GATES = {
  'git-commit': 'create a git commit',
  'git-push': 'push commits to a remote',
  'deploy': 'deploy or publish to an environment',
  'release': 'publish a release/package/tag',
  'production': 'act against a production system',
  'db-destructive': 'destructive database operation (drop/truncate/delete without where)',
  'delete': 'delete files or data',
  'external-write': 'non-read HTTP request (POST/PUT/PATCH/DELETE) to a non-local host',
  'credential': 'read or use credential material',
  'account': 'change accounts, users, permissions or settings',
  'destructive-command': 'run a command classified as destructive',
};
// Never allowed, even with approval: history rewriting and force pushes.
export const FORBIDDEN = {
  'force-push': 'force push (rewrites remote history)',
  'history-rewrite': 'rewrite git history (filter-branch/filter-repo/BFG/rebase of published commits)',
};

export function parseApprovals(v) {
  if (Array.isArray(v)) return v.flatMap(parseApprovals);
  return String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function gate(category, approvals = []) {
  if (FORBIDDEN[category]) return { allowed: false, result: 'BLOCKED', category, reason: `forbidden: ${FORBIDDEN[category]} — never performed by DCore` };
  if (!GATES[category]) return { allowed: false, result: 'BLOCKED', category, reason: `unknown gate: ${category}` };
  const ok = parseApprovals(approvals).includes(category);
  return ok
    ? { allowed: true, result: 'PASS', category, reason: `approved: ${GATES[category]}` }
    : { allowed: false, result: 'NOT_AUTHORIZED', category, reason: `requires explicit approval (--approve ${category}): ${GATES[category]}` };
}
