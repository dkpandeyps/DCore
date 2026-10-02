// dcore-api — real HTTP request execution with assertions and redacted evidence (global fetch, no dependencies).
// Safe methods (GET/HEAD/OPTIONS) run directly. Mutating methods against a non-local host need the
// `external-write` approval. Credentials come only from environment variables named by the caller (never argv,
// never logged); Authorization/Cookie/Set-Cookie and token-shaped values are redacted from all evidence.
import { report, check, gate } from './evidence.mjs';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const isLocal = (u) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname) || u.hostname.endsWith('.localhost');

// JSON path: a.b[0].c
export function getPath(obj, path) {
  if (!path) return obj;
  return String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Minimal JSON-schema subset: type, required, properties, items, enum. Returns a list of violations.
export function validateSchema(value, schema, at = '$') {
  const errs = [];
  if (!schema || typeof schema !== 'object') return errs;
  const t = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value === 'number' && Number.isInteger(value) && schema.type === 'integer' ? 'integer' : typeof value;
  if (schema.type) { const types = [].concat(schema.type); if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) errs.push(`${at}: expected ${types.join('|')}, got ${t}`); }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) errs.push(`${at}: not in enum`);
  if (t === 'object' && value) {
    for (const r of schema.required ?? []) if (!(r in value)) errs.push(`${at}.${r}: required`);
    for (const [k, s] of Object.entries(schema.properties ?? {})) if (k in value) errs.push(...validateSchema(value[k], s, `${at}.${k}`));
  }
  if (t === 'array' && schema.items) value.forEach((v, i) => errs.push(...validateSchema(v, schema.items, `${at}[${i}]`)));
  return errs;
}

function buildHeaders(spec, secrets) {
  const h = { ...(spec.headers ?? {}) };
  if (spec.authEnv) {
    const v = process.env[spec.authEnv];
    if (!v) return { error: `auth env var ${spec.authEnv} is not set` };
    secrets.push(v);
    h.Authorization = spec.authScheme === 'raw' ? v : `${spec.authScheme ?? 'Bearer'} ${v}`;
  }
  for (const [name, envName] of Object.entries(spec.headerEnv ?? {})) {
    const v = process.env[envName];
    if (!v) return { error: `header env var ${envName} is not set` };
    secrets.push(v);
    h[name] = v;
  }
  if (spec.json !== undefined && !Object.keys(h).some((k) => k.toLowerCase() === 'content-type')) h['Content-Type'] = 'application/json';
  return { headers: h };
}

async function once(url, init, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: ac.signal, redirect: init.redirect ?? 'follow' });
    const text = init.method === 'HEAD' ? '' : await res.text();
    return { res, text, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { error: ac.signal.aborted ? 'TIMEOUT' : (e.cause?.code ?? e.name ?? 'NETWORK_ERROR'), message: String(e.cause?.message ?? e.message), ms: Math.round(performance.now() - t0) };
  } finally { clearTimeout(timer); }
}

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };

// spec: { method, url, headers, headerEnv, authEnv, authScheme, json, body, timeoutMs, retries, repeat,
//         expect: { status, statusIn, headers:{name:regex}, bodyContains, bodyNotContains, json:{path:value}, schema, maxMs } }
export async function apiRequest(spec, { approvals = [] } = {}) {
  const started_at = new Date().toISOString();
  const secrets = [];
  const method = String(spec.method ?? 'GET').toUpperCase();
  let u;
  try { u = new URL(spec.url); } catch { return report({ module: 'dcore-api', action: `${method} ${spec.url}`, started_at, result: 'BLOCKED', limitations: ['invalid URL'] }); }
  const base = { module: 'dcore-api', action: `${method} ${u.origin}${u.pathname}`, started_at, secrets };
  if (!/^https?:$/.test(u.protocol)) return report({ ...base, result: 'BLOCKED', limitations: [`unsupported protocol ${u.protocol} (http/https only)`] });
  if (!SAFE.has(method) && !isLocal(u)) {
    const g = gate('external-write', approvals);
    if (!g.allowed) return report({ ...base, result: 'BLOCKED', checks: [check('gate', g.reason, 'NOT_AUTHORIZED')], evidence: { approval: 'NOT_AUTHORIZED' }, limitations: ['not executed: approval required for a non-read request to a non-local host'] });
  }
  const hb = buildHeaders(spec, secrets);
  if (hb.error) return report({ ...base, result: 'BLOCKED', limitations: [hb.error] });
  const init = { method, headers: hb.headers, body: spec.json !== undefined ? JSON.stringify(spec.json) : spec.body };
  const timeoutMs = spec.timeoutMs ?? 15_000;
  const retries = SAFE.has(method) ? Math.min(Number(spec.retries ?? 0), 3) : 0;   // never retry writes
  const repeat = Math.max(1, Math.min(Number(spec.repeat ?? 1), 200));
  const attempts = [];
  let last;
  for (let i = 0; i < repeat; i++) {
    let r;
    for (let a = 0; a <= retries; a++) {
      r = await once(u, init, timeoutMs);
      attempts.push({ attempt: attempts.length + 1, status: r.res?.status ?? null, error: r.error ?? null, ms: r.ms });
      if (!r.error && r.res.status < 500) break;
      if (a < retries) await new Promise((s) => setTimeout(s, 250 * 2 ** a));
    }
    last = r;
  }
  const lat = attempts.filter((a) => !a.error).map((a) => a.ms);
  const latency = { samples: lat.length, min: lat.length ? Math.min(...lat) : null, p50: pct(lat, 50), p95: pct(lat, 95), max: lat.length ? Math.max(...lat) : null };
  if (last.error) {
    return report({ ...base, result: 'FAIL', checks: [check('reachable', `request failed: ${last.error}`, 'FAIL', { actual: last.message })], evidence: { attempts, latency }, limitations: ['no response received'] });
  }
  const { res, text } = last;
  const headers = Object.fromEntries([...res.headers.entries()].sort(([a], [b]) => a.localeCompare(b)));
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  const e = spec.expect ?? {};
  const checks = [];
  if (e.status !== undefined) checks.push(check('status', `status == ${e.status}`, res.status === Number(e.status) ? 'PASS' : 'FAIL', { expected: e.status, actual: res.status }));
  else if (e.statusIn) checks.push(check('status', `status in ${e.statusIn}`, [].concat(e.statusIn).map(Number).includes(res.status) ? 'PASS' : 'FAIL', { expected: e.statusIn, actual: res.status }));
  else checks.push(check('status', 'status is 2xx/3xx', res.status < 400 ? 'PASS' : 'FAIL', { actual: res.status }));
  for (const [name, re] of Object.entries(e.headers ?? {})) { const v = res.headers.get(name); checks.push(check(`header:${name}`, `header ${name} ~ /${re}/`, v !== null && new RegExp(re, 'i').test(v) ? 'PASS' : 'FAIL', { actual: v })); }
  for (const s of [].concat(e.bodyContains ?? [])) checks.push(check('body-contains', `body contains "${s}"`, text.includes(s) ? 'PASS' : 'FAIL'));
  for (const s of [].concat(e.bodyNotContains ?? [])) checks.push(check('body-not-contains', `body does not contain "${s}"`, !text.includes(s) ? 'PASS' : 'FAIL'));
  for (const [p, v] of Object.entries(e.json ?? {})) {
    const actual = json === undefined ? undefined : getPath(json, p);
    checks.push(check(`json:${p}`, `${p} == ${JSON.stringify(v)}`, json !== undefined && JSON.stringify(actual) === JSON.stringify(v) ? 'PASS' : 'FAIL', { expected: v, actual }));
  }
  if (e.schema) { const errs = json === undefined ? ['body is not JSON'] : validateSchema(json, e.schema); checks.push(check('schema', 'response matches schema', errs.length ? 'FAIL' : 'PASS', { actual: errs.slice(0, 20) })); }
  if (e.maxMs !== undefined) checks.push(check('latency', `p95 <= ${e.maxMs} ms`, latency.p95 !== null && latency.p95 <= e.maxMs ? 'PASS' : 'FAIL', { actual: latency }));
  const ct = res.headers.get('content-type') ?? '';
  return report({
    ...base, checks,
    evidence: {
      status: res.status, url_final: res.url ? (() => { const f = new URL(res.url); return f.origin + f.pathname; })() : null,
      headers, content_type: ct, body_bytes: text.length, body_excerpt: text.slice(0, 2048), attempts, latency,
    },
    limitations: [...(text.length > 2048 ? ['body excerpt truncated to 2 KB'] : []), ...(repeat > 1 ? [`latency over ${repeat} sequential requests from this machine; not a load test`] : [])],
  });
}
