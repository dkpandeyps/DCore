# DCore · dcore-verify — Deployment Verification

- **module_id:** dcore-verify
- **status:** IMPLEMENTED
- **kind:** execution
- **purpose:** verify a deployed environment: health endpoints, expected page and text, latency budget, optional real-browser smoke steps; verdict VERIFIED / FAILED / BLOCKED with a rollback signal
- **inputs:** `--url <base>`, `--health /health,/ready`, `--expect-text`, `--max-ms`, `--browse`, `--steps <json>`
- **outputs:** dcore.evidence/1 report + verdict + rollback_signal; evidence {requests[{path,status,latency}], browser{screenshots, console_errors, network_failures}}
- **permissions:** network (GET only, plus browser smoke)
- **security_level:** ENVIRONMENT_SPECIFIC
- **platform_requirements:** any
- **dependencies:** dcore-api, dcore-browse (optional)
- **failure_behavior:** bad URL => BLOCKED; any failed check => FAILED with rollback_signal; never rolls back or changes anything
- **runnable:** true

## How Claude uses this module
Run after a deploy (or as the last step of dcore-release). It is a point-in-time check from this machine, not a
monitoring system: error rates and logs are only covered when an endpoint exposing them is checked.

## Example
```
node scripts/dcore.mjs dcore-verify --url https://staging.example.test --health /health --expect-text "Sign in" --max-ms 1500 --browse
```

## Tests
See bench/test/dcore-skill.test.ts and bench/test/dcore-exec.test.ts.
