# DCore · dcore-qa — QA / Test Runs

- **module_id:** dcore-qa
- **status:** IMPLEMENTED
- **purpose:** text mode: test-plan scaffold. `--discover <url>`: generate executable scenarios from a live page. `--plan <file>`: execute a test plan in a real browser and produce three evidence-backed documents (Detailed Test Report, Detailed Defect Report, Test Case Register) as PDF + JSON + Markdown
- **inputs:** a feature/spec
- **outputs:** test plan: objective, test levels, scenarios, edge cases, data, exit criteria
- **permissions:** read-only (text mode); network + local browser (`--discover`, `--plan`)
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** none
- **failure_behavior:** fail-closed; malformed/empty input yields a safe scaffold with (none); unknown module -> diagnostic
- **runnable:** true

## How Claude uses this module
Run `node scripts/dcore.mjs dcore-qa "<text>"` (or pipe via stdin) to seed the structure, then complete each section by following this reference and the surrounding context. Read-only: propose changes; never modify files without explicit user approval.

## Executable test runs
1. **Discover** (optional): `dcore-qa --discover <url> [--setup login-steps.json] --plan-out plan.json` opens the live page
   (after setup, e.g. login via `valueEnv` credentials), inspects it and generates cases: page load, field validation
   from the field's own constraints (positive / negative / boundary, checked with the browser's constraint-validation
   API — forms are never submitted), keyboard, accessibility, mobile layout and load time. State-changing controls,
   iframes and unconstrained fields are listed under `not_tested` with the reason.
2. **Review / extend** the plan: add business cases (`{ id, area, type, title, expected, steps }`), declare exclusions
   with `status: NOT_TESTED | NOT_APPLICABLE | BLOCKED` or `skip: true` plus a `reason`, add `severity_on_fail`.
3. **Run**: `dcore-qa --plan plan.json --out .dcore/evidence/<run> [--env "staging"] [--no-pdf]`. Setup runs once;
   each case runs in the same session; a failing case skips only its own remaining steps; a setup failure BLOCKS all
   cases. Console errors, uncaught exceptions and failed/5xx requests are attributed to the case that triggered them.
4. **Outputs** (in `--out`): `*.testrun.json`, `*.summary.md`, and HTML + **PDF** for the Detailed Test Report, the
   Detailed Defect Report and the Test Case Register, plus per-case screenshots. Without a browser the PDFs are BLOCKED
   and every case is NOT_TESTED — nothing is reported as passed.

Results: PASS (executed, all assertions held) · FAIL (assertion failed = CONFIRMED, or action impossible = NEEDS
TRIAGE) · BLOCKED · NOT_TESTED · NOT_APPLICABLE · SKIPPED. Defects carry severity, priority, category, confidence,
reproduction steps, expected/actual, evidence and linked cases. Supported interactions and their evidence:
`references/TESTING-CAPABILITY-MATRIX.md`.

## Functional scenarios (`--scenarios <file>`)
A scenario document (`dcore.scenarios/1`) describes tests as scenarios, not command lists:
`{ name, target, environment, data, setup: [steps], scenarios: [{ id, title, feature, type, priority, preconditions,
data, expected, steps: [{ id, action, target, input, expect, timeoutMs, evidence, optional }] }], not_tested }`.
- **type:** Functional, Negative, Validation, Boundary, Regression, Smoke, Integration, Authentication, Authorization,
  Responsive, Accessibility, Error handling. **priority:** P1-P4 (sets defect severity on failure).
- **actions:** browser (goto, click, hover, fill, type, clear, select, check, uncheck, press, upload, download, wait,
  waitFor, assert, screenshot, viewport, back, forward, reload, switchTab, closeTab, inspect, evaluate, dialog,
  intercept, session) via dcore-browse; `api` via dcore-api; `run` via dcore-run; `verify` via dcore-verify.
- **expect:** text, notification, noText, url, title, modal, state, visible, hidden, checked, value, count (browser);
  noErrors, noNewErrors (no uncaught error beyond those already seen in the scenario), noWrites / writes {max,min,equals}
  (POST/PUT/PATCH/DELETE requests sent during the step), faulted (the simulated fault was really triggered; otherwise
  the step is BLOCKED); status, json, bodyContains, schema, maxMs (api); exitCode, outputContains, testsFailed (run). `expect.target` checks
  another element than the one acted on.
- **templates:** `{{data.x}}`, `{{run.id}}`, `{{run.short}}`, `{{scenario.id}}`; unknown keys BLOCK the step.
  Credentials only via `input: {"valueEnv": "VAR"}`.

Execution: setup once (failure => every scenario BLOCKED), then each scenario in the same browser session; a failed or
blocked step skips the rest of its scenario. Every executed step yields evidence: run ID, scenario ID, step ID,
action, target, input, expected, actual, status, verified, timestamp, URL, screenshot (on failure or on request),
console errors, network failures and the individual checks. **A scenario is PASS only if at least one expected outcome
was verified and nothing failed or was blocked; steps without declared expectations never produce PASS** (the
scenario is NOT_TESTED). **State-changing controls** (create, save, delete, revoke, submit to a POST form, ...) are
BLOCKED unless the run carries `--approve ui-write`; login forms are exempt. Outputs: `<run>.scenario-run.json` plus
the three PDF documents.

## Negative & boundary testing (M42)
Candidate generation (`dcore-explore --app`) decides, for every field, form and page it discovered, which of 23
negative / boundary cases apply — valid input, invalid input, empty input, missing required fields, minimum, maximum,
just below minimum, just above maximum, duplicate input, malformed input, unexpected characters, long input,
unauthorized user, unauthenticated user, expired session, refresh during workflow, back navigation, double submission,
server error, network failure, timeout, empty API response, malformed API response — and records each decision in
`negative_matrix` (and `negative-matrix.md`): **APPLICABLE** (a scenario was generated), **APPROVAL_REQUIRED**
(generated, gated: duplicate and double submission write data), **NOT_APPLICABLE** (with the reason: e.g. no declared
max, a GET form, a select, a page without API calls) or **NOT_TESTED** (applies, but cannot be tested automatically:
e.g. a lower-privileged account is needed). Nothing is executed blindly: limits that are not declared are never invented.
- Field cases use the browser's own validation as the oracle (`checkValidity()`, or the browser refusing to hold the
  value); server-side validation needs a submission and therefore approval.
- Fault cases are **simulated inside the test browser** (`intercept`): the faulted API request is answered locally with
  a 500, an empty or malformed body, a network failure or a timeout, and never reaches the server. A clean load comes
  first, so only **new** uncaught errors count; if no request matched the fault, the step is BLOCKED (nothing concluded).
- Expired session removes the test browser's cookies (`session: "expire"`), reloads, and expects the login page; the
  session is restored after the scenario. The server-side session is untouched.
- Every negative scenario reports `negative_outcome`: **HELD** (PASS), **VIOLATED** or **NOT_DETERMINED** (blocked, or a
  precondition failed). Only a failed expectation on the step that checks the negative behaviour counts as a violation.
- **Defect candidates**: each violation produces one (`defect_candidates` in the run, `defect-candidates.json`) with
  scenario, step, expected (e.g. "Rate limit: 1001 (just above the maximum 1000) is rejected."), actual ("... was
  accepted. Observed: ..."), evidence (URL, screenshots, failing checks, console / network), `defect_type_candidate`,
  `severity_candidate` and `priority_candidate`. Severity and priority are **UNASSESSED** unless the evidence itself
  establishes the impact (an access-control failure: high / P1, with the rule stated); in the PDF reports these defects
  show severity "unassessed" and the verdict asks for triage.
- `--only <list>` runs a subset: scenario ids, categories, negative case ids (`server-error,below-min`) or `negative`.

## Example
```
node scripts/dcore.mjs dcore-qa "Verify login at https://staging.example.test/login. Verify the tokens list filters by status."
DCORE_USER=... DCORE_PASS=... node scripts/dcore.mjs dcore-qa --discover https://staging.example.test/admin --setup login.json --plan-out plan.json
DCORE_USER=... DCORE_PASS=... node scripts/dcore.mjs dcore-qa --plan plan.json --out .dcore/evidence/run1 --env staging
DCORE_USER=... DCORE_PASS=... node scripts/dcore.mjs dcore-qa --scenarios scenarios.json --out .dcore/evidence/run2 [--approve ui-write]
DCORE_USER=... DCORE_PASS=... node scripts/dcore.mjs dcore-qa --scenarios .dcore/evidence/map/candidate-scenarios.json --only negative --out .dcore/evidence/neg
```

## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
