# DCore · dcore-api — API Testing

- **module_id:** dcore-api
- **status:** IMPLEMENTED
- **kind:** execution
- **purpose:** execute real HTTP requests and assert status, headers, body text, JSON paths, a JSON-schema subset and latency
- **inputs:** `--url`, `--method`, `--header "K: V"`, `--auth-env VAR [--auth-scheme Bearer|Basic|raw]`, `--json-body`, `--expect-status`, `--expect-text`, `--expect-json path=value`, `--schema file|json`, `--max-ms`, `--repeat`, `--retries`, `--timeout`, or `--spec file.json`
- **outputs:** dcore.evidence/1 report: checks per assertion; evidence {status, headers (redacted), content_type, body_excerpt (redacted, 2 KB), attempts, latency p50/p95}
- **permissions:** network (only the URL given)
- **security_level:** ENVIRONMENT_SPECIFIC
- **platform_requirements:** any (Node >= 18 fetch)
- **dependencies:** none
- **failure_behavior:** invalid/non-http URL => BLOCKED; POST/PUT/PATCH/DELETE to a non-local host => NOT_AUTHORIZED without `--approve external-write`; unset auth env var => BLOCKED; no response => FAIL with the network error; writes are never retried
- **runnable:** true

## How Claude uses this module
Credentials only via environment variables (`--auth-env`), never on the command line or in specs;
Authorization, Cookie, Set-Cookie and token-shaped values are redacted from all evidence. Cover positive, negative
(bad input, missing auth => expect 401/403), boundary and timeout cases. `--repeat N` measures sequential latency
from this machine; it is not a load test.

## Example
```
node scripts/dcore.mjs dcore-api --url https://api.example.test/health --expect-status 200 --expect-json status=ok --max-ms 800 --retries 2
```

Add `--report <file.md>` to write the redacted evidence as a Markdown report (stdout and exit code are unchanged).

## Tests
See bench/test/dcore-skill.test.ts and bench/test/dcore-exec.test.ts.
