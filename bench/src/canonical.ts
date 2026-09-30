// Deterministic serialization and hashing (data model §1: hashes are `sha256:<hex>`).
import { createHash } from 'node:crypto';

// Canonical JSON: object keys sorted, no insignificant whitespace, arrays in order.
// `undefined` members are dropped (as JSON.stringify does).
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

// Pretty canonical form used for files on disk: sorted keys, 2-space indent, trailing newline.
export function canonicalFile(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2) + '\n';
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortDeep(x);
    }
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('non-finite number is not serializable');
  return v;
}

export function sha256(data: string | Uint8Array): string {
  return 'sha256:' + createHash('sha256').update(data).digest('hex');
}

export function hashOf(value: unknown): string {
  return sha256(canonicalJson(value));
}
