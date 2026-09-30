// Writes the Phase 4 decision register artifacts (JSON + markdown). Deterministic. Records only; wires
// nothing into the execution gate.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { PHASE4_DECISIONS, PHASE4_REGISTER_DATE } from '../src/phase4-register.ts';

const BENCH = join(dirname(fileURLToPath(import.meta.url)), '..');

const doc = {
  banner: 'PHASE 4 DECISION REGISTER — owner-approved. Recording only; does not authorize execution, spend, or Run A.',
  date: PHASE4_REGISTER_DATE,
  note: 'Created because the Phase 3 BQ table is frozen and must not be edited. This register is the authoritative Phase 4 record for BQ-01, BQ-03, BQ-05, BQ-06, BQ-19, the TS-05 owner decisions (TS-05-MECHANISM, TS-05-EVIDENCE), and the segmented approvals APPROVE-PROVISION-ISOLATED-ENV, APPROVE-AUTHENTICATE-CLAUDE, and APPROVE-ENABLE-REAL-SESSIONS. The harness execution gate (guard.checkRunAuthorization / planRunA) is intentionally NOT wired to this register, so Run A stays blocked and no real Claude session is authorized. Recording the TS-05 decisions does NOT resolve TS-05; recording APPROVE-PROVISION-ISOLATED-ENV authorizes only provisioning+validation of the isolated environment and performs no provisioning; recording APPROVE-AUTHENTICATE-CLAUDE authorizes only isolated authentication for TS-02 and performs no authentication; recording APPROVE-ENABLE-REAL-SESSIONS authorizes only the single real authenticated session that produces the TS-02 evidence (no Run A, case execution, spend, TS-05/07/11) and performs no session.',
  decisions: PHASE4_DECISIONS,
};
writeFileSync(join(BENCH, 'PHASE-4-DECISION-REGISTER.json'), canonicalFile(doc));

const md = [
  '# Phase 4 decision register',
  '',
  `> **${doc.banner}**`,
  `> Date: ${PHASE4_REGISTER_DATE}. ${doc.note}`,
  '',
  ...Object.values(PHASE4_DECISIONS).flatMap((d) => [
    `## ${d.id} — ${d.title}  (${d.status})`,
    '',
    '```json',
    JSON.stringify(d.value, null, 2),
    '```',
    `- **source:** ${d.source_refs.join('; ')}`,
    `- **scope:** ${d.scope_note}`,
    '',
  ]),
  '## Execution gate (unchanged)',
  '',
  '- Recording these decisions does **not** open the real-Claude execution gate. `guard.checkRunAuthorization` still reads the frozen Phase 3 exit-criteria register and continues to refuse the real Claude CLI; `planRunA()` remains blocked.',
  '- BQ-05 keeps **stop-not-substitute**: an unavailable pinned model ID => STOP, never swap (VG-02).',
  '- This register does not resolve TS-02, TS-05, TS-07, TS-11, VG-05, VG-09, GAP-05, or any other BQ/GAP/VG item.',
  '',
].join('\n');
writeFileSync(join(BENCH, 'PHASE-4-DECISION-REGISTER.md'), md + '\n');

console.log(`Phase 4 decision register: ${Object.keys(PHASE4_DECISIONS).length} decisions recorded (BQ-01, BQ-03, BQ-05, BQ-06, BQ-19, TS-05-MECHANISM, TS-05-EVIDENCE, APPROVE-PROVISION-ISOLATED-ENV, APPROVE-AUTHENTICATE-CLAUDE, APPROVE-ENABLE-REAL-SESSIONS).`);
