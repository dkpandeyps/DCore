// dcore-git — safe git change management with evidence. Uses `git` via execFile (no shell, fixed argv).
// Read operations run directly. `commit` needs the `git-commit` approval, `push` needs `git-push`.
// Never: force push, history rewrite, reset/checkout/clean/stash-drop (no operation here discards user changes).
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { report, check, gate } from './evidence.mjs';

function git(args, cwd, timeoutMs = 60_000) {
  return new Promise((done) => {
    execFile('git', args, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', LC_ALL: 'C' } }, (err, stdout, stderr) => {
      done({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr), spawn_error: err && typeof err.code === 'string' ? err.code : null });
    });
  });
}

export function parseStatus(porcelain) {
  const out = { branch: null, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [], conflicts: [] };
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('# branch.head ')) out.branch = line.slice(14);
    else if (line.startsWith('# branch.upstream ')) out.upstream = line.slice(18);
    else if (line.startsWith('# branch.ab ')) { const m = line.match(/\+(\d+) -(\d+)/); if (m) { out.ahead = Number(m[1]); out.behind = Number(m[2]); } }
    else if (line.startsWith('1 ') || line.startsWith('2 ')) { const p = line.split(' '); const xy = p[1]; const path = line.split('\t')[0].split(' ').slice(line.startsWith('2 ') ? 9 : 8).join(' ') + (line.includes('\t') ? ' <- ' + line.split('\t')[1] : ''); if (xy[0] !== '.') out.staged.push(`${xy[0]} ${path}`); if (xy[1] !== '.') out.unstaged.push(`${xy[1]} ${path}`); }
    else if (line.startsWith('u ')) out.conflicts.push(line.split(' ').slice(10).join(' '));
    else if (line.startsWith('? ')) out.untracked.push(line.slice(2));
  }
  out.clean = !out.staged.length && !out.unstaged.length && !out.untracked.length && !out.conflicts.length;
  return out;
}

const PUSH_FORBIDDEN = /^(-f|--force|--force-with-lease.*|--mirror|--delete|-d|--prune)$|^\+/;

// op: status | diff | log | branches | show | commit | push | remote-head
export async function gitOp(op, opts = {}) {
  const started_at = new Date().toISOString();
  const cwd = resolve(opts.repo ?? '.');
  const base = { module: 'dcore-git', action: `git ${op}`, started_at };
  const inside = await git(['rev-parse', '--is-inside-work-tree'], cwd);
  if (inside.spawn_error) return report({ ...base, result: 'BLOCKED', limitations: ['git is not installed or not on PATH'] });
  if (inside.code !== 0) return report({ ...base, result: 'BLOCKED', limitations: [`not a git repository: ${cwd}`] });
  switch (op) {
    case 'status': {
      const r = await git(['status', '--porcelain=v2', '--branch', '--untracked-files=normal'], cwd);
      const s = parseStatus(r.stdout);
      return report({ ...base, checks: [check('status', s.clean ? 'working tree clean' : 'working tree has changes', r.code === 0 ? 'PASS' : 'FAIL')], evidence: { ...s, head: (await git(['rev-parse', '--short', 'HEAD'], cwd)).stdout.trim() || null } });
    }
    case 'diff': {
      const range = opts.range ? [opts.range] : opts.staged ? ['--cached'] : [];
      const stat = await git(['diff', '--stat', ...range], cwd);
      const patch = await git(['diff', '--no-color', '--unified=3', ...range], cwd);
      const max = 200_000;
      return report({ ...base, action: `git diff ${range.join(' ')}`.trim(), checks: [check('diff', 'diff collected', patch.code === 0 ? 'PASS' : 'FAIL')], evidence: { stat: stat.stdout.trim(), patch: patch.stdout.slice(0, max), bytes: patch.stdout.length }, limitations: patch.stdout.length > max ? ['patch truncated to 200 KB'] : [] });
    }
    case 'log': {
      const r = await git(['log', `-n${Math.min(Number(opts.n ?? 20), 200)}`, '--date=iso-strict', '--pretty=format:%h%x09%ad%x09%an%x09%s', ...(opts.path ? ['--', opts.path] : [])], cwd);
      return report({ ...base, checks: [check('log', 'history read', r.code === 0 ? 'PASS' : 'FAIL')], evidence: { commits: r.stdout.split('\n').filter(Boolean).map((l) => { const [hash, date, author, ...s] = l.split('\t'); return { hash, date, author, subject: s.join('\t') }; }) } });
    }
    case 'branches': {
      const r = await git(['branch', '-a', '--format=%(refname:short)%09%(objectname:short)%09%(upstream:short)'], cwd);
      return report({ ...base, checks: [check('branches', 'branches listed', r.code === 0 ? 'PASS' : 'FAIL')], evidence: { branches: r.stdout.split('\n').filter(Boolean).map((l) => { const [name, head, upstream] = l.split('\t'); return { name, head, upstream: upstream || null }; }) } });
    }
    case 'show': {
      const r = await git(['show', '--stat', '--no-color', opts.ref ?? 'HEAD'], cwd);
      return report({ ...base, checks: [check('show', 'commit shown', r.code === 0 ? 'PASS' : 'FAIL')], evidence: { output: r.stdout.slice(0, 50_000) } });
    }
    case 'commit': {
      const g = gate('git-commit', opts.approvals);
      if (!g.allowed) return report({ ...base, result: 'BLOCKED', checks: [check('gate', g.reason, 'NOT_AUTHORIZED')], evidence: { approval: 'NOT_AUTHORIZED' } });
      if (!opts.message) return report({ ...base, result: 'BLOCKED', limitations: ['commit needs --message'] });
      const files = [].concat(opts.files ?? []);
      if (!files.length) return report({ ...base, result: 'BLOCKED', limitations: ['commit needs explicit --files (DCore never stages everything blindly)'] });
      const add = await git(['add', '--', ...files], cwd);
      if (add.code !== 0) return report({ ...base, result: 'FAIL', checks: [check('add', `git add failed: ${add.stderr.trim()}`, 'FAIL')] });
      const c = await git(['commit', '-m', opts.message], cwd);
      const head = (await git(['rev-parse', '--short', 'HEAD'], cwd)).stdout.trim();
      return report({ ...base, checks: [check('commit', c.code === 0 ? `committed ${head}` : `commit failed: ${(c.stderr || c.stdout).trim().slice(0, 300)}`, c.code === 0 ? 'PASS' : 'FAIL')], evidence: { head, output: (c.stdout + c.stderr).slice(0, 4000) } });
    }
    case 'push': {
      for (const a of [].concat(opts.args ?? [])) if (PUSH_FORBIDDEN.test(a)) { const f = gate('force-push'); return report({ ...base, result: 'BLOCKED', checks: [check('gate', f.reason, 'BLOCKED')] }); }
      const g = gate('git-push', opts.approvals);
      if (!g.allowed) return report({ ...base, result: 'BLOCKED', checks: [check('gate', g.reason, 'NOT_AUTHORIZED')], evidence: { approval: 'NOT_AUTHORIZED' } });
      const remote = opts.remote ?? 'origin';
      const branch = opts.branch ?? (await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).stdout.trim();
      const local = (await git(['rev-parse', 'HEAD'], cwd)).stdout.trim();
      const p = await git(['push', remote, `HEAD:refs/heads/${branch}`], cwd, 180_000);
      // verify: the remote ref must now equal the local HEAD (evidence, not exit code alone)
      const ls = await git(['ls-remote', remote, `refs/heads/${branch}`], cwd, 60_000);
      const remoteHead = ls.stdout.split(/\s/)[0] || null;
      const verified = p.code === 0 && remoteHead === local;
      return report({ ...base, result: verified ? 'PASS' : 'FAIL', checks: [check('push', p.code === 0 ? 'push exited 0' : `push failed: ${p.stderr.trim().slice(0, 300)}`, p.code === 0 ? 'PASS' : 'FAIL'), check('verify', `remote ${branch} == local HEAD`, verified ? 'PASS' : 'FAIL', { expected: local, actual: remoteHead })], evidence: { remote, branch, local_head: local, remote_head: remoteHead, output: (p.stdout + p.stderr).slice(0, 4000) } });
    }
    case 'remote-head': {
      const remote = opts.remote ?? 'origin';
      const branch = opts.branch ?? (await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).stdout.trim();
      const ls = await git(['ls-remote', remote, `refs/heads/${branch}`], cwd, 60_000);
      const local = (await git(['rev-parse', 'HEAD'], cwd)).stdout.trim();
      const remoteHead = ls.stdout.split(/\s/)[0] || null;
      return report({ ...base, checks: [check('remote', ls.code === 0 ? `remote ${branch} = ${remoteHead?.slice(0, 7) ?? 'absent'}` : 'ls-remote failed', ls.code === 0 ? 'PASS' : 'BLOCKED')], evidence: { remote, branch, local_head: local, remote_head: remoteHead, in_sync: remoteHead === local } });
    }
    default:
      return report({ ...base, result: 'BLOCKED', limitations: [`unknown git op: ${op} (status|diff|log|branches|show|commit|push|remote-head)`] });
  }
}
