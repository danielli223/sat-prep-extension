// Coarse, deterministic buckets so raw counts/durations never leave the device and analytics stay
// aggregate. Pure functions, timezone-agnostic (UTC epoch math only).
export function countBucket(n: number): string {
  if (n <= 5) return '1-5';
  if (n <= 20) return '6-20';
  if (n <= 50) return '21-50';
  return '51+';
}
export function accuracyBucket(pct: number): string {
  if (pct < 50) return '0-49';
  if (pct < 70) return '50-69';
  if (pct < 85) return '70-84';
  return '85-100';
}
export function durationBucket(ms: number): string {
  if (ms <= 60_000) return '0-1m';
  if (ms <= 300_000) return '1-5m';
  if (ms <= 900_000) return '5-15m';
  if (ms <= 3_600_000) return '15-60m';
  return '60m+';
}
export function daysSinceInstallBucket(installedAtIso: string, nowMs: number): string {
  const days = Math.floor((nowMs - Date.parse(installedAtIso)) / 86_400_000);
  if (days <= 0) return 'day_0';
  if (days <= 7) return 'day_1-7';
  if (days <= 30) return 'day_8-30';
  if (days <= 90) return 'day_31-90';
  return 'day_90+';
}
