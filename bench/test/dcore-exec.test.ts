// DCore execution layer + router + analysis upgrades. Real executions run against LOCAL fixtures only (a node:http
// server on 127.0.0.1, temp git repos, data: URLs in a local browser). No external network, no real credentials:
// every secret below is an obvious sentinel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { aggregate, redact, redactDeep, gate, parseApprovals, report } from '../../skills/dcore/scripts/exec/evidence.mjs';
import { classifyCommand, classifyFailure, parseTestCounts, runCommand } from '../../skills/dcore/scripts/exec/run.mjs';
import { apiRequest, validateSchema, getPath } from '../../skills/dcore/scripts/exec/api.mjs';
import { browse, findBrowser, browserCandidates } from '../../skills/dcore/scripts/exec/browse.mjs';
import { gitOp, parseStatus } from '../../skills/dcore/scripts/exec/git.mjs';
import { verifyDeployment } from '../../skills/dcore/scripts/exec/verify.mjs';
import { releaseReadiness } from '../../skills/dcore/scripts/exec/release.mjs';
import { dcoreExplore, discoverCommands } from '../../skills/dcore/scripts/explore.mjs';
import { secretScan } from '../../skills/dcore/scripts/secscan.mjs';
import { routeTask, detectIntents } from '../../skills/dcore/scripts/route.mjs';
import { runModule, dcoreReview, parseUnifiedDiff, dcoreSec, dcoreQa, dcoreDebug, dcoreBuild, dcoreTest, MODULES, EXECUTION_MODULES } from '../../skills/dcore/scripts/modules.mjs';
import { TEST_DIR } from './helpers.ts';

const SKILL = join(TEST_DIR, '..', '..', 'skills', 'dcore');
const CLI = join(SKILL, 'scripts', 'dcore.mjs');
const SENTINEL = 'DCORE-TEST-SENTINEL-not-a-real-secret-7f3a';
const tmp = (label: string) => mkdtempSync(join(tmpdir(), `dcore-exec-${label}-`));
const NODE = JSON.stringify(process.execPath);

// ---- evidence model -----------------------------------------------------------------------------------------
test('EX-1. evidence: outcome aggregation never turns "not executed" into PASS', () => {
  assert.equal(aggregate([{ result: 'PASS' }, { result: 'FAIL' }]), 'FAIL');
  assert.equal(aggregate([{ result: 'PASS' }, { result: 'BLOCKED' }]), 'BLOCKED');
  assert.equal(aggregate([{ result: 'PASS' }, { result: 'NOT_AUTHORIZED' }]), 'BLOCKED');
  assert.equal(aggregate([{ result: 'PASS' }, { result: 'SKIPPED' }]), 'PASS');
  assert.equal(aggregate([]), 'NOT_TESTED');
  assert.equal(aggregate([{ result: 'SKIPPED' }]), 'NOT_TESTED');
  assert.equal(aggregate([{ result: 'NOT_APPLICABLE' }]), 'NOT_APPLICABLE');
  const r = report({ module: 'm', action: 'a', checks: [] });
  assert.equal(r.schema, 'dcore.evidence/1');
  assert.equal(r.result, 'NOT_TESTED');
  assert.ok(r.environment.platform && r.ended_at);
});

test('EX-2. evidence: redaction of auth headers, cookies, tokens, keys, URL credentials and known literals', () => {
  const s = redact(`Authorization: Bearer abc.def.ghi\nCookie: sid=${SENTINEL}\npassword=${SENTINEL}\n{"token":"${SENTINEL}"}\nhttps://bob:${SENTINEL}@host/x?api_key=${SENTINEL}&a=1\nAKIAABCDEFGHIJKLMNOP\neyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlc2ln\n-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----`);
  assert.ok(!s.includes(SENTINEL), s);
  assert.ok(!s.includes('abc.def.ghi') && !s.includes('AKIAABCDEFGHIJKLMNOP') && !s.includes('MIIabc') && !s.includes('eyJhbGci'));
  assert.ok(s.includes('a=1'));                                       // non-secret query params survive
  assert.equal(redact(`user typed ${SENTINEL}`, [SENTINEL]), 'user typed [REDACTED]');
  const d = redactDeep({ headers: { Authorization: 'x', 'set-cookie': 'y', accept: 'json' }, nested: [{ password: 'p4ssw0rd' }] });
  assert.equal(d.headers.Authorization, '[REDACTED]');
  assert.equal(d.headers['set-cookie'], '[REDACTED]');
  assert.equal(d.headers.accept, 'json');
  assert.equal(d.nested[0].password, '[REDACTED]');
});

test('EX-3. evidence: approval gates are explicit, per category; force-push/history-rewrite always forbidden', () => {
  assert.equal(gate('git-push', []).result, 'NOT_AUTHORIZED');
  assert.equal(gate('git-push', ['git-commit']).allowed, false);
  assert.equal(gate('git-push', 'git-commit,git-push').allowed, true);
  assert.equal(gate('force-push', ['force-push']).allowed, false);
  assert.equal(gate('history-rewrite', ['history-rewrite']).result, 'BLOCKED');
  assert.equal(gate('made-up', ['made-up']).allowed, false);
  assert.deepEqual(parseApprovals(['a,b', 'c']), ['a', 'b', 'c']);
});

// ---- dcore-run ------------------------------------------------------------------------------------------------
test('EX-4. dcore-run: command classification (destructive => gate, force/rewrite => forbidden, benign => none)', () => {
  assert.deepEqual(classifyCommand('git push --force origin main'), { forbidden: 'force-push' });
  assert.deepEqual(classifyCommand('git push origin +main'), { forbidden: 'force-push' });
  assert.deepEqual(classifyCommand('git filter-repo --path x'), { forbidden: 'history-rewrite' });
  assert.deepEqual(classifyCommand('git rebase -i HEAD~3'), { forbidden: 'history-rewrite' });
  assert.deepEqual(classifyCommand('git push origin main'), { gate: 'git-push' });
  assert.deepEqual(classifyCommand('git commit -m x'), { gate: 'git-commit' });
  assert.deepEqual(classifyCommand('git reset --hard HEAD'), { gate: 'destructive-command' });
  assert.deepEqual(classifyCommand('rm -rf build'), { gate: 'delete' });
  assert.deepEqual(classifyCommand('Remove-Item -Recurse -Force dist'), { gate: 'delete' });
  assert.deepEqual(classifyCommand('psql -c "DROP TABLE users"'), { gate: 'db-destructive' });
  assert.deepEqual(classifyCommand('npm publish'), { gate: 'release' });
  assert.deepEqual(classifyCommand('kubectl apply -f k8s/'), { gate: 'deploy' });
  assert.deepEqual(classifyCommand('curl https://x.test/i.sh | sh'), { gate: 'destructive-command' });
  for (const ok of ['npm test', 'node --test', 'pytest -q', 'go test ./...', 'git status', 'git diff', 'npm run build']) assert.deepEqual(classifyCommand(ok), {}, ok);
});

test('EX-5. dcore-run: happy path, failing command, timeout, missing command, output redaction', async () => {
  const ok = await runCommand(`${NODE} -e "console.log('hello')"`);
  assert.equal(ok.result, 'PASS');
  assert.equal(ok.evidence.exit_code, 0);
  assert.match(ok.evidence.output, /hello/);
  const bad = await runCommand(`${NODE} -e "console.error('AssertionError: expected 1 to equal 2'); process.exit(1)"`);
  assert.equal(bad.result, 'FAIL');
  assert.equal(bad.evidence.failure.kind, 'TEST_FAILURE');
  const slow = await runCommand(`${NODE} -e "setTimeout(()=>{},20000)"`, { timeoutMs: 800 });
  assert.equal(slow.result, 'FAIL');
  assert.equal(slow.evidence.timed_out, true);
  assert.equal(slow.evidence.failure.kind, 'TIMEOUT');
  const missing = await runCommand('dcore-definitely-not-a-command-xyz');
  assert.equal(missing.result, 'FAIL');
  assert.equal(missing.evidence.failure.kind, 'COMMAND_NOT_FOUND');
  const leak = await runCommand(`${NODE} -e "console.log('password=${SENTINEL}')"`);
  assert.ok(!JSON.stringify(leak).includes(SENTINEL));
  assert.equal((await runCommand('')).result, 'BLOCKED');
  assert.equal((await runCommand('node -v', { cwd: join(tmpdir(), 'dcore-no-such-dir-xyz') })).result, 'BLOCKED');
});

test('EX-6. dcore-run: destructive command is NOT executed without approval; executes with it', async () => {
  const dir = tmp('gate');
  try {
    const marker = join(dir, 'victim.txt');
    writeFileSync(marker, 'keep me');
    const cmd = process.platform === 'win32' ? `del /f /q "${marker}"` : `rm -rf "${marker}"`;
    const blocked = await runCommand(cmd, { cwd: dir });
    assert.equal(blocked.result, 'BLOCKED');
    assert.equal(blocked.evidence.approval, 'NOT_AUTHORIZED');
    assert.ok(existsSync(marker), 'file must still exist');
    const forced = await runCommand('git push --force origin main', { cwd: dir, approvals: ['git-push', 'force-push'] });
    assert.equal(forced.result, 'BLOCKED');
    const allowed = await runCommand(cmd, { cwd: dir, approvals: ['delete'] });
    assert.equal(allowed.result, 'PASS');
    assert.ok(!existsSync(marker));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('EX-7. dcore-run: test-count parsing and failure classification are evidence-based', () => {
  assert.deepEqual(parseTestCounts('ℹ tests 694\nℹ pass 694\nℹ fail 0'), { runner: 'node:test', tests: 694, pass: 694, fail: 0 });
  assert.deepEqual(parseTestCounts('Tests:       2 failed, 10 passed, 12 total'), { runner: 'jest/vitest', tests: 12, pass: 10, fail: 2 });
  assert.equal(parseTestCounts('==== 3 failed, 7 passed in 1.2s ====').fail, 3);
  assert.equal(parseTestCounts('nothing here'), null);
  assert.equal(classifyFailure({ exit_code: 2, output: 'src/a.ts(3,1): error TS2322: Type' }).kind, 'TYPE_ERROR');
  assert.equal(classifyFailure({ exit_code: 1, output: 'connect ECONNREFUSED 127.0.0.1:5432' }).kind, 'NETWORK');
  assert.equal(classifyFailure({ exit_code: 0, output: '' }), null);
});

// ---- dcore-api ------------------------------------------------------------------------------------------------
function server(handler: (req: any, res: any, body: string) => void): Promise<{ url: string; close: () => void }> {
  return new Promise((ok) => {
    const s = createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => handler(req, res, b)); });
    s.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${(s.address() as any).port}`, close: () => s.close() }));
  });
}

test('EX-8. dcore-api: real request with status/json/schema/header/latency assertions; failures reported', async () => {
  let hits = 0;
  const srv = await server((req, res) => {
    hits++;
    if (req.url === '/flaky' && hits % 2 === 1) { res.writeHead(503); res.end('busy'); return; }
    if (req.url === '/slow') { setTimeout(() => { res.writeHead(200); res.end('late'); }, 1500); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `sid=${SENTINEL}` });
    res.end(JSON.stringify({ status: 'ok', items: [{ id: 1 }, { id: 2 }], echo: req.headers.authorization ?? null }));
  });
  try {
    const r = await apiRequest({ url: `${srv.url}/health`, expect: { status: 200, json: { status: 'ok', 'items[1].id': 2 }, headers: { 'content-type': 'json' }, schema: { type: 'object', required: ['status', 'items'], properties: { items: { type: 'array', items: { type: 'object', required: ['id'] } } } }, maxMs: 5000 } });
    assert.equal(r.result, 'PASS', JSON.stringify(r.checks));
    assert.equal(r.evidence.headers['set-cookie'], '[REDACTED]');
    assert.ok(!JSON.stringify(r).includes(SENTINEL));
    const wrong = await apiRequest({ url: `${srv.url}/health`, expect: { status: 201, json: { status: 'down' } } });
    assert.equal(wrong.result, 'FAIL');
    assert.equal(wrong.checks.filter((c: any) => c.result === 'FAIL').length, 2);
    const flaky = await apiRequest({ url: `${srv.url}/flaky`, retries: 2, expect: { status: 200 } });
    assert.equal(flaky.result, 'PASS');
    assert.ok(flaky.evidence.attempts.length >= 2);
    const slow = await apiRequest({ url: `${srv.url}/slow`, timeoutMs: 300 });
    assert.equal(slow.result, 'FAIL');
    assert.match(slow.checks[0].title, /TIMEOUT/);
    const rep = await apiRequest({ url: `${srv.url}/health`, repeat: 5 });
    assert.equal(rep.evidence.latency.samples, 5);
  } finally { srv.close(); }
});

test('EX-9. dcore-api: credentials from env only and redacted; non-local writes need approval; refused network', async () => {
  const srv = await server((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ echo: req.headers.authorization ?? null, method: req.method })); });
  try {
    process.env.DCORE_TEST_TOKEN = SENTINEL;
    const r = await apiRequest({ url: `${srv.url}/me`, authEnv: 'DCORE_TEST_TOKEN' });
    assert.equal(r.result, 'PASS');
    assert.ok(!JSON.stringify(r).includes(SENTINEL), 'token must not appear even when the server echoes it');
    const unset = await apiRequest({ url: `${srv.url}/me`, authEnv: 'DCORE_TEST_TOKEN_UNSET_XYZ' });
    assert.equal(unset.result, 'BLOCKED');
    const localPost = await apiRequest({ method: 'POST', url: `${srv.url}/items`, json: { a: 1 } });
    assert.equal(localPost.result, 'PASS');                                    // localhost writes are allowed
    const remotePost = await apiRequest({ method: 'DELETE', url: 'https://example.invalid/items/1' });
    assert.equal(remotePost.result, 'BLOCKED');
    assert.equal(remotePost.evidence.approval, 'NOT_AUTHORIZED');
    assert.equal((await apiRequest({ url: 'file:///etc/passwd' })).result, 'BLOCKED');
    assert.equal((await apiRequest({ url: 'not a url' })).result, 'BLOCKED');
    const refused = await apiRequest({ url: 'http://127.0.0.1:9/', timeoutMs: 2000 });
    assert.equal(refused.result, 'FAIL');
  } finally { srv.close(); delete process.env.DCORE_TEST_TOKEN; }
  assert.deepEqual(validateSchema({ a: 'x' }, { type: 'object', required: ['a', 'b'], properties: { a: { type: 'number' } } }), ['$.b: required', '$.a: expected number, got string']);
  assert.equal(getPath({ a: [{ b: 3 }] }, 'a[0].b'), 3);
});

// ---- dcore-browse ---------------------------------------------------------------------------------------------
test('EX-10. dcore-browse: unavailable / failing browser => BLOCKED, never PASS', async () => {
  assert.equal(findBrowser('linux', { DCORE_BROWSER: join(tmpdir(), 'no-such-browser-xyz') }) === null || process.platform === 'linux', true);
  assert.ok(browserCandidates('win32', { PROGRAMFILES: 'C:\\PF' }).some((p: string) => p.includes('chrome.exe')));
  const out = tmp('nobrowser');
  try {
    const r = await browse([{ goto: 'data:text/html,<p>x</p>' }], { browser: join(out, 'no-such-browser.exe'), outDir: out });
    assert.equal(r.result, 'BLOCKED');
    assert.ok(r.limitations.some((l: string) => /browser session failed/.test(l)));
    assert.equal((await browse([], { outDir: out })).result, 'BLOCKED');
  } finally { rmSync(out, { recursive: true, force: true }); }
});

const HAVE_BROWSER = !!findBrowser();
test('EX-11. dcore-browse: real browser login-style flow, assertions, console errors, a11y, secrets redacted', { skip: HAVE_BROWSER ? false : 'no Chromium-family browser on this machine' }, async () => {
  const html = `<html lang="en"><head><title>Login</title></head><body><h1>Sign in</h1><label for="u">Username</label><input id="u" name="u"><label>Password <input type="password" id="p"></label><button id="go" onclick="document.querySelector('#out').innerText='Welcome '+document.querySelector('#u').value; console.error('dcore-test-console-error')">Sign in</button><div id="out"></div><input id="nolabel"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="5" height="5"></body></html>`;
  const out = tmp('browse');
  process.env.DCORE_TEST_PASS = SENTINEL;
  try {
    const r = await browse([
      { goto: 'data:text/html,' + encodeURIComponent(html) },
      { fill: { label: 'Username', value: 'alice' } },
      { fill: { label: 'Password', valueEnv: 'DCORE_TEST_PASS' } },
      { click: { text: 'Sign in', role: 'button' } },
      { waitFor: { text: 'Welcome alice' } },
      { assertText: 'Welcome alice' },
      { assertNoText: 'Access denied' },
      { assertTitle: 'Login' },
      { assertCount: { selector: 'input', min: 3 } },
      { a11y: true },
      { inspect: {} },
      { screenshot: 'done' },
    ], { outDir: out });
    const steps = r.evidence.steps;
    assert.ok(steps.slice(0, 9).every((s: any) => s.result === 'PASS'), JSON.stringify(steps));
    assert.equal(steps[9].result, 'FAIL');                                      // a11y: unlabeled input + img without alt
    assert.ok(r.evidence.a11y[0].form_labels.count >= 1 && r.evidence.a11y[0].img_alt.count >= 1);
    assert.ok(r.evidence.console_errors.some((e: string) => e.includes('dcore-test-console-error')));
    assert.equal(r.checks.find((c: any) => c.id === 'console-errors').result, 'FAIL');
    assert.ok(existsSync(r.evidence.screenshots[0]));
    assert.ok(!JSON.stringify(r).includes(SENTINEL), 'password must never appear in evidence');
    assert.ok(!JSON.stringify(r.evidence.inspections).includes('alice'), 'inspection never captures input values');
    // a failing action stops the run, screenshots the failure, and SKIPS the rest
    const f = await browse([{ goto: 'data:text/html,<p>hi</p>' }, { click: { text: 'Nope' }, timeoutMs: 600 }, { assertText: 'hi' }], { outDir: out });
    assert.equal(f.result, 'FAIL');
    assert.deepEqual(f.evidence.steps.map((s: any) => s.result), ['PASS', 'FAIL', 'SKIPPED']);
    assert.ok(f.evidence.screenshots.some((p: string) => /failure-step-2/.test(p)));
  } finally { delete process.env.DCORE_TEST_PASS; rmSync(out, { recursive: true, force: true }); }
});

// ---- dcore-git ------------------------------------------------------------------------------------------------
function gitRepo(): string {
  const d = tmp('git');
  const g = (...a: string[]) => execFileSync('git', a, { cwd: d, stdio: 'pipe' });
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 'test@example.invalid'); g('config', 'user.name', 'DCore Test'); g('config', 'commit.gpgsign', 'false');
  writeFileSync(join(d, 'a.txt'), 'one\n'); g('add', 'a.txt'); g('commit', '-q', '-m', 'init');
  return d;
}

test('EX-12. dcore-git: status/diff/log; commit/push gated; push verified against the remote; force refused', async () => {
  const d = gitRepo();
  const bare = tmp('bare');
  try {
    execFileSync('git', ['init', '-q', '--bare', bare]);
    execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: d });
    writeFileSync(join(d, 'a.txt'), 'one\ntwo\n');
    const st = await gitOp('status', { repo: d });
    assert.equal(st.result, 'PASS');
    assert.equal(st.evidence.clean, false);
    assert.ok(st.evidence.unstaged.some((x: string) => x.includes('a.txt')));
    const df = await gitOp('diff', { repo: d });
    assert.match(df.evidence.patch, /\+two/);
    assert.equal((await gitOp('log', { repo: d })).evidence.commits[0].subject, 'init');
    const noAuth = await gitOp('commit', { repo: d, message: 'm', files: ['a.txt'] });
    assert.equal(noAuth.evidence.approval, 'NOT_AUTHORIZED');
    assert.equal((await gitOp('commit', { repo: d, message: 'm', approvals: ['git-commit'] })).result, 'BLOCKED');   // no --files
    const c = await gitOp('commit', { repo: d, message: 'second', files: ['a.txt'], approvals: ['git-commit'] });
    assert.equal(c.result, 'PASS');
    assert.equal((await gitOp('push', { repo: d })).evidence.approval, 'NOT_AUTHORIZED');
    assert.equal((await gitOp('push', { repo: d, args: ['--force'], approvals: ['git-push'] })).result, 'BLOCKED');
    const p = await gitOp('push', { repo: d, approvals: ['git-push'] });
    assert.equal(p.result, 'PASS', JSON.stringify(p.checks));
    assert.equal(p.evidence.remote_head, p.evidence.local_head);
    const outside = tmp('notrepo');
    assert.equal((await gitOp('status', { repo: outside })).result, 'BLOCKED');
    rmSync(outside, { recursive: true, force: true });
    assert.equal(parseStatus('# branch.head main\n# branch.ab +2 -1\n? new.txt\n').ahead, 2);
  } finally { rmSync(d, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

// ---- release / verify ----------------------------------------------------------------------------------------
test('EX-13. dcore-release: executed gates => READY/BLOCKED; publish needs approval; push VERIFIED by remote HEAD', async () => {
  const d = gitRepo();
  const bare = tmp('rbare');
  try {
    execFileSync('git', ['init', '-q', '--bare', bare]);
    execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: d });
    writeFileSync(join(d, 'README.md'), '# x\n');
    execFileSync('git', ['add', 'README.md'], { cwd: d }); execFileSync('git', ['commit', '-q', '-m', 'docs'], { cwd: d });
    const failing = await releaseReadiness({ repo: d, testCmd: `${NODE} -e "process.exit(1)"` });
    assert.equal(failing.verdict, 'BLOCKED');
    assert.equal(failing.checks.find((c: any) => c.id === 'tests').result, 'FAIL');
    const ready = await releaseReadiness({ repo: d, testCmd: `${NODE} -e "process.exit(0)"` });
    assert.equal(ready.verdict, 'READY', JSON.stringify(ready.checks));
    const notAuth = await releaseReadiness({ repo: d, testCmd: `${NODE} -e "0"`, push: true });
    assert.equal(notAuth.verdict, 'NOT_AUTHORIZED');
    const pushed = await releaseReadiness({ repo: d, testCmd: `${NODE} -e "0"`, push: true, approvals: ['git-push'] });
    assert.equal(pushed.verdict, 'VERIFIED', JSON.stringify(pushed.actions));
    writeFileSync(join(d, 'leak.js'), `const k = "AKIAABCDEFGHIJKLMNOP";\n`);
    execFileSync('git', ['add', 'leak.js'], { cwd: d }); execFileSync('git', ['commit', '-q', '-m', 'oops'], { cwd: d });
    const leaked = await releaseReadiness({ repo: d, testCmd: `${NODE} -e "0"` });
    assert.equal(leaked.checks.find((c: any) => c.id === 'secrets').result, 'FAIL');
    assert.equal(leaked.verdict, 'BLOCKED');
  } finally { rmSync(d, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test('EX-14. dcore-verify: VERIFIED on healthy, FAILED (+rollback signal, no rollback) on unhealthy, BLOCKED on bad input', async () => {
  let healthy = true;
  const srv = await server((req, res) => { if (req.url === '/health') { res.writeHead(healthy ? 200 : 500); res.end(healthy ? 'ok' : 'down'); return; } res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>Sign in</h1>'); });
  try {
    const ok = await verifyDeployment({ url: srv.url + '/', health: ['/health'], expectText: 'Sign in' });
    assert.equal(ok.verdict, 'VERIFIED', JSON.stringify(ok.checks));
    healthy = false;
    const bad = await verifyDeployment({ url: srv.url + '/', health: ['/health'] });
    assert.equal(bad.verdict, 'FAILED');
    assert.match(bad.rollback_signal, /does not roll back/);
    assert.equal((await verifyDeployment({ url: 'nope' })).verdict, 'BLOCKED');
  } finally { srv.close(); }
});

// ---- analysis: explore / secret scan / review / qa / debug / build / test --------------------------------------
function fixtureRepo(): string {
  const d = tmp('repo');
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'fx', version: '1.0.0', main: 'src/index.js', scripts: { test: 'node --test', lint: 'eslint .', build: 'tsc -p .', dev: 'node src/index.js' }, dependencies: { express: '^4', pg: '^8', stripe: '^1' }, devDependencies: { jest: '^29' } }));
  writeFileSync(join(d, 'package-lock.json'), '{}');
  writeFileSync(join(d, '.env'), `DB_PASSWORD=${SENTINEL}\n`);
  mkdirSync(join(d, 'src')); mkdirSync(join(d, 'test')); mkdirSync(join(d, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(d, 'src', 'index.js'), `const key = "AKIAABCDEFGHIJKLMNOP";\nconst password = "hunter2hunter2";\nconst dbPass = process.env.DB_PASSWORD;\nel.innerHTML = userInput;\n`);
  writeFileSync(join(d, 'test', 'index.test.js'), `const key = "AKIAABCDEFGHIJKLMNOP";\n`);
  writeFileSync(join(d, '.github', 'workflows', 'ci.yml'), 'on: push\n');
  return d;
}

test('EX-15. dcore-explore: commands, frameworks, integrations, CI from real files; secret files by name only', () => {
  const d = fixtureRepo();
  try {
    const x = dcoreExplore('', { repo: d });
    assert.ok(x.project_types.includes('Node.js package'));
    assert.deepEqual(x.commands.filter((c: any) => c.kind === 'test').map((c: any) => c.command), ['npm run test']);
    assert.ok(x.commands.some((c: any) => c.kind === 'lint') && x.commands.some((c: any) => c.kind === 'build'));
    assert.ok(x.frameworks.includes('Express') && x.test_frameworks.includes('Jest'));
    assert.ok(x.integrations.includes('PostgreSQL') && x.integrations.includes('Stripe'));
    assert.deepEqual(x.ci, ['.github/workflows/ci.yml']);
    assert.ok(x.entry_points.some((e: string) => e.includes('src/index.js')));
    assert.deepEqual(x.sensitive_files_present, ['.env']);
    assert.ok(!JSON.stringify(x).includes(SENTINEL), '.env must not be read');
    assert.deepEqual(dcoreExplore('', { repo: d }), x);                           // deterministic
    assert.ok(dcoreExplore('', {}).error);
    assert.ok(discoverCommands(join(d, 'missing')).length === 0);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('EX-16. dcore-sec --repo: CONFIRMED vs SUSPICIOUS vs THEORETICAL; placeholders and secret files not flagged/read', () => {
  const d = fixtureRepo();
  try {
    const s = secretScan(d);
    const at = (file: string, line: number) => s.findings.find((f: any) => f.file === file && f.line === line);
    assert.equal(at('src/index.js', 1).classification, 'CONFIRMED');
    assert.equal(at('src/index.js', 2).classification, 'SUSPICIOUS');
    assert.equal(at('src/index.js', 3), undefined);                               // process.env reference is not a secret
    assert.equal(at('src/index.js', 4).classification, 'THEORETICAL');
    assert.equal(at('test/index.test.js', 1).classification, 'SUSPICIOUS');     // fixtures are downgraded
    assert.deepEqual(s.sensitive_files_present, ['.env']);
    assert.ok(!JSON.stringify(s).includes(SENTINEL) && !JSON.stringify(s).includes('AKIAABCDEFGHIJKLMNOP') && !JSON.stringify(s).includes('hunter2hunter2'));
    const r = dcoreSec('Review the release', { repo: d });
    assert.match(r.residual_risk, /^HIGH/);
    assert.ok(r.findings.some((f: string) => f.startsWith('CONFIRMED')));
    assert.ok(Array.isArray(r.repo_scan.not_tested) && r.repo_scan.not_tested.length > 0);
    assert.equal(dcoreSec('x').repo_scan, undefined);                             // text mode unchanged
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('EX-17. dcore-review diff mode: only ADDED lines are reviewed, with file and new-file line numbers', () => {
  const diff = ['diff --git a/src/x.js b/src/x.js', 'index 1..2 100644', '--- a/src/x.js', '+++ b/src/x.js', '@@ -10,3 +10,4 @@ function f() {', ' const a = 1;', '-const old = eval(legacy);', '+const b = eval(input);', '+if (a == b) {}', ' return a;'].join('\n');
  const p = parseUnifiedDiff(diff);
  assert.deepEqual(p.added.map((a: any) => [a.file, a.line]), [['src/x.js', 11], ['src/x.js', 12]]);
  const r = dcoreReview(diff);
  assert.equal(r.mode, 'diff (added lines only)');
  assert.deepEqual(r.files_changed, ['src/x.js']);
  const ev = r.findings.find((f: any) => /dynamic code/.test(f.message));
  assert.equal(ev.file, 'src/x.js'); assert.equal(ev.line, 11);
  assert.equal(r.findings.filter((f: any) => /dynamic code/.test(f.message)).length, 1);   // the removed eval is ignored
  assert.equal(dcoreReview('const p = eval(x)').mode, undefined);                              // plain code mode unchanged
});

test('EX-18. qa/debug/build/test scaffolds: execution surfaces, evidence discipline, repo-grounded conventions', () => {
  assert.ok(dcoreQa('Test the login page at https://x.test/login').execute_with.some((s: string) => s.startsWith('web UI -> dcore-browse')));
  assert.ok(dcoreQa('Check the /api/orders endpoint returns 200').execute_with.some((s: string) => s.startsWith('API -> dcore-api')));
  assert.deepEqual(dcoreQa('Verify login.').result_vocabulary, ['PASS', 'FAIL', 'BLOCKED', 'NOT_APPLICABLE', 'NOT_TESTED']);
  const dbg = dcoreDebug('Checkout times out sometimes.');
  assert.equal(dbg.evidence_status.confirmed_root_cause, null);
  assert.ok(dbg.loop.length >= 6);
  const d = fixtureRepo();
  try {
    assert.equal(dcoreTest('regression for x', { repo: d }).test_command, 'npm run test');
    assert.ok(dcoreBuild('add y', { repo: d }).conventions.test_frameworks.includes('Jest'));
    assert.match(String(dcoreBuild('add y').conventions), /--repo/);
  } finally { rmSync(d, { recursive: true, force: true }); }
  assert.ok(runModule('dcore-run', 'x').execution_module);                     // execution modules are CLI-only
});

// ---- router ---------------------------------------------------------------------------------------------------
test('EX-19. router: plain-English tasks map to the right workflow; executes vs reasons; approvals; deterministic', () => {
  const web = routeTask('test this page end to end - https://app.example.test/admin/tokens , login using alice');
  assert.equal(web.intent, 'qa'); assert.equal(web.workflow_key, 'qa_web');
  assert.ok(web.executes.includes('dcore-browse') && web.surfaces.needs_login);
  assert.ok(web.notes.some((n: string) => /valueEnv/.test(n)));
  const dbg = routeTask('investigate and fix why checkout sometimes times out');
  assert.equal(dbg.intent, 'debug');
  assert.deepEqual(dbg.workflow.map((w: any) => w.capability).slice(0, 4), ['dcore-explore', 'dcore-debug', 'dcore-run', 'dcore-impact']);
  assert.equal(routeTask('implement a CSV export feature').intent, 'build');
  assert.equal(routeTask('review this change').workflow[0].capability, 'dcore-git');
  const rel = routeTask('prepare and verify this release');
  assert.equal(rel.intent, 'release');
  assert.ok(rel.approvals_possibly_required.includes('git-push'));
  assert.ok(rel.workflow.some((w: any) => w.gate));
  assert.equal(routeTask('check the /api/v1/orders endpoint at https://api.example.test/api/v1/orders').workflow_key, 'qa_api');
  assert.equal(routeTask('run the unit tests').workflow_key, 'qa_repo');
  assert.ok(routeTask('deploy to production').approvals_possibly_required.includes('production'));
  assert.equal(routeTask('what will renaming parseOptions affect').intent, 'impact');
  assert.equal(routeTask('').intent, 'unknown');
  assert.ok(detectIntents('the site is slow').includes('perf'));
  assert.deepEqual(routeTask('fix the flaky test'), routeTask('fix the flaky test'));
});

// ---- CLI + static boundaries ----------------------------------------------------------------------------------
test('EX-20. CLI: router for free text; exit codes 0/1/3; unknown module diagnostic; JSON evidence', () => {
  const run = (...a: string[]) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });
  const route = run('fix the login bug', '--json');
  assert.equal(route.status, 0);
  assert.equal(JSON.parse(route.stdout).intent, 'debug');
  const blocked = run('dcore-run', 'git push --force origin main', '--json');
  assert.equal(blocked.status, 3);
  assert.equal(JSON.parse(blocked.stdout).result, 'BLOCKED');
  const pass = run('dcore-run', `${process.execPath.includes(' ') ? `"${process.execPath}"` : process.execPath} -e "0"`, '--json');
  assert.equal(pass.status, 0, pass.stdout + pass.stderr);
  const fail = run('dcore-run', `${process.execPath.includes(' ') ? `"${process.execPath}"` : process.execPath} -e "process.exit(4)"`);
  assert.equal(fail.status, 1);
  assert.match(fail.stdout, /\[FAIL\] exit code 4/);
  const unknown = run('dcore-nope', 'x');
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown module/);
});

test('EX-21. static boundary: reasoning/analysis code never imports subprocess/network; exec loads only on demand', () => {
  const read = (p: string) => readFileSync(join(SKILL, 'scripts', p), 'utf8');
  for (const f of ['modules.mjs', 'explore.mjs', 'secscan.mjs', 'route.mjs', 'coverage.mjs', 'exec/evidence.mjs']) {
    const src = read(f);
    assert.ok(!/(import[^;]*from|require\s*\(\s*)['"]node:(child_process|http|https|net|dgram|tls|http2)['"]/.test(src), `${f} imports exec/network`);
    assert.ok(!/\bfetch\s*\(|new WebSocket\s*\(/.test(src), `${f} calls the network`);
    assert.ok(!/from\s+['"]\.\/exec\/(run|api|browse|git|verify|release)\.mjs['"]/.test(src), `${f} statically imports the execution layer`);
  }
  assert.ok(!/^import[^;]*['"]\.\/exec\//m.test(read('dcore.mjs')), 'dcore.mjs must load exec modules dynamically');
  for (const id of EXECUTION_MODULES) assert.ok(existsSync(join(SKILL, 'modules', `${id}.md`)), id);
  assert.deepEqual(MODULES.filter((m: any) => m.kind === 'execution').map((m: any) => m.module_id).sort(), ['dcore-api', 'dcore-browse', 'dcore-git', 'dcore-run', 'dcore-verify']);
  // no execution file reads ~/.claude or credential stores (the in-memory CDP calls Network.getAllCookies / setCookies /
  // clearBrowserCookies on the throwaway test browser, used to simulate an expired session, are not a credential store)
  for (const f of ['exec/run.mjs', 'exec/api.mjs', 'exec/browse.mjs', 'exec/git.mjs', 'exec/verify.mjs', 'exec/release.mjs']) assert.ok(!/readFileSync\s*\([^)]*\.claude|\.credentials|(?<!Network\.(getAll|set|clearBrowser))Cookies['"]/i.test(read(f)), f);
});

// ---- dogfood regressions (each failed before its fix) ----------------------------------------------------------
test('REG-1. installer removes files a previous DCore install left behind, never user files (stale upgrade)', async () => {
  const { install } = await import('../../skills/dcore/scripts/install.mjs');
  const dir = tmp('upgrade');
  try {
    const target = join(dir, 'skills');
    const r1 = install({ target });
    assert.equal(r1.ok, true);
    const record = join(target, 'dcore', '.dcore-install.json');
    assert.ok(existsSync(record), 'install writes a record of the files it installed');
    // simulate a previous version that installed a file the current version no longer ships
    const rec = JSON.parse(readFileSync(record, 'utf8'));
    rec.files.push('references/OLD-NAME.md');
    writeFileSync(record, JSON.stringify(rec));
    writeFileSync(join(target, 'dcore', 'references', 'OLD-NAME.md'), 'stale');
    writeFileSync(join(target, 'dcore', 'references', 'my-notes.md'), 'user file');   // never installed by DCore
    const r2 = install({ target });
    assert.deepEqual(r2.removed, ['references/OLD-NAME.md']);
    assert.ok(!existsSync(join(target, 'dcore', 'references', 'OLD-NAME.md')));
    assert.ok(existsSync(join(target, 'dcore', 'references', 'my-notes.md')), 'user files are kept');
    assert.ok(r2.unmanaged.includes('references/my-notes.md'), 'unmanaged files are reported, not deleted');
    const dry = install({ target, dryRun: true });
    assert.deepEqual(dry.removed, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('REG-2. malformed --steps/--spec JSON fails closed (BLOCKED, exit 3), never a stack trace', () => {
  for (const args of [['dcore-browse', '--steps', '{bad json'], ['dcore-api', '--spec', '{bad'], ['dcore-api', '--url', 'http://127.0.0.1:9', '--schema', '[oops']]) {
    const r = spawnSync(process.execPath, [CLI, ...args, '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 3, `${args.join(' ')}: ${r.stderr}`);
    assert.ok(!/at .*\.mjs:\d+|SyntaxError/.test(r.stderr), r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.result, 'BLOCKED');
    assert.ok(out.limitations.some((l: string) => /not valid JSON/.test(l)));
  }
});

test('REG-3. every module reference has a real command in its usage text and a non-empty example', () => {
  for (const m of MODULES) {
    const md = readFileSync(join(SKILL, 'modules', `${m.module_id}.md`), 'utf8');
    assert.ok(!/^Run\s{2,}\(|^Run \(/m.test(md), `${m.module_id}: blank command in "Run (…)"`);
    const ex = md.split(/^## Example\s*$/m)[1]?.split(/^## /m)[0] ?? '';
    assert.ok(/```[\s\S]*?node scripts\/dcore\.mjs[\s\S]*?```/.test(ex) || m.status !== 'IMPLEMENTED', `${m.module_id}: Example has no runnable command`);
  }
});

test('FEAT-1. --report <file.md> writes a redacted Markdown evidence report; stdout and exit code unchanged', () => {
  const dir = tmp('report');
  try {
    const nodeCmd = process.execPath.includes(' ') ? `"${process.execPath}"` : process.execPath;
    const cmd = `${nodeCmd} -e "console.log('token=${SENTINEL}'); process.exit(2)"`;
    const file = join(dir, 'nested', 'run-report.md');
    const plain = spawnSync(process.execPath, [CLI, 'dcore-run', cmd, '--json'], { encoding: 'utf8' });
    const withReport = spawnSync(process.execPath, [CLI, 'dcore-run', cmd, '--json', '--report', file], { encoding: 'utf8' });
    assert.equal(withReport.status, plain.status);
    assert.equal(withReport.status, 1);
    const strip = (s: string) => { const j = JSON.parse(s); delete j.started_at; delete j.ended_at; delete j.evidence.duration_ms; return j; };
    assert.deepEqual(strip(withReport.stdout), strip(plain.stdout));
    assert.ok(existsSync(file), 'report file written (parent dirs created)');
    const md = readFileSync(file, 'utf8');
    assert.match(md, /^# DCore · dcore-run — FAIL/);
    assert.match(md, /\[FAIL\] exit code 2/);
    assert.ok(!md.includes(SENTINEL), 'report must contain only redacted evidence');
    // blocked runs are reported too (could-not-execute is evidence)
    const b = join(dir, 'blocked.md');
    spawnSync(process.execPath, [CLI, 'dcore-run', 'git push --force origin main', '--report', b], { encoding: 'utf8' });
    assert.match(readFileSync(b, 'utf8'), /— BLOCKED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('REG-4. dcore-review: strict equality (=== / !==) is never reported as loose equality (false positive)', () => {
  const r = dcoreReview('if (a === b) {}\nif (c !== d) {}\nconst ok = x >= 1 && y <= 2;\nif (e == f) {}\nif (g != h) {}');
  const loose = r.findings.filter((f: any) => /loose equality/.test(f.message)).map((f: any) => f.line);
  assert.deepEqual(loose, [4, 5]);
});

test('REG-5. dcore-sec scan: no false positives for .eval() methods, the word SELECT, or code examples in docs', () => {
  const d = tmp('fp');
  try {
    mkdirSync(join(d, 'src'));
    writeFileSync(join(d, 'src', 'a.js'), "const v = await session.eval(expr);\nif (el.tagName !== 'SELECT') x = `${y}`;\nconst q = `SELECT * FROM users WHERE id = ${id}`; db.query(q);\nconst r = eval(userInput);\n");
    writeFileSync(join(d, 'README.md'), "Example: `eval(x)` is flagged by the reviewer.\n");
    const s = secretScan(d);
    const rules = s.findings.map((f: any) => `${f.file}:${f.line}:${f.rule}`);
    assert.ok(!rules.includes('src/a.js:1:dynamic-eval'), 'method named eval is not dynamic eval');
    assert.ok(!rules.includes('src/a.js:2:sql-string-concat'), 'the word SELECT alone is not SQL');
    assert.ok(rules.includes('src/a.js:3:sql-string-concat'), 'real interpolated SQL is still found');
    assert.ok(rules.includes('src/a.js:4:dynamic-eval'), 'real eval is still found');
    assert.ok(!rules.some((r: string) => r.startsWith('README.md')), 'code-pattern rules do not fire on docs');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('API-1. legacy dk* exports remain as deprecated aliases of the dcore* functions (no breaking change)', async () => {
  const m: any = await import('../../skills/dcore/scripts/modules.mjs');
  for (const n of ['Frame', 'Spec', 'Plan', 'Review', 'Qa']) assert.equal(m[`dk${n}`], m[`dcore${n}`], n);
});
