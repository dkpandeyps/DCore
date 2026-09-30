// Writes the GAP-05 proposal artifacts under bench/proposal/ (PROPOSED — NOT APPROVED FOR EXECUTION).
// Deterministic: canonical JSON plus a rendered markdown summary. Runs nothing.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile, canonicalJson } from '../src/canonical.ts';
import { buildAllProposals, isSilent, PROPOSAL_BANNER, type CaseProposal, type Field } from '../src/proposal.ts';
import { FIXTURE_SPECS } from '../src/fixtures-spec.ts';
import { reconcile, sourceSilentReport } from '../src/reconcile.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'proposal');

function fieldMd(f: Field<unknown> | { typed: string; basis: string } | null): string {
  if (f === null) return '—';
  if ('typed' in (f as any)) return `${(f as any).typed}  \n_basis: ${(f as any).basis}_`;
  if (isSilent(f as Field<unknown>)) return `**PROPOSED — SOURCE SILENT**: ${(f as any).reason}`;
  const v = (f as any).value;
  return `${Array.isArray(v) ? v.join(', ') || '—' : v}  \n_basis: ${(f as any).basis}_`;
}

function caseMd(p: CaseProposal): string {
  const git = p.git_workspace ? '\n\n**GAP-08 git workspace:**\n\n' + Object.entries(p.git_workspace).map(([k, v]) => `- \`${k}\`: ${fieldMd(v)}`).join('\n') : '';
  return [
    `### ${p.ref}`,
    '',
    `> ${p.banner}`,
    '',
    `- **schema:** ${p.schema}`,
    `- **category / scenario:** ${p.category} / ${p.scenario}`,
    `- **title:** ${fieldMd(p.title)}`,
    `- **applicability:** ${p.applicability}`,
    `- **profile level:** ${p.profile_level ?? '—'}`,
    `- **outcome type:** ${p.outcome_type}${p.metric_only ? ' (METRIC_ONLY: measurement only; no pass/fail; no gate)' : ''}`,
    `- **severity:** ${fieldMd(p.severity)}`,
    `- **repetition tier:** ${p.repetition_tier}`,
    `- **benchmark applicability:** ${fieldMd(p.benchmark_applicability)}`,
    `- **RP-1 rule:** ${fieldMd(p.rp_rule)}`,
    `- **base expectation:** ${fieldMd(p.base_expectation as any)}`,
    `- **prompt/input:** ${fieldMd(p.prompt)}`,
    `- **expected action/tool signature (targets):** ${fieldMd(p.action_signature_targets)}`,
    `- **expected assertion(s):** ${fieldMd(p.expected_assertions)}`,
    `- **side-effect target/oracle:** ${fieldMd(p.side_effect_target)}`,
    `- **D-2 permitted outcomes:** ${fieldMd(p.d2_permitted_outcomes)}`,
    `- **hard gates:** ${fieldMd(p.hard_gates)}`,
    `- **validity gates:** ${fieldMd(p.validity_gates)}`,
    `- **SG-01:** ${fieldMd(p.sg01)}`,
    `- **required fixtures:** ${fieldMd(p.required_fixtures)}`,
    `- **prerequisites:** ${fieldMd(p.prerequisites)}`,
    `- **source basis:** ${p.source_basis}`,
    p.gap07_dependency ? `- **GAP-07 dependency:** ${p.gap07_dependency}` : `- **GAP-07 dependency:** none`,
    `- **source-silent fields:** ${p.source_silent_fields.join(', ') || 'none'}`,
    git,
  ].join('\n');
}

function main(): void {
  const proposals = buildAllProposals();
  const recon = reconcile(proposals);
  const silent = sourceSilentReport(proposals);
  mkdirSync(OUT, { recursive: true });

  // Machine-readable proposal + reconciliation.
  writeFileSync(join(OUT, 'case-proposals-v1.1.json'), canonicalFile({ banner: PROPOSAL_BANNER, generated_from: 'bench/catalog/catalog-v1.1.index.json + RP-1 (spec §3)', cases: proposals }));
  writeFileSync(join(OUT, 'fixture-proposals.json'), canonicalFile({ banner: PROPOSAL_BANNER, fixtures: FIXTURE_SPECS }));
  writeFileSync(join(OUT, 'reconciliation.json'), canonicalFile(recon));
  writeFileSync(join(OUT, 'source-silent-report.json'), canonicalFile(silent));

  // Human-readable proposal document.
  const byCat: Record<string, CaseProposal[]> = {};
  for (const p of proposals) (byCat[p.category] ??= []).push(p);
  const caseDoc = [
    '# GAP-05 case-document proposal (aebs catalog v1.1)',
    '',
    `> **${PROPOSAL_BANNER}**`,
    '> Nothing in this document is executable Run A content until explicitly approved by the owner.',
    '> Generated deterministically from the approved catalog index and RP-1 (spec §3). Every field carries a',
    '> source basis or is marked **PROPOSED — SOURCE SILENT**. No case was added, removed, renamed, or had its',
    '> severity/applicability/tier/category changed (see `reconciliation.json`).',
    '',
    '## Reconciliation summary',
    '',
    '```json',
    JSON.stringify(JSON.parse(canonicalJson(recon)), null, 2),
    '```',
    '',
    `## Cases (${proposals.length})`,
    '',
    ...Object.keys(byCat).sort().flatMap((c) => [`## ${c}`, '', ...byCat[c].map(caseMd), '']),
  ].join('\n');
  writeFileSync(join(OUT, 'CASE-PROPOSAL.md'), caseDoc + '\n');

  const fixDoc = [
    '# GAP-05 fixture-family proposal',
    '',
    `> **${PROPOSAL_BANNER}**`,
    '> All contents are synthetic/test-only. No real credentials, secrets, external services, production',
    '> packages, or network dependencies.',
    '',
    ...FIXTURE_SPECS.flatMap((f) => [
      `## ${f.id}`, '', `> ${f.status}`, '',
      `- **purpose:** ${f.purpose}`,
      `- **source basis:** ${f.source_basis}`,
      `- **layout:**\n${f.layout.map((l) => `  - \`${l}\``).join('\n')}`,
      `- **deterministic contents:** ${f.deterministic_contents}`,
      `- **observable behavior:** ${f.observable_behavior}`,
      `- **side-effect targets:** ${f.side_effect_targets.join(', ')}`,
      `- **isolation:** ${f.isolation}`,
      `- **cleanup:** ${f.cleanup}`,
      `- **consumed by:** ${f.consumed_by.join(', ')}`,
      `- **security boundaries:** ${f.security_boundaries}`,
      `- **source-silent:**\n${f.source_silent.map((s) => `  - ${s}`).join('\n')}`,
      '',
    ]),
  ].join('\n');
  writeFileSync(join(OUT, 'FIXTURE-PROPOSAL.md'), fixDoc + '\n');

  // Short review report: every field marked PROPOSED — SOURCE SILENT.
  const topFields: Record<string, number> = {};
  for (const fs of Object.values(silent.by_case)) for (const f of fs) topFields[f] = (topFields[f] ?? 0) + 1;
  const review = [
    '# GAP-05 proposal review report',
    '',
    `> **${PROPOSAL_BANNER}**`,
    '',
    `- Cases: ${proposals.length}. Fixture families: ${FIXTURE_SPECS.length}.`,
    `- Reconciliation against the approved catalog: **${recon.ok ? 'PASS (no drift)' : 'FAIL'}**.`,
    `- Total \`PROPOSED — SOURCE SILENT\` fields: **${silent.total}** (${Object.keys(silent.by_case).length} cases with case-level gaps; ${FIXTURE_SPECS.length} fixture families with gaps).`,
    '',
    '## Source-silent field frequency (case-level)',
    '',
    ...Object.entries(topFields).sort((a, b) => b[1] - a[1]).map(([f, n]) => `- \`${f}\`: ${n} cases`),
    '',
    '## Per-case source-silent fields',
    '',
    ...proposals.filter((p) => silent.by_case[p.id]).map((p) => `- **${p.ref}**: ${silent.by_case[p.id].join(', ')}`),
    '',
    '## Per-fixture source-silent notes',
    '',
    ...FIXTURE_SPECS.flatMap((f) => [`### ${f.id}`, ...f.source_silent.map((s) => `- ${s}`), '']),
    '## Cross-cutting unresolved items',
    '',
    '- **GAP-05:** the verbatim prompt for every case, the FX-APP seeded bug and hidden-test assertions, the FX-MCP tool schemas and hostile/fileread contracts, and the FX-INJECT/FX-AGENTS wording are all unspecified in the approved documents. They must be authored and approved before Run A.',
    '- **GAP-07:** left unresolved. Cases that can produce `CORRECT_ASK` carry an explicit GAP-07 dependency; the enforcement-rate interpretation was not chosen.',
    '- **GAP-08:** git-workspace shape is specified per case where derivable (local bare `R/remote.git`, no credentials, no network); the exact pre-seeded commit content and whether `ws/` is git-initialized by FX-RUNROOT@1 or FX-APP@1 remain source-silent.',
    '',
  ].join('\n');
  writeFileSync(join(OUT, 'REVIEW-REPORT.md'), review + '\n');

  console.log(`proposal: ${proposals.length} cases, ${FIXTURE_SPECS.length} fixture families`);
  console.log(`reconciliation ok=${recon.ok}`);
  console.log(`source-silent fields: ${silent.total}`);
}

main();
