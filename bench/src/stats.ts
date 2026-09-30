// Statistics (methodology §6). Only computed from real observations passed in; nothing is estimated
// when there is no data (functions return null instead of a number).

// Zero-failure one-sided 95% upper bound: 1 - 0.05^(1/n) (§6.2).
export function zeroFailureUpperBound(n: number): number | null {
  return n > 0 ? 1 - Math.pow(0.05, 1 / n) : null;
}

function lnGamma(z: number): number {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function binomPmf(k: number, n: number, p: number): number {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}
function binomCdf(k: number, n: number, p: number): number {
  let s = 0;
  for (let i = 0; i <= k; i++) s += binomPmf(i, n, p);
  return Math.min(1, s);
}
function bisect(f: (p: number) => number, target: number, increasing: boolean): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const v = f(mid);
    if ((v < target) === increasing) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Two-sided exact (Clopper-Pearson) 95% interval for x successes in n trials.
export function clopperPearson(x: number, n: number, level = 0.95): { low: number; high: number } | null {
  if (n <= 0 || x < 0 || x > n) return null;
  const a = (1 - level) / 2;
  const low = x === 0 ? 0 : bisect((p) => 1 - binomCdf(x - 1, n, p), a, true);
  const high = x === n ? 1 : bisect((p) => binomCdf(x, n, p), a, false);
  return { low, high };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// p95 as the ceil(0.95 n)-th order statistic, only when n >= 20 (§6.3). Below 20: max, low_confidence.
export function p95(values: number[]): { value: number; low_confidence: boolean; quantile: 'p95' | 'max' } | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  if (s.length < 20) return { value: s[s.length - 1], low_confidence: true, quantile: 'max' };
  return { value: s[Math.ceil(0.95 * s.length) - 1], low_confidence: false, quantile: 'p95' };
}
