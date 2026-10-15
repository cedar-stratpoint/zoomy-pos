import { getSupabase } from '../../lib/supabase';
import type { ScannedItem } from './match-scan';

/** A scan that produced no usable result. `message` is cashier-facing copy. */
export class ScanError extends Error {}

type ScanResponse = { ok: boolean; items?: ScannedItem[]; error?: string };

/**
 * Sends a base64 JPEG to the `scan-products` edge function, which asks Claude
 * which catalog SKUs are in the photo. The Anthropic key lives only in the
 * function's secrets; the app never sees it.
 */
export async function scanProducts(imageBase64: string): Promise<ScannedItem[]> {
  const supabase = getSupabase();
  if (!supabase) throw new ScanError('Scanning needs an internet connection.');

  const { data, error } = await supabase.functions.invoke<ScanResponse>('scan-products', {
    body: { image: imageBase64 },
  });
  if (error) throw new ScanError('Could not reach the scanner. Check your connection and try again.');
  if (!data?.ok || !Array.isArray(data.items)) {
    throw new ScanError('Could not read the photo. Try again with the packs flat and well lit.');
  }
  return data.items;
}
