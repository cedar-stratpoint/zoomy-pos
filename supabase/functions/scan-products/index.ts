// Photo scan-to-cart: identifies which catalog products (and how many) are in a photo.
//
// Called from the POS (browser or native) via supabase.functions.invoke with the anon
// key, so it answers CORS preflight. The client sends only a base64 JPEG; the catalog
// is read here with the built-in service-role key, so the SKU list Claude may answer
// with always matches Coop's active products and no client text reaches the prompt.
// The Anthropic key is a FUNCTION SECRET (POS_ANTHROPIC_API_KEY), never in the app.
// Always answers JSON: {ok: true, items: [{sku, quantity}]} or {ok: false, error}.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from 'npm:@anthropic-ai/sdk@0.115.0';

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

const H = {apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`};
const rest = (path: string) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {headers: H});

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {...CORS, 'content-type': 'application/json'}});

type CatalogRow = {product_id: string; name: string};

const PROMPT = `You are the product scanner for a pet-treat bazaar booth.
The photo shows packs a customer wants to buy. Identify each pack using ONLY the catalog below (format: SKU | product name).

Rules:
- Count every visible pack. Several packs of the same product become one entry with that quantity.
- Read the pack labels: flavors look alike, so match on the printed name and protein, not just colour.
- Leave out anything that is not a pack from the catalog (hands, table, signs, other brands).
- If you cannot tell which catalog product a pack is, leave it out rather than guess.
- If no catalog packs are visible, return an empty list.

Catalog:
`;

function itemsSchema(skus: string[]) {
  return {
    type: 'object',
    properties: {
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
    required: ['items'],
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
            {type: 'image', source: {type: 'base64', media_type: 'image/jpeg', data: image}},
            {type: 'text', text: PROMPT + catalog.map((c) => `${c.product_id} | ${c.name.trim()}`).join('\n')},
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      console.warn('scan-products: unusable stop_reason', response.stop_reason);
      return json({ok: false, error: 'could not read photo'});
    }
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return json({ok: false, error: 'could not read photo'});

    const {items} = JSON.parse(text.text);
    return json({ok: true, items});
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
