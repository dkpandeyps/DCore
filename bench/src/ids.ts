// Identifier generation (data model §1): `<prefix>_<ulid>`.
// A ULID is 48 bits of time plus 80 bits of randomness, in Crockford base32 (26 chars).
// The generator is injectable so tests and fixtures are fully deterministic.
import { randomBytes, createHash } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PREFIXES = ['run', 'att', 'tev', 'pdc', 'evi', 'ver', 'met', 'fal', 'env', 'art', 'cal'] as const;
export type IdPrefix = (typeof PREFIXES)[number];

export interface IdSource {
  next(prefix: IdPrefix): string;
}

function encode(bytes: Uint8Array): string {
  // 16 bytes = 128 bits -> 26 base32 chars (first char carries 3 bits).
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = '';
  for (let i = 0; i < 26; i++) {
    out = CROCKFORD[Number(bits & 31n)] + out;
    bits >>= 5n;
  }
  return out;
}

function ulidBytes(timeMs: number, rand: Uint8Array): Uint8Array {
  const b = new Uint8Array(16);
  let t = BigInt(timeMs);
  for (let i = 5; i >= 0; i--) { b[i] = Number(t & 0xffn); t >>= 8n; }
  b.set(rand.subarray(0, 10), 6);
  return b;
}

export function realIds(now: () => number = Date.now): IdSource {
  return { next: (p) => `${p}_${encode(ulidBytes(now(), randomBytes(10)))}` };
}

// Deterministic source: fixed time base and a counter-seeded hash for the random part.
export function deterministicIds(seed: string, baseTimeMs = Date.UTC(2026, 0, 1)): IdSource {
  let n = 0;
  return {
    next: (p) => {
      n++;
      const r = createHash('sha256').update(`${seed}:${p}:${n}`).digest();
      return `${p}_${encode(ulidBytes(baseTimeMs + n, r))}`;
    },
  };
}

export const ULID_RE = '[0-9A-HJKMNP-TV-Z]{26}';
