// M4 — Compatibility Certification Harness. Deterministic, repository-side certification machinery.
// It uses the M3 HCL as the enforcement decision boundary (never bypassed), consumes M0/M1/M2, produces
// immutable hash-chained evidence, applies explicit certification gates, and yields a certification decision.
// It NEVER: certifies a real host by itself, executes Claude, resolves TS-07/TS-11, mutates the M1 registry,
// or fabricates owner approval. Owner review is required for CERTIFIED.
import { sha256, canonicalJson } from '../src/canonical.ts';
import { buildRegistry, isSafetyCritical, type Registry } from '../tools/gen-compatibility-registry.ts';
import { buildCatalogue } from '../tools/gen-capability-catalogue.ts';
import { evaluateHost, coreSafetyFeature, FACET_FAMILIES } from './hcl.ts';
import type {
  Probe, Gate, GateOutcome, EvidenceRecord, CertificationResult, CertificationDecision, CertificationInput,
  RegressionResult, LifecycleState, ProposedUpdate,
} from './certification-types.ts';

const CATALOGUE = buildCatalogue();
const SECRET_RE = /(sk-[a-z0-9]{6}|eyJ[a-zA-Z0-9_-]{6}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|"access_token"|"refresh_token"|"api[_-]?key"|"cookie"|bearer\s+[a-z0-9]{6})/i;

// ---- evidence integrity (immutable, hash-chained) ---------------------------------------------------------
export function hashEvidence(rec: Omit<EvidenceRecord, 'record_hash'>): string {
  return sha256(canonicalJson(rec));   // canonical over the record incl. previous_record_hash => chained + tamper-evident
}
export function chainEvidence(records: Omit<EvidenceRecord, 'record_hash' | 'previous_record_hash'>[], prev: string | null = null): EvidenceRecord[] {
  const out: EvidenceRecord[] = [];
  let previous = prev;
  for (const r of records) {
    const base = { ...r, previous_record_hash: previous } as Omit<EvidenceRecord, 'record_hash'>;
    const record_hash = hashEvidence(base);
    out.push({ ...base, record_hash });
    previous = record_hash;
  }
  return out;
}
export function validateEvidenceChain(records: EvidenceRecord[]): boolean {
  let prev: string | null = null;
  for (const r of records) {
    if (r.previous_record_hash !== prev) return false;
    const { record_hash, ...rest } = r;
    if (hashEvidence(rest) !== record_hash) return false;
    prev = record_hash!;
  }
  return true;
}
export function evidenceHasSecrets(records: EvidenceRecord[]): boolean {
  return SECRET_RE.test(JSON.stringify(records));
}

// ---- regression comparison (deterministic; no semver assumptions) -----------------------------------------
export function compareRegression(
  baseline: Record<string, unknown> | null, candidate: Record<string, unknown> | null,
): { result: RegressionResult; diffs: string[] } {
  if (!baseline || !candidate) return { result: 'INCONCLUSIVE', diffs: ['missing baseline or candidate observations'] };
  const diffs: string[] = [];
  const keys = new Set([...Object.keys(baseline), ...Object.keys(candidate)]);
  for (const k of [...keys].sort()) {
    if (canonicalJson(baseline[k]) !== canonicalJson(candidate[k])) diffs.push(k);
  }
  return { result: diffs.length ? 'BEHAVIORAL_CHANGE' : 'NO_BEHAVIORAL_CHANGE', diffs };
}

// ---- certification gates ----------------------------------------------------------------------------------
export function runCertification(input: CertificationInput): CertificationResult {
  const registry = (input.registry as Registry) ?? buildRegistry();
  const feature = input.feature ?? coreSafetyFeature();
  const hcl = evaluateHost({ probe: input.probe, registry, feature });
  const clock = input.clock;
  const gates: Gate[] = [];
  const g = (gate_id: string, name: string, result: GateOutcome, reasons: string[] = []) => gates.push({ gate_id, name, mandatory: true, result, reasons });

  const capById = new Map(input.capabilityProbes.map((p) => [p.target, p]));
  const facetById = new Map(input.facetProbes.map((p) => [p.target, p]));
  const requiredCaps = feature.required_capabilities.map((r) => r.cap_id);
  const safetyCriticalReq = CATALOGUE.capabilities.filter((c) => isSafetyCritical(c) && requiredCaps.includes(c.id));

  // CG-01 identity, CG-02 profile
  g('CG-01', 'exact host identity', hcl.identity_status === 'IDENTIFIED' ? 'PASS' : 'BLOCKED', [`identity_status=${hcl.identity_status}`]);
  g('CG-02', 'exact registry profile',
    hcl.profile_resolution === 'EXACT_MATCH' ? 'PASS' : (hcl.profile_resolution === 'REVOKED_PROFILE' ? 'FAIL' : 'BLOCKED'),
    [`resolution=${hcl.profile_resolution}`]);

  // CG-03 environment identity + isolation evidence (separate cert environment)
  const env = input.environment;
  const envOk = !!env && !!env.environment_id && !!env.platform && !!env.architecture && !!env.isolation_evidence;
  g('CG-03', 'environment identity', envOk ? 'PASS' : 'BLOCKED', env ? [`env=${env.environment_id}`, `isolation=${env.isolation_evidence ?? 'absent'}`] : ['no certification environment supplied']);

  // CG-04 required capability coverage (each required cap has a probe that ran)
  const uncovered = requiredCaps.filter((c) => !capById.has(c) || capById.get(c)!.result === 'NOT_RUN');
  g('CG-04', 'required capability coverage', uncovered.length ? 'BLOCKED' : 'PASS', uncovered.length ? uncovered.map((c) => `NOT_RUN:${c}`) : ['all required capabilities probed']);

  // CG-05 critical capability verification (state VERIFIED AND probe PASS)
  const critReasons: string[] = [];
  let critState: GateOutcome = 'PASS';
  for (const c of safetyCriticalReq) {
    const state = hcl.capability_results.find((r) => r.capability_id === c.id)?.state;
    const pr = capById.get(c.id)?.result;
    if (pr === 'FAIL') { critState = 'FAIL'; critReasons.push(`FAIL:${c.id}`); }
    else if (state !== 'VERIFIED' || pr !== 'PASS') { if (critState !== 'FAIL') critState = 'BLOCKED'; critReasons.push(`UNVERIFIED:${c.id}:state=${state}:probe=${pr ?? 'NOT_RUN'}`); }
  }
  g('CG-05', 'critical capability verification', critState, critReasons.length ? critReasons : ['all safety-critical capabilities VERIFIED and probed PASS']);

  // CG-06 facet verification
  const facetReasons: string[] = [];
  let facetState: GateOutcome = 'PASS';
  for (const fam of feature.required_facets) {
    const resolved = hcl.facet_results.find((f) => f.family === fam)?.state === 'RESOLVED';
    const pr = facetById.get(fam)?.result;
    if (pr === 'FAIL') { facetState = 'FAIL'; facetReasons.push(`FAIL:${fam}`); }
    else if (!resolved || pr !== 'PASS') { if (facetState !== 'FAIL') facetState = 'BLOCKED'; facetReasons.push(`UNRESOLVED:${fam}:resolved=${resolved}:probe=${pr ?? 'NOT_RUN'}`); }
  }
  g('CG-06', 'facet verification', facetState, facetReasons.length ? facetReasons : ['all required facets RESOLVED and probed PASS']);

  // CG-07 attribution verification (in scope + probe PASS + TS-07 resolved for real-host)
  const ap = input.attributionProbe;
  const attrPass = !!ap && ap.result === 'PASS' && hcl.attribution.in_scope && input.ts07.resolved;
  g('CG-07', 'attribution verification', ap?.result === 'FAIL' ? 'FAIL' : (attrPass ? 'PASS' : 'BLOCKED'),
    [`in_scope=${hcl.attribution.in_scope}`, `probe=${ap?.result ?? 'NOT_RUN'}`, `ts07_resolved=${input.ts07.resolved}`, `real_host=${hcl.attribution.real_host}`]);

  // CG-08 stream-schema verification (probe PASS + TS-07 resolved)
  const sp = input.streamProbe;
  const streamPass = !!sp && sp.result === 'PASS' && input.ts07.resolved;
  g('CG-08', 'stream-schema verification', sp?.result === 'FAIL' ? 'FAIL' : (streamPass ? 'PASS' : 'BLOCKED'), [`probe=${sp?.result ?? 'NOT_RUN'}`, `ts07_resolved=${input.ts07.resolved}`]);

  // CG-09 limitation acceptance (owner review covers profile limitations)
  const limsCovered = !!input.ownerReview && hcl.limitations.every((l) => input.ownerReview!.reviewed_limitations.some((rl) => rl === l || rl.includes(l.slice(0, 24))));
  g('CG-09', 'limitation acceptance', input.ownerReview ? (limsCovered ? 'PASS' : 'FAIL') : 'NOT_RUN', [`limitations=${hcl.limitations.length}`, `reviewed=${input.ownerReview?.reviewed_limitations.length ?? 0}`]);

  // CG-10 regression comparison
  g('CG-10', 'regression comparison',
    input.regression.result === 'NO_BEHAVIORAL_CHANGE' ? 'PASS' : (input.regression.result === 'BEHAVIORAL_CHANGE' ? 'FAIL' : 'BLOCKED'),
    [`regression=${input.regression.result}`, ...input.regression.diffs.slice(0, 5)]);

  // CG-11 evidence integrity
  const chainOk = validateEvidenceChain(input.evidence);
  g('CG-11', 'evidence integrity', input.evidence.length ? (chainOk ? 'PASS' : 'FAIL') : 'BLOCKED', [`records=${input.evidence.length}`, `chain_valid=${chainOk}`]);

  // CG-12 no-secret evidence
  const secrets = evidenceHasSecrets(input.evidence);
  g('CG-12', 'no-secret evidence', secrets ? 'FAIL' : 'PASS', [`secrets_found=${secrets}`]);

  // CG-13 owner review
  g('CG-13', 'owner review', input.ownerReview ? (input.ownerReview.decision === 'APPROVE' ? 'PASS' : 'FAIL') : 'NOT_RUN', [`decision=${input.ownerReview?.decision ?? 'ABSENT'}`]);

  // CG-14 TS-07, CG-15 TS-11
  g('CG-14', 'TS-07 attribution/stream live evidence', input.ts07.resolved ? 'PASS' : 'BLOCKED', [`ts07_resolved=${input.ts07.resolved}`]);
  g('CG-15', 'TS-11 NM calibration', !input.ts11.applicable ? 'PASS' : (input.ts11.resolved ? 'PASS' : 'BLOCKED'), [`applicable=${input.ts11.applicable}`, `resolved=${input.ts11.resolved}`]);

  // ---- decision ----
  const revoked = hcl.profile_resolution === 'REVOKED_PROFILE';
  const mandatory = gates.filter((x) => x.mandatory);
  const allPass = mandatory.every((x) => x.result === 'PASS');
  const anyFail = mandatory.some((x) => x.result === 'FAIL');
  const hardBlock = ['CG-01', 'CG-02', 'CG-03'].some((id) => gates.find((x) => x.gate_id === id)!.result === 'BLOCKED');
  let final_decision: CertificationDecision;
  let lifecycle_state: LifecycleState;
  if (revoked) { final_decision = 'REVOKED'; lifecycle_state = 'REVOKED'; }
  else if (allPass) { final_decision = 'CERTIFIED'; lifecycle_state = 'CERTIFIED'; }
  else if (anyFail) { final_decision = 'FAILED'; lifecycle_state = 'FAILED'; }
  else if (hardBlock) { final_decision = 'BLOCKED'; lifecycle_state = hcl.profile_resolution === 'NO_MATCH' ? 'UNVERIFIED' : 'BLOCKED'; }
  else { final_decision = 'NOT_CERTIFIED'; lifecycle_state = 'CERTIFICATION_REVIEW'; }

  const reason_codes = gates.filter((x) => x.result !== 'PASS').map((x) => `${x.gate_id}:${x.result}`);
  const proposed_update: ProposedUpdate | null = final_decision === 'CERTIFIED'
    ? { profile_id: hcl.profile_id!, proposed_state: 'CERTIFIED', evidence: input.evidence.map((e) => e.evidence_id), changed_facets: [], capability_changes: [], reason: 'All mandatory certification gates PASS with owner approval. Registry publication is a separate controlled operation (not performed here).' }
    : null;

  return {
    schema: 'dkskill.certification_result/1', version: 1, synthetic: input.synthetic ?? false,
    run_id: input.run_id, environment_id: env?.environment_id ?? null,
    host_identity: hcl.observed_identity, profile_id: hcl.profile_id, lifecycle_state,
    hcl_enforcement: hcl.enforcement_decision,
    probe_results: [...input.capabilityProbes, ...input.facetProbes, ...(ap ? [ap] : []), ...(sp ? [sp] : [])],
    gate_results: gates,
    capability_results: hcl.capability_results, facet_results: hcl.facet_results,
    regression: input.regression, limitations: hcl.limitations,
    evidence_refs: input.evidence.map((e) => e.evidence_id),
    owner_review: input.ownerReview, final_decision, reason_codes, proposed_update,
  };
}
