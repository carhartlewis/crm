/** Twice the largest avatar on screen, so it stays sharp on a dense display. */
export const AVATAR_PIXELS = 256;

/** The largest square in the middle of a `width` × `height` picture. */
export function centreSquare(width: number, height: number) {
  const side = Math.min(width, height);

  return { x: (width - side) / 2, y: (height - side) / 2, side };
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The image could not be drawn"))),
      "image/webp",
      0.9,
    );
  });
}

async function base64Of(blob: Blob): Promise<string> {
  return new Uint8Array(await blob.arrayBuffer()).toBase64();
}

/**
 * The middle square of a picture, 256 px across, as base64 WebP (PNG where the browser cannot
 * write WebP), without a `data:` prefix. Drawing it again also drops the file's metadata, such
 * as where a phone took it. Throws when the browser cannot read the file as an image.
 */
export async function squareAvatar(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { x, y, side } = centreSquare(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");

  canvas.width = AVATAR_PIXELS;
  canvas.height = AVATAR_PIXELS;

  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();

    throw new Error("The image could not be drawn");
  }

  context.drawImage(bitmap, x, y, side, side, 0, 0, AVATAR_PIXELS, AVATAR_PIXELS);
  bitmap.close();

  return base64Of(await canvasBlob(canvas));
}
