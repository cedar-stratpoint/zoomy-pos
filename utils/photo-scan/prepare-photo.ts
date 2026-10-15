import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Long edge sent to the scanner. Enough to read pack labels, small enough to upload fast. */
const SCAN_LONG_EDGE = 1500;
const SCAN_JPEG_QUALITY = 0.7;

export type ScanPhoto = { uri: string; width: number; height: number };

/** Shrinks a picked photo to the scan size and returns it as base64 JPEG (no data: prefix). */
export async function resizeForScan(photo: ScanPhoto): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  const longEdge = Math.max(photo.width, photo.height);
  if (longEdge > SCAN_LONG_EDGE) {
    context.resize(photo.width >= photo.height ? { width: SCAN_LONG_EDGE } : { height: SCAN_LONG_EDGE });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ base64: true, compress: SCAN_JPEG_QUALITY, format: SaveFormat.JPEG });
  if (!result.base64) throw new Error('Photo could not be encoded');
  return result.base64;
}
