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

## Repository scan (`--repo`)
With `--repo <path>` the module also runs a **read-only scan of the working tree** and classifies every finding:
- **CONFIRMED** — exact credential shapes (private key blocks, AWS/GitHub/Anthropic/OpenAI/Slack/Google/Stripe-live keys, JWTs).
- **SUSPICIOUS** — hardcoded secret assignments (placeholders excluded), disabled TLS verification, SQL string
  concatenation, command injection, dynamic eval, unsafe deserialization; and any credential shape inside tests/fixtures.
- **THEORETICAL** — XSS sinks, CORS wildcards, weak hashes, Math.random for secrets, path-traversal / SSRF candidates,
  sensitive values in logs (not reported for tests/docs).
Sensitive files (`.env`, keys, credential stores) are listed **by name only** and never read; excerpts are redacted.
`not_tested` lists what a literal scan cannot cover (authn/authz logic, dependency CVEs, CSRF, git history). Never
report a SUSPICIOUS/THEORETICAL item as a confirmed vulnerability; confirm it in code or against a non-production
instance first. Dependency audits run through dcore-run (e.g. `npm audit --omit=dev`).
```
node scripts/dcore.mjs dcore-sec "Release review" --repo . --json
```

## Example
```
node scripts/dcore.mjs dcore-sec "Add an endpoint that accepts a file upload and stores it, keyed by a user token."
```

## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
