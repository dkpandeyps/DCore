# DCore · dcore-explore — Repository Exploration

- **module_id:** dcore-explore
- **status:** IMPLEMENTED
- **kind:** analysis (read-only)
- **purpose:** map a repository from the files actually present: project type, languages, frameworks, test frameworks, build/test/lint/typecheck commands, entry points, test dirs, CI, integrations, config files
- **inputs:** `--repo <path>`
- **outputs:** project_types, languages, manifests, lockfiles, frameworks, test_frameworks, integrations, commands[{kind,command,source,cwd}], entry_points, test_dirs, ci, config_files, sensitive_files_present (names only), files_scanned, notes
- **permissions:** read-only (node:fs reads inside --repo only)
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** none
- **failure_behavior:** missing/invalid --repo => error, nothing scanned; secret files (.env, keys, credential stores) are listed by name and never read; dependency/VCS/agent dirs skipped
- **runnable:** true

## How Claude uses this module
Run it first on any repository task. Use `commands` to pick what to execute with dcore-run (prefer the
repository's own scripts over guessed commands), `test_frameworks`/`test_dirs` to follow test conventions
(dcore-test), and `integrations`/`config_files` to understand runtime boundaries. Everything reported is a literal
observation from files; nothing is inferred from language semantics.

## Application discovery (`--app <url>`)
`dcore-explore --app <url> [--setup login.json] [--max-pages 20] [--max-depth 3] --out <dir>` crawls a running web
application **passively** — GET navigation and DOM observation only; nothing is clicked, typed or submitted — and writes:
- `appmap.json` (`dcore.appmap/1`): routes, navigation edges, forms (fields, constraints, method, submit buttons,
  state-changing?), inputs, buttons (state-changing?), tables, dialogs (open or present-but-hidden), tabs, dropdowns,
  search/filter controls, UI states (alerts, empty states, loading), the API (XHR/fetch) calls each page makes, console
  errors, network failures, responsive behaviour (meta viewport + overflow at 390px), the **auth boundary** (each route
  requested once without cookies: protected / public, login page learned from the redirect), API endpoints, links not
  visited (state-changing, downloads) and other origins. The map is deterministic: sorted, ids in paths normalised
  (`/orders/123` -> `/orders/:id`), and identified by `map_hash` (timestamps excluded).
- `app-map.md`: a readable summary.
- `negative-matrix.md`: the negative / boundary applicability decision for every field, form and page (see dcore-qa,
  "Negative & boundary testing"). `--max-fields N` caps field-level cases per page (default 12; the rest are recorded
  as NOT_TESTED, never dropped silently).
- `candidate-scenarios.json` (`dcore.scenarios/1`): **candidate** scenarios generated from the map — happy path,
  required-field validation, invalid input, boundary values, empty state, search/filter, permission, authentication,
  error handling, responsive, navigation, persistence and state-changing actions, plus the applicable negative /
  boundary cases (valid input, robustness, session, fault injection, data integrity).

Lifecycle vocabulary: every control in the map is **DISCOVERED** (observed, not tested). Every generated scenario is a
**CANDIDATE** (nothing executed). Candidates that change data or affect a shared environment are **APPROVAL_REQUIRED**
(`requires_approval: ["ui-write"]` / `["account"]`): `dcore-qa --scenarios` refuses to run them without
`--approve`. Where the right outcome cannot be derived from observation (a success message, a search term), the
candidate uses a review placeholder (`{{data.success_message}}`) which BLOCKS the step until a person supplies it.
After a run, `dcore-explore --coverage appmap.json --candidates candidate-scenarios.json --run <run>.scenario-run.json`
reports each candidate as **TESTED** (PASSED / FAILED), **BLOCKED** or **NOT_TESTED**, and each control as TESTED (an
executed step exercised it) or still DISCOVERED.

## Example
```
node scripts/dcore.mjs dcore-explore --repo . --json
DCORE_USER=... DCORE_PASS=... node scripts/dcore.mjs dcore-explore --app https://staging.example.test/admin --setup login.json --max-pages 20 --out .dcore/evidence/map
DCORE_USER=... DCORE_PASS=... node scripts/dcore.mjs dcore-qa --scenarios .dcore/evidence/map/candidate-scenarios.json --out .dcore/evidence/run3
node scripts/dcore.mjs dcore-explore --coverage .dcore/evidence/map/appmap.json --candidates .dcore/evidence/map/candidate-scenarios.json --run .dcore/evidence/run3/<run>.scenario-run.json
```

## Tests
See bench/test/dcore-skill.test.ts and bench/test/dcore-exec.test.ts.
