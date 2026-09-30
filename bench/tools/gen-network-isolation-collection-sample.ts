// M10 — deterministic read-only collection artifacts + SYNTHETIC_TEST_ONLY fixtures.
// No real command runs here (synthetic source results only), so samples are reproducible. READ-ONLY: no OS/network
// change, no external contact, no Claude, no auth, no spend. Host self-inspection is never L4, so the current
// environment stays UNVERIFIED. The synthetic L4 fixture does NOT change real M8 state. Fixed clock.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { FROZEN_HOST, FROZEN_ENVIRONMENT } from '../compatibility/network-isolation.ts';
import { runCollection, buildAuditRecord } from '../compatibility/network-isolation-collection.ts';
import type {
  CollectionRequest, SourceResult, CollectionEvidenceClass, CollectionScope, CollectionMechanism, SourceStatus, Signal,
} from '../compatibility/network-isolation-collection-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-29T00:00:00Z';
export const SYN = 'SYNTHETIC_TEST_ONLY';

export function request(over: Partial<CollectionRequest> = {}): CollectionRequest {
  return {
    schema: 'dkskill.network_isolation_collection_request/1', version: 1, request_id: 'col-req-real',
    environment_id: FROZEN_ENVIRONMENT, host_identity: FROZEN_HOST, os: 'Windows 11', architecture: 'x64',
    collection_mode: 'READ_ONLY', requested_scope: 'OUTBOUND_DENY', requested_at: FIXED(), ...over,
  };
}

function src(o: Partial<SourceResult> & { command_id: string; mechanism: CollectionMechanism; evidence_class: CollectionEvidenceClass; status: SourceStatus; signal: Signal }): SourceResult {
  return { command_id: o.command_id, mechanism: o.mechanism, evidence_class: o.evidence_class, scope: o.scope ?? 'HOST_ONLY', signal: o.signal, status: o.status, raw_output: o.raw_output ?? `${SYN} ${o.mechanism} output`, observed_at: o.observed_at ?? FIXED(), expires_at: o.expires_at ?? null, max_age_ms: o.max_age_ms ?? null, revoked: o.revoked ?? false, ...(o.source_environment_id !== undefined ? { source_environment_id: o.source_environment_id } : {}), ...(o.source_host_id !== undefined ? { source_host_id: o.source_host_id } : {}) };
}

const FW_CFG = () => src({ command_id: 'FW_PROFILES', mechanism: 'FIREWALL_PROFILES', evidence_class: 'CONFIGURATION_EVIDENCE', scope: 'FIREWALL_POLICY', status: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', raw_output: `${SYN} DefaultOutboundAction: Block` });
const FW_STATE = () => src({ command_id: 'FW_STATE', mechanism: 'WINDOWS_FIREWALL_STATE', evidence_class: 'HOST_OBSERVATION', scope: 'HOST_ONLY', status: 'OBSERVED', signal: 'ISOLATION_SUPPORTING' });
const ROUTES = () => src({ command_id: 'ROUTES', mechanism: 'ROUTING_STATE', evidence_class: 'HOST_OBSERVATION', scope: 'HOST_ONLY', status: 'OBSERVED', signal: 'NEUTRAL' });
const ADAPTERS = () => src({ command_id: 'ADAPTERS', mechanism: 'NETWORK_ADAPTER_STATE', evidence_class: 'HOST_OBSERVATION', scope: 'HOST_ONLY', status: 'OBSERVED', signal: 'NEUTRAL' });
const PROXY = () => src({ command_id: 'PROXY', mechanism: 'PROXY_CONFIG', evidence_class: 'CONFIGURATION_EVIDENCE', scope: 'HOST_ONLY', status: 'OBSERVED', signal: 'NEUTRAL' });
const DNS = () => src({ command_id: 'DNS', mechanism: 'DNS_CONFIG', evidence_class: 'CONFIGURATION_EVIDENCE', scope: 'HOST_ONLY', status: 'OBSERVED', signal: 'NEUTRAL' });
const CONN_OK = () => src({ command_id: 'CONNECTIONS', mechanism: 'ACTIVE_CONNECTIONS', evidence_class: 'HOST_OBSERVATION', scope: 'HOST_ONLY', status: 'OBSERVED', signal: 'NEUTRAL' });
const CONN_LEAK = () => src({ command_id: 'CONNECTIONS', mechanism: 'ACTIVE_CONNECTIONS', evidence_class: 'HOST_OBSERVATION', scope: 'HOST_ONLY', status: 'OBSERVED', signal: 'LEAK_OBSERVED', raw_output: `${SYN} TCP established outbound` });
const PROCNET = () => src({ command_id: 'PROCNET', mechanism: 'PROCESS_NETWORK_ASSOCIATION', evidence_class: 'HOST_OBSERVATION', scope: 'PROCESS_ONLY', status: 'OBSERVED', signal: 'NEUTRAL' });
const L4_INDEP = () => src({ command_id: 'INDEP', mechanism: 'ISOLATED_ENV_CONTROLS', evidence_class: 'INDEPENDENT_VERIFICATION', scope: 'OUTBOUND_DENY', status: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', raw_output: `${SYN} external observer: outbound denied` });

function run(sources: SourceResult[], over: Partial<CollectionRequest> = {}, synthetic = true) {
  return runCollection({ request: request(over), sources, now: FIXED(), synthetic_test_only: synthetic });
}

export const fixtures = {
  currentReal: () => runCollection({ request: request({ request_id: 'col-req-current-real' }), sources: [FW_CFG(), FW_STATE(), ROUTES(), ADAPTERS(), PROXY(), DNS(), CONN_OK(), PROCNET()], now: FIXED(), synthetic_test_only: false, performed_real_inspection: false }),
  allUnknown: () => run([src({ command_id: 'FW_STATE', mechanism: 'WINDOWS_FIREWALL_STATE', evidence_class: 'HOST_OBSERVATION', status: 'UNKNOWN', signal: 'NEUTRAL' })]),
  firewallConfigOnly: () => run([FW_CFG()]),
  firewallPlusHost: () => run([FW_CFG(), FW_STATE()]),
  routingObservation: () => run([ROUTES()]),
  activeConnectionContradiction: () => run([FW_CFG(), CONN_LEAK()]),
  proxyObservation: () => run([PROXY()]),
  adapterObservation: () => run([ADAPTERS()]),
  procNetObservation: () => run([PROCNET()]),
  environmentMismatch: () => run([src({ command_id: 'INDEP', mechanism: 'ISOLATED_ENV_CONTROLS', evidence_class: 'INDEPENDENT_VERIFICATION', scope: 'OUTBOUND_DENY', status: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', source_environment_id: 'OTHER-ENV' })]),
  hostMismatch: () => run([src({ command_id: 'INDEP', mechanism: 'ISOLATED_ENV_CONTROLS', evidence_class: 'INDEPENDENT_VERIFICATION', scope: 'OUTBOUND_DENY', status: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', source_host_id: 'F'.repeat(64) })]),
  stale: () => run([src({ command_id: 'INDEP', mechanism: 'ISOLATED_ENV_CONTROLS', evidence_class: 'INDEPENDENT_VERIFICATION', scope: 'OUTBOUND_DENY', status: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', observed_at: '2026-09-01T00:00:00Z', max_age_ms: 3600000 })]),
  expired: () => run([src({ command_id: 'INDEP', mechanism: 'ISOLATED_ENV_CONTROLS', evidence_class: 'INDEPENDENT_VERIFICATION', scope: 'OUTBOUND_DENY', status: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', expires_at: '2026-01-01T00:00:00Z' })]),
  revoked: () => run([src({ command_id: 'INDEP', mechanism: 'ISOLATED_ENV_CONTROLS', evidence_class: 'INDEPENDENT_VERIFICATION', scope: 'OUTBOUND_DENY', status: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', revoked: true })]),
  secretContaining: () => run([src({ command_id: 'CONNECTIONS', mechanism: 'ACTIVE_CONNECTIONS', evidence_class: 'HOST_OBSERVATION', scope: 'HOST_ONLY', status: 'OBSERVED', signal: 'NEUTRAL', raw_output: 'proxy user pass: password=SuperSecret123 bearer aa11bb22cc' })]),
  contradictory: () => run([L4_INDEP(), CONN_LEAK()]),
  l3Mechanics: () => run([FW_CFG(), FW_STATE(), src({ command_id: 'PROBE', mechanism: 'ACTIVE_CONNECTIONS', evidence_class: 'CONTROLLED_BEHAVIOR_EVIDENCE', scope: 'OUTBOUND_DENY', status: 'OBSERVED', signal: 'ISOLATION_SUPPORTING' })]),
  l4Mechanics: () => run([FW_CFG(), FW_STATE(), L4_INDEP()]),
  completeReadOnly: () => run([FW_CFG(), FW_STATE(), ROUTES(), ADAPTERS(), PROXY(), DNS(), CONN_OK(), PROCNET()]),
  blocked: () => runCollection({ request: request({ collection_mode: 'READ_ONLY' }), sources: [FW_CFG()], now: FIXED(), synthetic_test_only: true, writeRequested: true }),
  failed: () => run([src({ command_id: 'INDEP', mechanism: 'ISOLATED_ENV_CONTROLS', evidence_class: 'INDEPENDENT_VERIFICATION', scope: 'OUTBOUND_DENY', status: 'UNSUPPORTED', signal: 'ISOLATION_SUPPORTING' })]),
};

export function tamperedAuditDemo() {
  const rec = buildAuditRecord(fixtures.currentReal(), FIXED(), null);
  return { ...rec, network_isolation: 'VERIFIED' as const };   // flipped after hashing -> record_hash stale
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const files: [string, unknown][] = [
    ['nic-sample-current-real.json', fixtures.currentReal()],
    ['nic-sample-firewall-config-only.json', fixtures.firewallConfigOnly()],
    ['nic-sample-firewall-plus-host.json', fixtures.firewallPlusHost()],
    ['nic-sample-routing.json', fixtures.routingObservation()],
    ['nic-sample-active-connection-contradiction.json', fixtures.activeConnectionContradiction()],
    ['nic-sample-proxy.json', fixtures.proxyObservation()],
    ['nic-sample-adapter.json', fixtures.adapterObservation()],
    ['nic-sample-procnet.json', fixtures.procNetObservation()],
    ['nic-sample-stale.json', fixtures.stale()],
    ['nic-sample-expired.json', fixtures.expired()],
    ['nic-sample-revoked.json', fixtures.revoked()],
    ['nic-sample-secret-redaction.json', fixtures.secretContaining()],
    ['nic-sample-l4-mechanics.json', fixtures.l4Mechanics()],
    ['nic-sample-blocked.json', fixtures.blocked()],
    ['nic-sample-failed.json', fixtures.failed()],
  ];
  for (const [name, obj] of files) writeFileSync(join(OUT, name), canonicalFile(obj));
  const r = fixtures.currentReal();
  console.log(`M10 samples: current-real=${r.result_state}/${r.network_isolation} (lvl ${r.achieved_level}, indep=${r.independence_satisfied}); l4=${fixtures.l4Mechanics().network_isolation}; contradiction=${fixtures.contradictory().network_isolation}; secret-redacted=${fixtures.secretContaining().evidence[0].redaction_applied}`);
}

if (process.argv[1]?.endsWith('gen-network-isolation-collection-sample.ts')) main();
