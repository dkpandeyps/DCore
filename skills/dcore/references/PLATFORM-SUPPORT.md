# DCore Platform Support

DCore is platform-neutral by architecture. The core contains no shell assumptions
(`bash`/`PowerShell`/`cmd.exe`) and no hard-coded path style. Platform differences are handled by capability
detection and, where needed, thin adapters.

| platform | status | notes |
|---|---|---|
| Windows | SUPPORTED | paths via `node:path`; no drive-letter assumptions |
| macOS | SUPPORTED | POSIX paths via `node:path` |
| Linux | SUPPORTED | POSIX paths via `node:path` |
| other/unknown | SAFE_DEGRADATION | generic operations allowed; environment-specific ops produce an explicit diagnostic |

Rules:
- SAFE_GENERIC_OPERATION -> allowed on all platforms.
- ENVIRONMENT_SPECIFIC_OPERATION -> capability check first.
- UNKNOWN capability -> safe degradation with a clear note (never a silent alternative).
- UNSUPPORTED capability -> explicit diagnostic.
- Never map an unknown platform/architecture to a known one (e.g. ARM is never treated as x64).

The scaffold generator and installer use only `node:fs`/`node:path`/`node:os` and run identically on all three
platforms. They make no network calls and access no credentials.
