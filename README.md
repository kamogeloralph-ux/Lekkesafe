# LekkeSafe — Week 1 + Week 2 + Week 3

Community picker, member/patroller registration, one-tap incident reporting, panic button, live patroller alert feed, and an admin console. PWA, vanilla JS, Supabase backend — same stack as SA Recruiters.

## What's here
- `database/schema.sql` — all 7 tables + RLS policies. Already applied to your live Supabase project.
- `index.html` — search and pick your community.
- `register.html` — member registration (stand number, street, ward, guardian, phone, house photo) and patroller application, as tabs.
- `dashboard.html` — **member view**: tonight's patrol card, the 6 one-tap emergency buttons, and the floating panic button.
- `patroller.html` — **patroller view**: shift check-in, and a live feed of incidents via Supabase Realtime.
- `admin.html` — **admin console**: pending member/patroller approvals with photo review, a **Register tab** to add a member or patroller directly (for door-to-door signup or someone without their own phone — approved instantly, no separate approval step), roster scheduling with native date/time pickers, and an incident overview with a Close action.
- `js/app.js` — community list + registration form handling, photo upload, anonymous auth bootstrap.
- `js/incidents.js` — dashboard logic: one-tap reports, panic button, 15-minute live location share.
- `js/patroller.js` — patroller logic: check-in, Realtime subscription, acknowledge/attend actions.
- `js/admin.js` — admin logic: approvals, roster CRUD, incident overview.
- `js/supabase-client.js` — your real Supabase URL + anon key, already filled in. Also bootstraps a silent anonymous auth session on every device.
- `css/styles.css` — the design system (navy/amber "night-watch" look).
- `sw.js`, `manifest.json`, `offline.html`, `icons/` — PWA install + offline shell.
- `.github/workflows/main.yml` — auto-deploys to GitHub Pages on every push to `main`.

## Setup — mostly done already ✅

Your Supabase project (`gwvltxmbvgodvuybnclv`) is already wired up:
- ✅ All 6 tables + `admins` + RLS policies applied
- ✅ `js/supabase-client.js` already has your real project URL and anon key filled in
- ✅ Realtime turned on for `incidents` (live patroller alerts will work)
- ✅ `lekkesafe-photos` storage bucket created, with policies letting a signed-in device upload and read photos

**One thing left that only the dashboard can do** — Supabase doesn't expose this as SQL:
1. **Turn on Anonymous sign-ins**: Supabase dashboard → Authentication → Providers → Anonymous → enable. Every device needs this silent identity for registration/reporting to work at all (it's what `auth.uid() = auth_user_id` in the RLS policies checks against).

Then:
2. **Bootstrap yourself as admin** — once you've registered (which creates an anonymous auth user for your device), find your user ID in Authentication → Users, and run in the SQL editor:
   ```sql
   insert into admins (auth_user_id) values ('your-auth-user-uuid');
   ```
3. **Add at least one test community**:
   ```sql
   insert into communities (name, slug, province) values ('Ivory Park Ext 5', 'ivory-park-ext5', 'Gauteng');
   ```
4. Open `index.html` on a local server (not `file://` — PWA/service worker + geolocation need http/https). Quick option:
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

## Known gaps to close before real-world use
- Storage bucket is public — move house photos to a private bucket with signed URLs before this goes near real addresses.
- No rate-limiting on registration or reporting yet — worth adding before launch to guard against spam/false panic presses.
- **Admin access is device-based, not password-based**: anyone whose anonymous browser session has been added to the `admins` table gets full admin rights from that device. There's no login screen. Fine for one or two trusted phones testing this; before handing `admin.html` to a CPF committee, this needs real Supabase Auth (email/password or magic link) instead of anonymous sessions.
- The panic button's 15-minute location share stops if the browser tab is closed or the phone locks in some browsers (background geolocation is limited on the web without a native wrapper — worth testing on real devices before relying on it).
- House-watch acceptance surfaces a member's stand number/street/phone to any verified patroller in the community — reasonable for a small neighbourhood watch, but worth a second look if a community gets large enough that not every patroller should see every address.
- Members/patrollers added via admin.html's Register tab have no `auth_user_id` (no device of their own registered them), so they won't be able to log into `dashboard.html`/`patroller.html` themselves — they exist as roster/address-book entries only, until they register on their own phone.
