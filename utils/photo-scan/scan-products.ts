import { getSupabase } from '../../lib/supabase';
import type { PackBox, ScannedItem, UnsureScan } from './match-scan';

/** A scan that produced no usable result. `message` is cashier-facing copy. */
export class ScanError extends Error {}

/** The edge function's box: corners on a 0 to 1000 grid over the photo. */
type RawBox = { x0: unknown; y0: unknown; x1: unknown; y1: unknown };
type RawUnsure = { candidates: string[]; quantity: number; box?: RawBox | null };
type ScanResponse = { ok: boolean; items?: ScannedItem[]; unsure?: RawUnsure[]; error?: string };

export type ScanResult = { items: ScannedItem[]; unsure: UnsureScan[] };

const GRID = 1000;

/**
 * Sends a base64 JPEG to the `scan-products` edge function, which asks Claude
 * which catalog SKUs are in the photo. The Anthropic key lives only in the
 * function's secrets; the app never sees it.
 */
export async function scanProducts(imageBase64: string): Promise<ScanResult> {
  const supabase = getSupabase();
  if (!supabase) throw new ScanError('Scanning needs an internet connection.');

  const { data, error } = await supabase.functions.invoke<ScanResponse>('scan-products', {
    body: { image: imageBase64 },
  });
  if (error) throw new ScanError('Could not reach the scanner. Check your connection and try again.');
  if (!data?.ok || !Array.isArray(data.items)) {
    throw new ScanError('Could not read the photo. Try again with the packs flat and well lit.');
  }
  const unsure = (data.unsure ?? []).map((u) => ({
    candidates: u.candidates,
    quantity: u.quantity,
    box: toPackBox(u.box),
  }));
  return { items: data.items, unsure };
}

/** Converts the model's box to photo fractions; null when it is missing or malformed. */
function toPackBox(raw: RawBox | null | undefined): PackBox | null {
  if (!raw) return null;
  const [x0, y0, x1, y1] = [raw.x0, raw.y0, raw.x1, raw.y1].map((v) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, 0), GRID) : NaN,
  );
  if ([x0, y0, x1, y1].some(Number.isNaN) || x1 <= x0 || y1 <= y0) return null;
  // Subtract on the grid before dividing, so 400 - 100 gives exactly 0.3.
  return { x: x0 / GRID, y: y0 / GRID, width: (x1 - x0) / GRID, height: (y1 - y0) / GRID };
}
