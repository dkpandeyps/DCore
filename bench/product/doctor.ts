// M15 — `dkskill doctor` read-only diagnostic. Deterministic, secret-free, fail-closed. Consumes the frozen M13
// universal resolver; never executes Claude, authenticates, reads credentials/~/.claude, or contacts the network.
import { resolveUniversal } from '../compatibility/universal-compatibility.ts';
import type { UniversalHost } from '../compatibility/universal-compatibility-types.ts';
import type { Registry } from '../tools/gen-compatibility-registry.ts';
import type { DoctorReport, Tri } from './product-foundation-types.ts';

export const DKSKILL_VERSION = '0.1.0-dev';
const SECRET_RE = /(sk-[a-z0-9]{6}|eyJ[a-zA-Z0-9_-]{6,}\.[a-zA-Z0-9_-]{6,}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|access_token=|refresh_token=|api[_-]?key=|bearer\s+[a-z0-9]{6}|xoxb-[a-z0-9-]+|password=\S+)/gi;
function redact(s: string): { text: string; redacted: boolean } { SECRET_RE.lastIndex = 0; const has = SECRET_RE.test(s); SECRET_RE.lastIndex = 0; return { text: has ? s.replace(SECRET_RE, '[REDACTED]') : s, redacted: has }; }

export function runDoctor(input: { host: UniversalHost; registry?: Registry; dkskill_version?: string; synthetic_test_only?: boolean }): DoctorReport {
  const r = resolveUniversal({ host: input.host, registry: input.registry, synthetic_test_only: input.synthetic_test_only });
  const binary_identity_status: Tri = input.host.binary_sha256 ? (r.profile_resolution === 'EXACT_MATCH' ? 'YES' : 'NO') : 'UNKNOWN';
  let redaction_applied = false;
  const clean = (s: string) => { const x = redact(s); if (x.redacted) redaction_applied = true; return x.text; };
  const blocked_reasons = r.reason_codes.map(clean);
  const unknown_reasons = r.unknown.map(clean);
  const safe_next_action = safeAction(r.outcome);
  return {
    schema: 'dkskill.doctor_report/1', synthetic_test_only: input.synthetic_test_only ?? false,
    dkskill_version: input.dkskill_version ?? DKSKILL_VERSION, product: 'dkskill',
    environment: { platform: r.platform, os_version: input.host.os_version ? clean(input.host.os_version) : null, architecture: input.host.architecture, claude_code_version: input.host.version ? clean(input.host.version) : null, channel: input.host.channel ? clean(input.host.channel) : null, binary_identity_status, supported_platform: r.supported_platform },
    compatibility: { status: r.outcome, profile_id: r.profile_id, certification_status: r.certification_status, enforcement_decision: r.enforcement_decision },
    capabilities: r.capabilities, required_facets: r.facets,
    attribution_status: { in_scope: r.attribution.in_scope, note: clean(r.attribution.note) },
    blocked_reasons, unknown_reasons, safe_next_action, redaction_applied,
  };
}

function safeAction(outcome: DoctorReport['compatibility']['status']): string {
  switch (outcome) {
    case 'COMPATIBLE': return 'Environment is compatible with a certified profile. Enforcement may proceed at the configured level.';
    case 'PARTIALLY_COMPATIBLE': return 'Only degraded/limited operation is safe; some required facets are unresolved.';
    case 'UNVERIFIED': return 'Safety-critical operations remain blocked. This exact host is not certified yet (UNVERIFIED is not unsupported).';
    case 'UNSUPPORTED': return 'This platform/architecture/channel is outside the supported scope. No operation is claimed safe.';
    case 'BLOCKED': return 'A safety-critical capability is not verified. Operations remain blocked (fail closed).';
    case 'REVOKED': return 'The matching profile is revoked. Do not proceed.';
    case 'PROFILE_NOT_FOUND': return 'Provide exact product/version/platform/architecture/channel so the host can be identified.';
    case 'PROFILE_MISMATCH': return 'Identity resolves ambiguously/invalidly. Operations remain blocked.';
    case 'CAPABILITY_UNVERIFIED': return 'One or more required capabilities are unverified. Operations remain blocked.';
  }
}

// Actionable, secret-free text rendering.
export function renderDoctor(rep: DoctorReport): string {
  const e = rep.environment;
  const lines = [
    `dkskill doctor  (v${rep.dkskill_version})`, '',
    'Product:', `  ${rep.product}`, '',
    'Environment:',
    `  Platform: ${e.platform ?? 'UNKNOWN'}`, `  Architecture: ${e.architecture ?? 'UNKNOWN'}`,
    `  Claude Code: ${e.claude_code_version ?? 'UNKNOWN'}`, `  Channel: ${e.channel ?? 'UNKNOWN'}`,
    `  OS version: ${e.os_version ?? 'UNKNOWN'}`, `  Binary identity: ${e.binary_identity_status}`,
    `  Supported platform: ${e.supported_platform ? 'yes' : 'no'}`, '',
    'Compatibility:', `  Status: ${rep.compatibility.status}`,
    `  Profile: ${rep.compatibility.profile_id ?? 'none'}`, `  Certification: ${rep.compatibility.certification_status ?? 'none'}`, '',
    'Reasons:', ...(rep.blocked_reasons.length ? rep.blocked_reasons.map((r) => `  - ${r}`) : ['  - (none)']),
    ...(rep.unknown_reasons.length ? ['Unknown:', ...rep.unknown_reasons.map((r) => `  - ${r}`)] : []), '',
    'Action:', `  ${rep.safe_next_action}`,
  ];
  return lines.join('\n');
}
