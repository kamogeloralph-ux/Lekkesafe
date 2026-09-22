-- ============================================================
-- LekkeSafe — Supabase schema
-- Community neighbourhood-watch app: members, patrollers, roster,
-- incident reports, panic alerts, house-watch requests.
-- ============================================================

-- ---------- extensions ----------
create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------- 1. communities ----------
create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- e.g. "Ivory Park Ext 5"
  slug text not null unique,          -- e.g. "ivory-park-ext5" -> used in URL /c/ivory-park-ext5
  province text,
  location_lat double precision,
  location_lng double precision,
  created_at timestamptz not null default now()
);

-- ---------- 2. members ----------
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  stand_number text not null,
  street text not null,
  ward text,
  guardian_name text not null,
  phone text not null,
  house_photo_url text,               -- proof-of-residence photo, Supabase Storage path
  verified boolean not null default false,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_members_community on members(community_id);

-- ---------- 3. patrollers ----------
create table if not exists patrollers (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  phone text not null,
  id_number text,                     -- SA ID number, store carefully (see notes at bottom)
  photo_url text,
  verified boolean not null default false,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  push_token text,                    -- for panic-alert push notifications
  created_at timestamptz not null default now()
);

create index if not exists idx_patrollers_community on patrollers(community_id);

-- ---------- 4. roster ----------
create table if not exists roster (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  patroller_id uuid not null references patrollers(id) on delete cascade,
  date date not null,
  car_registration text,
  car_color text,
  car_make_model text,
  shift_start timestamptz not null,
  shift_end timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'checked_in', 'no_show', 'completed')),
  checked_in_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_roster_community_date on roster(community_id, date);

-- ---------- 5. incidents ----------
create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  member_id uuid references members(id) on delete set null,
  type text not null
    check (type in (
      'intruder', 'violence', 'theft_neighbour', 'suspicious_person',
      'medical_fire_kids', 'panic', 'other'
    )),
  description text,                   -- only used for 'other'
  stand_number text,
  gps_lat double precision,
  gps_lng double precision,
  status text not null default 'pending'
    check (status in ('pending', 'acknowledged', 'attended', 'closed')),
  attended_by uuid references patrollers(id),
  attended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_incidents_community_status on incidents(community_id, status);

-- ---------- 6. house_watch_requests ----------
create table if not exists house_watch_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  reason text not null
    check (reason in ('no_one_home', 'kids_only', 'escort_taxi_rank', 'other')),
  reason_note text,
  date_needed date not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'completed')),
  accepted_by uuid references patrollers(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_house_watch_community on house_watch_requests(community_id, date_needed);

-- ============================================================
-- Row Level Security
-- Pattern: public can INSERT their own rows (registration / reports),
-- read is scoped to "verified" community members/patrollers,
-- and all UPDATE/DELETE is admin-only via is_admin().
-- Mirrors the SA Recruiters RLS pattern (is_admin() helper + per-table policies).
-- ============================================================

-- admins table must exist before is_admin() is defined — SQL-language
-- functions are validated against the catalog at creation time, so
-- creating is_admin() first fails with "relation admins does not exist".
create table if not exists admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  community_id uuid references communities(id), -- null = super-admin across all communities
  created_at timestamptz not null default now()
);

-- Helper: is the current auth user an admin? Adjust to your admin-flagging
-- mechanism (e.g. a claim, or an `admins` table) — placeholder shown here.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from admins where admins.auth_user_id = auth.uid()
  );
$$;

alter table communities enable row level security;
alter table members enable row level security;
alter table patrollers enable row level security;
alter table roster enable row level security;
alter table incidents enable row level security;
alter table house_watch_requests enable row level security;
alter table admins enable row level security;

-- communities: public read (needed for community picker), admin write
create policy "communities_public_read" on communities for select using (true);
create policy "communities_admin_write" on communities for all using (is_admin()) with check (is_admin());

-- members: self-insert on registration; self can read own row; admin full access
create policy "members_self_insert" on members for insert with check (auth.uid() = auth_user_id);
create policy "members_self_read" on members for select using (auth.uid() = auth_user_id or is_admin());
create policy "members_patroller_read" on members for select using (
  community_id in (
    select community_id from patrollers
    where auth_user_id = auth.uid() and verified = true
  )
); -- verified patrollers need this to see a requester's address when accepting a house-watch request
create policy "members_admin_write" on members for update using (is_admin()) with check (is_admin());
create policy "members_admin_delete" on members for delete using (is_admin());
create policy "members_admin_insert" on members for insert with check (is_admin());
-- lets an admin register a member on someone's behalf (door-to-door signup,
-- or someone without their own device), in addition to self-registration

-- patrollers: same self-insert/read pattern, verified ones are visible community-wide (for "tonight's patrollers")
create policy "patrollers_self_insert" on patrollers for insert with check (auth.uid() = auth_user_id);
create policy "patrollers_verified_read" on patrollers for select using (verified = true or auth.uid() = auth_user_id or is_admin());
create policy "patrollers_admin_write" on patrollers for update using (is_admin()) with check (is_admin());
create policy "patrollers_admin_delete" on patrollers for delete using (is_admin());
create policy "patrollers_admin_insert" on patrollers for insert with check (is_admin());

-- roster: readable by anyone in the community (members need to see tonight's patrol), writes by admin or the patroller checking themselves in
create policy "roster_public_read" on roster for select using (true);
create policy "roster_admin_write" on roster for insert with check (is_admin());
create policy "roster_checkin_update" on roster for update using (
  is_admin() or patroller_id in (select id from patrollers where auth_user_id = auth.uid())
);
create policy "roster_admin_delete" on roster for delete using (is_admin());

-- incidents: a member can insert their own report; only patrollers/admins in that community can read (privacy/safety — not public)
create policy "incidents_member_insert" on incidents for insert with check (
  member_id in (select id from members where auth_user_id = auth.uid())
);
create policy "incidents_patroller_admin_read" on incidents for select using (
  is_admin() or community_id in (select community_id from patrollers where auth_user_id = auth.uid())
  or member_id in (select id from members where auth_user_id = auth.uid())
);
create policy "incidents_patroller_admin_update" on incidents for update using (
  is_admin() or community_id in (select community_id from patrollers where auth_user_id = auth.uid())
);

-- house_watch_requests: member creates/reads own; patrollers in community can read+accept
create policy "house_watch_member_insert" on house_watch_requests for insert with check (
  member_id in (select id from members where auth_user_id = auth.uid())
);
create policy "house_watch_read" on house_watch_requests for select using (
  is_admin()
  or member_id in (select id from members where auth_user_id = auth.uid())
  or community_id in (select community_id from patrollers where auth_user_id = auth.uid())
);
create policy "house_watch_patroller_update" on house_watch_requests for update using (
  is_admin() or community_id in (select community_id from patrollers where auth_user_id = auth.uid())
);

-- admins: only readable/writable by existing admins (bootstrap the first row manually in the SQL editor)
create policy "admins_admin_only" on admins for all using (is_admin()) with check (is_admin());

-- ============================================================
-- Notes
-- - id_number (patrollers) and house_photo_url (members) are sensitive personal
--   data tied to a physical address. Consider: (a) storing house_photo_url in a
--   private Supabase Storage bucket with signed URLs, not a public bucket;
--   (b) a retention/expiry policy; (c) restricting id_number visibility to
--   is_admin() only via a view, rather than exposing it on the patrollers row
--   that community members can read.
-- - Realtime: enable Realtime on `incidents` (and optionally `roster`) in the
--   Supabase dashboard so panic alerts push to patroller devices instantly.
-- ============================================================
