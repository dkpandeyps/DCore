# dkskill Independently Verifiable Network-Isolation Gate (M9)

**STATUS: M9 IMPLEMENTED / NETWORK_ISOLATION = UNVERIFIED / M8 = EXECUTION_BLOCKED / NO HOST CERTIFIED /
NOTHING PUBLISHED / TS-07 UNRESOLVED / TS-11 UNRESOLVED**

M9 (`bench/compatibility/network-isolation.ts`, `network-isolation-types.ts`) determines whether the dedicated
evidence environment can obtain **authoritative, independently verifiable** evidence sufficient to change
`NETWORK_ISOLATION = UNVERIFIED` to `VERIFIED` — the single remaining prerequisite for a future real TS-07/TS-11
evidence session. It is deterministic, **READ-ONLY**, **OFFLINE**, and **fail-closed**: a pure function over
supplied observation records. **UNVERIFIED is a valid, successful M9 outcome.** M9 executes no Claude, authenticates
nothing, spends nothing, contacts no network, and changes no system/network configuration. It never modifies,
weakens, or bypasses the M8 gate.

## Purpose
Answer, for environment `PTPL-DK-BENCH-WIN-01` and the future M8 evidence-session context, whether network
isolation is independently verified. If authoritative (L4) evidence cannot be established, `NETWORK_ISOLATION`
remains `UNVERIFIED` and M8 execution remains `BLOCKED` (`STOP-NETWORK-UNVERIFIED`).

## Verification levels (only L4 verifies)
- **L0 CLAIMED** — an assertion/claim only.
- **L1 CONFIGURATION_OBSERVED** — configuration evidence (e.g. a firewall rule declared).
- **L2 HOST_STATE_OBSERVED** — observed host state (e.g. firewall profiles report outbound blocked).
- **L3 CONTROLLED_BEHAVIOR_OBSERVED** — controlled local behavior observed.
- **L4 INDEPENDENTLY_VERIFIED** — independent observation (the verifier did not create what it verifies).

**Only L4 can produce `NETWORK_ISOLATION = VERIFIED`.** Configuration, documentation, environment variables, a
declared firewall rule, an application allowlist, a claimed "offline" mode, a previous assertion, or a synthetic
fixture — each **alone** — is insufficient. If L4 cannot be achieved, the result is `UNVERIFIED` and the reason is
documented.

## Verification states
`REQUESTED, ASSESSING, OBSERVING, SUPPORTED, VERIFIED, UNVERIFIED, FAILED, BLOCKED, EXPIRED, REVOKED`. Only
`VERIFIED` may satisfy the M8 network gate (EP-13).

## Verification methodology
`runVerification(request, observations, now)` is pure and deterministic. Each observation is normalized to hashed,
scoped evidence (`toEvidence`), assessed for freshness, and checked for applicability (environment/host/os/arch
match) and scope. `detectContradictions` fails closed on conflicting evidence. `achievedLevel` computes the highest
level supported only by fresh, in-scope, isolation-supporting, applicable evidence. `networkIsolationVerified`
requires an L4 `INDEPENDENT_VERIFICATION` observation that is `OBSERVED`, `FRESH`, in-scope, isolation-supporting,
not revoked, with **no contradictions**. Precedence: revoked → `REVOKED`; expired L4 → `EXPIRED`; contradiction →
`BLOCKED`; failed independent source → `FAILED`; L4 satisfied → `VERIFIED`; otherwise → `UNVERIFIED`.

## Evidence classes (distinct, never conflated)
`CONFIGURATION_EVIDENCE` ≠ `OBSERVATIONAL_EVIDENCE` ≠ `INDEPENDENT_VERIFICATION`. "We configured a firewall rule
and observed our own configuration" is CONFIGURATION_EVIDENCE, **not** independent verification.

## Windows evidence sources evaluated (read-only)
`WINDOWS_FIREWALL_STATE, FIREWALL_PROFILES, EFFECTIVE_FIREWALL_RULES, NETWORK_ADAPTER_STATE, ROUTING_STATE,
ACTIVE_CONNECTIONS, DNS_CONFIG, PROXY_CONFIG, PROCESS_NETWORK_ASSOCIATION, OS_NETWORK_POLICY,
EXTERNAL_CONNECTION_ATTEMPTS, ISOLATED_ENV_CONTROLS`. Each is recorded as `OBSERVED | SUPPORTED | UNSUPPORTED |
UNKNOWN`; none proves complete isolation by itself. For the current environment **all twelve are `UNKNOWN`** — M9
performed no live inspection (offline/deterministic); independent read-only collection is a future prerequisite.

## Read-only constraint
M9 changes nothing: no firewall rules, adapters, VPN, proxy, routes, DNS, Windows policies, software/drivers,
security configuration, Claude configuration, or credentials. If a stronger isolation mechanism requires system
configuration, it is **reported as a prerequisite**, never applied automatically.

## Scope boundary
A verification claim never exceeds its evidence. Scopes: `PROCESS_ONLY, ENVIRONMENT_ONLY, HOST_ONLY,
NETWORK_NAMESPACE, FIREWALL_POLICY, OUTBOUND_DENY, DESTINATION_ALLOWLIST, OTHER`. "Outbound denied for the
evidence-session process" (`PROCESS_ONLY`) is **not** "the entire Windows host has no connectivity" (`HOST_ONLY`).
Process-only evidence for a host-only request does not verify; `proven_scope` never exceeds the evidence.

## Freshness
Evidence carries `observed_at`, `expires_at`, `max_age_ms`; freshness is `FRESH | STALE | EXPIRED | UNKNOWN`.
Stale/expired evidence cannot satisfy `VERIFIED`. Timestamps are never invented; tests use a fixed clock.

## Contradiction handling
Conflicting observations fail closed (`BLOCKED`/`UNVERIFIED`); the favorable observation is never selected. Firewall
"deny" plus an observed active outbound connection ⇒ not verified. Allowlist "isolation" plus observed unknown
traffic ⇒ not verified.

## Revocation / expiration
`VALID | EXPIRED | REVOKED`. Revocation/expiration create a new state result; historical evidence is never mutated.

## Audit chain
Hash-chained `dkskill.network_isolation_audit/1` records (`record_hash = SHA-256(canonical(record without
record_hash))`, plus `previous_record_hash`); tampering is detectable; records are immutable.

## M8 integration
`networkIsolationToM8Gate(verification)` is a **pure, fail-closed adapter** returning `VERIFIED | UNVERIFIED |
FAILED | BLOCKED`. Only `VERIFIED` may satisfy M8 EP-13; every other state keeps M8 `EXECUTION_BLOCKED`. The M8
artifact is **not modified**, and M9 never transitions M8 to `READY` or authorizes execution.

## Current environment result
- **`PTPL-DK-BENCH-WIN-01`** → `state = UNVERIFIED`, `achieved_level = L0`, `network_isolation = UNVERIFIED`, all
  twelve Windows mechanisms `UNKNOWN`. Fed through the fail-closed adapter into the unmodified M8 gate → M8 remains
  **`EXECUTION_BLOCKED`** (`STOP-NETWORK-UNVERIFIED`).
- The L4 fixture is `SYNTHETIC_TEST_ONLY` (gate mechanics only) and does not change the real state.

### Why the current result is UNVERIFIED, and what would reach VERIFIED
No L4 `INDEPENDENT_VERIFICATION` evidence exists. To reach `VERIFIED`, an independent observer (not the verifier
that configured the isolation) must produce an `OBSERVED`, `FRESH`, in-scope, isolation-supporting record — for the
requested scope — with no contradicting leak/unknown-traffic observation, for `PTPL-DK-BENCH-WIN-01` on the exact
host. Such collection requires separate, explicit, owner-approved read-only setup and is **not** performed here.

## Statements
**M9 does not certify any host and does not publish any profile.** It performs no live network contact, changes no
network/system configuration, executes no Claude, authenticates nothing, and spends nothing. It does not
automatically authorize or execute a real evidence session. `NETWORK_ISOLATION` remains **UNVERIFIED** and M8
remains **EXECUTION_BLOCKED**.
