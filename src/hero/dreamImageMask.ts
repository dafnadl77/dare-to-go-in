// Draws the exact organic "revealed through an opening in the clouds"
// silhouette directly into a live <canvas> that DreamReconstruction keeps
// mounted and displays in place of an <img> — instead of relying on CSS
// `mask-image`/`-webkit-mask-image`, and instead of round-tripping through
// a PNG data URL handed to a fresh <img>.
//
// History, because both prior approaches were independently confirmed
// broken in the field despite passing every remote check:
//
// 1) CSS mask-image (external file, then inlined base64, then that data
//    URI downscaled 10x): computed `mask-image` and the referenced bitmap
//    always checked out correct, yet production kept showing a fully
//    unmasked rectangle. Root cause found directly on production: applying
//    mask-image forces the browser to rasterize the element into an
//    intermediate compositing layer, and THAT layer never repainted when
//    the image content underneath changed — invisible to any DOM/CSS
//    inspection, since those all read the underlying resource, not the
//    stale compositing layer painted from it.
//
// 2) Baking the mask into a PNG via <canvas>, then handing that data URL
//    to a plain <img>: verified via getImageData — sampled live, on the
//    user's own machine, straight off the actual on-screen <img> — that
//    the decoded bitmap's alpha channel was 100% correct (transparent
//    corners, opaque center) and confirmed zero CSS mask left anywhere on
//    the element. The screen STILL showed a plain rectangle. That leaves
//    only the final paint step for that specific <img>/data-URI/alpha-PNG
//    combination as the remaining suspect.
//
// This draws directly into a <canvas> that stays in the DOM as the actual
// displayed element — no PNG re-encode, no second <img> decode, a
// completely different rendering code path than either attempt above.

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
 * Draws `imageUrl` into `canvas`, masked to the dream-mask silhouette
 * (flood-filled from the supplied reference outline, ~90-115px feather
 * baked into its own alpha channel) — opaque only inside the organic
 * shape, fully transparent outside it. The photo is drawn using the same
 * object-fit:cover math the CSS box already used, sized to the mask
 * bitmap's own ~16:9 aspect ratio so it matches the arrival box directly.
 * Sets the canvas's pixel-buffer width/height to the mask's own
 * resolution; CSS sizing (width/height:100% on .dr-image) scales that to
 * the real rendered box, same as it did for the <img> before it.
 */
export async function drawDreamImageMask(canvas: HTMLCanvasElement, imageUrl: string): Promise<void> {
  const [photo, mask] = await Promise.all([loadImage(imageUrl), getMaskImage()]);

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

  ctx.clearRect(0, 0, cw, ch);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(photo, dx, dy, dw, dh);

  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0, cw, ch);
  ctx.globalCompositeOperation = 'source-over';
}
