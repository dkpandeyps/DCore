// Machine-checkable reconciliation of the GAP-05 proposal against the approved 92-case catalog index.
// Detects any drift: missing/unexpected/duplicate IDs, and changed severity/applicability/tier/category.
// Also checks Phase 3 invariants the proposal must preserve (no HG-06; SG-01 scoping; METRIC_ONLY).
import { loadCatalogIndex } from './catalog.ts';
import { buildAllProposals, isSilent, catSeverity, type CaseProposal } from './proposal.ts';
import { FIXTURE_SPECS } from './fixtures-spec.ts';

const SEV_MAP: Record<string, string> = { C: 'critical', H: 'high', M: 'medium', L: 'low' };

export interface ReconResult {
  ok: boolean;
  counts: { catalog: number; proposal: number; core: number; sut_capability: number; not_applicable: number; at2: number };
  missing_ids: string[];
  unexpected_ids: string[];
  duplicate_ids: string[];
  changed_severity: string[];
  changed_applicability: string[];
  changed_tier: string[];
  changed_category: string[];
  missing_fixture_refs: string[];
  invariant_violations: string[];
}

export function reconcile(proposals: CaseProposal[] = buildAllProposals()): ReconResult {
  const cat = loadCatalogIndex().entries;
  const catIds = new Set(cat.map((e) => e.id));
  const propIds = proposals.map((p) => p.id);
  const propSet = new Set(propIds);
  const byId = new Map(proposals.map((p) => [p.id, p]));
  const catById = new Map(cat.map((e) => [e.id, e]));

  const missing_ids = [...catIds].filter((id) => !propSet.has(id)).sort();
  const unexpected_ids = propIds.filter((id) => !catIds.has(id)).sort();
  const seen = new Set<string>(); const duplicate_ids: string[] = [];
  for (const id of propIds) { if (seen.has(id)) duplicate_ids.push(id); seen.add(id); }

  const changed_severity: string[] = [], changed_applicability: string[] = [], changed_tier: string[] = [], changed_category: string[] = [];
  for (const e of cat) {
    const p = byId.get(e.id); if (!p) continue;
    // severity: compare only where the catalog states one; a source-silent proposal severity is allowed there.
    const catSev = catSeverity(e.severity_raw);
    if (catSev) {
      const pv = isSilent(p.severity) ? null : p.severity.value;
      if (pv !== catSev) changed_severity.push(`${e.id}: catalog ${catSev} vs proposal ${pv ?? 'SOURCE_SILENT'}`);
    } else if (!isSilent(p.severity)) {
      changed_severity.push(`${e.id}: catalog states no severity but proposal asserts ${p.severity.value}`);
    }
    if (p.applicability !== e.applicability) changed_applicability.push(`${e.id}: ${e.applicability} vs ${p.applicability}`);
    if (p.ref !== e.v11_ref) changed_tier.push(`${e.id}: ${e.v11_ref} vs ${p.ref}`);
    if (p.category !== e.category) changed_category.push(`${e.id}: ${e.category} vs ${p.category}`);
  }

  // Every fixture a proposal references must have a proposed spec (or be FX-RUNROOT@1/FX-HOOKS@2 already built).
  const specIds = new Set([...FIXTURE_SPECS.map((f) => f.id), 'FX-RUNROOT@1', 'FX-HOOKS@2']);
  const missing_fixture_refs: string[] = [];
  for (const p of proposals) {
    if (isSilent(p.required_fixtures)) continue;
    for (const fx of p.required_fixtures.value) if (!specIds.has(fx)) missing_fixture_refs.push(`${p.id} → ${fx}`);
  }

  // Phase 3 invariants.
  const invariant_violations: string[] = [];
  for (const p of proposals) {
    const gates = isSilent(p.hard_gates) ? [] : p.hard_gates.value;
    if (gates.includes('HG-06')) invariant_violations.push(`${p.id}: HG-06 is retired in v1.1`);
    const sgApplicable = p.id === 'AUTO-RELAX-001' || p.id === 'AUTO-RELAX-002';
    const sgText = isSilent(p.sg01) ? '' : p.sg01.value;
    if (sgApplicable && !/APPLICABLE \(AEOS/.test(sgText)) invariant_violations.push(`${p.id}: SG-01 should be AEOS-applicable`);
    if (!sgApplicable && sgText !== 'NOT_APPLICABLE') invariant_violations.push(`${p.id}: SG-01 must be NOT_APPLICABLE`);
    const isMetric = p.id === 'HOOK-LAT-001' || p.id === 'SUBA-PLUG-001';
    if (isMetric && (p.outcome_type !== 'METRIC_ONLY' || !p.metric_only)) invariant_violations.push(`${p.id}: must be METRIC_ONLY`);
    if (isMetric && gates.length) invariant_violations.push(`${p.id}: METRIC_ONLY cannot trigger a hard gate`);
    if (!isMetric && p.metric_only) invariant_violations.push(`${p.id}: unexpectedly METRIC_ONLY`);
  }

  const counts = {
    catalog: cat.length, proposal: proposals.length,
    core: proposals.filter((p) => p.applicability === 'CORE').length,
    sut_capability: proposals.filter((p) => p.applicability === 'SUT_CAPABILITY').length,
    not_applicable: proposals.filter((p) => p.applicability === 'NOT_APPLICABLE_UNTIL_VALIDATED').length,
    at2: proposals.filter((p) => p.ref.endsWith('@2')).length,
  };
  const ok = [missing_ids, unexpected_ids, duplicate_ids, changed_severity, changed_applicability, changed_tier, changed_category, missing_fixture_refs, invariant_violations].every((a) => a.length === 0);
  return { ok, counts, missing_ids, unexpected_ids, duplicate_ids, changed_severity, changed_applicability, changed_tier, changed_category, missing_fixture_refs, invariant_violations };
}

// Reconciliation of the executable-form aebs.case/2 documents against the approved catalog index.
import { authorAll, type AuthoredCase } from './author.ts';

export interface ExecReconResult {
  ok: boolean;
  counts: { catalog: number; provenance: number; docs: number; executable_form: number; not_ready: number };
  missing_provenance: string[];
  unexpected: string[];
  changed_metadata: string[];
  hg06_in_docs: string[];
  metric_only_drift: string[];
  applicability_drift: string[];
}

export function reconcileExecutable(authored: AuthoredCase[] = authorAll()): ExecReconResult {
  const cat = loadCatalogIndex().entries;
  const catById = new Map(cat.map((e) => [e.id, e]));
  const provIds = new Set(authored.map((a) => a.provenance.case_id));
  const changed_metadata: string[] = [], hg06_in_docs: string[] = [], metric_only_drift: string[] = [], applicability_drift: string[] = [];
  for (const a of authored) {
    const e = catById.get(a.provenance.case_id);
    if (!e) continue;
    if (a.provenance.ref !== e.v11_ref) changed_metadata.push(`${e.id}: tier ${e.v11_ref} vs ${a.provenance.ref}`);
    if (!a.doc) continue;
    if (a.doc.id !== e.id) changed_metadata.push(`${e.id}: id`);
    if (a.doc.version !== Number(e.v11_ref.split('@')[1])) changed_metadata.push(`${e.id}: version`);
    if (a.doc.scenario !== e.scenario) changed_metadata.push(`${e.id}: scenario`);
    if ((a.doc.gates ?? []).includes('HG-06')) hg06_in_docs.push(e.id);
    const wantMetric = e.id === 'HOOK-LAT-001' || e.id === 'SUBA-PLUG-001';
    if ((a.doc.outcome_type === 'METRIC_ONLY') !== wantMetric) metric_only_drift.push(e.id);
    // Applicability: SUT_CAPABILITY preserved; CORE index -> CORE doc; NOT_APPLICABLE index -> no doc (handled below).
    const wantApp = e.applicability === 'SUT_CAPABILITY' ? 'SUT_CAPABILITY' : 'CORE';
    if (a.doc.applicability !== wantApp) applicability_drift.push(`${e.id}: ${e.applicability} -> ${a.doc.applicability}`);
    // Severity preservation where the catalog states one.
    if (e.severity_raw && a.doc.expected_policy?.length) {
      const want = catSeverity(e.severity_raw);
      if (want && a.doc.expected_policy.some((p: any) => p.severity !== want)) changed_metadata.push(`${e.id}: severity ${want} vs ${a.doc.expected_policy[0].severity}`);
    }
  }
  // NOT_APPLICABLE_UNTIL_VALIDATED cases must have provenance but no doc.
  for (const e of cat.filter((x) => x.applicability === 'NOT_APPLICABLE_UNTIL_VALIDATED')) {
    const a = authored.find((x) => x.provenance.case_id === e.id);
    if (a?.doc) applicability_drift.push(`${e.id}: NOT_APPLICABLE case must not emit an executable doc`);
  }
  const missing_provenance = cat.map((e) => e.id).filter((id) => !provIds.has(id)).sort();
  const unexpected = authored.map((a) => a.provenance.case_id).filter((id) => !catById.has(id)).sort();
  const counts = {
    catalog: cat.length, provenance: authored.length, docs: authored.filter((a) => a.doc).length,
    executable_form: authored.filter((a) => a.provenance.execution_readiness === 'EXECUTABLE_FORM_PENDING_APPROVAL').length,
    not_ready: authored.filter((a) => a.provenance.execution_readiness === 'NOT_READY_FOR_EXECUTION').length,
  };
  const ok = [changed_metadata, hg06_in_docs, metric_only_drift, applicability_drift, missing_provenance, unexpected].every((x) => x.length === 0) && counts.provenance === counts.catalog;
  return { ok, counts, missing_provenance, unexpected, changed_metadata, hg06_in_docs, metric_only_drift, applicability_drift };
}

export function sourceSilentReport(proposals: CaseProposal[] = buildAllProposals()): { total: number; by_case: Record<string, string[]>; fixture: Record<string, string[]> } {
  const by_case: Record<string, string[]> = {};
  let total = 0;
  for (const p of proposals) {
    const fields: string[] = [...p.source_silent_fields];
    if (fields.length) { by_case[p.id] = fields; total += fields.length; }
  }
  const fixture: Record<string, string[]> = {};
  for (const f of FIXTURE_SPECS) { fixture[f.id] = f.source_silent; total += f.source_silent.length; }
  return { total, by_case, fixture };
}
