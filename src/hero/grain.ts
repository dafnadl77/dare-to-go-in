/** A small tileable grayscale noise texture used for a subtle film-grain overlay. */
export function createGrainTile(size = 128, seed = 42): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < imageData.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    imageData.data[i] = v;
    imageData.data[i + 1] = v;
    imageData.data[i + 2] = v;
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return tile;
}
