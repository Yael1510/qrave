-- A table's tab is shown to whoever scans the table while it's open. Once it's paid,
-- only the phone that was part of that visit (it passes the session id it saw) still
-- sees it, for up to an hour. The next customer at the table starts with a clean menu.
-- Safe to run more than once.

drop function if exists public.table_status(text, text);

create or replace function public.table_status(p_slug text, p_token text, p_session uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_table uuid; v_session table_sessions%rowtype;
begin
  select r.table_id into v_table from resolve_table(p_slug, p_token) r;
  if v_table is null then raise exception 'INVALID_TABLE'; end if;

  select * into v_session from table_sessions
    where table_id = v_table
      and (status = 'open' or (p_session is not null and id = p_session and closed_at > now() - interval '1 hour'))
    order by (status = 'open') desc, opened_at desc limit 1;

  if v_session.id is null then
    return jsonb_build_object('session', null, 'orders', '[]'::jsonb,
      'requests', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'created_at', created_at))
                            from service_requests where table_id = v_table and status = 'open'), '[]'::jsonb));
  end if;

  return jsonb_build_object(
    'session', jsonb_build_object('id', v_session.id, 'status', v_session.status),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'number', o.number, 'status', o.status, 'total', o.total, 'created_at', o.created_at,
        'items', (select jsonb_agg(jsonb_build_object('name', oi.name, 'qty', oi.qty, 'unit_price', oi.unit_price, 'options', oi.options))
                  from order_items oi where oi.order_id = o.id))
        order by o.created_at)
      from orders o where o.session_id = v_session.id), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'created_at', created_at))
      from service_requests where table_id = v_table and status = 'open'), '[]'::jsonb)
  );
end $$;

grant execute on function public.table_status(text, text, uuid) to anon, authenticated;
