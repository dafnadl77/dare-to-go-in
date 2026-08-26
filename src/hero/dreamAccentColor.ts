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
