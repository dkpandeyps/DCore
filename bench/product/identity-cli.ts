// M17 — `dkskill identity` entrypoint + doctor+identity composition. Read-only, no execution, no credentials, no
// network. Extends M16 `dkskill doctor` behavior by composition (frozen files unmodified). A real read-only binary
// fs is provided for an explicitly-supplied binary path only; tests inject a fake fs so nothing real is touched.
import * as os from 'node:os';
import { statSync, realpathSync, readFileSync } from 'node:fs';
import { observeClaudeIdentity, observationToHost, resolveWithIdentity, isSafeBinaryPath } from './claude-identity-probe.ts';
import { runDoctor, renderDoctor } from './doctor.ts';
import { safeRealFacts } from './public-doctor.ts';
import type { ClaudeIdentityObservation, ExplicitIdentity, LocalMetadata, ReadOnlyBinFs } from './claude-identity-probe.ts';
import type { Registry } from '../tools/gen-compatibility-registry.ts';

// Real read-only binary fs: only ever used on an explicitly-supplied, safety-checked path. No execution, no writes.
export function nodeReadOnlyBinFs(): ReadOnlyBinFs {
  return {
    isFile: (p) => { try { return isSafeBinaryPath(p) && statSync(p).isFile(); } catch { return false; } },
    realpath: (p) => { try { return realpathSync(p); } catch { return p; } },
    readBytes: (p) => { try { return isSafeBinaryPath(p) ? new Uint8Array(readFileSync(p)) : null; } catch { return null; } },
    size: (p) => { try { return isSafeBinaryPath(p) ? statSync(p).size : null; } catch { return null; } },
  };
}

export function observeReal(input: { explicit?: ExplicitIdentity; local_metadata?: LocalMetadata; fs?: ReadOnlyBinFs; now: string } = { now: new Date().toISOString() }): ClaudeIdentityObservation {
  const facts = safeRealFacts({ platform: () => os.platform(), arch: () => os.arch(), release: () => os.release() });
  return observeClaudeIdentity({ explicit: input.explicit, local_metadata: input.local_metadata, os_facts: facts, fs: input.fs ?? nodeReadOnlyBinFs(), now: input.now });
}

export function renderIdentity(obs: ClaudeIdentityObservation): string {
  const s = (v: string | null, state: string) => (state === 'OBSERVED' ? (v ?? 'UNKNOWN') : state);
  return [
    'Claude Code:',
    `  version: ${s(obs.claude_version, obs.version_state)}`,
    `  channel: ${s(obs.channel, obs.channel_state)}`,
    `  binary: ${obs.binary_path_state === 'OBSERVED' ? 'observed' : obs.binary_path_state}`,
    `  binary SHA-256: ${obs.binary_hash_state === 'OBSERVED' ? obs.binary_sha256 : obs.binary_hash_state}`,
    `  identity status: ${obs.identity_status}`,
    `  provenance: version=${obs.provenance.version}, channel=${obs.provenance.channel}, binary=${obs.provenance.binary_sha256}`,
  ].join('\n');
}

// Doctor + identity composition (does not modify the frozen doctor). Identity only improves resolution; the resolver
// stays authoritative and CONTRADICTED/UNKNOWN/INCOMPLETE never become COMPATIBLE.
export function doctorWithIdentity(input: { explicit?: ExplicitIdentity; local_metadata?: LocalMetadata; fs?: ReadOnlyBinFs; registry?: Registry; now: string; synthetic_test_only?: boolean }): { observation: ClaudeIdentityObservation; text: string; outcome: string } {
  const observation = observeReal({ explicit: input.explicit, local_metadata: input.local_metadata, fs: input.fs, now: input.now });
  const host = observationToHost(observation);
  const rep = runDoctor({ host, registry: input.registry, synthetic_test_only: input.synthetic_test_only });
  const text = `${renderDoctor(rep)}\n\n${renderIdentity(observation)}`;
  return { observation, text, outcome: rep.compatibility.status };
}

export function identityMain(opts: { json?: boolean } = {}): { text: string; observation: ClaudeIdentityObservation } {
  const observation = observeReal({ now: new Date().toISOString() });   // no explicit input => Claude facts UNKNOWN
  return { text: opts.json ? JSON.stringify(observation, null, 2) : renderIdentity(observation), observation };
}

function main(): void {
  const json = process.argv.includes('--json');
  // eslint-disable-next-line no-console
  console.log(identityMain({ json }).text);
}
if (process.argv[1]?.endsWith('identity-cli.ts')) main();

export { resolveWithIdentity };
