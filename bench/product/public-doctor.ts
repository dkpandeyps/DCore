// M16 — public machine-readable doctor report (`dkskill.public_doctor_report/1`) + safe real OS facts.
// Wraps the frozen M15 runDoctor; adds product identity + explicit safety flags. Values that cannot be safely
// established are 'UNKNOWN' (never guessed). Claude Code version/channel/binary are UNKNOWN unless a verified probe
// supplies them; ~/.claude, credentials, OAuth, cookies are never read; no network; no subprocess.
import { runDoctor, renderDoctor, DKSKILL_VERSION } from './doctor.ts';
import { nodeEnvironmentFacts } from './environment-and-adapters.ts';
import { buildProductSpec } from '../compatibility/product-core-spec.ts';
import type { UniversalHost } from '../compatibility/universal-compatibility-types.ts';
import type { Registry } from '../tools/gen-compatibility-registry.ts';
import type { EnvironmentFacts } from './product-foundation-types.ts';

const UNK = (v: string | null | undefined): string => (v == null || v === '' ? 'UNKNOWN' : v);

export interface PublicDoctorReport {
  schema: 'dkskill.public_doctor_report/1';
  synthetic_test_only: boolean;
  product_id: string;
  skill_id: string;
  product_version: string;
  environment: string;
  operating_system: string;
  operating_system_version: string;
  architecture: string;
  runtime: string;
  claude_code_version: string;       // UNKNOWN unless a verified probe supplies it
  claude_code_channel: string;
  claude_code_binary_hash: string;
  compatibility_outcome: string;
  compatibility_profile: string;
  capability_states: { id: string; state: string }[];
  facet_states: { family: string; state: string }[];
  attribution_state: string;
  reasons: string[];
  safe_next_action: string;
  credentials_accessed: false;
  network_contacted: false;
  subprocesses_spawned: false;
}

export function buildPublicDoctorReport(input: { host: UniversalHost; registry?: Registry; dkskill_version?: string; synthetic_test_only?: boolean }): PublicDoctorReport {
  const rep = runDoctor({ host: input.host, registry: input.registry, dkskill_version: input.dkskill_version, synthetic_test_only: input.synthetic_test_only });
  const spec = buildProductSpec();
  return {
    schema: 'dkskill.public_doctor_report/1', synthetic_test_only: input.synthetic_test_only ?? false,
    product_id: spec.identity.product_id, skill_id: spec.taxonomy.skills[0].skill_id, product_version: spec.manifest_template.product_version,
    environment: rep.environment.supported_platform ? 'supported' : 'unsupported/unknown',
    operating_system: UNK(rep.environment.platform), operating_system_version: UNK(rep.environment.os_version),
    architecture: UNK(rep.environment.architecture), runtime: UNK(input.host.runtime_facet),
    claude_code_version: UNK(rep.environment.claude_code_version), claude_code_channel: UNK(rep.environment.channel),
    claude_code_binary_hash: rep.environment.binary_identity_status === 'UNKNOWN' ? 'UNKNOWN' : UNK(input.host.binary_sha256),
    compatibility_outcome: rep.compatibility.status, compatibility_profile: UNK(rep.compatibility.profile_id),
    capability_states: rep.capabilities.map((c) => ({ id: c.capability_id, state: c.state })),
    facet_states: rep.required_facets.map((f) => ({ family: f.family, state: f.state })),
    attribution_state: rep.attribution_status.in_scope ? 'IN_SCOPE' : 'OUT_OF_SCOPE_OR_UNKNOWN',
    reasons: [...rep.blocked_reasons, ...rep.unknown_reasons], safe_next_action: rep.safe_next_action,
    credentials_accessed: false, network_contacted: false, subprocesses_spawned: false,
  };
}

// Safe real facts: OS platform/arch/release only (read-only). Claude Code facts stay null => UNKNOWN.
export function safeRealFacts(osMod: { platform(): string; arch(): string; release(): string }): EnvironmentFacts {
  return nodeEnvironmentFacts(osMod);
}
export function factsToHost(f: EnvironmentFacts): UniversalHost {
  return { product: 'claude-code', version: f.claude_code_version, os: f.os, os_version: f.os_version, architecture: f.architecture, channel: f.channel, binary_sha256: f.binary_sha256, runtime_facet: f.runtime };
}
export { renderDoctor, DKSKILL_VERSION };
