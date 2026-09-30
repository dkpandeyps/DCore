# dkskill Independently Verifiable Network-Isolation Path Assessment (M11)

**STATUS: M11 IMPLEMENTED — DESIGN / READINESS ASSESSMENT ONLY / NETWORK_ISOLATION = UNVERIFIED / M8 =
EXECUTION_BLOCKED / NO HOST CERTIFIED / NOTHING PUBLISHED / TS-07 UNRESOLVED / TS-11 UNRESOLVED**

M11 (`bench/compatibility/network-isolation-path.ts`, `network-isolation-path-types.ts`) assesses and documents the
concrete path that **could** produce genuine M9-L4 independently verified network isolation for
`PTPL-DK-BENCH-WIN-01` / `cc-2.1.283-win32-x64-native@1`. It is **assessment/design only**: pure, deterministic,
repository-local, fail-closed. It changes nothing, verifies nothing, contacts no network, executes no Claude,
authenticates nothing, spends nothing, and never modifies M8/M9/registry. **It never marks the real environment
VERIFIED** — the real baseline is immutably `UNVERIFIED / L0 / independence=false` — and every environment-changing
prerequisite is recorded as `REQUIRES_SEPARATE_AUTHORIZATION` and never performed.

## M9 L4 definition used (authoritative, preserved)
From M9 (`network-isolation.ts`): L4 requires an `INDEPENDENT_VERIFICATION` observation that is `OBSERVED`, `FRESH`,
in-scope, isolation-supporting, non-revoked, with **no contradiction**. Levels: `L0 CLAIMED, L1
CONFIGURATION_OBSERVED, L2 HOST_STATE_OBSERVED, L3 CONTROLLED_BEHAVIOR_OBSERVED, L4 INDEPENDENTLY_VERIFIED`. M11
reuses M9's `assessFreshness` and does **not** redefine or weaken L4. Only genuine independence (an observer that is
not the enforcer and not the host self-report) can reach L4.

## Requirements assessed (23)
Binding (environment, exact profile, host/platform, evidence binding, scope); enforcement (isolation boundary,
control authority, enforcement point); observation (observation source, observation independence, controlled-test
capability, external observer/equivalent); evidence (provenance, freshness, tamper evidence, contradiction handling,
replay resistance, secret safety); independence (no self-attestation as sole proof, no inferred isolation, distinguish
self-report from independent observation); behavior (demonstrate denied connectivity, demonstrate denial is enforced).

## Independence analysis
Each candidate source is classified `SELF_REPORTED | CONFIGURATION_OBSERVED | HOST_STATE_OBSERVED |
CONTROLLED_BEHAVIOR_OBSERVED | INDEPENDENT_OBSERVER | EXTERNAL_CONTROL_PLANE | SYNTHETIC_ONLY | INFERRED | UNKNOWN`.
Only `INDEPENDENT_OBSERVER` and `EXTERNAL_CONTROL_PLANE` can contribute to L4, and only when `OBSERVED`, `FRESH`,
applicable, isolation-supporting, non-revoked, **and** enforcement-demonstrated. "The host says its firewall blocks
outbound" (self/config/host-state) and "netstat shows no connection" (inference) can **never** be L4. Independence is
never inferred from the mere fact that a command is read-only.

## Architectural path options assessed (not instructions)
- **OPT-EXT-EGRESS** — infrastructure egress policy + independent control plane observer → L4-capable *with
  prerequisites* (external infra + config change).
- **OPT-HYPERVISOR** — VM no-egress + hypervisor-host observer → L4-capable *with prerequisites*.
- **OPT-HOST-PLUS-OBSERVER** — host outbound-deny + independent observer → currently
  `BLOCKED_BY_REQUIRED_CONFIGURATION_CHANGE` (no deny policy, no observer).
- **OPT-NETNS-SANDBOX** — sandbox/namespace no-egress → `BLOCKED_BY_MISSING_INDEPENDENT_OBSERVER`; process-only
  scope, needs an independent observer.
- **OPT-SEPARATE-OBSERVER** — separate observer environment → `BLOCKED_BY_ENVIRONMENT` (no enforcement boundary to
  observe yet).
- **OPT-DEDICATED-MACHINE** — dedicated isolated machine + independent verifier → L4-capable *with prerequisites*.

Every option records enforcement point, observation point, who enforces, who observes, why the observer is/ isn't
independent, evidence produced, M9 level supported, additional evidence for L4, config/infra needs, benchmark
coexistence, false-positive risks, unresolved gaps, prerequisites, and `REQUIRES_SEPARATE_AUTHORIZATION`. No option
is labelled L4-capable merely because it "sounds isolated" — only genuine, demonstrable independence qualifies.

## Current-environment gap matrix (deterministic; `can_m11_close = false` for all)
| Requirement | Current evidence | Required | Level | Gap | Future auth | Blocking |
|---|---|---|---|---|---|---|
| REQ-04 isolation boundary | no outbound-deny (M10) | egress-deny boundary | L0 | no boundary | yes | yes |
| REQ-06 enforcement point | none | provisioned enforcement | L0 | absent | yes | yes |
| REQ-08 observation independence | no independent observer | independent observer | L0 | absent | yes | yes |
| REQ-10 external observer | none | external observer/control plane | L0 | absent | yes | yes |
| REQ-21 demonstrate denied connectivity | active outbound observed (M10) | denied-test observed | L0 | not demonstrated | yes | yes |
| REQ-22 denial enforced | not demonstrated | enforcement demonstrated | L0 | not demonstrated | yes | yes |
| REQ-01 environment identity | matches PTPL-DK-BENCH-WIN-01 | bound | L1 | none | no | no |
| REQ-02 target profile | matches | bound | L1 | none | no | no |

Also incorporated from M10: outbound connectivity observed; no outbound-deny policy; four mechanisms UNKNOWN
(EFFECTIVE_FIREWALL_RULES, PROCESS_NETWORK_ASSOCIATION, OS_NETWORK_POLICY, ISOLATED_ENV_CONTROLS); host self-inspection
not independent; M9 UNVERIFIED; M8 EXECUTION_BLOCKED.

## Current real status
`path_status = BLOCKED_BY_MISSING_INDEPENDENT_OBSERVER`; `current_real_network_isolation = UNVERIFIED`;
`current_real_achieved_level = L0`; `current_real_independence_satisfied = false`. The current Windows host cannot
satisfy L4: there is no independent observer, no enforced outbound-deny boundary, and active outbound connectivity was
observed. **This is stated plainly: the current environment cannot satisfy L4 as-is.**

## Fail-closed path status values
`FEASIBLE_WITH_PREREQUISITES | BLOCKED_BY_MISSING_INDEPENDENT_OBSERVER | BLOCKED_BY_ENVIRONMENT |
BLOCKED_BY_REQUIRED_CONFIGURATION_CHANGE | UNVERIFIED | UNKNOWN`. `VERIFIED` is intentionally **not** a possible M11
output.

## Future evidence plan (hypothetical; never executed)
Prerequisite dedicated environment with an enforced egress-deny boundary; enforcement actually enforced (not merely
configured); an independent observer (not the enforcer, not the host self-report); a controlled denied-connection test
observed independently; secret-safe, hashed, fresh, provenance-bound evidence; contradiction handling that fails
closed; submission to M9 `runVerification` (only genuine L4 yields VERIFIED, never weakened); and, only if VERIFIED, a
**separate** M8 authorization plus full preflight. **The plan explicitly requires a new owner authorization and is
not executed.**

## Prerequisites requiring separate authorization
Provisioning an egress-deny boundary; provisioning/observing enforcement independently; provisioning an independent
observer / external control plane / hypervisor / dedicated machine; any firewall/routing/proxy/VPN/adapter/VM/OS/
policy change; new software. All recorded as `REQUIRES_SEPARATE_AUTHORIZATION`; none performed.

## M9 / M8 relationship
`pathAssessmentToM9` and `pathAssessmentToM8` are fail-closed and **always return `UNVERIFIED`** — M11 can never emit
VERIFIED to M9 or M8. Even the synthetic L4 mechanics fixture (`FEASIBLE_WITH_PREREQUISITES`) leaves the real
baseline UNVERIFIED and the unmodified M8 gate `EXECUTION_BLOCKED`.

## Statements
**M11 does not certify any host and does not publish any profile.** No external network was contacted, no OS/network
configuration was changed, Claude was not executed, no credentials were accessed. `NETWORK_ISOLATION` remains
**UNVERIFIED** and M8 remains **EXECUTION_BLOCKED**. Any future environment-changing or evidence-acquisition operation
requires explicit owner authorization.
