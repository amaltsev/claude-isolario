// 2D simplex noise and the fractal sums built on it.

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRADIENTS = 16;
const GX = new Float64Array(GRADIENTS);
const GY = new Float64Array(GRADIENTS);
for (let i = 0; i < GRADIENTS; i++) {
  const a = (2 * Math.PI * (i + 0.5)) / GRADIENTS;
  GX[i] = Math.cos(a);
  GY[i] = Math.sin(a);
}

/** Returns noise(x, y) in roughly [-1, 1], seeded from `rng`. */
export function makeNoise(rng) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  return function noise(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let a = 0.5 - x0 * x0 - y0 * y0;
    if (a > 0) {
      const g = perm[ii + perm[jj]] % GRADIENTS;
      a *= a;
      n += a * a * (GX[g] * x0 + GY[g] * y0);
    }
    a = 0.5 - x1 * x1 - y1 * y1;
    if (a > 0) {
      const g = perm[ii + i1 + perm[jj + j1]] % GRADIENTS;
      a *= a;
      n += a * a * (GX[g] * x1 + GY[g] * y1);
    }
    a = 0.5 - x2 * x2 - y2 * y2;
    if (a > 0) {
      const g = perm[ii + 1 + perm[jj + 1]] % GRADIENTS;
      a *= a;
      n += a * a * (GX[g] * x2 + GY[g] * y2);
    }
    return 99.2 * n;
  };
}

/** Fractal Brownian motion: octaves of noise, normalised back to [-1, 1]. */
export function fbm(noise, x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    // Offset each octave so their lattices do not line up at the origin.
    sum += amp * noise(x + o * 17.31, y - o * 9.73);
    norm += amp;
    amp *= gain;
    x *= lacunarity;
    y *= lacunarity;
  }
  return sum / norm;
}

/** Ridged fractal in [0, 1]: sharp crests where the noise crosses zero. */
export function ridged(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const r = 1 - Math.abs(noise(x - o * 31.7, y + o * 12.9));
    sum += amp * r * r;
    norm += amp;
    amp *= gain;
    x *= lacunarity;
    y *= lacunarity;
  }
  return sum / norm;
}
