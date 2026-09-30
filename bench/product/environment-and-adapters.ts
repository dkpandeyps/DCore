// M15 — environment detection + platform adapters. Deterministic, read-only, no credentials, no ~/.claude, no
// network, no OS change. Unknown facts return UNKNOWN (never guessed). Adapters do identity normalization only and
// declare no certification/compatibility/behavior. Reuses the frozen M13 platform adapters + normalizeHost.
import { normalizeHost } from '../compatibility/universal-compatibility.ts';
import { PLATFORM_ADAPTERS, selectAdapter } from '../compatibility/platform-adapter.ts';
import type { EnvironmentFacts, EnvironmentDetection, AdapterFacts } from './product-foundation-types.ts';
import type { UniversalHost } from '../compatibility/universal-compatibility-types.ts';

// Product-level adapter facts (safe, observable, testable) — no behavior assumptions.
export function productAdapters(): AdapterFacts[] {
  return PLATFORM_ADAPTERS.map((a) => ({ adapter_id: a.adapter_id, platform: a.platform, registry_platform_token: a.registry_platform_token, supported_architectures: [...a.supported_architectures], supported_channels: [...a.supported_channels] }));
}

// Pure detection over supplied facts (tests inject facts; nothing is guessed). Missing facts => UNKNOWN (null).
export function detectEnvironment(facts: Partial<EnvironmentFacts>): EnvironmentDetection {
  const f: EnvironmentFacts = {
    os: facts.os ?? null, os_version: facts.os_version ?? null, architecture: facts.architecture ?? null,
    runtime: facts.runtime ?? null, claude_code_version: facts.claude_code_version ?? null,
    channel: facts.channel ?? null, binary_sha256: facts.binary_sha256 ?? null,
  };
  const host: UniversalHost = { product: 'claude-code', version: f.claude_code_version, os: f.os, os_version: f.os_version, architecture: f.architecture, channel: f.channel, binary_sha256: f.binary_sha256, runtime_facet: f.runtime };
  const norm = normalizeHost(host);
  const unknown_fields = (Object.keys(f) as (keyof EnvironmentFacts)[]).filter((k) => f[k] == null).map((k) => k);
  return { schema: 'dkskill.environment_detection/1', facts: f, host, platform: norm.platform, supported_platform: norm.supported, unknown_fields, reasons: norm.reasons };
}

// The ONLY real-machine read: os platform/arch/release. NEVER reads ~/.claude, credentials, or Claude version.
// Claude Code version/channel/binary are left UNKNOWN unless a caller supplies verified facts.
export function nodeEnvironmentFacts(osMod: { platform(): string; arch(): string; release(): string }): EnvironmentFacts {
  return { os: osMod.platform(), os_version: osMod.release(), architecture: osMod.arch(), runtime: `node`, claude_code_version: null, channel: null, binary_sha256: null };
}

export { selectAdapter };
