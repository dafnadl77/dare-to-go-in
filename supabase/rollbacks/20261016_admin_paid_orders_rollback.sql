-- Rollback for 20261016_admin_paid_orders.sql.
-- The migration only adds one read-only function; it creates no table and writes no data. Removing the function removes the feature
-- completely (the admin list in Settings then shows "could not be loaded"; nothing else depends on it).
drop function if exists public.admin_list_paid_orders(uuid, integer);
