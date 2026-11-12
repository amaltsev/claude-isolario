// Seeded randomness. Everything in Isolario flows from one seed string, so the
// same seed always yields the same island, down to the last tree.

/** xmur3: turns a string into a stream of well-mixed 32-bit integers. */
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export class Rng {
  constructor(seed) {
    this.seed = String(seed);
    const h = hashString(this.seed);
    this.a = h();
    this.b = h();
    this.c = h();
    this.d = h();
    for (let i = 0; i < 12; i++) this.next();
  }

  /** sfc32: next unsigned 32-bit integer. */
  next() {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  float() {
    return this.next() / 4294967296;
  }

  /** Uniform float in [lo, hi). */
  range(lo, hi) {
    return lo + (hi - lo) * this.float();
  }

  /** Uniform integer in [lo, hi], inclusive at both ends. */
  int(lo, hi) {
    return lo + Math.floor(this.float() * (hi - lo + 1));
  }

  chance(p) {
    return this.float() < p;
  }

  pick(list) {
    return list[Math.floor(this.float() * list.length)];
  }

  /** Pick from [[item, weight], ...]. */
  weighted(pairs) {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let r = this.float() * total;
    for (const [item, w] of pairs) {
      r -= w;
      if (r < 0) return item;
    }
    return pairs[pairs.length - 1][0];
  }

  /** Roughly normal, mean 0 and standard deviation 1. */
  gauss() {
    let s = 0;
    for (let i = 0; i < 6; i++) s += this.float();
    return (s - 3) * Math.SQRT2;
  }

  /** Fisher-Yates, in place. */
  shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  /**
   * An independent stream named by `label`. A fork depends only on the seed
   * and the label, never on how much of the parent has been consumed, so
   * changing one stage of generation cannot disturb another.
   */
  fork(label) {
    return new Rng(`${this.seed}/${label}`);
  }
}
