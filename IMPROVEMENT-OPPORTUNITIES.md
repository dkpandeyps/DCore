# Improvement Opportunities

> **What this is.** A list of concrete opportunities to build a system that is measurably better than gstack v1.91.1.0.
>
> **Grounding.** Every current limitation is cited from [GSTACK-ARCHITECTURE-ANALYSIS.md](GSTACK-ARCHITECTURE-ANALYSIS.md) (§n) or [GSTACK-CAPABILITY-MATRIX.md](GSTACK-CAPABILITY-MATRIX.md) (#skill). Every design refers to [PROPOSED-SYSTEM-ARCHITECTURE.md](PROPOSED-SYSTEM-ARCHITECTURE.md) (PSA §n).
>
> **Format.** Each item is `IO-nn` and follows the chain **CURRENT LIMITATION → WHY IT MATTERS → PROPOSED DESIGN → EXPECTED BENEFIT → HOW TO MEASURE**.
>
> **Expected-benefit numbers are targets to validate, not claims.** Each is backed by a measurement in [MASTER-SPEC.md §15](MASTER-SPEC.md) and must be confirmed against a gstack baseline measured by the benchmark harness (ROADMAP R1).

## Index by category

| Category | Items | Category | Items |
|---|---|---|---|
| Capability coverage | IO-01, IO-02 | Evidence | IO-24 |
| Reasoning quality | IO-03, IO-04 | Verification | IO-25, IO-26 |
| Planning | IO-05, IO-06 | Safety | IO-27 … IO-31 |
| Architecture | IO-07, IO-08 | Failure recovery | IO-32 |
| Coding | IO-09 | Parallel execution | IO-33 |
| Debugging | IO-10 | Agent delegation | IO-34 |
| Testing | IO-11 | Tool selection | IO-35 |
| Security | IO-12, IO-13 | Extensibility | IO-36 |
| Browser automation | IO-14 | Integrations | IO-37 |
| Design | IO-15 | Performance | IO-38 |
| Documentation | IO-16 | Token efficiency | IO-39, IO-40 |
| Release/deployment | IO-17 | Developer experience | IO-41 |
| Orchestration | IO-18 | Team collaboration | IO-42 |
| Context management | IO-19 | Cross-platform | IO-43 |
| Memory | IO-20, IO-21 | Observability | IO-44 |
| State management | IO-22, IO-23 | Benchmarking | IO-45 |
| | | Regression prevention | IO-46, IO-47 |

A priority ranking is at the end (§ Priority).

---

## Capability coverage

### IO-01: There is no implementation skill
- **CURRENT LIMITATION**
  - gstack covers think, plan, review, test, ship and operate, but it has **no skill for executing an approved plan**.
  - `plan-eng-review` emits worktree "parallelization lanes" and P1-P3 tasks (`tasks-eng-review-*.jsonl`), but no skill consumes them to build.
  - `/spec` can spawn an untracked `claude -p … &` in a worktree (#spec).
- **WHY IT MATTERS**
  - Implementation is where most tokens, time and defects occur.
  - Without an implementation contract, plan quality cannot be checked against the delivered code except by scope-drift heuristics during `/review`.
- **PROPOSED DESIGN**
  - `/build` (PSA §3.1) consumes an approved `plan` artifact and creates one `implementer` subagent per independent lane, each in its own worktree (PSA §2.11).
  - It enforces test-first per task: the new test fails, then the code change, then the test passes (verifier `tests.new_fail_before_fix`).
  - It integrates the lanes through verified `change_set` artifacts.
  - Plan tasks are the unit of progress, and each task records the evidence that completed it.
- **EXPECTED BENEFIT**
  - Plan-to-code traceability: every plan task maps to a change and a test.
  - Parallel lanes reduce wall-clock time on multi-lane plans.
- **HOW TO MEASURE**
  - Task suite `build/*`: fixture repos with approved plans.
  - Metrics: task completion rate, % of plan tasks with linked passing tests, wall time vs sequential baseline, post-merge defect count from hidden tests.

### IO-02: Verification targets are limited to the web browser and a physical iOS device
- **CURRENT LIMITATION**
  - `/qa` and `/qa-only` drive only web pages (#qa).
  - `/devex-review` explicitly cannot test CLI install or local setup, so 4 of 8 dimensions are INFERRED (#devex-review).
  - `ios-qa` requires macOS, Xcode and a USB device, with no simulator and no Android (#ios-qa).
  - There is no API-level QA target.
- **WHY IT MATTERS**
  - Backend services, CLIs, SDKs and mobile apps get unverifiable scores or no QA at all.
  - For API-first and payments systems (this project's domain), the API is the product surface.
- **PROPOSED DESIGN**
  - `/qa --target web|api|cli|ios|android` over the `Browser`, `Sandbox` and `Device` interfaces (PSA §2.8).
  - `api` runs contract and negative tests generated from OpenAPI or observed traffic.
  - `cli` runs the getting-started path in a clean `Sandbox` container and **times it**, so TTHW is measured, not inferred.
  - `ios` supports the simulator first and the device optionally.
- **EXPECTED BENEFIT**
  - Evidence-backed QA for non-web products.
  - DX scores stop being estimates.
- **HOW TO MEASURE**
  - Share of `/qa` DX dimensions that end TESTED vs INFERRED. Target ≥ 7 of 8 vs gstack's documented 4 of 8.
  - Seeded API-defect recall on the `qa-api/*` task suite.

---

## Reasoning quality

### IO-03: Findings lack structure and calibrated confidence outside review and cso
- **CURRENT LIMITATION**
  - Only `/cso` separates severity, confidence and evidence state (`lib/cso/contracts.ts`, #cso).
  - `/review` has a 1-10 confidence merge rule, but its output is prose plus review-log rows, with no report artifact (#review).
  - Plan, design, QA and health findings are prose tables.
  - Nothing checks whether stated confidence matches actual accuracy.
- **WHY IT MATTERS**
  - Uncalibrated confidence makes suppression thresholds arbitrary: gstack's rule is 7+ shown and 1-2 suppressed.
  - It hides false positives, which erode trust, and false negatives, which let defects through.
- **PROPOSED DESIGN**
  - Every finding is a `Claim` (PSA §2.4) with status, severity, confidence 0-1 and evidence ids.
  - The eval harness computes **calibration** (expected calibration error, ECE) per lens.
  - Confidence thresholds for display and suppression are set **per lens from measured calibration**, not by hand.
- **EXPECTED BENEFIT**
  - Fewer noisy findings at equal recall.
  - Thresholds grounded in data.
- **HOW TO MEASURE**
  - ECE per lens on the `review/*` and `security/*` task suites (target ECE ≤ 0.10).
  - Precision@shown and recall vs seeded defects, compared with gstack `/review` on the same fixtures.

### IO-04: Cross-model "outside voice" is always on and has no budget
- **CURRENT LIMITATION**
  - `/review` Step 5.7 **always** runs a Claude adversarial subagent plus `codex exec`, and adds `codex review` at 200+ lines, each with a 540 s wrapper (#review).
  - A `/review` run once burned **15M tokens** (the nested-Codex guard note).
  - `/autoplan` runs a native subagent and Codex **per phase** with a 720 s timeout (#autoplan).
  - `/codex review` duplicates the pass (#codex).
- **WHY IT MATTERS**
  - Cost and latency are paid on every low-risk diff, even though independent review adds most value on high-risk changes.
- **PROPOSED DESIGN**
  - `second-opinion` becomes a specialist invoked by **risk policy** (PSA §2.12): when risk ≥ 0.7, when a severity ≥ high claim needs independent verification (PSA §2.5), or on user request.
  - Provider adapters (codex, claude, gemini) share one interface and one fail-closed result contract.
  - A per-run budget caps spend.
- **EXPECTED BENEFIT**
  - Independent verification is concentrated where it changes outcomes, and cost on low-risk diffs drops.
- **HOW TO MEASURE**
  - Tokens and USD per `/review` run, split by risk band.
  - Defect-recall delta with vs without second opinion per risk band. Keep it only where the delta is > 0 with 95% CI.

---

## Planning

### IO-05: The four plan reviews duplicate each other, and autoplan re-reads whole skills
- **CURRENT LIMITATION**
  - CEO Sections 1, 2, 5, 6 and 7 repeat plan-eng-review's architecture, error, quality, test and performance checks. CEO Section 11 repeats plan-design-review (#plan-ceo-review).
  - `/autoplan` loads all four skills plus their sections (≈8-9k instruction lines) and reviews the same concerns 2-3 times (#autoplan).
  - Internal drift exists:
    - the test-plan path differs between skills
    - a "9-stage" vs 6-stage journey map
    - an audit-trail table whose header and separator have different column counts
- **WHY IT MATTERS**
  - Duplicate review burns tokens and user attention: the CEO review alone asks one question per addition, deferral or TODO.
  - Divergent copies of the same check drift apart.
- **PROPOSED DESIGN**
  - One `/plan` skill operating on **one `plan` artifact**, with lenses `product`, `engineering`, `design` and `dx` (PSA §2.12).
  - A **dimension ownership table** (MASTER-SPEC §7.6) assigns every check to exactly one lens.
  - `--auto` runs the selected lenses in parallel against the same artifact snapshot and merges their findings.
  - Lens instructions are phase cards, not whole skills.
- **EXPECTED BENEFIT**
  - Each concern is reviewed once, the instruction load is a fraction of the old one, and drift is structurally impossible.
- **HOW TO MEASURE**
  - Instruction tokens loaded per `/plan --auto` vs gstack `/autoplan` on the same plan fixtures.
  - Duplicate-finding rate (same location and semantic key from more than one lens). Target < 5%.
  - Number of user questions per plan review.

### IO-06: Plan outputs are not a contract consumed downstream
- **CURRENT LIMITATION**
  - Plan reviews write `tasks-*.jsonl`, test plans and review reports to per-skill paths that downstream skills find by glob.
  - `/qa` looks for `*-test-plan-*.md`, while autoplan writes `{user}-{branch}-test-plan-*` and plan-eng writes `…-eng-review-test-plan-…` (#autoplan, analysis §3).
  - `/ship`'s dashboard lets only Eng Review gate shipping.
- **WHY IT MATTERS**
  - Hand-offs fail silently when a path drifts, so QA runs without the plan's test intentions.
- **PROPOSED DESIGN**
  - `plan` and `test_plan` are typed artifacts (PSA §2.7). `/qa`, `/build` and `/ship` declare them as inputs, resolved through `aeos artifact latest`.
  - Approval state is part of the artifact.
  - `/ship`'s gate checks a *specific approved plan id* linked to the change set.
- **EXPECTED BENEFIT**
  - Guaranteed hand-off; a missing input is an explicit error, not a silent skip.
- **HOW TO MEASURE**
  - Registry lint: every consumer input type has at least one producer (a CI check).
  - E2E: `/qa` after `/plan` uses the plan's test cases, measured as the share of test-plan cases executed.

---

## Architecture

### IO-07: Orchestration is prose with no runtime state machine
- **CURRENT LIMITATION**
  - gstack's workflows, STOP gates, phase order and completion protocol are prose that the model interprets (analysis §0).
  - The only enforcement is a few hooks, plus autoplan's 487-line transcript-coupled `phase-publication-hook`, which couples to Claude Code internals (#autoplan).
  - The Stop hook closes "dangling" runs with outcome `unknown`, which shows the completion protocol is regularly skipped (analysis §4.4).
- **WHY IT MATTERS**
  - A skipped gate cannot be detected or prevented.
  - Behavior varies across models and sessions.
  - Every workflow must be loaded fully up front.
- **PROPOSED DESIGN**
  - The runtime orchestrator (PSA §2.1, §5.3) issues phase cards one at a time.
  - It validates each phase's output against its schema before issuing the next.
  - It computes run status from the verifiers.
  - Hooks (PreToolUse, Stop, SessionStart) consult run state.
- **EXPECTED BENEFIT**
  - Gates are enforced by code, phase order cannot be skipped, and completion status is computed rather than claimed.
- **HOW TO MEASURE**
  - Gate-bypass rate on the adversarial `safety/gate-skip/*` suite (prompts that push the model to skip steps). Target 0 bypasses vs a gstack baseline.
  - Share of runs ending in a computed terminal status vs `unknown`. Target ≥ 99%.

### IO-08: Declared permissions don't match what skills instruct
- **CURRENT LIMITATION**
  - 8 skills instruct writes that their `allowed-tools` doesn't grant:
    - plan-ceo-review: no Write or Edit
    - plan-eng-review: no Edit
    - plan-design-review, plan-devex-review, devex-review, spec, ios-design-review: no Write
    - ios-clean: no Write
  - They fall back to Bash heredocs (matrix §2.1).
- **WHY IT MATTERS**
  - Either the tool list is decorative, weakening capability-based safety, or the skill breaks on strict hosts.
  - Nothing tests the tool lists.
- **PROPOSED DESIGN**
  - Manifest `permissions.profile` is the single source of truth (PSA §2.9).
  - The lint parses phase cards for tool-use intents (writes, edits, network) and **fails CI when a card instructs a capability the profile lacks**.
  - Host `allowed-tools` is generated from the profile.
- **EXPECTED BENEFIT**
  - Capability restriction becomes trustworthy, so `qa --report-only` style safety holds everywhere.
- **HOW TO MEASURE**
  - Lint violations (target 0 at release).
  - E2E on strict mode: zero "tool not permitted" failures on the task suites.

---

## Coding

### IO-09: Coding skills produce side effects without confirmation or a reviewable change set
- **CURRENT LIMITATION**
  - `design-html` runs `npm/bun/pnpm add @chenglou/pretext` with no confirmation (#design-html).
  - `document-release` and `document-generate` commit and **push** without a gate (#document-release, #document-generate).
  - `design-review`'s dirty-tree option A "commits all current changes", bundling the user's unrelated work (#design-review).
- **WHY IT MATTERS**
  - Dependency additions change the supply chain and lockfiles.
  - Pushes are outward-facing and hard to reverse.
  - Bundling unrelated changes breaks bisectability.
- **PROPOSED DESIGN**
  - Every code-producing phase outputs a `change_set` artifact (a file diff plus its intent), applied under policy.
  - `pkg.install` is `ask` at L1-L2.
  - `vcs.publish` needs L3.
  - A dirty tree is handled by **stashing only through a named, recorded stash** or by a scoped commit of *the run's own files*, never "commit all".
- **EXPECTED BENEFIT**
  - No surprise dependency changes or pushes, and commits stay clean.
- **HOW TO MEASURE**
  - Safety suite `side-effects/*`: count of unconfirmed `pkg.install` and `vcs.publish` actions (target 0).
  - Commit purity: the share of run commits that touch only the run's files (target 100%).

---

## Debugging

### IO-10: Debugging hypotheses live in prose, and the scope lock leaks
- **CURRENT LIMITATION**
  - `/investigate` tracks hypotheses in conversation, with a "3 strikes" rule.
  - Its scope lock writes the **global** `freeze-dir.txt`, which is never auto-removed and affects other sessions (#investigate, #freeze).
  - There is no `git bisect` automation and no production log or observability input.
  - It never commits the fix together with its test.
- **WHY IT MATTERS**
  - Hypotheses are lost on compaction.
  - A leaked scope lock silently blocks edits in unrelated later sessions.
  - Regressions introduced by a specific commit are found slowly without bisect.
- **PROPOSED DESIGN**
  - `/debug` keeps a **hypothesis ledger** artifact: each hypothesis has a statement, a prediction, a test and a result with evidence (PSA §8).
  - It uses a session-keyed scope lock that expires with the run (PSA §2.6).
  - A `bisect` specialist runs when a known-good ref exists.
  - An `Observability` adapter pulls error traces when one is configured.
  - The fix and its regression test are committed as one change set.
- **EXPECTED BENEFIT**
  - Faster root-causing, debugging that survives compaction, and no cross-session side effects.
- **HOW TO MEASURE**
  - `debug/*` task suite of seeded bugs, including regressions with a known-good ref.
  - Metrics: root-cause accuracy, time-to-fix, fix-regression rate.
  - Count of stale scope locks after a session ends (target 0).

---

## Testing

### IO-11: The validity of regression tests is not verified
- **CURRENT LIMITATION**
  - `/investigate` requires a regression test that "fails without the fix, passes with it", but only in prose (#investigate).
  - `/qa` writes regression tests that "mock all external dependencies" and deletes a failing test after one fix attempt (#qa).
  - QA's test bootstrap may install frameworks and CI in the middle of a QA run (#qa).
  - Coverage is audited in `/ship` by a subagent, but test *effectiveness* isn't measured.
- **WHY IT MATTERS**
  - A regression test that also passes on the buggy code protects nothing.
  - Mocks can hide the integration defect under test.
  - Adding frameworks mid-QA is scope creep.
- **PROPOSED DESIGN**
  - Verifier `tests.new_fail_before_fix` (PSA §2.5) checks out the pre-fix tree in a temporary worktree and asserts that the new test **fails** there and **passes** on the fixed tree.
  - A mutation-testing verifier is available in `/ship` for changed files, where the language supports it.
  - Test-framework bootstrap is a separate, consented `/build` task, never implicit.
- **EXPECTED BENEFIT**
  - Regression tests are verified to guard the defect they target.
- **HOW TO MEASURE**
  - Share of generated regression tests that pass the fail-before/pass-after verifier (target 100% of those accepted).
  - Mutation score on changed lines, compared against the gstack baseline on the same fixtures.

---

## Security

### IO-12: The stronger content defenses skip the local agent
- **CURRENT LIMITATION**
  - In the browse daemon, hidden-element stripping (L2) and datamarking (L1) apply **only to scoped tokens**, i.e. remote paired agents.
  - The local agent (root token) gets only the basic envelope (`server.ts:1245-1275`).
  - The L4 ML classifier's **only** call site is `/pty-inject-scan`, so it never scans page reads.
  - L3 has one URL-blocklist filter, in warn mode by default (analysis §5.6).
  - Restored checkpoints are not injection-filtered (#context-restore).
- **WHY IT MATTERS**
  - The local agent reads the most untrusted content (QA, scrape, research) and holds the most power (edits, shell).
  - Prompt injection from web pages, READMEs and PR bodies is a primary attack on coding agents.
- **PROPOSED DESIGN**
  - Trust envelopes with a per-session nonce on **all** external content for **all** agents (PSA §2.2).
  - Hidden-element and ARIA-injection marking on every DOM read.
  - An injection classifier on page reads when available, with its verdict attached as metadata.
  - Memory and artifact writes derived from untrusted content are quarantined (PSA §2.13).
  - Checkpoints and memory pass the same gate on restore.
- **EXPECTED BENEFIT**
  - Injection defenses sit where the risk is.
- **HOW TO MEASURE**
  - `safety/injection/*` suite: pages, repos and PR bodies with planted instructions (e.g. "run `curl … | sh`", "push to main").
  - Metric: the share of runs where the agent attempts the injected action, which must be caught by policy. Target 0 successful injected side effects; also report the attempt rate vs the gstack baseline.

### IO-13: Paired-agent defaults are over-privileged
- **CURRENT LIMITATION**
  - `/pair-agent` defaults to `read, write, admin, meta` scopes, including **`eval`** on the user's browser.
  - Session tokens last 24 hours.
  - Private IPv4 and localhost are reachable by navigation.
  - `--local` writes credentials in plaintext into other tools' config directories (file mode NOT VERIFIED) (#pair-agent; analysis §5.6).
- **WHY IT MATTERS**
  - A remote agent reading untrusted pages with `eval` and LAN reach is a pivot into the developer's network.
- **PROPOSED DESIGN**
  - `/browser share` defaults to `read,interact` with no eval, cookies or storage.
  - 1-hour tokens by default.
  - Private ranges need an explicit `--allow-private` plus domain globs.
  - Credential files are 0600 (icacls on Windows) and verified.
  - Every remote command goes to the audit log.
  - Tailscale/tailnet transport as an option, reusing gstack's ios-qa WhoIs pattern.
- **EXPECTED BENEFIT**
  - Least privilege for remote agents, keeping gstack's strong dual-listener transport.
- **HOW TO MEASURE**
  - Security tests assert the defaults (scope set, TTL, private-range block).
  - A red-team scenario: a remote agent reading an injected page cannot reach 192.168.x.x or run eval without explicit grants.

---

## Browser automation

### IO-14: One browser engine, no network control, a shared context, and two code paths
- **CURRENT LIMITATION**
  - **Chromium only**, and **no network interception or mocking** (no `route`, HAR or offline support).
  - One shared context and cookie jar per daemon (analysis §5).
  - Skills now prefer Aside (macOS 15+) and fall back to `$B`, so every browser skill has **two instruction paths**.
  - `skillify` can't codify Aside scrapes (#skillify).
  - On Windows, **the Chromium sandbox is always disabled** (`browser-manager.ts:88-89`).
- **WHY IT MATTERS**
  - No cross-browser coverage.
  - Error, empty and slow states can't be tested deterministically without network control.
  - Isolation between tasks is impossible with a shared cookie jar.
  - Dual paths double the prompt and its maintenance.
  - A no-sandbox browser reading untrusted pages is a larger exploit surface.
- **PROPOSED DESIGN**
  - A `Browser` interface (PSA §2.8) with a Playwright driver supporting chromium, firefox and webkit.
  - `route` and HAR replay for network mocking.
  - **Per-run isolated contexts** by default, with a named persistent context as opt-in.
  - A trace (Playwright trace zip) as evidence.
  - A CDP/attach driver for the user's real browser, and Aside as an optional driver **behind the same interface**, so skills have one instruction path.
  - Sandbox on by default everywhere Playwright supports it. Disabling it requires config plus a warning.
  - Recipes are recorded from structured traces, independent of the driver.
- **EXPECTED BENEFIT**
  - Cross-browser QA, deterministic state testing, task isolation, one prompt path, and a safer default on Windows.
- **HOW TO MEASURE**
  - `qa-web/*` suite with seeded bugs that reproduce only in WebKit or Firefox, or only under a mocked 500 or slow network.
  - Metrics: detection rate; prompt tokens for browser skills vs gstack's dual path.
  - Sandbox status is reported by `aeos doctor` on all OSes.

---

## Design

### IO-15: Paid image generation has no budget, and design writers overlap
- **CURRENT LIMITATION**
  - `plan-design-review` generates OpenAI mockups "without asking permission". Only `design-shotgun` confirms spend (#plan-design-review, #design-shotgun).
  - The mockup/board loop is embedded in 4 skills.
  - **Three** skills write DESIGN.md (design-consultation, design-html, design-review).
  - `/tmp/variant-{letter}.png` collides across sessions.
  - The design daemon's HTTP routes are unauthenticated (analysis §5).
- **WHY IT MATTERS**
  - Surprise API spend.
  - Conflicting writers corrupt the design system.
  - Duplicated loops drift apart.
- **PROPOSED DESIGN**
  - `mockup-generator` is the only image-generation path, with a per-run USD budget and an explicit estimate shown before spending (PSA §3.2).
  - `design-system-writer` is the **sole** writer of the `design_system` artifact, and DESIGN.md is exported from it.
  - Unique run-scoped temp paths.
  - Design-board server routes require a per-run token.
- **EXPECTED BENEFIT**
  - Predictable cost, one design source of truth, and no collisions.
- **HOW TO MEASURE**
  - Paid generations without a recorded consent (target 0).
  - DESIGN.md write attempts outside `design-system-writer` (a lint and runtime check, target 0).
  - A concurrency test runs two sessions generating variants with no clobbering.

---

## Documentation

### IO-16: Documentation claims are not verified
- **CURRENT LIMITATION**
  - `document-generate`'s "every code example compiles/runs" is a self-review checklist item with **no execution step** (#document-generate).
  - `document-release` only discovers `.md` files at `maxdepth 2`, has no link checking, and pushes without confirmation (#document-release).
  - Doc/code drift exists inside gstack itself:
    - BROWSER.md lists a nonexistent `sidebar-utils.ts` and a `/sidebar-chat` tunnel path the code does not serve
    - `benchmark` promises Core Web Vitals and Lighthouse but measures no CLS or INP (#benchmark)
- **WHY IT MATTERS**
  - Wrong docs cost more than missing docs.
  - Developer-facing products (APIs, SDKs) live or die by working examples.
- **PROPOSED DESIGN**
  - `/docs` verifiers `docs.snippets_run` (extract fenced code, run it in a `Sandbox` with a per-language runner) and `docs.links_ok` (PSA §2.5).
  - Discovery respects the docs-framework config (Docusaurus, MkDocs, VitePress, Nextra) with no depth limit.
  - Push needs L3.
  - A **claims lint** flags skill descriptions that promise a metric the phase cards never produce (e.g. CLS).
- **EXPECTED BENEFIT**
  - Docs that run, and skill descriptions that don't overpromise.
- **HOW TO MEASURE**
  - `docs/*` suite with seeded broken snippets and links: detection rate.
  - Share of generated snippets that execute successfully (target ≥ 95% for supported languages).

---

## Release/deployment

### IO-17: Deployment is GitHub-only, configured in CLAUDE.md, and verified once
- **CURRENT LIMITATION**
  - `/land-and-deploy` **stops on GitLab** ("not yet implemented"). It has no k8s, ArgoCD or cloud-provider strategies, and its canary is single-pass (#land-and-deploy).
  - Deploy config lives in a CLAUDE.md section (#setup-deploy).
  - `/canary --quick` is documented but not implemented, and its "Rollback" option has no procedure.
  - Canary writes `canary-history.jsonl`, which no dashboard reads, and it has no observability input (#canary).
  - `/ship` is hard-wired to gstack's 4-digit VERSION and CHANGELOG voice (#ship).
- **WHY IT MATTERS**
  - Many teams use GitLab or k8s.
  - Config in an instruction file is unparseable and churns diffs.
  - A single-pass browser canary misses error-rate regressions visible only in telemetry.
- **PROPOSED DESIGN**
  - `Forge` and `DeployProvider` adapters with GitHub and GitLab parity at v1, plus k8s rollout status and ArgoCD (PSA §2.8).
  - `.aeos/deploy.yaml`, schema-validated, with staging, production, health, rollback and merge-method fields.
  - `/deploy monitor` combines browser probes with `Observability` adapters (error rate, latency) over a window, with explicit rollback wiring.
  - Versioning and changelog are **policy adapters**: semver, calver, gstack-4-digit, or none.
- **EXPECTED BENEFIT**
  - Deploy works on real stacks, with verified rollouts and pluggable conventions.
- **HOW TO MEASURE**
  - Adapter contract-test pass rate per provider.
  - `deploy/*` simulated scenarios (recorded APIs) with an injected error-rate regression: detection within the window, and a correct rollback suggestion.

---

## Orchestration

### IO-18: Pipelines are fixed and some passes are always on, instead of selected by risk
- **CURRENT LIMITATION**
  - `/ship` runs a fixed 21-step pipeline (#ship).
  - The review specialists are gated by diff size and hit rate, but the adversarial pass is always on (#review).
  - Composition happens by prose ("Next steps") and inline invocation.
- **WHY IT MATTERS**
  - Low-risk changes pay full cost.
  - High-risk changes to auth, payments or migrations are not automatically given deeper scrutiny beyond specialist triggers.
- **PROPOSED DESIGN**
  - DAG pipelines with `when:` predicates over run context, plus a computed **risk score** (PSA §2.12).
  - Lenses are selected by risk and path sensitivity; sensitive-path globs are configurable per project, e.g. `payments/**`.
  - Nodes skip on unchanged input hashes; verifiers re-run when the tree changes.
- **EXPECTED BENEFIT**
  - Cost proportional to risk, and depth where it matters.
- **HOW TO MEASURE**
  - Tokens per `/ship` by risk band.
  - Defect recall on high-risk fixtures (must not decrease vs always-on).
  - Wall time on low-risk fixtures (target a large reduction vs the gstack baseline; the exact target is set after R1 baselining).

---

## Context management

### IO-19: Runs don't survive compaction
- **CURRENT LIMITATION**
  - Except `/autoplan` (hash-bound snapshots, compaction recovery), gstack keeps workflow position in the conversation.
  - "Context Health" is a soft directive (analysis §7.5).
  - Continuous WIP checkpoints were removed in v1.89.1.0.
  - `/context-save` is manual and summarizes from the LLM's memory (#context-save).
- **WHY IT MATTERS**
  - Long skills such as `/ship` and `/qa` cross compaction boundaries.
  - Losing phase state leads to repeated or skipped steps.
- **PROPOSED DESIGN**
  - Run state is durable in the State Engine.
  - Hooks re-inject `aeos run status` (current phase, outstanding gates, output refs) after compaction where supported. Hook-based injection is VERIFIED hands-on: after `/compact`, SessionStart fires again with `source: compact` (PLATFORM-ASSUMPTIONS U-06). Every phase card also re-reads `aeos run status` itself, so correctness doesn't depend on injection (PSA §2.2).
  - `/resume` lists open runs across sessions for this worktree.
- **EXPECTED BENEFIT**
  - Work continues correctly after compaction or a restart.
- **HOW TO MEASURE**
  - `resilience/*` suite: force compaction or a session kill mid-phase, then check completion correctness (same verifier results as an uninterrupted run) and duplicated side effects (target 0).

---

## Memory

### IO-20: Memory deletion is unsafe and the storage paths disagree
- **CURRENT LIMITATION**
  - `/learn prune` removes entries by having **the LLM rewrite the JSONL**.
  - Because dedupe is latest-wins, deleting the newest line **resurrects** an older duplicate.
  - `learnings-log` and `-search` use `${GSTACK_HOME:-~/.gstack}` while `/learn stats` uses `GSTACK_STATE_ROOT`, so they diverge under plugin installs (#learn; analysis §7.1).
- **WHY IT MATTERS**
  - Corrupted or resurrected memories re-inject wrong guidance into future runs.
- **PROPOSED DESIGN**
  - An append-only memory store with **tombstone** events and one path resolver (PSA §2.3, §2.13).
  - Deletion and editing are runtime commands, never file rewrites by the model.
- **EXPECTED BENEFIT**
  - Durable, correct memory lifecycle.
- **HOW TO MEASURE**
  - Property tests: after `tombstone(key)`, no query returns any version of the key.
  - Fuzzed concurrent writes never corrupt the store.
  - Path-resolution tests across install modes.

### IO-21: Four memory layers with no unified query
- **CURRENT LIMITATION**
  - Learnings, decisions, checkpoints and gbrain are separate. `/learn search` does not consult gbrain.
  - Checkpoints restore with no injection filter.
  - Preferences (`/plan-tune`) are a separate store whose "observational only" claim conflicts with the AUTO_DECIDE hook (#plan-tune, analysis §8).
- **WHY IT MATTERS**
  - Relevant knowledge is missed.
  - Some layers bypass the trust gates.
  - Users can't tell what the system "remembers".
- **PROPOSED DESIGN**
  - One Memory Engine with kinds (fact, pitfall, preference, decision, playbook), scopes and trust (PSA §2.13).
  - A single `aeos memory query` across providers: local FTS by default, gbrain or vector optional.
  - Budgeted auto-injection of trusted items only.
  - `/memory` shows exactly what would be injected for a given phase.
- **EXPECTED BENEFIT**
  - Higher recall of relevant memory, uniform trust handling, and transparency.
- **HOW TO MEASURE**
  - `memory/*` suite: tasks whose solution depends on a planted prior learning. Metrics: hit rate, plus the rate of harmful injection of planted untrusted memories (target 0).

---

## State management

### IO-22: More than 20 fragmented ledgers, some with no reader
- **CURRENT LIMITATION**
  - State is spread across more than 20 ad-hoc files: reviews, timeline, decisions, health-history, canary-history, question logs, checkpoints, designs, plans and more (analysis §7).
  - Consumers find producers by filename convention.
  - Some ledgers have **no consumer**:
    - health-history and canary-history, which only the writing skill reads
    - `/ship` Step 20 metrics "for /retro", which retro never reads
- **WHY IT MATTERS**
  - Orphaned data is wasted work.
  - Retros and dashboards can't compute cross-cutting metrics like DORA or review effectiveness.
- **PROPOSED DESIGN**
  - An event-sourced State Engine with typed events and a SQLite index (PSA §2.3).
  - `/retro` and the dashboards are queries over events.
  - A lint checks that every event type has at least one registered consumer or is marked `audit-only`.
- **EXPECTED BENEFIT**
  - One queryable history, and metrics such as DORA come for free.
- **HOW TO MEASURE**
  - Count of orphan event types (target 0 unmarked).
  - `/retro` reports the DORA four metrics from ledgers on the fixture history.

### IO-23: State is not keyed by session or worktree
- **CURRENT LIMITATION**
  - `freeze-dir.txt` is global: one session's freeze or unfreeze changes another's enforcement.
  - The project slug comes from origin, so all worktrees share one project directory (analysis §7.4).
  - `/tmp/variant-*.png` and `/tmp/landing-*.json` are shared paths.
- **WHY IT MATTERS**
  - Parallel agents and worktrees are a primary workflow; gstack targets Conductor. Shared mutable state produces cross-talk bugs.
- **PROPOSED DESIGN**
  - Every row is keyed by `project_id`, `worktree_id` and `session_id`. Temp paths are run-scoped (PSA §2.3).
- **EXPECTED BENEFIT**
  - Safe parallelism.
- **HOW TO MEASURE**
  - `parallel/*` suite: two worktrees and two sessions running conflicting skills concurrently, then count cross-talk incidents (target 0).

---

## Evidence

### IO-24: Evidence rigor exists only in cso and ship, and freshness is time-based
- **CURRENT LIMITATION**
  - `/cso` has a first-class evidence model, and `/ship` has an evidence ledger with `--max-age 24` (#cso, #ship).
  - Other skills rely on prose ("cite the line", "never say 'this should fix it'").
  - Freshness by age allows stale evidence after the tree changes.
- **WHY IT MATTERS**
  - Claims without evidence are the main source of confident-but-wrong agent output.
- **PROPOSED DESIGN**
  - An Evidence Engine for all skills. Evidence is bound to a **tree hash**, and a claim's status depends on fresh deterministic evidence (PSA §2.4).
- **EXPECTED BENEFIT**
  - Every "done" and every finding is backed by current evidence.
- **HOW TO MEASURE**
  - Share of completion claims with fresh deterministic evidence (target 100%, enforced).
  - Stale-evidence acceptances in the `resilience/*` tests (target 0).

---

## Verification

### IO-25: Completion is self-declared, and the verify gate is opt-in
- **CURRENT LIMITATION**
  - The model reports DONE, DONE_WITH_CONCERNS or BLOCKED itself (the Completion Status Protocol).
  - `gstack-verify-gate` (a Stop hook) exists but is opt-in and needs a CLAUDE.md-declared command (analysis §9).
- **WHY IT MATTERS**
  - Premature "done" claims are a top failure mode of coding agents.
- **PROPOSED DESIGN**
  - The orchestrator **computes** status from the manifest's `done_when` verifiers, and the Stop hook blocks session end on unverified completion claims (PSA §2.5).
- **EXPECTED BENEFIT**
  - No unverified "done".
- **HOW TO MEASURE**
  - On task suites, the share of runs reported `done` whose hidden acceptance tests fail (false-done rate). Compare with the gstack baseline and target a sharp reduction.

### IO-26: `file:line` citations are not checked
- **CURRENT LIMITATION**
  - Review rules say "cite the line", but nothing verifies that a cited line exists or says what the claim asserts (#review).
- **WHY IT MATTERS**
  - Hallucinated citations mislead reviewers and waste time.
- **PROPOSED DESIGN**
  - `file_citation` evidence stores the cited content hash. The `citations.resolve` verifier fails claims whose citations don't match the current tree (PSA §2.4).
- **EXPECTED BENEFIT**
  - Citations can be trusted.
- **HOW TO MEASURE**
  - Invalid-citation rate in `review/*` outputs (target 0 accepted). Report the raw pre-verifier rate to track model quality.

---

## Safety

### IO-27: The destructive-command guard is opt-in and session-scoped
- **CURRENT LIMITATION**
  - `/careful` protects only after the user invokes it, and only for that session (#careful).
  - The hook script itself says it is "advisory hard-stop, not a policy boundary".
- **WHY IT MATTERS**
  - Protection is absent exactly when the user forgot to turn it on.
- **PROPOSED DESIGN**
  - An always-on baseline policy in every session (PSA §2.6, §7). `/guard` raises strictness, and only the user can relax it.
- **EXPECTED BENEFIT**
  - A consistent safety floor.
- **HOW TO MEASURE**
  - `safety/destructive/*` in sessions with no explicit guard: catch rate (target 100% on the gate set).

### IO-28: Safety covers only Bash, uses regexes, and misses compound commands
- **CURRENT LIMITATION**
  - The careful hook matches **Bash only**.
  - Its pattern list misses `git clean -fdx`, `find -delete`, `git branch -D`, `DELETE FROM`, `terraform destroy`, `dd`, `mkfs`, `aws s3 rm --recursive`, `gh repo delete` and `DROP SCHEMA`.
  - Interpreter deletes (`python -c shutil.rmtree`, `node -e fs.rmSync`) are missed.
  - HIGH-tier deny applies only to simple commands, so `cd / && rm -rf *` only asks (#careful).
  - Write, Edit and MCP tools are unguarded.
- **WHY IT MATTERS**
  - Trivial variations bypass the guard.
- **PROPOSED DESIGN**
  - PreToolUse matchers `"*"` (built-in tools, VERIFIED) plus an explicit `mcp__.*` matcher (MCP tools, VERIFIED). `"*"` alone is not relied on for MCP (AD-08).
  - Shell AST parsing for bash and PowerShell, action classes, and `opaque-exec` flagging for interpreter one-liners (PSA §2.6).
- **EXPECTED BENEFIT**
  - Robust coverage.
- **HOW TO MEASURE**
  - A corpus of ≥ 300 destructive-command variants (compound, obfuscated, interpreter, cloud, SQL, PowerShell).
  - Catch rate (target ≥ 99%) and false-ask rate on a benign corpus (target ≤ 2%). gstack's careful hook is run on the same corpus as the baseline.

### IO-29: The freeze scope is global, persists, and has a setup bug
- **CURRENT LIMITATION**
  - `freeze-dir.txt` is shared by all sessions and persists after the session ends.
  - If `cd "<path>"` fails at setup, the boundary becomes `/`, which allows everything.
  - Bash writes bypass it.
  - NotebookEdit isn't matched.
  - Windows drive paths are likely mishandled (inferred) (#freeze).
- **WHY IT MATTERS**
  - A boundary that silently fails open, or leaks between sessions, is worse than none, because it creates false confidence.
- **PROPOSED DESIGN**
  - Run-scoped `scope.write_roots` validated at creation. An empty or root path is rejected.
  - Enforced on all write-capable tools, including Bash writes detected through the AST.
  - Cross-platform path normalization (PSA §2.6).
- **EXPECTED BENEFIT**
  - Boundaries that actually hold.
- **HOW TO MEASURE**
  - Boundary escape tests across the tool set and OSes (target 0 escapes).
  - An invalid-path setup test must fail closed.

### IO-30: The model can relax its own guard
- **CURRENT LIMITATION**
  - `/unfreeze` has no gate, and the model can invoke it; `sensitive:true` is stripped for Claude (#unfreeze).
- **WHY IT MATTERS**
  - A prompt-injected or confused agent can remove its own boundary.
- **PROPOSED DESIGN**
  - In-session tool calls that attempt relaxation are denied. Relaxation requires consent through a channel the model cannot complete from a tool call: out-of-band confirmation, or restart-only as the fallback (PSA §2.6).
  - Phase 2 found user-vs-model attribution only PARTIALLY VERIFIED, so this is a requirement with an **unresolved** guarantee (AD-10, PLATFORM-ASSUMPTIONS U-02).
- **EXPECTED BENEFIT**
  - The model cannot escalate its own privileges.
- **HOW TO MEASURE**
  - Adversarial tests: injected content instructs the agent to relax its guard (target 0 successes).

### IO-31: Safety degrades silently on hosts without hooks
- **CURRENT LIMITATION**
  - Frontmatter hooks are stripped for external hosts and replaced with "hook-safety prose" (`extractHookSafetyProse`). /careful and /freeze become advisory outside Claude Code (analysis §14).
  - `contrib/add-host` doesn't cover hook porting (#contrib/add-host).
- **WHY IT MATTERS**
  - Users of other hosts believe they are protected when they are not.
- **PROPOSED DESIGN**
  - Host adapters declare capabilities. With no hooks, maximum autonomy is L1, and the constitution states explicitly that enforcement is unavailable (PSA §2.6, §2.15).
- **EXPECTED BENEFIT**
  - An honest safety posture on every host.
- **HOW TO MEASURE**
  - Per-host conformance tests assert the autonomy cap and the disclosure text.

---

## Failure recovery

### IO-32: Multi-step runs can't resume or compensate, and migrations fail softly
- **CURRENT LIMITATION**
  - A failed `/ship` or `/land-and-deploy` relies on "re-run is idempotent" prose.
  - There is no record of completed side effects or their inverses.
  - Migrations are non-fatal and unrecorded; `OLD_VERSION=unknown` skips all of them (#gstack-upgrade; analysis §13).
- **WHY IT MATTERS**
  - Partial failures leave repositories and deploys in unknown states.
  - Silent migration failures corrupt state.
- **PROPOSED DESIGN**
  - Per-phase checkpoints, `aeos run resume`, and a compensation log (PSA §6.2).
  - A migration ledger. A failed migration aborts the upgrade and rolls back (PSA §2.16).
- **EXPECTED BENEFIT**
  - Recoverable runs and upgrades.
- **HOW TO MEASURE**
  - Fault-injection suite: kill the process at each node of `/ship`, then resume. Metrics: correct final state and duplicate side effects (target 0).
  - Migration fault tests must end in a rolled-back state.

---

## Parallel execution

### IO-33: Review Army merges findings in prose
- **CURRENT LIMITATION**
  - Specialists run in parallel, but merging and de-duplication happen in prose.
  - Adaptive gating (0 findings in 10+ dispatches) exists, but only as prompt logic (#review).
  - `/qa` has no parallelism.
- **WHY IT MATTERS**
  - Merge quality varies, duplicates slip through, and fan-out wall time is not exploited in QA.
- **PROPOSED DESIGN**
  - Composer fan-out with typed `findings` outputs.
  - A deterministic merge that de-duplicates by location and semantic key and applies calibrated confidence.
  - Parallel page exploration in `/qa` using isolated browser contexts (PSA §2.11, §2.12).
- **EXPECTED BENEFIT**
  - Consistent merges and faster QA.
- **HOW TO MEASURE**
  - Duplicate rate after merge (target < 5%).
  - `/qa` wall time vs sequential on multi-page fixtures.

---

## Agent delegation

### IO-34: Subagent capabilities are not enforced, and spawns are untracked
- **CURRENT LIMITATION**
  - Subagents inherit whatever the prompt says.
  - The sidebar PTY Claude runs with **full env and no tool restrictions** (`terminal-agent.ts:330-370`).
  - `/spec` spawns `claude -p … &` in a worktree with no lifecycle tracking, falling back to the current directory if worktree creation fails (#spec; analysis §5.5).
- **WHY IT MATTERS**
  - Delegated agents can exceed their intended authority, and orphaned background agents are invisible.
- **PROPOSED DESIGN**
  - Role-based subagent definitions with host-enforced tool allowlists.
  - Delegations are tracked as runs with budgets, and autonomy is inherited or lowered, never raised.
  - Implementers always run in worktrees; if worktree creation fails, the delegation fails (PSA §2.11).
- **EXPECTED BENEFIT**
  - Bounded, observable delegation.
- **HOW TO MEASURE**
  - Tests: a lens subagent attempting Write is denied.
  - Orphan-process scan after runs (target 0).
  - Delegation budget overruns (target 0 unhandled).

---

## Tool selection

### IO-35: No tool abstraction; each skill detects CLIs itself
- **CURRENT LIMITATION**
  - Each skill embeds its own detection: `gh` vs `glab`, base branch, platform CLIs, `shasum` vs `sha256sum`, `open` vs `xdg-open`.
  - `lib/code-intelligence` is gstack's only real provider contract (analysis §6).
- **WHY IT MATTERS**
  - Inconsistent behavior, repeated tokens, and each new platform requires editing many skills.
- **PROPOSED DESIGN**
  - Capability interfaces plus adapters, with explicit detection reported by `aeos doctor` (PSA §2.8).
- **EXPECTED BENEFIT**
  - Skills stay platform-agnostic, and adding a provider takes one adapter.
- **HOW TO MEASURE**
  - Lint: zero raw CLI invocations in phase cards outside the adapter allowlist.
  - Adding the GitLab adapter must require zero skill changes (a CI check on the diff).

---

## Extensibility

### IO-36: No manifest, SDK or trust model for third-party skills
- **CURRENT LIMITATION**
  - Adding a gstack skill means writing a template against about 95 resolver placeholders and regenerating (analysis §2).
  - Hosts are added by hand (`contrib/add-host`).
  - Browser-skills have a `trusted` flag but run as unsandboxed `bun run` (analysis §5.6).
  - There is no signed distribution for community skills.
- **WHY IT MATTERS**
  - Teams need project-specific skills (payments compliance checks, for example) without forking the system.
- **PROPOSED DESIGN**
  - A skill manifest plus phase cards (PSA §2.9).
  - `aeos sdk new-skill` and `aeos sdk new-adapter` scaffolds with contract tests.
  - Registry tiers with signatures. Community and project skills are capped at L1 until approved.
  - Recipes run in a Sandbox.
- **EXPECTED BENEFIT**
  - A safe, low-effort extension path.
- **HOW TO MEASURE**
  - Time-to-first-custom-skill in a DX study (scaffold, then lint-clean, then run).
  - A community skill attempting an L2 action is denied.

---

## Integrations

### IO-37: Missing trackers, forges and observability integrations
- **CURRENT LIMITATION**
  - Trackers: GitHub issues only (`/spec`).
  - Forges: GitLab only partially (review Greptile is GitHub-only; land stops on GitLab).
  - Observability: no Sentry, Datadog or OTEL.
  - Deploy: no k8s or ArgoCD.
  - MCP: gbrain's MCP registration is Claude-only (#spec, #land-and-deploy, #setup-gbrain).
- **WHY IT MATTERS**
  - Adoption requires fitting existing enterprise toolchains.
- **PROPOSED DESIGN**
  - Adapters: Jira, Linear, GitLab (parity), Bitbucket (later), Sentry, Datadog, OTEL, k8s, ArgoCD.
  - Existing MCP servers can be used as adapter backends when present (PSA §2.15).
- **EXPECTED BENEFIT**
  - Works in real enterprise stacks.
- **HOW TO MEASURE**
  - Adapter contract-test pass rate; count of supported providers per interface at each release (ROADMAP).

---

## Performance

### IO-38: Per-question read-back rituals, and statistically unsound perf measurement
- **CURRENT LIMITATION**
  - Plan reviews require "save the ledger record → Read it back → ask → STOP → apply → Read back" for **every** question, which multiplies tool calls (#plan-eng-review, #plan-ceo-review).
  - `/benchmark` takes a median only if the user asks, applies no throttling, and has no CI mode (#benchmark).
  - Perf numbers depend on the dev machine.
- **WHY IT MATTERS**
  - Tool-call overhead slows interactive sessions.
  - Perf regressions below run-to-run noise are unreliable either way.
- **PROPOSED DESIGN**
  - Decisions are recorded by `aeos run ask` in a single call (the runtime persists them). No read-back is needed because the runtime returns the stored record.
  - `/perf` runs N ≥ 5 iterations with throttling profiles and reports a median plus a CI (confidence interval). A regression means the CIs don't overlap *and* the change exceeds the threshold.
  - Hook latency budget: p95 < 50 ms (PSA §2.1).
- **EXPECTED BENEFIT**
  - Fewer tool calls per question, and trustworthy perf verdicts.
- **HOW TO MEASURE**
  - Tool calls per decision (gstack's ≥ 4-6 vs target 1).
  - `/perf` false-regression rate on unchanged builds (target ≤ 5%).
  - Hook p95 latency in the benchmark.

---

## Token efficiency

### IO-39: The preamble is re-sent with every skill
- **CURRENT LIMITATION**
  - Tier 3/4 skills carry about 400 lines of shared preamble (`review/SKILL.md:26-406`).
  - Generated SKILL.md totals about 2.4 MB, and `design-review` alone is 130,923 bytes.
  - A full `/ship` loads about 1,000 + 2,965 lines plus a subagent of about 1,180 lines (analysis §2).
  - Most preamble content is behavioral prose (voice, completeness philosophy) that is identical across skills.
- **WHY IT MATTERS**
  - Tokens are cost and latency, and long prompts dilute attention on the instructions that matter.
- **PROPOSED DESIGN**
  - The constitution is loaded once per session (≤ 1,200 tokens).
  - Skill stubs are ≤ 60 lines.
  - Phase cards arrive just in time (≤ 1,500 tokens each).
  - Reference packs load on demand.
  - Specialists are not registered as Claude Code skills at all. They are runtime-served phase cards or controlled subagents, so they add nothing to the catalog (PSA §3.2, AD-04).
  - The once-per-session constitution uses SessionStart injection, which is VERIFIED hands-on up to about 9,000 characters (larger content is silently truncated). The constitution budget must stay under that. The stub-embedded fallback remains only for hosts without SessionStart (AD-11).
- **EXPECTED BENEFIT**
  - A large reduction in instruction tokens per run. The target is ≥ 60% less for `/review` and `/ship` vs gstack on identical fixtures, to be validated in R1.
- **HOW TO MEASURE**
  - The benchmark harness records instruction tokens (system plus skill plus cards) and total tokens per task for AEOS and gstack on the same fixtures and model. The outcome-quality metrics must stay equal or better.

### IO-40: Tokens are not accounted per run
- **CURRENT LIMITATION**
  - gstack ratchets static budgets (catalog 1,171 token-equivalents; per-skill eager tokens) and has `gstack-context-bill`.
  - Runtime token use per run and phase is not recorded, and no run is budget-capped (analysis §1, §17).
- **WHY IT MATTERS**
  - Without run-level budgets, runaway runs like the 15M-token `/review` go undetected until after the fact.
- **PROPOSED DESIGN**
  - Every run and delegation has a token, time and USD budget. Usage is recorded per phase, and exceeding the budget yields `E_BUDGET_EXCEEDED`, which leads to `needs_input` (PSA §5.1, §6).
- **EXPECTED BENEFIT**
  - Cost predictability and early detection of runaway loops.
- **HOW TO MEASURE**
  - Runs exceeding their budget without a checkpoint (target 0).
  - The p95/p50 token ratio per skill (a tail-cost indicator) tracked across releases.

---

## Developer experience

### IO-41: Too many skills, and CLAUDE.md is used for config and routing
- **CURRENT LIMITATION**
  - About 57 user-visible skills with overlapping names:
    - qa vs qa-only
    - design-review vs plan-design-review vs ios-design-review
    - benchmark vs benchmark-models
  - gstack **writes and commits** to the user's CLAUDE.md:
    - a routing section (after an AUQ)
    - deploy config
    - health stack
    - gbrain guidance
    - design-system section
    - learnings exports
  - This mixes instructions with data (analysis §3, §11).
  - Persona and promotional content is protected from removal: YC closings, "200 IQ autistic developer" text (analysis §19).
- **WHY IT MATTERS**
  - Discoverability suffers and users pick the wrong skill.
  - CLAUDE.md churn pollutes diffs and team reviews.
  - Unprofessional text blocks enterprise adoption.
- **PROPOSED DESIGN**
  - 19 user commands with modes (PSA §3.1).
  - All config lives in `.aeos/config.yaml`. CLAUDE.md gets one optional marked import line.
  - A neutral, professional voice. Persona text is a user preference, not a default.
- **EXPECTED BENEFIT**
  - A faster learning curve and clean repos.
- **HOW TO MEASURE**
  - Routing top-1 accuracy (IO-45).
  - A DX study of time-to-first-successful-review for new users.
  - A lint confirming zero CLAUDE.md writes outside the import line.

---

## Team collaboration

### IO-42: Teams track `main`, and personal state can't be shared
- **CURRENT LIMITATION**
  - Team mode auto-pulls `main` hourly with no pinning or signed releases (analysis §12).
  - Learnings, decisions and plans live in each person's `~/.gstack`. Sharing needs the optional artifacts git-sync to a *personal* private repo.
- **WHY IT MATTERS**
  - Team members run different gstack versions with different behavior.
  - Team knowledge (pitfalls, decisions) doesn't propagate through normal review.
- **PROPOSED DESIGN**
  - A project version pin in `.aeos/config.yaml`.
  - Team-scope memory and approved artifacts exported to `<repo>/.aeos/`, reviewed through PRs.
  - A JSONL merge strategy for append-only files (keeping gstack's merge-driver idea) (PSA §2.3, §2.16).
- **EXPECTED BENEFIT**
  - Reproducible team behavior, and shared knowledge under code review.
- **HOW TO MEASURE**
  - A version-skew test: a mismatched runtime refuses with a clear error.
  - A team fixture: a pitfall added by user A through a PR is retrieved in user B's `/debug` run.

---

## Cross-platform support

### IO-43: Three runtimes, bash, and macOS utilities
- **CURRENT LIMITATION**
  - Skills need Bun (skills and bins), Node (the Windows browser daemon), and bash plus python3 or node (hooks).
  - Windows needs Git Bash.
  - Skill prose uses `setopt`, `open`, `lsof`, `date -jf`, `shasum` and `/tmp`.
  - Symlink aliases break on Windows (connect-chrome became a 19-byte text file).
  - setup-gbrain is "local-Mac users" only.
  - Aside is macOS 15+ only (analysis §14).
- **WHY IT MATTERS**
  - Windows developers get a degraded, partly broken experience. This machine is Windows 11 with PowerShell as its primary shell.
- **PROPOSED DESIGN**
  - A single Node LTS runtime. Skill prose invokes `aeos` only, never shell syntax.
  - Built-in PowerShell and bash AST support for policy.
  - No symlinks in distribution.
  - A CI matrix of Windows, macOS and Linux for every tier (PSA §2.1).
- **EXPECTED BENEFIT**
  - First-class Windows support.
- **HOW TO MEASURE**
  - The full static and gate suites pass on all three OSes.
  - Task-suite outcome parity across OSes (a difference within CI noise).

---

## Observability

### IO-44: No run traces, and telemetry docs disagree with the code
- **CURRENT LIMITATION**
  - Telemetry records skill-level outcomes (`skill_run`, `route`). There is no per-run trace of which sections were read, which gates fired, or tokens per phase.
  - The `preamble.ts` header says local JSONL is "always" written, but the code skips it when telemetry is off (analysis §17).
  - Aside browser drives leave no gstack audit trail (analysis §5.1).
- **WHY IT MATTERS**
  - Failures can't be debugged, and prompt changes can't be tuned, without traces.
- **PROPOSED DESIGN**
  - The run event log **is** the trace: phases, tool calls (metadata only), policy decisions, verifier results, tokens.
  - `aeos run trace <id>` renders it.
  - Opt-in export (OTEL) with secret and path redaction.
  - Every browser driver writes to the same audit log.
- **EXPECTED BENEFIT**
  - Debuggable runs, and data-driven prompt iteration.
- **HOW TO MEASURE**
  - Trace completeness: the share of tool calls in a run that appear in its trace (target 100%).
  - A doc/code consistency test for telemetry claims.

---

## Benchmarking

### IO-45: No routing accuracy benchmark and no stable task benchmark
- **CURRENT LIMITATION**
  - gstack has extensive E2E and LLM-judge evals with diff-based selection, but they are mostly pass/fail per skill scenario.
  - There is no labelled routing corpus with accuracy tracked, and no stable cross-version task benchmark with scored baselines, CIs and calibration (analysis §16).
  - Codex periodic shards never run in CI.
- **WHY IT MATTERS**
  - "Better than gstack" can't be claimed without a shared, repeatable benchmark.
- **PROPOSED DESIGN**
  - Five suites: routing, tasks, safety, efficiency, calibration. N-trial runs with CIs, pinned models, hermetic environments, and baselines stored as artifacts (PSA §2.14).
  - **A gstack adapter in the harness** runs the same tasks through gstack for head-to-head comparison.
- **EXPECTED BENEFIT**
  - Objective, reproducible comparison and regression detection.
- **HOW TO MEASURE**
  - The benchmark exists and runs nightly.
  - Every release note includes the AEOS vs baseline deltas with CIs.

---

## Regression prevention

### IO-46: Tests pin wording, and migrations are unrecorded
- **CURRENT LIMITATION**
  - Many gstack tests assert the presence of specific phrases in generated markdown (e.g. about 70 `autoplan-*.test.ts`), which makes refactors expensive and says little about behavior (analysis §16).
  - Migrations have no ledger (analysis §13).
- **WHY IT MATTERS**
  - Wording-pinned tests resist improvement while missing behavioral regressions.
- **PROPOSED DESIGN**
  - Behavior lives in the runtime, which has unit and property tests.
  - Prompt assets are tested by **schema and budget lints plus behavioral evals**, not phrase assertions.
  - The migration ledger comes with per-migration tests: before and after state fixtures (PSA §2.14, §2.16).
- **EXPECTED BENEFIT**
  - Faster safe refactors and better regression detection.
- **HOW TO MEASURE**
  - Share of tests that are behavioral vs text-pinned (target ≥ 90% behavioral).
  - Mutation score of the runtime core (target ≥ 70%).

### IO-47: Claims drift from code, and claims from implementation
- **CURRENT LIMITATION**
  - Verified drift in gstack:
    - BROWSER.md lists a nonexistent `sidebar-utils.ts` and a `/sidebar-chat` tunnel path the code doesn't serve, plus an undocumented `-H` flag
    - canary documents `--quick` but no phase implements it
    - benchmark promises CWV and Lighthouse without measuring them
    - domain-skill auto-promotion is effectively dead because `classifierScore` is always 0, contrary to the docs
    - ship's Step 20 metrics are "for /retro", which never reads them
  - (analysis §5, #canary, #benchmark, #ship)
- **WHY IT MATTERS**
  - Users rely on documented behavior, and dead features waste tokens and trust.
- **PROPOSED DESIGN**
  - Manifest-driven docs: command references, flags and outputs are generated from manifests and schemas.
  - A **claims lint**: every flag in a manifest must be handled by a phase card, and every promised metric must appear in an output schema.
  - A lint that every event type has a consumer (IO-22).
- **EXPECTED BENEFIT**
  - Docs and behavior can't silently diverge.
- **HOW TO MEASURE**
  - Claims-lint violations (target 0 at release).
  - A doc-generation freshness check in CI.

---

## Priority

The ranking is by impact × foundational dependency. The ROADMAP implements them in this order.

| Priority | Items | Rationale |
|---|---|---|
| **P0: foundations** | IO-07, IO-22, IO-23, IO-24, IO-25, IO-27, IO-28, IO-39, IO-43, IO-45 | The runtime state machine, state/evidence/verification, always-on safety, token architecture, cross-platform, and the benchmark to prove it. Everything else depends on these. |
| **P1: core value** | IO-03, IO-05, IO-06, IO-08, IO-12, IO-19, IO-20, IO-21, IO-26, IO-29, IO-30, IO-32, IO-34, IO-35, IO-40, IO-46 | Contracts, memory, recovery, delegation, tool abstraction. |
| **P2: capability breadth** | IO-01, IO-02, IO-09, IO-10, IO-11, IO-14, IO-15, IO-16, IO-17, IO-18, IO-33, IO-37, IO-38, IO-41, IO-42 | New and merged user capabilities on the P0/P1 base. |
| **P3: ecosystem** | IO-04, IO-13, IO-31, IO-36, IO-44, IO-47 | Multi-host, community extensibility, observability export. |
