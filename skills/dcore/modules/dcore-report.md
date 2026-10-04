# DCore · dcore-report — Test Documentation (PDF)

- **module_id:** dcore-report
- **status:** IMPLEMENTED
- **kind:** reasoning (text mode); renders documents with the local browser when given `--run`
- **purpose:** turn a completed DCore test execution into three separate, evidence-backed PDF documents: Detailed Test Report, Detailed Defect Report, Test Case Register
- **inputs:** `--run <file>` — a scenario run (`dcore.scenario-run/1`, written by `dcore-qa --scenarios`) or a test run (`dcore.testrun/1`, written by `dcore-qa --plan`); optional `--meta <file|json>` with facts only a person can supply (`application`, `build`, `objectives`, `assumptions`, `excluded`); `--out <dir>`; `--no-pdf`
- **outputs:** `<run>.Detailed-Test-Report.pdf`, `<run>.Detailed-Defect-Report.pdf`, `<run>.Test-Case-Register.pdf` (each also as HTML), `<run>.report-model.json` (`dcore.report-model/1`), the test run JSON and a Markdown summary
- **permissions:** reads the run file and its evidence files; writes into `--out`; starts the local Chromium-family browser only to print PDFs
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any (PDF printing uses the local Chrome / Edge / Chromium; without one the PDFs are BLOCKED and the HTML is still written)
- **dependencies:** none (the browser's own print engine; no PDF library)
- **failure_behavior:** unreadable / unsupported run file => BLOCKED, nothing written; no browser => PDFs BLOCKED, never faked; values the evidence does not establish are UNKNOWN; root cause is never claimed
- **runnable:** true

## How Claude uses this module
Run it on a finished run when the user wants documentation, or rely on `dcore-qa`, which produces the same three
documents for every run. Supply `--meta` for facts the evidence cannot contain (build number, objectives, excluded
scope); never type them into the report by hand. Read the result before quoting it: a BLOCKED or NOT_TESTED case is
not a pass, an UNASSESSED severity is not low, and "ROOT CAUSE: UNKNOWN" means exactly that.

## The three documents
All three share one report model, so IDs, results and evidence references agree across documents.
- **Detailed Test Report** (portrait; the detailed execution table is printed landscape): cover page (run ID,
  application, environment, build, date/time, browser + version, operating system, viewport, authentication context
  without secrets), contents, 1 executive summary (totals; pass percentage only when something was executed to a
  verdict, with its basis), 2 test scope (objectives, included, excluded, assumptions, limitations), 3 environment,
  4 browser coverage, 5 scenario execution summary, 6 detailed execution (test case, step, action, expected, actual,
  status, evidence reference), 7 defect summary, 8 console errors, 9 network failures, 10 accessibility observations,
  11 responsive observations, 12 final evidence-based status, 13 recommendations, 14 evidence index (EV-NNN with captions; screenshots
  of failed / blocked cases).
- **Detailed Defect Report**: one section per defect `DCORE-DEF-NNN` with identification, classification (defect type,
  layer — frontend / backend / API / network / security / UNKNOWN — only from evidence, severity and priority with their
  basis), description (summary, business impact — "NOT ESTABLISHED BY THE EVIDENCE" unless supplied, technical
  explanation of what was observed, observed / expected), the line `ROOT CAUSE: UNKNOWN — REQUIRES ENGINEERING
  INVESTIGATION`, reproduction (preconditions, exact steps, expected, actual), evidence (screenshots with captions, URL,
  console, network, API evidence, execution step, timestamp), recommendation (fix, likely affected area, investigation,
  regression) and numbered, testable acceptance criteria (AC-01, AC-02, ...).
- **Browser coverage** (section 4 of the test report): browser, version, OS, viewport, scenario, status, evidence and
  limitations for every combination that ran, the installed browsers that were not part of the run (NOT_TESTED) and
  the absent ones (NOT_AVAILABLE), with the statement "Chromium-engine coverage only: this is NOT a cross-browser
  compatibility claim" unless a non-Chromium engine actually executed tests.
- **Test Case Register** (landscape): ID, title, feature, module, test type, priority, preconditions, test data, steps,
  expected, actual, status, defect IDs, evidence references, execution timestamp.

Design: cover page with DCore branding, numbered sections, running header (document · run) and footer (application ·
environment · page N of M), status / severity / priority indicators that stay readable in black and white, repeated
table headers, page breaks per defect, screenshot captions, a PDF document outline (bookmarks) and PDF metadata
(title, author, subject, keywords, creator, creation date = end of the run). Output is deterministic: the same run gives
the same HTML. Credential values referenced by the run (`valueEnv`) are checked to be absent from every HTML and PDF
written (`*_verified` in the result).

## Shared reporting layer (`--report <dir-or-prefix>`)
dcore-report is the ONE reporting layer for every workflow; no module renders documents itself. Add
`--report <dir-or-prefix>` to any of: dcore-qa (`--plan`, `--scenarios`), dcore-browse, dcore-api, dcore-run,
dcore-verify, dcore-git, dcore-release, dcore-explore, dcore-chain, dcore-debug, dcore-qa text mode, or a plain-English
request (routing). The result is normalised once (`exec/reporting.mjs`) and the three PDFs are written:
- a path ending in `/` (or an existing directory) is the output directory; otherwise its last segment is the file
  prefix (`--report reports/nightly` -> `reports/nightly.Detailed-Test-Report.pdf`, ...). `--report <file.md>` keeps the
  Markdown evidence report.
- execution evidence becomes test cases (`<MODULE>-NNN`, e.g. `API-001`, `BROWSE-001`; dcore-browse case markers keep
  their own IDs); dcore-qa runs are reported with exactly their own run, scenario, defect and evidence IDs.
- a run that stopped half way is a **partial** report: the failing step is FAIL, later steps SKIPPED, and the final
  status says `PARTIAL RUN: execution stopped early ...`. A refused or impossible run is **BLOCKED** ("BLOCKED — n of m
  case(s) blocked; nothing was executed to a verdict"), never failed or passed. Reasoning output (route, chain, debug)
  is a plan: every case is NOT_TESTED.
- with no defects the defect report states **"No defects identified during this test run."** (no empty table).
- before printing, the three documents are cross-checked: same run ID, every test case, defect and evidence ID present
  where it must be (`consistency` in the result). Reporting never changes the run's own result or exit code.

## Example
```
node scripts/dcore.mjs dcore-report --run .dcore/evidence/run3/run-20261003T143826-48afe0.scenario-run.json --meta '{"build":"2026.10.3-rc1","application":"Admin portal"}' --out .dcore/evidence/run3/docs
node scripts/dcore.mjs dcore-api --url https://staging.example.test/health --expect-status 200 --report .dcore/reports/health
node scripts/dcore.mjs "test the login page https://staging.example.test end to end" --report .dcore/reports/plan/
node scripts/dcore.mjs dcore-report "Document the staging regression run."
```

## Tests
bench/test/dcore-report-m43.test.ts (fixture-based: PDF creation, sections in the PDF outline, metadata, defect and
test-case fields, evidence linkage, secret absence, deterministic output); bench/test/dcore-report-integration-m44.test.ts
(every workflow through the shared layer: PASS, partial FAIL, BLOCKED, NOT_TESTED plans, dcore-qa ID identity, Markdown
compatibility).
