-- Menu details: item badges, prep time, calories; category layout; cafe social links.
-- Safe to run more than once.

alter table public.items
  add column if not exists badge text check (char_length(badge) <= 24),
  add column if not exists prep_minutes integer check (prep_minutes between 1 and 240),
  add column if not exists calories integer check (calories between 1 and 5000);

alter table public.categories
  add column if not exists layout text not null default 'list' check (layout in ('list', 'grid'));

-- { "facebook": url, "instagram": url, "tiktok": url, "maps": url, "phone": "+63…" }
alter table public.cafes
  add column if not exists links jsonb not null default '{}' check (jsonb_typeof(links) = 'object');
