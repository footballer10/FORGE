import { PHOTO_JPEG_QUALITY, PHOTO_MAX_EDGE, fitWithin } from '../../domain/photos';

/**
 * Shrink a picked photo to a JPEG with the longest edge at most PHOTO_MAX_EDGE (phone photos are several MB).
 * EXIF rotation is applied. If the browser cannot decode or re-encode it, the original file is kept as is.
 */
export async function prepareImage(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = fitWithin(bmp.width, bmp.height, PHOTO_MAX_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, width, height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', PHOTO_JPEG_QUALITY));
    return blob && blob.size > 0 ? blob : file;
  } catch {
    return file;
  }
}
