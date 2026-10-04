# DCore Web Testing Capability Certification (M47)

Date: 2026-10-04 · Host: Windows 11 (win32 x64) · Browser: Chrome 153 (Chromium engine; see M46 for Edge / Chromium)
Evidence: `.dcore/evidence/m47/<app>/` (local, git-ignored): app map, scope, scenario run, defect candidates and the
three PDFs per application. Every result below comes from executing DCore against the application; nothing is inferred
from source code. This is **not** a claim of universal coverage: it states what was demonstrated on these six targets.

## Applications (all authorized: public sites published for automated testing, plus the owner's staging)

| # | Type | Application | Final run | Scenarios | PASS | FAIL | BLOCKED | NOT_TESTED | Defects | PDFs (pages: test report / defect report / register) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Traditional server-rendered | practice.expandtesting.com | run-20261004T110116-f5a2e2 | 44 | 38 | 3 | 3 | 0 | 5 | 46 / 16 / 23 |
| 2 | React SPA (+ iframe-heavy pages) | demoqa.com | run-20261004T105045-43d925 | 65 | 57 | 3 | 5 | 0 | 4 | 101 / 14 / 79 |
| 3 | Next.js | demo.vercel.store (browse only) | run-20261004T111613-8e9f5d | 87 | 79 | 2 | 6 | 0 | 2 | 111 / 8 / 72 |
| 4 | Authenticated administrative | choicepay staging | run-20261004T101821-abcbca | 119 | 90 | 6 | 22 | 1 | 29 | 73 / 62 / 101 |
| 5 | Responsive / mobile | saucedemo.com (desktop + mobile 390x844) | run-20261004T104939-9fa168 | 18 | 14 | 0 | 4 | 0 | 2 | 16 / 9 / 5 |
| 6 | API-heavy | jsonplaceholder + restful-booker | run-20261004T060947-da239d | 10 | 9 | 0 | 1 | 0 | 0 | 9 / 2 / 3 |
| 7 | iframe-heavy | demoqa.com /frames, /nestedframes (within #2) | as #2 | 2 | 2 | 0 | 0 | 0 | 0 | in #2 |

Per application DCore performed: discovery (passive crawl, max 6 pages) -> test scope (`--meta`) -> candidate scenarios
(generated) + hand-written functional flows -> execution (functional, negative, responsive) -> screenshots, console,
network -> defect identification + classification -> three PDFs.

## Web Testing Capability Matrix

Results: VALIDATED (demonstrated on a real application) · PARTIALLY_VALIDATED (works with a stated gap) · BLOCKED ·
NOT_TESTED · NOT_APPLICABLE.

| Capability | Application tested | Scenario | Result | Evidence | Limitation |
|---|---|---|---|---|---|
| Application discovery (routes, forms, controls, API calls) | server, React, Next.js, staging | `dcore-explore --app` | VALIDATED | 6 routes each; 39 / 47 / 81 / 116 candidates | max-pages cap; controls that appear only after interaction are not mapped |
| Discovery of a client-rendered app without links | saucedemo | `dcore-explore --app` | PARTIALLY_VALIDATED | 1 route found, 2 candidates | navigation by buttons / script is not crawled; hand-written flows needed |
| Auth boundary detection | staging; saucedemo | anonymous probe | VALIDATED (staging: 5 protected) · PARTIALLY_VALIDATED (saucedemo) | app maps | client-side auth (200 app shell) looks "public" to an anonymous request |
| Test scope creation | all six | `--meta` scope -> report section 2 | VALIDATED | scope.json + test reports | scope facts are supplied by a person |
| Candidate scenario generation | server, React, Next.js, staging | generator + negative planner | VALIDATED | 283 candidates, applicability matrices | expectations taken from one crawl fail on randomised pages (expandtesting /abtest) |
| Server-side form login | server; staging | SR-F01; setup | VALIDATED | PASS | - |
| Client-side login, locked / empty user refused | saucedemo | setup, SD-N01, SD-N02 | VALIDATED | PASS desktop + mobile | - |
| Form inputs, select, checkbox, radio, double / right click, table search | server, React | SR-F02..F04, RE-F02..F05, RE-F07 | VALIDATED | PASS | on `<select>`, the value assertion compares the visible option text |
| Dynamic / late-enabled content | React | RE-F06 | VALIDATED | PASS | - |
| Autocomplete | React | RE-F08 | VALIDATED | PASS | custom react-select input reported obstructed by its own overlay (CAND-RB-015, not determined) |
| SPA / client-side routing | React; Next.js | RE-F01; NX-F01 | VALIDATED | PASS | URL based |
| Search (GET) incl. no-result negative | Next.js | NX-F02, NX-N01 | VALIDATED | PASS | - |
| JS dialogs (prompt, confirm), modal | React | RE-F09, RE-F10 | VALIDATED | PASS | - |
| iframes and nested iframes | React (demoqa frames) | IF-F01, IF-F02 | VALIDATED | PASS | nested frame addressed by its URL (srcdoc) |
| File download / upload (local) | React | RE-F11, RE-F12 | VALIDATED | PASS (file saved; upload read locally by the page) | uploads to a server are a write (approval) |
| Drag and drop | React | RE-F13 | VALIDATED | PASS | - |
| Negative / boundary cases (field level) | server, React, Next.js, staging | generated | VALIDATED | negative HELD: 27/27, 34 of 38, 66/66, 83 of 89; 0 violations after fixes | client-side oracle; server-side validation needs approval |
| Fault injection (API errors simulated in the browser) | Next.js, staging | CAND-FI-* | VALIDATED (Next.js) · BLOCKED (staging, 5) | Next.js HELD; staging: the API call did not recur on reload, nothing concluded | only GET calls seen on load are faulted |
| Unauthenticated access, session expiry | staging | CAND-AU-*, AD-F02, CAND-SS-* | VALIDATED | PASS | cookies of the test browser only |
| Responsive breakpoints / mobile viewport | all web apps; saucedemo desktop + mobile | *-R01, CAND-RS-*, matrix | VALIDATED | real finding: expandtesting 1216 px wide at 768 px | emulation, not a real device |
| Touch interaction | saucedemo mobile | SD-F04 (tap opens menu) | VALIDATED | PASS desktop + mobile | - |
| Screenshots | all web apps | per step on failure + per scenario end | VALIDATED | 47 / 62 / 86 / 127 / 14 | - |
| Console errors / uncaught exceptions | staging, server, React | observations | VALIDATED | staging: uncaught TypeError on 5 admin pages | top frame of the stack only |
| Network failures | staging, server, mobile | observations | VALIDATED | staging chat transport HTTP 500 (50 occurrences -> 1 defect) | no response bodies |
| API testing: status, JSON values, nested path, schema, headers, latency | jsonplaceholder, restful-booker | API-F01..F05 | VALIDATED | PASS | - |
| API negative responses | same | API-N01..N04 | VALIDATED | 404s verified | - |
| Defect identification and classification | all | defect report | VALIDATED | layer from evidence (frontend / backend / API / network / UNKNOWN), severity, priority, acceptance criteria | severity of a failed P1 test follows its priority (see AD-F01) |
| Three PDFs per application | all six | dcore-report | VALIDATED | 18 PDFs | - |
| Approval gate on writes | API, React, Next.js, saucedemo, staging | API-A01, RE-A01, NX-A01, SD-A01, SD-A02, AD-A01 | VALIDATED | BLOCKED as APPROVAL_REQUIRED, nothing sent | name-based UI guard is conservative: client-side "Remove" also needs approval |
| Review placeholders (outcome only a person knows) | staging, server | CAND-SF-*, CAND-ES-*, CAND-EH-* | VALIDATED (blocks, never guesses) | 27 BLOCKED | needs a person to supply data |
| Authorization with a second, lower-privileged account | staging | CAND-PM-001 | NOT_TESTED | - | needs a second account |
| Server-side validation after submit, duplicate / double submission | all | - | NOT_TESTED | - | writes: approval not given in M47 |
| Cross-browser (Firefox, WebKit) | - | - | NOT_TESTED | see M46 | not installed; DCore drives Chromium (CDP) only |
| CAPTCHA, MFA, SSO popups | - | - | NOT_APPLICABLE (none on these targets) | - | by design these need a human |
| Visual regression (pixel comparison) | - | - | NOT_TESTED | - | not supported |

## Findings on the applications (candidates for triage, not confirmed business defects)
- **staging**: uncaught `TypeError: Cannot read properties of null (reading 'addEventListener')` on 5 admin pages; the chat
  transport returns HTTP 500 on every page (50 occurrences); AD-F01 "token list shows rows" FAILED: 0 visible rows in
  this session although M40 saw a populated list — **needs human confirmation** (the expectation is not established;
  DCore rated it critical only because the test was P1).
- **practice.expandtesting.com**: the home page is 1216 px wide in a 768 px viewport (horizontal scroll at tablet size).
- **demoqa.com, demo.vercel.store**: unknown routes return HTTP 200 (client-rendered "soft 404").

## DCore defects found by this certification and fixed (regression tests M47-1..7)
1. Length-boundary values ignored the field pattern (false violations on demoqa's 10-digit mobile number).
2. An oracle that could not find its element was counted as a violation.
3. Write baselines broke on per-load random URL segments; 4. the refresh check counted the page's own transport writes —
   now only a request carrying the typed data counts (request bodies kept in memory, never in evidence).
5. The browser's password-breach warning swallowed every click after a login with a known test password (saucedemo,
   expandtesting): the throwaway test profile now has the password manager off.
6. Back-navigation candidates could pick a non-navigating link "verified" by `url contains "/"`.
7. Happy-path candidates clicked submit buttons that were disabled at discovery.
8. 50 identical network failures became 50 defects (now one per endpoint, with the count).
9. Steps that are checks (waitFor, breakpoints, download with expectations) were not credited as verified.

## Certification statement
- **DCore can demonstrably test** (on these targets): discovery of link-navigated apps, scoping, generated and
  hand-written functional scenarios, server- and client-side login, forms and common widgets, SPA routing, dialogs,
  modals, iframes and nested iframes, file download / local upload, drag and drop, field-level negative and boundary
  cases, simulated API failures, unauthenticated access and session expiry, responsive breakpoints and touch on mobile
  viewports, screenshots, console / uncaught errors, network failures, REST API checks, defect classification and the
  three PDFs.
- **Partially supported**: discovery of apps navigated by script (needs hand-written flows); client-side auth boundaries;
  custom widgets whose input sits under an overlay; pages whose content is randomised between loads; fault injection
  only where the API call recurs on reload.
- **Unsupported**: Firefox / WebKit execution, visual comparison, multi-finger gestures, closed shadow roots.
- **Requires human intervention**: values only a person knows (search terms, success / empty-state text: 27 placeholders
  on staging), confirming findings such as AD-F01, CAPTCHA / MFA / SSO, a second account for authorization tests.
- **Requires approval**: every write — UI submissions ("Submit", "Add To Cart", "Remove", "Checkout", "Create token") and
  non-GET API requests (`--approve ui-write` / `external-write`); none was given, nothing was written.
- **Not tested in M47**: server-side validation after submission, duplicate / double submission, authorization with a
  second account, cross-browser engines, pushState-history on a real SPA (M45: fixture only).
