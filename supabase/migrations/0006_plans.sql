-- Plans: every new cafe gets a free 7-day trial, then a monthly subscription or a one-time build.
-- When a trial or a paid month runs out, customers can no longer open the menu or order;
-- the owner can still sign in and sees why. Only QRave (the secret key, used by /admin) can change a plan.

alter table public.cafes
  add column plan text not null default 'trial' check (plan in ('trial', 'monthly', 'one_time', 'comp')),
  add column trial_ends_at timestamptz not null default now() + interval '7 days',
  add column paid_until timestamptz;

-- Cafes that existed before plans keep working ("comp" = free, set by QRave) until a plan is picked in /admin.
update public.cafes set plan = 'comp';

-- Is a cafe open for customers? Trial: until the trial ends. Monthly: until the paid month ends
-- (before the first payment, the trial days still count). One-time build and comp: always.
create or replace function public.cafe_open_at(p_status text, p_plan text, p_trial timestamptz, p_paid timestamptz)
returns boolean language sql stable as $$
  select p_status = 'active' and case p_plan
    when 'trial' then p_trial > now()
    when 'monthly' then coalesce(p_paid, p_trial) > now()
    else true end;
$$;

create or replace function public.cafe_is_open(p_cafe uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from cafes c where c.id = p_cafe and cafe_open_at(c.status, c.plan, c.trial_ends_at, c.paid_until));
$$;

-- For the customer page: tell "this cafe is paused" apart from "no such cafe".
create or replace function public.cafe_closed(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from cafes c where c.slug = lower(p_slug) and not cafe_open_at(c.status, c.plan, c.trial_ends_at, c.paid_until));
$$;

-- Public reads follow the plan, not just the status.
drop policy cafes_read on public.cafes;
create policy cafes_read on public.cafes for select
  using (public.cafe_open_at(status, plan, trial_ends_at, paid_until) or public.is_member(id));
drop policy categories_read on public.categories;
create policy categories_read on public.categories for select
  using (public.cafe_is_open(cafe_id) or public.is_member(cafe_id));
drop policy items_read on public.items;
create policy items_read on public.items for select
  using (public.cafe_is_open(cafe_id) or public.is_member(cafe_id));

-- Every customer action (menu link, ordering, table status, calling the waiter) goes through this.
create or replace function public.resolve_table(p_slug text, p_token text)
returns table (cafe_id uuid, table_id uuid, table_number integer, table_label text)
language sql stable security definer set search_path = public as $$
  select c.id, t.id, t.number, t.label
  from cafes c join cafe_tables t on t.cafe_id = c.id
  where c.slug = lower(p_slug) and cafe_open_at(c.status, c.plan, c.trial_ends_at, c.paid_until)
    and t.token = p_token and t.active;
$$;

-- Owners can edit their cafe's name, colours and links, but not its plan or status.
create or replace function public.guard_cafe_plan() returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.plan, new.trial_ends_at, new.paid_until, new.status)
         is distinct from (old.plan, old.trial_ends_at, old.paid_until, old.status) then
    raise exception 'Only QRave can change a cafe''s plan';
  end if;
  return new;
end $$;
create trigger cafes_guard_plan before update on public.cafes
  for each row execute function public.guard_cafe_plan();

grant execute on function public.cafe_open_at(text, text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.cafe_is_open(uuid) to anon, authenticated;
grant execute on function public.cafe_closed(text) to anon, authenticated;
