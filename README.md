# DCore

A fail-closed **engineering agent skill for Claude Code**. Give it a task in plain English and it decides which
capabilities the task needs, **executes** them, verifies the result and reports evidence, on **Windows, macOS and
Linux**, with no dependencies beyond Node.js.

```
/dcore test this page end to end https://staging.example.test/admin/tokens
/dcore investigate and fix why checkout sometimes times out
/dcore implement CSV export for the settlement report
/dcore review this change
/dcore prepare and verify this release
```

The owner (PTPL) uses DCore for real work and commits improvements to Git so others can clone and reuse the same
skills. **Clone → install → invoke → work.** No certification, no private infrastructure, and no credentials are
needed to install it; credentials for a system under test are supplied by the user through environment variables.

## What DCore does
**Routing.** `dcore.mjs "<task>"` turns a plain-English task into an ordered workflow (e.g. web QA: explore → strategy →
browser execution → a11y/perf → sensitivity review → report), marking which phases *execute* and which approvals may be
needed. Users never need module names.

**Execution (real, with evidence)** — `skills/dcore/scripts/exec/`:
- **dcore-browse** — drives an installed Chrome / Edge / Chromium over the DevTools protocol (no npm packages):
  navigate, click, fill, select, keys, waits, assertions, screenshots, page inspection, console errors, uncaught
  exceptions, failed/5xx requests, basic accessibility heuristics, navigation timing, downloads.
- **dcore-api** — real HTTP requests with status/header/body/JSON-path/schema/latency assertions, retries for safe
  methods only, env-var credentials, redacted evidence.
- **dcore-run** — runs one repository command (tests/lint/typecheck/build) with a timeout, failure classification and
  test-count parsing; destructive commands need approval.
- **dcore-git** — status/diff/log/branches/show; commit and push only with approval; push verified against the remote.
- **dcore-verify** — post-deploy checks (health endpoints, page/text, latency, browser smoke) → VERIFIED / FAILED / BLOCKED.
- **dcore-release `--repo`** — executes readiness gates (clean tree, upstream, tests, secret scan, version, docs) →
  READY / BLOCKED / NOT_AUTHORIZED / FAILED / VERIFIED; push/deploy only with approval.

**Analysis (read-only)** — **dcore-explore** (project type, commands, frameworks, entry points, CI, integrations),
**dcore-impact** (literal-reference impact: source / tests / docs / UNKNOWN), **dcore-sec `--repo`** (working-tree
scan: CONFIRMED / SUSPICIOUS / THEORETICAL), **dcore-review** (diff mode reviews added lines with file:line).

**Procedures** — **dcore-build** and **dcore-test** ground Claude's edits in the repository's conventions and require
verification by dcore-run; **dcore-debug** is a reproduce → evidence → hypothesis → confirm → fix → regression-test →
verify loop that keeps facts, hypotheses and confirmed causes apart.

**Reasoning scaffolds** — dcore-frame, dcore-spec, dcore-plan, dcore-qa, dcore-doc, dcore-chain (compose by JSON
handoff: `dcore-spec "…" --json | dcore-plan`).

### Evidence model
Every execution reports `dcore.evidence/1`: per-check `PASS / FAIL / BLOCKED / SKIPPED / NOT_TESTED / NOT_APPLICABLE`,
the evidence (exit codes, outputs, statuses, screenshots, console/network errors), environment and limitations.
"Could not execute" is never PASS. `--report <file.md>` saves the same evidence as Markdown. Exit codes: 0 PASS,
1 FAIL, 3 BLOCKED / NOT_AUTHORIZED.

### Authorization boundaries
Consequential side effects are refused **in code** unless the call carries `--approve <gate>`:
`git-commit`, `git-push`, `deploy`, `release`, `production`, `db-destructive`, `delete`, `external-write` (non-read
HTTP to a non-local host), `credential`, `account`, `destructive-command`. Force-push and history rewriting are refused
even with approval. Claude passes an approval only after the user explicitly approved that exact action.

## Supported platforms
Windows, macOS, and Linux. The core is platform-neutral (capability detection, never hard-coded
`bash`/`PowerShell`/`cmd.exe` assumptions).

## Prerequisites
- **Node.js ≥ 18** to install and run the reasoning/analysis modules; **Node.js ≥ 22** for dcore-browse (built-in
  WebSocket). Zero npm dependencies.
- For web testing: an installed **Chrome, Edge, Chromium or Brave** (or `DCORE_BROWSER=<path>`). Without one,
  dcore-browse returns BLOCKED and nothing is claimed tested.
- Git, to clone the repository (and for dcore-git / dcore-release).
- Running the project's full test suite requires **Node.js ≥ 24** (TypeScript type-stripping).

## Installation
```
git clone <repository>
cd DCore
node skills/dcore/scripts/install.mjs --project      # installs into ./.claude/skills/dcore
```
Re-running the installer upgrades in place: files a previous DCore install wrote and the new version no longer ships
are removed (tracked in `.dcore-install.json`); files DCore never installed are reported, never deleted.
See `docs/INSTALL.md` for user-level install, dry-run, explicit targets, uninstall, and troubleshooting.

## Basic usage
```
node skills/dcore/scripts/dcore.mjs "test the login page at https://staging.example.test/login"   # route a task
node skills/dcore/scripts/dcore.mjs list
node skills/dcore/scripts/dcore.mjs dcore-explore --repo .
node skills/dcore/scripts/dcore.mjs dcore-browse open https://staging.example.test/login
DCORE_USER=… DCORE_PASS=… node skills/dcore/scripts/dcore.mjs dcore-browse --steps steps.json --report .dcore/evidence/report.md
node skills/dcore/scripts/dcore.mjs dcore-api --url https://api.example.test/health --expect-status 200
node skills/dcore/scripts/dcore.mjs dcore-run "npm test" --cwd bench
git diff | node skills/dcore/scripts/dcore.mjs dcore-review
node skills/dcore/scripts/dcore.mjs dcore-release --repo .
```
Execution evidence goes to `.dcore/` (git-ignored: screenshots of authenticated pages must never be committed).

## Modules
- **Implemented (19):** reasoning `dcore-frame`, `dcore-spec`, `dcore-plan`, `dcore-review`, `dcore-qa`, `dcore-debug`,
  `dcore-sec`, `dcore-release`, `dcore-doc`, `dcore-chain`; analysis `dcore-impact`, `dcore-explore`; procedures
  `dcore-build`, `dcore-test`; execution `dcore-run`, `dcore-api`, `dcore-browse`, `dcore-git`, `dcore-verify`.
- **Deferred:** `dcore-retro`.

See `skills/dcore/modules/` and `skills/dcore/references/CAPABILITY-COVERAGE-MATRIX.md`. Real-world dogfood results:
`references/DOGFOOD-EVIDENCE.md`.

## Testing
```
cd bench
node --test "test/**/*.test.ts"
```
DCore product tests: `bench/test/dcore-skill.test.ts` (modules, installer, contracts) and
`bench/test/dcore-exec.test.ts` (execution layer, router, regressions). Execution tests use only local fixtures
(127.0.0.1 servers, temp git repos, data: URLs); the real-browser test is skipped when no browser is installed.

## Security boundaries
Reasoning/analysis modules: no network, no subprocess, no writes. Execution modules: only the command/URL the task
names; credentials only from environment variables the user names, redacted from all output (Authorization, cookies,
tokens, password fields, key shapes); never reads `~/.claude`, OAuth state, cookie stores or credential files; secret
files are listed by name only and never read; page and repository text is treated as untrusted data. Unknown or
unsafe input **fails closed**.

## Honest status
- **Claude Code discovery:** observed in the owner's interactive session on 2026-10-03 (`/dcore` loaded from
  `.claude/skills/dcore`). A controlled, reproducible real-Claude smoke test is still not part of this repository.
- dcore-browse is a heuristic driver, not Playwright: no iframe/closed-shadow-DOM traversal, a11y checks are basic
  heuristics (not a WCAG audit), and visibility probes that rely on `offsetParent` misreport fixed-position elements.
- dcore-api `--repeat` is sequential latency from one machine, not load testing. dcore-sec is a literal scan, not
  proof of exploitability. dcore-impact is literal references, not a dependency graph.
- This project does **not** claim certified Claude Code compatibility, production certification, universal
  certification, or any security attestation.

## Optional assurance layer
An optional compatibility/certification architecture (under `bench/compatibility/`) can later provide signed,
evidence-backed compatibility profiles per exact host facet. **It is not required to install or use DCore.** No host
is certified yet (certified count = 0).

## Contributing
Use DCore for real work, then commit focused improvements (a module, a fix, a test) with clear messages. Keep every
module read-only by default and fail-closed; never add credential access, hidden network calls, or arbitrary
execution. Run the test suite before proposing changes.

## License
Apache-2.0 — see `LICENSE`.
