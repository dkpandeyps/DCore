# DCore · dcore-impact — Change Impact

- **module_id:** dcore-impact
- **status:** IMPLEMENTED
- **purpose:** given a change + a repo, find literal references and classify DIRECT_EVIDENCE / LIKELY_AFFECTED / POSSIBLY_AFFECTED / UNKNOWN (never a dependency graph)
- **inputs:** a change description (positional, --input, stdin, or handoff) + `--repo <path>` to ground impact in a repository
- **outputs:** objective, identifiers, repo, direct_evidence, likely_affected_tests, possibly_affected_docs, unknown_identifiers, files_scanned, notes
- **permissions:** read-only (reads only the user-supplied repo path)
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** none (consumes a dcore handoff generically; pairs with dcore-plan/dcore-qa/dcore-doc)
- **failure_behavior:** fail-closed; no identifiers or no `--repo` ⇒ everything UNKNOWN; unreadable repo ⇒ `error` + UNKNOWN; never invents edges
- **runnable:** true

## How Claude uses this module
Name the symbols/files/config keys the change touches (snake_case, camelCase, or `file.ext`). With `--repo`, DCore
does a **read-only** literal-reference scan and reports where each identifier appears, classified:
- **DIRECT_EVIDENCE** — non-test source files that reference the identifier.
- **LIKELY_AFFECTED** — test/spec files that reference it (candidates to update).
- **POSSIBLY_AFFECTED** — docs (`.md`/etc.) that reference it.
- **UNKNOWN** — identifiers with no literal match (indirect/dynamic/semantic use is not detected).

Evidence is **literal references only** — it is **not** a dependency graph, and absence of evidence is not proof of
no impact. Secret files (`.env`, `.credentials`, keys, `.ssh/`, …) and `.git`/`node_modules` are never read or
reported; no file is modified; no network, credentials, or subprocesses are used; output is deterministic (sorted).

## Presentation: `--summary`
`--summary` prints a compact, deterministic view — counts and a deduplicated file list per evidence category,
plus the UNKNOWN identifiers. It is **the same evidence, re-presented** (no new analysis, nothing hidden); the
default full/`--json` output is unchanged.

## Optional handoff
A prior module's JSON may be piped in — e.g. `dcore-spec "…" --json | dcore-impact --repo .`. Identifiers are
extracted from the carried objective/requirements and `handoff_from` is recorded. This is **optional**: plain text
and the direct CLI form work exactly as before, and dcore-impact never requires dcore-spec.

## Example
```
node scripts/dcore.mjs dcore-impact "Rename cache_ttl to cache_ttl_seconds" --repo .
node scripts/dcore.mjs dcore-impact "change runModule, buildManifest" --repo . --summary
node scripts/dcore.mjs dcore-spec "…" --json | node scripts/dcore.mjs dcore-impact --repo . --summary
```

## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
