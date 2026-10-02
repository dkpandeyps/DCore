// dcore-verify — post-deployment / environment verification with evidence. Read-only by design: it only issues
// GET requests (via dcore-api) and optional browser smoke steps (via dcore-browse). It never rolls back; a failed
// verification returns FAILED with a rollback signal for a human to act on.
import { apiRequest } from './api.mjs';
import { report, check } from './evidence.mjs';

// spec: { url, health: '/health' | [paths], expectText: [..], maxMs, steps: [browse steps], browse: bool }
export async function verifyDeployment(spec, opts = {}) {
  const started_at = new Date().toISOString();
  let base;
  try { base = new URL(spec.url); } catch { return { ...report({ module: 'dcore-verify', action: 'verify', started_at, result: 'BLOCKED', limitations: ['verify needs --url <base url>'] }), verdict: 'BLOCKED' }; }
  const checks = []; const evidence = { requests: [] };
  const paths = [].concat(spec.health ?? []);
  for (const p of paths) {
    const r = await apiRequest({ url: new URL(p, base).href, retries: 2, timeoutMs: spec.timeoutMs ?? 15_000, expect: { statusIn: [200, 204] } });
    evidence.requests.push({ path: p, result: r.result, status: r.evidence?.status ?? null, latency: r.evidence?.latency ?? null });
    checks.push(check(`health:${p}`, `GET ${p} -> ${r.evidence?.status ?? r.checks?.[0]?.title ?? 'no response'}`, r.result));
  }
  const page = await apiRequest({ url: base.href, retries: 2, timeoutMs: spec.timeoutMs ?? 15_000, expect: { ...(spec.expectText ? { bodyContains: spec.expectText } : {}), ...(spec.maxMs ? { maxMs: spec.maxMs } : {}) } });
  evidence.requests.push({ path: base.pathname, result: page.result, status: page.evidence?.status ?? null, latency: page.evidence?.latency ?? null });
  for (const c of page.checks) checks.push(check(`page:${c.id}`, c.title, c.result, { expected: c.expected, actual: c.actual }));
  if (spec.steps?.length || spec.browse) {
    const { browse } = await import('./browse.mjs');
    const b = await browse(spec.steps?.length ? spec.steps : [{ goto: base.href }, { screenshot: 'verify' }], { outDir: opts.outDir });
    evidence.browser = { result: b.result, screenshots: b.evidence?.screenshots ?? [], console_errors: b.evidence?.console_errors ?? [], network_failures: b.evidence?.network_failures ?? [], limitations: b.limitations };
    checks.push(check('browser-smoke', `browser smoke: ${b.result}`, b.result));
  }
  const r = report({ module: 'dcore-verify', action: `verify ${base.origin}`, started_at, checks, evidence, limitations: ['point-in-time check from this machine; not a monitoring system', 'error rates/logs are not observed unless an endpoint exposing them is checked'] });
  const verdict = r.result === 'PASS' ? 'VERIFIED' : r.result === 'FAIL' ? 'FAILED' : 'BLOCKED';
  return { ...r, verdict, rollback_signal: verdict === 'FAILED' ? 'verification failed: consider rollback (DCore does not roll back automatically)' : null };
}
