---
name: dcore
description: Universal, fail-closed Claude Code skill for framing problems, writing specifications, planning engineering work, reviewing code, and QA/test planning. Cloneable and installable with no certification, credentials, or network required.
license: Apache-2.0
---

# DCore

DCore is a universal, platform-neutral Claude Code skill set. It helps you turn a raw request into structured,
reviewable engineering artifacts — a framed problem, a specification, an implementation plan, a code review, or a test
plan — safely and deterministically, on Windows, macOS, or Linux.

**DCore works the moment you clone and install it.** It needs no certification, no credentials, no `~/.claude`
access, no network, and no PTPL/private infrastructure for ordinary use.

## When to use DCore
Use DCore when you want a consistent, safe structure for common software work:
- **dcore-frame** — turn a vague request into a framed problem (objective, stakeholders, risks, open questions).
- **dcore-spec** — turn a problem into a specification (objective, users, requirements, constraints, assumptions,
  acceptance criteria, open questions).
- **dcore-plan** — turn a feature into an implementation plan (architecture, components, dependencies, risks, tests,
  rollout).
- **dcore-review** — produce a structured review of code/diff (correctness, security, maintainability, findings with
  severity, recommendations).
- **dcore-qa** — produce a test plan (levels, scenarios, edge cases, data, exit criteria).
- **dcore-debug** — turn a defect report into hypotheses, evidence to collect, likely root causes, next steps.
- **dcore-sec** — threat-model a change (assets, surface, STRIDE checks, findings, residual risk).
- **dcore-release** — fail-closed release-readiness checklist with explicit go/no-go gates.
- **dcore-doc** — turn a feature/spec/change into a documentation scaffold (known vs explicit `UNKNOWN`; invents nothing).
- **dcore-chain** — run the common `frame → spec → plan → qa` path in one call (a thin composition convenience).
- **dcore-impact** — given a change + `--repo <path>`, find literal references and classify DIRECT_EVIDENCE / LIKELY_AFFECTED (tests) / POSSIBLY_AFFECTED (docs) / UNKNOWN (read-only; excludes secret files; not a dependency graph).

**Composability (handoff):** pipe one module's `--json` into the next — e.g. `dcore-spec "…" --json | dcore-plan`
or `| dcore-qa`. DCore detects a prior module's JSON on input and carries its objective (and requirements/components/
scenarios) forward, tagging `handoff_from`, so chains need no re-typing. Plain text is never treated as a handoff.

For the common path, `dcore-chain "…"` runs frame→spec→plan→qa in one call and returns every stage.

Deferred: **dcore-retro**. See
`modules/<module_id>.md` and `dcore.manifest.json` for each module's status and contract.

## How to invoke a module
Each module is described in `modules/<module_id>.md`. Read the module reference, then produce its structured output by
following that reference. A deterministic scaffold generator is available to seed the structure:

```
node scripts/dcore.mjs list
node scripts/dcore.mjs dcore-spec "<the problem or request>"   # positional input
node scripts/dcore.mjs dcore-spec --input "<the problem>"      # or an explicit flag
node scripts/dcore.mjs dcore-review                            # reads code/diff from stdin
node scripts/dcore.mjs dcore-plan --input "<feature>" --json
```
Input precedence is `--input` → positional text → stdin, so the natural
`dcore.mjs dcore-spec "..."` form works as well as the explicit flag.

The generator is portable Node (no dependencies), read-only, and offline. It emits the structure; you (Claude) fill in
the specifics by following the module's reference and the surrounding context.

## Safe operating rules
- **Read-only by default.** No module modifies files, runs commands, or changes configuration unless the user
  explicitly asks and approves. Prefer analysis and clearly-listed proposed changes.
- **No credentials.** DCore never reads `~/.claude`, OAuth tokens, cookies, API keys, or any secret store.
- **No hidden network.** DCore makes no network calls for ordinary use. If a capability would require the network,
  it says so and asks first.
- **No arbitrary/privileged execution.** DCore does not spawn arbitrary subprocesses, install unrelated software,
  or escalate privileges.
- **No destructive action without explicit authorization.** Any action that deletes or overwrites user data must be
  stated plainly and confirmed first.

## Platform behavior
The skill core is platform-neutral. Platform differences (paths, filesystem) are handled with capability detection,
never hard-coded shell assumptions (`bash`/`PowerShell`/`cmd.exe`). Windows, macOS, and Linux are supported.
- **SAFE_GENERIC_OPERATION** → allowed everywhere.
- **ENVIRONMENT_SPECIFIC_OPERATION** → capability check first.
- **UNKNOWN capability** → safe degradation with a clear note.
- **UNSUPPORTED capability** → explicit diagnostic, never a silent alternative.

## Failure behavior
Unknown module → diagnostic listing the known modules (exit non-zero), never a guess. Malformed/empty input → a safe,
structured scaffold with `(none)` where nothing was derivable. Anything unsafe fails closed.

## Optional assurance layer
A separate, optional compatibility/certification architecture (M13–M24) exists for teams that want signed, evidence-
backed compatibility profiles per exact host facet. **It is not required to install or use DCore.** Certification-
required operations (if any are added later) are blocked until an exact host is independently certified; ordinary
skill use never touches that layer.

## Install
See `docs/INSTALL.md`. In short: `git clone`, then `node skills/dcore/scripts/install.mjs --project` (project-local)
or `--user` (user-level). The installer is deterministic, confined to the install directory, idempotent, offline, and
accesses no credentials.
