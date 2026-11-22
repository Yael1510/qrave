-- Move a tab to another table (staff only), for when customers change tables after ordering.
-- Every order on the tab, served or not, moves to the new table, and so do open waiter/bill requests.
-- If the new table already has an open tab, the two are combined into one bill.
-- A phone still on the old table's page is told where its tab went.
-- Safe to run more than once.

-- 'moved' = this tab was combined into another table's tab (moved_to points at it).
alter table public.table_sessions drop constraint if exists table_sessions_status_check;
alter table public.table_sessions add constraint table_sessions_status_check check (status in ('open', 'paid', 'moved'));
alter table public.table_sessions add column if not exists moved_to uuid references public.table_sessions(id) on delete set null;

create or replace function public.move_session(p_session uuid, p_table uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s table_sessions%rowtype;
  v_t cafe_tables%rowtype;
  v_dest uuid;
  v_merged boolean := false;
begin
  select * into v_s from table_sessions where id = p_session for update;
  if v_s.id is null or not is_member(v_s.cafe_id) then raise exception 'Not allowed'; end if;
  if v_s.status <> 'open' then raise exception 'TAB_CLOSED'; end if;
  select * into v_t from cafe_tables where id = p_table and cafe_id = v_s.cafe_id and active;
  if v_t.id is null then raise exception 'BAD_TABLE'; end if;
  if v_t.id = v_s.table_id then raise exception 'SAME_TABLE'; end if;

  select id into v_dest from table_sessions where table_id = p_table and status = 'open' for update;
  if v_dest is null then
    -- Free table: the tab itself moves.
    update table_sessions set table_id = p_table where id = p_session;
    v_dest := p_session;
  else
    -- The table already has a tab: combine them into that one.
    update orders set session_id = v_dest where session_id = p_session;
    update table_sessions set status = 'moved', closed_at = now(), moved_to = v_dest where id = p_session;
    v_merged := true;
  end if;
  update orders set table_id = p_table where session_id = v_dest and table_id <> p_table;

  -- Open requests follow the customers (a duplicate of one the new table already has is just closed).
  update service_requests r set status = 'done', resolved_at = now()
    where r.table_id = v_s.table_id and r.status = 'open'
      and exists (select 1 from service_requests x where x.table_id = p_table and x.kind = r.kind and x.status = 'open');
  update service_requests set table_id = p_table where table_id = v_s.table_id and status = 'open';

  return jsonb_build_object('session', v_dest, 'merged', v_merged, 'table_number', v_t.number, 'table_label', v_t.label);
end $$;

revoke execute on function public.move_session(uuid, uuid) from public, anon;
grant execute on function public.move_session(uuid, uuid) to authenticated;

-- Same as 0003, plus 'moved_to': when the phone's own tab (p_session) now lives at another table,
-- it gets that table's number and name so it can tell the customer to scan there.
create or replace function public.table_status(p_slug text, p_token text, p_session uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_table uuid; v_session table_sessions%rowtype; v_mine table_sessions%rowtype; v_moved jsonb; v_hops int := 0;
begin
  select r.table_id into v_table from resolve_table(p_slug, p_token) r;
  if v_table is null then raise exception 'INVALID_TABLE'; end if;

  select * into v_session from table_sessions
    where table_id = v_table
      and (status = 'open' or (p_session is not null and id = p_session and status = 'paid' and closed_at > now() - interval '1 hour'))
    order by (status = 'open') desc, opened_at desc limit 1;

  if p_session is not null and (v_session.id is null or v_session.id <> p_session) then
    select * into v_mine from table_sessions where id = p_session;
    while v_mine.status = 'moved' and v_mine.moved_to is not null and v_hops < 5 loop
      select * into v_mine from table_sessions where id = v_mine.moved_to;
      v_hops := v_hops + 1;
    end loop;
    if v_mine.id is not null and v_mine.status = 'open' and v_mine.table_id <> v_table then
      select jsonb_build_object('number', t.number, 'label', t.label) into v_moved from cafe_tables t where t.id = v_mine.table_id;
    end if;
  end if;

  if v_session.id is null then
    return jsonb_build_object('session', null, 'orders', '[]'::jsonb, 'moved_to', v_moved,
      'requests', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'created_at', created_at))
        from service_requests where table_id = v_table and status = 'open'), '[]'::jsonb));
  end if;

  return jsonb_build_object(
    'session', jsonb_build_object('id', v_session.id, 'status', v_session.status),
    'moved_to', v_moved,
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
