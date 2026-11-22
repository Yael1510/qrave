-- Stations: drinks go to the bar (barista), food goes to the kitchen.
-- Each category belongs to a station. When an order is placed, every line copies its category's
-- station and gets its own status (new → preparing → ready), so the bar and the kitchen each move
-- their part of an order on their own. orders.status stays the overall status and is derived:
-- preparing as soon as any station starts, ready only when every line is ready.
-- Safe to run more than once.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'categories' and column_name = 'station') then
    alter table public.categories
      add column station text not null default 'kitchen' check (station in ('bar', 'kitchen'));
    -- First run only: send obvious drink categories to the bar. Owners can switch any category in the menu editor.
    update public.categories set station = 'bar'
      where name ~* '\m(coffee|kape|drink|inumin|beverage|tea|latte|espresso|frapp|blended|refresher|juice|smoothie|shake|soda|matcha|cocoa)';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'order_items' and column_name = 'station') then
    alter table public.order_items
      add column station text not null default 'kitchen' check (station in ('bar', 'kitchen')),
      add column status text not null default 'new' check (status in ('new', 'preparing', 'ready'));
    -- Existing lines: station from the item's category, status from the order.
    update public.order_items oi set station = c.station
      from public.items i join public.categories c on c.id = i.category_id
      where oi.item_id = i.id;
    update public.order_items oi set status = case o.status when 'preparing' then 'preparing'
                                                            when 'ready' then 'ready' when 'served' then 'ready' else 'new' end
      from public.orders o where o.id = oi.order_id;
  end if;
end $$;

-- Same as 0001, plus each line's station copied from its category.
create or replace function public.place_order(p_slug text, p_token text, p_items jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cafe uuid; v_table uuid; v_session uuid; v_order uuid; v_number integer;
  v_total numeric(10, 2) := 0;
  v_line jsonb; v_item items%rowtype; v_qty integer; v_opt text; v_opt_obj jsonb;
  v_unit numeric(10, 2); v_chosen jsonb; v_station text;
  v_lines jsonb := '[]';
begin
  select r.cafe_id, r.table_id into v_cafe, v_table from resolve_table(p_slug, p_token) r;
  if v_cafe is null then raise exception 'INVALID_TABLE'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'EMPTY_ORDER'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'TOO_MANY_ITEMS'; end if;

  -- Throttle: at most 10 orders per table per 10 minutes.
  if (select count(*) from orders where table_id = v_table and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'TOO_MANY_ORDERS';
  end if;

  -- Validate every line and compute prices from the menu, never from the client.
  for v_line in select * from jsonb_array_elements(p_items) loop
    select * into v_item from items where id = (v_line->>'item_id')::uuid and cafe_id = v_cafe;
    if not found or not v_item.available then raise exception 'ITEM_UNAVAILABLE'; end if;
    v_qty := (v_line->>'qty')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'BAD_QTY'; end if;

    v_unit := v_item.price;
    v_chosen := '[]';
    if jsonb_typeof(v_line->'options') = 'array' then
      for v_opt in select distinct jsonb_array_elements_text(v_line->'options') loop
        select o.value into v_opt_obj from jsonb_array_elements(v_item.options) as o(value)
          where o.value->>'name' = v_opt limit 1;
        if v_opt_obj is not null then
          v_unit := v_unit + coalesce((v_opt_obj->>'price')::numeric, 0);
          v_chosen := v_chosen || jsonb_build_array(v_opt_obj);
        end if;
        v_opt_obj := null;
      end loop;
    end if;

    select coalesce(c.station, 'kitchen') into v_station from categories c where c.id = v_item.category_id;

    v_total := v_total + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'item_id', v_item.id, 'name', v_item.name, 'unit_price', v_unit, 'qty', v_qty, 'options', v_chosen,
      'station', coalesce(v_station, 'kitchen')));
  end loop;

  -- Join the table's open tab, or start one.
  select id into v_session from table_sessions where table_id = v_table and status = 'open';
  if v_session is null then
    insert into table_sessions (cafe_id, table_id) values (v_cafe, v_table) returning id into v_session;
  end if;

  update cafes set next_order_number = next_order_number + 1 where id = v_cafe
    returning next_order_number - 1 into v_number;

  insert into orders (cafe_id, table_id, session_id, number, note, total)
    values (v_cafe, v_table, v_session, v_number, nullif(left(trim(p_note), 300), ''), v_total)
    returning id into v_order;

  insert into order_items (order_id, cafe_id, item_id, name, unit_price, qty, options, station)
  select v_order, v_cafe, (l->>'item_id')::uuid, l->>'name', (l->>'unit_price')::numeric, (l->>'qty')::integer, l->'options', l->>'station'
  from jsonb_array_elements(v_lines) l;

  return jsonb_build_object('order_id', v_order, 'number', v_number, 'total', v_total);
end $$;

-- Staff: move one station's lines of an order along (p_station null = every station, the counter's view).
-- 'preparing' starts lines that are still new; 'ready' finishes every line of that station.
-- Then the order's overall status is worked out again from all of its lines.
create or replace function public.set_station_status(p_order uuid, p_station text, p_status text)
returns text language plpgsql security definer set search_path = public as $$
declare v_o orders%rowtype; v_status text;
begin
  if p_status is null or p_status not in ('preparing', 'ready') then raise exception 'BAD_STATUS'; end if;
  if p_station is not null and p_station not in ('bar', 'kitchen') then raise exception 'BAD_STATION'; end if;
  select * into v_o from orders where id = p_order for update;
  if v_o.id is null or not is_member(v_o.cafe_id) then raise exception 'Not allowed'; end if;
  if v_o.status not in ('new', 'preparing', 'ready') then raise exception 'ORDER_CLOSED'; end if;

  update order_items set status = p_status
    where order_id = p_order and (p_station is null or station = p_station)
      and ((p_status = 'ready' and status <> 'ready') or (p_status = 'preparing' and status = 'new'));

  select case when bool_and(status = 'ready') then 'ready' when bool_or(status <> 'new') then 'preparing' else 'new' end
    into v_status from order_items where order_id = p_order;
  v_status := coalesce(v_status, v_o.status);

  -- Always touch the order (even if its status is unchanged) so staff screens get a live update.
  perform set_config('qrave.station_update', 'on', true);
  update orders set status = v_status where id = p_order;
  perform set_config('qrave.station_update', 'off', true);
  return v_status;
end $$;

revoke execute on function public.set_station_status(uuid, text, text) from public, anon;
grant execute on function public.set_station_status(uuid, text, text) to authenticated;

-- If an order's status is changed directly (older screens, or the counter skipping ahead),
-- bring its lines along so the bar and kitchen screens agree.
create or replace function public.sync_order_items_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('qrave.station_update', true), 'off') = 'on' then return new; end if;
  if new.status = 'preparing' then
    update order_items set status = 'preparing' where order_id = new.id and status = 'new';
  elsif new.status in ('ready', 'served') then
    update order_items set status = 'ready' where order_id = new.id and status <> 'ready';
  end if;
  return new;
end $$;

drop trigger if exists orders_sync_items on public.orders;
create trigger orders_sync_items after update of status on public.orders
  for each row when (old.status is distinct from new.status) execute function public.sync_order_items_status();

-- Same as 0004, plus each line's station and status, so the phone can say e.g. "Drinks ready · Food preparing".
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
        'items', (select jsonb_agg(jsonb_build_object('name', oi.name, 'qty', oi.qty, 'unit_price', oi.unit_price, 'options', oi.options,
                                                      'station', oi.station, 'status', oi.status))
                  from order_items oi where oi.order_id = o.id))
        order by o.created_at)
      from orders o where o.session_id = v_session.id), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'created_at', created_at))
      from service_requests where table_id = v_table and status = 'open'), '[]'::jsonb)
  );
end $$;

grant execute on function public.table_status(text, text, uuid) to anon, authenticated;
