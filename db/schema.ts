import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from './database';

/** scan_samples columns, shared by its CREATE and its one-time rebuild. */
const SCAN_SAMPLES_COLUMNS = `
      client_uuid TEXT PRIMARY KEY,
      photo_uri TEXT,
      photo_base64 TEXT,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      model TEXT,
      prediction_json TEXT NOT NULL,
      label_json TEXT NOT NULL,
      label_version INTEGER NOT NULL,
      transaction_client_uuid TEXT,
      created_at TEXT NOT NULL,
      photo_synced_at TEXT,
      synced_at TEXT
`;

/** Columns both scan_samples layouts have, copied across by the rebuild. */
const SCAN_SAMPLES_KEPT_COLUMNS = [
  'client_uuid', 'photo_uri', 'width', 'height', 'model', 'prediction_json', 'label_json',
  'label_version', 'transaction_client_uuid', 'created_at', 'photo_synced_at', 'synced_at',
].join(', ');

const DEFAULT_PIN_HASH = '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'; // SHA-256 of '0000'

/**
 * The first scan_samples layout (2026-10-21, never released) had photo_uri NOT NULL
 * and no photo_base64, so a web sample (photo inline, no file) failed to insert.
 * SQLite cannot relax NOT NULL in place, so a table without photo_base64 is
 * rebuilt once, keeping its rows. A no-op on every later launch.
 */
async function upgradeScanSamplesTable(db: SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(scan_samples)');
  if (columns.length === 0 || columns.some((c) => c.name === 'photo_base64')) return;
  await db.withTransactionAsync(() => db.execAsync(`
    ALTER TABLE scan_samples RENAME TO scan_samples_v1;
    CREATE TABLE scan_samples (${SCAN_SAMPLES_COLUMNS});
    INSERT INTO scan_samples (${SCAN_SAMPLES_KEPT_COLUMNS})
      SELECT ${SCAN_SAMPLES_KEPT_COLUMNS} FROM scan_samples_v1;
    DROP TABLE scan_samples_v1;
  `));
}

export async function initSchema(): Promise<void> {
  const db = await getDatabase();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🍬',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      cash_tendered REAL NOT NULL,
      change REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS saved_bundles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      items_json TEXT NOT NULL,
      price REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Local mirror of Coop's pos_events (Events / opening cash feature). Coop
    -- schedules a bazaar's date range; the POS caches it here so "is today an
    -- event day?" is answered offline by matching the device date against
    -- starts_on..ends_on. event_id is Coop's uuid (shared identity), so an
    -- offline create and its later sync are the same idempotent upsert.
    CREATE TABLE IF NOT EXISTS pos_events (
      event_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      venue TEXT,
      city TEXT,
      organizer TEXT,
      starts_on TEXT,
      ends_on TEXT,
      opening_cash REAL,
      cash_note TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      -- Null once the event's opening cash / details are confirmed on Coop; set
      -- to null on a local edit so the outbox re-pushes it (mirrors the sale
      -- sync-tracking columns above). Rows arriving from a pull are already
      -- synced, so the pull stamps this with updated_at.
      synced_at TEXT
    );

    -- Free taste (opened-stock sampling): a cashier opens sellable stock to let
    -- pets sample it. Standalone (no sale/customer); deducts the Event location
    -- server-side (record_free_taste). Mirrors the sale outbox model: the row is
    -- durable the moment it's written, and synced_at stays null until Coop
    -- confirms it (the RPC is keyed on client_uuid, so a retry can't double-count).
    -- product_sku is what the RPC needs as product_id; product_local_id lets the
    -- local stock cache decrement instantly. batch_id groups the lines submitted
    -- together in one Free Taste form.
    CREATE TABLE IF NOT EXISTS free_tastes (
      client_uuid TEXT PRIMARY KEY,
      batch_id TEXT,
      product_local_id INTEGER,
      product_sku TEXT,
      product_name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      note TEXT,
      created_by TEXT,
      device_id TEXT,
      opened_at TEXT,
      synced_at TEXT
    );

    -- Free item (spin-a-wheel prize): a real product given away free, attached to
    -- a sale. Recorded separately from the sale's paid lines (deducts the Event as
    -- reason='free_item' via add_order_prize), never sent through apply_pos_order,
    -- so a normal sale is unaffected. order_client_uuid ties the prize to its
    -- sale's client_uuid; add_order_prize resolves the order by it, so a prize can
    -- only land on Coop once its sale has (the outbox drains sales first, then
    -- prizes). synced_at stays null until Coop confirms it.
    CREATE TABLE IF NOT EXISTS order_prizes (
      client_uuid TEXT PRIMARY KEY,
      order_client_uuid TEXT NOT NULL,
      product_local_id INTEGER,
      product_sku TEXT,
      product_name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      note TEXT,
      created_by TEXT,
      device_id TEXT,
      won_at TEXT,
      synced_at TEXT
    );

    -- Photo scan training sample: a confirmed scan's photo (the 1500px JPEG the
    -- scanner read), what the scanner said and what the cashier added to the sale.
    -- Kept to train and test scan models on real bazaar photos. Uploaded in two
    -- steps (photo, then row), each idempotent on client_uuid; see
    -- utils/scan-samples-sync.ts. transaction_client_uuid is set at checkout.
    -- The photo is a file on native (photo_uri) and base64 in the row on web
    -- (photo_base64), where the scanned image is a blob URL that dies on reload.
    -- Exactly one is set, and both are cleared once Coop has the sample.
    CREATE TABLE IF NOT EXISTS scan_samples (${SCAN_SAMPLES_COLUMNS});
  `);

  await upgradeScanSamplesTable(db);

  // Add payment_method column to existing databases
  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN ref_number TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN proof_photo_uri TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN customer_handle TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN is_bundle INTEGER NOT NULL DEFAULT 0`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE products ADD COLUMN has_variants INTEGER NOT NULL DEFAULT 0`
  ).catch(() => {});

  // Migrate products table to allow nullable price (needed for variant products)
  const cols = await db.getAllAsync<{ name: string; notnull: number }>(
    `PRAGMA table_info(products)`
  );
  const priceCol = cols.find((c) => c.name === 'price');
  if (priceCol && priceCol.notnull === 1) {
    await db.execAsync(`
      CREATE TABLE products_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL,
        emoji TEXT NOT NULL DEFAULT '🍬',
        has_variants INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      INSERT INTO products_new SELECT id, name, price, emoji, has_variants, is_active, created_at FROM products;
      DROP TABLE products;
      ALTER TABLE products_new RENAME TO products;
    `);
  }

  await db.runAsync(
    `ALTER TABLE transaction_items ADD COLUMN variant_id INTEGER`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transaction_items ADD COLUMN variant_name TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE saved_bundles ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`
  ).catch(() => {});

  // Pick bundles: "buy any N flavors from selected product lines" for a fixed
  // price. Legacy bundles stay bundle_type 'fixed' (items_json is the item list);
  // 'pick' bundles use pick_count + line_categories and select flavors at sale time.
  await db.runAsync(
    `ALTER TABLE saved_bundles ADD COLUMN bundle_type TEXT NOT NULL DEFAULT 'fixed'`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE saved_bundles ADD COLUMN pick_count INTEGER`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE saved_bundles ADD COLUMN line_categories TEXT`
  ).catch(() => {});

  // Shared id (matches Coop pos_bundles.bundle_id) so a bundle created on one
  // device syncs to the others, plus an editable tile emoji.
  await db.runAsync(
    `ALTER TABLE saved_bundles ADD COLUMN bundle_uuid TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE saved_bundles ADD COLUMN emoji TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE products ADD COLUMN image_uri TEXT`
  ).catch(() => {});

  // Option H — category / subcategory for the split-view filter tabs
  await db.runAsync(
    `ALTER TABLE products ADD COLUMN category TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE products ADD COLUMN subcategory TEXT`
  ).catch(() => {});

  // Coop integration: the SKU Code that identifies this product as
  // pos_products.product_id once catalog sync (Phase 2) is wired up.
  // Nullable — locally-created products have none until synced.
  await db.runAsync(
    `ALTER TABLE products ADD COLUMN sku TEXT`
  ).catch(() => {});

  await db.execAsync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL`
  );

  // Local cache of Coop's on-hand stock (pos_inventory), refreshed on every
  // catalog pull. Coop-authoritative — unlike emoji, the pull always overwrites
  // this. Powers the low/oversold tile warning; 0 for locally-created products
  // with no SKU yet (never synced, so no stock signal to show).
  await db.runAsync(
    `ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 0`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN remarks TEXT`
  ).catch(() => {});

  // Idempotency key shared with Coop's pos_orders.client_uuid. Lets the
  // Transactions screen merge this device's sales with the ones pulled back
  // from Coop (other devices) without double-counting a sale it also pushed.
  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN client_uuid TEXT`
  ).catch(() => {});

  // Set only once pushSale() confirms Coop actually has this sale (never at
  // insert time). This is the safety gate for pulling deletions from Coop: a
  // local row only gets pruned when it was confirmed synced AND is now absent
  // from a successful remote fetch, so a not-yet-pushed or offline sale can
  // never be mistaken for "Coop deleted it" and wiped.
  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN synced_at TEXT`
  ).catch(() => {});

  // Outbox sync-tracking for the two post-sale edits that also need to reach
  // Coop (see utils/outbox.ts). Each is nulled locally the moment the edit is
  // made and set again once its Coop push confirms — the drain retries any that
  // are still null. void_synced_at pairs with status='voided'; remarks_synced_at
  // pairs with a remarks edit (including clearing to null).
  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN void_synced_at TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN remarks_synced_at TEXT`
  ).catch(() => {});

  // Events / pet-tag feature. event_id ties a sale to the bazaar it was made at
  // (null = a normal, non-event day); pet_type is the Dog/Cat/Both tap at
  // checkout (null = untagged). Both ride along in the Coop push (apply_pos_order)
  // and are read back for reporting; nullable and backward-compatible.
  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN event_id TEXT`
  ).catch(() => {});

  await db.runAsync(
    `ALTER TABLE transactions ADD COLUMN pet_type TEXT`
  ).catch(() => {});

  // Closing cash counted at the till at end of day, mirrors Coop's pos_events
  // column. Edited on the POS (event-setup) and synced up via upsert_pos_event.
  await db.runAsync(
    `ALTER TABLE pos_events ADD COLUMN closing_cash REAL`
  ).catch(() => {});

  // One-time backfill so the first drain doesn't flag the entire history as
  // "pending". Gated by a settings marker so it runs at most once.
  //  - remarks_synced_at: seed to created_at for every existing row (nothing to
  //    re-push; new remark edits null it going forward).
  //  - void_synced_at: seed to created_at for a voided sale whose SALE already
  //    reached Coop (synced_at set) — its old best-effort inline void almost
  //    certainly reached Coop too, so don't show it as pending or re-push it.
  //    A voided sale that never sale-synced stays null: the drain pushes the
  //    sale first, then heals the void (Coop's void RPC is idempotent).
  const backfillRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'outbox_backfill_version'"
  );
  if (backfillRow?.value !== '2026-09-10-outbox') {
    await db.runAsync(
      `UPDATE transactions SET remarks_synced_at = created_at WHERE remarks_synced_at IS NULL`
    ).catch(() => {});
    await db.runAsync(
      `UPDATE transactions SET void_synced_at = created_at
         WHERE void_synced_at IS NULL AND status = 'voided' AND synced_at IS NOT NULL`
    ).catch(() => {});
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('outbox_backfill_version', ?)`,
      ['2026-09-10-outbox']
    );
  }

  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
    ['admin_password_hash', DEFAULT_PIN_HASH]
  );

  // Migrate legacy single GCash QR to new per-method key
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value)
     SELECT 'qr_gcash', value FROM settings WHERE key = 'gcash_qr_uri'`
  ).catch(() => {});
}
