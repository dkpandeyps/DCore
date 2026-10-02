// dcore-release (executable gates) — runs real readiness gates and reports one verdict:
//   READY | BLOCKED | NOT_AUTHORIZED | FAILED | VERIFIED
// Gates: clean tree, up to date with upstream, tests (discovered or --test-cmd), repository secret scan, version
// consistency, docs present. Publishing actions (push / deploy) run only with an explicit approval and are verified
// with evidence (remote HEAD == local HEAD; dcore-verify against --verify-url).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { report, check, gate } from './evidence.mjs';
import { gitOp } from './git.mjs';
import { runCommand } from './run.mjs';
import { discoverCommands } from '../explore.mjs';
import { secretScan } from '../secscan.mjs';

function versionGate(root) {
  const pj = existsSync(join(root, 'package.json')) ? (() => { try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); } catch { return null; } })() : null;
  const clName = ['CHANGELOG.md', 'CHANGES.md', 'HISTORY.md'].find((n) => existsSync(join(root, n)));
  if (!pj?.version || !clName) return check('version', `version consistency not applicable (${!pj?.version ? 'no package.json version' : 'no CHANGELOG'})`, 'NOT_APPLICABLE');
  const top = readFileSync(join(root, clName), 'utf8').match(/^#+\s*\[?v?(\d+\.\d+\.\d+[^\]\s]*)/m)?.[1] ?? null;
  return check('version', `package.json ${pj.version} vs ${clName} ${top ?? '(no version heading)'}`, top === pj.version ? 'PASS' : 'FAIL', { expected: pj.version, actual: top });
}

export async function releaseReadiness(opts = {}) {
  const started_at = new Date().toISOString();
  const root = resolve(opts.repo ?? '.');
  const checks = []; const evidence = {};
  const st = await gitOp('status', { repo: root });
  if (st.result === 'BLOCKED') checks.push(check('git', st.limitations.join('; '), 'BLOCKED'));
  else {
    evidence.git = { branch: st.evidence.branch, head: st.evidence.head, upstream: st.evidence.upstream, ahead: st.evidence.ahead, behind: st.evidence.behind };
    const dirty = [...st.evidence.staged, ...st.evidence.unstaged, ...st.evidence.untracked];
    checks.push(check('clean-tree', st.evidence.clean ? 'working tree clean' : `${dirty.length} uncommitted change(s)`, st.evidence.clean || opts.allowDirty ? 'PASS' : 'FAIL', { actual: dirty.slice(0, 20) }));
    checks.push(check('upstream', st.evidence.upstream ? `ahead ${st.evidence.ahead}, behind ${st.evidence.behind} vs ${st.evidence.upstream}` : 'no upstream configured', st.evidence.behind > 0 ? 'FAIL' : st.evidence.upstream ? 'PASS' : 'NOT_APPLICABLE'));
  }
  const testCmd = opts.testCmd ?? discoverCommands(root).find((c) => c.kind === 'test');
  if (!testCmd) checks.push(check('tests', 'no test command discovered (pass --test-cmd)', 'NOT_TESTED'));
  else {
    const cmd = typeof testCmd === 'string' ? testCmd : testCmd.command;
    const cwd = typeof testCmd === 'string' ? root : join(root, testCmd.cwd);
    const t = await runCommand(cmd, { cwd, timeoutMs: opts.testTimeoutMs ?? 900_000 });
    evidence.tests = { command: cmd, cwd, exit_code: t.evidence?.exit_code ?? null, counts: t.evidence?.test_counts ?? null, failure: t.evidence?.failure ?? null, duration_ms: t.evidence?.duration_ms ?? null, output_tail: (t.evidence?.output ?? '').slice(-1500) };
    checks.push(check('tests', `${cmd}: ${t.result}${t.evidence?.test_counts ? ` (${t.evidence.test_counts.pass}/${t.evidence.test_counts.tests ?? '?'} pass)` : ''}`, t.result));
  }
  const sec = secretScan(root);
  evidence.security = sec.error ? { error: sec.error } : { counts: sec.counts, sensitive_files_present: sec.sensitive_files_present, confirmed: sec.findings.filter((f) => f.classification === 'CONFIRMED').slice(0, 20) };
  checks.push(check('secrets', sec.error ? sec.error : `${sec.counts.CONFIRMED} confirmed credential(s), ${sec.counts.SUSPICIOUS} suspicious`, sec.error ? 'BLOCKED' : sec.counts.CONFIRMED ? 'FAIL' : 'PASS'));
  checks.push(versionGate(root));
  checks.push(check('docs', existsSync(join(root, 'README.md')) ? 'README.md present' : 'no README.md', existsSync(join(root, 'README.md')) ? 'PASS' : 'FAIL'));
  const gates = report({ module: 'dcore-release', action: 'readiness', started_at, checks, evidence });
  let verdict = gates.result === 'PASS' ? 'READY' : 'BLOCKED';
  const actions = [];
  // publishing actions — only when requested, only when READY, only with approval
  if (opts.push || opts.deployCmd) {
    if (verdict !== 'READY') actions.push({ action: 'publish', result: 'BLOCKED', reason: 'readiness gates not met' });
    else {
      if (opts.push) {
        const g = gate('git-push', opts.approvals);
        if (!g.allowed) { actions.push({ action: 'git-push', result: 'NOT_AUTHORIZED', reason: g.reason }); verdict = 'NOT_AUTHORIZED'; }
        else { const p = await gitOp('push', { repo: root, approvals: opts.approvals }); actions.push({ action: 'git-push', result: p.result, evidence: p.evidence }); if (p.result !== 'PASS') verdict = 'FAILED'; }
      }
      if (opts.deployCmd && verdict === 'READY') {
        const g = gate('deploy', opts.approvals);
        if (!g.allowed) { actions.push({ action: 'deploy', result: 'NOT_AUTHORIZED', reason: g.reason }); verdict = 'NOT_AUTHORIZED'; }
        else { const d = await runCommand(opts.deployCmd, { cwd: root, approvals: opts.approvals, timeoutMs: 1_800_000 }); actions.push({ action: 'deploy', result: d.result, evidence: { exit_code: d.evidence?.exit_code, output_tail: (d.evidence?.output ?? '').slice(-1500) } }); if (d.result !== 'PASS') verdict = 'FAILED'; }
      }
      if (verdict === 'READY' && opts.verifyUrl) {
        const { verifyDeployment } = await import('./verify.mjs');
        const v = await verifyDeployment({ url: opts.verifyUrl, health: opts.health });
        actions.push({ action: 'verify', result: v.verdict, evidence: v.evidence });
        verdict = v.verdict === 'VERIFIED' ? 'VERIFIED' : 'FAILED';
      } else if (verdict === 'READY' && actions.length && actions.every((a) => a.result === 'PASS')) verdict = 'VERIFIED';   // push verified by remote-HEAD check
    }
  }
  return { ...gates, verdict, actions };
}
