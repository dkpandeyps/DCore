# DCore Module Contract

Every DCore module MUST define, in its `modules/<module_id>.md` reference and in `dcore.manifest.json`:

| field | meaning |
|---|---|
| `module_id` | stable, original DCore identifier (e.g. `dcore-spec`) — never a gstack name |
| `module_name` | human name |
| `purpose` | one line |
| `inputs` | what the user provides |
| `outputs` | the structured result |
| `permissions` | e.g. `read-only` (default) |
| `security_level` | `SAFE_GENERIC` \| `ENVIRONMENT_SPECIFIC` \| `CERTIFICATION_REQUIRED` |
| `platform_requirements` | `any` or specific |
| `dependencies` | other modules/none |
| `failure_behavior` | fail-closed behavior |
| `status` | `IMPLEMENTED` \| `PLANNED` \| `DEFERRED` |
| `runnable` | whether the deterministic scaffold generator supports it |
| `examples`, `tests` | usage + coverage |

## Hard rules (every module)
A module MUST NOT silently: execute arbitrary commands, delete data, modify credentials, access private
authentication state (`~/.claude`, OAuth, cookies, tokens, API keys), contact arbitrary network destinations, install
unrelated software, or modify system configuration. Modules prefer **read-only analysis**; any modification requires
explicit user request and approval and must be stated plainly. Unknown/unsafe input **fails closed**.
