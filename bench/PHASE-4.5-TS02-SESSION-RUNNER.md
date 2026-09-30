# Phase 4.5 — TS-02 authenticated-session runner (`bench/src/ts02.ts`)

The standalone runner that produces the approved TS-02 evidence from **one real authenticated Claude Code
session** in the already-provisioned isolated environment. It is **separate from `runA.ts`** and is **not** gated
by Run-A authorization.

## What it does
- Runs exactly one minimal authenticated session against an isolated `CLAUDE_CONFIG_DIR` and emits the approved
  TS-02 evidence pair: **`aebs.auth_attempt/1`** (the TS-02 authenticated-session attempt record) + a redacted
  **`aebs.session_transcript/1`**, carrying `run_id`, `environment_id`, session-level `verified_at`, a non-secret
  `auth_reference`, the isolated-config identity, and the pinned CLI identity.
- Validates the evidence (schema + semantics) and returns it. It does **not** itself mark TS-02 resolved — a
  separate recording step does that once real evidence is validated.

> **Naming note:** the Run-A `aebs.attempt/2` schema is Run-A-specific (it requires case/repetition/dimension
> data a standalone auth session has no basis for). To avoid fabricating those fields, TS-02 evidence uses the
> dedicated `aebs.auth_attempt/1` + `aebs.session_transcript/1` schemas — the TS-02 analogue of an attempt+transcript.

## What it will NOT do
- No Run A, no benchmark case execution, no TS-05/07/11, no benchmark spend, no model substitution.
- No use or copy of the real `~/.claude` (the isolation guard rejects it).
- No fake/simulated transcript is accepted as *real* TS-02 evidence: a `test_double` session is recorded with
  `authenticated: 'synthetic_test_fixture'` and fails `validateTs02Evidence(..., { requireReal: true })`.
- It never prints or stores credential/token/secret contents (event metadata only; a secret scan rejects leaks).

## Gating (two independent gates for a real run)
1. **`approve_enable_real_sessions`** must be recorded APPROVED in the Phase 4 register
   (`enableRealSessionsApproved()`), else the runner refuses.
2. **A real Claude invocation** (`executable.kind === 'claude_code'`) additionally requires **both**
   `confirmRealRun: true` **and** the environment token `AEBS_TS02_CONFIRM=1`, **and** a pinned-CLI-identity match
   (`verifyPinnedCli`: SHA-256 must equal `9DBE16…DE3A`; version `2.1.283`; no substitution). Unit tests set none
   of these and use a `test_double`, so **tests and build never invoke the real CLI**.

## Entry point
`runTs02Session(opts)` in `bench/src/ts02.ts`. Key options: `executable` (`claude_code` | `test_double`),
`configDir` (isolated), `environmentId`, `cwd`, `ids`, and for a real run `cliExecutablePath` + `confirmRealRun`.

## Operator procedure (real run — performed by the PTPL operator, not by tests/build)
1. Ensure `approve_enable_real_sessions` is recorded APPROVED and the isolated environment `PTPL-DK-BENCH-WIN-01`
   is provisioned and authenticated (`cfg/` holds the isolated login).
2. Set `AEBS_TS02_CONFIRM=1` and call `runTs02Session({ executable: { kind: 'claude_code', path: <claude.exe> },
   configDir: <isolated cfg>, environmentId: 'PTPL-DK-BENCH-WIN-01', cwd: <isolated ws>, ids, cliExecutablePath: <claude.exe>, confirmRealRun: true })`.
3. The runner verifies the pinned CLI, runs one minimal turn, captures the stream, and returns the validated
   `aebs.auth_attempt/1` + `aebs.session_transcript/1`. Persist them via the approved store (redacted).

## How the operator knows a real session occurred
`aebs.auth_attempt/1.provenance === 'claude_code'` and `authenticated === 'real'`; the transcript shows
`results_seen >= 1` (a real `result` event) with a `session_id`; `validateTs02Evidence(..., { requireReal: true })`
passes only for a real session. `verifyPinnedCli` confirms the exact CLI identity.

## Where redacted evidence is written
The runner returns the evidence; persistence is via the existing store (an explicit local path, BQ-06). Paths are
home-redacted (`~`) and only event metadata (type/subtype/session_id/model) is kept — never raw stdout or secrets.

## Guarantees preserved
Run A stays blocked (`planRunA().may_start === false`, `checkRunAuthorization().authorized === false`); the runner
is not wired to that gate. `runSession`/`runA.ts` behavior is unchanged (the Run-A gate still guards `claude_code`
there). No BQ/GAP/TS-05/07/11 decision is changed, and no `/runtime/` is created.
