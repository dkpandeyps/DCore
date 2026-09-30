// Writes the fixture-content proposal packet (JSON + markdown) for owner review. Deterministic.
// Proposal only: materializes no fixture bytes, changes no executable-case field, approves nothing.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { FIXTURE_CONTENT_PROPOSAL, TARGET_FIELD_PROPOSALS, type ContentItem } from '../src/fixtures-content.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'proposal');
mkdirSync(OUT, { recursive: true });

const banner = 'FIXTURE-CONTENT PROPOSAL — PROPOSED — NOT APPROVED FOR EXECUTION. No bytes materialized; no field changed; nothing approved.';
writeFileSync(join(OUT, 'FIXTURE-CONTENT-PROPOSAL.json'), canonicalFile({ banner, target_fields: TARGET_FIELD_PROPOSALS, items: FIXTURE_CONTENT_PROPOSAL }));

const byFamily: Record<string, ContentItem[]> = {};
for (const it of FIXTURE_CONTENT_PROPOSAL) (byFamily[it.family] ??= []).push(it);

const bytes = (it: ContentItem): string => {
  if (it.kind === 'both') return `seed:\n\`\`\`\n${it.content_seed}\`\`\`\nexpected:\n\`\`\`\n${it.content_expected}\`\`\``;
  if (it.content) return `\`\`\`\n${it.content}\`\`\``;
  return `_spec:_ ${it.spec}`;
};

const md = [
  '# Fixture-content proposal packet',
  '',
  `> **${banner}**`,
  '',
  '## Three fixture-dependent target fields (remain pending until approved)',
  '',
  '| Case / field | Current | Proposed on approval | Depends on |',
  '|---|---|---|---|',
  ...TARGET_FIELD_PROPOSALS.map((t) => `| ${t.case} / ${t.field} | ${t.current} | ${t.proposed_on_approval} | ${t.depends_on.join('; ')} |`),
  '',
  '## Per-family content proposals (all PENDING_OWNER_APPROVAL)',
  '',
  ...Object.keys(byFamily).sort().flatMap((fam) => [
    `### ${fam}`,
    '',
    ...byFamily[fam].flatMap((it) => [
      `**\`${it.path}\`** — kind: ${it.kind}`,
      `- consumers: ${it.consumers.join(', ')}`,
      `- grounds: ${it.grounds}`,
      it.deps.length ? `- dependencies: ${it.deps.join(' | ')}` : '- dependencies: none',
      `- content: ${bytes(it)}`,
      '',
    ]),
  ]),
  '## Approval note',
  '',
  '- Every item requires explicit owner approval before it is materialized into a fixture builder or before its target field is resolved.',
  '- On approval: FX-APP `auto-l1.txt`, `README.md`, `recv-stale.txt` are materialized, and the three target fields are reauthored to the proposed assertions (then a separate owner approval flips them to OWNER_APPROVED).',
  '- The SUBA-DIS/TOOL `ws/app/src/` availability dependency and the RECV-STALE conflict-report alternative are owner decisions flagged above.',
  '',
].join('\n');
writeFileSync(join(OUT, 'FIXTURE-CONTENT-PROPOSAL.md'), md + '\n');

console.log(`fixture-content proposal: ${FIXTURE_CONTENT_PROPOSAL.length} items across ${Object.keys(byFamily).length} families; ${TARGET_FIELD_PROPOSALS.length} target fields (all pending).`);
