# dkskill Global Compatibility Certification Infrastructure (M13, under M13-AUTH)

**STATUS: M13-INFRASTRUCTURE DESIGN VALIDATED / PROVISIONING = REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION /
NO REAL PROVISIONING / CURRENT HOST UNCHANGED (UNVERIFIED) / M8 = EXECUTION_BLOCKED / CERTIFIED PROFILES = 0 /
PUBLICATION = NONE**

M13 designs the PTPL-side infrastructure that would let dkskill perform real, independently verifiable compatibility
certification for supported Claude Code versions/platforms — **independently of the current single Windows host**. It
is **design + provisioning planning only**: deterministic, repository-local, fail-closed. It provisions nothing real,
spends nothing, executes no Claude, authenticates nothing, and makes **no OS/network change** to
`PTPL-DK-BENCH-WIN-01`. It never emits `VERIFIED`, `CERTIFIED`, `EXECUTION_ALLOWED`, or `PUBLISHED`. M4/M5/M6 remain
the certification/publication authorities, M8 the execution gate, M9 the L4 authority.

## Global architecture
```
USER ENVIRONMENT -> HOST IDENTITY -> EXACT COMPATIBILITY PROFILE -> CAPABILITY/FACET RESOLUTION
  -> FAIL-CLOSED ENFORCEMENT -> CERTIFICATION EVIDENCE -> INDEPENDENT VERIFICATION
  -> OWNER-APPROVED CERTIFICATION -> SIGNED COMPATIBILITY REGISTRY
```
Unknown environments never become trusted merely because the skill can execute; **uncertified ≠ unsupported** remains
explicit (M3). The public, cloneable dkskill consumes compatibility info safely and fails closed when required
information is unavailable; certification infrastructure stays a PTPL-side concern.

## Trust planes (distinct; never collapsed)
`CERTIFICATION_CONTROL_PLANE`, `CERTIFICATION_TEST_ENVIRONMENT`, `EVIDENCE_STORE`, `REGISTRY_PUBLICATION_CONTROL`.
Enforcement, observation, evidence storage, and publication authority live on separate planes.

## Independent observer
Per M9/M12: the observer must be external to the certified host, distinct from the enforcement mechanism,
environment-bound, fresh, tamper-evident, able to observe the controlled behavior, and **never** satisfiable by host
self-report. `observerIsIndependent` enforces this; a self-report observer or an observer equal to the enforcer is
rejected → `BLOCKED`. The reference design uses an external control plane that observes egress attempts from the
certified environment and writes hashed evidence to the private evidence store; unavailable/contradictory observation
fails closed.

## Enforcement boundary
A minimal, enforced outbound-deny boundary (`INFRA_EGRESS` / `HYPERVISOR` / `HOST_FIREWALL` / `NETWORK_NAMESPACE` /
`DEDICATED_MACHINE`) that actually demonstrates denied connectivity. Overbroad/host-wide or non-enforced boundaries
are rejected.

## Multi-platform + version matrix (no inheritance)
Templates exist for `windows`, `macos`, `linux`, each with reproducible identity and isolated credentials. **No
cross-platform, cross-version, cross-architecture, or cross-channel inheritance** (`inheritsCertification()` is always
`false`): 2.1.283↛2.1.284, Windows↛macOS, macOS↛Linux, x64↛arm64. **One certified facet = one independently
evidenced identity.**

## Lifecycle
`PROVISIONED → READY → PROBING → EVIDENCE_CAPTURED → EVIDENCE_VALIDATED → CERTIFICATION_REVIEW → CERTIFIED →
PUBLISHED → REVOKED → DESTROYED`. **No automatic** `EVIDENCE_CAPTURED → CERTIFIED` (M4 + owner review) and **no
automatic** `CERTIFIED → PUBLISHED` (M5/M6, signed + owner-authorized). Destroy/recreate is supported.

## Evidence store
Private, `sha256`-hashed, tamper-detecting, freshness-tracking, environment-bound, **secret-free** (no tokens/keys/
credentials), immutable/append-only.

## Credential isolation
Per-environment ephemeral credentials, isolated from developer/OAuth credentials, never copied between environments.
The current workstation's real `~/.claude` is never accessed.

## Readiness (design-time, never certification)
`assessEnvironment` returns `READY_FOR_L4_VERIFICATION` only for a dedicated test environment (not the current
workstation) with reproducible identity, isolated credentials, a genuine independent observer, and a minimal enforced
denial-demonstrating boundary; if real paid infrastructure is required it returns
`REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION`; otherwise `BLOCKED`. `READY_FOR_L4_VERIFICATION` is **not** VERIFIED,
CERTIFIED, or EXECUTION_ALLOWED — a separate M9 verification session and separate M8 + M4/M5/M6 authorities still
apply.

## Public vs private
**PUBLIC:** source code, capability catalogue, approved compatibility profiles, signed public registry,
installation/use instructions. **PRIVATE:** certification credentials, certification hosts, observer infrastructure,
private evidence payloads, internal audit material, benchmark credentials, infrastructure secrets, private network
addresses. Private material is never placed in the public repository.

## Cost / scale
One dedicated environment per platform and per certified version/channel facet; reproducible provisioning with
destroy/recreate; private immutable evidence retention; per-environment ephemeral credential isolation; concurrent
independent environments; hash-chained append-only audit. **Real paid infrastructure requires a separate owner
confirmation** — this phase is design-only and reports `REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION`.

## Current workstation
`PTPL-DK-BENCH-WIN-01` is **not** a control plane and is **not** modified. It remains `NETWORK_ISOLATION =
UNVERIFIED`, `M8 = EXECUTION_BLOCKED`.

## M8 / M9 / M4 integration
`infraToM9` → `UNVERIFIED`, `infraToM8` → `UNVERIFIED`, `infraToM4` → `NOT_CERTIFIED` (all fail-closed). Infrastructure
preparation may reach `READY_FOR_L4_VERIFICATION` but **never** auto-produces `VERIFIED`, `EXECUTION_ALLOWED`, or
`CERTIFIED`.

## Statements
**M13 certifies nothing and publishes nothing.** No Claude execution, no authentication, no credential access, no
external network contact, no OS/network change to the current host, no registry mutation, no benchmark spend. Actual
certification evidence acquisition requires a separate explicit owner authorization.
