import type { Envelope } from './types';

export function mergeRecord<T extends Envelope>(local: T | undefined, remote: T | undefined): T | undefined {
  if (!local) return remote;
  if (!remote) return local;
  return remote.updatedAt > local.updatedAt ? remote : local;
}

export function mergeCollections<T extends Envelope>(local: T[], remote: T[], keyOf: (r: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const r of local) byKey.set(keyOf(r), r);
  for (const r of remote) { const k = keyOf(r); byKey.set(k, mergeRecord(byKey.get(k), r)!); }
  return [...byKey.values()].filter((r) => !r.deleted);
}
