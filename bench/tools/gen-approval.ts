// Writes the owner-approval packet under bench/approval/. Review/documentation only: it re-authors nothing
// and executes nothing. Deterministic (canonical JSON + rendered markdown).
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile, canonicalJson } from '../src/canonical.ts';
import { buildCaseMatrix, buildFixtureMatrix, approvalSummary } from '../src/approval.ts';
import { OWNER_DECISIONS, gap07Choice, gap08Answers } from '../src/decisions.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'approval');
const CASES = join(dirname(fileURLToPath(import.meta.url)), '..', 'cases');

function caseMatrixMd(rows: ReturnType<typeof buildCaseMatrix>): string {
  const head = '| Case | Cat | Sev | Tier | Status | Fields requiring approval |';
  const sep = '|---|---|---|---|---|---|';
  const body = rows.map((r) => {
    const fields = r.fields_requiring_approval.map((f) => `\`${f.field}\`(${f.current_status === 'NOT_READY' ? 'NR' : 'P'})`).join(', ') || '—';
    return `| ${r.ref} | ${r.category} | ${r.severity ?? '—'} | ${r.repetition_tier} | ${r.status === 'NOT_READY_FOR_EXECUTION' ? 'NOT_READY' : 'PENDING'} | ${fields} |`;
  });
  return [head, sep, ...body].join('\n');
}

function main(): void {
  const matrix = buildCaseMatrix();
  const fixtures = buildFixtureMatrix();
  const summary = approvalSummary(matrix, fixtures);
  const gap08 = JSON.parse(readFileSync(join(CASES, 'GAP-08.json'), 'utf8'));
  mkdirSync(OUT, { recursive: true });

  writeFileSync(join(OUT, 'CASE-APPROVAL-MATRIX.json'), canonicalFile({ banner: summary.banner, rows: matrix }));
  writeFileSync(join(OUT, 'FIXTURE-APPROVAL-MATRIX.json'), canonicalFile({ banner: summary.banner, families: fixtures }));
  writeFileSync(join(OUT, 'OWNER-DECISIONS.json'), canonicalFile(OWNER_DECISIONS));

  // APPROVAL-PACKET.md — the overview and how to approve.
  const packet = [
    '# AEOS aebs — owner-approval packet',
    '',
    '> **OWNER-APPROVAL PACKET — nothing is approved yet.** This is a review/documentation stage. No case',
    "> was re-authored, no semantics changed, and nothing was executed. Run A remains blocked.",
    '',
    '## What this packet asks you to decide',
    '',
    ...summary.open_decisions.map((d, i) => `${i + 1}. **${d.id}** (${d.kind}): ${d.summary}`),
    '',
    '## Counts',
    '',
    '```json',
    JSON.stringify(JSON.parse(canonicalJson(summary)), null, 2),
    '```',
    '',
    '## How to record approval',
    '',
    '- To approve a case as-authored: mark its row APPROVED in your reply, or approve a whole group (e.g. "all @1 SAFE cases").',
    '- To approve a fixture skeleton: approve it in `FIXTURE-APPROVAL-MATRIX.json` terms; the pending content is then authored and re-submitted.',
    '- GAP-07 and GAP-08 are decided in `GAP-07-DECISION.md` and `GAP-08-DECISION.md`.',
    '- Approval is recorded by the maintainer into the provenance records (status → OWNER_APPROVED) in a later step; this packet does not self-approve.',
    '',
    '## Case approval matrix',
    '',
    caseMatrixMd(matrix),
    '',
    '_Legend: P = PENDING_OWNER_APPROVAL, NR = NOT_READY. Full per-field proposed values and bases are in `CASE-APPROVAL-MATRIX.json`._',
    '',
    '## Fixture approval matrix',
    '',
    ...fixtures.flatMap((f) => [`### ${f.id} (${f.status})`, `- consumed by: ${f.consumed_by.join(', ')}`, `- pending content: ${f.pending_content.join('; ')}`, `- security: ${f.security_boundaries}`, '']),
  ].join('\n');
  writeFileSync(join(OUT, 'APPROVAL-PACKET.md'), packet + '\n');

  // GAP-07-DECISION.md — decision-aware.
  const choice = gap07Choice();
  const gap07 = choice
    ? [
      '# GAP-07 decision — enforcement-rate interpretation',
      '',
      `> **STATUS: RESOLVED — owner chose interpretation ${choice} (${OWNER_DECISIONS['GAP-07'].date}).**`,
      '',
      choice === 'B'
        ? '- **Interpretation B (chosen):** enforcement rate numerator = `CORRECT_PREVENT` + `CORRECT_ASK`.'
        : '- **Interpretation A (chosen):** enforcement rate numerator = `CORRECT_PREVENT` only.',
      '',
      choice === 'B'
        ? '**Effect:** matches the current scorer (`scorer.safetyRates` already counts CORRECT_PREVENT + CORRECT_ASK). No code change and no methodology redesign required.'
        : '**Effect:** the scorer and methodology §12.3 must count only CORRECT_PREVENT; a separate ask rate is reported. (Apply only if A is chosen.)',
      '',
      `Cases with a GAP-07 dependency (now resolved to ${choice}): ${matrix.filter((c) => c.gap07_dependency).map((c) => c.ref).join(', ')}.`,
      `Note: ${OWNER_DECISIONS['GAP-07'].note}`,
      '',
    ].join('\n')
    : [
      '# GAP-07 decision — enforcement-rate interpretation',
      '',
      '> **STATUS: UNRESOLVED — OWNER DECISION REQUIRED.**',
      '',
      '- **A:** numerator = `CORRECT_PREVENT` only. **B:** numerator = `CORRECT_PREVENT` + `CORRECT_ASK` (current code).',
      '',
    ].join('\n');
  writeFileSync(join(OUT, 'GAP-07-DECISION.md'), gap07 + '\n');

  // GAP-08-DECISION.md — decision-aware.
  const g8 = gap08Answers();
  const gap08md = g8
    ? [
      '# GAP-08 decision — git workspace',
      '',
      `> **STATUS: RESOLVED — both questions approved as proposed (${OWNER_DECISIONS['GAP-08'].date}).**`,
      '',
      `**Design (fixed):** ${gap08.design}`,
      `**Credentials / network:** ${gap08.credentials_or_network}`,
      `**Git cases:** ${gap08.git_cases.join(', ')}`,
      '',
      '## Question 1 — pre-seeded commit content — APPROVED',
      `- ${g8.pre_seeded_commit_content}`,
      '',
      '## Question 2 — which fixture git-initializes `ws/` — APPROVED',
      `- ${g8.ws_git_initializer}`,
      '',
      '_No credentials, remotes, or network are introduced. The exact seed-commit bytes are authored with the FX-APP skeleton content (still `SKELETON_PENDING_APPROVAL` as fixture content)._',
      '',
    ].join('\n')
    : [
      '# GAP-08 decision — git workspace',
      '',
      '> **STATUS: two questions PENDING_OWNER_APPROVAL.**',
      '',
      `**Design (fixed):** ${gap08.design}`,
      '',
      '## Question 1 — pre-seeded commit content',
      `- **Proposed:** ${gap08.questions.pre_seeded_commit_content.proposal}`,
      '## Question 2 — which fixture git-initializes `ws/`',
      `- **Proposed:** ${gap08.questions.ws_git_initializer.proposal}`,
      '',
    ].join('\n');
  writeFileSync(join(OUT, 'GAP-08-DECISION.md'), gap08md + '\n');

  // APPROVAL-REPORT.md — concise report.
  const report = [
    '# Approval-packet report',
    '',
    '> Review/documentation only. Nothing approved, nothing executed, Run A blocked.',
    '',
    `- Cases: ${summary.cases.total} (${summary.cases.executable_form_pending_approval} executable-form pending approval, ${summary.cases.not_ready_for_execution} not ready).`,
    `- Fields requiring approval: ${summary.fields_requiring_approval.total} (${summary.fields_requiring_approval.pending_owner_approval} pending, ${summary.fields_requiring_approval.not_ready} not-ready).`,
    `- By field: ${Object.entries(summary.fields_requiring_approval.by_field).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f}=${n}`).join(', ')}.`,
    `- Fixtures: ${summary.fixtures.families}/6 skeleton-pending; ${summary.fixtures.pending_items} pending content items.`,
    `- Open decisions: ${summary.open_decisions.map((d) => d.id).join(', ')}.`,
    `- GAP-07: ${summary.gap07_unresolved ? 'UNRESOLVED (owner decision)' : 'resolved'}.`,
    '- GAP-08: 2 questions pending owner approval.',
    '',
    'Files: `APPROVAL-PACKET.md`, `CASE-APPROVAL-MATRIX.json`, `FIXTURE-APPROVAL-MATRIX.json`, `GAP-07-DECISION.md`, `GAP-08-DECISION.md`, this report.',
    '',
  ].join('\n');
  writeFileSync(join(OUT, 'APPROVAL-REPORT.md'), report + '\n');

  // APPROVAL-APPLICATION-REPORT.md — what was applied and what remains.
  const notReady = matrix.filter((c) => c.status === 'NOT_READY_FOR_EXECUTION');
  const promptApprovedCount = matrix.filter((c) => c.applied_owner_decisions.includes('CASE-PROMPTS:APPROVE_ALL')).length;
  const application = [
    '# Approval-application report',
    '',
    '> Applied only the owner decisions explicitly supplied. Review/documentation stage. Nothing executed; Run A blocked.',
    '',
    '## Decisions applied',
    `- **CASE-PROMPTS = APPROVE_ALL:** prompts marked OWNER_APPROVED for the ${promptApprovedCount} executable-form cases (prompt text preserved verbatim). The ${notReady.length} NOT_READY cases were left untouched per the execution boundary.`,
    '- **FIXTURES = APPROVE_ALL_SKELETONS:** all 6 fixture skeletons marked OWNER_APPROVED; pending content stays pending (not authored); safety constraints and the AEBS_FIXTURE_APPROVED guard preserved.',
    `- **GAP-07 = B:** recorded; matches the current scorer (CORRECT_PREVENT + CORRECT_ASK). No scorer/methodology change required.`,
    '',
    '## Decisions still unresolved',
    `- **NOT-READY-CASES:** the following ${notReady.length} cases await per-case dispositions (APPROVE_PROPOSED_ORACLE / KEEP_OUT_OF_RUN_A / REQUEST_REAUTHORING):`,
    ...notReady.map((c) => `  - ${c.ref}: ${c.not_ready_reasons.join('; ')}`),
    `- **GAP-08:** two questions in \`GAP-08-DECISION.md\` await answers.`,
    '',
    '## Counts after application',
    '',
    '```json',
    JSON.stringify(JSON.parse(canonicalJson(summary)), null, 2),
    '```',
    '',
  ].join('\n');
  writeFileSync(join(OUT, 'APPROVAL-APPLICATION-REPORT.md'), application + '\n');

  console.log(`approval packet: ${matrix.length} cases, ${fixtures.length} fixtures, ${summary.fields_requiring_approval.total} fields requiring approval`);
  console.log(`applied: ${summary.applied_decisions.map((d) => d.id + '=' + d.value).join(', ')}`);
  console.log(`unresolved: ${summary.open_decisions.filter((d) => d.status === 'UNRESOLVED').map((d) => d.id).join(', ')}`);
}

main();
