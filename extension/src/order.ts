// Deterministic seeded shuffle (contract §2.2). Pure — no Math.random. Same (ids, seed) ALWAYS
// yields the same order, so Plan 3 reconstructs a randomized session's order from shuffleSeed.

// mulberry32: a tiny, well-distributed 32-bit seeded PRNG. Deterministic per seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleIds(ids: string[], seed: number): string[] {
  const out = [...ids];               // copy: never mutate the caller's array
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {   // Fisher–Yates with the seeded PRNG
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;   // 32-bit int; used when orderMode === 'random'
}
