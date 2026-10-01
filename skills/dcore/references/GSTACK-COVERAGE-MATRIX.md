# DCore Capability Coverage Matrix

original DCore names only; no gstack implementation or names copied; planned/deferred are on the roadmap, not missing

| source capability | useful problem | DCore module | original name | status | permission | security | platform | tests |
|---|---|---|---|---|---|---|---|---|
| product/problem analysis | understand what to build and why | Problem Framing | dcore-frame | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| specification creation | define requirements + acceptance | Specification | dcore-spec | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| engineering planning | plan implementation safely | Engineering Plan | dcore-plan | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| code review | catch defects/security issues | Code Review | dcore-review | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| QA/test planning | verify behavior | QA / Test Plan | dcore-qa | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| debugging/investigation | find root cause | Debug / Investigation | dcore-debug | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| security review | reduce risk | Security Review | dcore-sec | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| documentation | explain the system | Documentation | dcore-doc | PLANNED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| release preparation | ship safely | Release Prep | dcore-release | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| project retrospective | learn and improve | Retrospective | dcore-retro | DEFERRED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |

**Totals:** total=10, implemented=8, planned=1, deferred=1, **missing useful capabilities = 0**

## DCore-native capabilities (no direct gstack equivalent claimed)
| capability | DCore mechanism | status | notes | tests |
|---|---|---|---|---|
| module-to-module handoff | prior module `--json` piped into the next; `parseHandoff`/`runModule` carry objective + salient items, tag `handoff_from` | IMPLEMENTED | deterministic, opt-in by JSON shape; plain text unaffected | test U |
| fail-closed release gating | `dcore-release` go/no-go is NO-GO until every gate is evidenced | IMPLEMENTED | evidence ≠ proof; gates are a prompt to verify | test T |
| STRIDE threat scaffolding | `dcore-sec` unchecked checklist + residual_risk=UNKNOWN until verified | IMPLEMENTED | change/design-level, complements line-level dcore-review | test S |

> gstack is used as a capability **benchmark**, not as source. No gstack code, prompts, or branding are copied.
> "IMPLEMENTED" here means a deterministic engine + tests exist; Claude completes the specifics per the module reference.
