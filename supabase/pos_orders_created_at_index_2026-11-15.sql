-- pos_orders(created_at) index — 2026-11-15
--
-- Applied to Staging (syxwixxzmytvhwhkwdvw). Additive-only (one new index,
-- nothing existing changes). Idempotent. Promote to Coop PROD
-- (qkxbwzdxhwcbwgriwipi) only after sign-off. See CHANGELOG.md (POS).
--
-- The POS Transactions screen pulls Coop's sales by date window
-- (utils/orders-remote.ts fetchRemoteOrders): a bounded window filters
-- created_at >= start [and <= end], and the unbounded pull sorts
-- created_at DESC LIMIT 500. pos_orders had no index on created_at, so both
-- were a sequential scan of every order ever recorded. pos_orders is small
-- (hundreds of rows a month), so a plain build takes milliseconds and
-- CONCURRENTLY isn't needed.

create index if not exists pos_orders_created_at_idx on public.pos_orders (created_at);
