// M17 — safe, read-only Claude Code identity-observation layer.
// Establishes exact identity facts ONLY when they can be obtained safely, and feeds them to the frozen M13/M3
// resolver. It NEVER executes Claude, authenticates, reads ~/.claude / credentials / OAuth / cookies / tokens,
// contacts the network, spawns a subprocess, or mutates anything. UNKNOWN when no safe evidence exists. Contradictory
// safe observations => CONTRADICTED (block). Identity observation is NOT compatibility and NOT certification.
import { sha256, canonicalJson } from '../src/canonical.ts';
import { resolveUniversal } from '../compatibility/universal-compatibility.ts';
import { selectAdapter } from '../compatibility/platform-adapter.ts';
import type { UniversalHost, UserCompatibilityResult } from '../compatibility/universal-compatibility-types.ts';
import type { Registry } from '../tools/gen-compatibility-registry.ts';
import type { EnvironmentFacts } from './product-foundation-types.ts';

export type ObsState = 'OBSERVED' | 'UNKNOWN' | 'UNAVAILABLE' | 'REJECTED' | 'CONTRADICTED';
export type EvidenceClass = 'EXPLICIT_INPUT' | 'LOCAL_OBSERVATION' | 'MIXED' | 'NONE';
export type IdentityStatus = 'COMPLETE' | 'INCOMPLETE' | 'CONTRADICTED' | 'UNKNOWN';

export interface ExplicitIdentity { product?: string; version?: string; channel?: string; binary_path?: string; binary_sha256?: string }
export interface LocalMetadata { version?: string; channel?: string; source?: string }
export interface ReadOnlyBinFs { isFile(path: string): boolean; realpath(path: string): string; readBytes(path: string): Uint8Array | null; size(path: string): number | null }

export interface ClaudeIdentityObservation {
  schema: 'dkskill.claude_identity_observation/1';
  version: 1;
  observation_id: string;
  observed_at: string;
  product: string;
  claude_version: string | null;
  version_state: ObsState;
  operating_system: string | null;
  os_version: string | null;
  architecture: string | null;
  channel: string | null;
  channel_state: ObsState;
  binary_path: string | null;
  binary_path_state: ObsState;
  binary_sha256: string | null;
  binary_hash_state: ObsState;
  binary_size: number | null;
  runtime: string | null;
  provenance: Record<string, string>;
  evidence_class: EvidenceClass;
  identity_status: IdentityStatus;
  execution_performed: false;
  credentials_accessed: false;
  network_contacted: false;
  config_accessed: false;
  safe: boolean;
  reasons: string[];
  observation_hash?: string;
}

// Reject credential/config/unsafe paths explicitly (testable safety boundary). No reading occurs on rejection.
const UNSAFE_SEG = new Set(['.claude', '.credentials', '.ssh', '.aws', '.config', 'runtime', 'keychain']);
const UNSAFE_NAME = /(\.credentials|credentials\.json|oauth|cookie|token|api[_-]?key|apikey|id_rsa|\.pem|session)/i;
export function isSafeBinaryPath(path: string): boolean {
  if (!path) return false;
  const norm = path.replace(/\\/g, '/');
  const segs = norm.split('/').filter(Boolean);
  if (segs.some((s) => UNSAFE_SEG.has(s.toLowerCase()))) return false;
  const name = segs[segs.length - 1] ?? '';
  if (UNSAFE_NAME.test(norm) || UNSAFE_NAME.test(name)) return false;
  return true;
}

function pick(explicit: string | undefined, metadata: string | undefined): { value: string | null; state: ObsState; provenance: string } {
  const e = explicit && explicit.trim() ? explicit.trim() : undefined;
  const m = metadata && metadata.trim() ? metadata.trim() : undefined;
  if (e && m && e !== m) return { value: null, state: 'CONTRADICTED', provenance: 'CONTRADICTED(EXPLICIT_INPUT vs LOCAL_METADATA)' };
  if (e) return { value: e, state: 'OBSERVED', provenance: 'EXPLICIT_INPUT' };
  if (m) return { value: m, state: 'OBSERVED', provenance: 'LOCAL_METADATA' };
  return { value: null, state: 'UNKNOWN', provenance: 'UNKNOWN' };
}

export function observeClaudeIdentity(input: {
  explicit?: ExplicitIdentity; local_metadata?: LocalMetadata; os_facts?: Partial<EnvironmentFacts>; fs?: ReadOnlyBinFs;
  now: string; observation_id?: string;
}): ClaudeIdentityObservation {
  const reasons: string[] = [];
  const provenance: Record<string, string> = {};
  const ex = input.explicit ?? {};
  const md = input.local_metadata ?? {};
  const facts = input.os_facts ?? {};
  let safe = true;

  // Environmental facts (SAFE_OS_API) — never Claude identity.
  const operating_system = facts.os ?? null; const os_version = facts.os_version ?? null; const architecture = facts.architecture ?? null; const runtime = facts.runtime ?? null;
  provenance.operating_system = operating_system ? 'SAFE_OS_API' : 'UNKNOWN';
  provenance.architecture = architecture ? 'SAFE_OS_API' : 'UNKNOWN';
  provenance.runtime = runtime ? 'SAFE_OS_API' : 'UNKNOWN';

  // Version + channel (explicit / local metadata; contradictions blocked).
  const v = pick(ex.version, md.version); const c = pick(ex.channel, md.channel);
  provenance.version = v.provenance; provenance.channel = c.provenance;
  if (v.state === 'CONTRADICTED') reasons.push('version CONTRADICTED (explicit vs local metadata)');
  if (c.state === 'CONTRADICTED') reasons.push('channel CONTRADICTED (explicit vs local metadata)');

  // Binary path + hash (safe, read-only; never executed).
  let binary_path: string | null = null, binary_path_state: ObsState = 'UNAVAILABLE';
  let binary_sha256: string | null = null, binary_hash_state: ObsState = 'UNAVAILABLE', binary_size: number | null = null;
  const fs = input.fs;
  if (ex.binary_path) {
    if (!isSafeBinaryPath(ex.binary_path)) { binary_path_state = 'REJECTED'; binary_hash_state = 'REJECTED'; safe = false; reasons.push('binary path REJECTED (credential/config/unsafe path)'); provenance.binary_sha256 = 'REJECTED'; }
    else if (!fs || !fs.isFile(ex.binary_path)) { binary_path_state = 'UNAVAILABLE'; binary_hash_state = 'UNAVAILABLE'; reasons.push('binary path not a readable regular file'); provenance.binary_sha256 = 'UNAVAILABLE'; }
    else {
      binary_path = fs.realpath(ex.binary_path); binary_path_state = 'OBSERVED';
      const bytes = fs.readBytes(binary_path); binary_size = fs.size(binary_path);
      if (bytes == null) { binary_hash_state = 'UNAVAILABLE'; reasons.push('binary bytes unavailable'); provenance.binary_sha256 = 'UNAVAILABLE'; }
      else {
        const computed = sha256(bytes).replace(/^sha256:/, '');   // raw hex (registry convention); read-only, NEVER executed
        if (ex.binary_sha256 && ex.binary_sha256.replace(/^sha256:/i, '').toLowerCase() !== computed) { binary_hash_state = 'CONTRADICTED'; reasons.push('binary hash CONTRADICTED (computed vs supplied)'); provenance.binary_sha256 = 'CONTRADICTED'; }
        else { binary_sha256 = computed; binary_hash_state = 'OBSERVED'; provenance.binary_sha256 = 'LOCAL_BINARY_READ'; }
      }
    }
  } else if (ex.binary_sha256) {
    binary_sha256 = ex.binary_sha256.replace(/^sha256:/i, '').toLowerCase(); binary_hash_state = 'OBSERVED'; provenance.binary_sha256 = 'EXPLICIT_INPUT';
  } else { provenance.binary_sha256 = 'UNAVAILABLE'; }

  const product = (ex.product && ex.product.trim()) || 'claude-code';
  provenance.product = ex.product ? 'EXPLICIT_INPUT' : 'PRODUCT_DEFAULT';

  // Evidence class.
  const hasExplicit = !!(ex.version || ex.channel || ex.binary_path || ex.binary_sha256 || ex.product);
  const hasLocal = binary_hash_state === 'OBSERVED' && provenance.binary_sha256 === 'LOCAL_BINARY_READ' || v.provenance === 'LOCAL_METADATA' || c.provenance === 'LOCAL_METADATA';
  const evidence_class: EvidenceClass = hasExplicit && hasLocal ? 'MIXED' : hasExplicit ? 'EXPLICIT_INPUT' : hasLocal ? 'LOCAL_OBSERVATION' : 'NONE';

  // Identity status (M13 tuple; never weakened). CONTRADICTED dominates.
  const anyContradiction = v.state === 'CONTRADICTED' || c.state === 'CONTRADICTED' || binary_hash_state === 'CONTRADICTED';
  const platformResolvable = operating_system ? !!selectAdapter(operating_system) : false;
  let identity_status: IdentityStatus;
  if (anyContradiction) identity_status = 'CONTRADICTED';
  else if (v.state === 'OBSERVED' && c.state === 'OBSERVED' && platformResolvable && !!architecture) identity_status = 'COMPLETE';
  else if (v.state === 'UNKNOWN' && c.state === 'UNKNOWN' && !architecture && !operating_system) identity_status = 'UNKNOWN';
  else identity_status = 'INCOMPLETE';
  if (identity_status !== 'COMPLETE' && !anyContradiction) reasons.push(`identity ${identity_status}: not all required fields safely observed`);

  const base: Omit<ClaudeIdentityObservation, 'observation_hash'> = {
    schema: 'dkskill.claude_identity_observation/1', version: 1, observation_id: input.observation_id ?? 'obs-claude-identity', observed_at: input.now,
    product, claude_version: v.value, version_state: v.state, operating_system, os_version, architecture,
    channel: c.value, channel_state: c.state, binary_path, binary_path_state, binary_sha256, binary_hash_state, binary_size, runtime,
    provenance, evidence_class, identity_status, execution_performed: false, credentials_accessed: false, network_contacted: false, config_accessed: false,
    safe, reasons: reasons.length ? reasons : ['observation complete'],
  };
  return { ...base, observation_hash: sha256(canonicalJson(base)) };
}

// Map an observation to a resolver host. Only OBSERVED fields pass; any other state (UNKNOWN/UNAVAILABLE/REJECTED/
// CONTRADICTED) => null, so the frozen resolver cannot match and can never return COMPATIBLE from unsafe evidence.
export function observationToHost(obs: ClaudeIdentityObservation): UniversalHost {
  return {
    product: obs.product, version: obs.version_state === 'OBSERVED' ? obs.claude_version : null,
    os: obs.operating_system, os_version: obs.os_version, architecture: obs.architecture,
    channel: obs.channel_state === 'OBSERVED' ? obs.channel : null,
    binary_sha256: obs.binary_hash_state === 'OBSERVED' ? obs.binary_sha256 : null, runtime_facet: obs.runtime,
  };
}

// Feed identity into the frozen resolver (authoritative). M17 never turns UNKNOWN/INCOMPLETE/CONTRADICTED into
// COMPATIBLE, nor UNVERIFIED into CERTIFIED.
export function resolveWithIdentity(obs: ClaudeIdentityObservation, registry?: Registry, synthetic_test_only = false): UserCompatibilityResult {
  return resolveUniversal({ host: observationToHost(obs), registry, synthetic_test_only });
}
export function verifyObservation(obs: ClaudeIdentityObservation): boolean { const { observation_hash, ...rest } = obs; return sha256(canonicalJson(rest)) === observation_hash; }
