-- QRave initial schema
-- Multi-cafe QR ordering. Each cafe's data is isolated by row-level security.
-- Customers are anonymous: they read the public menu directly and place orders
-- only through SECURITY DEFINER functions that validate the table token and
-- compute prices on the server.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.cafes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  name text not null check (char_length(name) between 1 and 80),
  tagline text check (char_length(tagline) <= 140),
  logo_url text,
  primary_color text not null default '#7a4b2a' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  currency text not null default 'PHP',
  status text not null default 'active' check (status in ('active', 'suspended')),
  next_order_number integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.cafe_members (
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  primary key (cafe_id, user_id)
);
create index on public.cafe_members(user_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  name_fil text check (char_length(name_fil) <= 60),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.categories(cafe_id, position);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  name_fil text check (char_length(name_fil) <= 80),
  description text check (char_length(description) <= 300),
  description_fil text check (char_length(description_fil) <= 300),
  price numeric(10, 2) not null check (price >= 0),
  photo_url text,
  -- e.g. vegan, vegetarian, gluten-free, dairy-free, contains-nuts, spicy, halal
  tags text[] not null default '{}',
  -- [{ "name": "Oat milk", "name_fil": null, "price": 20 }]
  options jsonb not null default '[]' check (jsonb_typeof(options) = 'array'),
  available boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.items(cafe_id, category_id, position);

create table public.cafe_tables (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  number integer not null check (number > 0),
  label text,
  -- Secret in the QR link so orders can't be sent to a table by guessing its number.
  token text not null unique default encode(gen_random_bytes(9), 'hex'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cafe_id, number)
);

-- A table's running tab for one visit. Orders added during the visit share it;
-- staff close it when the table pays.
create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  table_id uuid not null references public.cafe_tables(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'paid')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index one_open_session_per_table on public.table_sessions(table_id) where status = 'open';
create index on public.table_sessions(cafe_id, status);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  table_id uuid not null references public.cafe_tables(id) on delete cascade,
  session_id uuid not null references public.table_sessions(id) on delete cascade,
  number integer not null,
  status text not null default 'new' check (status in ('new', 'preparing', 'ready', 'served', 'cancelled')),
  note text check (char_length(note) <= 300),
  total numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.orders(cafe_id, created_at desc);
create index on public.orders(session_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  name text not null,
  unit_price numeric(10, 2) not null,
  qty integer not null check (qty between 1 and 50),
  options jsonb not null default '[]'
);
create index on public.order_items(order_id);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  table_id uuid not null references public.cafe_tables(id) on delete cascade,
  kind text not null check (kind in ('waiter', 'bill')),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on public.service_requests(cafe_id, status);

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER so policies don't recurse)
-- ---------------------------------------------------------------------------

create or replace function public.is_member(p_cafe uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from cafe_members where cafe_id = p_cafe and user_id = auth.uid());
$$;

create or replace function public.is_owner(p_cafe uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from cafe_members where cafe_id = p_cafe and user_id = auth.uid() and role = 'owner');
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.cafes enable row level security;
alter table public.cafe_members enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.cafe_tables enable row level security;
alter table public.table_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.service_requests enable row level security;

-- Cafes: anyone can read active cafes (public menu); members can always read theirs.
create policy cafes_read on public.cafes for select
  using (status = 'active' or public.is_member(id));
create policy cafes_owner_update on public.cafes for update
  using (public.is_owner(id)) with check (public.is_owner(id));

-- Members: members see their cafe's team; owners manage it.
create policy members_read on public.cafe_members for select
  using (public.is_member(cafe_id));
create policy members_owner_write on public.cafe_members for all
  using (public.is_owner(cafe_id)) with check (public.is_owner(cafe_id));

-- Menu: public read for active cafes; owners write.
create policy categories_read on public.categories for select
  using (exists (select 1 from cafes c where c.id = cafe_id and c.status = 'active') or public.is_member(cafe_id));
create policy categories_owner_write on public.categories for all
  using (public.is_owner(cafe_id)) with check (public.is_owner(cafe_id));

create policy items_read on public.items for select
  using (exists (select 1 from cafes c where c.id = cafe_id and c.status = 'active') or public.is_member(cafe_id));
create policy items_owner_write on public.items for all
  using (public.is_owner(cafe_id)) with check (public.is_owner(cafe_id));
-- Staff may toggle sold-out (column restricted via the set_item_available function below).

-- Tables (with secret tokens): members only.
create policy tables_member_read on public.cafe_tables for select using (public.is_member(cafe_id));
create policy tables_owner_write on public.cafe_tables for all
  using (public.is_owner(cafe_id)) with check (public.is_owner(cafe_id));

-- Operational data: members read and update; inserts happen through functions.
create policy sessions_member_read on public.table_sessions for select using (public.is_member(cafe_id));
create policy sessions_member_update on public.table_sessions for update
  using (public.is_member(cafe_id)) with check (public.is_member(cafe_id));

create policy orders_member_read on public.orders for select using (public.is_member(cafe_id));
create policy orders_member_update on public.orders for update
  using (public.is_member(cafe_id)) with check (public.is_member(cafe_id));

create policy order_items_member_read on public.order_items for select using (public.is_member(cafe_id));

create policy requests_member_read on public.service_requests for select using (public.is_member(cafe_id));
create policy requests_member_update on public.service_requests for update
  using (public.is_member(cafe_id)) with check (public.is_member(cafe_id));

-- ---------------------------------------------------------------------------
-- Owner sign-up: create a cafe and become its owner
-- ---------------------------------------------------------------------------

create or replace function public.create_cafe(p_name text, p_slug text, p_tables integer default 10)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cafe uuid;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from cafe_members where user_id = auth.uid()) then
    raise exception 'You already have a cafe';
  end if;
  if p_tables is null or p_tables < 1 or p_tables > 200 then raise exception 'Tables must be between 1 and 200'; end if;
  if exists (select 1 from cafes where slug = lower(p_slug)) then raise exception 'That link is already taken'; end if;

  select email into v_email from auth.users where id = auth.uid();
  insert into cafes (name, slug) values (trim(p_name), lower(p_slug)) returning id into v_cafe;
  insert into cafe_members (cafe_id, user_id, role, email) values (v_cafe, auth.uid(), 'owner', v_email);
  insert into cafe_tables (cafe_id, number) select v_cafe, g from generate_series(1, p_tables) g;
  return v_cafe;
end $$;

-- ---------------------------------------------------------------------------
-- Customer functions (anonymous)
-- ---------------------------------------------------------------------------

-- Resolve a QR link to its cafe and table. Returns nothing if invalid.
create or replace function public.resolve_table(p_slug text, p_token text)
returns table (cafe_id uuid, table_id uuid, table_number integer, table_label text)
language sql stable security definer set search_path = public as $$
  select c.id, t.id, t.number, t.label
  from cafes c join cafe_tables t on t.cafe_id = c.id
  where c.slug = lower(p_slug) and c.status = 'active' and t.token = p_token and t.active;
$$;

-- Place an order. p_items: [{ "item_id": uuid, "qty": int, "options": ["Oat milk"] }]
create or replace function public.place_order(p_slug text, p_token text, p_items jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cafe uuid; v_table uuid; v_session uuid; v_order uuid; v_number integer;
  v_total numeric(10, 2) := 0;
  v_line jsonb; v_item items%rowtype; v_qty integer; v_opt text; v_opt_obj jsonb;
  v_unit numeric(10, 2); v_chosen jsonb;
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

    v_total := v_total + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'item_id', v_item.id, 'name', v_item.name, 'unit_price', v_unit, 'qty', v_qty, 'options', v_chosen));
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

  insert into order_items (order_id, cafe_id, item_id, name, unit_price, qty, options)
  select v_order, v_cafe, (l->>'item_id')::uuid, l->>'name', (l->>'unit_price')::numeric, (l->>'qty')::integer, l->'options'
  from jsonb_array_elements(v_lines) l;

  return jsonb_build_object('order_id', v_order, 'number', v_number, 'total', v_total);
end $$;

-- The table's current tab: orders in the open session (or the last one closed in the past hour).
create or replace function public.table_status(p_slug text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_table uuid; v_session table_sessions%rowtype;
begin
  select r.table_id into v_table from resolve_table(p_slug, p_token) r;
  if v_table is null then raise exception 'INVALID_TABLE'; end if;

  select * into v_session from table_sessions
    where table_id = v_table and (status = 'open' or closed_at > now() - interval '1 hour')
    order by (status = 'open') desc, opened_at desc limit 1;
  if v_session.id is null then
    return jsonb_build_object('session', null, 'orders', '[]'::jsonb, 'requests', '[]'::jsonb);
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

-- Call a waiter or ask for the bill. Ignored if the same request is already open.
create or replace function public.request_service(p_slug text, p_token text, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare v_cafe uuid; v_table uuid;
begin
  if p_kind not in ('waiter', 'bill') then raise exception 'BAD_KIND'; end if;
  select r.cafe_id, r.table_id into v_cafe, v_table from resolve_table(p_slug, p_token) r;
  if v_cafe is null then raise exception 'INVALID_TABLE'; end if;
  if not exists (select 1 from service_requests where table_id = v_table and kind = p_kind and status = 'open') then
    insert into service_requests (cafe_id, table_id, kind) values (v_cafe, v_table, p_kind);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Staff functions
-- ---------------------------------------------------------------------------

-- Close a table's tab after payment; also clears its open service requests.
create or replace function public.close_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cafe uuid; v_table uuid;
begin
  select cafe_id, table_id into v_cafe, v_table from table_sessions where id = p_session;
  if v_cafe is null or not is_member(v_cafe) then raise exception 'Not allowed'; end if;
  update table_sessions set status = 'paid', closed_at = now() where id = p_session and status = 'open';
  update service_requests set status = 'done', resolved_at = now() where table_id = v_table and status = 'open';
end $$;

-- Staff can mark items sold out without having full menu edit rights.
create or replace function public.set_item_available(p_item uuid, p_available boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_cafe uuid;
begin
  select cafe_id into v_cafe from items where id = p_item;
  if v_cafe is null or not is_member(v_cafe) then raise exception 'Not allowed'; end if;
  update items set available = p_available where id = p_item;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Table access for the Data API. Granted explicitly so the app works even when the project was
-- created with "Grant API access to new tables automatically" switched off. RLS still decides
-- which rows each user can see or change.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.cafes, public.categories, public.items to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant execute on function public.is_member(uuid), public.is_owner(uuid) to anon, authenticated;

revoke execute on function public.create_cafe(text, text, integer) from public, anon;
revoke execute on function public.close_session(uuid) from public, anon;
revoke execute on function public.set_item_available(uuid, boolean) from public, anon;
grant execute on function public.create_cafe(text, text, integer) to authenticated;
grant execute on function public.close_session(uuid) to authenticated;
grant execute on function public.set_item_available(uuid, boolean) to authenticated;
grant execute on function public.resolve_table(text, text) to anon, authenticated;
grant execute on function public.place_order(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.table_status(text, text) to anon, authenticated;
grant execute on function public.request_service(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime for the staff screen (respects RLS)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.orders, public.service_requests, public.table_sessions;

-- ---------------------------------------------------------------------------
-- Photo storage: public read; owners write inside their cafe's folder.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cafe-media', 'cafe-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy cafe_media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cafe-media' and public.is_owner(((storage.foldername(name))[1])::uuid));
create policy cafe_media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'cafe-media' and public.is_owner(((storage.foldername(name))[1])::uuid));
create policy cafe_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cafe-media' and public.is_owner(((storage.foldername(name))[1])::uuid));
