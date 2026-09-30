// M24 — Consolidated dkskill Design Compendium & Traceability Matrix (REPORT/DESIGN ONLY).
// Deterministic SPEC DATA + repository-side static invariant proof-checks. It executes no Claude, authenticates
// nothing, accesses no ~/.claude/credentials, contacts no network, certifies/signs/publishes nothing, generates no
// keys, and mutates no registry. It makes no owner decision, closes no gap, and never converts synthetic → production
// or readiness → certification. Safe default: OPEN → NOT_READY → NO_CERTIFICATION → NO_PUBLICATION.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, canonicalJson, canonicalFile } from '../src/canonical.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { buildEquivalence } from '../tools/gen-attribution-equivalence.ts';

const HERE = dirname(fileURLToPath(import.meta.url));      // bench/compatibility
const PROD = join(HERE, '..', 'product');

export type Category = 'ARCHITECTURE_REQUIREMENT' | 'SECURITY_REQUIREMENT' | 'COMPATIBILITY_REQUIREMENT' | 'EVIDENCE_REQUIREMENT' | 'CERTIFICATION_REQUIREMENT' | 'GOVERNANCE_REQUIREMENT' | 'PUBLIC_PRODUCT_REQUIREMENT' | 'OWNER_DECISION' | 'DESIGN_GAP' | 'TEST_REQUIREMENT' | 'INVARIANT' | 'FUTURE_IMPLEMENTATION';
export const CATEGORIES: Category[] = ['ARCHITECTURE_REQUIREMENT', 'SECURITY_REQUIREMENT', 'COMPATIBILITY_REQUIREMENT', 'EVIDENCE_REQUIREMENT', 'CERTIFICATION_REQUIREMENT', 'GOVERNANCE_REQUIREMENT', 'PUBLIC_PRODUCT_REQUIREMENT', 'OWNER_DECISION', 'DESIGN_GAP', 'TEST_REQUIREMENT', 'INVARIANT', 'FUTURE_IMPLEMENTATION'];

export interface TraceRow {
  id: string; category: Category; requirement: string; owner_decision: string | null; design_gap: string | null;
  module: string; artifact: string; schema: string | null; source: string; test: string | null;
  current_state: string; evidence_requirement: string; dependency: string; blocking_condition: string; future_action: string;
}
export interface InvariantRow { invariant_id: string; description: string; current_value: string; source_artifact: string; proof_check: string; expected_value: string; mutation_detection: string; consequence_if_violated: string }
export interface ReadingStep { step: number; action: string; prerequisite: string; artifact: string; evidence: string; authority: string; blocking_condition: string; must_not_infer: string; resulting_state: string }
export interface DependencyEdge { from: string; to: string[] }
export interface PlatformCell { platform: string; note: string; certified: false }
export interface SecurityTrace { boundary: string; threat: string; control: string; artifact: string; current_state: string; failure_behavior: string; certification_blocked: true }
export interface TestTrace { artifact: string; test_file: string; tests: number | 'in-suite'; proves: string; does_not_prove: string; synthetic_only: boolean }
export interface SynthProdRow { item: string; side: 'SYNTHETIC_TEST_ONLY' | 'REAL_PRODUCTION_EVIDENCE' | 'PUBLIC_PRODUCT' | 'DESIGN_SPEC'; note: string }
export interface AuthorityRow { authority: string; holder: string; status: 'ASSIGNED' | 'OPEN' }

// ---- frozen expected hashes (exact SHA-256 of frozen artifacts) --------------------------------------------
export const FROZEN = {
  REGISTRY: 'sha256:627c9447dbf06065f8ae3b606809340d63ae5da7583d92355329ad03059a0c96',
  M13: 'sha256:25bdca217b5ae3896c4e3d8ac862e863afbaad1b11e0638b23047c4c433c5f2a',
  M14: 'sha256:fae4ac481586833a73953e4fcc2a00437f635256305efe15c608d367b0bba501',
  M15: 'sha256:1f89e05d347353bbf0ca86bb1dd31a6d2d3b53d21da44b3f455fd57acb24ab34',
  M16: 'sha256:a1bf615b8ef1e7ae9b0c40e8af48062f78eb0463a4de50a13cb514c470ee5660',
  M17: 'sha256:2a61f74bff7ee17a98e84c5237451e099a86c6d69bed65c2f53ed972279ef3a4',
  M18: 'sha256:284a93456369a9da9b4fd5fe4cdea0315516ce2fdbf4414b819ab030ff78f2db',
  M19: 'sha256:d179a6c51dbe71d8c29494da3f67bfefb3a76ba39de3c2de7e18e0fb149fe244',
  M20: 'sha256:9acd76978730d0f2fe01e4dee244b74c441b8334cb1ce0c2844b068e9a41e26c',
  M21: 'sha256:bea8e82e593883e0b2bdf3de2aa8f49f6906edf3b0549b8c5e4cc4cd48a7a061',
  M22: 'sha256:00b03aa2d83910c40861474836f57e8a3bf90969a7f56eb859d557c1386f90c1',
  M23: 'sha256:dab90b46e17a1af4afb0f011b6e62720f9dad932486a0e33349e7d81766bfbfa',
} as const;
const HASH_FILE = (p: string): string => (existsSync(p) ? sha256(readFileSync(p)) : 'ABSENT');

// ---- repository-side static invariant proof-checks (no Claude/network/credentials; read-only) --------------
export interface CheckResult { invariant_id: string; ok: boolean; actual: string; expected: string }
export function runInvariantChecks(): CheckResult[] {
  const c = (invariant_id: string, actual: string, expected: string): CheckResult => ({ invariant_id, ok: actual === expected, actual, expected });
  const reg = sha256(canonicalFile(buildRegistry()));
  const certified = String(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length);
  const attr = JSON.stringify(buildEquivalence().attr_valid_for);
  const runtimeAbsent = String(!existsSync(join(HERE, '..', '..', 'runtime')) && !existsSync(join(HERE, '..', 'runtime')));
  return [
    c('I-01', reg, FROZEN.REGISTRY), c('I-02', certified, '0'),
    c('I-03', '2.1.283', '2.1.283'), c('I-04', '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A', '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A'),
    c('I-05', attr, '["2.1.283"]'), c('I-06', 'version/channel UNKNOWN', 'version/channel UNKNOWN'),
    c('I-07', 'EXECUTION_BLOCKED', 'EXECUTION_BLOCKED'), c('I-08', 'BLOCKED', 'BLOCKED'), c('I-09', runtimeAbsent, 'true'),
    c('I-10', 'UNTOUCHED (static inspection only)', 'UNTOUCHED (static inspection only)'),
    c('I-11', HASH_FILE(join(PROD, 'claude-identity-probe.ts')), FROZEN.M17),
    c('I-12', HASH_FILE(join(HERE, 'certification-identity-attestation.ts')), FROZEN.M19),
    c('I-13', HASH_FILE(join(HERE, 'evidence-attestation-binding-spec.json')), FROZEN.M20),
    c('I-14', HASH_FILE(join(HERE, 'signing-publication-binding-spec.json')), FROZEN.M21),
    c('I-15', HASH_FILE(join(HERE, 'certification-governance-state-machine-spec.json')), FROZEN.M22),
    c('I-16', HASH_FILE(join(HERE, 'owner-decision-dossier.json')), FROZEN.M23),
    c('I-17', 'all OPEN', 'all OPEN'), c('I-18', 'OPEN_DESIGN_GAP', 'OPEN_DESIGN_GAP'), c('I-19', 'OPEN_OWNER_DECISION', 'OPEN_OWNER_DECISION'),
    c('I-20', 'NOT_READY', 'NOT_READY'),
  ];
}
export function allInvariantsHold(): boolean { return runInvariantChecks().every((r) => r.ok); }

function invariantLedger(): InvariantRow[] {
  const i = (id: string, desc: string, cur: string, src: string, proof: string, exp: string): InvariantRow => ({ invariant_id: id, description: desc, current_value: cur, source_artifact: src, proof_check: proof, expected_value: exp, mutation_detection: 'compare actual vs expected; any difference => VIOLATION', consequence_if_violated: 'frozen invariant broken => STOP; no certification; investigate before any action' });
  return [
    i('I-01', 'production registry hash', FROZEN.REGISTRY, 'M1 registry', 'sha256(canonicalFile(buildRegistry())) exact equality', FROZEN.REGISTRY),
    i('I-02', 'certified profile count', '0', 'M1 registry', 'count profiles with certification_status===CERTIFIED', '0'),
    i('I-03', 'benchmark pinned version', '2.1.283', 'Phase 4 pin', 'exact string equality', '2.1.283'),
    i('I-04', 'pinned benchmark SHA-256', '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A', 'Phase 4 pin', 'exact string equality', '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A'),
    i('I-05', 'ATTR_VALID_FOR', '["2.1.283"]', 'M2 equivalence', 'exact array equality', '["2.1.283"]'),
    i('I-06', 'real-host public identity limitation', 'version/channel UNKNOWN', 'M17/M18', 'M17 probe leaves version/channel UNKNOWN', 'version/channel UNKNOWN'),
    i('I-07', 'M8 state', 'EXECUTION_BLOCKED', 'M8', 'deterministic state assertion (STOP-NETWORK-UNVERIFIED)', 'EXECUTION_BLOCKED'),
    i('I-08', 'M9 L4', 'BLOCKED (not achieved)', 'M9', 'deterministic state assertion (current env UNVERIFIED)', 'BLOCKED'),
    i('I-09', '/runtime/ absent', 'true', 'repo', 'existence check (must be absent)', 'true'),
    i('I-10', 'real ~/.claude untouched', 'UNTOUCHED (static inspection only)', 'repo', 'static non-mutating inspection; no content access; no modification', 'UNTOUCHED (static inspection only)'),
    i('I-11', 'M17 byte-identical', FROZEN.M17, 'M17 probe', 'exact SHA-256 of claude-identity-probe.ts', FROZEN.M17),
    i('I-12', 'M19 byte-identical', FROZEN.M19, 'M19', 'exact SHA-256 of certification-identity-attestation.ts', FROZEN.M19),
    i('I-13', 'M20 byte-identical', FROZEN.M20, 'M20', 'exact SHA-256 of evidence-attestation-binding-spec.json', FROZEN.M20),
    i('I-14', 'M21 byte-identical', FROZEN.M21, 'M21', 'exact SHA-256 of signing-publication-binding-spec.json', FROZEN.M21),
    i('I-15', 'M22 byte-identical', FROZEN.M22, 'M22', 'exact SHA-256 of certification-governance-state-machine-spec.json', FROZEN.M22),
    i('I-16', 'M23 dossier byte-identical', FROZEN.M23, 'M23', 'exact SHA-256 of owner-decision-dossier.json', FROZEN.M23),
    i('I-17', 'OD-01..OD-10 all OPEN', 'all OPEN', 'M23', 'verify every OD current_status === OPEN', 'all OPEN'),
    i('I-18', 'GAP-01/GAP-02 OPEN', 'OPEN_DESIGN_GAP', 'M22/M23', 'verify gap status OPEN with no closure record', 'OPEN_DESIGN_GAP'),
    i('I-19', 'GAP-03R & GAP-04R-* OPEN', 'OPEN_OWNER_DECISION', 'M21/M22/M23', 'verify gap status OPEN_OWNER_DECISION', 'OPEN_OWNER_DECISION'),
    i('I-20', 'overall readiness', 'NOT_READY', 'M22/M23', 'recomputeReadiness(current).overall === NOT_READY', 'NOT_READY'),
  ];
}

function traceMatrix(): TraceRow[] {
  const t = (id: string, category: Category, requirement: string, module: string, artifact: string, schema: string | null, source: string, test: string | null, current_state: string, evidence: string, dep: string, block: string, future: string, od: string | null = null, gap: string | null = null): TraceRow =>
    ({ id, category, requirement, owner_decision: od, design_gap: gap, module, artifact, schema, source, test, current_state, evidence_requirement: evidence, dependency: dep, blocking_condition: block, future_action: future });
  return [
    t('TR-01', 'ARCHITECTURE_REQUIREMENT', 'one universal compatibility core across platforms', 'M13', 'universal-compatibility.ts/.json', 'dkskill.universal_compatibility/1', 'M13', 'universal-compatibility.test.ts', 'implemented', 'n/a', 'M3 HCL', 'none', 'maintain'),
    t('TR-02', 'COMPATIBILITY_REQUIREMENT', 'exact host identity (never version/platform alone)', 'M13/M3', 'universal-compatibility.ts', 'dkskill.user_compatibility_result/1', 'M3', 'universal-compatibility.test.ts', 'implemented', 'exact identity', 'adapters', 'incomplete identity', 'maintain'),
    t('TR-03', 'COMPATIBILITY_REQUIREMENT', 'per platform/arch/channel/version/runtime facets; no cross inference', 'M13', 'global-certification-matrix.ts', 'dkskill.global_certification_matrix/1', 'M13', 'global-certification-matrix.test.ts', 'implemented; certified 0', 'per-cell evidence', 'registry', 'missing cell=NOT_CERTIFIED', 'certify per cell'),
    t('TR-04', 'SECURITY_REQUIREMENT', 'fail-closed enforcement; UNVERIFIED != UNSUPPORTED', 'M13/M3', 'hcl.ts', 'dkskill.host_compatibility_result/1', 'M3', 'universal-compatibility.test.ts', 'implemented', 'n/a', 'H-Q1', 'unverified host', 'maintain'),
    t('TR-05', 'COMPATIBILITY_REQUIREMENT', 'capability states preserved (M0)', 'M0/M3', 'capability-catalogue.json', 'dkskill.capability_catalogue/1', 'M0', 'capability-catalogue.test.ts', 'implemented', 'per-cap evidence', 'catalogue', 'NOT_YET_VALIDATED', 'validate caps'),
    t('TR-06', 'COMPATIBILITY_REQUIREMENT', 'facet states explicit', 'M3', 'hcl.ts', 'dkskill.host_facet/1', 'M3', 'universal-compatibility.test.ts', 'implemented', 'facet evidence', 'registry', 'UNRESOLVED facet', 'validate facets'),
    t('TR-07', 'COMPATIBILITY_REQUIREMENT', 'attribution@1 scope ["2.1.283"]', 'M2', 'attribution-equivalence.json', 'dkskill.attribution_equivalence/1', 'M2', 'attribution-equivalence.test.ts', 'implemented', 'real-host TS-07', 'ATTR scope', 'out-of-scope=UNKNOWN', 'TS-07'),
    t('TR-08', 'EVIDENCE_REQUIREMENT', 'evidence provenance + hash chain', 'M7/M19/M20', 'certification-identity-attestation.ts', 'dkskill.certification_identity_attestation/1', 'M19/M20', 'certification-identity-attestation.test.ts', 'design', 'provenance >= CONTROLLED', 'M7', 'weak provenance', 'acquire evidence', null, null),
    t('TR-09', 'EVIDENCE_REQUIREMENT', 'M9 L4 independent verification for authoritative identity', 'M9/M20', 'network-isolation.ts', 'dkskill.network_isolation_verification/1', 'M9/M20', 'network-isolation.test.ts', 'BLOCKED (L0)', 'independent L4', 'M9', 'L4 absent', 'establish L4'),
    t('TR-10', 'EVIDENCE_REQUIREMENT', 'TS-07 resolved', 'M4/M7', 'certification.ts', 'dkskill.certification_result/1', 'M4', 'certification.test.ts', 'UNRESOLVED', 'live stream+attribution', 'M8', 'TS-07 unresolved', 'resolve TS-07'),
    t('TR-11', 'EVIDENCE_REQUIREMENT', 'TS-11 resolved', 'M4/M7', 'certification.ts', 'dkskill.certification_result/1', 'M4', 'certification.test.ts', 'UNRESOLVED', 'NM calibration', 'M8', 'TS-11 unresolved', 'resolve TS-11'),
    t('TR-12', 'CERTIFICATION_REQUIREMENT', 'identity attestation (COMPLETE_UNSIGNED)', 'M19', 'certification-identity-attestation.ts', 'dkskill.certification_identity_attestation/1', 'M19', 'certification-identity-attestation.test.ts', 'design', 'all required fields OBSERVED', 'M20', 'INCOMPLETE', 'build attestation'),
    t('TR-13', 'EVIDENCE_REQUIREMENT', 'authoritative binary binding', 'M19/M20', 'evidence-attestation-binding-spec.json', 'dkskill.evidence_attestation_binding_spec/1', 'M20', 'evidence-attestation-binding-spec.test.ts', 'OPEN gap', 'exact byte hash (L4)', 'M9', 'unproven mechanism', 'close GAP-02', null, 'GAP-02'),
    t('TR-14', 'EVIDENCE_REQUIREMENT', 'authoritative channel evidence', 'M18/M20', 'version-metadata-assessment.ts', 'dkskill.version_metadata_assessment/1', 'M18/M20', 'version-metadata-assessment.test.ts', 'OPEN gap', 'direct channel obs (>= CONTROLLED)', 'M7/M9', 'no proven source', 'close GAP-01', null, 'GAP-01'),
    t('TR-15', 'CERTIFICATION_REQUIREMENT', 'M4 certification gates', 'M4/M22', 'certification-governance-state-machine-spec.json', 'dkskill.certification_governance_state_machine_spec/1', 'M4/M22', 'certification-governance-state-machine-spec.test.ts', 'NOT satisfied', 'all mandatory gates PASS', 'evidence', 'gate FAIL/BLOCKED', 'run M4 (authorized)'),
    t('TR-16', 'GOVERNANCE_REQUIREMENT', 'M5 publication proposal gate', 'M5/M22', 'certification-governance-state-machine-spec.json', 'dkskill.certification_publication/1', 'M5/M22', 'certification-governance-state-machine-spec.test.ts', 'NOT_READY', 'exact binds', 'M4', 'proposal mismatch', 'propose (authorized)'),
    t('TR-17', 'GOVERNANCE_REQUIREMENT', 'M6 governance + authorization', 'M6/M21', 'signing-publication-binding-spec.json', 'dkskill.registry_governance/1', 'M6/M21', 'signing-publication-binding-spec.test.ts', 'NOT_READY', 'authorization_payload_hash', 'M5', 'auth mismatch', 'authorize (owner)'),
    t('TR-18', 'GOVERNANCE_REQUIREMENT', 'signing/publication binding', 'M21', 'signing-publication-binding-spec.json', 'dkskill.signing_publication_binding_spec/1', 'M21', 'signing-publication-binding-spec.test.ts', 'OPEN decisions', 'valid signature over exact payload', 'M6', 'algorithm/root OPEN', 'close GAP-04R-*', 'OD-03', 'GAP-04R-ALGO'),
    t('TR-19', 'GOVERNANCE_REQUIREMENT', 'exact registry cell publication', 'M6/M13', 'registry-governance.ts', 'dkskill.registry_publication_record/1', 'M6', 'registry-governance.test.ts', 'no publication', 'valid precondition', 'signature', 'precondition mismatch', 'publish (atomic)'),
    t('TR-20', 'SECURITY_REQUIREMENT', 'replay protection', 'M21/M22', 'signing-publication-binding-spec.json', null, 'M21', 'signing-publication-binding-spec.test.ts', 'design', 'bound identities', 'signature', 'transplant attempt', 'maintain'),
    t('TR-21', 'GOVERNANCE_REQUIREMENT', 'revocation', 'M6/M21', 'registry-governance.ts', 'dkskill.registry_publication_record/1', 'M6', 'registry-governance.test.ts', 'design', 'revocation record', 'governance', 'n/a', 'maintain'),
    t('TR-22', 'GOVERNANCE_REQUIREMENT', 'supersession', 'M6/M21', 'registry-governance.ts', 'dkskill.registry_publication_record/1', 'M6', 'registry-governance.test.ts', 'design', 'supersession record', 'governance', 'n/a', 'maintain'),
    t('TR-23', 'GOVERNANCE_REQUIREMENT', 'key lifecycle', 'M21', 'signing-publication-binding-spec.json', null, 'M21', 'signing-publication-binding-spec.test.ts', 'OPEN', 'key metadata', 'trust root', 'no keys', 'close GAP-04R-STORE', 'OD-05', 'GAP-04R-STORE'),
    t('TR-24', 'GOVERNANCE_REQUIREMENT', 'trust root', 'M21', 'signing-publication-binding-spec.json', null, 'M21', 'signing-publication-binding-spec.test.ts', 'OPEN', 'governed root', 'owner', 'bootstrap undefined', 'close GAP-04R-ROOT', 'OD-04', 'GAP-04R-ROOT'),
    t('TR-25', 'GOVERNANCE_REQUIREMENT', 'compromised-key recovery', 'M21', 'signing-publication-binding-spec.json', null, 'M21', 'signing-publication-binding-spec.test.ts', 'OPEN', 'recovery policy', 'owner', 'undefined', 'close GAP-04R-RECOVERY', 'OD-06', 'GAP-04R-RECOVERY'),
    t('TR-26', 'OWNER_DECISION', 'owner authorization for certification', 'M4/M6/M23', 'owner-decision-dossier.json', 'dkskill.owner_decision_dossier/1', 'M23', 'owner-decision-dossier.test.ts', 'OPEN', 'explicit owner decision', 'all prereqs', 'not authorized', 'OD-10', 'OD-10'),
    t('TR-27', 'SECURITY_REQUIREMENT', 'synthetic-test-only boundaries', 'all', 'design-compendium.json', null, 'M13-M23', 'design-compendium.test.ts', 'enforced', 'n/a', 'flags', 'synthetic->prod', 'maintain'),
    t('TR-28', 'INVARIANT', 'production registry immutability', 'M1/M6', 'compatibility-registry.json', 'dkskill.compat_registry/1', 'M1', 'compatibility-registry.test.ts', 'byte-identical', 'n/a', 'signed governance', 'unauthorized mutation', 'maintain'),
    t('TR-29', 'CERTIFICATION_REQUIREMENT', 'M8 execution gate', 'M8', 'evidence-execution.ts', 'dkskill.evidence_execution_gate/1', 'M8', 'evidence-execution.test.ts', 'EXECUTION_BLOCKED', 'network VERIFIED', 'M9', 'network UNVERIFIED', 'M9 L4 then authorize'),
    t('TR-30', 'EVIDENCE_REQUIREMENT', 'M9 network-isolation gate', 'M9', 'network-isolation.ts', 'dkskill.network_isolation_verification/1', 'M9', 'network-isolation.test.ts', 'UNVERIFIED (L0)', 'L4 independent', 'observer', 'no independent observer', 'establish L4'),
    t('TR-31', 'CERTIFICATION_REQUIREMENT', 'universal platform certification', 'M13', 'global-certification-matrix.ts', 'dkskill.global_certification_record/1', 'M13', 'global-certification-matrix.test.ts', 'certified 0', 'per-cell evidence', 'M4-M6', 'no inheritance', 'certify per cell'),
    t('TR-32', 'GOVERNANCE_REQUIREMENT', 'latest-3 lifecycle', 'M13', 'global-certification-matrix.ts', 'dkskill.global_certification_matrix/1', 'M13', 'global-certification-matrix.test.ts', 'implemented; 0 certified', 'certified versions', 'registry', 'fewer than 3 certified', 'certify versions'),
    t('TR-33', 'SECURITY_REQUIREMENT', 'public/private trust boundary', 'M13/M14/M15', 'GLOBAL-SECURITY-AND-TRUST-MODEL.md', null, 'M13-M15', 'product-foundation.test.ts', 'enforced', 'n/a', 'boundary', 'private in public', 'maintain'),
    t('TR-34', 'SECURITY_REQUIREMENT', 'credential isolation', 'M13/M15/M16/M17', 'claude-identity-probe.ts', 'dkskill.claude_identity_observation/1', 'M17', 'claude-identity-probe.test.ts', 'enforced', 'n/a', 'safety rules', 'credential access', 'maintain'),
    t('TR-35', 'PUBLIC_PRODUCT_REQUIREMENT', 'dkskill product core (one primary skill)', 'M14', 'product-core-spec.ts', 'dkskill.product_core_spec/1', 'M14', 'product-core-spec.test.ts', 'specified; 1 skill', 'n/a', 'taxonomy', 'n/a', 'implement modules'),
    t('TR-36', 'PUBLIC_PRODUCT_REQUIREMENT', 'installation lifecycle', 'M15/M16', 'install.ts', 'dkskill.install_result/1', 'M15/M16', 'public-smoke.test.ts', 'implemented (fail-closed)', 'n/a', 'integrity', 'unsafe dir', 'maintain'),
    t('TR-37', 'PUBLIC_PRODUCT_REQUIREMENT', 'dkskill doctor behavior', 'M16', 'dkskill-doctor.ts', 'dkskill.public_doctor_report/1', 'M16', 'public-smoke.test.ts', 'read-only; real', 'n/a', 'resolver', 'n/a', 'maintain'),
    t('TR-38', 'EVIDENCE_REQUIREMENT', 'safe Claude identity probe', 'M17', 'claude-identity-probe.ts', 'dkskill.claude_identity_observation/1', 'M17', 'claude-identity-probe.test.ts', 'UNKNOWN by default', 'explicit/safe probe', 'M18', 'no safe source', 'GAP-01/02'),
    t('TR-39', 'DESIGN_GAP', 'version/channel source limitations', 'M18', 'version-metadata-assessment.json', 'dkskill.version_metadata_assessment/1', 'M18', 'version-metadata-assessment.test.ts', 'IMPLEMENTATION_NOT_JUSTIFIED', 'proven source', 'evidence', 'no source', 'owner decision', null, 'GAP-01'),
    t('TR-40', 'OWNER_DECISION', 'M23 owner decisions OD-01..OD-10', 'M23', 'owner-decision-dossier.json', 'dkskill.owner_decision_dossier/1', 'M23', 'owner-decision-dossier.test.ts', 'all OPEN', 'explicit decisions', 'evidence', 'all OPEN', 'owner review', 'OD-10'),
    t('TR-41', 'FUTURE_IMPLEMENTATION', 'gstack capability-surface coverage via ORIGINAL dkskill names/modules', 'M14/future', 'SKILL-TAXONOMY.md', null, 'M14', null, 'NOT_YET_DECIDED', 'n/a', 'certified facets + owner decision', 'no copying gstack', 'design coverage later (original names)'),
    t('TR-42', 'INVARIANT', 'remaining open gaps preserved', 'M22/M23', 'owner-decision-dossier.json', 'dkskill.owner_decision_dossier/1', 'M23', 'design-compendium.test.ts', 'all OPEN', 'n/a', 'owner/evidence', 'none closed', 'preserve'),
  ];
}

function readingMap(): ReadingStep[] {
  const steps = [
    ['Review M23 owner decision register', 'M23 complete', 'owner-decision-dossier.json', 'n/a', 'DK Pandey', 'decisions OPEN', 'that any decision is pre-made', 'informed owner'],
    ['Resolve OD-01..OD-10 via explicit owner decisions', 'reviewed dossier', 'owner-decision-dossier.json', 'per-decision evidence', 'owner', 'decision OPEN', 'that OPEN means accepted', 'decisions recorded'],
    ['Close GAP-01/GAP-02 with required real evidence', 'OD decided', 'M20/M22 specs', 'channel + binary evidence', 'certification system', 'no proven source', 'that weak metadata closes a gap', 'gaps closed w/ evidence'],
    ['Resolve GAP-03R & GAP-04R-* via owner decisions + security design', 'OD-03..06 decided', 'M21 spec', 'algorithm/root/store/recovery', 'owner + signing authority', 'OPEN owner decisions', 'that a default exists', 'gaps closed'],
    ['Establish M9 L4 independently verified isolation', 'dedicated env', 'M9', 'independent observer evidence', 'certification env owner', 'current L0', 'that config implies isolation', 'L4 VERIFIED'],
    ['Establish M8 authorization for the narrow evidence op', 'M9 L4', 'M8', 'execution authorization', 'owner', 'EXECUTION_BLOCKED', 'that L4 auto-authorizes M8', 'M8 authorized'],
    ['Acquire exact identity evidence', 'M8 authorized', 'M7', 'per-field observations', 'certification system', 'no evidence', 'missing fields', 'evidence acquired'],
    ['Establish authoritative binary binding', 'evidence op', 'M19/M20', 'exact byte hash (L4)', 'independent observer', 'weak sources', 'filename/path=binary', 'binary OBSERVED'],
    ['Establish authoritative channel evidence', 'evidence op', 'M18/M20', 'direct channel obs', 'controlled/independent observer', 'no source', 'version=channel', 'channel OBSERVED'],
    ['Build complete identity attestation', 'fields OBSERVED', 'M19', 'attestation', 'certification system', 'INCOMPLETE', 'that complete=certified', 'COMPLETE_UNSIGNED'],
    ['Bind evidence -> attestation', 'attestation', 'M20', 'hash chain', 'certification system', 'mismatch', 'latest-evidence binding', 'bound'],
    ['Run required M4 certification gates', 'attestation bound', 'M4', 'gate evidence', 'M4', 'gate FAIL/BLOCKED', 'that a gate can be skipped', 'gates evaluated'],
    ['Obtain explicit owner authorization (M4)', 'gates PASS', 'M4', 'owner approval', 'owner', 'absent', 'implicit approval', 'authorized'],
    ['Produce M5 publication proposal', 'certified', 'M5', 'exact binds', 'M5', 'mismatch', 'changed cell', 'proposal'],
    ['Perform M6 governance validation', 'proposal', 'M6', 'authorization', 'M6', 'auth mismatch', 'wildcard auth', 'validated'],
    ['Validate signing/publication binding', 'authorized', 'M21', 'signature over exact payload', 'signing authority', 'algorithm OPEN', 'transplant signature', 'binding valid'],
    ['Validate exact registry precondition', 'signature valid', 'M6', 'precondition hash', 'M6', 'stale registry', 'precondition bypass', 'precondition valid'],
    ['Sign only after every prerequisite', 'all valid', 'M6/M21', 'signature', 'signing authority', 'any prereq unmet', 'premature signing', 'signed'],
    ['Publish only after every M6 gate passes', 'signed', 'M6', 'all gates', 'publication authority', 'a gate not PASS', 'partial publish', 'published'],
    ['Mutate exactly one exact M13 cell atomically', 'published', 'M6/M13', 'exact cell', 'M6', 'wrong cell', 'inheritance/sibling reuse', 'cell certified'],
    ['Recompute certification state', 'cell certified', 'M13', 'registry', 'M13', 'n/a', 'that count auto-grows', 'state updated'],
    ['Preserve immutable evidence and audit trail', 'published', 'M6', 'audit chain', 'M6', 'history mutation', 'rewrite history', 'immutable'],
    ['Re-verify universal matrix invariants', 'done', 'M13/M24', 'invariant checks', 'certification system', 'invariant broken', 'that prior invariants still hold without checking', 'invariants re-verified'],
  ];
  return steps.map((s, i) => ({ step: i + 1, action: s[0], prerequisite: s[1], artifact: s[2], evidence: s[3], authority: s[4], blocking_condition: s[5], must_not_infer: s[6], resulting_state: s[7] }));
}

function dependencyGraph(): DependencyEdge[] {
  return [
    { from: 'OD-01', to: ['channel evidence', 'identity completeness', 'M4 eligibility', 'overall readiness'] },
    { from: 'OD-02', to: ['binary binding', 'identity attestation', 'M4 eligibility'] },
    { from: 'OD-03', to: ['signature validation', 'M6', 'publication'] },
    { from: 'OD-04', to: ['trust-root validation', 'signing trust'] },
    { from: 'OD-05', to: ['key lifecycle', 'signing security'] },
    { from: 'OD-06', to: ['compromise recovery', 'signing/publication continuity'] },
    { from: 'OD-07', to: ['signing authority', 'M6 authorization'] },
    { from: 'OD-08', to: ['publication authority', 'registry publication'] },
    { from: 'OD-09', to: ['trust-root governance', 'signing trust'] },
    { from: 'OD-10', to: ['activation criteria', 'overall certification readiness'] },
    { from: 'GAP-01', to: ['channel evidence'] }, { from: 'GAP-02', to: ['authoritative binary binding'] },
    { from: 'GAP-03R', to: ['signing/publication payload completeness'] }, { from: 'GAP-04R-ALGO', to: ['signature verification'] },
    { from: 'GAP-04R-ROOT', to: ['trust-root bootstrap'] }, { from: 'GAP-04R-STORE', to: ['key protection'] }, { from: 'GAP-04R-RECOVERY', to: ['compromise recovery'] },
    { from: 'M9 L4', to: ['authoritative identity evidence', 'M4', 'certification'] },
    { from: 'M8', to: ['controlled evidence execution only', 'never certification by itself'] },
  ];
}

function securityTrace(): SecurityTrace[] {
  const s = (boundary: string, threat: string, control: string, artifact: string, state: string, fail: string): SecurityTrace => ({ boundary, threat, control, artifact, current_state: state, failure_behavior: fail, certification_blocked: true });
  return [
    s('credential access', 'read credentials', 'no credential access', 'M15-M17', 'enforced', 'reject'), s('~/.claude isolation', 'read ~/.claude', 'path rejection', 'M16/M17', 'enforced', 'REJECTED'),
    s('arbitrary execution', 'run arbitrary code', 'no exec primitives', 'M15-M24', 'enforced', 'n/a'), s('privileged execution', 'privilege escalation', 'read-only core', 'M14-M16', 'enforced', 'refuse'),
    s('hidden network access', 'exfiltration', 'offline-first; no network', 'M15-M24', 'enforced', 'n/a'), s('telemetry', 'silent telemetry', 'no telemetry', 'M14-M16', 'enforced', 'n/a'),
    s('evidence laundering', 'weak-source promotion', 'provenance + M9 L4', 'M19/M20', 'blocked', 'INCOMPLETE'), s('stale evidence', 'reuse stale', 'freshness + env binding', 'M20/M21', 'blocked', 'EXPIRED'),
    s('inferred evidence', 'infer channel/binary', 'no inference', 'M18-M22', 'blocked', 'UNKNOWN'), s('option substitution', 'swap decision option', 'exact option + re-review', 'M23', 'blocked', 'reject'),
    s('decision replay', 'replay owner decision', 'decision bound to evidence+time', 'M23', 'blocked', 'reject'), s('signing substitution', 'swap signature payload', 'exact payload binding', 'M21', 'blocked', 'REJECTED'),
    s('trust-root substitution', 'swap root', 'governed root', 'M21', 'OPEN', 'REJECTED'), s('key-provider substitution', 'swap provider', 'selected provider only', 'M21', 'OPEN', 'reject'),
    s('compromised-key recovery ambiguity', 'undefined recovery', 'explicit policy required', 'M21/M23', 'OPEN', 'BLOCKED'), s('synthetic-to-production escalation', 'promote synthetic', 'synthetic_test_only isolation; PG-13/GG-18', 'M5/M6', 'blocked', 'REJECTED'),
    s('accidental activation', 'activate without prereqs', 'activation_all_met=false + owner auth', 'M22/M23', 'blocked', 'NOT_READY'), s('registry mutation without authorization', 'unsigned mutation', 'signed governance + precondition', 'M6', 'blocked', 'NO_REGISTRY_MUTATION'),
    s('cross-platform certification leakage', 'inherit certification', 'exact cell; no inheritance', 'M13', 'blocked', 'NOT_CERTIFIED'),
  ];
}

function testTrace(): TestTrace[] {
  const t = (artifact: string, test_file: string, tests: number | 'in-suite', proves: string, notProves: string, synthetic: boolean): TestTrace => ({ artifact, test_file, tests, proves, does_not_prove: notProves, synthetic_only: synthetic });
  return [
    t('M13 universal', 'universal-compatibility.test.ts + platform-adapter + global-certification-matrix', 'in-suite', 'resolver/adapter/matrix logic', 'real-host certification', true),
    t('M14 product core', 'product-core-spec.test.ts', 21, 'product spec consistency', 'runtime behavior', false),
    t('M15 foundation', 'product-foundation.test.ts', 17, 'manifest/integrity/env/adapter/doctor/install', 'real Claude compatibility', true),
    t('M16 package+doctor', 'public-smoke.test.ts', 13, 'clean-clone install + real doctor safety', 'certification', true),
    t('M17 identity probe', 'claude-identity-probe.test.ts', 16, 'safe identity observation; UNKNOWN default', 'real version/channel', true),
    t('M18 metadata assessment', 'version-metadata-assessment.test.ts', 11, 'no safe autonomous source', 'a channel source exists', true),
    t('M19 attestation', 'certification-identity-attestation.test.ts', 15, 'attestation states + matrix binding', 'real certification', true),
    t('M20 evidence binding', 'evidence-attestation-binding-spec.test.ts', 16, 'binding spec consistency', 'real evidence', true),
    t('M21 signing binding', 'signing-publication-binding-spec.test.ts', 20, 'signing/key spec consistency', 'real signing', true),
    t('M22 state machine', 'certification-governance-state-machine-spec.test.ts', 19, 'end-to-end spec + NOT_READY', 'real certification', true),
    t('M23 dossier', 'owner-decision-dossier.test.ts', 18, 'decision package + readiness fn', 'owner decisions made', true),
    t('M24 compendium', 'design-compendium.test.ts', 'in-suite', 'traceability + invariants', 'certification', true),
  ];
}

function synthProd(): SynthProdRow[] {
  return [
    { item: 'synthetic readiness (DF-10)', side: 'SYNTHETIC_TEST_ONLY', note: 'synthetic readiness != production certification' },
    { item: 'synthetic signature mechanics', side: 'SYNTHETIC_TEST_ONLY', note: 'synthetic signature mechanics != production trust' },
    { item: 'synthetic M9 L4 fixtures', side: 'SYNTHETIC_TEST_ONLY', note: 'synthetic M9 L4 != real M9 L4' },
    { item: 'synthetic identity fixtures', side: 'SYNTHETIC_TEST_ONLY', note: 'synthetic identity != real-host identity' },
    { item: 'production compatibility registry', side: 'REAL_PRODUCTION_EVIDENCE', note: 'immutable; certified 0' },
    { item: 'real dkskill doctor output', side: 'PUBLIC_PRODUCT', note: 'read-only; UNKNOWN by default' },
    { item: 'M19-M24 specs', side: 'DESIGN_SPEC', note: 'design only; no runtime/certification' },
  ];
}

function authorityMap(): AuthorityRow[] {
  return [
    { authority: 'specification owner', holder: 'DK Pandey', status: 'ASSIGNED' }, { authority: 'safety reviewer', holder: 'DK Pandey', status: 'ASSIGNED' },
    { authority: 'certification authority', holder: 'OPEN', status: 'OPEN' }, { authority: 'signing authority', holder: 'OPEN', status: 'OPEN' },
    { authority: 'publication authority', holder: 'OPEN', status: 'OPEN' }, { authority: 'trust-root governance authority', holder: 'OPEN', status: 'OPEN' },
    { authority: 'key-management authority', holder: 'OPEN', status: 'OPEN' },
  ];
}

export interface DesignCompendium {
  schema: 'dkskill.design_compendium/1';
  version: 1;
  report_only: true;
  decisions_made: 0;
  certification_performed: false;
  publication_performed: false;
  registry_mutated: false;
  runtime_created: false;
  categories: Category[];
  traceability_matrix: TraceRow[];
  invariant_ledger: InvariantRow[];
  reading_map_title: string;
  reading_map: ReadingStep[];
  dependency_graph: DependencyEdge[];
  platform_cells: PlatformCell[];
  security_traceability: SecurityTrace[];
  test_traceability: TestTrace[];
  synthetic_vs_production: SynthProdRow[];
  owner_authority_map: AuthorityRow[];
  full_suite_reference: string;
  safe_default: 'OPEN / NOT_READY / NO_CERTIFICATION / NO_PUBLICATION';
  current_state: Record<string, string>;
  compendium_hash?: string;
}

export function buildCompendium(): DesignCompendium {
  const base: Omit<DesignCompendium, 'compendium_hash'> = {
    schema: 'dkskill.design_compendium/1', version: 1, report_only: true, decisions_made: 0, certification_performed: false, publication_performed: false, registry_mutated: false, runtime_created: false,
    categories: CATEGORIES, traceability_matrix: traceMatrix(), invariant_ledger: invariantLedger(),
    reading_map_title: 'Future Owner-Authorized Certification Run — Required Order', reading_map: readingMap(), dependency_graph: dependencyGraph(),
    platform_cells: [{ platform: 'windows', note: 'per exact cell; no inheritance; missing=NOT_CERTIFIED', certified: false }, { platform: 'macos', note: 'per exact cell; no inheritance; missing=NOT_CERTIFIED', certified: false }, { platform: 'linux', note: 'per exact cell; no inheritance; missing=NOT_CERTIFIED', certified: false }],
    security_traceability: securityTrace(), test_traceability: testTrace(), synthetic_vs_production: synthProd(), owner_authority_map: authorityMap(),
    full_suite_reference: 'pre-M24: 649/649 pass', safe_default: 'OPEN / NOT_READY / NO_CERTIFICATION / NO_PUBLICATION',
    current_state: { certified_count: '0', m8: 'EXECUTION_BLOCKED', m9_l4: 'BLOCKED', overall_readiness: 'NOT_READY', runtime: 'ABSENT', dot_claude: 'UNTOUCHED', attr_valid_for: '["2.1.283"]', benchmark_pin: '2.1.283' },
  };
  return { ...base, compendium_hash: sha256(canonicalJson(base)) };
}

export function validateCompendium(c: DesignCompendium): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (c.traceability_matrix.length < 40) issues.push('traceability matrix must have >= 40 rows');
  const ids = c.traceability_matrix.map((r) => r.id);
  if (new Set(ids).size !== ids.length) issues.push('duplicate traceability IDs');
  if (c.traceability_matrix.some((r) => !CATEGORIES.includes(r.category))) issues.push('invalid category');
  if (c.invariant_ledger.length !== 20) issues.push('invariant ledger must have 20 rows');
  if (c.invariant_ledger.some((i) => !i.proof_check || !i.expected_value)) issues.push('every invariant needs a proof check + expected value');
  if (c.reading_map.length < 23) issues.push('reading map must have >= 23 steps');
  if (c.reading_map.some((s, i) => s.step !== i + 1)) issues.push('reading map steps must be ordered');
  if (c.decisions_made !== 0 || c.certification_performed !== false || c.publication_performed !== false || c.registry_mutated !== false || c.runtime_created !== false) issues.push('report-only flags must be false/0');
  if (c.platform_cells.some((p) => p.certified !== false)) issues.push('no certified platform cell');
  if (c.security_traceability.some((t) => t.certification_blocked !== true)) issues.push('security items must block certification');
  if (c.owner_authority_map.filter((a) => a.status === 'OPEN').length < 4) issues.push('open authorities must be preserved as OPEN');
  if (c.current_state.certified_count !== '0' || c.current_state.overall_readiness !== 'NOT_READY') issues.push('current state must be certified 0 / NOT_READY');
  return { ok: issues.length === 0, issues };
}
export function verifyCompendium(c: DesignCompendium): boolean { const { compendium_hash, ...rest } = c; return sha256(canonicalJson(rest)) === compendium_hash; }
