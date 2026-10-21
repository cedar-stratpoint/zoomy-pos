-- Photo scan training samples — 2026-10-21
--
-- Applied to Staging (syxwixxzmytvhwhkwdvw). Additive-only (new table, function,
-- bucket and storage policy; nothing existing changes). Idempotent. Promote to
-- Coop PROD (qkxbwzdxhwcbwgriwipi) only after sign-off. See CHANGELOG.md (POS).
--
-- Every photo scan the cashier confirms with "Add to sale" is kept: the 1500px
-- JPEG the scanner read, what the scanner said, and what the cashier actually
-- added. This is training and evaluation data for scan models, so it is private:
--   * pos_scan_samples has RLS on and NO anon policy. Only service_role reads it.
--   * The POS writes rows only through record_pos_scan_sample (idempotent on
--     client_uuid). A re-push fills in transaction_client_uuid once the sale is
--     checked out; nothing else is ever overwritten.
--   * Bucket pos-scan-samples is private. anon may INSERT a JPEG at
--     YYYY-MM/<uuid>.jpg and nothing else: no read, replace or delete.

-- ── 1. Table ───────────────────────────────────────────────────────────────
create table if not exists public.pos_scan_samples (
  client_uuid             uuid primary key,
  photo_path              text not null,
  width                   integer not null,
  height                  integer not null,
  model                   text,
  -- The scanner's answer: {items: [{sku, quantity}], unsure: [{candidates, quantity, box}], unmatched_count}.
  prediction              jsonb not null,
  -- The cashier-confirmed truth: {counts, bundles, unsure, edited}. Shape versioned by label_version.
  label                   jsonb not null,
  label_version           integer not null,
  -- pos_orders.client_uuid of the sale; null when the cart was dropped before checkout.
  transaction_client_uuid text,
  created_at              timestamptz not null,
  received_at             timestamptz not null default now()
);

create index if not exists pos_scan_samples_created_at_idx on public.pos_scan_samples (created_at);
create index if not exists pos_scan_samples_transaction_idx on public.pos_scan_samples (transaction_client_uuid);

alter table public.pos_scan_samples enable row level security;
-- Deliberately no policies: anon cannot read training data.

-- ── 2. Write RPC ───────────────────────────────────────────────────────────
create or replace function public.record_pos_scan_sample(p_sample jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uuid uuid := (p_sample->>'client_uuid')::uuid;
  v_path text := p_sample->>'photo_path';
begin
  if v_path is null or v_path !~ ('^[0-9]{4}-[0-9]{2}/' || v_uuid::text || '\.jpg$') then
    raise exception 'photo_path must be YYYY-MM/<client_uuid>.jpg' using errcode = 'check_violation';
  end if;

  insert into pos_scan_samples (
    client_uuid, photo_path, width, height, model, prediction, label,
    label_version, transaction_client_uuid, created_at
  ) values (
    v_uuid,
    v_path,
    (p_sample->>'width')::integer,
    (p_sample->>'height')::integer,
    nullif(p_sample->>'model', ''),
    p_sample->'prediction',
    p_sample->'label',
    (p_sample->>'label_version')::integer,
    nullif(p_sample->>'transaction_client_uuid', ''),
    coalesce((p_sample->>'created_at')::timestamptz, now())
  )
  on conflict (client_uuid) do update
    set transaction_client_uuid = coalesce(pos_scan_samples.transaction_client_uuid, excluded.transaction_client_uuid);
end;
$$;

revoke all on function public.record_pos_scan_sample(jsonb) from public;
grant execute on function public.record_pos_scan_sample(jsonb) to anon;

-- ── 3. Private photo bucket ────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pos-scan-samples', 'pos-scan-samples', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists pos_scan_samples_anon_insert on storage.objects;
create policy pos_scan_samples_anon_insert on storage.objects
  for insert to anon
  with check (
    bucket_id = 'pos-scan-samples'
    and name ~ '^[0-9]{4}-[0-9]{2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  );
