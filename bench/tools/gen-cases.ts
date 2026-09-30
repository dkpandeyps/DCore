// Writes executable-form aebs.case/2 documents and provenance sidecars under bench/cases/.
// Every emitted case document is validated against the schema. Nothing runs.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorAll, type AuthoredCase } from '../src/author.ts';
import { validateDoc } from '../src/schemas.ts';
import { canonicalFile } from '../src/canonical.ts';
import { reconcileExecutable } from '../src/reconcile.ts';
import { buildAllFixtures } from '../src/fixtures-build.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'cases');

export function provenanceReport(authored: AuthoredCase[]) {
  const byField: Record<string, Record<string, number>> = {};
  let source_derived = 0, pending = 0, not_ready = 0, owner_approved = 0;
  for (const a of authored) {
    for (const [f, p] of Object.entries(a.provenance.fields)) {
      (byField[f] ??= {})[p.status] = ((byField[f] ??= {})[p.status] ?? 0) + 1;
      if (p.status === 'SOURCE_DERIVED') source_derived++;
      else if (p.status === 'PENDING_OWNER_APPROVAL') pending++;
      else if (p.status === 'OWNER_APPROVED') owner_approved++;
      else not_ready++;
    }
  }
  return {
    banner: 'PROPOSED — NOT APPROVED FOR EXECUTION',
    totals: {
      cases: authored.length,
      executable_form_pending_approval: authored.filter((a) => a.provenance.execution_readiness === 'EXECUTABLE_FORM_PENDING_APPROVAL').length,
      not_ready_for_execution: authored.filter((a) => a.provenance.execution_readiness === 'NOT_READY_FOR_EXECUTION').length,
      with_executable_doc: authored.filter((a) => a.provenance.has_executable_doc).length,
      field_status: { source_derived, pending_owner_approval: pending, owner_approved, not_ready },
    },
    field_status_by_name: byField,
    not_ready: authored.filter((a) => a.provenance.execution_readiness === 'NOT_READY_FOR_EXECUTION').map((a) => ({ id: a.provenance.ref, reasons: a.provenance.not_ready_reasons })),
    gap07_cases: authored.filter((a) => a.provenance.gap07_dependency).map((a) => a.provenance.ref),
    per_case: Object.fromEntries(authored.map((a) => [a.provenance.ref, a.provenance])),
  };
}

function main(): void {
  const authored = authorAll();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'executable'), { recursive: true });
  mkdirSync(join(OUT, 'provenance'), { recursive: true });
  const errors: string[] = [];
  for (const a of authored) {
    const ref = a.provenance.ref.replace('@', '-at-');
    if (a.doc) {
      const errs = validateDoc(a.doc);
      if (errs.length) errors.push(`${a.provenance.ref}: ${errs.slice(0, 3).map((e) => `${e.path} ${e.message}`).join('; ')}`);
      writeFileSync(join(OUT, 'executable', `${ref}.json`), canonicalFile(a.doc));
    }
    writeFileSync(join(OUT, 'provenance', `${ref}.json`), canonicalFile(a.provenance));
  }
  const report = provenanceReport(authored);
  writeFileSync(join(OUT, 'PROVENANCE-REPORT.json'), canonicalFile(report));
  const recon = reconcileExecutable(authored);
  writeFileSync(join(OUT, 'RECONCILIATION.json'), canonicalFile(recon));

  // GAP-08 decision record.
  const gap08 = {
    banner: 'PROPOSED — NOT APPROVED FOR EXECUTION',
    design: 'Local bare repository R/remote.git (FX-RUNROOT@1). No credentials, no network; push uses a file path.',
    questions: {
      pre_seeded_commit_content: { status: 'PENDING_OWNER_APPROVAL', proposal: 'ws/ initialized with a single seed commit of the FX-APP skeleton (one tracked file), so commit/push cases operate on a non-empty history.', reason: 'the approved documents do not specify the seed commit content (GAP-08).' },
      ws_git_initializer: { status: 'PENDING_OWNER_APPROVAL', proposal: 'FX-RUNROOT@1 initializes ws/ as a git repo with origin -> R/remote.git and the seed commit, because FX-RUNROOT@1 already owns R/remote.git (spec §4.1).', reason: 'neither FX-RUNROOT@1 (spec §4.1) nor FX-APP@1 states which fixture initializes ws/ as a git repo (GAP-08).' },
    },
    git_cases: authored.filter((a) => a.doc && Object.keys(a.provenance.fields).some((k) => k.startsWith('git_workspace'))).map((a) => a.provenance.ref),
    credentials_or_network: 'none — a local bare repo file path only',
  };
  writeFileSync(join(OUT, 'GAP-08.json'), canonicalFile(gap08));

  // Concise authoring report.
  const t = report.totals;
  const authoring = [
    '# Phase 4 executable-form authoring report',
    '',
    '> **PROPOSED — NOT APPROVED FOR EXECUTION.** Nothing here is executable Run A content until owner approval.',
    '',
    `- Cases authored: **${t.cases}** (${t.executable_form_pending_approval} executable-form pending approval, ${t.not_ready_for_execution} not ready).`,
    `- Schema-valid case documents written: **${t.with_executable_doc}** (the 2 NOT_APPLICABLE-until-validated cases emit provenance only).`,
    `- Field provenance: ${t.field_status.source_derived} source-derived, ${t.field_status.pending_owner_approval} pending-owner-approval, ${t.field_status.owner_approved} owner-approved, ${t.field_status.not_ready} not-ready.`,
    `- Executable-doc reconciliation vs approved catalog: **${recon.ok ? 'PASS (no drift)' : 'FAIL'}** — no HG-06 in any doc; METRIC_ONLY only on HOOK-LAT-001/SUBA-PLUG-001; SG-01 out of case docs (capability gate).`,
    `- Fixture families with deterministic synthetic builders: **${buildAllFixtures().length}/6** (all SKELETON_PENDING_APPROVAL; runnable scripts execution-guarded).`,
    '',
    '## Not-ready cases and why',
    '',
    ...recon.counts ? [] : [],
    ...report.not_ready.map((n: any) => `- **${n.id}**: ${n.reasons.join('; ')}`),
    '',
    '## GAP status',
    '',
    '- **GAP-05:** case docs authored; every non-source field is PENDING_OWNER_APPROVAL or NOT_READY. Prompts are all PENDING (operationalized from the catalog intent columns; wording not source-defined).',
    '- **GAP-07:** unresolved. Cases that can produce CORRECT_ASK carry an explicit GAP-07 dependency; the enforcement-rate formula is unchanged.',
    '- **GAP-08:** git design fixed (local bare `R/remote.git`, no credentials/network); the two open questions (seed-commit content; which fixture git-initializes `ws/`) are PENDING_OWNER_APPROVAL (see `GAP-08.json`).',
    '',
  ].join('\n');
  writeFileSync(join(OUT, 'AUTHORING-REPORT.md'), authoring + '\n');

  if (errors.length) { console.error('SCHEMA ERRORS:\n' + errors.join('\n')); process.exitCode = 1; return; }
  console.log(`reconciliation ok=${recon.ok}`);
  console.log(`authored ${authored.length} cases: ${report.totals.executable_form_pending_approval} executable-form (pending approval), ${report.totals.not_ready_for_execution} not ready`);
  console.log(`docs written: ${report.totals.with_executable_doc}; all schema-valid`);
  console.log(`fields: ${report.totals.field_status.source_derived} source-derived, ${report.totals.field_status.pending_owner_approval} pending, ${report.totals.field_status.owner_approved} owner-approved, ${report.totals.field_status.not_ready} not-ready`);
}

main();
