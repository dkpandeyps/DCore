# dkskill

A reusable, fail-closed **Claude Code skill set** for practical software and product engineering work — framing
problems, writing specifications, planning implementation, reviewing code, and QA/test planning — on **Windows,
macOS, and Linux**.

The owner (PTPL) uses dkskill for real work and commits improvements to Git so others can clone and reuse the same
skills.

**Clone → install → discover → invoke → work.** No certification, no credentials, no `~/.claude` access, no network,
and no private infrastructure are required for ordinary use.

## What dkskill provides
A small set of deterministic, read-only modules that turn a raw request into structured, reviewable artifacts:
- **dk-frame** — frame a vague request (objective, stakeholders, risks, open questions).
- **dk-spec** — specification (objective, users, requirements, constraints, assumptions, acceptance, open questions).
- **dk-plan** — implementation plan (architecture, components, dependencies, risks, tests, rollout).
- **dk-review** — structured code/diff review (correctness, security, maintainability, findings with severity).
- **dk-qa** — test plan (levels, scenarios, edge cases, data, exit criteria).

## Supported platforms
Windows, macOS, and Linux. The skill core is platform-neutral (capability detection, never hard-coded
`bash`/`PowerShell`/`cmd.exe` assumptions).

## Prerequisites
- **Node.js ≥ 18** to install and run the skill's portable scripts (zero dependencies).
- Git, to clone the repository.
- Running the project's full test suite additionally requires **Node.js ≥ 24** (TypeScript type-stripping).

## Installation
```
git clone <repository>
cd dkskill
node skills/dkskill/scripts/install.mjs --project      # installs into ./.claude/skills/dkskill
```
See `docs/INSTALL.md` for user-level install, dry-run, explicit targets, uninstall, and troubleshooting.

## Basic usage
After installing, Claude Code discovers `dkskill`. You can also drive the deterministic scaffold generator directly:
```
node skills/dkskill/scripts/dkskill.mjs list
node skills/dkskill/scripts/dkskill.mjs dk-spec --input "Build a cross-platform installer that is idempotent."
node skills/dkskill/scripts/dkskill.mjs dk-review        # pipe code/diff via stdin
node skills/dkskill/scripts/dkskill.mjs dk-plan --input "<feature>" --json
```

## Modules
- **Implemented:** `dk-frame`, `dk-spec`, `dk-plan`, `dk-review`, `dk-qa`.
- **Planned (not yet runnable):** `dk-debug`, `dk-sec`, `dk-doc`, `dk-release`.
- **Deferred:** `dk-retro`.

See `skills/dkskill/modules/` and `skills/dkskill/references/GSTACK-COVERAGE-MATRIX.md`.

## Testing
```
cd bench
node --test "test/**/*.test.ts"
```
The dkskill skill tests live in `bench/test/dkskill-skill.test.ts`.

## Security / basic-use boundaries
Read-only by default; no arbitrary command execution; no credential harvesting; never reads `~/.claude`, OAuth tokens,
cookies, or API keys; no hidden network; no persistence outside the install directory; no destructive action without
explicit user authorization. Unknown or unsafe input **fails closed**.

## Honest status
- **Real Claude Code smoke test:** currently **not demonstrated** in this repository's controlled environment — a real
  Claude Code invocation requires authentication and credentials, which this environment intentionally does not
  provide. Structural discovery (clone → install → project-local skill structure) is demonstrated; the live-runtime
  step is a separate, optional evidence step and does not block cloning or using the skill.
- This project does **not** claim certified Claude Code compatibility, production certification, universal
  certification, or any security attestation.

## Optional assurance layer
An optional compatibility/certification architecture (under `bench/compatibility/`) can later provide signed,
evidence-backed compatibility profiles per exact host facet. **It is not required to install or use dkskill.** No host
is certified yet (certified count = 0).

## Contributing
Use dkskill for real work, then commit focused improvements (a module, a fix, a test) with clear messages. Keep every
module read-only by default and fail-closed; never add credential access, hidden network calls, or arbitrary
execution. Run the test suite before proposing changes.

## License
Apache-2.0 — see `LICENSE`.
