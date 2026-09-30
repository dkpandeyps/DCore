# GAP-05 proposal review report

> **PROPOSED — NOT APPROVED FOR EXECUTION**

- Cases: 92. Fixture families: 6.
- Reconciliation against the approved catalog: **PASS (no drift)**.
- Total `PROPOSED — SOURCE SILENT` fields: **449** (92 cases with case-level gaps; 6 fixture families with gaps).

## Source-silent field frequency (case-level)

- `prompt`: 92 cases
- `action_signature_targets`: 68 cases
- `side_effect_target`: 68 cases
- `severity`: 42 cases
- `rp_rule`: 41 cases
- `base_expectation`: 37 cases
- `d2_permitted_outcomes`: 35 cases
- `expected_assertions`: 24 cases
- `title`: 20 cases
- `git_workspace.branches_refs`: 7 cases
- `git_workspace.unresolved`: 7 cases

## Per-case source-silent fields

- **AUTO-L1-001@1**: title, prompt, action_signature_targets, side_effect_target
- **AUTO-L1-002@1**: title, prompt, action_signature_targets, side_effect_target, git_workspace.branches_refs, git_workspace.unresolved
- **AUTO-L1-003@1**: title, prompt, git_workspace.branches_refs, git_workspace.unresolved
- **AUTO-L2-001@2**: title, prompt, action_signature_targets, side_effect_target, git_workspace.branches_refs, git_workspace.unresolved
- **AUTO-L2-002@2**: title, prompt, git_workspace.branches_refs, git_workspace.unresolved
- **AUTO-RELAX-001@2**: title, prompt, action_signature_targets, side_effect_target, git_workspace.branches_refs, git_workspace.unresolved
- **AUTO-RELAX-002@2**: title, prompt, action_signature_targets, side_effect_target, git_workspace.branches_refs, git_workspace.unresolved
- **AUTO-RESTART-001@2**: title, prompt, action_signature_targets, side_effect_target, git_workspace.branches_refs, git_workspace.unresolved
- **EVID-ATTR-001@1**: rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **EVID-CLAIM-001@1**: rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **EVID-CLAIM-002@2**: rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **EVID-CONTRA-001@1**: rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **EVID-FAB-001@1**: rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **EVID-PART-001@2**: rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **HOOK-COEX-001@1**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **HOOK-COEX-002@2**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **HOOK-COEX-003@2**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **HOOK-DIS-001@2**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **HOOK-LAT-001@2**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target
- **HOOK-ORD-001@2**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **HOOK-RELOAD-001@2**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **HOOK-REWR-001@2**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **HOOK-TMO-001@2**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **MCP-DENY-001@2**: severity, prompt, action_signature_targets, side_effect_target
- **MCP-HOST-001@2**: severity, prompt
- **MCP-INPUT-001@2**: severity, prompt, expected_assertions
- **MCP-MAL-001@2**: severity, rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **MCP-OBS-001@2**: severity, rp_rule, prompt, action_signature_targets, expected_assertions, side_effect_target
- **MCP-UNVAL-001@1**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **MCP-UNVAL-002@1**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **PERM-ALLOW-001@1**: rp_rule, prompt, action_signature_targets, side_effect_target
- **PERM-ASK-001@1**: prompt, action_signature_targets, expected_assertions, side_effect_target
- **PERM-CHG-001@1**: prompt
- **PERM-CHG-002@2**: prompt, action_signature_targets, side_effect_target
- **PERM-DENY-001@1**: prompt
- **PERM-DENY-002@2**: prompt, action_signature_targets, side_effect_target
- **PERM-DENY-003@2**: prompt, action_signature_targets, side_effect_target
- **PERM-PROT-001@1**: prompt
- **PERM-PROT-002@1**: prompt
- **PERM-TOOL-001@2**: prompt, action_signature_targets, side_effect_target
- **RECV-HOOK-001@2**: rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **RECV-MAL-001@2**: rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **RECV-PART-001@1**: rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **RECV-RESTART-001@1**: rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **RECV-STALE-001@1**: rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **RECV-TERM-001@2**: rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **RECV-TMO-001@2**: rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **RECV-TOOL-001@1**: rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **SAFE-AMB-001@1**: prompt
- **SAFE-BYP-001@1**: prompt
- **SAFE-BYP-002@2**: prompt
- **SAFE-COMP-001@1**: prompt
- **SAFE-COMP-002@1**: prompt, action_signature_targets, side_effect_target
- **SAFE-DEST-001@1**: prompt
- **SAFE-DEST-002@2**: rp_rule, prompt
- **SAFE-DEST-003@1**: prompt
- **SAFE-NET-001@1**: prompt
- **SAFE-NET-002@2**: rp_rule, prompt, action_signature_targets, side_effect_target
- **SAFE-PKG-001@1**: prompt
- **SHEL-BASH-001@2**: title, severity, prompt, action_signature_targets, side_effect_target
- **SHEL-BASH-002@1**: title, severity, prompt
- **SHEL-BASH-003@1**: title, severity, prompt, action_signature_targets, side_effect_target
- **SHEL-BASH-004@1**: title, severity, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **SHEL-PS-001@1**: title, severity, prompt, action_signature_targets, side_effect_target
- **SHEL-PS-002@1**: title, severity, prompt, action_signature_targets, side_effect_target
- **SHEL-PS-003@1**: title, severity, prompt, action_signature_targets, side_effect_target
- **SHEL-PS-004@2**: title, severity, prompt
- **SHEL-PS-005@1**: title, severity, prompt
- **SHEL-PS-006@2**: title, severity, prompt
- **SHEL-PS-007@2**: title, severity, prompt
- **SHEL-PS-008@1**: title, severity, prompt, action_signature_targets, side_effect_target
- **STAT-COMPACT-001@1**: severity, rp_rule, base_expectation, prompt, d2_permitted_outcomes
- **STAT-CONC-001@1**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **STAT-CONC-002@1**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **STAT-CORRUPT-001@1**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **STAT-INTEG-001@1**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **STAT-RESUME-001@1**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target, d2_permitted_outcomes
- **STAT-STALE-001@1**: severity, rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **SUBA-DIS-001@2**: severity, prompt, action_signature_targets, side_effect_target
- **SUBA-ESC-001@2**: severity, prompt, action_signature_targets, side_effect_target
- **SUBA-NEST-001@2**: severity, prompt, action_signature_targets, side_effect_target
- **SUBA-PLUG-001@2**: severity, rp_rule, base_expectation, prompt, action_signature_targets, expected_assertions, side_effect_target
- **SUBA-PLUG-002@2**: severity, prompt, action_signature_targets, side_effect_target
- **SUBA-TOOL-001@2**: severity, prompt, action_signature_targets, side_effect_target
- **SUBA-TYPE-001@2**: severity, rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **TASK-DOC-001@1**: prompt, action_signature_targets, side_effect_target
- **TASK-EDIT-001@1**: prompt, action_signature_targets, side_effect_target
- **TASK-EDIT-002@1**: prompt
- **TASK-FIX-001@1**: prompt, action_signature_targets, side_effect_target
- **TASK-FIX-002@1**: prompt, action_signature_targets, side_effect_target
- **TASK-IMPOSS-001@1**: rp_rule, base_expectation, prompt, action_signature_targets, side_effect_target, d2_permitted_outcomes
- **TASK-NOOP-001@1**: rp_rule, prompt, action_signature_targets, side_effect_target

## Per-fixture source-silent notes

### FX-APP@1
- PROPOSED — SOURCE SILENT: the exact project files, the specific seeded bug, and the hidden test assertions are not specified in the approved documents (they must be authored and approved).
- PROPOSED — SOURCE SILENT: whether FX-APP@1 also initializes a git repo in ws/ (overlaps GAP-08).

### FX-SINK@1
- PROPOSED — SOURCE SILENT: the exact /docs body, the port-selection method, and the request-log schema are not specified.

### FX-PKG@1
- PROPOSED — SOURCE SILENT: the tarball's exact package name/version and file contents are not specified.

### FX-MCP@1
- PROPOSED — SOURCE SILENT: exact tool input/output schemas, the hostile text string, and the fileread traversal-handling contract are not specified.
- PROPOSED — SOURCE SILENT: MCP-UNVAL-001/002 (plugin and remote MCP) remain NOT_APPLICABLE until validated (U-01); no fixture is proposed for them.

### FX-AGENTS@1
- PROPOSED — SOURCE SILENT: the exact agent prompt bodies and the plugin manifest details are not specified beyond tool lists and permissionMode.

### FX-INJECT@1
- PROPOSED — SOURCE SILENT: the exact planted-instruction wording is not specified in the approved documents.

## Cross-cutting unresolved items

- **GAP-05:** the verbatim prompt for every case, the FX-APP seeded bug and hidden-test assertions, the FX-MCP tool schemas and hostile/fileread contracts, and the FX-INJECT/FX-AGENTS wording are all unspecified in the approved documents. They must be authored and approved before Run A.
- **GAP-07:** left unresolved. Cases that can produce `CORRECT_ASK` carry an explicit GAP-07 dependency; the enforcement-rate interpretation was not chosen.
- **GAP-08:** git-workspace shape is specified per case where derivable (local bare `R/remote.git`, no credentials, no network); the exact pre-seeded commit content and whether `ws/` is git-initialized by FX-RUNROOT@1 or FX-APP@1 remain source-silent.

