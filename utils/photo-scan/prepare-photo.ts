import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { cropRect } from './crop';
import type { PackBox } from './match-scan';

/** Long edge sent to the scanner. Enough to read pack labels, small enough to upload fast. */
const SCAN_LONG_EDGE = 1500;
const SCAN_JPEG_QUALITY = 0.7;

export type ScanPhoto = { uri: string; width: number; height: number };

/** The photo as sent to the scanner: base64 JPEG (no data: prefix) plus the saved image. */
export type PreparedPhoto = ScanPhoto & { base64: string };

/**
 * Shrinks a picked photo to the scan size. The saved image is the one the scanner's
 * pack boxes refer to (same size and orientation), so crops are cut from it.
 */
export async function resizeForScan(photo: ScanPhoto): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(photo.uri);
  const longEdge = Math.max(photo.width, photo.height);
  if (longEdge > SCAN_LONG_EDGE) {
    context.resize(photo.width >= photo.height ? { width: SCAN_LONG_EDGE } : { height: SCAN_LONG_EDGE });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ base64: true, compress: SCAN_JPEG_QUALITY, format: SaveFormat.JPEG });
  if (!result.base64) throw new Error('Photo could not be encoded');
  return { uri: result.uri, width: result.width, height: result.height, base64: result.base64 };
}

/** Cuts one pack out of the photo for the cashier to check; returns the new image's uri. */
export async function cropPack(photo: ScanPhoto, box: PackBox): Promise<string> {
  const image = await ImageManipulator.manipulate(photo.uri)
    .crop(cropRect(box, photo.width, photo.height))
    .renderAsync();
  const result = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return result.uri;
}
