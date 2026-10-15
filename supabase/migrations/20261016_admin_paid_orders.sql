-- The administrator's list of completed purchases, for the manual delivery of the transaction-details document and the tax invoice.
--
-- Until invoices are automated, the owner issues each tax invoice / receipt (Morning) and sends the transaction-details document by hand, to the
-- email address of the account that bought. This function is the one place that answers, for the ADMIN ONLY, "who bought what": the order
-- reference the customer saw, the package, the credits, the amount, the date, and the account's current email (null if the account was
-- deleted). It reads only; it changes nothing; it returns only orders that were paid and credited (status 'granted').
--
-- The admin check is inside the function (the app owner is the only admin, see 20261014_unlimited_access.sql); the function is service-role
-- only. The browser never reads payment_orders or auth.users directly, and the customer's name and phone are NOT in this database at all
-- (they exist only at Grow), so nothing about them can appear here.

create or replace function public.admin_list_paid_orders(p_actor uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not public.is_dream_admin(p_actor) then
    return jsonb_build_object('status', 'not_authorized');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'items', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'order_id', x.id,
                 'account_email', x.email,
                 'package_id', x.package_id,
                 'credits', x.credits,
                 'amount_ils', x.amount_ils,
                 'paid_at', x.paid_at
               )
               order by x.paid_at desc nulls last, x.id)
        from (
          select o.id, u.email, o.package_id, o.credits, o.amount_ils, coalesce(o.paid_at, o.granted_at) as paid_at
            from public.payment_orders o
            left join auth.users u on u.id = o.owner_id
           where o.status = 'granted'
           order by coalesce(o.paid_at, o.granted_at) desc nulls last, o.id
           limit v_limit
        ) x
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_list_paid_orders(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_list_paid_orders(uuid, integer) to service_role;
