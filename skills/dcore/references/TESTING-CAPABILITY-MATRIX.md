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
| Click | real mouse events at the element centre after it is INTERACTABLE; `button: right`, `double`; `force: true` = explicit JS click, reported as forced | M39-2 | VALIDATED | drag and drop: see `drag` (M45) |
| Text input | `fill` (replace) / `type` (per-key events, for key-driven widgets) / `clear`; value re-read and verified; maxlength truncation and browser sanitisation explained, anything else FAIL | M39-5, M39-7 | VALIDATED (staging: search, rate limit 5000/60 verified) | IME / composition input not simulated |
| Date / time / range / colour inputs | native value setter + input/change events, verified | M39-5 | IMPLEMENTED | custom JS date pickers by click composition (M45 #16) |
| Select / dropdown | native `<select>` by value / label / index, verified, disabled options refused; custom comboboxes: open, click option, verify on the trigger | M39-6 | IMPLEMENTED | multi-select not supported; virtualised option lists need explicit steps |
| Checkbox / radio | `check` / `uncheck`: idempotent, verified, falls back to the visible label for visually hidden inputs; radios cannot be unchecked | M39-6 | VALIDATED (staging: owner radios) | — |
| Keyboard | named keys + chords (`Control+A`, `Shift+Tab`, …) with editing commands; `press {selector, key}` focuses first | M39-7 | VALIDATED (Tab, Escape on staging) | OS-level shortcuts (browser chrome) not available |
| Enter / Escape / Tab | as above | M39-4, M39-7 | VALIDATED | — |
| URL navigation | `goto` with navigation TIMEOUT reporting; http/https/data/about only | all | VALIDATED | — |
| Redirect handling | document redirect chain recorded (status, from → to) on every `goto` | M39-8 | VALIDATED (staging: https → **http** login → https downgrade hop observed) | non-document (XHR) redirects not listed |
| Back / forward | `back` / `forward`; FAIL if the URL does not change | M39-8 | IMPLEMENTED | bfcache state is not inspected |
| SPA / dynamic navigation | in-document navigations recorded; `waitFor {url}`, `waitFor {stable}`; history across pushState | M39-8 | IMPLEMENTED | no route-name awareness (URL based) |
| Modal / dialog handling | `assertModal {open, title}` (dialog, role=dialog/alertdialog, aria-modal; fixed-position safe); backdrop obstruction detected; JS alert/confirm/prompt auto-handled (confirm dismissed unless `{"dialog":"accept"}`) | M39-4 | VALIDATED (staging catalog modal) | — |
| Responsive viewports | device emulation verified (`screen.width`); missing `<meta name=viewport>` reported as a responsive finding | M39-14, M39-16 | VALIDATED | touch: `tap` / `swipe` with touch emulation (M45 #22) |
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
| Session / authentication | form login with `valueEnv` credentials, session reuse (`--profile`) | QA-4, staging | VALIDATED | HTTP Basic / Digest: `httpAuth` (M45 #19) · SSO popups: NOT_SUPPORTED · CAPTCHA / MFA: BLOCKED (by design) · session expiry: `session expire / restore` (M42, M45 #20) |

## Real-world certification (M47)
Capability-by-capability results on six real applications (VALIDATED / PARTIALLY_VALIDATED / BLOCKED / NOT_TESTED /
NOT_APPLICABLE), with evidence and limitations: `references/WEB-TESTING-CERTIFICATION.md` (repository root `references/`).

## Browser and viewport matrix (M46)
Host of record: Windows 11 (win32 x64), 2026-10-04. Detection only — nothing installed. Evidence: `bench/test/dcore-browser-matrix-m46.test.ts`
(fixture) and `.dcore/evidence/m46-real/` (public practice sites; DOGFOOD-EVIDENCE §17).

| Browser | Engine | On this host | Drivable by DCore | Desktop 1366x900 | Tablet 820x1180 | Mobile 390x844 |
|---|---|---|---|---|---|---|
| Google Chrome 153 | Chromium | installed | yes (CDP) | fixture PASS · real 5/5 PASS | fixture PASS · real 5/5 PASS | fixture PASS · real 5/5 PASS |
| Microsoft Edge 154 | Chromium | installed | yes (CDP) | fixture PASS · real 4/5 (1 transient site failure, PASS on rerun) | fixture PASS · real 3/5 (1 transient; modal: DCore defect fixed, PASS after fix) | fixture PASS · real 5/5 PASS |
| Chromium (Playwright build on disk) 151 | Chromium | installed | yes (CDP) | fixture PASS · real 5/5 PASS | fixture PASS · real 4/5 (1 transient, PASS on rerun) | fixture PASS · real 5/5 PASS |
| Brave | Chromium | not installed | - | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE |
| Firefox | Gecko | not installed | no (needs WebDriver BiDi; not implemented) | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE |
| WebKit / Safari | WebKit | not installed (Safari does not exist on Windows) | no (own protocol; not implemented) | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE |

Limitations: Chrome, Edge and Chromium share the Chromium engine, so this is **Chromium-engine coverage, not cross-browser
compatibility**. Tablet / mobile are device-metrics + touch emulation in desktop Chromium, not real devices (no mobile
browser UI, no real GPU / input stack). Running Firefox or WebKit would need a WebDriver BiDi / WebKit driver in DCore and
the browsers installed — neither is done without explicit authorisation.

## Advanced web application coverage (M45)
Fixture = local test app (`bench/test/dcore-advanced-web-m45.test.ts`, M39 / M42 tests). Real = executed against a real
application on 2026-10-04 (public automation-practice sites, a public WebSocket echo service, the staging app); evidence
`.dcore/evidence/m45-real/m45-real-results.json` and DOGFOOD-EVIDENCE §16. A capability is VALIDATED only with a real PASS.

| # | Capability | Implementation | Fixture test | Real application | Status | Known limitation |
|---|---|---|---|---|---|---|
| 1 | iframe | per-frame execution contexts; `frame: name / url / {selector}` on any locator, text or wait | M39-9 | PASS (the-internet.herokuapp.com/iframe, TinyMCE editor frame) | VALIDATED | an assertion right after load can miss a frame built later: use `waitFor` |
| 2 | nested iframes | recursive frame tree | M39-9 | PASS (the-internet.herokuapp.com/nested_frames) | VALIDATED | - |
| 3 | shadow DOM | open roots searched by every locator / text / inspection | M39-10 | PASS (the-internet.herokuapp.com/shadowdom) | VALIDATED | closed shadow roots: NOT_APPLICABLE (unreachable by design of the platform) |
| 4 | multiple browser windows | `window.open` popups tracked as targets; `switchTab` / `closeTab` | M39-11, M45-6 | PASS (the-internet.herokuapp.com/windows) | VALIDATED | popup windows share the browser's single viewport size |
| 5 | multiple tabs | `target=_blank` tracked; `switchTab {latest/url/title/index}` | M39-11 | PASS (the-internet.herokuapp.com/windows opens a new tab) | VALIDATED | - |
| 6 | popup handling (JS dialogs) | alert / confirm / prompt handled; `dialog: {accept, promptText}`; every dialog recorded | M45-6 | PASS (the-internet.herokuapp.com/javascript_alerts: prompt answered "DCore", confirm dismissed) | VALIDATED | beforeunload follows the same policy |
| 7 | file upload | `upload` via DOM.setFileInputFiles, confined to allowed directories, credential-like names refused | M39-12 | NOT_TESTED (uploading to a third-party server is an external write; staging has no upload) | IMPLEMENTED | drag-to-upload drop zones are not driven |
| 8 | file download | `download` saved under the evidence dir, hashed, content-checked | M39-12 | PASS (the-internet.herokuapp.com/download: a 27-byte .txt, sha256 recorded) | VALIDATED | content checks are text-based |
| 9 | dynamic / lazy-loaded content | waits (`waitFor` states / text / stable); `scrollUntil` with real wheel events, waiting for lazy batches before declaring the end | M39-3, M45-4 | PASS (the-internet.herokuapp.com/dynamic_loading/2; practice.expandtesting.com/infinite-scroll: batch 6 reached after 4 scrolls) | VALIDATED | a loader slower than `loadWaitMs` (2.5 s) is reported as the end of content |
| 10 | virtualised lists | `scrollUntil {container}` scrolls the list's own container until the row is rendered | M45-4 (10,000-row list: row 120 found, row absent before) | NOT_TESTED (the public demo route did not load during validation) | IMPLEMENTED | targets are found by scrolling, not by index |
| 11 | SPA route transitions | in-document navigations recorded; `waitFor {url}` | M39-8 | PASS (demoqa.com /elements -> /text-box, React) | VALIDATED | URL based, no route-name awareness |
| 12 | history-state navigation | `back` / `forward` verified (URL must change); pushState history | M39-8 | PASS for server-rendered back navigation (staging, M42: 20 back-navigation scenarios HELD); pushState history NOT_TESTED on a real app | IMPLEMENTED | bfcache state is not inspected |
| 13 | fixed / sticky UI | targets scrolled to the centre; page-level hit test reports the covering element | M45-5 (sticky header), M39-16 | PASS (the-internet.herokuapp.com/floating_menu: click on the floating menu after scrolling) | VALIDATED | - |
| 14 | complex modals / dialogs | `assertModal {open, title, top}`: stacked modals know the top one (top layer, z-index, DOM order); Escape; backdrop obstruction | M39-4, M45-5 | PASS (demoqa.com /modal-dialogs: open, top, close) | VALIDATED (single modal) | stacked modals: fixture only |
| 15 | autocomplete / combobox | `type` (per-key) drives key-event suggestions; `select` on native and custom comboboxes | M39-6, M39-7 | NOT_TESTED in M45 | IMPLEMENTED | multi-select not supported |
| 16 | date / time pickers | native date / time / datetime-local / month / week via the value setter; custom pickers by composition (click the input, click the day); read-only picker inputs are never typed into | M45-7 | PASS (selenium.dev web form: bootstrap datepicker by clicks) | VALIDATED | no generic "pick a date" abstraction for custom widgets (by design: they differ) |
| 17 | drag and drop | `drag {from, to | by}`: native HTML5 drags intercepted (Input.setInterceptDrags) and completed with dragenter / dragover / drop; pointer-based libraries get mouse down / move / up | M45-1 | PASS (the-internet.herokuapp.com/drag_and_drop, native HTML5: columns swapped) | VALIDATED (native) | pointer drag: fixture only; file drag from the OS is not possible |
| 18 | WebSocket / SSE observation | passive: connections, frames sent / received (last 20, 300 chars), close; SSE messages per stream; `assertSocket` | M45-8, M45-11 | PASS WebSocket (wss://echo.websocket.org: 2 sent, 3 received); SSE NOT_TESTED on a real app | VALIDATED (WebSocket) | DCore never sends frames; binary frames are recorded as "[binary frame]" |
| 19 | authentication redirects | redirect chain on every navigation; return-to after login; HTTP Basic / Digest via `httpAuth {userEnv, passEnv, origin}` (env-only credentials, one origin) | M45-9, M45-10 | PASS (staging: 302 -> http login -> 307 https; the-internet.herokuapp.com/redirect; the-internet.herokuapp.com/basic_auth with httpAuth) | VALIDATED | SSO popups / MFA / CAPTCHA: BLOCKED by design |
| 20 | session expiration | `session: expire / restore` (test-browser cookies only) | M42-3, M45-9 | PASS (staging: expire -> login page; restore -> signed in again) | VALIDATED | server-side expiry timers are not exercised |
| 21 | responsive breakpoints | `breakpoints {widths, visible/hidden with at:{min,max}}`: overflow, meta viewport, per-breakpoint screenshots, desktop restored | M45-3 | PASS (staging 375 / 768 / 1366 ok; the-internet.herokuapp.com: correctly FAILED at 375px, no meta viewport) | VALIDATED | layout checks are overflow / visibility, not visual comparison |
| 22 | mobile interaction patterns | touch emulation; `tap` (touchstart / touchend through Chrome's gesture recogniser -> click), long press (`holdMs`), double tap, `swipe` (touch moves) | M45-2 | PASS tap (the-internet.herokuapp.com at 390px: tap navigated); swipe dispatched on a real page but its outcome verified on the fixture only | VALIDATED (tap) | pinch / multi-finger gestures not supported |

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
| Three PDFs (Test Report, Defect Report, Test Case Register) | VALIDATED | rendered by dcore-report (M43, below); streamed rendering; missing source ⇒ BLOCKED |
| Accessibility heuristics | VALIDATED | heuristic, not a WCAG audit |
| Visual regression, cross-browser (Firefox/WebKit), WebSocket/SSE assertions, request/response body assertions, database checks | NOT_SUPPORTED | planned (see the audit's M40–M43) |
| Flaky-test detection | NOT_SUPPORTED | re-check manually |

## Test documentation — dcore-report (M43)
| Capability | Implementation | Test | Validation status | Known limitation |
|---|---|---|---|---|
| One report model from the unified evidence (scenario run or plan run) | `docs.mjs` buildReportModel (`dcore.report-model/1`) | M43-1 | VALIDATED (fixture + staging run) | build / objectives / business impact need `--meta` (else UNKNOWN) |
| Detailed Test Report: cover, contents, 13 numbered sections, landscape execution table, evidence index | renderTestReportDoc + CSS named pages | M43-3, M43-4 (sections read back from the PDF outline) | VALIDATED | - |
| Detailed Defect Report: DCORE-DEF-NNN, identification, classification (layer from evidence), description, reproduction, evidence, recommendation, acceptance criteria | renderDefectReportDoc | M43-2, M43-4 | VALIDATED | layer is UNKNOWN when the failing check does not establish it |
| No fabricated root cause / severity | fixed ROOT CAUSE: UNKNOWN line; UNASSESSED severity kept | M43-2 | VALIDATED | - |
| Test Case Register: 15 fields per case | renderRegisterDoc (landscape, fixed column widths) | M43-1, M43-3 | VALIDATED | very long step lists make tall rows |
| Headers, footers, page numbers, outline (bookmarks), tagged PDF, metadata (title, author, subject, keywords, creator, creation date) | Chromium printToPDF + incremental Info update (no dependency) | M43-4, M43-5 | VALIDATED | creation date = end of run; the printer's own Info object remains in the file body (superseded) |
| No secret in any document | redaction + check of every HTML and PDF (raw, inflated streams, UTF-16 strings) for credential values referenced by the run | M43-4, M43-5 | VALIDATED | PDF page text is glyph-encoded: it is checked at its HTML source |
| Shared reporting layer: `--report <dir-or-prefix>` on every workflow | `reporting.mjs` normalises any result once; dcore-report renders | M44-1..7 | VALIDATED (fixture) | evidence without per-step detail (api / run / verify) becomes one case per run |
| Partial / BLOCKED / NOT_TESTED runs | final status PARTIAL RUN / BLOCKED / NOT TESTED; later steps SKIPPED | M44-3, M44-4, M44-5 | VALIDATED | - |
| Cross-document consistency (run, case, defect, evidence IDs) | crossReferences on the printed HTML; same IDs as dcore-qa's own documents | M44-3, M44-6 | VALIDATED | - |
| Deterministic output | no wall-clock time; stable ordering | M43-3, M43-4 (identical HTML and outline) | VALIDATED | PDF bytes differ (printer timestamps / ids) |

## Maintenance rule
Change a status only with evidence: **VALIDATED** requires a real-application run recorded in
`references/DOGFOOD-EVIDENCE.md`; **IMPLEMENTED** requires an automated test that executes it for real.
