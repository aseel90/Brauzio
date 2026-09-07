/**
 * Image processing utility functions
 */

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (a << 16) | (b << 8) | c;
    output += alphabet[(triplet >> 18) & 63];
    output += alphabet[(triplet >> 12) & 63];
    output += i + 1 < bytes.length ? alphabet[(triplet >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? alphabet[triplet & 63] : '=';
  }
  return output;
}

async function blobToDataURL(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;
}

/**
 * Create ImageBitmap from data URL (for OffscreenCanvas)
 * @param dataUrl Image data URL
 * @returns Created ImageBitmap object
 */
export async function createImageBitmapFromUrl(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return await createImageBitmap(blob);
}

/**
 * Stitch multiple image parts (dataURL) onto a single canvas
 * @param parts Array of image parts, each containing dataUrl and y coordinate
 * @param totalWidthPx Total width (pixels)
 * @param totalHeightPx Total height (pixels)
 * @returns Stitched canvas
 */
export async function stitchImages(
  parts: { dataUrl: string; y: number }[],
  totalWidthPx: number,
  totalHeightPx: number,
): Promise<OffscreenCanvas> {
  const canvas = new OffscreenCanvas(totalWidthPx, totalHeightPx);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Unable to get canvas context');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const part of parts) {
    try {
      const img = await createImageBitmapFromUrl(part.dataUrl);
      const sx = 0;
      const sy = 0;
      const sWidth = img.width;
      let sHeight = img.height;
      const dy = part.y;

      if (dy + sHeight > totalHeightPx) {
        sHeight = totalHeightPx - dy;
      }

      if (sHeight <= 0) continue;

      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, dy, sWidth, sHeight);
    } catch (error) {
      console.error('Error stitching image part:', error, part);
    }
  }
  return canvas;
}

/**
 * Crop image (from dataURL) to specified rectangle and resize
 * @param originalDataUrl Original image data URL
 * @param cropRectPx Crop rectangle (physical pixels)
 * @param dpr Device pixel ratio
 * @param targetWidthOpt Optional target output width (CSS pixels)
 * @param targetHeightOpt Optional target output height (CSS pixels)
 * @returns Cropped canvas
 */
export async function cropAndResizeImage(
  originalDataUrl: string,
  cropRectPx: { x: number; y: number; width: number; height: number },
  dpr: number = 1,
  targetWidthOpt?: number,
  targetHeightOpt?: number,
): Promise<OffscreenCanvas> {
  const img = await createImageBitmapFromUrl(originalDataUrl);

  let sx = cropRectPx.x;
  let sy = cropRectPx.y;
  let sWidth = cropRectPx.width;
  let sHeight = cropRectPx.height;

  if (sx < 0) {
    sWidth += sx;
    sx = 0;
  }
  if (sy < 0) {
    sHeight += sy;
    sy = 0;
  }
  if (sx + sWidth > img.width) {
    sWidth = img.width - sx;
  }
  if (sy + sHeight > img.height) {
    sHeight = img.height - sy;
  }

  if (sWidth <= 0 || sHeight <= 0) {
    throw new Error(
      'Invalid calculated crop size (<=0). Element may not be visible or fully captured.',
    );
  }

  const finalCanvasWidthPx = targetWidthOpt ? targetWidthOpt * dpr : sWidth;
  const finalCanvasHeightPx = targetHeightOpt ? targetHeightOpt * dpr : sHeight;

  const canvas = new OffscreenCanvas(finalCanvasWidthPx, finalCanvasHeightPx);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Unable to get canvas context');
  }

  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, finalCanvasWidthPx, finalCanvasHeightPx);

  return canvas;
}

/**
 * Convert canvas to data URL
 * @param canvas Canvas
 * @param format Image format
 * @param quality JPEG quality (0-1)
 * @returns Data URL
 */
export async function canvasToDataURL(
  canvas: OffscreenCanvas,
  format: string = 'image/png',
  quality?: number,
): Promise<string> {
  const blob = await canvas.convertToBlob({
    type: format,
    quality: format === 'image/jpeg' ? quality : undefined,
  });

  return blobToDataURL(blob);
}

/**
 * Compresses an image by scaling it and converting it to a target format with a specific quality.
 * This is the most effective way to reduce image data size for transport or storage.
 *
 * @param {string} imageDataUrl - The original image data URL (e.g., from captureVisibleTab).
 * @param {object} options - Compression options.
 * @param {number} [options.scale=1.0] - The scaling factor for dimensions (e.g., 0.7 for 70%).
 * @param {number} [options.quality=0.8] - The quality for lossy formats like JPEG (0.0 to 1.0).
 * @param {string} [options.format='image/jpeg'] - The target image format.
 * @returns {Promise<{dataUrl: string, mimeType: string}>} A promise that resolves to the compressed image data URL and its MIME type.
 */
export async function compressImage(
  imageDataUrl: string,
  options: { scale?: number; quality?: number; format?: 'image/jpeg' | 'image/webp' },
): Promise<{ dataUrl: string; mimeType: string }> {
  const { scale = 1.0, quality = 0.8, format = 'image/jpeg' } = options;

  const imageBitmap = await createImageBitmapFromUrl(imageDataUrl);
  const newWidth = Math.round(imageBitmap.width * scale);
  const newHeight = Math.round(imageBitmap.height * scale);

  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get 2D context from OffscreenCanvas');
  }

  ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);

  const compressedDataUrl = await canvas.convertToBlob({ type: format, quality: quality });
  const dataUrl = await blobToDataURL(compressedDataUrl);

  return { dataUrl, mimeType: compressedDataUrl.type || format };
}
