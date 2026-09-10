# eFootball Friends League — Secure Supabase Setup

The app is a static frontend backed by **Supabase Postgres + Auth + Realtime**.
Passwords belong to **Supabase Auth only**.

`public.players` is a safe league roster/profile table (`name`, `role`, `created`).
The Auth UUID link lives separately in `public.player_accounts`, protected by self-only RLS.
Browser code never needs access to another player's Auth UUID or password.

## Fresh installation

Run these SQL files in order from **Supabase → SQL Editor**:

1. `supabase-schema.sql` — creates league tables and the initial roster. **This wipes existing league data.**
2. `supabase-groups-chat-migration.sql` — creates chat/group tables with RLS enabled and no open writes.
3. `supabase-security-migration.sql` — installs private identity helpers, least-privilege grants, admin/ownership RLS, and chat membership rules.
4. `supabase-derived-data-migration.sql` — installs Postgres triggers for standings and achievements.
5. `supabase-consistency-migration.sql` — installs transactional writes, season triggers and Q&A guards. Run this before deploying the refactored frontend.

Then create the first user in **Authentication → Users**. The frontend expects deterministic private-league addresses:

- `Wael` → `wael@efootball-friends.example`
- `Abdul Rahim` → `abdul-rahim@efootball-friends.example`
- `Omar` → `omar@efootball-friends.example`
- `Mohammad` → `mohammad@efootball-friends.example`
- `Mustafa` → `mustafa@efootball-friends.example`
- `Abdul Qader` → `abdul-qader@efootball-friends.example`

After creating Wael, copy that user's UUID and link it once:

```sql
insert into public.player_accounts (name, auth_user_id)
values ('Wael', '<AUTH_USER_UUID>')
on conflict (name) do update set auth_user_id = excluded.auth_user_id;
```

Wael's row in `public.players` already has `role = 'admin'`. Database RLS uses the Auth UUID mapping to decide whether a request is truly administrative; changing a name in the browser does not grant permissions.

## Existing project upgrade

Do **not** run `supabase-schema.sql` against an existing populated database because it recreates league tables.

1. Back up the database.
2. Run `supabase-groups-chat-migration.sql` only if chat tables do not already exist. Create any missing optional tables with the questions, match-stats and match-goal-events migrations **before** step 3. These optional scripts no longer install broad write policies.
3. Run `supabase-security-migration.sql`.
4. Run `supabase-derived-data-migration.sql`.
5. Run `supabase-consistency-migration.sql`, then create/link the first Supabase Auth user as shown above if needed.
6. Create/link the remaining player Auth users.
7. Verify normal users cannot mutate matches/seasons and the admin can.
8. Rotate every password that ever appeared in this repository or Git history.
9. Remove any legacy password column after migration:

```sql
alter table public.players drop column if exists password;
```

## Authorization model

- Anonymous visitors get read-only Tournament Hub/league data.
- Signed-in league players can read league data and participate in Q&A.
- Only the player whose mapped profile has `role = 'admin'` can mutate matches, seasons, match stats, and goal events.
- Chat groups/messages are visible only to members.
- Joining a chat requires an accepted invitation unless the group owner is adding the member.
- Invitations are restricted to involved users.
- `localStorage` retains only the last selected player and optional chat theme as application preferences. Supabase manages its own Auth session. Legacy custom login/cache markers are purged and are never trusted as authentication.
- Sensitive RLS helper functions live in a non-exposed `private` schema.

## API keys

`supabase-config.js` contains a publishable key. Publishable keys are designed for browser use; Auth, grants, and RLS are the authorization boundary.

Never commit a Supabase secret/service-role key, database password, JWT secret, or private token.

## Derived data

`standings` and `achievements` are recalculated inside Postgres whenever matches, player profiles or seasons change. The browser does not delete and rebuild these tables, avoiding concurrent-session race conditions.

## Performance

The schema includes covering indexes for match/chat foreign keys used by RLS and normal queries. "Unused index" advisor notices are expected on a fresh/empty database and should not be used as a reason to remove indexes before real traffic exists.

## Running locally

No build step is required.

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`.

## Deployment

GitHub Pages, Netlify, Vercel, Cloudflare Pages, or another static host can serve the frontend. Supabase remains the backend and authorization boundary.

## Tests and visual QA

```bash
npm ci
npm test
npm run dev:qa
# A browser opens an isolated fixture harness, without production writes.
# Optional browser suite on a developer machine or CI:
npx playwright install chromium
npm run test:browser
```

Node 22.12+ is supported. The development dependencies are tests/preview tooling only; GitHub Pages serves the committed HTML/CSS/ES modules directly and runs no build.

`npm test` retains and expands security regression checks and runs DOM integration tests plus actual PostgreSQL/RLS tests using PGlite. Browser tests use synthetic fixtures at 1920, 1366, 1024, 768, 430, 390 and 360 pixels. Fixture auth proves the UI lifecycle, not a production password login.

`npm run dev` also opens the synthetic QA harness. `npm run dev:live` serves the real application configuration for deliberate live testing; writes there target your configured Supabase project. The QA substitution exists solely in Vite's `qa` mode, never in application code or the published HTML.

The GitHub workflow runs the security/integration suite and Chromium smoke tests. See [docs/VALIDATION.md](docs/VALIDATION.md) for observed results and remaining release gates.

## Competition backup scope

Export/import covers seasons, results, aggregate match stats and goal events. Standings and achievements are rebuilt by database triggers. It intentionally preserves Auth accounts, private mappings, Q&A and chat. This JSON is a competition backup, not a full database backup; use normal Supabase database backups for disaster recovery.

Imports are validated before confirmation and committed in one transaction. Invalid imports roll back both deletes and inserts. A legacy backup can preserve its competition content; account/password fields are ignored and are never restored.
