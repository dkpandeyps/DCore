// dcore browser matrix (M46) — run one scenario document across the browsers that are actually installed and drivable,
// and across desktop / tablet / mobile viewports. Every (browser, viewport, scenario) combination is recorded with
// browser, version, OS, viewport, status, evidence and limitations. A browser that is not installed is NOT_AVAILABLE; one
// that is installed but cannot be driven by DCore's engine (Firefox, WebKit: no CDP) is NOT_TESTED with that reason.
// Nothing is installed or modified. Results are Chromium-engine coverage unless a non-Chromium engine actually ran —
// never a cross-browser compatibility claim.
import { join } from 'node:path';
import { type as osType, release as osRelease, arch as osArch } from 'node:os';
import { browserInventory, VIEWPORTS } from './browse.mjs';
import { runScenarios, newRunId, totalsOf } from './scenario.mjs';

const VP_LIMIT = { desktop: null, tablet: 'tablet = device-metrics + touch emulation in desktop Chromium, not a real tablet', mobile: 'mobile = device-metrics + touch emulation in desktop Chromium, not a real phone' };

export async function runMatrix(doc, { browsers = ['chrome', 'edge', 'chromium', 'firefox', 'webkit'], viewports = ['desktop', 'tablet', 'mobile'], outDir, approvals, stepTimeoutMs, inventory = browserInventory() } = {}) {
  const os = `${osType()} ${osRelease()} (${osArch()})`;
  const run_id = newRunId(); const started_at = new Date().toISOString();
  const rows = []; const scenarios = []; const runs = [];
  const bad = viewports.filter((v) => !VIEWPORTS[v]);
  if (bad.length) throw new Error(`unknown viewport(s) ${bad.join(', ')} (known: ${Object.keys(VIEWPORTS).join(', ')})`);
  for (const family of browsers) {
    const inv = inventory.find((b) => b.family === family) ?? { family, available: false, drivable: false, reason: `unknown browser family "${family}"` };
    if (!inv.drivable) {
      for (const vp of viewports) rows.push({ browser: family, version: null, os, viewport: vp, scenario: '*', status: inv.available ? 'NOT_TESTED' : 'NOT_AVAILABLE', evidence: [], limitations: [inv.reason] });
      continue;
    }
    for (const vp of viewports) {
      const sr = await runScenarios(doc, { outDir: join(outDir, `${family}-${vp}`), approvals, browser: inv.path, viewport: vp, stepTimeoutMs, runId: `${run_id}-${family}-${vp}` });
      runs.push({ family, viewport: vp, sr });
      const version = sr.browser?.version ?? null;
      const vpText = `${vp} ${VIEWPORTS[vp].width}x${VIEWPORTS[vp].height}`;
      const lim = [...(sr.browser ? [] : sr.limitations ?? []), ...(VP_LIMIT[vp] ? [VP_LIMIT[vp]] : [])];
      for (const s of sr.scenarios) {
        rows.push({ browser: family, version, os, viewport: vpText, scenario: s.scenario_id, title: s.title, status: s.status, evidence: [...new Set([...(s.evidence ?? []), ...(s.steps ?? []).map((x) => x.screenshot).filter(Boolean)])], limitations: lim });
        const id = `${s.scenario_id}@${family}-${vp}`;
        scenarios.push({ ...s, scenario_id: id, title: `${s.title} — ${family} / ${vp}`, feature: s.feature, steps: (s.steps ?? []).map((x) => ({ ...x, scenario_id: id })) });
      }
    }
  }
  const first = runs[0]?.sr ?? null;
  const union = (k) => [...new Set(runs.flatMap((r) => r.sr.browser?.[k] ?? []).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))))].map((x) => { try { return JSON.parse(x); } catch { return x; } });
  const engines = [...new Set(runs.map((r) => (['firefox', 'webkit'].includes(r.family) ? r.family : 'chromium')))];
  const sr = {
    schema: 'dcore.scenario-run/1', host: { os }, run_id, name: `${doc?.name ?? 'Scenarios'} — browser matrix`, target: doc?.target ?? null, environment: doc?.environment ?? 'UNSPECIFIED',
    started_at, ended_at: new Date().toISOString(), approvals: first?.approvals ?? [], setup: first?.setup ?? { status: 'NOT_APPLICABLE', steps: [] },
    scenarios, totals: totalsOf(scenarios), defect_candidates: runs.flatMap((r) => r.sr.defect_candidates ?? []),
    browser: runs.length ? { browser: [...new Set(runs.map((r) => r.family))].join(', '), version: [...new Set(runs.map((r) => r.sr.browser?.version).filter(Boolean))].join('; ') || null, viewport: viewports.join(', '), responsive: union('responsive'), page_errors: union('page_errors'), console_errors: union('console_errors'), network_failures: union('network_failures'), http_4xx: union('http_4xx'), redirects: [], a11y: union('a11y'), perf: [], screenshots: [], out_dir: outDir } : null,
    browser_coverage: rows,
    limitations: [...new Set([...runs.flatMap((r) => r.sr.limitations ?? []), engines.length === 1 && engines[0] === 'chromium' ? 'Chromium-engine coverage only (Chrome / Edge / Chromium share one engine): this is NOT a cross-browser compatibility claim' : 'engines covered: ' + engines.join(', ')])],
  };
  const summary = summarise(rows);
  return { matrix: { schema: 'dcore.browser-matrix/1', run_id, os, inventory, browsers, viewports, rows, summary, claim: sr.limitations.at(-1) }, sr };
}

export function summarise(rows) {
  const combos = new Map();
  for (const r of rows) { const k = `${r.browser} | ${r.viewport.split(' ')[0]}`; const c = combos.get(k) ?? { browser: r.browser, viewport: r.viewport, version: r.version, PASS: 0, FAIL: 0, BLOCKED: 0, NOT_TESTED: 0, NOT_AVAILABLE: 0, SKIPPED: 0, NOT_APPLICABLE: 0 }; c[r.status] = (c[r.status] ?? 0) + 1; combos.set(k, c); }
  return [...combos.values()];
}
