-- Link-checked completion for the Make path (POST /api/payment-complete), built on 20261123_payment_order_links.sql.
--
-- NOT APPLIED anywhere. Written and tested only against an isolated in-process PostgreSQL (tests/growMakeLink.test.ts).
-- ADDITIVE ONLY: one new function. complete_payment_order (the only grant) and everything else are unchanged. It must be applied
-- AFTER 20261123_payment_order_links.sql, and before DARE sends it any call (DARE keeps calling the old function until it needs
-- this one: see server/payments/completionStore.ts).
--
-- What it adds: for an order that DARE bound to the Grow payment link it created, the notification must name the SAME link
-- (environment, merchant, process id, keyed token hash) before the existing completion runs. It is a matching rule, NOT proof of
-- origin or ownership (Grow's notification is unsigned).
--
-- Old orders (no link row) are "legacy": they complete exactly as before. p_legacy_before decides what counts as legacy:
--   NULL                   every order without a link row is legacy (nothing is enforced yet; today's behaviour);
--   a timestamp            only orders created BEFORE it are legacy; a later order without a link row cannot complete
--                          (link_missing: DARE never kept the link it handed out, so the payment is reviewed by hand).
-- An order WITH a link row never completes without matching identifiers, whatever p_legacy_before is.
--
-- Returns complete_payment_order's own result, or:
--   link_required   the order has a bound link but the notification carried no identifiers (an old-format call)
--   link_missing    the order has no bound link and is not legacy
--   link_mismatch   environment, merchant, process id or token hash differ
--   order_not_found / invalid
-- A refusal here writes nothing to payment_orders (an unmatched notification must not touch an order's review trail).

create or replace function public.complete_payment_order_with_link(
  p_order text, p_tx text, p_amount numeric, p_currency text, p_provider_status text,
  p_environment text, p_merchant text, p_process_id text, p_token_hash text, p_legacy_before timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.payment_orders%rowtype;
  l public.payment_order_links%rowtype;
  v_has_ids boolean := (p_environment is not null or p_merchant is not null or p_process_id is not null or p_token_hash is not null);
begin
  if p_order is null or p_order !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  -- The four link values come together or not at all, and in the stored formats.
  if v_has_ids and (p_environment is null or p_environment not in ('sandbox', 'production')
     or p_merchant is null or p_merchant !~ '^[a-z0-9][a-z0-9_-]{1,31}$'
     or p_process_id is null or p_process_id !~ '^[A-Za-z0-9_-]{1,64}$'
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into o from public.payment_orders where id = p_order for update;
  if not found then
    return jsonb_build_object('status', 'order_not_found');
  end if;

  select * into l from public.payment_order_links where order_id = p_order;
  if not found then
    if p_legacy_before is null or o.created_at < p_legacy_before then
      return public.complete_payment_order(p_order, p_tx, p_amount, p_currency, p_provider_status);
    end if;
    return jsonb_build_object('status', 'link_missing');
  end if;

  if not v_has_ids then
    return jsonb_build_object('status', 'link_required');
  end if;
  if l.environment <> p_environment or l.merchant_ref <> p_merchant
     or l.process_id <> p_process_id or l.token_hash <> p_token_hash then
    return jsonb_build_object('status', 'link_mismatch');
  end if;

  return public.complete_payment_order(p_order, p_tx, p_amount, p_currency, p_provider_status);
end $$;

revoke all on function public.complete_payment_order_with_link(text, text, numeric, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_payment_order_with_link(text, text, numeric, text, text, text, text, text, text, timestamptz) to service_role;
