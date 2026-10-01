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
Name the symbols/files/config keys the change touches (snake_case, camelCase, multi-word PascalCase class/type names
like `ZodError`/`RequestValidator`, or `file.ext`). Single capitalized English words (e.g. `Command`, `Request`) are
intentionally not treated as identifiers, to avoid matching ordinary prose. With `--repo`, DCore
does a **read-only** literal-reference scan and reports where each identifier appears, classified:
- **DIRECT_EVIDENCE** — non-test source files that reference the identifier.
- **LIKELY_AFFECTED** — test/spec files that reference it (candidates to update).
- **POSSIBLY_AFFECTED** — docs (`.md`/etc.) that reference it.
- **UNKNOWN** — identifiers with no literal match (indirect/dynamic/semantic use is not detected).

Evidence is **literal references only** — it is **not** a dependency graph, and absence of evidence is not proof of
no impact. Secret files (`.env`, `.credentials`, keys, `.ssh/`, …) and `.git`/`node_modules` are never read or
reported; no file is modified; no network, credentials, or subprocesses are used; output is deterministic (sorted).

## Repository scope (`--repo <path>`)
`--repo <path>` is the **explicit analysis boundary**: dcore-impact scans exactly `<path>` and its allowed
descendants — nothing above or beside it. This is deliberate and predictable.

- To include the **whole project** (code *and* its tests/docs/benchmarks, which usually live in sibling directories),
  point `--repo` at the **project root**: `dcore-impact "…" --repo .`. Scanning a single subpackage
  (e.g. `--repo skills/dcore`) will not see tests in `bench/` or other siblings — that is correct scoping, not a miss.
- dcore-impact does **not** auto-expand to an enclosing project root; you choose the scope. It is not a dependency
  graph and does not reason beyond literal references within the scope you give it.
- Always excluded, at any scope: VCS metadata (`.git`/`.hg`/`.svn`), dependency/build output
  (`node_modules`/`dist`/`build`/`vendor`/…), local agent-state dirs (`.claude`/`.paysec`), and secret files
  (`.env`, `.credentials`, private keys, `.ssh/`). These are never read or reported.

## Presentation: `--summary`
`--summary` prints a compact, deterministic view — counts and a deduplicated file list per evidence category,
plus the UNKNOWN identifiers. It is **the same evidence, re-presented** (no new analysis, nothing hidden); the
default full/`--json` output is unchanged.

A common/hot identifier (e.g. a core symbol referenced throughout a test suite) legitimately produces a broad
`LIKELY_AFFECTED` set — that breadth is honest literal-reference evidence, not noise. `--summary` keeps it readable
regardless of size (the list is deduplicated and sorted); reach for `--summary` on broad or multi-symbol changes,
and name more specific identifiers to narrow the scope.

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
