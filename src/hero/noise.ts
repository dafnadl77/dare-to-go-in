function mulberry32(seed: number) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Seeded 2D value-noise sampler, returns values in [0, 1]. */
export function createValueNoise2D(seed = 1) {
  const size = 256;
  const mask = size - 1;
  const rand = mulberry32(seed);
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();

  return function sample(x: number, y: number): number {
    const xi = Math.floor(x) & mask;
    const yi = Math.floor(y) & mask;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const x1 = (xi + 1) & mask;
    const y1 = (yi + 1) & mask;
    const v00 = grid[yi * size + xi];
    const v10 = grid[yi * size + x1];
    const v01 = grid[y1 * size + xi];
    const v11 = grid[y1 * size + x1];
    const u = fade(xf);
    const v = fade(yf);
    return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
  };
}

/** Fractal (multi-octave) value noise for softer, more organic fields. */
export function createFbmNoise2D(seed = 1, octaves = 3) {
  const noise = createValueNoise2D(seed);
  return function sample(x: number, y: number): number {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let ampSum = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x * freq, y * freq) * amp;
      ampSum += amp;
      amp *= 0.55;
      freq *= 2.05;
    }
    return sum / ampSum;
  };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
