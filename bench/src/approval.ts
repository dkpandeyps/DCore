// Owner-approval packet assembly (review/documentation only). Reads the already-authored artifacts and
// produces concise approval matrices. It re-authors nothing and changes no case semantics: values come
// straight from author.ts (the same source gen-cases.ts wrote to bench/cases/), and a test asserts the
// matrices match the committed case docs on disk.
import { authorAll, type AuthoredCase } from './author.ts';
import { loadCatalogIndex } from './catalog.ts';
import { catSeverity } from './proposal.ts';
import { buildAllFixtures } from './fixtures-build.ts';
import { FIXTURE_SPECS } from './fixtures-spec.ts';
import { OWNER_DECISIONS, fixtureSkeletonsApproved, gap07Choice, notReadyResolved, gap08Resolved } from './decisions.ts';

export interface CaseApprovalRow {
  id: string;
  ref: string;
  category: string;
  severity: string | null;          // catalog-stated severity (normalized), or null when the row states none
  repetition_tier: '@1' | '@2';
  status: 'EXECUTABLE_FORM_PENDING_APPROVAL' | 'NOT_READY_FOR_EXECUTION';
  approval_status: 'PENDING_OWNER_APPROVAL';
  fields_requiring_approval: { field: string; current_status: 'PENDING_OWNER_APPROVAL' | 'NOT_READY'; proposed_value: string; basis: string; disposition: string | null }[];
  applied_owner_decisions: string[];
  run_a_disposition: 'KEEP_OUT_OF_RUN_A' | null;
  not_ready_reasons: string[];
  gap07_dependency: string | null;
}

// A short, human-readable proposed value pulled from the executable doc for a given provenance field.
function proposedValue(a: AuthoredCase, field: string): string {
  const d = a.doc;
  if (!d) return 'none (NOT_APPLICABLE until validated; no executable document)';
  if (field === 'prompt') return String(d.input?.turns?.[0]?.prompt ?? '').slice(0, 200);
  if (field === 'severity' || field === 'expected_policy.severity') return d.expected_policy?.[0]?.severity ?? '(no policy action)';
  if (field === 'rp_rule') return [...new Set((d.expected_policy ?? []).map((p: any) => p.rp_rule))].join(', ') || '(no policy action)';
  if (field === 'expected_policy.base') return (d.expected_policy ?? []).map((p: any) => (typeof p.expected?.base === 'string' ? p.expected.base : JSON.stringify(p.expected))).join('; ') || '(no policy action)';
  if (field === 'expected_policy.action_signature') return (d.expected_policy ?? []).map((p: any) => p.action_signature?.targets?.join('|')).join('; ');
  if (field === 'expected_result') return (d.expected_result ?? []).map((x: any) => `${x.kind}:${x.target}`).join('; ') || '(none)';
  if (field === 'required_fixtures') return (d.preconditions?.fixtures ?? []).join(', ');
  if (field === 'gates') return (d.gates ?? []).join(', ') || '(none)';
  if (field === 'sg01') return a.provenance.gap07_dependency && (a.id === 'AUTO-RELAX-001' || a.id === 'AUTO-RELAX-002') ? 'APPLICABLE (AEOS/Run B only)' : 'NOT_APPLICABLE';
  if (field === 'applicability') return d.applicability ?? '(none)';
  if (field.startsWith('git_workspace.')) return gap08Value(field.slice('git_workspace.'.length));
  return '(see basis / provenance record)';
}

function gap08Value(key: string): string {
  const map: Record<string, string> = {
    branches_refs: 'PENDING_OWNER_APPROVAL: branch/ref layout not specified (GAP-08)',
    unresolved: 'PENDING_OWNER_APPROVAL: seed-commit content and ws/ git-initializer (GAP-08)',
  };
  return map[key] ?? 'PENDING_OWNER_APPROVAL (GAP-08)';
}

export function buildCaseMatrix(authored: AuthoredCase[] = authorAll()): CaseApprovalRow[] {
  const cat = new Map(loadCatalogIndex().entries.map((e) => [e.id, e]));
  return authored.map((a) => {
    const e = cat.get(a.provenance.case_id)!;
    const fields = Object.entries(a.provenance.fields)
      .filter(([, p]) => p.status === 'PENDING_OWNER_APPROVAL' || p.status === 'NOT_READY')
      .map(([field, p]) => ({ field, current_status: p.status as 'PENDING_OWNER_APPROVAL' | 'NOT_READY', proposed_value: proposedValue(a, field), basis: p.basis, disposition: p.disposition ?? null }))
      .sort((x, y) => x.field.localeCompare(y.field));
    return {
      id: a.provenance.case_id, ref: a.provenance.ref, category: e.category,
      severity: catSeverity(e.severity_raw), repetition_tier: a.provenance.ref.endsWith('@2') ? '@2' : '@1',
      status: a.provenance.execution_readiness, approval_status: 'PENDING_OWNER_APPROVAL',
      fields_requiring_approval: fields, applied_owner_decisions: a.provenance.applied_owner_decisions,
      run_a_disposition: a.provenance.run_a_disposition,
      not_ready_reasons: a.provenance.not_ready_reasons, gap07_dependency: a.provenance.gap07_dependency,
    };
  }).sort((x, y) => x.id.localeCompare(y.id));
}

export interface FixtureApprovalRow {
  id: string;
  status: 'SKELETON_PENDING_APPROVAL';
  skeleton_approval: 'OWNER_APPROVED' | 'PENDING_OWNER_APPROVAL';
  content_status: 'PENDING_OWNER_APPROVAL';       // pending content is never auto-authored
  pending_content: string[];
  consumed_by: string[];
  security_boundaries: string;
  proposed_action: string;
}

export function buildFixtureMatrix(): FixtureApprovalRow[] {
  const specs = new Map(FIXTURE_SPECS.map((f) => [f.id, f]));
  const skeletonApproved = fixtureSkeletonsApproved();
  return buildAllFixtures().map((f) => ({
    id: f.id, status: f.status,
    skeleton_approval: skeletonApproved ? 'OWNER_APPROVED' : 'PENDING_OWNER_APPROVAL',
    content_status: 'PENDING_OWNER_APPROVAL',
    pending_content: f.pending, consumed_by: specs.get(f.id)?.consumed_by ?? [],
    security_boundaries: specs.get(f.id)?.security_boundaries ?? 'synthetic/local; loopback-only; no credentials',
    proposed_action: skeletonApproved
      ? 'Skeleton OWNER_APPROVED (FIXTURES:APPROVE_ALL_SKELETONS). Pending content stays pending until separately approved; nothing runs until AEBS_FIXTURE_APPROVED is set post-approval.'
      : 'Approve the synthetic skeleton, then author the pending content; nothing runs until AEBS_FIXTURE_APPROVED is set post-approval.',
  })).sort((a, b) => a.id.localeCompare(b.id));
}

export interface ApprovalSummary {
  banner: string;
  cases: { total: number; executable_form_pending_approval: number; not_ready_for_execution: number; kept_out_of_run_a: number };
  fields_requiring_approval: { total: number; pending_owner_approval: number; not_ready: number; by_field: Record<string, number>; by_disposition: Record<string, number> };
  fixtures: { families: number; all_skeleton_pending: boolean; skeletons_approved: boolean; pending_items: number };
  applied_decisions: { id: string; value: string; date: string | null; note: string }[];
  open_decisions: { id: string; kind: string; status: 'APPLIED' | 'UNRESOLVED'; summary: string }[];
  gap07_unresolved: boolean;
  gap07_choice: 'A' | 'B' | null;
}

export function approvalSummary(matrix: CaseApprovalRow[] = buildCaseMatrix(), fixtures: FixtureApprovalRow[] = buildFixtureMatrix()): ApprovalSummary {
  // Count fields still requiring approval only on cases that are IN scope for Run A. Cases dispositioned
  // KEEP_OUT_OF_RUN_A are settled by the owner and their pending/not-ready fields no longer block anything.
  const byField: Record<string, number> = {};
  const byDisposition: Record<string, number> = {};
  let pending = 0, notReady = 0;
  for (const c of matrix) {
    if (c.run_a_disposition === 'KEEP_OUT_OF_RUN_A') continue;
    for (const f of c.fields_requiring_approval) {
      byField[f.field] = (byField[f.field] ?? 0) + 1;
      const d = f.disposition ?? 'NONE';
      byDisposition[d] = (byDisposition[d] ?? 0) + 1;
      if (f.current_status === 'PENDING_OWNER_APPROVAL') pending++; else notReady++;
    }
  }
  const promptPending = matrix.filter((c) => c.fields_requiring_approval.some((f) => f.field === 'prompt')).length;
  const notReadyCases = matrix.filter((c) => c.status === 'NOT_READY_FOR_EXECUTION').length;
  const open_decisions: ApprovalSummary['open_decisions'] = [
    { id: 'CASE-PROMPTS', kind: 'case-content', status: OWNER_DECISIONS['CASE-PROMPTS'].status, summary: OWNER_DECISIONS['CASE-PROMPTS'].status === 'APPLIED' ? `APPLIED (APPROVE_ALL): prompts owner-approved for the ${matrix.filter((c) => c.status === 'EXECUTABLE_FORM_PENDING_APPROVAL').length} executable-form cases; ${promptPending} NOT_READY-case prompts deferred.` : `Approve ${promptPending} operationalized prompts.` },
    { id: 'FIXTURES', kind: 'fixture-content', status: OWNER_DECISIONS['FIXTURES'].status, summary: OWNER_DECISIONS['FIXTURES'].status === 'APPLIED' ? `APPLIED (APPROVE_ALL_SKELETONS): ${fixtures.length} skeletons owner-approved; pending content still pending.` : `Approve ${fixtures.length} fixture skeletons.` },
    { id: 'GAP-07', kind: 'methodology', status: OWNER_DECISIONS['GAP-07'].status, summary: gap07Choice() ? `APPLIED: interpretation ${gap07Choice()} (${gap07Choice() === 'B' ? 'CORRECT_PREVENT + CORRECT_ASK count; matches current scorer' : 'only CORRECT_PREVENT counts'}).` : 'Choose the enforcement-rate interpretation (methodology §12.3).' },
    { id: 'NOT-READY-CASES', kind: 'case-readiness', status: OWNER_DECISIONS['NOT-READY-CASES'].status, summary: notReadyResolved() ? `APPLIED (KEEP_OUT_OF_RUN_A): all ${matrix.filter((c) => c.run_a_disposition === 'KEEP_OUT_OF_RUN_A').length} NOT_READY cases kept out of Run A; unchanged and still in the catalog.` : `UNRESOLVED: ${notReadyCases} NOT_READY cases await per-case dispositions.` },
    { id: 'GAP-08', kind: 'fixture-git', status: OWNER_DECISIONS['GAP-08'].status, summary: gap08Resolved() ? 'APPLIED: seed commit = FX-APP skeleton (one tracked file); FX-RUNROOT@1 initializes ws/ with origin -> R/remote.git; local bare remote, no credentials/network.' : 'UNRESOLVED: seed-commit content and ws/ git-initializer await decisions (see GAP-08-DECISION.md).' },
  ];
  const applied_decisions = Object.values(OWNER_DECISIONS).filter((d) => d.status === 'APPLIED').map((d) => ({ id: d.group, value: d.value, date: d.date, note: d.note }));
  const allApplied = Object.values(OWNER_DECISIONS).every((d) => d.status === 'APPLIED');
  return {
    banner: allApplied ? 'OWNER-APPROVAL PACKET — all five decision groups applied; per-field authoring approvals and Run A blockers remain' : 'OWNER-APPROVAL PACKET — decisions partially applied',
    cases: {
      total: matrix.length,
      executable_form_pending_approval: matrix.filter((c) => c.status === 'EXECUTABLE_FORM_PENDING_APPROVAL').length,
      not_ready_for_execution: notReadyCases,
      kept_out_of_run_a: matrix.filter((c) => c.run_a_disposition === 'KEEP_OUT_OF_RUN_A').length,
    },
    fields_requiring_approval: { total: pending + notReady, pending_owner_approval: pending, not_ready: notReady, by_field: byField, by_disposition: byDisposition },
    fixtures: { families: fixtures.length, all_skeleton_pending: fixtures.every((f) => f.status === 'SKELETON_PENDING_APPROVAL'), skeletons_approved: fixtureSkeletonsApproved(), pending_items: fixtures.reduce((s, f) => s + f.pending_content.length, 0) },
    applied_decisions,
    open_decisions,
    gap07_unresolved: gap07Choice() === null,
    gap07_choice: gap07Choice(),
  };
}
