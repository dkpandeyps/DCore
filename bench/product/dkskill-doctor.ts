// M16 — real read-only `dkskill doctor` entrypoint.
// Detects safe OS facts via node:os (read-only), leaves Claude Code version/channel/binary UNKNOWN (never guessed),
// invokes the frozen universal resolver, and prints an actionable, secret-free report. It authenticates nothing,
// reads no ~/.claude / credentials / OAuth / cookies, contacts no network, and spawns no subprocess.
import * as os from 'node:os';
import { runDoctor, renderDoctor } from './doctor.ts';
import { buildPublicDoctorReport, safeRealFacts, factsToHost } from './public-doctor.ts';
import type { UniversalHost } from '../compatibility/universal-compatibility-types.ts';

// Collect the real, safe host from this machine. Claude Code facts remain UNKNOWN (no safe probe exists yet).
export function realHost(): UniversalHost {
  return factsToHost(safeRealFacts({ platform: () => os.platform(), arch: () => os.arch(), release: () => os.release() }));
}

// The doctor entrypoint. Returns both machine-readable and human-readable output; performs no execution.
export function doctorMain(opts: { json?: boolean } = {}): { text: string; report: ReturnType<typeof buildPublicDoctorReport> } {
  const host = realHost();
  const report = buildPublicDoctorReport({ host });           // production registry (default); read-only
  const text = renderDoctor(runDoctor({ host }));
  if (opts.json) return { text: JSON.stringify(report, null, 2), report };
  return { text, report };
}

function main(): void {
  const json = process.argv.includes('--json');
  const { text, report } = doctorMain({ json });
  // eslint-disable-next-line no-console
  console.log(json ? JSON.stringify(report, null, 2) : text);
}

if (process.argv[1]?.endsWith('dkskill-doctor.ts')) main();
