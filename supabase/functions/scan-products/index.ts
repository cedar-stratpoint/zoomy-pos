// Photo scan-to-cart: identifies which catalog products (and how many) are in a photo.
//
// Called from the POS (browser or native) via supabase.functions.invoke with the anon
// key, so it answers CORS preflight. The client sends only a base64 JPEG; the catalog
// is read here with the built-in service-role key, so the SKU list Claude may answer
// with always matches Coop's active products and no client text reaches the prompt.
// The Anthropic key is a FUNCTION SECRET (POS_ANTHROPIC_API_KEY), never in the app.
// Reference photos: a private Storage bucket holds one front-of-pack JPEG per product,
// named <SKU>.jpg. They go first in the prompt, before a 1-hour cache marker, so
// repeat scans read them from Anthropic's cache; products without one match by name.
// Packs Claude cannot pin down come back in `unsure` with its likeliest SKUs and the
// pack's box (corners on a 0 to 1000 grid over the photo), so the POS can ask the
// cashier instead of the pack silently going missing.
// Always answers JSON: {ok: true, items: [{sku, quantity}], unsure: [{candidates, quantity,
// box: {x0, y0, x1, y1}}]} or {ok: false, error}.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from 'npm:@anthropic-ai/sdk@0.115.0';
import {encodeBase64} from 'jsr:@std/encoding@1/base64';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('POS_ANTHROPIC_API_KEY');

const MODEL = 'claude-haiku-5-5';
// ~3 MB of base64. The client sends a 1500px JPEG, typically well under 1 MB.
const MAX_IMAGE_BASE64_CHARS = 4_000_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REFERENCE_BUCKET = 'product-references';
// Warm instances reuse the downloaded photos; a new upload shows up within this window.
const REFERENCE_TTL_MS = 10 * 60 * 1000;

const H = {apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`};
const rest = (path: string) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {headers: H});

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {...CORS, 'content-type': 'application/json'}});

type CatalogRow = {product_id: string; name: string};
type ReferencePhoto = {sku: string; data: string};

const PROMPT = `You are the product scanner for a pet-treat bazaar booth.
The last photo shows packs a customer wants to buy. Identify each pack using ONLY the catalog below (format: SKU | product name).

Rules:
- Count every visible pack. Several packs of the same product become one entry with that quantity.
- Compare each pack with the reference photos above: they show the front of each catalog pack. Products without a reference photo are matched by their printed name.
- Read the pack labels: flavors look alike, so match on the printed name and protein, not just colour.
- Leave out anything that is not a pack from the catalog (hands, table, signs, other brands).
- Put every visible catalog pack in exactly one list: items when you are sure which product it is, unsure when you are not.
- For an unsure pack, give your 2 or 3 most likely SKUs in candidates (most likely first), how many packs like it there are, and its box: x0,y0 is its top-left corner and x1,y1 its bottom-right, on a 0 to 1000 grid over the customer's photo width and height.
- If no catalog packs are visible, return empty lists.

Catalog:
`;

function itemsSchema(skus: string[]) {
  const corner = {type: 'integer'};
  return {
    type: 'object',
    properties: {
      unsure: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            candidates: {type: 'array', items: {type: 'string', enum: skus}},
            quantity: {type: 'integer'},
            box: {
              type: 'object',
              properties: {x0: corner, y0: corner, x1: corner, y1: corner},
              required: ['x0', 'y0', 'x1', 'y1'],
              additionalProperties: false,
            },
          },
          required: ['candidates', 'quantity', 'box'],
          additionalProperties: false,
        },
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sku: {type: 'string', enum: skus},
            // Structured outputs reject `minimum` on integers; the client drops quantity <= 0.
            quantity: {type: 'integer'},
          },
          required: ['sku', 'quantity'],
          additionalProperties: false,
        },
      },
    },
    required: ['items', 'unsure'],
    additionalProperties: false,
  };
}

async function loadCatalog(): Promise<CatalogRow[] | null> {
  const rows = await rest('pos_products?active=eq.true&select=product_id,name&order=product_id')
    .then((r) => r.json())
    .catch(() => null);
  // A PostgREST error comes back as an object, not a row set: treat it as unavailable.
  return Array.isArray(rows) ? rows : null;
}

let referenceCache: {photos: ReferencePhoto[]; loadedAt: number} | null = null;

/**
 * Reference photos for the active catalog, sorted by SKU so the prompt prefix (and
 * so Anthropic's cache) is identical scan to scan. A failure only costs accuracy:
 * the scan carries on by name.
 */
async function loadReferences(skus: Set<string>): Promise<ReferencePhoto[]> {
  if (referenceCache && Date.now() - referenceCache.loadedAt < REFERENCE_TTL_MS) {
    return referenceCache.photos.filter((p) => skus.has(p.sku));
  }
  try {
    const listing = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${REFERENCE_BUCKET}`, {
      method: 'POST',
      headers: {...H, 'content-type': 'application/json'},
      body: JSON.stringify({prefix: '', limit: 1000}),
    }).then((r) => r.json());
    if (!Array.isArray(listing)) throw new Error('listing failed');

    const names = listing.map((o: {name: string}) => o.name).filter((n) => n.endsWith('.jpg')).sort();
    const photos = await Promise.all(names.map(async (name: string) => {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${REFERENCE_BUCKET}/${name}`, {headers: H});
      if (!res.ok) throw new Error(`download failed: ${name}`);
      return {sku: name.slice(0, -'.jpg'.length), data: encodeBase64(new Uint8Array(await res.arrayBuffer()))};
    }));
    referenceCache = {photos, loadedAt: Date.now()};
    return photos.filter((p) => skus.has(p.sku));
  } catch (err) {
    console.warn('scan-products: reference photos unavailable, matching by name', err);
    return [];
  }
}

function referenceBlocks(photos: ReferencePhoto[], nameBySku: Map<string, string>) {
  if (photos.length === 0) return [];
  return [
    {type: 'text' as const, text: 'Reference photos of catalog packs:'},
    ...photos.flatMap((p) => [
      {type: 'text' as const, text: `${p.sku} | ${nameBySku.get(p.sku)}`},
      {type: 'image' as const, source: {type: 'base64' as const, media_type: 'image/jpeg' as const, data: p.data}},
    ]),
  ];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: CORS});
  if (req.method !== 'POST') return json({ok: false, error: 'method not allowed'}, 405);
  if (!ANTHROPIC_API_KEY) {
    console.error('scan-products: POS_ANTHROPIC_API_KEY is not set');
    return json({ok: false, error: 'scanner not configured'}, 500);
  }

  const {image} = await req.json().catch(() => ({}));
  if (typeof image !== 'string' || image.length === 0) return json({ok: false, error: 'no image'}, 400);
  if (image.length > MAX_IMAGE_BASE64_CHARS) return json({ok: false, error: 'image too large'}, 413);

  const catalog = await loadCatalog();
  if (!catalog) return json({ok: false, error: 'catalog unavailable'}, 503);
  if (catalog.length === 0) return json({ok: true, items: []});

  const nameBySku = new Map(catalog.map((c) => [c.product_id, c.name.trim()]));
  const references = await loadReferences(new Set(nameBySku.keys()));

  const client = new Anthropic({apiKey: ANTHROPIC_API_KEY});
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: {effort: 'low', format: {type: 'json_schema', schema: itemsSchema(catalog.map((c) => c.product_id))}},
      messages: [
        {
          role: 'user',
          content: [
            ...referenceBlocks(references, nameBySku),
            {
              type: 'text',
              text: PROMPT + catalog.map((c) => `${c.product_id} | ${c.name.trim()}`).join('\n'),
              // Everything up to here is the same on every scan: cache it for an hour,
              // since scans at a bazaar can be minutes apart.
              cache_control: {type: 'ephemeral', ttl: '1h'},
            },
            {type: 'text', text: 'The customer\'s photo:'},
            {type: 'image', source: {type: 'base64', media_type: 'image/jpeg', data: image}},
          ],
        },
      ],
    });

    const u = response.usage;
    console.log('scan-products: usage', JSON.stringify({
      references: references.length,
      input: u.input_tokens,
      cache_write: u.cache_creation_input_tokens,
      cache_read: u.cache_read_input_tokens,
      output: u.output_tokens,
    }));

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      console.warn('scan-products: unusable stop_reason', response.stop_reason);
      return json({ok: false, error: 'could not read photo'});
    }
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return json({ok: false, error: 'could not read photo'});

    const {items, unsure} = JSON.parse(text.text);
    return json({ok: true, items, unsure: unsure ?? []});
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.warn('scan-products: rate limited');
      return json({ok: false, error: 'busy, try again'}, 429);
    }
    if (err instanceof Anthropic.APIError) {
      console.error('scan-products: Anthropic API error', err.status, err.message);
      return json({ok: false, error: 'scanner error'}, 502);
    }
    console.error('scan-products: unexpected error', err);
    return json({ok: false, error: 'scanner error'}, 500);
  }
});
