// M18 — safe Claude Code version/channel metadata source ASSESSMENT (research/design).
// Deterministic, repository-local. This is an EVALUATION engine over a fixed catalogue of candidate metadata
// sources; it performs NO real filesystem discovery, executes NO Claude, reads NO ~/.claude / credentials, and
// contacts NO network. It applies explicit safety GATES (never numeric scoring) and produces an acceptance status
// per source plus an overall implementation decision. Assessment does not modify M17; UNKNOWN is a valid result.
import { sha256, canonicalJson } from '../src/canonical.ts';

export type Platform = 'windows' | 'macos' | 'linux' | 'all';
export type Acceptance = 'ACCEPTABLE' | 'CONDITIONALLY_ACCEPTABLE' | 'REJECTED' | 'UNKNOWN';
export type Binding = 'STRONG' | 'WEAK' | 'NONE';
export type MultiInstall = 'DISAMBIGUATED' | 'AMBIGUOUS' | 'NA';
export type ImplementationDecision = 'IMPLEMENTATION_JUSTIFIED' | 'IMPLEMENTATION_NOT_JUSTIFIED';

// Hand-assessed, real-world properties of each candidate source, encoded as deterministic facts.
export interface CandidateFact {
  source_id: string;
  source_category: string;
  platform_scope: Platform[];
  architecture_scope: string[];
  mechanism: string;
  data_available: boolean;
  version_available: boolean;
  channel_available: boolean;
  read_only: boolean;
  non_secret: boolean;
  no_execution: boolean;
  no_network: boolean;
  no_credentials: boolean;
  no_dot_claude: boolean;
  requires_discovery: boolean;        // broad/recursive/PATH-walking discovery (forbidden)
  is_inference: boolean;              // derives a value it cannot directly observe
  is_guessing: boolean;
  deterministic: boolean;
  provenance_recordable: boolean;
  integrity_checkable: boolean;
  binding_to_installation: Binding;   // does the metadata bind to the identified binary/installation?
  universal_core_compatible: boolean;
  adapter_only: boolean;
  multi_install_disambiguation: MultiInstall;
  staleness_detectable: boolean;
  security_risk: string[];
  notes: string;
}

export interface CandidateEvaluation {
  source_id: string;
  version_acceptance: Acceptance;
  channel_acceptance: Acceptance;
  overall_acceptance: Acceptance;
  rejection_reasons: string[];
  gate_failures: string[];
}

export interface MetadataAssessment {
  schema: 'dkskill.version_metadata_assessment/1';
  version: 1;
  research_question: string;
  candidates: CandidateFact[];
  evaluations: CandidateEvaluation[];
  version_source_status: Acceptance;
  channel_source_status: Acceptance;
  accepted_source_id: string | null;
  implementation_decision: ImplementationDecision;
  decision_reasons: string[];
  version_default_when_no_source: 'UNKNOWN';
  channel_default_when_no_source: 'UNKNOWN';
  m17_modified: false;
  assessment_hash?: string;
}

// ---- explicit safety gates (boolean; no scoring) ----------------------------------------------------------
export function hardGateFailures(c: CandidateFact): string[] {
  const f: string[] = [];
  if (!c.read_only) f.push('NOT_READ_ONLY');
  if (!c.non_secret) f.push('SECRET_BEARING');
  if (!c.no_execution) f.push('REQUIRES_EXECUTION');
  if (!c.no_network) f.push('REQUIRES_NETWORK');
  if (!c.no_credentials) f.push('REQUIRES_CREDENTIALS');
  if (!c.no_dot_claude) f.push('READS_DOT_CLAUDE');
  if (c.is_inference) f.push('INFERENCE');
  if (c.is_guessing) f.push('GUESSING');
  if (c.requires_discovery) f.push('REQUIRES_BROAD_DISCOVERY');
  if (!c.deterministic) f.push('NON_DETERMINISTIC');
  if (!c.provenance_recordable) f.push('NO_PROVENANCE');
  if (c.security_risk.length) f.push(...c.security_risk.map((r) => `SECURITY_RISK:${r}`));
  return f;
}

export function evaluateCandidate(c: CandidateFact): CandidateEvaluation {
  const gate_failures = hardGateFailures(c);
  const rejection_reasons: string[] = [...gate_failures];
  if (gate_failures.length) return { source_id: c.source_id, version_acceptance: 'REJECTED', channel_acceptance: 'REJECTED', overall_acceptance: 'REJECTED', rejection_reasons, gate_failures };
  if (!c.data_available) return { source_id: c.source_id, version_acceptance: 'UNKNOWN', channel_acceptance: 'UNKNOWN', overall_acceptance: 'UNKNOWN', rejection_reasons: ['NO_DATA'], gate_failures };

  // Version acceptance: ACCEPTABLE needs strong binding, disambiguation and staleness detection; otherwise, if the
  // value is only trustworthy with an explicitly-supplied path, CONDITIONALLY_ACCEPTABLE.
  let version_acceptance: Acceptance = 'REJECTED';
  if (c.version_available) {
    if (c.binding_to_installation === 'STRONG' && c.multi_install_disambiguation !== 'AMBIGUOUS' && c.staleness_detectable) version_acceptance = 'ACCEPTABLE';
    else { version_acceptance = 'CONDITIONALLY_ACCEPTABLE'; if (c.binding_to_installation !== 'STRONG') rejection_reasons.push('WEAK_BINARY_BINDING'); if (c.multi_install_disambiguation === 'AMBIGUOUS') rejection_reasons.push('MULTI_INSTALL_AMBIGUOUS'); if (!c.staleness_detectable) rejection_reasons.push('STALENESS_UNDETECTABLE'); }
  } else rejection_reasons.push('NO_VERSION');

  // Channel acceptance: channel is only accepted with a DIRECT local non-secret source (never derived).
  let channel_acceptance: Acceptance = 'REJECTED';
  if (c.channel_available) channel_acceptance = c.binding_to_installation === 'STRONG' && c.staleness_detectable ? 'ACCEPTABLE' : 'CONDITIONALLY_ACCEPTABLE';
  else rejection_reasons.push('NO_DIRECT_CHANNEL_SOURCE');

  const rank = (a: Acceptance) => ({ REJECTED: 0, UNKNOWN: 1, CONDITIONALLY_ACCEPTABLE: 2, ACCEPTABLE: 3 } as Record<Acceptance, number>)[a];
  const overall_acceptance: Acceptance = rank(version_acceptance) < rank(channel_acceptance) ? version_acceptance : channel_acceptance;
  return { source_id: c.source_id, version_acceptance, channel_acceptance, overall_acceptance, rejection_reasons: [...new Set(rejection_reasons)], gate_failures };
}

// ---- fixed candidate catalogue (real-world properties encoded as facts; NO real discovery performed) --------
export function candidateCatalogue(): CandidateFact[] {
  const base = { architecture_scope: ['x64', 'arm64'], data_available: true, read_only: true, non_secret: true, no_execution: true, no_network: true, no_credentials: true, no_dot_claude: true, is_inference: false, is_guessing: false, deterministic: true, provenance_recordable: true, universal_core_compatible: true, adapter_only: true, security_risk: [] as string[] };
  return [
    { ...base, source_id: 'NPM_PACKAGE_JSON_AUTODISCOVER', source_category: 'Installed package metadata', platform_scope: ['all'], mechanism: 'read version from @anthropic-ai/claude-code package.json located by walking node_modules/PATH', version_available: true, channel_available: false, requires_discovery: true, integrity_checkable: true, binding_to_installation: 'WEAK', multi_install_disambiguation: 'AMBIGUOUS', staleness_detectable: false, notes: 'auto-locating the package requires broad discovery/PATH walking → forbidden' },
    { ...base, source_id: 'NPM_PACKAGE_JSON_EXPLICIT', source_category: 'Installed package metadata (explicit path)', platform_scope: ['all'], mechanism: 'read version from an EXPLICITLY-supplied package.json path (read-only)', version_available: true, channel_available: false, requires_discovery: false, integrity_checkable: true, binding_to_installation: 'WEAK', multi_install_disambiguation: 'AMBIGUOUS', staleness_detectable: false, notes: 'package.json version ≠ guaranteed to be the binary the user runs; channel absent' },
    { ...base, source_id: 'MACOS_INFO_PLIST_EXPLICIT', source_category: 'Application bundle metadata (explicit path)', platform_scope: ['macos'], mechanism: 'read CFBundleShortVersionString from an EXPLICITLY-supplied Info.plist', version_available: true, channel_available: false, requires_discovery: false, integrity_checkable: true, binding_to_installation: 'WEAK', multi_install_disambiguation: 'AMBIGUOUS', staleness_detectable: false, notes: 'bundle version ≠ cryptographically bound to the running binary; channel absent' },
    { ...base, source_id: 'EMBEDDED_BINARY_VERSION_RESOURCE', source_category: 'Static executable metadata (explicit path)', platform_scope: ['windows', 'macos', 'linux'], mechanism: 'parse an embedded version resource from the EXPLICITLY-supplied binary bytes (read-only, not executed)', version_available: true, channel_available: false, requires_discovery: false, integrity_checkable: true, binding_to_installation: 'STRONG', multi_install_disambiguation: 'DISAMBIGUATED', staleness_detectable: true, data_available: false, notes: 'STRONG binding (same binary M17 hashes) BUT data_available is uncertain — Claude Code may not embed a parseable version resource; treated UNKNOWN until demonstrated' },
    { ...base, source_id: 'PACKAGE_MANAGER_QUERY', source_category: 'Package-manager metadata', platform_scope: ['all'], mechanism: 'npm ls -g / apt/brew query', version_available: true, channel_available: false, no_execution: false, requires_discovery: false, integrity_checkable: false, binding_to_installation: 'WEAK', multi_install_disambiguation: 'AMBIGUOUS', staleness_detectable: false, notes: 'requires subprocess execution → rejected' },
    { ...base, source_id: 'NPM_DIST_TAG_CHANNEL', source_category: 'Channel via npm dist-tag', platform_scope: ['all'], mechanism: 'query npm registry dist-tags (latest/next)', version_available: false, channel_available: true, no_network: false, requires_discovery: false, integrity_checkable: false, binding_to_installation: 'NONE', multi_install_disambiguation: 'AMBIGUOUS', staleness_detectable: false, notes: 'the only channel signal requires network → rejected' },
    { ...base, source_id: 'FILENAME_VERSION', source_category: 'Filename/path inference', platform_scope: ['all'], mechanism: 'parse version from a filename or install directory name', version_available: true, channel_available: false, is_inference: true, requires_discovery: false, integrity_checkable: false, binding_to_installation: 'NONE', multi_install_disambiguation: 'AMBIGUOUS', staleness_detectable: false, notes: 'inference → rejected' },
    { ...base, source_id: 'ENV_VAR_VERSION', source_category: 'Environment variable', platform_scope: ['all'], mechanism: 'read a CLAUDE_* env var claiming a version/channel', version_available: true, channel_available: true, is_inference: true, requires_discovery: false, integrity_checkable: false, binding_to_installation: 'NONE', multi_install_disambiguation: 'AMBIGUOUS', staleness_detectable: false, notes: 'untrusted/inference; env is not bound to any installation → rejected' },
    { ...base, source_id: 'BENCHMARK_OR_REGISTRY_METADATA', source_category: 'Benchmark/registry inference', platform_scope: ['all'], mechanism: 'derive version/channel from the benchmark pin or compatibility registry', version_available: true, channel_available: true, is_inference: true, requires_discovery: false, integrity_checkable: false, binding_to_installation: 'NONE', multi_install_disambiguation: 'NA', staleness_detectable: false, notes: 'forbidden inference from benchmark/registry → rejected' },
    { ...base, source_id: 'RECURSIVE_FS_DISCOVERY', source_category: 'Recursive filesystem discovery', platform_scope: ['all'], mechanism: 'walk the home dir / filesystem to find a Claude installation', version_available: true, channel_available: false, requires_discovery: true, integrity_checkable: false, binding_to_installation: 'WEAK', multi_install_disambiguation: 'AMBIGUOUS', staleness_detectable: false, security_risk: ['broad-fs-read'], notes: 'broad discovery forbidden → rejected' },
    { ...base, source_id: 'DOT_CLAUDE_CONFIG', source_category: 'Claude config file', platform_scope: ['all'], mechanism: 'read version/channel from ~/.claude config', version_available: true, channel_available: true, no_dot_claude: false, requires_discovery: false, integrity_checkable: false, binding_to_installation: 'WEAK', multi_install_disambiguation: 'AMBIGUOUS', staleness_detectable: false, security_risk: ['credential-adjacent'], notes: 'reads ~/.claude (credential-adjacent) → rejected' },
  ];
}

// ---- overall assessment + decision ------------------------------------------------------------------------
export function buildAssessment(): MetadataAssessment {
  const candidates = candidateCatalogue();
  const evaluations = candidates.map(evaluateCandidate);
  const byId = new Map(evaluations.map((e) => [e.source_id, e]));
  // An AUTONOMOUS acceptable version source must be ACCEPTABLE, not require an explicit path, not require discovery.
  const autonomousVersion = candidates.find((c) => byId.get(c.source_id)!.version_acceptance === 'ACCEPTABLE' && !c.requires_discovery && !c.mechanism.includes('EXPLICITLY-supplied'));
  const acceptableChannel = candidates.find((c) => byId.get(c.source_id)!.channel_acceptance === 'ACCEPTABLE');
  const anyConditionalVersion = evaluations.some((e) => e.version_acceptance === 'CONDITIONALLY_ACCEPTABLE');
  const version_source_status: Acceptance = autonomousVersion ? 'ACCEPTABLE' : anyConditionalVersion ? 'CONDITIONALLY_ACCEPTABLE' : 'REJECTED';
  const channel_source_status: Acceptance = acceptableChannel ? 'ACCEPTABLE' : 'REJECTED';

  const decision_reasons: string[] = [];
  const justified = version_source_status === 'ACCEPTABLE' && channel_source_status === 'ACCEPTABLE';
  if (!autonomousVersion) decision_reasons.push('No AUTONOMOUS version source passes every gate: package/bundle metadata has WEAK binary binding, is multi-install ambiguous, and staleness is undetectable; auto-discovery is forbidden; embedded-binary version data is unproven.');
  if (!acceptableChannel) decision_reasons.push('No safe local non-secret CHANNEL source exists: dist-tag needs network, config is ~/.claude/credential-adjacent, and deriving channel from version/filename/OS/registry is forbidden inference. Channel remains UNKNOWN.');
  decision_reasons.push('Version could be CONDITIONALLY_ACCEPTABLE only via an EXPLICITLY-supplied metadata path, which is already approximable through the existing M17 EXPLICIT_INPUT mechanism; no new autonomous production source is justified.');
  const implementation_decision: ImplementationDecision = justified ? 'IMPLEMENTATION_JUSTIFIED' : 'IMPLEMENTATION_NOT_JUSTIFIED';

  const base: Omit<MetadataAssessment, 'assessment_hash'> = {
    schema: 'dkskill.version_metadata_assessment/1', version: 1,
    research_question: 'Can dkskill obtain Claude Code version and/or channel from a local, non-secret, read-only, no-execution, no-network, no-credential, no-~/.claude source that is deterministic, provenance-recordable, integrity-checkable, universally supportable, and fails safely to UNKNOWN?',
    candidates, evaluations, version_source_status, channel_source_status, accepted_source_id: autonomousVersion?.source_id ?? null,
    implementation_decision, decision_reasons, version_default_when_no_source: 'UNKNOWN', channel_default_when_no_source: 'UNKNOWN', m17_modified: false,
  };
  return { ...base, assessment_hash: sha256(canonicalJson(base)) };
}
export function verifyAssessment(a: MetadataAssessment): boolean { const { assessment_hash, ...rest } = a; return sha256(canonicalJson(rest)) === assessment_hash; }
