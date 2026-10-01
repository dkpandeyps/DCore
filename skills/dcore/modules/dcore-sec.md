# DCore · dcore-sec — Security Review

- **module_id:** dcore-sec
- **status:** IMPLEMENTED
- **purpose:** threat-model a change (assets, surface, STRIDE-style checks, findings, residual risk)
- **inputs:** a change/feature/design description (positional, --input, stdin, or a dcore handoff)
- **outputs:** objective, assets, threat_surface, checks (STRIDE), findings, recommendations, residual_risk
- **permissions:** read-only
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** none (complements dcore-review — line-level code findings — at the change/design level)
- **failure_behavior:** fail-closed; residual_risk stays UNKNOWN (not-cleared) until every checklist item is verified
- **runnable:** true

## How Claude uses this module
Describe the change or design. The module enumerates the likely threat surface from keywords (untrusted input,
auth, data store, network/SSRF, secrets/crypto, filesystem, dependencies), emits a STRIDE checklist (unchecked =
fail-closed), and flags high/medium concerns in the text. Distinct from dcore-review: this reasons about the change
and trust boundaries, not individual code lines. Treat residual risk as not-cleared until each item is verified.

## Example
```
node scripts/dcore.mjs dcore-sec "Add an endpoint that accepts a file upload and stores it, keyed by a user token."
```

## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
