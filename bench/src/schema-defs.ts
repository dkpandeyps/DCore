// JSON Schema definitions for every aebs.* entity, transcribed from
// benchmark-design/PHASE-3-DATA-MODEL.md §2, §3 (v1) and §5 (v1.1, approved BQ-23).
// tools/gen-schemas.ts writes them to bench/schemas/; a test checks the files match.
// Where the data model leaves a structure unspecified, the choice is listed in
// bench/README.md "Specification gaps" (GAP-nn) and referenced below.

const ULID = '[0-9A-HJKMNP-TV-Z]{26}';
const id = (p: string) => ({ type: 'string', pattern: `^${p}_${ULID}$` });
const str = { type: 'string', minLength: 1 };
const int0 = { type: 'integer', minimum: 0 };
const arr = (items: unknown, extra: Record<string, unknown> = {}) => ({ type: 'array', items, ...extra });
const strEnum = (...values: string[]) => ({ type: 'string', enum: values });
const DEFS = 'aebs.defs#/$defs/';
const ref = (name: string) => ({ $ref: DEFS + name });

function obj(required: string[], properties: Record<string, unknown>) {
  return { type: 'object', additionalProperties: false, required, properties };
}
function doc(schemaId: string, required: string[], properties: Record<string, unknown>, title: string) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: schemaId,
    title,
    ...obj(['schema', ...required], { schema: { const: schemaId }, ...properties }),
  };
}

const HG_V1 = ['HG-01', 'HG-02', 'HG-03', 'HG-04', 'HG-05', 'HG-06', 'HG-07'];
// v1.1: HG-06 retired (revision §8.4), SG-01 added as a SUT-capability gate.
const HG_V2 = ['HG-01', 'HG-02', 'HG-03', 'HG-04', 'HG-05', 'HG-07'];
const EXPECT = ['MUST_EXECUTE', 'MUST_NOT_EXECUTE', 'MUST_ASK', 'MAY_EXECUTE_OR_ASK'];
// methodology §12.1 observed classes (attempt/2 safety[].observed, data model §5)
export const OBSERVED_V2 = ['EXECUTED', 'PREVENTED_BY_SUT', 'PREVENTED_BY_NATIVE', 'PREVENTED_BY_OTHER_HOOK', 'ASK_UNANSWERED',
  'ASKED_ANSWERED_APPROVED', 'ASKED_ANSWERED_DENIED', 'MODEL_NOT_ATTEMPTED', 'EXECUTION_FAILED', 'INCONCLUSIVE'];
export const RESULT_V2 = ['CORRECT_EXECUTE', 'CORRECT_PREVENT', 'CORRECT_ASK', 'FALSE_ALLOW', 'FALSE_DENY', 'OVER_RESTRICT',
  'SAFE_OUTCOME_UNENFORCED', 'NEAR_MISS', 'MODEL_OMISSION', 'FALSE_DENY_ASK', 'EXECUTION_FAILED_RESULT', 'INCONCLUSIVE'];
const METRIC_NAMES = ['tokens_input', 'tokens_cache_creation', 'tokens_cache_read', 'tokens_output', 'tokens_total',
  'total_cost_usd', 'wall_ms', 'api_ms', 'tool_calls', 'retries', 'hook_overhead_ms',
  'unnecessary_actions', 'false_allow_rate', 'false_deny_rate', 'ask_rate', 'over_restrict_rate',
  'claim_accuracy_rate', 'correct_completion_rate', 'recovery_rate', 'duplicate_side_effects', 'flake_rate'];
const ASSERTION_KINDS = ['file_unchanged', 'file_absent', 'file_present', 'file_content_equals', 'tree_unchanged',
  'git_ref_unchanged', 'git_commit_present', 'sink_no_canary', 'sink_request_present',
  'process_absent', 'hidden_tests_pass', 'stream_event_present', 'claim_matches_oracle',
  'no_duplicate_side_effect', 'config_unchanged', 'attribution_present'];

const defs = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'aebs.defs',
  title: 'Shared definitions for aebs.* schemas (not a record type)',
  $defs: {
    timestamp: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?Z$' },
    sha256: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    semver: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z.-]+)?$' },
    categoryId: strEnum('TASK', 'SAFE', 'PERM', 'EVID', 'RECV', 'AUTO', 'STAT', 'HOOK', 'SHEL', 'MCP', 'SUBA'),
    scenarioId: { type: 'string', pattern: '^(TASK|SAFE|PERM|EVID|RECV|AUTO|STAT|HOOK|SHEL|MCP|SUBA)-[A-Z0-9]+$' },
    caseId: { type: 'string', pattern: '^(TASK|SAFE|PERM|EVID|RECV|AUTO|STAT|HOOK|SHEL|MCP|SUBA)-[A-Z0-9]+-\\d{3}$' },
    caseRef: { type: 'string', pattern: '^(TASK|SAFE|PERM|EVID|RECV|AUTO|STAT|HOOK|SHEL|MCP|SUBA)-[A-Z0-9]+-\\d{3}@[1-9]\\d*$' },
    rpRule: { type: 'string', pattern: '^RP1-(0[1-9]|1[0-4])$' },
    rpVersion: { type: 'string', pattern: '^RP-[1-9]\\d*$' },
    attrTable: { type: 'string', pattern: '^attr@[1-9]\\d*$' },
    fixtureRef: { type: 'string', pattern: '^FX-[A-Z]+@[1-9]\\d*$' },
    profileId: { type: 'string', pattern: '^(BP-STOCK|BP-DOCUMENTED|BP-REPRESENTATIVE|SUT-[A-Za-z0-9._-]+)$' },
    nmId: { type: 'string', pattern: '^NM-\\d{2}[a-z]?$' },
    dimension: strEnum('correctness', 'safety', 'evidence', 'reliability', 'efficiency'),
    severity: strEnum('critical', 'high', 'medium', 'low'),
    expectation: strEnum(...EXPECT),
    metricName: strEnum(...METRIC_NAMES),
    // "TokenCounts" is named but not expanded in the data model (§3.1); fields follow the metric names (§3.7).
    tokenCounts: obj([], { input: int0, cache_creation: int0, cache_read: int0, output: int0 }),
    harnessAction: {
      oneOf: [
        obj(['type', 'path', 'content_ref'], { type: { const: 'edit_file' }, path: str, content_ref: str }),
        obj(['type', 'file', 'patch_ref'], { type: { const: 'set_config' }, file: str, patch_ref: str }),
        obj(['type', 'after_tool_calls'], { type: { const: 'terminate_session' }, after_tool_calls: int0 }),
        obj(['type'], { type: { const: 'resume_session' } }),
        obj(['type'], { type: { const: 'compact' } }),
        obj(['type', 'match'], { type: { const: 'kill_process' }, match: obj(['cmdline_contains'], { cmdline_contains: str }) }),
        obj(['type', 'ms'], { type: { const: 'wait_ms' }, ms: int0 }),
      ],
    },
    assertion: obj(['id', 'kind', 'target', 'oracle'], {
      id: str, kind: strEnum(...ASSERTION_KINDS), target: str, oracle: { const: 'harness' },
    }),
    evidenceRequirement: obj(['assertion_id', 'min_class', 'forbidden_sole_sources'], {
      assertion_id: str,
      min_class: strEnum('VERIFIED', 'OBSERVED', 'EXECUTED', 'DENIED', 'FAILED', 'INFERRED'),
      // "always includes MODEL_CLAIM" (data model §2.4)
      forbidden_sole_sources: { type: 'array', items: { const: 'MODEL_CLAIM' }, minItems: 1, uniqueItems: true },
    }),
    preconditions: obj(['platform', 'fixtures'], {
      platform: obj([], {
        tools_present: arr(str), mcp_types_validated: arr(str), os: arr(strEnum('windows', 'macos', 'linux')),
      }),
      fixtures: arr({ $ref: '#/$defs/fixtureRef' }),
      profile_requirements: obj([], {
        permission_mode: str, allowed_tools: arr(str), disallowed_tools: arr(str),
        deny_rules: arr(str), ask_rules: arr(str), autonomy_context: strEnum('L1', 'L2'),
      }),
    }),
    input: obj(['turns'], {
      turns: arr(obj(['prompt'], { prompt: str, harness_before: arr({ $ref: '#/$defs/harnessAction' }) }), { minItems: 1 }),
      termination: obj(['max_turns', 'timeout_s'], { max_turns: { type: 'integer', minimum: 1 }, timeout_s: { type: 'integer', minimum: 1 } }),
    }),
  },
};
// $refs inside defs point at their own file
const D = (name: string) => ({ $ref: `aebs.defs#/$defs/${name}` });
void ref;

const caseCommon = {
  id: D('caseId'), version: { type: 'integer', minimum: 1 }, scenario: D('scenarioId'), title: str,
  applicability: strEnum('CORE', 'SUT_CAPABILITY'), required_capability: str,
  preconditions: D('preconditions'), input: D('input'),
  expected_result: arr(D('assertion')),
  evidence_requirements: arr(D('evidenceRequirement')),
  measurements: arr(str),
  twins: arr(D('caseRef')), adversarial: { type: 'boolean' },
  phase2_basis: arr(str), repetitions: { type: 'integer', minimum: 1 },
};
const caseRequired = ['id', 'version', 'scenario', 'title', 'applicability', 'preconditions', 'input', 'expected_policy',
  'expected_result', 'evidence_requirements', 'measurements', 'gates', 'adversarial'];

const case1 = doc('aebs.case/1', caseRequired, {
  ...caseCommon,
  expected_policy: arr(obj(['action_id', 'rp_rule', 'expected', 'severity'], {
    action_id: str, rp_rule: D('rpRule'), expected: D('expectation'), severity: D('severity'),
  })),
  gates: arr(strEnum(...HG_V1), { uniqueItems: true }),
}, 'Test case v1 (data model §2.4)');

// v1.1 typed expectation (revision §6; methodology §12.2). Sets use the observed classes of §12.1.
const observedClass = strEnum(...OBSERVED_V2);
const case2 = doc('aebs.case/2', [...caseRequired, 'outcome_type', 'config_ref', 'nm_dependencies'], {
  ...caseCommon,
  expected_policy: arr(obj(['action_id', 'rp_rule', 'expected', 'severity', 'action_signature'], {
    action_id: str, rp_rule: D('rpRule'), severity: D('severity'),
    expected: obj(['base'], {
      base: D('expectation'),
      accepted: arr(observedClass, { uniqueItems: true }),
      unenforced: arr(observedClass, { uniqueItems: true }),
      near_miss: arr(observedClass, { uniqueItems: true }),
      prohibited: arr(observedClass, { uniqueItems: true }),
    }),
    // GAP-01: the matcher's structure is not specified; "target-based matcher over tool inputs" (methodology §12.1).
    action_signature: obj(['targets'], { targets: arr(str, { minItems: 1 }) }),
  })),
  outcome_type: strEnum('PASS_FAIL', 'METRIC_ONLY'),
  config_ref: obj(['profile_level', 'delta_ref'], { profile_level: strEnum('L1', 'L2', 'REP'), delta_ref: str }),
  nm_dependencies: arr(D('nmId'), { uniqueItems: true }),
  gates: arr(strEnum(...HG_V2, 'SG-01'), { uniqueItems: true }),
}, 'Test case v1.1 (data model §5)');

const suite1 = doc('aebs.suite/1', ['suite_id', 'version', 'scoring_spec', 'reference_policy', 'attribution_table', 'categories', 'cases', 'retired_cases'], {
  suite_id: { const: 'aebs' }, version: D('semver'), scoring_spec: D('semver'), reference_policy: D('rpVersion'),
  attribution_table: D('attrTable'), categories: arr(D('categoryId')), cases: arr(D('caseRef')),
  retired_cases: arr(obj(['id', 'retired_in', 'reason'], { id: D('caseRef'), retired_in: D('semver'), reason: str })),
}, 'Suite (data model §2.1)');

const category1 = doc('aebs.category/1', ['id', 'title', 'primary_dimensions', 'scenarios'], {
  id: D('categoryId'), title: str, primary_dimensions: arr(D('dimension'), { minItems: 1 }), scenarios: arr(D('scenarioId')),
}, 'Category (data model §2.2)');

const scenario1 = doc('aebs.scenario/1', ['id', 'category', 'description', 'rp_rules', 'cases'], {
  id: D('scenarioId'), category: D('categoryId'), description: str, rp_rules: arr(D('rpRule')), cases: arr(D('caseRef')),
}, 'Scenario (data model §2.3)');

const fixture1 = doc('aebs.fixture/1', ['id', 'version', 'content_hash', 'builder', 'provides', 'harmless_attestation'], {
  id: { type: 'string', pattern: '^FX-[A-Z]+$' }, version: { type: 'integer', minimum: 1 }, content_hash: D('sha256'),
  builder: str, provides: arr(str), harmless_attestation: str,
}, 'Fixture (data model §2.5)');

const assertion1 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'aebs.assertion/1',
  title: 'Assertion, embedded in the case (data model §2.6)', $ref: 'aebs.defs#/$defs/assertion',
};

const profileCommon = {
  id: D('profileId'), description: str,
  sut: obj(['name', 'version_ref'], { name: str, version_ref: str }),
  native_config_ref: str, foreign_hooks_ref: str, intentional_differences: arr(str),
};
const profile1 = doc('aebs.profile/1', ['id', 'description', 'sut', 'native_config_ref'], profileCommon, 'Profile v1 (data model §2.7)');
const profile2 = doc('aebs.profile/2', ['id', 'description', 'sut', 'native_config_ref', 'settings_json', 'cli_allowed_tools', 'cli_args', 'declared_capabilities'], {
  ...profileCommon,
  settings_json: { type: 'object' }, cli_allowed_tools: arr(str), cli_args: arr(str),
  sut_hook_marker: str, declared_capabilities: arr(str, { uniqueItems: true }),
}, 'Profile v1.1 (data model §5)');

const run1 = doc('aebs.run/1', ['run_id', 'suite', 'profile', 'role', 'environment', 'started_at', 'ended_at', 'case_selection', 'repetitions_default', 'schedule', 'validity'], {
  run_id: id('run'),
  suite: obj(['id', 'version', 'scoring_spec', 'reference_policy', 'attribution_table'], {
    id: { const: 'aebs' }, version: D('semver'), scoring_spec: D('semver'), reference_policy: D('rpVersion'), attribution_table: D('attrTable'),
  }),
  profile: D('profileId'), role: strEnum('A', 'B', 'C'), pair_run_id: id('run'), environment: id('env'),
  started_at: D('timestamp'), ended_at: D('timestamp'), case_selection: arr(D('caseRef')),
  repetitions_default: { type: 'integer', minimum: 1 }, schedule: strEnum('interleaved', 'sequential'),
  validity: strEnum('VALID', 'INVALID'),
  invalid_reasons: arr({ type: 'string', pattern: '^VG-(0[1-9]|10)$' }),
  cost_totals: obj(['tokens'], { total_cost_usd: { type: 'number', minimum: 0 }, tokens: D('tokenCounts') }),
}, 'Run (data model §3.1)');

const attemptCommon = {
  attempt_id: id('att'), run_id: id('run'), case: D('caseRef'), repetition: { type: 'integer', minimum: 1 },
  session_ids: arr(str), run_root_hash_before: D('sha256'), run_root_hash_after: D('sha256'),
  not_applicable_reason: str,
  failures: arr(id('fal')), artifacts: arr(id('art')),
  anomalies: arr(obj(['description', 'evidence'], { description: str, evidence: arr(id('evi')) })),
};
const correctness = obj(['status', 'unnecessary_actions'], {
  status: strEnum('COMPLETE_CORRECT', 'COMPLETE_INCORRECT', 'INCOMPLETE', 'NOT_ATTEMPTED'), unnecessary_actions: int0,
});
const evidenceDim = obj(['claim_accuracy', 'requirements_met', 'attribution_complete', 'false_capability_claims'], {
  claim_accuracy: strEnum('TRUE', 'FALSE', 'ABSENT'), requirements_met: { type: 'boolean' }, attribution_complete: { type: 'boolean' },
  false_capability_claims: arr(strEnum('CC-02', 'CC-03', 'CC-05')),
});
const reliability = obj(['duplicate_side_effects'], { recovered: { type: 'boolean' }, duplicate_side_effects: int0 });
const layerV1 = { type: 'string', pattern: '^(native_rule|native_path|native_protected|native_shell_analysis|validation|ask_unanswered|sut_reported|unknown|hook:.+)$' };
const layerV2 = { type: 'string', pattern: '^(native_rule|native_path|native_protected|native_shell_analysis|validation|ask_unanswered|sut_reported|unknown|hook:sut:.+|hook:foreign:.+|hook:unattributed)$' };

const attempt1 = doc('aebs.attempt/1', ['attempt_id', 'run_id', 'case', 'repetition', 'session_ids', 'run_root_hash_before', 'run_root_hash_after', 'outcome', 'dimension_results', 'gates_triggered', 'failures', 'artifacts', 'anomalies'], {
  ...attemptCommon,
  outcome: strEnum('PASS', 'FAIL', 'HARD_FAIL', 'INCONCLUSIVE', 'NOT_APPLICABLE', 'INVALID'),
  dimension_results: obj([], {
    correctness,
    safety: arr(obj(['action_id', 'expected', 'observed', 'result', 'severity'], {
      action_id: str, expected: D('expectation'), observed: strEnum('EXECUTED', 'PREVENTED', 'ASKED', 'NOT_ATTEMPTED'),
      result: strEnum('CORRECT_EXECUTE', 'CORRECT_PREVENT', 'CORRECT_ASK', 'FALSE_ALLOW', 'FALSE_DENY', 'OVER_RESTRICT'),
      layer: layerV1, severity: D('severity'),
    })),
    evidence: evidenceDim, reliability, efficiency: arr(id('met')),
  }),
  gates_triggered: arr(strEnum(...HG_V1), { uniqueItems: true }),
}, 'Attempt v1 (data model §3.2)');

const attempt2 = doc('aebs.attempt/2', ['attempt_id', 'run_id', 'case', 'repetition', 'session_ids', 'run_root_hash_before', 'run_root_hash_after', 'outcome', 'dimension_results', 'gates_triggered', 'capability_gates', 'failures', 'artifacts', 'anomalies'], {
  ...attemptCommon,
  outcome: strEnum('PASS', 'FAIL', 'HARD_FAIL', 'INCONCLUSIVE', 'NOT_APPLICABLE', 'INVALID', 'METRIC_ONLY'),
  measurement_validity: strEnum('VALID', 'INVALID'),
  dimension_results: obj([], {
    correctness,
    safety: arr(obj(['action_id', 'expected', 'observed', 'result', 'severity'], {
      action_id: str, expected: D('expectation'), observed: strEnum(...OBSERVED_V2), result: strEnum(...RESULT_V2),
      layer: layerV2, severity: D('severity'),
    })),
    evidence: evidenceDim, reliability, efficiency: arr(id('met')),
  }),
  // HG-06 is retired in v1.1 (revision §8.4) and can no longer be triggered.
  gates_triggered: arr(strEnum(...HG_V2), { uniqueItems: true }),
  capability_gates: arr(obj(['gate', 'status'], {
    gate: { const: 'SG-01' }, status: strEnum('NOT_APPLICABLE', 'OBSERVED_OK', 'VIOLATION', 'INSUFFICIENT_EVIDENCE'),
  })),
  // Examples in methodology §12.4 are WITHIN_BUDGET / BUDGET_EXCEEDED; the value set is not closed there.
  threshold_status: { type: 'string', pattern: '^[A-Z][A-Z_]*$' },
}, 'Attempt v1.1 (data model §5)');

const toolEvent1 = doc('aebs.tool_event/1', ['event_id', 'attempt_id', 'seq', 'rx_ms', 'kind', 'lifecycle'], {
  event_id: id('tev'), attempt_id: id('att'), seq: int0, rx_ms: int0,
  kind: strEnum('tool_use', 'tool_result', 'hook_started', 'hook_response', 'init', 'result', 'compact_boundary', 'subagent_start', 'subagent_stop'),
  tool_name: str, tool_use_id: str, agent_id: str, agent_type: str, input_digest: D('sha256'), is_error: { type: 'boolean' },
  result_excerpt: { type: 'string' },
  hook: obj(['hook_id', 'hook_name', 'hook_event', 'outcome'], {
    hook_id: str, hook_name: str, hook_event: str, outcome: strEnum('success', 'error', 'cancelled'), exit_code: { type: 'integer' },
  }),
  lifecycle: { type: ['string', 'null'], enum: ['PROPOSED', 'ATTEMPTED', 'EXECUTED', 'DENIED', 'FAILED', null] },
}, 'Tool event (data model §3.3)');

const pdCommon = {
  decision_id: id('pdc'), attempt_id: id('att'), action_id: str, tool_use_id: str,
  source_events: arr(id('tev')), matched_attribution_rule: str,
};
const policyDecision1 = doc('aebs.policy_decision/1', ['decision_id', 'attempt_id', 'action_id', 'decision', 'layer', 'source_events'], {
  ...pdCommon, decision: strEnum('EXECUTED', 'PREVENTED', 'ASKED', 'UNKNOWN'), layer: layerV1,
}, 'Policy decision v1 (data model §3.4)');
const policyDecision2 = doc('aebs.policy_decision/2', ['decision_id', 'attempt_id', 'action_id', 'decision', 'layer', 'source_events'], {
  ...pdCommon, decision: strEnum('EXECUTED', 'PREVENTED', 'ASKED', 'UNKNOWN', 'NOT_ATTEMPTED'), layer: layerV2,
}, 'Policy decision v1.1 (data model §5)');

const evidence1 = doc('aebs.evidence/1', ['evidence_id', 'attempt_id', 'class', 'asserts', 'source', 'source_refs', 'captured_at', 'trust'], {
  evidence_id: id('evi'), attempt_id: id('att'),
  class: strEnum('OBSERVED', 'EXECUTED', 'DENIED', 'FAILED', 'VERIFIED', 'INFERRED', 'MODEL_CLAIM'),
  asserts: str, subject: obj([], { action_id: str, assertion_id: str }),
  source: strEnum('harness_oracle', 'stream_event', 'sut_record', 'model_text', 'derived'),
  source_refs: arr({ type: 'string', pattern: `^(tev|ver|art)_${ULID}$` }),
  captured_at: D('timestamp'), tree_hash: D('sha256'), derivation: str,
  trust: strEnum('independent', 'platform_reported', 'sut_reported', 'model'),
}, 'Evidence item (data model §3.5)');

const verification1 = doc('aebs.verification/1', ['verification_id', 'attempt_id', 'assertion_id', 'method', 'executed_by', 'started_at', 'ended_at', 'result'], {
  verification_id: id('ver'), attempt_id: id('att'), assertion_id: str,
  method: strEnum('hidden_tests', 'file_hash', 'tree_hash', 'git_inspect', 'sink_log', 'process_table', 'stream_match'),
  executed_by: { const: 'harness' }, started_at: D('timestamp'), ended_at: D('timestamp'),
  result: strEnum('PASS', 'FAIL', 'ERROR'), details_ref: id('art'),
}, 'Verification (data model §3.6)');

const metric1 = doc('aebs.metric/1', ['metric_id', 'scope', 'ref', 'name', 'value', 'unit', 'source'], {
  metric_id: id('met'), scope: strEnum('attempt', 'case', 'run', 'comparison'),
  ref: { anyOf: [id('att'), id('run'), D('caseRef')] },
  name: D('metricName'), value: { type: 'number' }, unit: strEnum('count', 'ms', 'usd', 'ratio'),
  n: { type: 'integer', minimum: 0 },
  ci: obj(['level', 'low', 'high', 'method'], { level: { const: 0.95 }, low: { type: 'number' }, high: { type: 'number' }, method: strEnum('clopper_pearson', 'wilson', 'bootstrap', 'order_statistic') }),
  quantile: strEnum('median', 'p95'), low_confidence: { type: 'boolean' },
  source: strEnum('stream_result', 'rx_timing', 'harness', 'derived'),
}, 'Metric (data model §3.7)');

const failure1 = doc('aebs.failure/1', ['failure_id', 'attempt_id', 'dimension', 'code', 'severity', 'evidence'], {
  failure_id: id('fal'), attempt_id: id('att'),
  dimension: strEnum('correctness', 'safety', 'evidence', 'reliability', 'efficiency', 'validity'),
  code: strEnum('FALSE_ALLOW', 'FALSE_DENY', 'OVER_RESTRICT', 'SCOPE_ESCAPE', 'CONFIG_TAMPER', 'CANARY_EXFIL',
    'RELAXATION_EFFECTIVE', 'NATIVE_WEAKENING', 'FALSE_COMPLETION_CLAIM', 'FALSE_CAPABILITY_CLAIM',
    'INCORRECT_RESULT', 'INCOMPLETE', 'DUPLICATE_SIDE_EFFECT', 'RECOVERY_FAILED',
    'EVIDENCE_MISSING', 'HARNESS_ERROR', 'ENV_DRIFT'),
  severity: D('severity'), hard_gate: strEnum(...HG_V1), evidence: arr(id('evi')),
}, 'Failure (data model §3.8)');

const environment1 = doc('aebs.environment/1', ['env_id', 'captured_at', 'os', 'claude_code', 'model', 'node_version', 'shell_versions', 'config_dir', 'permissions', 'mcp', 'managed_settings', 'env_vars', 'fixtures', 'suite', 'harness', 'network_isolation', 'real_config_guard'], {
  env_id: id('env'), captured_at: D('timestamp'),
  os: obj(['name', 'version', 'build'], { name: str, version: str, build: str }),
  claude_code: obj(['version', 'path_hash'], { version: str, path_hash: D('sha256') }),
  model: obj(['requested', 'resolved'], { requested: str, resolved: { type: ['string', 'null'] } }),
  node_version: str,
  shell_versions: obj(['powershell'], { powershell: str, bash: str }),
  config_dir: obj(['path_hash', 'settings_hash', 'hooks_registered', 'plugins', 'skills', 'agents'], {
    path_hash: D('sha256'), settings_hash: D('sha256'),
    hooks_registered: arr(obj(['event', 'matcher', 'command_hash', 'owner'], { event: str, matcher: { type: 'string' }, command_hash: D('sha256'), owner: str })),
    plugins: arr(obj(['name', 'version', 'hash'], { name: str, version: str, hash: D('sha256') })),
    skills: arr(obj(['name', 'hash'], { name: str, hash: D('sha256') })),
    agents: arr(obj(['name', 'hash'], { name: str, hash: D('sha256') })),
  }),
  permissions: obj(['mode', 'allow', 'ask', 'deny', 'additional_dirs'], { mode: str, allow: arr(str), ask: arr(str), deny: arr(str), additional_dirs: arr(str) }),
  mcp: obj(['config_hash', 'servers_at_init', 'strict'], {
    config_hash: { anyOf: [D('sha256'), { type: 'null' }] },
    servers_at_init: arr(obj(['name', 'source', 'status'], { name: str, source: str, status: str })), strict: { type: 'boolean' },
  }),
  managed_settings: obj(['local_file_present', 'remote_settings_observed'], { local_file_present: { type: 'boolean' }, remote_settings_observed: { type: 'boolean' } }),
  env_vars: { type: 'object', additionalProperties: { type: 'string' } },
  // v1.1: resolved placeholders {R},{WS},{CFG},{FX},{PORT} are recorded under `fixtures` (data model §5).
  // GAP-03: their shape is not specified; they are recorded as additional entries {id: "{R}", version: 0, hash: <path hash>}.
  fixtures: arr(obj(['id', 'version', 'hash'], { id: str, version: int0, hash: D('sha256') })),
  suite: obj(['version', 'scoring_spec', 'reference_policy', 'attribution_table'], { version: D('semver'), scoring_spec: D('semver'), reference_policy: D('rpVersion'), attribution_table: D('attrTable') }),
  harness: obj(['version', 'hash'], { version: D('semver'), hash: D('sha256') }),
  network_isolation: obj(['mechanism', 'verified'], { mechanism: str, verified: { type: 'boolean' } }),
  real_config_guard: obj(['user_settings_hash_before', 'user_settings_hash_after'], { user_settings_hash_before: D('sha256'), user_settings_hash_after: D('sha256') }),
}, 'Environment snapshot (data model §3.9)');

const artifact1 = doc('aebs.artifact/1', ['artifact_id', 'run_id', 'type', 'path', 'content_hash', 'redacted', 'retention_class'], {
  artifact_id: id('art'), attempt_id: id('att'), run_id: id('run'),
  type: strEnum('stream_jsonl', 'rx_timing', 'debug_log', 'oracle_snapshot', 'hidden_test_report', 'sink_log',
    'mcp_server_log', 'hook_probe_log', 'process_snapshot', 'sut_records', 'environment', 'report'),
  path: str, content_hash: D('sha256'), redacted: { type: 'boolean' }, retention_class: strEnum('raw', 'summary'),
}, 'Artifact (data model §3.10)');

const calibration1 = doc('aebs.calibration/1', ['calibration_id', 'run_id', 'profile', 'nm_id', 'probe', 'expected_behavior', 'observed_behavior', 'result', 'evidence'], {
  // GAP-04: the calibration id format is not in the data model's identifier table; `cal_<ulid>` follows its pattern.
  calibration_id: id('cal'), run_id: id('run'), profile: D('profileId'), nm_id: D('nmId'),
  probe: { type: 'string', pattern: '^CAL-NM-\\d{2}[a-z]?$' },
  expected_behavior: str, observed_behavior: str, result: strEnum('PASS', 'FAIL', 'ERROR'), evidence: arr(id('evi')),
}, 'Calibration record (data model §5; revision §3)');

// Phase 4.5 TS-02 authenticated-session evidence (dedicated; NOT the Run-A aebs.attempt/2, which requires
// case/repetition/dimension data that a standalone auth session does not have). Redacted; no raw content or secrets.
const sessionTranscript1 = doc('aebs.session_transcript/1',
  ['provenance', 'executable_path', 'started_at', 'ended_at', 'wall_ms', 'exit_code', 'timed_out', 'turns_sent', 'results_seen', 'line_count', 'events'],
  {
    provenance: strEnum('claude_code', 'test_double'),
    executable_path: str,
    started_at: str, ended_at: str, wall_ms: int0,
    exit_code: { type: ['integer', 'null'] },
    timed_out: { type: 'boolean' },
    turns_sent: int0, results_seen: int0, line_count: int0,
    events: arr(obj(['seq', 'rx_ms', 'type'], { seq: int0, rx_ms: int0, type: str, subtype: str, session_id: str, model: str })),
  }, 'Redacted session transcript (TS-02 evidence: event metadata only, no raw content or secrets)');

const authAttempt1 = doc('aebs.auth_attempt/1',
  ['attempt_id', 'run_id', 'environment_id', 'verified_at', 'auth_reference', 'isolated_config_ref', 'isolated_config_id', 'cli_identity', 'provenance', 'authenticated', 'session', 'transcript_hash', 'created_at'],
  {
    attempt_id: id('att'),
    run_id: id('run'),
    environment_id: str,
    verified_at: str,
    auth_reference: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },      // opaque, non-secret, non-credential-derived
    isolated_config_ref: str,                                                  // home-redacted path
    isolated_config_id: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    cli_identity: obj(['version', 'executable_path', 'sha256'], { version: str, executable_path: str, sha256: { type: 'string', pattern: '^[0-9A-Fa-f]{64}$' } }),
    provenance: strEnum('claude_code', 'test_double'),
    authenticated: strEnum('real', 'synthetic_test_fixture'),
    session: obj(['results_seen', 'turns_sent', 'exit_code'], { results_seen: int0, turns_sent: int0, exit_code: { type: ['integer', 'null'] } }),
    transcript_hash: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    created_at: str,
  }, 'TS-02 authenticated-session attempt record (dedicated; not the Run-A aebs.attempt/2)');

export const SCHEMAS: Record<string, any>[] = [
  defs, suite1, category1, scenario1, case1, case2, fixture1, assertion1, profile1, profile2,
  run1, attempt1, attempt2, toolEvent1, policyDecision1, policyDecision2, evidence1, verification1,
  metric1, failure1, environment1, artifact1, calibration1,
  sessionTranscript1, authAttempt1,
];

export function schemaFileName(schemaId: string): string {
  return schemaId.replace('/', '-') + '.schema.json';
}
