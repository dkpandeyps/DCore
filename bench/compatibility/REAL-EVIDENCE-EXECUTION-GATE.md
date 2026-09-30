# dkskill Controlled Real Evidence Session Authorization & Execution Gate (M8)

**STATUS: M8 IMPLEMENTED / CURRENT REAL EXECUTION = BLOCKED / NO HOST CERTIFIED / NOTHING PUBLISHED /
TS-07 UNRESOLVED / TS-11 UNRESOLVED**

M8 (`bench/compatibility/evidence-execution.ts`, `evidence-execution-types.ts`) is the **safety/authorization
gate** that decides whether a **future** evidence-session executor MAY execute a real TS-07/TS-11 session. It is
deterministic and **fail-closed**. **M8 itself never executes that session** — it executes no Claude Code,
authenticates nothing, spends nothing, runs no Run A / benchmark, certifies nothing, publishes nothing, and mutates
no production registry. Default `EXECUTION_DISABLED` / `DRY_RUN`. **There are no bypass flags.**

## Purpose & boundary
```
M7 EVIDENCE PLAN -> M8 TARGET VALIDATION -> M8 AUTHORIZATION VALIDATION -> M8 PREFLIGHT -> M8 SAFETY GATES
  -> M8 EXECUTION DECISION -> (future explicitly-authorized session) -> M7 EVIDENCE VALIDATION -> M4 CERTIFICATION
```
M8 never performs `evidence -> certification`. It only decides whether a future executor may run. Evidence flows
only to M7; **M4 remains the certification authority; M5/M6 remain the publication/governance authorities.**

## Exact target (no wildcard / range / substitution)
`profile_id = cc-2.1.283-win32-x64-native@1`, `version = 2.1.283`, `binary_sha256 =
9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A`, `platform = win32` (Windows), `architecture =
x64`, `channel = native`, `environment = PTPL-DK-BENCH-WIN-01`. Any mismatch is a HARD STOP. No `latest`, no version
range, no binary/platform/architecture/channel/model substitution.

## Execution states
`DISABLED, REQUESTED, AUTHORIZED, PREFLIGHTING, READY, EXECUTING, STOPPED, COMPLETED, FAILED, BLOCKED, REVOKED`.
There is no implicit transition to `EXECUTING`.

## Evidence-only scope
Only `TS-07` and `TS-11` real-evidence targets are permitted. `Run A`, benchmark execution, k=30, calibration,
model comparison, cost/performance measurement, production certification, publication, and registry mutation are
structurally excluded — any such request is `BLOCKED`.

## Authorization
A dedicated `dkskill.evidence_execution_authorization/1`, **disjoint** from Run A / benchmark / publication /
registry-governance / prior TS-02 authorization. It carries `authorization_id`, `authorized_by`, `authorized_role`,
the exact target tuple, `allowed_tests`, `allowed_environment_id`, timestamp, expiration, and
`authorization_payload_hash` (binds the exact target + tests; any change invalidates it). States: `VALID, EXPIRED,
REVOKED, MISMATCHED, MISSING`. Authorization is never inferred from M5/M6/M7 or reused merely because it exists.

## Environment isolation & config safety
The environment snapshot captures only safe metadata (id, OS, platform, arch, version, binary identity, config-dir
*identity*, isolation status, credential *status*, network status, toolchain identity, timestamp) — never OAuth
tokens, API keys, passwords, cookies, credential contents, or authorization headers. Future execution MUST use the
dedicated isolated `CLAUDE_CONFIG_DIR`, never real `~/.claude`. Preflight verifies the expected dedicated dir,
ownership, and the **absence** of any symlink/junction/overlap to, or credential copy from, real `~/.claude`; if
isolation cannot be proven, `BLOCKED`.

## Binary verification
Before any future execution: identify the exact approved binary, compute SHA-256, and verify version/platform/
architecture/channel against the frozen target. Mismatch is a HARD STOP; a substitute binary is never executed.

## Network isolation (mandatory gate — current blocker)
Network isolation is a MANDATORY safety gate with states `VERIFIED | UNVERIFIED | FAILED | NOT_APPLICABLE`. It is
`PASS` **only** on `VERIFIED`; it is never inferred from an env var, a config option, documentation, an allowlist,
or a synthetic fixture. **The current environment is `UNVERIFIED`, so the current real execution decision is
`EXECUTION_BLOCKED` (`STOP-NETWORK-UNVERIFIED`).** No network-isolation evidence is fabricated.

## Credential safety
Verifies no injected API key, no unauthorized token, a dedicated config dir, no real `~/.claude` credential copy, an
explicitly-known credential state, and no secret persisted in evidence. Ambiguous credential state ⇒ `BLOCKED`.

## Process safety
Only explicitly approved processes are allowed; safe metadata only (identity, path, hash where available, start
time, parent). An unexpected process is a HARD STOP. M8 never kills arbitrary processes.

## Filesystem safety
Allowed roots: isolated evidence workspace, isolated Claude config dir, approved temporary evidence location.
Forbidden: real `~/.claude`, the production registry, unrelated user files, `/runtime/`. An unexpected write is a
HARD STOP; UNKNOWN filesystem state ⇒ `BLOCKED`.

## Preflight gates (EP-01…EP-25; no implicit PASS)
EP-01 exact profile; EP-02 exact version; EP-03 exact binary hash; EP-04 platform; EP-05 architecture; EP-06
channel; EP-07 exact environment; EP-08 isolated config dir; EP-09 real `~/.claude` exclusion; EP-10 credential
safety; EP-11 process policy; EP-12 filesystem policy; EP-13 network isolation; EP-14 explicit execution
authorization; EP-15 TS-07/TS-11 scope; EP-16 Run A exclusion; EP-17 benchmark exclusion; EP-18 publication
exclusion; EP-19 registry-mutation exclusion; EP-20 M7 plan binding; EP-21 M3 exact profile resolution; EP-22
synthetic-only exclusion; EP-23 binary-substitution exclusion; EP-24 model-substitution exclusion; EP-25 toolchain
identity. Each is `PASS | FAIL | BLOCKED | NOT_RUN`. Any safety-critical gate not `PASS` ⇒ `EXECUTION_BLOCKED`.

## Execution decision
`evaluateEvidenceExecutionGate(...)` returns `EXECUTION_ALLOWED | EXECUTION_BLOCKED | EXECUTION_REVOKED |
EXECUTION_EXPIRED | EXECUTION_FAILED`. **The current real environment returns `EXECUTION_BLOCKED`** because network
isolation is unresolved.

## Future executor (default OFF; no bypass)
`executeEvidenceExecution(...)` defaults `EXECUTION_DISABLED` and performs nothing. It becomes *eligible* only when
LIVE is explicitly requested AND the gate `EXECUTION_ALLOWED` AND network is `VERIFIED` AND a dedicated execution
authorization is supplied — and even then M8 downgrades to `DRY_RUN` and executes nothing. There are **no** bypass
options (`--force`, `--unsafe`, `--skip-preflight`, `--ignore-safety`, `--allow-unknown` do not exist); arbitrary
options are ignored.

## TS-07 scope
A future session may collect only TS-07 evidence: live stream observations, stream schema, attribution@1, unknown
events, malformed events, relevant permission observations, event ordering, raw + normalized evidence, provenance.
No benchmark measurements, no k=30, no model comparison.

## TS-11 scope
A future session may collect only explicitly-required TS-11 evidence, each observation bound to NM id, exact
host/profile/version/binary/environment, capability dependency, expected vs observed behavior, result, and
provenance. Scope is never expanded automatically.

## Hard resource limits
Wall-clock duration, process count, filesystem output size, evidence artifact size, network destination count, and
retry count. Exceeding any hard limit STOPs; there is no automatic continuation.

## Stop codes (deterministic; unknown ⇒ fail closed)
`STOP-BINARY-MISMATCH, STOP-VERSION-MISMATCH, STOP-PLATFORM-MISMATCH, STOP-ARCHITECTURE-MISMATCH,
STOP-CHANNEL-MISMATCH, STOP-ENVIRONMENT-MISMATCH, STOP-CONFIG-DIR-UNSAFE, STOP-REAL-CLAUDE-DIR-DETECTED,
STOP-CREDENTIAL-AMBIGUOUS, STOP-NETWORK-UNVERIFIED, STOP-NETWORK-VIOLATION, STOP-PROCESS-VIOLATION,
STOP-FILESYSTEM-VIOLATION, STOP-AUTHORIZATION-MISSING, STOP-AUTHORIZATION-MISMATCH, STOP-AUTHORIZATION-EXPIRED,
STOP-AUTHORIZATION-REVOKED, STOP-SCOPE-VIOLATION, STOP-RUN-A-DETECTED, STOP-BENCHMARK-DETECTED,
STOP-PUBLICATION-DETECTED, STOP-REGISTRY-MUTATION-DETECTED, STOP-SECRET-DETECTED, STOP-EVIDENCE-INTEGRITY,
STOP-UNKNOWN-CONDITION.` An unknown safety condition fails closed.

## Postflight (mandatory; never auto-certifies)
PF-01 process cleanup; PF-02 unexpected-process detection; PF-03 filesystem audit; PF-04 real `~/.claude` unchanged;
PF-05 production registry unchanged; PF-06 `/runtime/` absent; PF-07 evidence integrity; PF-08 secret scan; PF-09
network-observation integrity; PF-10 authorization-scope compliance; PF-11 target-identity compliance; PF-12 no
benchmark invocation; PF-13 no Run A execution; PF-14 no publication; PF-15 no certification side effect. Any failed
safety postflight ⇒ `SESSION_FAILED`. **M4 certification is never invoked automatically.**

## Audit trail
Every future execution attempt produces an immutable, hash-chained `dkskill.evidence_execution_record/1`
(`audit_hash = SHA-256(canonical(record without audit_hash))`, plus `previous_audit_hash`) with execution id,
authorization id, plan id, target, binary hash, environment id, preflight results, execution state, stop reason,
postflight results, evidence hashes, and timestamp. No secrets.

## Revocation / expiration
Authorization supports `VALID | EXPIRED | REVOKED`. Expired/revoked authorization ⇒ `BLOCKED`; expiry or revocation
during execution STOPs. No automatic renewal.

## Current result
- **`cc-2.1.283-win32-x64-native@1`** → **`EXECUTION_BLOCKED`**, `STOP-NETWORK-UNVERIFIED`, network isolation
  `UNVERIFIED`. TS-07 and TS-11 remain **UNRESOLVED**.
- The all-pass fixture is a `SYNTHETIC_TEST_ONLY` gate-mechanics demonstration on a hypothetical fully-verified
  input; it returns `EXECUTION_ALLOWED` to prove the gate mechanics but **executes no Claude Code** (executor stays
  disabled).

## Statements
**M8 does not certify any host. M8 does not publish any profile.** It executes no Claude Code, authenticates
nothing, spends nothing, runs no Run A or benchmark, mutates no production registry, and creates no `/runtime/`. The
current real execution decision is **BLOCKED**.
