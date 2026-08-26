/**
 * Extracts one accent color from a generated dream image — reusable
 * anywhere the experience needs a "this dream's own color" rather than a
 * fixed teal/gold: the portal's light and particles, the dream-world
 * ambience, the final-choice energy rings. A flat pixel average tends to
 * collapse toward muddy grey-brown for photographic images, so this
 * instead favors the most saturated, reasonably bright pixel — closer to
 * what a person would call "the color of this scene" — falling back to a
 * plain average only when the image is essentially monochrome, and to a
 * warm neutral if extraction fails outright (never a hard error).
 */
export interface AccentColor {
  r: number;
  g: number;
  b: number;
  css: string;
  cssAlpha: (alpha: number) => string;
}

function makeAccent(r: number, g: number, b: number): AccentColor {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const rr = clamp(r);
  const gg = clamp(g);
  const bb = clamp(b);
  return {
    r: rr,
    g: gg,
    b: bb,
    css: `rgb(${rr}, ${gg}, ${bb})`,
    cssAlpha: (alpha: number) => `rgba(${rr}, ${gg}, ${bb}, ${alpha})`,
  };
}

export const FALLBACK_ACCENT: AccentColor = makeAccent(224, 190, 140);

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hh < 60) [r1, g1, b1] = [c, x, 0];
  else if (hh < 120) [r1, g1, b1] = [x, c, 0];
  else if (hh < 180) [r1, g1, b1] = [0, c, x];
  else if (hh < 240) [r1, g1, b1] = [0, x, c];
  else if (hh < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

/** Amplifies a sampled color into a "fantasy" luminous version of itself —
    boosted saturation and a lightness pulled toward a glowing mid-range —
    rather than reproducing the source photo's often-subdued grading. */
function amplify(r: number, g: number, b: number): AccentColor {
  const [h, s, l] = rgbToHsl(r, g, b);
  const ampS = Math.min(1, Math.max(s, 0.6));
  const ampL = Math.min(0.72, Math.max(0.42, l * 0.6 + 0.32));
  const [rr, gg, bb] = hslToRgb(h, ampS, ampL);
  return makeAccent(rr, gg, bb);
}

const FALLBACK_PALETTE: AccentColor[] = [makeAccent(224, 190, 140), makeAccent(140, 170, 224), makeAccent(200, 140, 224)];

/**
 * Extracts a small harmonious palette (several distinct hues) from a
 * generated dream image, each amplified into a saturated, luminous
 * "fantasy" version of itself — for the dream-arrival atmosphere, where a
 * single flat accent reads as too muted. Guarantees at least `count`
 * colors even for a near-monochrome source photo by hue-rotating the
 * strongest found color rather than ever returning a dull result.
 */
export function extractDreamPalette(img: HTMLImageElement, count = 4): AccentColor[] {
  try {
    if (!img.naturalWidth || !img.naturalHeight) return FALLBACK_PALETTE;
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return FALLBACK_PALETTE;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const bins = 12;
    const binBest = new Array(bins).fill(null) as ({ r: number; g: number; b: number; score: number } | null)[];
    const binCount = new Array(bins).fill(0);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 200) continue;
      const [h, s, l] = rgbToHsl(r, g, b);
      if (s < 0.15 || l < 0.08 || l > 0.92) continue; // skip near-grey/near-black/near-white
      const bin = Math.floor(h / (360 / bins)) % bins;
      binCount[bin] += 1;
      const score = s * (1 - Math.abs(l - 0.5));
      const current = binBest[bin];
      if (!current || score > current.score) {
        binBest[bin] = { r, g, b, score };
      }
    }

    const populated = binBest
      .map((entry, i) => (entry ? { entry, popularity: binCount[i] } : null))
      .filter((x): x is { entry: { r: number; g: number; b: number; score: number }; popularity: number } => x !== null)
      .sort((a, b) => b.popularity - a.popularity);

    const palette: AccentColor[] = populated.slice(0, count).map((p) => amplify(p.entry.r, p.entry.g, p.entry.b));

    if (palette.length === 0) return FALLBACK_PALETTE;

    // Not enough distinct hues in the source (a very desaturated/calm
    // photo) — synthesize a harmonious spread from the strongest hue found
    // rather than leaving the arrival scene monochrome.
    while (palette.length < count) {
      const base = palette[0];
      const [h, s, l] = rgbToHsl(base.r, base.g, base.b);
      const step = palette.length;
      const [rr, gg, bb] = hslToRgb(h + step * 42, Math.max(s, 0.55), Math.min(0.68, Math.max(0.46, l)));
      palette.push(amplify(rr, gg, bb));
    }

    return palette;
  } catch {
    return FALLBACK_PALETTE;
  }
}

export function extractAccentColor(img: HTMLImageElement): AccentColor {
  try {
    if (!img.naturalWidth || !img.naturalHeight) return FALLBACK_ACCENT;
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return FALLBACK_ACCENT;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let bestR = 0;
    let bestG = 0;
    let bestB = 0;
    let bestScore = -1;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 200) continue;
      sumR += r;
      sumG += g;
      sumB += b;
      count += 1;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const brightness = max / 255;
      // Favor saturated AND reasonably bright pixels so a near-black
      // shadow that happens to be technically "saturated" never wins.
      const score = saturation * Math.min(1, brightness * 1.4);
      if (score > bestScore) {
        bestScore = score;
        bestR = r;
        bestG = g;
        bestB = b;
      }
    }

    if (count === 0) return FALLBACK_ACCENT;
    if (bestScore < 0.12) {
      // Essentially monochrome/desaturated — a plain average reads more
      // honestly than forcing a pick from noise.
      return makeAccent(sumR / count, sumG / count, sumB / count);
    }
    return makeAccent(bestR, bestG, bestB);
  } catch {
    return FALLBACK_ACCENT;
  }
}
