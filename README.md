# LekkeSafe — Week 1

Community picker + member/patroller registration. PWA, vanilla JS, Supabase backend — same stack as SA Recruiters.

## What's here
- `database/schema.sql` — all 6 tables + RLS policies. Run this in the Supabase SQL editor first.
- `index.html` — search and pick your community.
- `register.html` — member registration (stand number, street, ward, guardian, phone, house photo) and patroller application, as tabs.
- `js/app.js` — all the logic: community list, form handling, photo upload.
- `js/supabase-client.js` — **put your Supabase URL + anon key here.**
- `css/styles.css` — the design system (navy/amber "night-watch" look).
- `sw.js`, `manifest.json`, `offline.html`, `icons/` — PWA install + offline shell.

## Setup (10 minutes)

1. **Create a Supabase project** (or reuse an existing one, in its own project — don't share tables with SA Recruiters).
2. **Run the schema**: paste `database/schema.sql` into the SQL editor and run it.
3. **Create a storage bucket** called `lekkesafe-photos`. Set it to public for now (Week 1 simplicity) — see the note in schema.sql about switching this to private + signed URLs before real house photos go live.
4. **Bootstrap yourself as admin**: after you sign up a Supabase Auth user for yourself, run:
   ```sql
   insert into admins (auth_user_id) values ('your-auth-user-uuid');
   ```
5. **Add at least one test community**:
   ```sql
   insert into communities (name, slug, province) values ('Ivory Park Ext 5', 'ivory-park-ext5', 'Gauteng');
   ```
6. **Fill in `js/supabase-client.js`** with your project's URL and anon key (Project Settings → API).
7. Open `index.html` on a local server (not `file://` — PWA/service worker needs http). Quick option:
   ```
   npx serve .
   ```

## Deploy
Same pattern as SA Recruiters: push to a GitHub repo, deploy via GitHub Pages (or Actions if you want a build step later).

## Known gaps to close before Week 2
- Storage bucket is public in this Week-1 setup — move house photos to a private bucket with signed URLs before this goes near real addresses.
- No rate-limiting on registration yet (fine for Week 1 testing, not for a public link).
- Patroller `id_number` is currently readable by any verified community member via the `patrollers` table — restrict it to admin-only (e.g. a view without that column) before launch.
