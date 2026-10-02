// dcore-sec repository scan — read-only, deterministic, pure node:fs. Finds credential material and insecure code
// patterns in a user-supplied repo and classifies each finding honestly:
//   CONFIRMED   — the text has the exact shape of a real credential (private key block, provider key formats)
//   SUSPICIOUS  — a pattern that is often a vulnerability or a hardcoded secret, but needs human confirmation
//   THEORETICAL — a risky construct whose exploitability depends on context
// Sensitive files (.env, keys, credential stores) are reported by NAME only and never read. Excerpts are redacted.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname, basename } from 'node:path';
import { redact } from './exec/evidence.mjs';

const SKIP_DIR = new Set(['.git', '.hg', '.svn', 'node_modules', 'dist', 'build', 'out', '.next', 'target', '.cache', 'coverage', '.venv', 'venv', '__pycache__', 'vendor', '.claude', '.paysec', '.dcore', '.idea', '.gradle']);
const SENSITIVE = /^(\.env(\..*)?|\.credentials.*|credentials\.json|\.git-credentials|\.npmrc|\.pypirc|id_rsa.*|id_ed25519.*|.*\.(pem|key|p12|pfx|keystore|jks|pk8))$/i;
const SENSITIVE_OK = /^\.env\.(example|sample|template|dist)$/i;
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.py', '.java', '.kt', '.go', '.rs', '.rb', '.php', '.cs', '.swift', '.scala', '.sh', '.ps1', '.bash', '.zsh', '.json', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.properties', '.xml', '.env', '.tf', '.sql', '.html', '.vue', '.svelte', '.md', '.txt', '.gradle', '.dockerfile', '']);
const TESTY = /(^|\/)(test|tests|__tests__|spec|specs|fixtures?|__fixtures__|mocks?|examples?|e2e|testdata)\/|\.(test|spec)\.[a-z]+$/i;

const CONFIRMED = [
  ['private-key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/],
  ['aws-access-key-id', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['github-token', /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{30,}/],
  ['openai-key', /\bsk-(proj-)?[A-Za-z0-9_-]{40,}/],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{20,}/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['stripe-live-key', /\b(sk|rk)_live_[0-9a-zA-Z]{20,}/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/],
];
const PLACEHOLDER = /^(\$\{|<|\{\{|%|process\.env|os\.environ|env\(|getenv|config\.|settings\.|xxx|\*\*\*|changeme|change_me|your[_-]|example|dummy|test|fake|sample|placeholder|redacted|none|null|true|false|\[REDACTED\])/i;
const SUSPICIOUS = [
  ['hardcoded-secret', /\b(password|passwd|pwd|secret|client_secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\b\s*["']?\s*[:=]\s*["']([^"'\s]{6,})["']/i, (m) => !PLACEHOLDER.test(m[2])],
  ['tls-verification-disabled', /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true|CURLOPT_SSL_VERIFYPEER\s*,\s*(0|false)/],
  // a real statement shape (SELECT … FROM, INSERT INTO, UPDATE … SET, DELETE FROM) built by concatenation/interpolation
  ['sql-string-concat', /\b(SELECT\s[^`"']*\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b[^`"']*(["']\s*\+|\$\{[^}]+\})/i],
  ['command-injection', /\b(exec|execSync)\s*\(\s*`[^`]*\$\{|\bos\.system\s*\(\s*f?["'][^"']*(\{|%s|\+)|subprocess\.\w+\([^)]*shell\s*=\s*True/],
  ['dynamic-eval', /(?<![.\w$])eval\s*\(\s*(?!['"`])[\w.[\]]+|(?<![.\w$])new Function\s*\(/],   // not obj.eval(...) methods
  ['unsafe-deserialization', /\bpickle\.loads?\s*\(|\byaml\.load\s*\((?![^)]*SafeLoader)|\bunserialize\s*\(\s*\$_|ObjectInputStream\s*\(/],
];
const THEORETICAL = [
  ['xss-sink', /\.innerHTML\s*=(?!\s*['"`]\s*['"`]?;?\s*$)|dangerouslySetInnerHTML|\bv-html\b|document\.write\s*\(/],
  ['cors-wildcard', /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*['"]|cors\(\s*\{\s*origin\s*:\s*(['"]\*['"]|true)/],
  ['weak-hash', /\b(createHash\s*\(\s*['"](md5|sha1)['"]|hashlib\.(md5|sha1)\s*\(|MessageDigest\.getInstance\s*\(\s*"(MD5|SHA-?1)")/i],
  ['insecure-random', /Math\.random\s*\(\s*\)[^;\n]*(token|secret|password|nonce|otp|salt|key)|(token|secret|password|nonce|otp|salt)[^;\n]*Math\.random\s*\(/i],
  ['path-traversal', /(readFile|createReadStream|sendFile|open)\s*\([^)]*(req\.(query|params|body)|request\.(args|GET|POST))/],
  ['ssrf-candidate', /\b(fetch|axios\.(get|post)|requests\.(get|post)|http\.get|urlopen)\s*\(\s*(req\.(query|body|params)|request\.(args|GET|POST))/],
  ['sensitive-logging', /\b(console\.(log|info|debug)|logger\.(info|debug|log)|print)\s*\([^)]*\b(password|passwd|secret|token|authorization|cookie|card(number)?|cvv|pan)\b/i],
];

function walk(root) {
  const files = []; const sensitive = []; const stack = [root];
  while (stack.length && files.length < 20000) {
    const dir = stack.pop();
    let names; try { names = readdirSync(dir).sort(); } catch { continue; }
    for (const n of names) {
      const p = join(dir, n);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (!SKIP_DIR.has(n)) stack.push(p); continue; }
      const rel = relative(root, p).replace(/\\/g, '/');
      if (SENSITIVE.test(n) && !SENSITIVE_OK.test(n)) { sensitive.push(rel); continue; }
      const ext = extname(n).toLowerCase();
      if (!TEXT_EXT.has(ext) && n !== 'Dockerfile') continue;
      if (st.size > 1_000_000 || /\.min\.(js|css)$/.test(n)) continue;
      files.push(rel);
    }
  }
  return { files: files.sort(), sensitive: sensitive.sort() };
}

export function secretScan(repo, { includeTests = true } = {}) {
  const root = resolve(repo);
  if (!existsSync(root) || !statSync(root).isDirectory()) return { error: `repo not found or not a directory: ${repo}` };
  const { files, sensitive } = walk(root);
  const findings = [];
  for (const f of files) {
    const testy = TESTY.test(f);
    if (testy && !includeTests) continue;
    let text; try { text = readFileSync(join(root, f), 'utf8'); } catch { continue; }
    if (text.includes('\u0000')) continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((ln, i) => {
      if (ln.length > 2000) return;
      const add = (rule, cls) => findings.push({ file: f, line: i + 1, rule, classification: cls, in_test_or_fixture: testy || undefined, excerpt: redact(ln.trim()).slice(0, 160) });
      let hit = false;
      for (const [rule, re] of CONFIRMED) if (re.test(ln)) { add(rule, testy ? 'SUSPICIOUS' : 'CONFIRMED'); hit = true; break; }
      if (hit) return;
      const doc = /\.(md|txt)$/i.test(f);
      for (const [rule, re, ok] of SUSPICIOUS) { if (doc && rule !== 'hardcoded-secret') continue; const m = ln.match(re); if (m && (!ok || ok(m))) { add(rule, 'SUSPICIOUS'); return; } }   // code patterns in docs are examples
      if (testy || doc) return;   // theoretical constructs in tests/docs are noise
      for (const [rule, re] of THEORETICAL) if (re.test(ln)) { add(rule, 'THEORETICAL'); return; }
    });
  }
  const count = (c) => findings.filter((x) => x.classification === c).length;
  return {
    repo, files_scanned: files.length, sensitive_files_present: sensitive,
    counts: { CONFIRMED: count('CONFIRMED'), SUSPICIOUS: count('SUSPICIOUS'), THEORETICAL: count('THEORETICAL') },
    findings: findings.slice(0, 500),
    not_tested: ['authentication/authorization logic (needs runtime or design review)', 'dependency vulnerabilities (run the ecosystem audit tool via dcore-run, e.g. `npm audit`)', 'CSRF protection (needs runtime/framework review)', 'git history (only the working tree is scanned)'],
    notes: ['literal pattern scan, not proof of exploitability; every SUSPICIOUS/THEORETICAL item needs human confirmation', 'matches inside tests/fixtures are downgraded to SUSPICIOUS (often deliberate sample data)', 'sensitive files are listed by name only and were not read', ...(findings.length > 500 ? [`${findings.length - 500} further findings omitted`] : [])],
  };
}
