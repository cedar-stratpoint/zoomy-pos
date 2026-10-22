import type { PackBox } from './match-scan';

/** Extra room around the pack, as a share of its size: the model's boxes run tight. */
const MARGIN = 0.15;

export type CropRect = { originX: number; originY: number; width: number; height: number };

/** The pixel rectangle to cut a pack out of a photo, with a margin, kept inside the photo. */
export function cropRect(box: PackBox, photoWidth: number, photoHeight: number): CropRect {
  const left = Math.max(0, Math.round((box.x - box.width * MARGIN) * photoWidth));
  const top = Math.max(0, Math.round((box.y - box.height * MARGIN) * photoHeight));
  const right = Math.min(photoWidth, Math.round((box.x + box.width * (1 + MARGIN)) * photoWidth));
  const bottom = Math.min(photoHeight, Math.round((box.y + box.height * (1 + MARGIN)) * photoHeight));
  return {
    originX: left,
    originY: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
