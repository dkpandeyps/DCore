// M14 — Universal dkskill Product Core Specification engine.
// Deterministic, repository-local, FAIL-CLOSED. Builds the canonical product spec + validators. It implements no
// runtime, certifies nothing, executes no Claude, accesses no credentials, and creates no /runtime/ directory (the
// future runtime location is a documented spec value only). It reuses the frozen M13 universal descriptor read-only.
import { sha256, canonicalJson } from '../src/canonical.ts';
import { buildUniversalCompatibility, SUPPORTED_PLATFORMS, DEFAULT_ENFORCEMENT_LEVEL } from './universal-compatibility.ts';
import type {
  ProductSpec, Manifest, SkillDescriptor, CapabilityDescriptor, OperationDescriptor, PermissionDescriptor,
  ApiContract, LifecycleFailureCase, DecisionItem, FailBehavior, PermissionStatus,
} from './product-core-types.ts';

// ---- permissions (unknown => DENY) ------------------------------------------------------------------------
function permissions(): PermissionDescriptor[] {
  const p = (permission_id: string, name: string, reason: string, e: Partial<PermissionDescriptor>): PermissionDescriptor =>
    ({ permission_id, name, reason, read_only: e.read_only ?? true, affects_filesystem: e.affects_filesystem ?? false, affects_process_execution: e.affects_process_execution ?? false, affects_network: e.affects_network ?? false, affects_credentials: false, affects_external_services: e.affects_external_services ?? false, on_unknown: 'DENY' });
  return [
    p('PERM-READ-ENV', 'read local environment', 'detect host identity (OS/arch/version/channel)', { read_only: true }),
    p('PERM-READ-REGISTRY', 'read compatibility registry', 'resolve exact compatibility profile', { read_only: true, affects_filesystem: true }),
    p('PERM-READ-CONFIG', 'read dkskill configuration', 'load user configuration', { read_only: true, affects_filesystem: true }),
    p('PERM-WRITE-STATE', 'write dkskill state', 'persist per-user diagnostic/cache state (isolated dir)', { read_only: false, affects_filesystem: true }),
    p('PERM-DIAGNOSE', 'run compatibility diagnostic', 'produce dkskill doctor output', { read_only: true }),
  ];
}

// ---- operations (unknown permission => DENY) --------------------------------------------------------------
function operations(): OperationDescriptor[] {
  const o = (operation_id: string, name: string, perm: string, caps: string[], e: Partial<OperationDescriptor>): OperationDescriptor =>
    ({ operation_id, name, read_only: e.read_only ?? true, affects_filesystem: e.affects_filesystem ?? false, affects_process_execution: false, affects_network: false, affects_credentials: false, affects_external_services: false, required_permission_id: perm, required_capabilities: caps, on_unknown_permission: 'DENY' });
  return [
    o('OP-DETECT-ENV', 'detect environment', 'PERM-READ-ENV', [], { read_only: true }),
    o('OP-RESOLVE-COMPAT', 'resolve compatibility', 'PERM-READ-REGISTRY', ['CAP-COMPAT-RESOLVE'], { read_only: true, affects_filesystem: true }),
    o('OP-DIAGNOSE', 'compatibility diagnostic (dkskill doctor)', 'PERM-DIAGNOSE', ['CAP-COMPAT-RESOLVE'], { read_only: true }),
    o('OP-REPORT', 'report actionable result', 'PERM-DIAGNOSE', [], { read_only: true }),
  ];
}

// ---- capabilities (reference frozen M0 semantics) --------------------------------------------------------
function capabilities(): CapabilityDescriptor[] {
  return [
    { capability_id: 'CAP-COMPAT-RESOLVE', name: 'compatibility resolution', depends_on_m0_capability: null, min_state: 'VERIFIED', safety_critical: true, operations: ['OP-RESOLVE-COMPAT', 'OP-DIAGNOSE'] },
    { capability_id: 'CAP-ENV-DETECT', name: 'environment detection', depends_on_m0_capability: null, min_state: 'VERIFIED', safety_critical: false, operations: ['OP-DETECT-ENV'] },
  ];
}

// ---- the ONE initial skill (evidence-based taxonomy decision) --------------------------------------------
function skills(): SkillDescriptor[] {
  return [{
    skill_id: 'dkskill', name: 'dkskill', purpose: 'universal, fail-closed Claude Code compatibility core + diagnostic',
    independently_installable: true, dependencies: [], required_capabilities: ['CAP-COMPAT-RESOLVE', 'CAP-ENV-DETECT'],
    required_facets: ['hook_protocol@1', 'stream_schema@1', 'attribution@1', 'settings_layout@1', 'permission_modes@1'],
    required_permissions: ['PERM-READ-ENV', 'PERM-READ-REGISTRY', 'PERM-READ-CONFIG', 'PERM-DIAGNOSE'], decision_state: 'FROZEN',
  }];
}

function apiContracts(): ApiContract[] {
  return [
    { fn: 'detectEnvironment()', purity: ['ENVIRONMENT_DEPENDENT', 'ADAPTER_DEPENDENT'], inputs: ['local OS/arch/version/channel'], output: 'UniversalHost', fail_closed: true, maps_to: 'platform-adapter.selectAdapter + host probe' },
    { fn: 'resolveHostIdentity()', purity: ['ADAPTER_DEPENDENT', 'DETERMINISTIC_OVER_INPUTS'], inputs: ['UniversalHost'], output: 'HostIdentity', fail_closed: true, maps_to: 'universal-compatibility.normalizeHost' },
    { fn: 'resolveCompatibility()', purity: ['REGISTRY_DEPENDENT', 'DETERMINISTIC_OVER_INPUTS'], inputs: ['HostIdentity', 'registry'], output: 'UserCompatibilityResult', fail_closed: true, maps_to: 'universal-compatibility.resolveUniversal (M3 HCL)' },
    { fn: 'resolveCapabilities()', purity: ['REGISTRY_DEPENDENT', 'DETERMINISTIC_OVER_INPUTS'], inputs: ['profile'], output: 'CapabilityRow[]', fail_closed: true, maps_to: 'M3 resolveCapabilities' },
    { fn: 'resolveFacets()', purity: ['REGISTRY_DEPENDENT', 'DETERMINISTIC_OVER_INPUTS'], inputs: ['profile', 'registry'], output: 'FacetRow[]', fail_closed: true, maps_to: 'M3 resolveFacets' },
    { fn: 'resolvePermissions()', purity: ['DETERMINISTIC_OVER_INPUTS'], inputs: ['operation'], output: 'PermissionStatus', fail_closed: true, maps_to: 'product permission model (unknown=DENY)' },
    { fn: 'enforceCompatibility()', purity: ['DETERMINISTIC_OVER_INPUTS'], inputs: ['UserCompatibilityResult', 'level'], output: 'EnforcementDecision', fail_closed: true, maps_to: 'M3 decideEnforcement' },
    { fn: 'enforceSecurity()', purity: ['DETERMINISTIC_OVER_INPUTS'], inputs: ['manifest', 'registry', 'evidence'], output: 'allow/deny', fail_closed: true, maps_to: 'M6 signed registry + M13 security model' },
  ];
}

function lifecycleFailureCases(): LifecycleFailureCase[] {
  const c = (condition: string, outcome: string): LifecycleFailureCase => ({ condition, behavior: 'FAIL_CLOSED', outcome });
  return [
    c('partial compatibility', 'PARTIALLY_COMPATIBLE: degraded/limited operation only'),
    c('unverified compatibility', 'UNVERIFIED: refuse enforcement (H-Q1); operate read-only diagnostics only'),
    c('unsupported host', 'UNSUPPORTED: no compatibility claim; safe no-op with explanation'),
    c('profile mismatch', 'PROFILE_MISMATCH: refuse'),
    c('revoked profile', 'REVOKED: refuse'),
    c('stale registry', 'refuse enforcement; report staleness'),
    c('malformed manifest', 'reject load'),
    c('tampered package', 'reject (integrity failure)'),
    c('unknown capability', 'treat as NOT_YET_VALIDATED; never VERIFIED'),
    c('unknown permission', 'DENY'),
    c('missing facet', 'PARTIALLY_COMPATIBLE / refuse enforcement'),
    c('adapter failure', 'UNSUPPORTED/UNVERIFIED; refuse'),
    c('runtime failure', 'abort safely; clean up; report'),
  ];
}

function decisionBoundary(): DecisionItem[] {
  const d = (id: string, description: string, boundary: DecisionItem['boundary'], blocker: string | null): DecisionItem => ({ id, description, boundary, blocker });
  return [
    d('D-01', 'universal product core spec + types', 'BUILD_NOW', null),
    d('D-02', 'dkskill doctor diagnostic (read-only) over M13 universal resolver', 'BUILD_NOW', null),
    d('D-03', 'platform adapters (identity normalization only)', 'BUILD_NOW', null),
    d('D-04', 'public manifest + integrity + installation contract', 'BUILD_NOW', null),
    d('D-05', 'enforcement beyond L1 diagnostics on a real host', 'REQUIRES_CERTIFICATION', 'no certified profile; current host UNVERIFIED'),
    d('D-06', 'any real certified facet (Windows/macOS/Linux)', 'REQUIRES_CERTIFICATION', 'independent L4 + M4/M5/M6 + paid infra authorization'),
    d('D-07', 'additional user-facing skills beyond the core', 'REQUIRES_OWNER_DECISION', 'skill taxonomy count NOT_YET_DECIDED; needs certified facets + user research'),
    d('D-08', 'runtime state directory location + on-disk format', 'BUILD_LATER', 'defined in spec; created only at install time, not this phase'),
    d('D-09', 'update/migration executor', 'BUILD_LATER', null),
    d('D-10', 'network-dependent registry refresh', 'REQUIRES_OWNER_DECISION', 'offline-first default; remote refresh policy needs owner decision'),
  ];
}

// ---- canonical product spec -------------------------------------------------------------------------------
export function buildProductSpec(): ProductSpec {
  const perms = permissions(), ops = operations(), caps = capabilities(), sk = skills();
  const manifest_template: Manifest = {
    schema: 'dkskill.product_manifest/1', product: 'dkskill', skill_id: 'dkskill', product_version: '0.1.0-dev', schema_version: '1',
    capabilities: caps.map((c) => c.capability_id), required_facets: sk[0].required_facets, permissions: perms.map((p) => p.permission_id),
    compatibility_requirements: ['exact host identity', 'exact certified profile for enforcement', 'attribution in ATTR_VALID_FOR for attribution-dependent claims'],
    security_requirements: ['signed registry (H-Q6)', 'immutable profiles (H-Q4)', 'no secrets in package', 'fail-closed defaults'],
    dependencies: [], update_policy: 'no automatic compatibility inheritance; new releases start UNVERIFIED',
    integrity: { algorithm: 'sha256', manifest_hash: null }, immutable_identifiers: ['product', 'skill_id'],
    no_windows_assumption: true, no_single_version_identity: true,
  };
  const base: Omit<ProductSpec, 'spec_hash'> = {
    schema: 'dkskill.product_core_spec/1', version: 1, synthetic_test_only: false,
    identity: {
      product: 'dkskill', product_id: 'dkskill.product/1', purpose: 'A universal, fail-closed compatibility core that lets a cloneable Claude Code skill set operate safely only where the exact host is explicitly certified.',
      user_value: 'Deterministic, honest compatibility answers and safe operation on supported/certified environments; clear, actionable diagnostics elsewhere.',
      license: 'Apache-2.0', scope: 'Claude-Code-only until R8', not_platform_specific: true, not_version_specific: true,
    },
    responsibilities: {
      core_runtime: ['discover/load/validate the product', 'run the universal lifecycle', 'fail closed on any unsafe ambiguity'],
      capabilities: ['depend on stable M0 capability IDs', 'never upgrade NOT_YET_VALIDATED to VERIFIED'],
      adapters: ['normalize host identity per platform', 'expose only establishable evidence', 'never declare certification'],
      compatibility: ['resolve exact profile via M3', 'refuse enforcement on UNVERIFIED (H-Q1)'],
      security: ['verify integrity/signature', 'no secrets', 'fail closed'],
      installation: ['platform-neutral clone/discover/validate/install/initialize/compatibility-check'],
      configuration: ['read user config; safe defaults; unknown => safe'],
      update: ['no automatic inheritance; new releases UNVERIFIED'],
      failure: ['every unsafe ambiguity fails closed with an actionable explanation'],
    },
    taxonomy: {
      choice: 'ONE_PRIMARY_WITH_MODULES',
      rationale: 'Initial release: one primary installable skill (dkskill) with internal capability modules. This gives users a single install + single compatibility/permission boundary, matches Claude Code skill discovery, minimizes installation/versioning/testing complexity, and centralizes fail-closed enforcement. A skill FAMILY would multiply install/compat/permission surfaces without evidence of user need. Additional user-facing skills are deferred (NOT_YET_DECIDED) rather than invented to hit a count.',
      initial_release_skill_count: 1, initial_release_skill_count_state: 'FROZEN', skills: sk,
      future_skills_state: 'NOT_YET_DECIDED',
      future_skill_decision_inputs: ['≥1 certified host facet (evidence)', 'validated user workflows/demand', 'permission-isolation requirements per workflow', 'owner decision on scope beyond the core (H-Q2/H-Q3)'],
      evaluation: { user_simplicity: 'single install favors ONE_PRIMARY', skill_discovery: 'one discoverable skill', installation_complexity: 'lowest for ONE_PRIMARY', compatibility_management: 'single resolution point', permission_boundaries: 'single boundary now; split later if isolation needed', security_isolation: 'centralized fail-closed core', versioning: 'one product version line', testing: 'one test surface', maintainability: 'highest for ONE_PRIMARY initially', global_distribution: 'one clone target', future_extensibility: 'internal modules can later split into a family', backward_compatibility: 'immutable identifiers preserved' },
    },
    hierarchy: ['PRODUCT', 'SKILL', 'CAPABILITY', 'OPERATION', 'PERMISSION', 'COMPATIBILITY_REQUIREMENT', 'PLATFORM_ADAPTER', 'HOST_FACET', 'SECURITY_POLICY'],
    manifest_template,
    runtime_lifecycle: ['DISCOVER', 'LOAD', 'VALIDATE', 'DETECT_ENVIRONMENT', 'RESOLVE_COMPATIBILITY', 'RESOLVE_CAPABILITIES', 'RESOLVE_FACETS', 'RESOLVE_PERMISSIONS', 'ENFORCE_SECURITY', 'INITIALIZE', 'EXECUTE', 'OBSERVE_RESULT', 'CLEAN_UP'].map((stage) => ({ stage, on_unsafe: 'FAIL_CLOSED' as FailBehavior, note: 'unsafe ambiguity fails closed' })),
    lifecycle_failure_cases: lifecycleFailureCases(),
    compatibility_api: apiContracts(),
    adapter_contract: { interface_id: 'dkskill.platform_adapter_contract/1', may_provide: ['host identity', 'OS normalization', 'architecture detection', 'runtime facts', 'platform-specific safe operations', 'platform-specific capability evidence'], must_not: ['declare certification', 'assume behavior', 'access credentials', 'bypass M3/M4/M8/M9'], core_contains_platform_behavior: false },
    capabilities: caps, operations: ops, permissions: perms,
    security_requirements: securityRequirements(),
    installation_lifecycle: ['CLONE', 'DISCOVER', 'VALIDATE', 'INSTALL', 'INITIALIZE', 'COMPATIBILITY_CHECK', 'READY_OR_BLOCKED'].map((stage) => ({ stage, behavior: `${stage} (platform-neutral, offline-capable)`, on_failure: 'FAIL_CLOSED' as FailBehavior })),
    update_model: { dkskill_release_versions: 'semver product line', registry_versions: 'versioned + signed', claude_version_changes: 'new Claude version => UNVERIFIED facet', adapter_versions: 'per-adapter semver', capability_changes: 'additive; states preserved', skill_changes: 'immutable identifiers', migration_rules: 'explicit, no inheritance', rollback_rules: 'previous signed registry retained', new_environment_starts: 'UNVERIFIED', automatic_inheritance: false },
    offline_model: { registry_unreachable: 'use last signed local registry; if stale => refuse enforcement', registry_stale: 'refuse enforcement; report', evidence_unrefreshable: 'no upgrade of states', no_network: 'offline-first; diagnostics still work', local_package_available: 'operate from local package', incomplete_compatibility: 'UNVERIFIED; fail closed', missing_info_is_compatible: false },
    trust_boundary: { public_items: ['universal source', 'capability catalogue', 'public compatibility profiles', 'signed registry', 'installation docs', 'supported-platform docs'], private_items: ['certification credentials', 'infrastructure secrets', 'private evidence', 'private audit', 'benchmark credentials', 'signing authority material', 'observer infrastructure'], public_requires_private: false },
    repository_layout: repoLayout(),
    test_layers: [
      { layer: 'product unit', runs_on_user_machine: true, requires_certification_env: false },
      { layer: 'product integration', runs_on_user_machine: true, requires_certification_env: false },
      { layer: 'compatibility', runs_on_user_machine: true, requires_certification_env: false },
      { layer: 'adapter', runs_on_user_machine: true, requires_certification_env: false },
      { layer: 'security', runs_on_user_machine: true, requires_certification_env: false },
      { layer: 'installation', runs_on_user_machine: true, requires_certification_env: false },
      { layer: 'failure-mode', runs_on_user_machine: true, requires_certification_env: false },
      { layer: 'certification', runs_on_user_machine: false, requires_certification_env: true },
      { layer: 'public smoke', runs_on_user_machine: true, requires_certification_env: false },
    ],
    release_model: [
      { stage: 'development', gate: 'spec + unit tests green' }, { stage: 'alpha', gate: 'compatibility core validated' },
      { stage: 'beta', gate: 'installation + failure modes validated' }, { stage: 'release_candidate', gate: '≥1 certified facet + security review' },
      { stage: 'production', gate: 'owner-signed release; per-facet states published (CERTIFIED/UNVERIFIED/NOT_CERTIFIED/UNSUPPORTED)' },
    ],
    future_runtime_location: '<user Claude skills dir>/dkskill/ (package) + <user state dir>/dkskill/ (per-user state) — DEFINED ONLY; not created by this phase; /runtime/ remains absent',
    decision_boundary: decisionBoundary(),
    frozen_foundation: ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13', 'Phase4 register', 'H-Q1..H-Q7', 'benchmark pin', 'ATTR_VALID_FOR', 'production registry'],
    current_state: { production_certified_count: '0', current_real_host: 'UNVERIFIED', m8: 'EXECUTION_BLOCKED', m9: 'UNVERIFIED', attr_valid_for: buildUniversalCompatibility().attribution_valid_for.join(','), default_enforcement: DEFAULT_ENFORCEMENT_LEVEL, supported_platforms: SUPPORTED_PLATFORMS.join(',') },
  };
  return { ...base, spec_hash: sha256(canonicalJson(base)) };
}

function securityRequirements() {
  const s = (threat: string, product_control: string): { threat: string; product_control: string; failure_behavior: FailBehavior } => ({ threat, product_control, failure_behavior: 'FAIL_CLOSED' });
  return [
    s('package tampering', 'sha256 integrity on package/manifest'), s('manifest tampering', 'manifest_hash verification'),
    s('registry tampering', 'signed + immutable registry (M6)'), s('forged certification', 'evidence-based M4 + signed M5/M6'),
    s('wrong host/version/architecture/channel', 'exact M3 identity resolution; no inheritance'), s('stale evidence', 'freshness (M7/M9)'),
    s('revoked/superseded profile', 'explicit states; never COMPATIBLE'), s('capability spoofing', 'M0 states; no upgrade'),
    s('attribution spoofing', 'ATTR_VALID_FOR scope; UNKNOWN otherwise'), s('unsafe fallback', 'fail-closed default; UNVERIFIED != UNSUPPORTED'),
    s('credential leakage', 'no credential access; no secrets in package'), s('unauthorized network activity', 'offline-first; no external calls by default'),
    s('privilege escalation', 'read-only core; explicit minimal permissions'), s('unexpected filesystem mutation', 'writes only to isolated per-user state dir'),
  ];
}
function repoLayout() {
  const r = (path: string, purpose: string, visibility: 'PUBLIC' | 'PRIVATE'): { path: string; purpose: string; visibility: 'PUBLIC' | 'PRIVATE' } => ({ path, purpose, visibility });
  return [
    r('src/product/', 'universal product core + runtime', 'PUBLIC'), r('src/skills/', 'user-facing skills (initially: dkskill)', 'PUBLIC'),
    r('src/capabilities/', 'capability modules', 'PUBLIC'), r('src/adapters/', 'platform adapters', 'PUBLIC'),
    r('src/compatibility/', 'M0–M13 compatibility layers (frozen)', 'PUBLIC'), r('src/security/', 'security/integrity', 'PUBLIC'),
    r('test/', 'public tests', 'PUBLIC'), r('docs/', 'public documentation', 'PUBLIC'),
    r('registry/', 'signed public compatibility registry', 'PUBLIC'), r('certification/ (private repo/infra)', 'certification hosts, credentials, observers, private evidence, signing material', 'PRIVATE'),
  ];
}

// ---- validators (fail-closed) -----------------------------------------------------------------------------
export function validateManifest(m: Manifest): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (m.schema !== 'dkskill.product_manifest/1') issues.push('bad schema');
  if (!m.product || !m.skill_id) issues.push('missing product/skill id');
  if (!m.product_version || !m.schema_version) issues.push('missing version');
  if (m.no_windows_assumption !== true) issues.push('windows assumption present');
  if (m.no_single_version_identity !== true) issues.push('single-version identity present');
  if (m.integrity.algorithm !== 'sha256') issues.push('bad integrity algorithm');
  if (!Array.isArray(m.permissions)) issues.push('permissions not a list');
  return { ok: issues.length === 0, issues };
}
export function resolvePermission(status: PermissionStatus): 'ALLOW' | 'DENY' { return status === 'GRANTED' ? 'ALLOW' : 'DENY'; }   // UNKNOWN/DENIED => DENY
export function taxonomyConsistent(spec: ProductSpec): boolean {
  const capIds = new Set(spec.capabilities.map((c) => c.capability_id));
  const permIds = new Set(spec.permissions.map((p) => p.permission_id));
  const opsOk = spec.operations.every((o) => permIds.has(o.required_permission_id) && o.required_capabilities.every((c) => capIds.has(c)) && o.on_unknown_permission === 'DENY');
  const skillsOk = spec.taxonomy.skills.every((s) => s.required_capabilities.every((c) => capIds.has(c)));
  const countOk = spec.taxonomy.initial_release_skill_count === spec.taxonomy.skills.length;
  return opsOk && skillsOk && countOk;
}
export function decisionsByBoundary(spec: ProductSpec, boundary: DecisionItem['boundary']): DecisionItem[] { return spec.decision_boundary.filter((d) => d.boundary === boundary); }
export function verifySpec(spec: ProductSpec): boolean { const { spec_hash, ...rest } = spec; return sha256(canonicalJson(rest)) === spec_hash; }
