# DCore Capability Coverage Matrix

original DCore names only; no comparison-baseline implementation or names copied; planned/deferred are on the roadmap, not missing

| source capability | useful problem | DCore module | original name | status | permission | security | platform | tests |
|---|---|---|---|---|---|---|---|---|
| product/problem analysis | understand what to build and why | Problem Framing | dcore-frame | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| specification creation | define requirements + acceptance | Specification | dcore-spec | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| engineering planning | plan implementation safely | Engineering Plan | dcore-plan | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| code review | catch defects/security issues | Code Review | dcore-review | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| QA/test planning | verify behavior | QA / Test Plan | dcore-qa | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| debugging/investigation | find root cause | Debug / Investigation | dcore-debug | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| security review | reduce risk | Security Review | dcore-sec | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| documentation | explain the system | Documentation | dcore-doc | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| release preparation | ship safely | Release Prep | dcore-release | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| project retrospective | learn and improve | Retrospective | dcore-retro | DEFERRED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| browser automation / web QA | prove a web flow works in a real browser | Browser Execution | dcore-browse | IMPLEMENTED | network,execute-local | ENVIRONMENT_SPECIFIC | any,chromium-family browser | bench/test/dcore-skill.test.ts |
| API testing | prove an endpoint behaves as specified | API Testing | dcore-api | IMPLEMENTED | network | ENVIRONMENT_SPECIFIC | any | bench/test/dcore-skill.test.ts |
| test/lint/build execution | get real pass/fail evidence | Command Execution | dcore-run | IMPLEMENTED | execute-local | ENVIRONMENT_SPECIFIC | any | bench/test/dcore-skill.test.ts |
| code implementation | make the change, minimally | Implementation | dcore-build | IMPLEMENTED | writes-repo-files (user-requested change only) | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| test generation | lock behavior in with focused tests | Test Generation | dcore-test | IMPLEMENTED | writes-repo-files (tests only) | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| repository exploration | know how a repo builds, tests and runs | Repository Exploration | dcore-explore | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| git change management | inspect, commit and push safely | Git Change Management | dcore-git | IMPLEMENTED | read-only,git-write (approval) | ENVIRONMENT_SPECIFIC | any,git | bench/test/dcore-skill.test.ts |
| post-deploy verification | prove a deployment is healthy | Deployment Verification | dcore-verify | IMPLEMENTED | network | ENVIRONMENT_SPECIFIC | any | bench/test/dcore-skill.test.ts |

**Totals (capability-benchmark capabilities):** total=18, implemented=17, planned=0, deferred=1 (dcore-retro), **missing useful capabilities = 0**

## DCore-native capabilities (no direct comparison-baseline equivalent claimed)
| capability | DCore mechanism | status | notes | tests |
|---|---|---|---|---|
| module-to-module handoff | prior module `--json` piped into the next; `parseHandoff`/`runModule` carry objective + salient items, tag `handoff_from` | IMPLEMENTED | deterministic, opt-in by JSON shape; plain text unaffected | test U |
| composition chain | `dcore-chain` runs frame→spec→plan→qa in one call, reusing the modules + handoff (no orchestration engine) | IMPLEMENTED | thin convenience; preserves module boundaries; every stage inspectable | test W |
| documentation scaffold | `dcore-doc` marks known vs explicit `UNKNOWN`; never invents APIs/commands/config/examples | IMPLEMENTED | distinguishes inferred from unknown; composes from any dcore handoff | test V |
| fail-closed release gating | `dcore-release` go/no-go is NO-GO until every gate is evidenced | IMPLEMENTED | evidence ≠ proof; gates are a prompt to verify | test T |
| STRIDE threat scaffolding | `dcore-sec` unchecked checklist + residual_risk=UNKNOWN until verified | IMPLEMENTED | change/design-level, complements line-level dcore-review | test S |
| change-impact evidence | `dcore-impact` read-only repo scan; DIRECT/LIKELY/POSSIBLE/UNKNOWN; secret files excluded; not a dependency graph | IMPLEMENTED | M31 evidence gate passed (recurring need in change-to-existing-behavior scenarios); literal references only | test Y |
| natural-language routing | `dcore.mjs "<task>"` maps a plain-English task to an ordered workflow, marking which phases execute vs reason and which approvals may be needed | IMPLEMENTED | deterministic keyword + surface detection (URLs, API, login, production) | dcore-exec tests |
| unified evidence model | every execution module reports `dcore.evidence/1`: PASS/FAIL/BLOCKED/SKIPPED/NOT_TESTED/NOT_APPLICABLE + checks + evidence + limitations | IMPLEMENTED | "could not execute" is never PASS; secrets redacted | dcore-exec tests |
| approval gates | per-invocation `--approve <gate>` for push/commit/deploy/release/production/delete/db/external-write; force-push + history rewrite always refused | IMPLEMENTED | enforced in code, not prompts | dcore-exec tests |
| repository secret scan | `dcore-sec --repo`: CONFIRMED / SUSPICIOUS / THEORETICAL; secret files by name only | IMPLEMENTED | literal scan, honest classification | dcore-exec tests |

**Deferred (not implemented):** `dcore-retro` (retrospective).

> The comparison baseline (a third-party skill suite) is used as a capability **benchmark**, not as source. None of its code, prompts, or branding are copied.
> "IMPLEMENTED" here means a deterministic engine + tests exist; Claude completes the specifics per the module reference.
