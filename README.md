# LekkeSafe — Week 1 + Week 2

Community picker, member/patroller registration, one-tap incident reporting, panic button, and a live patroller alert feed. PWA, vanilla JS, Supabase backend — same stack as SA Recruiters.

## What's here
- `database/schema.sql` — all 6 tables + RLS policies. Run this in the Supabase SQL editor first.
- `index.html` — search and pick your community.
- `register.html` — member registration (stand number, street, ward, guardian, phone, house photo) and patroller application, as tabs.
- `dashboard.html` — **member view**: tonight's patrol card, the 6 one-tap emergency buttons, and the floating panic button.
- `patroller.html` — **patroller view**: shift check-in, and a live feed of incidents that updates instantly via Supabase Realtime (no refresh needed).
- `js/app.js` — community list + registration form handling, photo upload.
- `js/incidents.js` — dashboard logic: one-tap reports, panic button, 15-minute live location share.
- `js/patroller.js` — patroller logic: check-in, Realtime subscription, acknowledge/attend actions.
- `js/supabase-client.js` — **put your Supabase URL + anon key here.** Also bootstraps a silent anonymous auth session on every device (see below — this is what lets RLS know who's reporting).
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
7. **Turn on Anonymous sign-ins**: Authentication → Providers → Anonymous → enable. Every device gets a silent, no-typing identity — this is what lets RLS policies (`auth.uid() = auth_user_id`) actually match, and what ties incident reports and panic alerts to the right member.
8. **Turn on Realtime for `incidents`**: Database → Replication (or Table Editor → `incidents` → the Realtime toggle) → switch it on. Without this, `patroller.html` won't get live pushes and would need a manual refresh.
9. Open `index.html` on a local server (not `file://` — PWA/service worker + geolocation need http/https). Quick option:
   ```
   npx serve .
   ```

## Testing Week 2 end-to-end
1. Register as a member in one browser tab, and as a patroller in another (or an incognito window).
2. In the Supabase Table Editor, mark both rows `verified = true` (this is the manual stand-in for the admin approval screen, which isn't built yet).
3. Add a `roster` row for the patroller for today's date, so the "tonight's patrol" card and check-in button have something to show.
4. Open `dashboard.html?community=<your-slug>` and `patroller.html?community=<your-slug>` side by side. Tap a report button (or the panic button) on the member side — it should appear on the patroller side within a second or two, no refresh.

## Deploy
Same pattern as SA Recruiters: push to a GitHub repo, deploy via GitHub Pages (or Actions if you want a build step later).

## Known gaps to close before Week 3
- Storage bucket is public in this setup — move house photos to a private bucket with signed URLs before this goes near real addresses.
- No rate-limiting on registration or reporting yet (fine for testing, not for a public link) — worth adding before launch to guard against spam/false panic presses.
- Patroller `id_number` is currently readable by any verified community member via the `patrollers` table — restrict it to admin-only (e.g. a view without that column) before launch.
- There's no admin approval screen yet — verifying members/patrollers is done by hand in the Supabase Table Editor. That's the natural Week 3 piece alongside the patroller roster management UI.
- The panic button's 15-minute location share stops if the browser tab is closed or the phone locks in some browsers (background geolocation is limited on the web without a native wrapper — worth testing on real devices before relying on it).
