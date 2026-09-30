import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractCatalog, loadCatalogIndex, REVISION_PATH, CATALOG_INDEX_PATH } from '../src/catalog.ts';
import { canonicalFile } from '../src/canonical.ts';
import { ALLOW_BASE, SETTINGS_DOCUMENTED, SETTINGS_STOCK, HOOKS_REPRESENTATIVE, GLOBAL_CLI_ARGS, buildAttemptConfig, lintL01, profileDoc } from '../src/config.ts';
import { validateDoc } from '../src/schemas.ts';

const ph = { R: 'C:/t/R', WS: 'C:/t/R/ws', CFG: 'C:/t/cfg', FX: 'C:/t/fx', PORT: '0' };

test('catalog index is extracted from the approved documents and matches the committed file', () => {
  assert.equal(readFileSync(CATALOG_INDEX_PATH, 'utf8'), canonicalFile(extractCatalog()));
});

test('catalog totals reconcile with the approved catalog (92 = 86 + 4 + 2; 82 applicable on Windows; 42 at @2)', () => {
  const e = loadCatalogIndex().entries;
  assert.equal(e.length, 92);
  const n = (a: string) => e.filter((x) => x.applicability === a).length;
  assert.equal(n('CORE'), 86); assert.equal(n('SUT_CAPABILITY'), 4); assert.equal(n('NOT_APPLICABLE_UNTIL_VALIDATED'), 2);
  assert.equal(e.filter((x) => x.applicability === 'CORE' && !x.id.startsWith('SHEL-BASH')).length, 82);
  assert.equal(e.filter((x) => x.v11_ref.endsWith('@2')).length, 42);
  const counts: Record<string, number> = {};
  for (const x of e) counts[x.category] = (counts[x.category] ?? 0) + 1;
  assert.deepEqual(counts, { AUTO: 8, EVID: 6, HOOK: 9, MCP: 7, PERM: 10, RECV: 8, SAFE: 11, SHEL: 12, STAT: 7, SUBA: 7, TASK: 7 });
});

test('catalog v1 content is preserved verbatim (no case rewritten)', () => {
  const byp = loadCatalogIndex().entries.find((x) => x.id === 'SAFE-BYP-002')!;
  assert.equal(byp.v1_ref, 'SAFE-BYP-002@1');
  assert.equal(byp.v11_ref, 'SAFE-BYP-002@2');
  assert.equal(byp.expectation_raw, 'K or N'); // v1 text kept; v1.1 typed expectation lives in the case/2 document
  const metricOnly = loadCatalogIndex().entries.filter((x) => x.outcome_type === 'METRIC_ONLY').map((x) => x.id).sort();
  assert.deepEqual(metricOnly, ['HOOK-LAT-001', 'SUBA-PLUG-001']);
});

function jsonBlocks(md: string, after: string): any[] {
  const s = md.slice(md.indexOf(after));
  return [...s.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
}

test('CFG v1.1 settings are transcribed exactly from revision §2.4 and §2.5', () => {
  const md = readFileSync(REVISION_PATH, 'utf8').replace(/\r\n/g, '\n');
  const [allow] = jsonBlocks(md, '### 2.4');
  assert.deepEqual(JSON.parse(allow), ALLOW_BASE);
  const blocks = jsonBlocks(md, '### 2.5 Profile settings files');
  assert.deepEqual(JSON.parse(blocks[0]), SETTINGS_STOCK);
  assert.deepEqual(JSON.parse(blocks[1]), SETTINGS_DOCUMENTED);
  assert.deepEqual(JSON.parse(blocks[2]), HOOKS_REPRESENTATIVE);
  const cli = /```\n  (-p [^\n]+)\n  ([^\n]+)\n  ```/.exec(md)!;
  assert.deepEqual(`${cli[1]} ${cli[2]}`.split(/\s+/), GLOBAL_CLI_ARGS);
});

test('CFG-L01 holds for every case in every profile (no ask/allow overlap; no NM-09 dependence)', () => {
  for (const e of loadCatalogIndex().entries) for (const p of ['BP-STOCK', 'BP-DOCUMENTED', 'BP-REPRESENTATIVE'] as const) {
    const c = buildAttemptConfig(e, p, ph);
    if (!c.applicable) continue;
    for (const l of c.lint) assert.notEqual(l.status, 'FAIL', `${e.id} ${p} ${l.lint}: ${l.detail}`);
  }
});

test('CFG-L01 detects an overlapping allow', () => {
  assert.equal(lintL01(['PowerShell(git commit*)'], ['PowerShell(git commit -m *)']).status, 'FAIL');
  assert.equal(lintL01(['PowerShell(git commit*)'], ['PowerShell(git log*)']).status, 'PASS');
});

test('L1 vs L2 commit configuration (D-5) and profile applicability', () => {
  const idx = loadCatalogIndex().entries;
  const get = (id: string) => idx.find((x) => x.id === id)!;
  const l1 = buildAttemptConfig(get('AUTO-L1-002'), 'BP-DOCUMENTED', ph);
  assert.ok(!l1.allowed_tools.includes('PowerShell(git commit*)'));
  assert.ok(l1.settings.permissions.ask.includes('PowerShell(git commit*)'));
  assert.ok(l1.settings.permissions.deny.includes('PowerShell(git push*)'));
  const l2 = buildAttemptConfig(get('AUTO-L2-001'), 'BP-DOCUMENTED', ph);
  assert.ok(l2.allowed_tools.includes('PowerShell(git commit*)'));
  assert.ok(!l2.settings.permissions.ask.includes('PowerShell(git commit*)'));
  assert.ok(!l2.settings.permissions.deny.includes('PowerShell(git push*)'));
  const rep = buildAttemptConfig(get('HOOK-COEX-002'), 'BP-DOCUMENTED', ph);
  assert.equal(rep.applicable, false);
  const repOk = buildAttemptConfig(get('HOOK-COEX-002'), 'BP-REPRESENTATIVE', ph);
  assert.equal(repOk.settings.hooks.PreToolUse[0].hooks[0].command, 'node "C:/t/fx/hooks/fxhook.js" FXH-DENY');
  assert.equal(repOk.settings.hooks.Stop.length, 2);
  const stockMcp = buildAttemptConfig(get('MCP-DENY-001'), 'BP-STOCK', ph);
  assert.equal(stockMcp.settings.permissions.deny, undefined, 'BP-STOCK applies no case deny rules');
  const docMcp = buildAttemptConfig(get('MCP-DENY-001'), 'BP-DOCUMENTED', ph);
  assert.ok(docMcp.settings.permissions.deny.includes('mcp__fx_send__call'));
  assert.ok(docMcp.cli_args.includes('--mcp-config') && docMcp.cli_args.includes('--strict-mcp-config'));
  assert.ok(buildAttemptConfig(get('SHEL-BASH-001'), 'BP-DOCUMENTED', ph).allowed_tools.includes('Bash(echo hi)'));
  assert.ok(!buildAttemptConfig(get('SHEL-BASH-002'), 'BP-DOCUMENTED', ph).allowed_tools.some((t) => t.startsWith('Bash(')), 'no global Bash allow');
  assert.equal(buildAttemptConfig(get('MCP-UNVAL-001'), 'BP-DOCUMENTED', ph).applicable, false);
});

test('placeholders are resolved; profile/2 documents validate', () => {
  const c = buildAttemptConfig(loadCatalogIndex().entries.find((x) => x.id === 'PERM-PROT-002')!, 'BP-DOCUMENTED', ph);
  assert.ok(c.settings.permissions.deny.includes('Read(//C:/t/R/outside/**)'));
  assert.ok(!JSON.stringify(c).includes('{R}'));
  for (const p of ['BP-STOCK', 'BP-DOCUMENTED', 'BP-REPRESENTATIVE'] as const) assert.deepEqual(validateDoc(profileDoc(p)), [], p);
});
