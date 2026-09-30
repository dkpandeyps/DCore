# dkskill Capability Coverage Matrix

original dkskill names only; no gstack implementation or names copied; planned/deferred are on the roadmap, not missing

| source capability | useful problem | dkskill module | original name | status | permission | security | platform | tests |
|---|---|---|---|---|---|---|---|---|
| product/problem analysis | understand what to build and why | Problem Framing | dk-frame | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dkskill-skill.test.ts |
| specification creation | define requirements + acceptance | Specification | dk-spec | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dkskill-skill.test.ts |
| engineering planning | plan implementation safely | Engineering Plan | dk-plan | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dkskill-skill.test.ts |
| code review | catch defects/security issues | Code Review | dk-review | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dkskill-skill.test.ts |
| QA/test planning | verify behavior | QA / Test Plan | dk-qa | IMPLEMENTED | read-only | SAFE_GENERIC | any | bench/test/dkskill-skill.test.ts |
| debugging/investigation | find root cause | Debug / Investigation | dk-debug | PLANNED | read-only | SAFE_GENERIC | any | bench/test/dkskill-skill.test.ts |
| security review | reduce risk | Security Review | dk-sec | PLANNED | read-only | SAFE_GENERIC | any | bench/test/dkskill-skill.test.ts |
| documentation | explain the system | Documentation | dk-doc | PLANNED | read-only | SAFE_GENERIC | any | bench/test/dkskill-skill.test.ts |
| release preparation | ship safely | Release Prep | dk-release | PLANNED | read-only | SAFE_GENERIC | any | bench/test/dkskill-skill.test.ts |
| project retrospective | learn and improve | Retrospective | dk-retro | DEFERRED | read-only | SAFE_GENERIC | any | bench/test/dkskill-skill.test.ts |

**Totals:** total=10, implemented=5, planned=4, deferred=1, **missing useful capabilities = 0**
