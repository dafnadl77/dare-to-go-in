// Bakes the exact organic "revealed through an opening in the clouds"
// silhouette directly into the settled dream image's own pixels (a canvas
// destination-in composite against the supplied mask bitmap), instead of
// relying on the CSS `mask-image`/`-webkit-mask-image` property at display
// time.
//
// Why: every previous attempt (external mask file, then inlined as a base64
// data URI, then that same data URI downscaled 10x to cut decode/paint cost)
// was verified correct from this end every single time — computed
// `mask-image` value, the exact referenced bitmap rasterized and its alpha
// silhouette measured pixel-by-pixel — yet the user kept reproducing a fully
// UNMASKED rectangle in production, including in a brand-new Incognito
// window (ruling out cache/extensions). That means the failure is in the
// browser's mask *paint* step itself, not in anything inspectable from the
// CSS/DOM side, and there was never a way to rule out a `mask-image`
// rendering quirk as the real cause.
//
// Compositing client-side with <canvas> sidesteps CSS masking entirely: the
// transparency is baked into the resulting PNG's own alpha channel before it
// ever becomes an <img> src, so displaying it afterwards is just an ordinary
// image — nothing left for `mask-image` support/timing to get wrong.

const MASK_URL = '/dream-mask-visible.png';

let maskImagePromise: Promise<HTMLImageElement> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load image: ${src}`));
    img.src = src;
  });
}

function getMaskImage(): Promise<HTMLImageElement> {
  if (!maskImagePromise) maskImagePromise = loadImage(MASK_URL);
  return maskImagePromise;
}

/**
 * Returns a data URL of `imageUrl` with the dream-mask silhouette (flood-
 * filled from the supplied reference outline, ~90-115px feather baked into
 * its own alpha channel) composited in — opaque only inside the organic
 * shape, fully transparent outside it. The photo is drawn into the mask's
 * own canvas using the same object-fit:cover math the CSS box already uses,
 * so the result matches the arrival box's ~16:9 aspect ratio directly.
 */
export async function compositeDreamImageMask(imageUrl: string): Promise<string> {
  const [photo, mask] = await Promise.all([loadImage(imageUrl), getMaskImage()]);

  const canvas = document.createElement('canvas');
  canvas.width = mask.naturalWidth;
  canvas.height = mask.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');

  const cw = canvas.width;
  const ch = canvas.height;
  const iw = photo.naturalWidth;
  const ih = photo.naturalHeight;
  const scale = Math.max(cw / iw, ch / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  ctx.drawImage(photo, dx, dy, dw, dh);

  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0, cw, ch);

  return canvas.toDataURL('image/png');
}
