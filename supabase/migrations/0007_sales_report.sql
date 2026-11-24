-- Sales reports for owners: totals, sales per day, busy hours, best sellers and bar vs kitchen,
-- for any date range. Worked out in the database so a busy month isn't cut off by the API's row limit.
-- Days and hours are in Philippine time. Cancelled orders don't count; open (unpaid) tabs do.

create or replace function public.sales_report(p_cafe uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_len interval := p_to - p_from;
  v_result jsonb;
begin
  if not is_owner(p_cafe) then raise exception 'Not allowed'; end if;
  if p_to <= p_from or v_len > interval '400 days' then raise exception 'BAD_RANGE'; end if;

  with o as (
    select id, total, created_at at time zone 'Asia/Manila' as local
    from orders
    where cafe_id = p_cafe and status <> 'cancelled' and created_at >= p_from and created_at < p_to
  ),
  li as (
    select oi.name, oi.qty, oi.unit_price * oi.qty as sales, coalesce(oi.station, 'kitchen') as station
    from order_items oi join o on o.id = oi.order_id
  ),
  -- The period before, cut to the same elapsed time: at 10 AM, "today" is compared with yesterday until 10 AM.
  prev as (
    select coalesce(sum(total), 0) as sales, count(*) as orders
    from orders
    where cafe_id = p_cafe and status <> 'cancelled'
      and created_at >= p_from - v_len and created_at < least(p_to, greatest(now(), p_from)) - v_len
  ),
  days as (
    select d::date as day
    from generate_series((p_from at time zone 'Asia/Manila')::date, ((p_to - interval '1 second') at time zone 'Asia/Manila')::date, interval '1 day') d
  )
  select jsonb_build_object(
    'sales', (select coalesce(sum(total), 0) from o),
    'orders', (select count(*) from o),
    'items', (select coalesce(sum(qty), 0) from li),
    'prev_sales', (select sales from prev),
    'prev_orders', (select orders from prev),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'sales', coalesce(x.sales, 0), 'orders', coalesce(x.orders, 0)) order by d.day), '[]')
             from days d left join (select local::date as day, sum(total) as sales, count(*) as orders from o group by 1) x on x.day = d.day),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'orders', coalesce(x.orders, 0), 'sales', coalesce(x.sales, 0)) order by h), '[]')
              from generate_series(0, 23) h left join (select extract(hour from local)::int as hour, count(*) as orders, sum(total) as sales from o group by 1) x on x.hour = h),
    'best', (select coalesce(jsonb_agg(b order by b.qty desc, b.sales desc), '[]')
             from (select name, sum(qty) as qty, sum(sales) as sales from li group by name order by sum(qty) desc, sum(sales) desc limit 10) b),
    'stations', (select coalesce(jsonb_agg(s order by s.station), '[]')
                 from (select station, sum(qty) as qty, sum(sales) as sales from li group by station) s)
  ) into v_result;
  return v_result;
end $$;

revoke execute on function public.sales_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.sales_report(uuid, timestamptz, timestamptz) to authenticated;
