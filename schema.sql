-- =====================================================================
-- TRICIAS BEAUTY CONNER – Supabase schema
-- Run this whole file once in Supabase > SQL Editor.
-- =====================================================================

-- ---------- Tables ---------------------------------------------------

-- Who is allowed to use the owner dashboard (add Tricia's user id, see README)
create table if not exists public.owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.owners enable row level security;
-- no policies on purpose: nobody can read/write it from the browser

-- Single-row salon settings (working hours, appointment length, open days)
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  open_time time not null default '06:00',
  close_time time not null default '18:00',
  slot_minutes int not null default 120 check (slot_minutes between 15 and 600),
  working_days int[] not null default '{1,2,3,4,5,6}',   -- 1 = Monday ... 7 = Sunday
  max_days_ahead int not null default 60 check (max_days_ahead between 1 and 365),
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  whatsapp text not null check (char_length(whatsapp) between 7 and 20),
  service text not null check (char_length(service) between 2 and 100),
  booking_date date not null,
  booking_time time not null,
  duration_minutes int not null default 120 check (duration_minutes between 15 and 600),
  notes text check (notes is null or char_length(notes) <= 600),
  status text not null default 'pending' check (status in ('pending','confirmed','declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists bookings_date_idx on public.bookings (booking_date, status);

-- HARD GUARANTEE: two CONFIRMED appointments can never overlap,
-- even if two confirmations happen at the very same moment.
-- Pending / declined rows are ignored, so they never block a time.
alter table public.bookings drop constraint if exists no_overlapping_confirmed;
alter table public.bookings add constraint no_overlapping_confirmed
  exclude using gist (
    tsrange(
      (booking_date + booking_time),
      (booking_date + booking_time + make_interval(mins => duration_minutes)),
      '[)'
    ) with &&
  ) where (status = 'confirmed');

-- ---------- Row Level Security --------------------------------------

alter table public.settings enable row level security;
alter table public.bookings enable row level security;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.owners where user_id = auth.uid()); $$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

drop policy if exists "settings readable by everyone" on public.settings;
create policy "settings readable by everyone" on public.settings
  for select using (true);

drop policy if exists "owner updates settings" on public.settings;
create policy "owner updates settings" on public.settings
  for update using (public.is_owner()) with check (public.is_owner());

-- Bookings: customers cannot read or write the table directly at all.
-- They only use the functions below. Only the owner can read/update rows.
drop policy if exists "owner reads bookings" on public.bookings;
create policy "owner reads bookings" on public.bookings
  for select using (public.is_owner());

drop policy if exists "owner updates bookings" on public.bookings;
create policy "owner updates bookings" on public.bookings
  for update using (public.is_owner()) with check (public.is_owner());

-- ---------- Public functions (customers) -----------------------------

-- Free start times for a date (confirmed bookings and past times removed)
create or replace function public.get_available_slots(p_date date)
returns table (slot time)
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.settings;
  now_local timestamp := (now() at time zone 'Europe/Madrid');
begin
  select * into s from public.settings where id = 1;

  if p_date is null
     or p_date < now_local::date
     or p_date > now_local::date + s.max_days_ahead
     or not (extract(isodow from p_date)::int = any (s.working_days)) then
    return;
  end if;

  return query
  select g::time
  from generate_series(
         (p_date + s.open_time),
         (p_date + s.close_time - make_interval(mins => s.slot_minutes)),
         make_interval(mins => s.slot_minutes)
       ) as g
  where g > now_local
    and not exists (
      select 1 from public.bookings b
      where b.status = 'confirmed'
        and tsrange((b.booking_date + b.booking_time),
                    (b.booking_date + b.booking_time + make_interval(mins => b.duration_minutes)), '[)')
         && tsrange(g, g + make_interval(mins => s.slot_minutes), '[)')
    )
  order by g;
end;
$$;

-- Saves a PENDING request (does NOT block the time)
create or replace function public.request_booking(
  p_name text, p_whatsapp text, p_service text,
  p_date date, p_time time, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  s public.settings;
  new_id uuid;
begin
  select * into s from public.settings where id = 1;

  if not exists (select 1 from public.get_available_slots(p_date) a where a.slot = p_time) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.bookings
    (customer_name, whatsapp, service, booking_date, booking_time, duration_minutes, notes, status)
  values
    (btrim(p_name), btrim(p_whatsapp), btrim(p_service), p_date, p_time, s.slot_minutes,
     nullif(btrim(coalesce(p_notes, '')), ''), 'pending')
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.get_available_slots(date) from public;
revoke all on function public.request_booking(text,text,text,date,time,text) from public;
grant execute on function public.get_available_slots(date) to anon, authenticated;
grant execute on function public.request_booking(text,text,text,date,time,text) to anon, authenticated;

-- ---------- Owner functions (Tricia only) ----------------------------

create or replace function public.confirm_booking(p_id uuid)
returns public.bookings
language plpgsql security definer set search_path = public
as $$
declare
  result public.bookings;
begin
  if not public.is_owner() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  update public.bookings
     set status = 'confirmed', decided_at = now()
   where id = p_id and status = 'pending'
  returning * into result;

  if result.id is null then
    raise exception 'NOT_PENDING' using errcode = 'P0001';
  end if;

  return result;
exception
  when exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
end;
$$;

create or replace function public.decline_booking(p_id uuid)
returns public.bookings
language plpgsql security definer set search_path = public
as $$
declare
  result public.bookings;
begin
  if not public.is_owner() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  update public.bookings
     set status = 'declined', decided_at = now()
   where id = p_id and status = 'pending'
  returning * into result;

  if result.id is null then
    raise exception 'NOT_PENDING' using errcode = 'P0001';
  end if;

  return result;
end;
$$;

revoke all on function public.confirm_booking(uuid) from public;
revoke all on function public.decline_booking(uuid) from public;
grant execute on function public.confirm_booking(uuid) to authenticated;
grant execute on function public.decline_booking(uuid) to authenticated;