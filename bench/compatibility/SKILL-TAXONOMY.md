# dkskill Skill Taxonomy (M14)

**DECISION: ONE_PRIMARY_WITH_MODULES — initial release skill count = 1 (FROZEN). Additional skills = NOT_YET_DECIDED.**

## The three options evaluated
- **A. One primary skill (`dkskill`) with internal capability modules** — chosen for the initial release.
- **B. A coordinated family of separately installable skills** — deferred.
- **C. Another architecture** — not justified by current requirements.

## Why A (evidence-based, not convenience)
| Criterion | Verdict |
|---|---|
| user simplicity | one install, one mental model → favors A |
| Claude Code skill discovery | one discoverable skill → A |
| installation complexity | lowest for A |
| compatibility management | single M3/M13 resolution point → A |
| permission boundaries | one boundary now; split into B only if a workflow needs isolation |
| security isolation | centralized fail-closed core → A |
| versioning | one product version line → A |
| testing | one public test surface → A |
| maintainability | highest for A initially |
| global distribution | one clone target → A |
| future extensibility | internal modules can later split into a family (B) without breaking identifiers |
| backward compatibility | immutable identifiers (`product`, `skill_id`) preserved across the A→B path |

A skill **family (B)** would multiply install, compatibility, permission, and versioning surfaces with **no current
evidence of user need**. Per the STOP conditions, no skill is invented to hit a count.

## Initial release (FROZEN)
| skill_id | name | purpose | independently installable | dependencies | required capabilities | required facets | permissions |
|---|---|---|---|---|---|---|---|
| `dkskill` | dkskill | universal fail-closed compatibility core + `dkskill doctor` diagnostic | yes | none | CAP-COMPAT-RESOLVE, CAP-ENV-DETECT | hook_protocol@1, stream_schema@1, attribution@1, settings_layout@1, permission_modes@1 | PERM-READ-ENV, PERM-READ-REGISTRY, PERM-READ-CONFIG, PERM-DIAGNOSE |

## Future skills — NOT_YET_DECIDED
Additional user-facing skills are deferred. Required decision inputs before freezing a larger count:
1. at least one **certified** host facet (real evidence);
2. validated user workflows / demonstrated demand;
3. permission-isolation requirements per workflow (would justify splitting into a family);
4. an explicit owner decision on scope beyond the core (H-Q2/H-Q3).

Until those inputs exist, the count stays **1**, and any expansion is an owner decision — not an implementation
default.
