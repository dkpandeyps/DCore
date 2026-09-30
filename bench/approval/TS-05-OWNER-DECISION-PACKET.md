# TS-05 — Owner-Decision Packet (Windows network-egress isolation)

> **Decision-preparation only (2026-09-28).** Nothing is implemented, configured, or executed: no Windows
> networking change, no firewall/software install, no VM/container, no network test, no external call, no
> Claude run, no `validity.ts`/VG-06/BQ-19/B-6 change, no fixture-staging change, no `/runtime/`, no Run A,
> no budget. Both decisions below are **PENDING_OWNER_APPROVAL**; I do not approve them.

## Authoritative baseline (terminology preserved; not replaced with general networking advice)
- **Phase 3 methodology §3.3:** network isolation = **local sinkhole only**.
- **§5.1:** the **network isolation mechanism** is an **environment-snapshot** field subject to **snapshot equality** (paired A/B runs).
- **§6.4 / VG-06:** the network isolation mechanism must be **verified active**.
- **`validity.ts`:** `network_isolation_verified` drives VG-06 (`true` ⇒ PASS; `false` ⇒ FAIL; `null` ⇒ NOT_EVALUATED).
- **`fixtures-spec.ts`:** FX-SINK binds **`127.0.0.1`**; **no other egress may be possible**.
- **PLATFORM-ASSUMPTIONS U-14:** OS **sandbox unavailable on Windows** (hands-on 2026-09-27).
- **Owner decision B-6:** the compensating AEOS design (OS ACLs, opaque-exec, integrity checks) is **not equivalent to an OS sandbox** and **does not cover network egress**; cross-platform sandbox testing deferred.
- **Phase 2 Q22:** the isolated environment may be a separate `CLAUDE_CONFIG_DIR` scratch environment **or a disposable VM/container**.

The two source gaps this packet addresses: **(1) the concrete Windows network-egress isolation mechanism**, and **(2) the evidence artifact/schema proving that mechanism is active** (`network_isolation_verified = true`).

---

## Part A — mechanism decision (options)

Smallest set of **repository-compatible** options. No option is declared compliant merely because it is theoretically possible; "repo specification sufficient to validate?" is answered strictly from existing material.

### Option A1 — Disposable VM/container with host-level egress control (Q22 "disposable VM or container")
| Attribute | Assessment |
|---|---|
| Provides OS-level / non-loopback egress blocking? | **Yes, at the VM/container boundary** (egress policy enforced outside the guest). |
| How `127.0.0.1` stays available for FX-SINK | Loopback is internal to the guest; FX-SINK binds `127.0.0.1` **inside** the guest — unaffected by an external-egress block. |
| Windows-compatible? | Yes — the benchmark can run in a Windows guest; the egress control is at the VM/container network boundary. |
| VM/container required, or bare Windows host? | **Requires a disposable VM/container** (this is the isolation boundary). |
| Authority/control required | Owner-provisioned virtualization/container environment with a defined egress policy (infrastructure the owner controls). |
| Repo specification sufficient to validate? | **No.** Q22 *names* "disposable VM or container" as an allowed isolated environment, but the repository specifies **no** concrete egress policy, VM/container image, or verification for it. **External environment specification required.** |

### Option A2 — Windows-host OS-level egress control (host firewall / network policy)
| Attribute | Assessment |
|---|---|
| Provides OS-level / non-loopback egress blocking? | Only **if** such a host control exists and is configured — **not established**. |
| How `127.0.0.1` stays available for FX-SINK | Would require the host control to permit loopback while blocking non-loopback (unspecified in repo). |
| Windows-compatible? | Would operate on the Windows host, but see below. |
| VM/container required, or bare Windows host? | Bare Windows host. |
| Authority/control required | Host administrator privileges to set a host-level network/firewall policy. |
| Repo specification sufficient to validate? | **No.** **U-14** records the OS **sandbox NOT AVAILABLE on Windows**; **B-6** accepts a compensating design that **does not cover network egress** and **defers** cross-platform sandbox testing. The repository specifies **no** Windows-host egress mechanism, command, or policy. Declaring this compliant would require **inventing** a firewall/policy — **not done**. **External environment specification required.** |

### Option A3 — No mechanism; rely on the loopback-only benchmark design
| Attribute | Assessment |
|---|---|
| Provides OS-level / non-loopback egress blocking? | **No** — this is design intent (FX-SINK loopback only), not an enforced/verified isolation mechanism. |
| Compliance with VG-06 | **Non-compliant.** §6.4/VG-06 requires the mechanism **verified active** (`network_isolation_verified = true`); "the benchmark makes no external call" does not satisfy "mechanism verified active." |
| Disposition | **Considered and rejected** — does not meet the existing TS-05/VG-06 requirement. |

### Part A conclusion
The repository does **not** define enough information to distinguish or validate a viable **Windows-host** egress mechanism (A2 blocked by U-14/B-6), and only *names* A1 (VM/container) without a concrete egress policy or verification. Per the decision rule, the recommended mechanism decision is:

> **TS-05-MECHANISM = "external environment specification required"** — the owner (or an external environment specification) must define the concrete isolation mechanism. The repository-named candidate is **A1 (disposable VM/container with a host-level egress policy)**; **A2 (Windows-host control) cannot be validated from existing material**; **A3 is non-compliant**.

---

## Part B — evidence schema decision (minimum evidence for `network_isolation_verified = true`)

All fields below are **PROPOSED OWNER DECISIONS**, not yet authoritative. They are the minimum needed to justify setting `validity.ts network_isolation_verified = true` (which the owner must not change now). Fields are distinguished per the required categories:

| Proposed field (PROPOSED) | Category | Purpose |
|---|---|---|
| `mechanism_id` | mechanism identity | names the chosen mechanism (e.g., the A1 VM/container profile) |
| `mechanism_policy_id` / `mechanism_policy_hash` | mechanism configuration/policy identity | pins the exact egress policy/config used |
| `egress_blocked` (bool) + `loopback_reachable` (bool) | verification result | the two observed outcomes: non-loopback blocked, loopback reachable |
| `verified_at` (timestamp) / `run_id` | verification timestamp or run identity | when/which run the verification belongs to |
| `environment_id` | environment identity | the isolated environment (VM/container/scratch) the result applies to |
| `loopback_allowance` = `127.0.0.1` | loopback allowance | records that only loopback (FX-SINK) is permitted |
| `non_loopback_egress_check` (result + method ref) | non-loopback egress verification | the attestation that a non-loopback destination was **not** reachable (the *act* of probing is deferred to the owner-approved environment; this field records its result) |
| `snapshot_network_isolation_mechanism` (string) | snapshot value required by §5.1 | the value entered into the environment snapshot, subject to **snapshot equality** across paired A/B runs |

> These map onto the existing `network_isolation_verified` boolean (they justify setting it true) and the §5.1 snapshot field. **No `validity.ts`/schema change is proposed or made here** — the schema above is a proposed owner decision to be implemented only after approval.

---

## Part C — recommended decision form

### TS-05-MECHANISM
- **Current authoritative requirement:** network = local sinkhole only (§3.3); FX-SINK loopback `127.0.0.1`, no other egress (`fixtures-spec.ts`); mechanism must be **verified active** (§6.4/VG-06).
- **Source-gap:** the repository specifies no concrete Windows egress mechanism (U-14 sandbox NOT AVAILABLE; B-6 compensating design excludes network egress and defers sandbox testing).
- **Proposed decision:** **external environment specification required** — adopt **A1 (disposable VM/container with a defined host-level egress policy)** as the candidate the owner specifies externally; **do not** rely on A2 (unvalidated from repo) or A3 (non-compliant).
- **Alternatives considered:** A2 Windows-host firewall/policy (blocked by U-14/B-6, cannot validate from repo); A3 loopback-only-by-design (non-compliant with "verified active").
- **Consequences:** until specified and verified, VG-06 stays NOT_EVALUATED and Run A remains blocked on TS-05. Choosing A1 implies provisioning a disposable VM/container environment (infrastructure + owner authority).
- **Acceptance criterion:** a named mechanism with a pinned policy that **blocks all non-loopback egress while leaving `127.0.0.1` reachable**, **verified active**, and recorded in the environment snapshot (§5.1).
- **Evidence required:** the Part B evidence record (once its schema is approved).
- **Status:** `PENDING_OWNER_APPROVAL`.

### TS-05-EVIDENCE
- **Current authoritative requirement:** `network_isolation_verified` must be substantiated (`validity.ts`/VG-06); the mechanism is a snapshot field under snapshot equality (§5.1).
- **Source-gap:** the repository defines only the boolean field and the snapshot-equality of the mechanism string — **no evidence artifact/schema** proving egress is blocked.
- **Proposed decision:** adopt the **Part B proposed evidence schema** as the artifact that substantiates `network_isolation_verified = true`.
- **Alternatives considered:** boolean-only (insufficient — no proof); free-text attestation (not snapshot-comparable).
- **Consequences:** a defined, snapshot-comparable evidence artifact; requires a later (post-approval) harness addition to capture it. **No `validity.ts` change now.**
- **Acceptance criterion:** an evidence record populated for a real isolated environment showing `egress_blocked = true` and `loopback_reachable = true`, with mechanism + policy identity and a snapshot value equal across the paired A/B runs.
- **Evidence required:** the populated evidence record itself (produced only in the owner-approved environment; not now).
- **Status:** `PENDING_OWNER_APPROVAL`.

---

## Part D — interaction with existing decisions (no silent modification)

| Existing decision | Touched? | Note |
|---|---|---|
| **B-6** | No | B-6 deferred cross-platform sandbox testing and scoped the AEOS compensating design to state paths; A1 (VM/container egress) is a **different** mechanism, not the AEOS compensating design — no change to B-6. |
| **BQ-19** | No | Authentication/isolation-login decision; unaffected by the network-egress mechanism/evidence. |
| **VG-06** | No | The proposal **substantiates** `network_isolation_verified`; it does not alter the gate logic or its meaning. |
| **Q22** | No | A1 uses Q22's already-named "disposable VM or container" option; no redefinition of Q22. |
| **Phase 3 isolation model (§3.3/§5.1)** | No | "local sinkhole only" + snapshot-equality preserved; the proposal fills the mechanism/evidence the model already calls for. |
| **FX-SINK contract** | No | `127.0.0.1`-only binding preserved; every option keeps loopback reachable and blocks only non-loopback egress. |

**Conflict check:** none of the proposed options requires changing B-6, BQ-19, VG-06, Q22, the Phase-3 isolation model, or the FX-SINK contract. (If a future owner choice selected a mechanism that permitted non-loopback egress, or that redefined "verified active," that **would** conflict with §3.3/VG-06/FX-SINK — flagged here, not resolved.)

---

## Summary
- **Two pending owner decisions:** `TS-05-MECHANISM` and `TS-05-EVIDENCE`, both **PENDING_OWNER_APPROVAL**.
- **TS-05 remains UNRESOLVED.** This packet prepares the decisions; it does not resolve, approve, implement, or execute anything.
