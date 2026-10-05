/**
 * Validates that bytes really are a JPEG / PNG / WebP image and reads their intrinsic size (needed so
 * the PDF can reserve the right aspect ratio, and so nothing that is not an image is ever embedded).
 * Pure; never throws.
 */
export interface ImageInfo {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
}

const MAX_DIMENSION = 12000;

export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  try {
    const info = jpeg(bytes) ?? png(bytes) ?? webp(bytes);
    if (!info) return null;
    if (!(info.width > 0 && info.height > 0 && info.width <= MAX_DIMENSION && info.height <= MAX_DIMENSION)) return null;
    return info;
  } catch {
    return null;
  }
}

function u16(b: Uint8Array, i: number): number {
  return (b[i] << 8) | b[i + 1];
}
function u32(b: Uint8Array, i: number): number {
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}

function jpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mime: 'image/jpeg', height: u16(b, i + 5), width: u16(b, i + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + u16(b, i + 2);
  }
  return null;
}

function png(b: Uint8Array): ImageInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || sig.some((v, i) => b[i] !== v)) return null;
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
  return { mime: 'image/png', width: u32(b, 16), height: u32(b, 20) };
}

function webp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30) return null;
  const tag = (i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return null;
  const kind = tag(12);
  if (kind === 'VP8X') {
    return { mime: 'image/webp', width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  if (kind === 'VP8 ') {
    return { mime: 'image/webp', width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  if (kind === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { mime: 'image/webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

/** Builds a data URI from already-validated bytes. */
export function toDataUri(bytes: Uint8Array, mime: ImageInfo['mime']): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

/**
 * The legacy storage form (`dreamImageDataUrl`): accepts ONLY a base64 data URI of a real image and
 * returns its validated bytes + info; anything else (a remote URL, another scheme, a mislabeled blob)
 * is rejected, so the exporter can never be steered into fetching or embedding something arbitrary.
 */
export function parseDataUriImage(value: unknown, maxBytes: number): { bytes: Uint8Array; info: ImageInfo } | null {
  if (typeof value !== 'string') return null;
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  if (match[1].length > Math.ceil((maxBytes * 4) / 3) + 4) return null;
  const bytes = new Uint8Array(Buffer.from(match[1], 'base64'));
  if (bytes.length === 0 || bytes.length > maxBytes) return null;
  const info = readImageInfo(bytes);
  return info ? { bytes, info } : null;
}
