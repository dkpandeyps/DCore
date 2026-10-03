# DCore Testing Capability Matrix

What DCore's web testing (`dcore-qa --discover / --plan`, executed by `dcore-browse`) can do **today**, and the
evidence behind each claim. DCore does **not** claim it can test every web application or every interaction. Anything
outside this matrix is reported as `BLOCKED`, `NOT_TESTED`, `NOT_APPLICABLE` or `SKIPPED` — never `PASS`.

**Validation status**
- **VALIDATED** — executed against a real application (authorized staging) with recorded evidence.
- **IMPLEMENTED** — executed for real (real browser) against local fixture sites in the automated tests; not yet observed on a real app.
- **LIMITED** — works with the caveat listed.
- **NOT_SUPPORTED** — not implemented; plans touching it must declare it `NOT_TESTED` / `BLOCKED`.
- **BLOCKED (by design)** — intentionally not automated (needs a human or would bypass a control).

Real-world evidence: authorized staging admin "API tokens" page (server-rendered + JavaScript UI, session login with
CSRF and reCAPTCHA), 2026-10-03. Tests: `bench/test/dcore-browse-m39.test.ts` (M39-n), `dcore-qa-run.test.ts` (QA-n),
`dcore-exec.test.ts` (EX-n). Fixture sites run on two 127.0.0.1 origins so cross-origin frames are genuinely cross-origin.

## Element states (M39)
Every element-targeting step resolves its target to one explicit state and acts only in the state it needs:
`NOT_FOUND` · `AMBIGUOUS` · `FOUND` (present, not visible) · `DISABLED` · `NOT_INTERACTABLE` · `VISIBLE_BUT_OBSTRUCTED`
· `INTERACTABLE`, then `TIMEOUT` (waited, never reached the needed state; last state reported) or `BLOCKED` (cannot be
attempted: unknown frame, refused upload, …). `NOT_FOUND`, `TIMEOUT`, `AMBIGUOUS` and `BLOCKED` are never PASS; an
`optional` step that cannot be performed is `SKIPPED`. A test case containing a BLOCKED step is BLOCKED.

## Browser engine
| Capability | Implementation | Test | Validation status | Known limitation |
|---|---|---|---|---|
| DOM discovery (`inspect`) | deep query over document + open shadow roots; frames, tabs, open modals, shadow-root count, field constraints | M39-9, QA-2 | VALIDATED (staging: 85 controls, 0 frames, 0 shadow roots) | inspects one frame per call (`inspect {frame}`) |
| Element identification | selector / text (accessible name, exact first) / label / placeholder / testid / role / index / first; native controls ranked above generic containers | M39-2, M39-6 | VALIDATED | accessible-name computation is a practical subset of the ARIA spec |
| Ambiguity detection | >1 equally ranked visible match ⇒ `AMBIGUOUS` with the candidates; `index`/`first` to choose | M39-2, M39-9 | VALIDATED (staging: 3 identical "Paysecure parent token" rows ⇒ AMBIGUOUS) | across frames the main document wins; other frames ⇒ AMBIGUOUS |
| Dynamic-element waiting | polling resolver until the needed state or timeout; late-inserted / late-enabled elements; `waitFor {state: visible/hidden/enabled/disabled/interactable/detached/attached}`; `waitFor {stable}` (MutationObserver quiet window) | M39-3 | IMPLEMENTED | — |
| Visibility | `checkVisibility` (display, visibility, opacity incl. ancestors, content-visibility) + non-zero box; works for `position: fixed` | M39-1, M39-4 | VALIDATED | an element clipped by `overflow` but still in the box is treated as visible |
| Interactability | disabled (`:disabled`, fieldset), `aria-disabled`, `inert`, `pointer-events: none`, outside viewport, moving (animation — waited out) | M39-1, M39-17 | VALIDATED (staging: animation after owner switch waited out) | — |
| Obstruction | page-level hit test at the click point (`DOM.getNodeForLocation`, document coordinates incl. scroll; across frames and shadow roots); reports the covering element | M39-1, M39-2, M39-16 | VALIDATED (staging: "New token" obstructed by `div#catalogModal`) | centre point only: a partially covered element whose centre is free counts as clear |
| Enabled / disabled detection | as above; `assertState {state: ENABLED/DISABLED}` | M39-1 | IMPLEMENTED | — |
| Click | real mouse events at the element centre after it is INTERACTABLE; `button: right`, `double`; `force: true` = explicit JS click, reported as forced | M39-2 | VALIDATED | no drag-and-drop |
| Text input | `fill` (replace) / `type` (per-key events, for key-driven widgets) / `clear`; value re-read and verified; maxlength truncation and browser sanitisation explained, anything else FAIL | M39-5, M39-7 | VALIDATED (staging: search, rate limit 5000/60 verified) | IME / composition input not simulated |
| Date / time / range / colour inputs | native value setter + input/change events, verified | M39-5 | IMPLEMENTED | custom JS date pickers need click steps |
| Select / dropdown | native `<select>` by value / label / index, verified, disabled options refused; custom comboboxes: open, click option, verify on the trigger | M39-6 | IMPLEMENTED | multi-select not supported; virtualised option lists need explicit steps |
| Checkbox / radio | `check` / `uncheck`: idempotent, verified, falls back to the visible label for visually hidden inputs; radios cannot be unchecked | M39-6 | VALIDATED (staging: owner radios) | — |
| Keyboard | named keys + chords (`Control+A`, `Shift+Tab`, …) with editing commands; `press {selector, key}` focuses first | M39-7 | VALIDATED (Tab, Escape on staging) | OS-level shortcuts (browser chrome) not available |
| Enter / Escape / Tab | as above | M39-4, M39-7 | VALIDATED | — |
| URL navigation | `goto` with navigation TIMEOUT reporting; http/https/data/about only | all | VALIDATED | — |
| Redirect handling | document redirect chain recorded (status, from → to) on every `goto` | M39-8 | VALIDATED (staging: https → **http** login → https downgrade hop observed) | non-document (XHR) redirects not listed |
| Back / forward | `back` / `forward`; FAIL if the URL does not change | M39-8 | IMPLEMENTED | bfcache state is not inspected |
| SPA / dynamic navigation | in-document navigations recorded; `waitFor {url}`, `waitFor {stable}`; history across pushState | M39-8 | IMPLEMENTED | no route-name awareness (URL based) |
| Modal / dialog handling | `assertModal {open, title}` (dialog, role=dialog/alertdialog, aria-modal; fixed-position safe); backdrop obstruction detected; JS alert/confirm/prompt auto-handled (confirm dismissed unless `{"dialog":"accept"}`) | M39-4 | VALIDATED (staging catalog modal) | — |
| Responsive viewports | device emulation verified (`screen.width`); missing `<meta name=viewport>` reported as a responsive finding | M39-14, M39-16 | VALIDATED | touch events not emulated |
| Screenshots | viewport, full page, element clip; per case and on failure | M39-14, QA-4 | VALIDATED | PNG only; no visual diff |
| JavaScript exceptions | captured with source URL:line; attributed to the case | M39-13, QA-4 | VALIDATED (staging: 4 exceptions with locations) | top frame only, no full stack |
| Console errors | `console.error/assert` + error log entries | M39-13 | VALIDATED | warnings not captured |
| Network failures | failed requests (net::ERR_*), 5xx; 4xx informational | M39-13, QA-4 | VALIDATED (4xx) · IMPLEMENTED (5xx/failed) | no bodies or timing |
| File upload | `upload {files}` via `DOM.setFileInputFiles`; files must lie inside allowed directories (`uploadRoots`, default cwd); credential-like names refused (BLOCKED); verified on `input.files` | M39-12 | IMPLEMENTED | drag-and-drop upload zones not supported |
| File download verification | `download {expect: name, minBytes, maxBytes, contains, sha256}`; file saved under the evidence dir, hashed | M39-12 | IMPLEMENTED | content checks are text-based (no XLSX/PDF parsing) |
| Multiple tabs / windows | popups and `target=_blank` tracked; `switchTab {latest/url/title/index}`, `closeTab` | M39-11 | IMPLEMENTED | — |
| iframe discovery / interaction | every frame's execution context; auto-search or `frame: name / url / {selector}`; clicks via page-level coordinates | M39-9 | IMPLEMENTED | cross-origin frames work because site isolation is disabled in the throwaway profile |
| Nested iframes | recursive frame tree | M39-9 | IMPLEMENTED | — |
| Shadow DOM | open shadow roots searched by every locator, text and inspection | M39-10 | IMPLEMENTED | **closed** shadow roots are unreachable ⇒ NOT_FOUND (by web-platform design) |
| Session / authentication | form login with `valueEnv` credentials, session reuse (`--profile`) | QA-4, staging | VALIDATED | HTTP Basic auth, SSO popups: NOT_SUPPORTED · CAPTCHA / MFA: BLOCKED (by design) · session expiry not auto-detected |

## Negative & boundary testing (M42)
| Capability | Implementation | Test | Validation status | Known limitation |
|---|---|---|---|---|
| Applicability per field / form / page for 23 cases (APPLICABLE / APPROVAL_REQUIRED / NOT_APPLICABLE / NOT_TESTED, with reasons) | `negative.mjs` planNegative from the app map | M42-1 | VALIDATED (staging) | decisions use declared constraints only: undeclared business limits are NOT_APPLICABLE |
| Valid / invalid / malformed / empty / missing required / min / max / just below / just above | browser validation oracle (`checkValidity()` or value refused) | M42-1, M42-3 | VALIDATED | client-side only; server-side validation needs a submission (approval) |
| Unexpected characters, long input | literal round-trip or rejection + no new uncaught error while typing | M42-3 (fragile handler VIOLATED, robust field HELD) | VALIDATED | does not prove safe server-side storage / output encoding |
| Unauthenticated, expired session | anonymous request; cookies removed in the test browser then restored | M42-3 | VALIDATED | server-side session expiry itself is not exercised |
| Unauthorized user | NOT_TESTED with reason | M42-1 | DECLARED | needs a second, lower-privileged account |
| Refresh during workflow, back navigation | reload / history.back with no-write + no-new-error + page-restored checks | M42-3 | VALIDATED | whether entered values should survive a refresh is a product decision |
| Duplicate input, double submission | APPROVAL_REQUIRED; write requests counted per step | M42-3 (blocked, nothing sent), M42-4 (approved: 2 writes -> VIOLATED) | VALIDATED (fixture) | duplicate needs `{{data.duplicate_error_text}}` |
| Server error, network failure, timeout, empty / malformed API response | CDP Fetch interception in the test browser only; fault must be triggered or the step is BLOCKED | M42-3 (fragile page VIOLATED, robust page HELD) | VALIDATED | only GET calls observed on page load are faulted |
| Defect candidates (scenario, step, expected, actual, evidence, type / severity / priority candidates) | `defectCandidate`; only a failed oracle expectation counts | M42-2, M42-3, M42-5 | VALIDATED | severity UNASSESSED except stated security rule |

## Application discovery & candidate scenarios (M41)
| Capability | Implementation | Test | Validation status | Known limitation |
|---|---|---|---|---|
| Passive crawl (GET + DOM observation only) | dcore-browse controller; same-origin BFS with max pages / depth | M41-2 (server log: no writes, no risky route requested) | VALIDATED (staging: 8 routes) | controls that appear only after interaction are seen only if already in the DOM |
| Routes, navigation, forms, inputs, buttons, links, tables, dialogs, tabs, dropdowns, search/filter | in-page observation | M41-2 | VALIDATED | filter detection is heuristic (dropdowns outside POST forms, search-like names) |
| State-changing controls / links | name + form-method heuristics; risky links recorded, not visited | M41-2 | VALIDATED (staging: "Create token", /logoutcsrf) | a mutating control with a neutral name is not flagged |
| Auth boundary | each route requested once without cookies (full body); login page learned from the redirect | M41-2 (login page > 2 KB) | VALIDATED (staging: 8/8 protected) | role-based permissions need a second account |
| API-backed interactions | XHR/fetch calls during page load (method, normalised path, status) | M41-2 | VALIDATED (staging: tokens list/apis/whitelabels) | calls triggered only by interaction are not observed |
| Console errors, network failures, responsive (meta viewport + overflow) | per page | M41-2 | VALIDATED | - |
| Deterministic map | sorted, ids normalised, `map_hash` without timestamps | M41-2 (two crawls, same hash) | IMPLEMENTED | data-dependent pages change the hash when their content changes |
| Candidate scenarios (13 categories) | pure generator from the map | M41-3 | VALIDATED (staging) | success outcomes need review placeholders |
| APPROVAL_REQUIRED enforcement | `requires_approval` gates checked before any step runs | M41-4 (no POST sent) | VALIDATED (staging: never executed without approval) | - |
| Lifecycle DISCOVERED / CANDIDATE / TESTED (PASSED/FAILED) / BLOCKED / NOT_TESTED | `coverage()` from map + candidates + run | M41-4 | IMPLEMENTED | control "TESTED" is matched by selector/name in executed steps |

## Scenario engine (M40)
| Capability | Implementation | Test | Validation status | Known limitation |
|---|---|---|---|---|
| Scenario model (ID, title, feature, type, priority, preconditions, data, steps, expected, actual, status, evidence, defects) | `dcore.scenarios/1` -> `dcore.scenario-run/1` | M40-1, M40-4 | VALIDATED (staging: 6 scenarios) | - |
| 12 test types + P1-P4 priority | validated on load; priority drives defect severity | M40-1 | VALIDATED (Smoke, Validation, Authentication, Regression, Functional, Accessibility on staging) | type classifies; it does not change execution |
| Step model (action, target, input, expect/assert, timeout, evidence, optional) | compiled onto module calls; `expect.target` checks another element | M40-3 | VALIDATED | - |
| Browser steps | dcore-browse controller (one shared session, no second driver) | M40-4 | VALIDATED | - |
| API steps | dcore-api (approval gates kept; credentials via authEnv) | M40-4, STG-03 | VALIDATED (unauthenticated request -> login page) | API steps do not reuse the browser's cookies |
| Command steps | dcore-run (exit code, output, test counts) | M40-4, M40-7 | IMPLEMENTED | - |
| Verification steps | dcore-verify | STG-03 | VALIDATED | - |
| Test data + templates | `{{data.*}}`, `{{run.id}}`, `{{run.short}}`, `{{scenario.id}}`; nested data templates resolved; unknown keys BLOCK | M40-2, M40-4 | VALIDATED (unique token name per run) | no data files / data-driven iteration yet |
| Per-step evidence | run/scenario/step IDs, action, target, input, expected, actual, status, verified, timestamp, URL, screenshot, console errors, network failures, checks | M40-4, M40-6 | VALIDATED | screenshots on failure or on request (`evidence: "screenshot"`) |
| Never-inferred PASS | steps verified only by declared expectations; scenario PASS needs >=1 verified outcome and no FAIL/BLOCKED, otherwise NOT_TESTED | M40-5 | VALIDATED | - |
| Setup / declared / skipped states | setup failure => all BLOCKED; declared NOT_TESTED / NOT_APPLICABLE / SKIPPED / BLOCKED; failed step => rest SKIPPED | M40-5, M40-6 | VALIDATED (staging setup failure => 5 BLOCKED, no verdict) | - |
| State-changing UI guard (`ui-write`) | clicks on create/save/delete/revoke/... and POST-form submits refused without approval; login forms exempt | M40-5, STG-05 | VALIDATED (staging: "Create token" refused without approval; with owner-approved ui-write a real token was created, verified and revoked) | name + POST-form detection: a mutating control with a neutral name and a JS (non-form) handler is not detected |
| Defects + three PDFs from scenario runs | reuses the report layer | M40-4 | VALIDATED | - |

## Test design, results & reporting
| Capability | Status | Evidence / notes |
|---|---|---|
| Scenario generation from a live page (`--discover`) | VALIDATED | staging: 11 cases from real constraints; hidden-modal fields excluded |
| Field validation (required / email / url / number / min/maxlength / pattern) | VALIDATED (number, maxlength) · IMPLEMENTED (others) | constraint-validation API; forms are never submitted |
| Server-side validation | NOT_TESTED unless a case submits data | submissions are never generated automatically |
| Per-case results PASS / FAIL / BLOCKED / NOT_TESTED / NOT_APPLICABLE / SKIPPED | VALIDATED | setup failure ⇒ BLOCKED; a BLOCKED step ⇒ BLOCKED case |
| Defect detection & classification | VALIDATED | functional, frontend-runtime (with source location), console, backend, network, accessibility, performance |
| Three PDFs (Test Report, Defect Report, Test Case Register) | VALIDATED | streamed rendering; missing source ⇒ BLOCKED |
| Accessibility heuristics | VALIDATED | heuristic, not a WCAG audit |
| Visual regression, cross-browser (Firefox/WebKit), WebSocket/SSE assertions, request/response body assertions, database checks | NOT_SUPPORTED | planned (see the audit's M40–M43) |
| Flaky-test detection | NOT_SUPPORTED | re-check manually |

## Maintenance rule
Change a status only with evidence: **VALIDATED** requires a real-application run recorded in
`references/DOGFOOD-EVIDENCE.md`; **IMPLEMENTED** requires an automated test that executes it for real.
