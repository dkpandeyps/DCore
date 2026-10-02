# DCore Dogfood Evidence

## 1. Purpose
This document records **real-world dogfood evidence** for DCore — chiefly `dcore-impact` — gathered by running the
product against unrelated, real repositories (M34–M37). It captures **observed behavior**, so future development does
not re-derive the same cross-repository findings.

It is **not** a formal compatibility or certification matrix, and makes no certification claim.

## 2. Repositories validated
| Repository | Language | Milestone | Scale |
|---|---|---|---|
| DCore (self-host) | JS/TS (ESM) | M31–M37 | `skills/dcore/` + `bench/` |
| tj/commander.js | JavaScript | M34, M35 | lib/ + tests/ + docs/ (5 precision scenarios in M35) |
| colinhacks/zod | TypeScript | M36 | 742 files (OO: classes/interfaces/types) |
| google/gson | Java | M37 | 313 files / 264 .java (ref `854c825`) |

Refs/measurements above are preserved from the milestone history, not re-measured here.

## 3. What generalizes
`dcore-impact` uses **lexical evidence** (literal identifier references), not language semantics. The following
identifier forms were demonstrated to extract and produce useful evidence across the repos above:

- **camelCase** methods/fields — e.g. `toJson`, `parseOptions`, `validateRequest`.
- **multi-hump PascalCase** class/type names (≥2 capital-led segments) — e.g. `ZodError`, `CollectionTypeAdapterFactory`, `RequestValidator` (added + validated in M36; generalized to Java in M37).
- **`Class.method`** descriptions — covered by extracting the `ClassName` and the method separately (no dotted-path parser needed).
- **`CONSTANT_CASE` / underscore identifiers** — e.g. `ATOMIC_INTEGER_FACTORY`, `AUTO_DETECT_FIELDS` (handled by the underscore/snake_case rule; no separate rule needed).
- **snake_case** — where present.
- **mixed identifiers** — PascalCase + camelCase + CONSTANT_CASE in one change description.
- **rename / change descriptions** — the old name surfaces as evidence; the new (not-yet-existing) name is reported `UNKNOWN` (useful for migration work).

## 4. Known limitation — single-token ambiguity
A **single token** such as `Gson`, `Excluder`, `Request`, `User`, or `Error` cannot safely be treated as a code
identifier in arbitrary prose: there is no deterministic way to distinguish a single-token class name from an
ordinary English word without a dictionary or language parser (both out of scope). M37 confirmed that generic
single-token extraction would match ordinary prose.

Consequences:
- single-token class/type names **may be missed**;
- this is an **intentional conservative tradeoff** that protects against prose false positives;
- **anchor** the query on a method, a distinctive multi-word type, a constant, or another specific identifier — e.g. `Gson.toJson` (whose `toJson` finds the usages).

This is **not** treated as a defect unless future dogfood demonstrates an actionable miss.

## 5. Evidence table
| Milestone | Repository | Language | Key evidence | Result |
|---|---|---|---|---|
| M34 | commander.js | JavaScript | end-to-end chain + impact on real changes | GOOD generalization; NO_CHANGE |
| M35 | commander.js | JavaScript | hot symbol `parseOptions` → broad LIKELY; `--summary` keeps it readable | DOCUMENTATION_ONLY |
| M36 | zod | TypeScript | `ZodError` 0→86 DIRECT/58 test/18 doc after multi-hump PascalCase rule | MINIMAL_EXTRACTION_FIX |
| M37 | gson | Java | PascalCase/CONSTANT_CASE/Class.method all found; single-token `Gson` miss non-actionable | DOCUMENTATION_ONLY |

## 6. When using dcore-impact
- Prefer **distinctive** identifiers (multi-word types, specific methods, constants).
- For a **common** identifier, use **`--summary`** — it stays compact regardless of how broad the result is.
- For a type with a **common or single-token name**, anchor the change on a distinctive method or related identifier.
- Treat a broad **`LIKELY_AFFECTED`** set as **evidence**, not a dependency graph — absence of evidence is not proof of no impact.
- Use **`--repo <path>`** to set the analysis boundary explicitly; use `--repo .` to include sibling tests/docs.
- Remember `dcore-impact` is **lexical, read-only** analysis.

## 7. Scope and limitations
`dcore-impact` is: read-only · deterministic · lexical/evidence-based. It is **not** a dependency graph, an AST
parser, language-semantic analysis, a compiler, or a certification system. It never reads secret files
(`.env`/`.credentials`/keys/`.ssh`) or agent/VCS state (`.git`/`.hg`/`.svn`/`.claude`/`.paysec`/`node_modules`),
makes no network calls, and writes nothing to the analyzed repository.

## 8. Evidence status
Current evidence demonstrates **useful cross-language generalization** across JavaScript, TypeScript, and Java. This
is **not** a claim of universal language compatibility, and **not** "certified compatibility."

## 9. Maintenance rule
Update this document **only** when new real-world dogfood materially changes what DCore is known to support, what
limitations are known, or how users should operate it. Do **not** update it for theoretical language features.
