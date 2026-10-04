# DCore Dogfood Evidence

## 1. Purpose
This document records **real-world dogfood evidence** for DCore — chiefly `dcore-impact` — gathered by running the
product against unrelated, real repositories (M34–M37). It captures **observed behavior**, so future development does
not re-derive the same cross-repository findings.

It is **not** a formal compatibility or certification matrix, and makes no certification claim.

## 2. Repositories validated
| Repository | Language | Milestone | Scale |
|---|---|---|---|
| DCore (self-host) | JS/TS (ESM) | M31–M37 | `skills/dcore/` + `bench/` |
| tj/commander.js | JavaScript | M34, M35 | lib/ + tests/ + docs/ (5 precision scenarios in M35) |
| colinhacks/zod | TypeScript | M36 | 742 files (OO: classes/interfaces/types) |
| google/gson | Java | M37 | 313 files / 264 .java (ref `854c825`) |

Refs/measurements above are preserved from the milestone history, not re-measured here.

## 3. What generalizes
`dcore-impact` uses **lexical evidence** (literal identifier references), not language semantics. The following
identifier forms were demonstrated to extract and produce useful evidence across the repos above:

- **camelCase** methods/fields — e.g. `toJson`, `parseOptions`, `validateRequest`.
- **multi-hump PascalCase** class/type names (≥2 capital-led segments) — e.g. `ZodError`, `CollectionTypeAdapterFactory`, `RequestValidator` (added + validated in M36; generalized to Java in M37).
- **`Class.method`** descriptions — covered by extracting the `ClassName` and the method separately (no dotted-path parser needed).
- **`CONSTANT_CASE` / underscore identifiers** — e.g. `ATOMIC_INTEGER_FACTORY`, `AUTO_DETECT_FIELDS` (handled by the underscore/snake_case rule; no separate rule needed).
- **snake_case** — where present.
- **mixed identifiers** — PascalCase + camelCase + CONSTANT_CASE in one change description.
- **rename / change descriptions** — the old name surfaces as evidence; the new (not-yet-existing) name is reported `UNKNOWN` (useful for migration work).

## 4. Known limitation — single-token ambiguity
A **single token** such as `Gson`, `Excluder`, `Request`, `User`, or `Error` cannot safely be treated as a code
identifier in arbitrary prose: there is no deterministic way to distinguish a single-token class name from an
ordinary English word without a dictionary or language parser (both out of scope). M37 confirmed that generic
single-token extraction would match ordinary prose.

Consequences:
- single-token class/type names **may be missed**;
- this is an **intentional conservative tradeoff** that protects against prose false positives;
- **anchor** the query on a method, a distinctive multi-word type, a constant, or another specific identifier — e.g. `Gson.toJson` (whose `toJson` finds the usages).

This is **not** treated as a defect unless future dogfood demonstrates an actionable miss.

## 5. Evidence table
| Milestone | Repository | Language | Key evidence | Result |
|---|---|---|---|---|
| M34 | commander.js | JavaScript | end-to-end chain + impact on real changes | GOOD generalization; NO_CHANGE |
| M35 | commander.js | JavaScript | hot symbol `parseOptions` → broad LIKELY; `--summary` keeps it readable | DOCUMENTATION_ONLY |
| M36 | zod | TypeScript | `ZodError` 0→86 DIRECT/58 test/18 doc after multi-hump PascalCase rule | MINIMAL_EXTRACTION_FIX |
| M37 | gson | Java | PascalCase/CONSTANT_CASE/Class.method all found; single-token `Gson` miss non-actionable | DOCUMENTATION_ONLY |
| exec (2026-10-03) | Paysecure staging admin (authorized QA) + DCore self-host | web app / JS | real browser login + 90 executed steps on the API-tokens page; release gates; staging verify; 5 DCore bugs found and fixed via regression tests | GOOD: execution evidence matched screenshots; see §10 |

## 6. When using dcore-impact
- Prefer **distinctive** identifiers (multi-word types, specific methods, constants).
- For a **common** identifier, use **`--summary`** — it stays compact regardless of how broad the result is.
- For a type with a **common or single-token name**, anchor the change on a distinctive method or related identifier.
- Treat a broad **`LIKELY_AFFECTED`** set as **evidence**, not a dependency graph — absence of evidence is not proof of no impact.
- Use **`--repo <path>`** to set the analysis boundary explicitly; use `--repo .` to include sibling tests/docs.
- Remember `dcore-impact` is **lexical, read-only** analysis.

## 7. Scope and limitations
`dcore-impact` is: read-only · deterministic · lexical/evidence-based. It is **not** a dependency graph, an AST
parser, language-semantic analysis, a compiler, or a certification system. It never reads secret files
(`.env`/`.credentials`/keys/`.ssh`) or agent/VCS state (`.git`/`.hg`/`.svn`/`.claude`/`.paysec`/`node_modules`),
makes no network calls, and writes nothing to the analyzed repository.

## 8. Evidence status
Current evidence demonstrates **useful cross-language generalization** across JavaScript, TypeScript, and Java. This
is **not** a claim of universal language compatibility, and **not** "certified compatibility."

## 9. Maintenance rule
Update this document **only** when new real-world dogfood materially changes what DCore is known to support, what
limitations are known, or how users should operate it. Do **not** update it for theoretical language features.

## 10. Execution layer dogfood (2026-10-03)
Real tasks run through `/dcore` after the execution layer was added. Credentials were supplied only via environment
variables; the browser profile used for session reuse was deleted afterwards; evidence stayed in git-ignored `.dcore/`.

| Task | Executed for real | Result / evidence |
|---|---|---|
| Web E2E: staging admin **API tokens** page | dcore-browse: login (env-var credentials), 4 runs / ~90 steps: stats, Active/Revoked/All tabs, search + empty state, token detail, New-token presets, API filter, rate-limit min/max validation, owner switch, API catalog modal open/Escape, a11y, perf, mobile 390px | All functional checks PASS (15 active = 11 + 3 + 1; tabs 15/22/37; search filters; validation messages for 0 and 5000). **App findings:** 2–3 uncaught JS exceptions on every page (captcha `sitekey` missing, null `.style` / `.addEventListener`); unrendered `${_csrf.parameterName}` hidden field on login; list shows "128 APIs" while detail shows "127 of 127" + a retired API still granted; a11y: logo without alt, unnamed header button, duplicate ids, focusable controls inside aria-hidden modals. Password never appeared in evidence. |
| Real bugs (DCore) | regression test first (failed), fix, re-run | A installer left stale files on upgrade → install record; B malformed `--steps`/`--spec` JSON crashed → BLOCKED exit 3; C 5 module docs had blank commands/examples → fixed; D dcore-review flagged `===` as loose equality (9 false positives on a real diff → 0); E secret scan flagged `.eval()` methods / the word SELECT / doc examples → tightened. |
| Real feature | route → spec → plan → impact → test-first → build → dcore-run → diff review → dcore-sec → docs | `--report <file.md>` for execution modules; feature test failed first, then passed. |
| Real change impact | dcore-impact on renaming the legacy `dk*` engine exports | Found exactly the 3 affected files (1 source, 2 tests; no docs) = `git grep` ground truth; new names UNKNOWN before, resolved after; deprecated aliases kept. |
| Release / verification | dcore-release on this repo; dcore-verify on staging | BLOCKED (31 uncommitted changes) with the full suite executed inside the gate (722/722); push without `--approve` → NOT_AUTHORIZED, nothing pushed; staging verify FAILED only because the login page throws uncaught exceptions (HTTP 200, text present, 1.65 s). |

Observed limits (not defects unless future dogfood shows an actionable miss): `evaluate` steps without `expect` are
observations, not assertions; visibility probes using `offsetParent` misread fixed-position modals (screenshots were
needed to confirm); dcore-explore does not list `node:test` (built in, not a dependency); reasoning scaffolds
(spec/plan) add little for small features; the env-var username is redacted wherever it appears on the page.

## 11. End-to-end test runs with PDF reports (2026-10-03)
`dcore-qa --discover` + `--plan` on the authorized staging admin **API tokens** page (login via env-var credentials).

| Item | Evidence |
|---|---|
| Discovery | 11 executable cases generated from the live page's own constraints (rate limit 1–1000, label maxlength 128) + keyboard, a11y, mobile, load time; "Create token", 4 unconstrained fields listed as NOT_TESTED |
| Plan | 11 generated + 12 business cases (stats consistency, tab counts, search, empty state, detail view, presets, owner picker, catalog modal, skip link); create / revoke / edit / logged-out flows declared NOT_TESTED with reasons |
| Results | 28 cases: 20 PASS, 3 FAIL, 5 NOT_TESTED; verdict READY WITH RISKS; identical on two consecutive runs |
| Defects (9) | list-vs-detail API count mismatch (CONFIRMED); 3 uncaught JS exceptions (2 attributed to the login page during setup); first Tab stop skips the skip link (re-run 4×, reproducible); 4 accessibility heuristics |
| Documents | Detailed Test Report (17 pages), Detailed Defect Report (5), Test Case Register (5, landscape); no credential in any output |
| DCore bugs found and fixed (regression-tested) | hidden-modal fields turned into generated cases; image-heavy report PDF timed out (fixed by streaming); a missing source HTML printed the browser error page as a "PASS" PDF; setup-phase errors lacked reproduction context; a11y defects linked to the wrong cases; evaluate failures did not state the expected value |

## 12. M39 browser foundation (2026-10-03)
| Item | Evidence |
|---|---|
| Fixture validation | 17 real-browser tests (two origins): element states, obstruction, dynamic waits, fixed modals, verified inputs, selects, checks, keyboard chords, redirects, back/forward, SPA, nested + cross-origin iframes, open shadow DOM, tabs/popups, upload/download, runtime signals, responsive; stable across 3 consecutive runs |
| Staging regression | the 23-case API-tokens plan reproduced the pre-M39 results exactly (20 PASS / 3 FAIL / 5 NOT_TESTED) after two engine fixes |
| Staging capability probe | catalog modal detected open/closed; "New token" VISIBLE_BUT_OBSTRUCTED by `div#catalogModal` and the click refused; owner radios checked/verified; rate-limit fills verified; 3 identical token rows ⇒ AMBIGUOUS |
| New findings on the app | login flow redirects https → **http** /login → https (downgrade hop); exceptions now carry locations (reCAPTCHA `sitekey` from gstatic, `null.addEventListener` at /admin:1216 and /admin/analytics/tokens:1188) |
| DCore bugs found by real-world validation (regression-tested) | hit test used viewport instead of document coordinates (false obstruction on scrolled pages: 9 staging cases failed until fixed); device emulation did not set screen size; transient animation reported as a final state; element states over-redacted when a locator contained "token"; Control+A/type lost the selection; obstruction description had a quoting bug; a BLOCKED step inside a case could yield PASS |

## 13. M40 scenario engine (2026-10-03)
| Item | Evidence |
|---|---|
| Fixture | "token admin" app: Create API Token scenario (15 steps: browser + API + repo command) PASS with the server holding exactly the submitted values; negative, guard, no-expectation, declared, template, setup-failure and no-browser paths |
| Staging (6 scenarios) | STG-01 navigation, STG-02 validation, STG-03 unauthenticated access (dcore-api + dcore-verify) PASS; STG-04 list-vs-detail FAIL (128 vs 127); STG-05 Create API Token ran 6 verified steps and was BLOCKED before "Create token" (no ui-write approval; nothing created); STG-06 FAIL |
| New app defect | login page: the Password `<label>` is bound to the username input (`for="exampleFormControlInput1"`) and the password field has no label |
| DCore bugs found and fixed | test data containing `{{run.*}}` was not resolved (the UI checks agreed with each other on the literal; only the server-side check caught it); navigation shared the short element-wait timeout (failed under load); the scenario summary miscounted verified outcomes |

### 13a. Approved create + revoke on staging (owner approved ui-write, 2026-10-03)
| Run | Result |
|---|---|
| Attempt 1 (scenario as originally specified) | not created: the app requires at least one API besides the catalog ("Select at least one API besides the catalog."); verified read-only that nothing was created |
| Attempt 2 | not created: "Create token" opens a confirmation dialog. The scenario's weak expectation (token name anywhere on the page) matched the dialog text, a FALSE PASS of the scenario as written. Lesson: assert on the specific element (the Active-list row), not page-wide text |
| Attempt 3 (STG-05, `run-20261003T123751-a7b03d`) | PASS: name, owner (Paysecure), rate 250, "Performance only" preset (17 of 127) verified; confirm dialog verified; row `dcore-m40-a7b03d, psk_an_a462a7650, active` verified. The one-time secret was never revealed (DCore did not click "Show token"; screenshots disabled after submit; no secret-shaped string in any evidence) |
| STG-07 persisted values | owner "Paysecure (parentId 0)", "250 / min", 17 APIs verified on the detail view (one expectation of mine was wrong: the UI shows "17 of 127", i.e. of all available) |
| STG-08 revoke (`run-20261003T124804-086a1d`) | PASS: Revoke disabled until the confirmation code is typed (DCore refused to click it while DISABLED), enabled after typing, token no longer active, listed as revoked |
| Final state | Active 15 (unchanged), Revoked 23 (+1): staging left clean apart from the revoked test token |

## 14. M41 application discovery + candidate scenarios (2026-10-03)
| Item | Evidence |
|---|---|
| Fixture | multi-page admin app: passive crawl sent no writes and never requested /logout, /orders/delete-all or a CSV export; two crawls produced the same map_hash; candidates in all 13 categories; approval-required candidates executed nothing (no POST); coverage lifecycle reported |
| Staging discovery (8 routes, depth 1) | all 8 admin routes PROTECTED (login learned from the redirect); per-page forms, dialogs, dropdowns, API calls (e.g. /admin/analytics/tokens/list, /apis, /whitelabels); "Create token" flagged state-changing; /logoutcsrf and react-qa origin recorded, not visited |
| Staging candidates (no approvals) | 57 candidates: 28 executed (20 PASS, 8 FAIL), 28 BLOCKED (review placeholders + 1 approval-required), 1 NOT_TESTED (permission). PASS: 8 unauthenticated-access checks, 2 rate-limit boundaries, 8 responsive, navigation, unknown-route-to-login. FAIL: uncaught exceptions on every admin page (known defect) |
| Coverage | 349 controls DISCOVERED, 10 TESTED: discovery is not testing |
| DCore bugs found on staging and fixed (regression-tested) | auth probe read only a 2 KB excerpt and labelled protected routes PUBLIC (a false claim); radios/checkboxes named "query" were treated as search boxes; the global sidebar menu search was paired with page tables, producing 5 FALSE empty-state defects; responsive check measured overflow, which is unreliable without a meta viewport |

## 15. M42 negative & boundary testing (2026-10-03)
| Item | Evidence |
|---|---|
| Fixture | fragile page (unhandled API failures, a field whose handler throws on markup, no double-submit guard) vs robust page: boundaries / validation HELD; 5 simulated faults VIOLATED on the fragile page and HELD on the robust one; approved double submission sent 2 writes -> VIOLATED (data integrity); defect candidates with UNASSESSED severity / priority |
| Staging applicability (20 routes) | 1,423 decisions: 349 APPLICABLE, 1,073 NOT_APPLICABLE (each with its reason), 1 NOT_TESTED (unauthorized user: needs a second account), 0 APPROVAL_REQUIRED (no visible POST form submit) |
| Staging run (negative only, no approvals) | 350 scenarios: 331 PASS (HELD), 18 FAIL, 1 NOT_TESTED. Faults (server error, network failure, timeout, empty / malformed response) were simulated in the test browser only, on all 20 pages, and HELD; expired session, unauthenticated access, back navigation and boundaries HELD |
| DCore false positives found on staging and fixed (M42-6) | the 5 "refresh" violations were the page's own load-time POST requests (data fetches, chat transport), not a submission: write checks now exclude requests that a clean load of the page also makes. 13 failures were typing into read-only date-range pickers ("Select month", "Pick date range"): discovery now records readonly / disabled and those fields are NOT_APPLICABLE. All 18 failures trace to these two DCore defects (fixture-verified fixes); the staging run has NOT been repeated after the fixes |

## 16. M45 advanced web coverage on real applications (2026-10-04)
Read-only interactions; credentials from environment variables only; no upload to any third-party server. Evidence:
`.dcore/evidence/m45-real/m45-real-results.json` (local).

| Capability | Application | Result |
|---|---|---|
| iframe | the-internet /iframe (TinyMCE) | first attempt FAIL: `assertText` ran before the editor frame was built (validation-script error); with `waitFor` + frame: PASS |
| nested iframes, shadow DOM, multiple windows / tabs | the-internet /nested_frames, /shadowdom, /windows | PASS |
| JS prompt / confirm | the-internet /javascript_alerts | PASS (prompt answered "DCore"; confirm dismissed) |
| native HTML5 drag and drop | the-internet /drag_and_drop | PASS (columns A and B swapped) |
| dynamic content | the-internet /dynamic_loading/2 | PASS |
| infinite scroll | the-internet /infinite_scroll | BLOCKED by the site: its jQuery and CSS returned 503, the page threw `$ is not defined` and loaded nothing (DCore correctly found nothing) |
| infinite scroll | practice.expandtesting.com /infinite-scroll | first attempt FAIL: DCore declared the end while the next batch was still loading — **DCore defect, fixed** (scrollUntil now waits up to 2.5 s for the content to grow); after the fix PASS (batch 6 reached after 4 scrolls) |
| sticky / floating UI | the-internet /floating_menu | first attempt: navigation TIMEOUT (site); retry PASS |
| download | the-internet /download | PASS (27-byte .txt saved and hashed) |
| redirects | the-internet /redirect; staging protected route | PASS (302 chain recorded; staging: 302 -> **http** login -> 307 https downgrade hop, as found in M39) |
| HTTP Basic auth | the-internet /basic_auth | before M45: navigation failed (net::ERR_INVALID_AUTH_CREDENTIALS, not supported); with the new `httpAuth` (published demo credentials via env, that origin only): PASS |
| touch | the-internet at 390 px | PASS (tap navigated; swipe dispatched — its outcome is verified only on the fixture) |
| responsive breakpoints | the-internet home; staging tokens page | the-internet FAIL at 375 px — correct detection: no `<meta name="viewport">`, laid out at 981 px; staging 375 / 768 / 1366 PASS |
| SPA route, modal | demoqa.com /elements -> /text-box; /modal-dialogs | PASS |
| custom date picker | selenium.dev web form (bootstrap datepicker) | PASS (by clicks) |
| WebSocket | wss://echo.websocket.org | first attempt FAIL: the URL was recorded as `wss:/` — **DCore defect, fixed** (ws / wss URLs keep their host); then PASS (2 sent, 3 received) |
| session expiry | staging | PASS (expired -> login page; restored -> signed in) |
| virtualised list | react-window demo | NOT_TESTED: the demo route did not load (the page fell back to "Getting started"); validated on the fixture only |
| upload, SSE, autocomplete, pushState history | - | NOT_TESTED on a real application in M45 (fixture-tested) |

## 17. M46 browser and viewport matrix (2026-10-04)
Host: Windows 11 (win32 x64). Detected, nothing installed: Chrome 153.0.8010.53, Edge 154.0.4258.48, Chromium 151.0.7922.34
(a Playwright build already on disk); Brave, Firefox and WebKit not installed (Safari does not exist on Windows); Firefox
and WebKit could not be driven anyway (DCore speaks CDP only). Five read-only scenarios on public practice sites (nested
frames, native drag and drop, JS prompt, modal, tap navigation) x 3 browsers x desktop 1366x900 / tablet 820x1180 /
mobile 390x844, run with `dcore-qa --scenarios … --browsers … --viewports …` (three PDFs with the browser-coverage
section produced: 36 / 65 / 11 pages).

| Browser / viewport | Desktop | Tablet | Mobile |
|---|---|---|---|
| Chrome 153 | 5 PASS | 5 PASS | 5 PASS |
| Edge 154 | 4 PASS, 1 FAIL (drag: page element not found — not reproduced in 2 reruns: transient site load) | 3 PASS, 2 FAIL (nested frames: not reproduced on rerun, a later rerun hit a network reset; modal close: **DCore defect, fixed** — see below) | 5 PASS |
| Chromium 151 | 5 PASS | 4 PASS, 1 FAIL (nested frames: not reproduced in 2 reruns) | 5 PASS |
| Firefox, WebKit | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE |

DCore defect found by the matrix: in Edge's tablet emulation demoqa.com lays out at 861 px inside an 820 px viewport;
input coordinates (content quads) and page coordinates then differ by 41 px, and DCore hit-tested with input coordinates,
so the modal's Close button was reported "obstructed by" its own footer (3 of 3 attempts). Fixed: main-frame hit tests
use the element's page position; clicks keep input coordinates (proved: a mouse click at the page coordinate misses).
Regression test M46-5 fails without the fix and passes with it; the real Edge tablet / mobile and Chrome tablet modal
scenarios then PASS. Conclusion: Chromium-engine coverage on three Chromium browsers — **not** a cross-browser
compatibility result.


## 18. M47 real-world web testing certification (2026-10-04)
Six authorized applications (server-rendered, React SPA with iframe pages, Next.js, authenticated staging admin,
responsive / mobile, API-heavy), each taken through discovery -> scope -> candidates + functional flows -> execution ->
defects -> three PDFs. Nine DCore defects found on the real applications were fixed with regression tests M47-1..7.
Full capability matrix, findings and certification statement: `references/WEB-TESTING-CERTIFICATION.md`.
