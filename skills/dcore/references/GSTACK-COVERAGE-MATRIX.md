# DCore Capability Coverage Matrix

original DCore names only; no gstack implementation or names copied; planned/deferred are on the roadmap, not missing

| source capability | useful problem | DCore module | original name | status | permission | security | platform | tests |
|---|---|---|---|---|---|---|---|---|
| product/problem analysis | understand what to build and why | Problem Framing | dcore-frame | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| specification creation | define requirements + acceptance | Specification | dcore-spec | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| engineering planning | plan implementation safely | Engineering Plan | dcore-plan | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| code review | catch defects/security issues | Code Review | dcore-review | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| QA/test planning | verify behavior | QA / Test Plan | dcore-qa | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| debugging/investigation | find root cause | Debug / Investigation | dcore-debug | PLANNED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| security review | reduce risk | Security Review | dcore-sec | PLANNED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| documentation | explain the system | Documentation | dcore-doc | PLANNED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| release preparation | ship safely | Release Prep | dcore-release | PLANNED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |
| project retrospective | learn and improve | Retrospective | dcore-retro | DEFERRED | read-only | SAFE_GENERIC | any | bench/test/dcore-skill.test.ts |

**Totals:** total=10, implemented=5, planned=4, deferred=1, **missing useful capabilities = 0**
