const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

/**
 * Human friendly numbers: 999 → "999", 1234 → "1.2K", 3.4e6 → "3.4M",
 * beyond the named suffixes → scientific notation "1.23e21".
 */
export function formatNumber(n: number, decimalsUnder1000 = 0): string {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + formatNumber(-n, decimalsUnder1000);
  if (n < 1000) {
    if (decimalsUnder1000 > 0 && n < 100 && Math.abs(n - Math.round(n)) > 1e-9) {
      // Up to `decimalsUnder1000` decimals, trailing zeros removed.
      return trimZeros(n.toFixed(n < 10 ? decimalsUnder1000 : Math.min(1, decimalsUnder1000)));
    }
    return String(Math.floor(n + 1e-9));
  }
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier < SUFFIXES.length) {
    const scaled = n / Math.pow(1000, tier);
    // Floor (not round) so "999.96K" never displays as "1000K".
    const d = scaled < 100 ? 1 : 0;
    const f = Math.pow(10, d);
    const v = Math.floor(scaled * f + 1e-9) / f;
    return trimZeros(v.toFixed(d)) + SUFFIXES[tier];
  }
  const exp = Math.floor(Math.log10(n));
  const mant = n / Math.pow(10, exp);
  return `${(Math.floor(mant * 100) / 100).toFixed(2)}e${exp}`;
}

/** Rates keep one decimal for small values: "0.5", "12.3", "1.2K". */
export function formatRate(n: number): string {
  if (n > 0 && n < 0.1) return '<0.1';
  return formatNumber(n, 1);
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** "2 h 05 min", "3 min 12 s", "45 s". */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds)) return '∞';
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, '0')} s`;
  return `${sec} s`;
}
