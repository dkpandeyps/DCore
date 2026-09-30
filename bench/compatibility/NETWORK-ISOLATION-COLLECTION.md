# dkskill Authorized Read-Only Network Isolation Evidence Collection (M10)

**STATUS: M10 IMPLEMENTED / NETWORK_ISOLATION = UNVERIFIED / M8 = EXECUTION_BLOCKED / NO HOST CERTIFIED /
NOTHING PUBLISHED / TS-07 UNRESOLVED / TS-11 UNRESOLVED**

M10 (`bench/compatibility/network-isolation-collection.ts`, `network-isolation-collection-types.ts`) collects
**READ-ONLY** evidence from the actual environment `PTPL-DK-BENCH-WIN-01` that can support or contradict the M9
network-isolation claim. It is deterministic and **fail-closed**. It never modifies any OS/network/firewall/routing/
DNS/proxy/VPN/adapter/policy/service/Claude/credential state, never contacts an external network, never executes
Claude, never authenticates, never spends, and never modifies or authorizes M8. **Host self-inspection can never be
independent verification (L4), so collection alone cannot reach `VERIFIED`.**

## Purpose
Distinguish (1) what is configured, (2) what the OS reports, (3) what can be observationally established, and (4)
what remains unknown — without ever promoting configuration/observation to independent verification. Valid outcomes:
`VERIFIED | UNVERIFIED | FAILED | BLOCKED`. If L4 cannot be legitimately established, the result stays `UNVERIFIED`.

## Read-only boundary
Allowed: querying OS/firewall/routing/DNS/proxy/adapter/connection/process-network/policy/isolated-control state and
hashing safe metadata. Forbidden: any set/change/enable/disable/install/modify of rules, adapters, routes, DNS,
proxy, VPN, policy, services, tools, environment variables, Claude configuration, credentials, or isolation itself.

## Collection safety gate (COL-01…COL-14, fail-closed)
Environment identity; `READ_ONLY` mode; no write-capable operation; no Claude execution; no authentication; no
external service dependency; no credential access; no real `~/.claude` access; no `/runtime/`; no production registry
access; no benchmark execution; no Run A / publication / certification authorization. Any failed gate ⇒ `BLOCKED`.

## Windows evidence sources
`WINDOWS_FIREWALL_STATE, FIREWALL_PROFILES, EFFECTIVE_FIREWALL_RULES, NETWORK_ADAPTER_STATE, ROUTING_STATE,
ACTIVE_CONNECTIONS, DNS_CONFIG, PROXY_CONFIG, PROCESS_NETWORK_ASSOCIATION, OS_NETWORK_POLICY, ISOLATED_ENV_CONTROLS`.
Each returns `OBSERVED | SUPPORTED | UNSUPPORTED | UNKNOWN | ERROR`; `ERROR`/`UNKNOWN` is never converted to PASS.

## Command allowlist (no dynamic construction)
Real inspection runs only fixed, read-only command definitions (`command_id`, `executable_path`, exact `args`,
`read_only: true`): `netsh advfirewall show allprofiles`, `Get-NetFirewallProfile` (select Name/Enabled/
DefaultOutboundAction), `netsh winhttp show proxy`, `route print -4`, `netsh interface ip show dns`, `netsh interface
show interface`, `netstat -ano`. No arbitrary shell, user/downloaded scripts, package executors, interpreters,
Claude, package managers, or network utilities. Dynamic command construction is rejected; unavailable inspection is
recorded `UNKNOWN`/`UNAVAILABLE`, fail-closed. No external network is contacted (all commands read local state).

## Configuration vs observation vs independent verification
Every observation is `CONFIGURATION_EVIDENCE | HOST_OBSERVATION | CONTROLLED_BEHAVIOR_EVIDENCE |
INDEPENDENT_VERIFICATION`. `classifyOutcome` classifies real host inspection only as CONFIGURATION or HOST_OBSERVATION
— **never** INDEPENDENT — so it is impossible for host self-inspection to reach L4.

## Verification levels (M9 authority preserved)
`L0 CLAIMED, L1 CONFIGURATION_OBSERVED, L2 HOST_STATE_OBSERVED, L3 CONTROLLED_BEHAVIOR_OBSERVED, L4
INDEPENDENTLY_VERIFIED`. M10 may collect L1/L2 (and, with a controlled probe, L3). The VERIFIED/level decision is
delegated to the **M9** engine (`runVerification`); the L4 predicate is never weakened or duplicated. `VERIFIED`
requires genuine L4 independence via `assessIndependence` — rejected when evidence is self-reported, configuration-
only, produced by the policy being tested, synthetic, inferred from documentation/env vars/absence of connections,
or a single firewall rule.

## Contradiction detection
Deterministic and fail-closed: firewall "deny" plus an observed established outbound connection, or an isolation
claim plus observed unknown traffic, ⇒ `BLOCKED`/`FAILED` (never the favorable interpretation). Any material
contradiction prevents `VERIFIED`.

## Freshness / scope / secrets / hashing / audit
Freshness (`FRESH | STALE | EXPIRED | UNKNOWN`) via injected clock; stale/expired/revoked cannot verify. Scope
(`PROCESS_ONLY … HOST_ONLY … OUTBOUND_DENY …`) never broadened beyond evidence; a PROCESS_ONLY proof does not satisfy
an OUTBOUND_DENY request. Secret-safe redaction runs before persistence (API keys, OAuth/bearer tokens, passwords,
cookies, private keys, authorization headers); raw output is never persisted verbatim. Each observation is normalized
and hashed (`raw_hash`, `normalized_hash`); audit records are hash-chained (`record_hash`/`previous_record_hash`),
tamper-evident, and never rewritten (revocation/correction creates a new record).

## Result states
Collection: `COMPLETE | PARTIAL | BLOCKED | FAILED | UNAVAILABLE`. Verification: `VERIFIED | UNVERIFIED | FAILED |
BLOCKED`.

## M9 / M8 relationship
`networkIsolationCollectionToM9` and `networkIsolationCollectionToM8` are pure, fail-closed adapters: only a genuine
`VERIFIED + L4 + independence` result may satisfy M8 EP-13. Everything else keeps M8 `EXECUTION_BLOCKED`. M8 is not
modified, not authorized, and never transitioned to READY. Collection itself does not authorize execution.

## Current environment result
A **real read-only inspection was performed** on `PTPL-DK-BENCH-WIN-01`: `netsh advfirewall show allprofiles`,
`Get-NetFirewallProfile`, `netsh winhttp show proxy`, `route print -4`, `netsh interface ip show dns`, `netsh
interface show interface`, and `netstat -ano` all returned `OBSERVED` (four mechanisms — EFFECTIVE_FIREWALL_RULES,
PROCESS_NETWORK_ASSOCIATION, OS_NETWORK_POLICY, ISOLATED_ENV_CONTROLS — were not inspected and remain `UNKNOWN`). The
host showed active outbound connections and no outbound-deny policy, so no isolation is established. Because host
self-inspection is not independent (no L4), `achieved_level = L0`, `network_isolation = UNVERIFIED`, and via the
fail-closed adapter the unmodified M8 gate remains **`EXECUTION_BLOCKED`** (`STOP-NETWORK-UNVERIFIED`). The committed
samples are synthetic and deterministic; the real inspection result is not persisted (nondeterministic).

### Exact requirements for VERIFIED
An `INDEPENDENT_VERIFICATION` observation — produced by an observer that did not create the isolation — that is
`OBSERVED`, `FRESH`, in-scope for the requested scope, isolation-supporting, non-revoked, applicable to
`PTPL-DK-BENCH-WIN-01` on the exact host, with no contradicting leak/unknown-traffic observation. Configuration,
host state, controlled behavior, and synthetic fixtures cannot substitute for it.

## Why collection does not authorize execution
M10 gathers evidence; it does not decide certification (M4), publication (M5/M6), or execution (M8). Even a genuine
`VERIFIED` result only makes the M8 network gate *satisfiable*; a separate explicit authorization and the full M8
preflight are still required. M10 never authorizes or executes anything.

## Statements
**M10 does not certify any host and does not publish any profile.** No external network was contacted, no system/
network configuration was changed, Claude was not executed, no credentials were accessed. `NETWORK_ISOLATION`
remains **UNVERIFIED** and M8 remains **EXECUTION_BLOCKED**.
