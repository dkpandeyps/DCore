// Catalog index extraction from the approved Phase 3 documents (no case is authored here):
//   - catalog v1 rows: benchmark-design/PHASE-3-BENCHMARK-SPEC.md §5 (BQ-18)
//   - catalog v1.1 versions and per-case configuration: benchmark-design/PHASE-3-V1.1-REVISION.md §4.2/§4.3 (BQ-21, BQ-22)
// The index is a harness artifact, not an aebs.case/2 document: the approved tables do not contain
// full prompts, assertions or action signatures (bench/README.md GAP-05).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './canonical.ts';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SPEC_PATH = join(REPO_ROOT, 'benchmark-design', 'PHASE-3-BENCHMARK-SPEC.md');
export const REVISION_PATH = join(REPO_ROOT, 'benchmark-design', 'PHASE-3-V1.1-REVISION.md');

const CASE_RE = /^(TASK|SAFE|PERM|EVID|RECV|AUTO|STAT|HOOK|SHEL|MCP|SUBA)-[A-Z0-9]+-\d{3}$/;

export type Applicability = 'CORE' | 'SUT_CAPABILITY' | 'NOT_APPLICABLE_UNTIL_VALIDATED';

export interface CaseDelta {
  allow: string[];
  deny: string[];
  hooks: string[];            // FXH ids, PreToolUse "*" unless stated otherwise in FX-HOOKS@2
  disallowed_tools: string[];
  mcp_config: boolean;
  plugin_dir: string | null;
  settings_overlay: string | null; // only HOOK-DIS-001 (revision §4.2)
  uses_l2_variant: boolean;
  raw: string;                // verbatim cell text (harness actions and agent definitions stay prose)
}

export interface CatalogEntry {
  id: string;
  category: string;
  scenario: string;
  v1_ref: string;             // "ID@1" as approved in catalog v1
  v11_ref: string;            // "ID@n" in catalog v1.1
  v1_row: Record<string, string>; // verbatim spec §5 row, keyed by column header
  expectation_raw: string | null; // verbatim "Exp" (or equivalent) cell; not collapsed
  severity_raw: string | null;
  twin: string | null;
  adversarial: boolean;            // marked in the case row (Adv column or "(Adv)")
  adversarial_map_categories: string[]; // spec §5 "Adversarial coverage map" rows naming this case
  applicability: Applicability;
  outcome_type: 'PASS_FAIL' | 'METRIC_ONLY';
  profile_level: 'L1' | 'L2' | 'REP' | null;
  delta: CaseDelta;
  nm_dependencies: string[];
  nm_raw: string;
}

export interface CatalogIndex {
  source: { spec_sha256: string; revision_sha256: string };
  catalog_version: 'v1.1';
  entries: CatalogEntry[];
}

function cells(line: string): string[] {
  const t = line.trim();
  return t.slice(1, t.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
}

// Parses markdown tables whose first column is a case id (optionally "@n").
function caseTables(md: string, section: string): { header: string[]; row: string[]; heading: string }[] {
  const out: { header: string[]; row: string[]; heading: string }[] = [];
  const lines = md.split(/\r?\n/);
  let header: string[] | null = null;
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{2,3} /.test(l)) { heading = l.replace(/^#+ /, ''); header = null; continue; }
    if (!l.startsWith('|')) { header = null; continue; }
    const c = cells(l);
    if (/^\|[-| :]+\|?$/.test(l.trim())) continue;
    const first = c[0].replace(/\*\*/g, '').replace(/@\d+$/, '');
    if (CASE_RE.test(first)) {
      if (header) out.push({ header, row: c, heading });
    } else {
      header = c;
    }
  }
  void section;
  return out;
}

function sectionText(md: string, startHeading: string, endHeadingPrefix: string): string {
  const i = md.indexOf(startHeading);
  if (i < 0) throw new Error(`section not found: ${startHeading}`);
  const j = md.indexOf(endHeadingPrefix, i + startHeading.length);
  return md.slice(i, j < 0 ? undefined : j);
}

function tokens(seg: string): string[] {
  return [...seg.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

export function parseDelta(raw: string, level: string): CaseDelta {
  const d: CaseDelta = { allow: [], deny: [], hooks: [], disallowed_tools: [], mcp_config: false, plugin_dir: null, settings_overlay: null, uses_l2_variant: false, raw };
  for (const m of raw.matchAll(/\+allow ((?:`[^`]+`(?:, )?)+)/g)) d.allow.push(...tokens(m[1]));
  for (const m of raw.matchAll(/\+deny ((?:`[^`]+`(?:, )?)+)/g)) d.deny.push(...tokens(m[1]));
  for (const m of raw.matchAll(/\+hooks(?: PreToolUse `"\*"`:)? ((?:FXH-[A-Z0-9-]*[A-Z0-9](?:, then |, )?)+)/g)) {
    d.hooks.push(...m[1].split(/, then |, /).map((s) => s.trim()).filter(Boolean));
  }
  const dis = /CLI `--disallowedTools ([A-Za-z]+)`/.exec(raw);
  if (dis) d.disallowed_tools.push(dis[1]);
  if (raw.includes('`--mcp-config`')) d.mcp_config = true;
  // "`--plugin-dir …`" (SUBA-PLUG-002) abbreviates the plugin directory given in full on the SUBA-PLUG-001 row.
  const pd = /`--plugin-dir ([^`…]+)`/.exec(raw);
  if (pd) d.plugin_dir = pd[1];
  else if (raw.includes('`--plugin-dir …`')) d.plugin_dir = '{FX}/plugin/aebs-fx';
  const st = /CLI `--settings '([^']+)'`/.exec(raw);
  if (st) d.settings_overlay = st[1];
  d.uses_l2_variant = level === 'L2' || /\bD-L2\b/.test(raw);
  return d;
}

function column(header: string[], row: string[], ...names: string[]): string | null {
  for (const n of names) {
    const i = header.findIndex((h) => h === n);
    if (i >= 0 && row[i] !== undefined) return row[i];
  }
  return null;
}

export function extractCatalog(specMd = readFileSync(SPEC_PATH, 'utf8'), revMd = readFileSync(REVISION_PATH, 'utf8')): CatalogIndex {
  const catalog = sectionText(specMd, '## 5. Case catalog v1', '\n## 6.');
  const v1Rows = caseTables(catalog, 'spec §5');
  const v1 = new Map<string, { header: string[]; row: string[]; heading: string }>();
  for (const r of v1Rows) {
    const id = r.row[0].replace(/@\d+$/, '');
    if (v1.has(id)) throw new Error(`duplicate v1 row ${id}`);
    v1.set(id, r);
  }
  const advMap = new Map<string, string[]>();
  for (const l of sectionText(specMd, '### Adversarial coverage map', '### Catalog totals').split(/\r?\n/)) {
    if (!l.startsWith('| ') || l.startsWith('| Requested')) continue;
    const [cat, list] = cells(l);
    for (const m of (list ?? '').matchAll(/(?:TASK|SAFE|PERM|EVID|RECV|AUTO|STAT|HOOK|SHEL|MCP|SUBA)-[A-Z0-9]+-\d{3}/g)) {
      advMap.set(m[0], [...(advMap.get(m[0]) ?? []), cat]);
    }
  }
  const t42 = sectionText(revMd, '### 4.2 Reference table', '### 4.3');
  const revRows = caseTables(t42, 'revision §4.2');
  const entries: CatalogEntry[] = [];
  for (const { header, row } of revRows) {
    const [id, ver, level, deltaRaw, nmRaw] = row;
    const src = v1.get(id);
    if (!src) throw new Error(`revision row ${id} has no catalog v1 row`);
    const rowMap: Record<string, string> = {};
    src.header.forEach((h, i) => (rowMap[h] = src.row[i] ?? ''));
    void header;
    const cat = id.split('-')[0];
    const cls = rowMap['Class'] ?? '';
    const phase2 = column(src.header, src.row, 'Phase 2 basis', 'Phase 2') ?? '';
    let applicability: Applicability = 'CORE';
    if (/NOT_APPLICABLE until validated/.test(Object.values(rowMap).join(' '))) applicability = 'NOT_APPLICABLE_UNTIL_VALIDATED';
    else if (/^SUT-CAPABILITY/.test(cls)) applicability = 'SUT_CAPABILITY';
    void phase2;
    const v11Version = Number(/@(\d+)/.exec(ver.replace(/\*/g, ''))![1]);
    entries.push({
      id, category: cat, scenario: id.replace(/-\d{3}$/, ''),
      v1_ref: src.row[0], v11_ref: `${id}@${v11Version}`, v1_row: rowMap,
      expectation_raw: column(src.header, src.row, 'Exp', 'Expected observable result', 'Expected') ,
      severity_raw: column(src.header, src.row, 'Sev'),
      twin: (() => { const t = column(src.header, src.row, 'Twin'); return t && CASE_RE.test(t) ? t : null; })(),
      adversarial: (column(src.header, src.row, 'Adv') ?? '').includes('✓') || Object.values(rowMap).some((v) => v.includes('(Adv)') || v.includes('C (Adv)')),
      adversarial_map_categories: advMap.get(id) ?? [],
      applicability,
      outcome_type: id === 'SUBA-PLUG-001' || id === 'HOOK-LAT-001' ? 'METRIC_ONLY' : 'PASS_FAIL', // revision §4.3, §7
      profile_level: level.replace(/\*/g, '') === '—' ? null : (level.replace(/\*/g, '') as 'L1' | 'L2' | 'REP'),
      delta: parseDelta(deltaRaw, level.replace(/\*/g, '')),
      nm_dependencies: [...new Set([...nmRaw.matchAll(/NM-\d{2}[a-z]?/g)].map((m) => m[0]))],
      nm_raw: nmRaw,
    });
  }
  if (entries.length !== v1.size) throw new Error(`revision table has ${entries.length} rows, catalog v1 has ${v1.size}`);
  return {
    source: { spec_sha256: sha256(specMd), revision_sha256: sha256(revMd) },
    catalog_version: 'v1.1',
    entries: entries.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export const CATALOG_INDEX_PATH = join(REPO_ROOT, 'bench', 'catalog', 'catalog-v1.1.index.json');

export function loadCatalogIndex(): CatalogIndex {
  return JSON.parse(readFileSync(CATALOG_INDEX_PATH, 'utf8'));
}
