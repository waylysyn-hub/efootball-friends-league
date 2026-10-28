# eFootball Friends League — Secure Supabase Setup

The app is a static frontend backed by **Supabase Postgres + Auth + Realtime**.
Passwords belong to **Supabase Auth only**.

`public.players` is a safe league roster/profile table (`name`, `role`, `created`).
The Auth UUID link lives separately in `public.player_accounts`, protected by self-only RLS.
Browser code never needs access to another player's Auth UUID or password.

## Fresh installation

Run these SQL files in order from **Supabase → SQL Editor**:

1. `supabase-schema.sql` — creates league tables and the initial roster. **Destructive: empty projects only**.
2. `supabase-groups-chat-migration.sql` — creates private chat tables.
3. `supabase-security-migration.sql` — installs private identity helpers, grants and RLS.
4. `supabase-derived-data-migration.sql` — installs standings/achievement triggers.
5. `supabase-consistency-migration.sql` — installs atomic match writes, restore and season RPCs.
6. `supabase/migrations/20260916114754_safeupdate_compatibility.sql` — keeps guarded derived-data/restore writes compatible with pg-safeupdate.
7. `supabase/migrations/20260920075946_squad_goal_selection.sql` — saved squads and owner-validated scorer/assist selection.
8. `supabase/migrations/20260922115643_admin_evening_draw.sql` — admin-only attendance, persistent draws and game-night history.
9. `supabase/migrations/20260923055900_quick_match_entry.sql` — score-only saves and deferred goal details.
10. `supabase/migrations/20260924064448_match_player_identifiers.sql` — stable player/squad UUIDs and historical snapshots.
11. `supabase/migrations/20260930063126_squad_presentation.sql` — squad presentation metadata.
12. `supabase/migrations/20260930070000_squad_lineup_role.sql` — starter/substitute status independent of football position.
13. `supabase/migrations/20260930071000_squad_player_images.sql` — managed WebP photos, Storage bucket and owner/admin policies.
14. `supabase/migrations/20260930074500_fix_squad_photo_path_constraint.sql` — corrected managed image-path constraint.
15. `supabase/migrations/20260930102000_efootball_squad_positions.sql` — detailed positions, concurrency-safe 11-starter cap and protected deletion.
16. `supabase/migrations/20261001062141_squad_safety_review.sql` — fail-closed deletion for unmapped sessions, legacy history and referenced-image protection.

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

1. Back up the database and rehearse the upgrade in an authorized isolated environment.
2. Create chat tables only if absent. Create missing optional Q&A, match-stats or goal-event tables with their root migrations before security.
3. `supabase-security-migration.sql` — Apply identity helpers, least-privilege grants and RLS.
4. `supabase-derived-data-migration.sql` — Apply server-derived standings and achievements.
5. `supabase-consistency-migration.sql` — Apply transactional RPCs before the timestamped migrations.
6. `supabase/migrations/20260916114754_safeupdate_compatibility.sql` — Apply: keeps guarded derived-data/restore writes compatible with pg-safeupdate.
7. `supabase/migrations/20260920075946_squad_goal_selection.sql` — Apply: saved squads and owner-validated scorer/assist selection.
8. `supabase/migrations/20260922115643_admin_evening_draw.sql` — Apply: admin-only attendance, persistent draws and game-night history.
9. `supabase/migrations/20260923055900_quick_match_entry.sql` — Apply: score-only saves and deferred goal details.
10. `supabase/migrations/20260924064448_match_player_identifiers.sql` — Apply: stable player/squad UUIDs and historical snapshots.
11. `supabase/migrations/20260930063126_squad_presentation.sql` — Apply: squad presentation metadata.
12. `supabase/migrations/20260930070000_squad_lineup_role.sql` — Apply: starter/substitute status independent of football position.
13. `supabase/migrations/20260930071000_squad_player_images.sql` — Apply: managed WebP photos, Storage bucket and owner/admin policies.
14. `supabase/migrations/20260930074500_fix_squad_photo_path_constraint.sql` — Apply: corrected managed image-path constraint.
15. `supabase/migrations/20260930102000_efootball_squad_positions.sql` — Apply: detailed positions, concurrency-safe 11-starter cap and protected deletion.
16. `supabase/migrations/20261001062141_squad_safety_review.sql` — Apply: fail-closed deletion for unmapped sessions, legacy history and referenced-image protection.
17. Create/link remaining Auth accounts and verify admin and normal-player permissions.
18. Rotate passwords that were ever exposed in source history; remove a legacy public password column if one remains.

Do not rerun older function migrations after newer overrides. If recovery requires a replay, reapply the complete later sequence in this order. The safety-review migration must remain last. No production migration is authorized by local QA.

```sql
alter table public.players drop column if exists password;
```

## Authorization model

- Anonymous visitors get read-only Tournament Hub/league data.
- Signed-in league players can read league data and participate in Q&A.
- Only the player whose mapped profile has `role = 'admin'` can mutate matches, seasons, match stats, and goal events.
- Game nights and their attendance/draw are readable and writable only by the mapped admin. Other players cannot read them, even through the API.
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

```bash
npm ci
npm run dev:qa
```

Open `http://127.0.0.1:4173/` for the isolated screen/viewport harness. Direct app paths also use synthetic clients in QA mode, including links without `fixture=`. The default server binds only to loopback. Select any of the nine required viewport widths, plus the retained 414px check.

`npm run dev:live` intentionally serves the actual Supabase configuration. A plain static HTTP server also uses the real configuration. Neither is an isolated QA environment; do not use them for automated write tests against production.

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

`npm test` retains and expands security regression checks and runs DOM integration tests plus actual PostgreSQL/RLS tests using PGlite. Browser tests use synthetic fixtures at 1920, 1366, 1024, 768, 430, 390, 375, 360, 320 and 414 pixels. Fixture auth proves the UI lifecycle, not a production password login.

`npm run dev` also opens the synthetic QA harness. `npm run dev:live` serves the real application configuration for deliberate live testing; writes there target your configured Supabase project. The QA substitution applies to every app entrypoint solely in Vite's `qa` mode, never in application code or the published HTML.

The GitHub workflow runs the security/integration suite and Chromium smoke tests. See [docs/VALIDATION.md](docs/VALIDATION.md) for observed results and remaining release gates.

## Competition backup scope

Export/import covers seasons, results, aggregate match stats and goal events. Standings and achievements are rebuilt by database triggers. It intentionally preserves Auth accounts, private mappings, Q&A and chat. This JSON is a competition backup, not a full database backup; use normal Supabase database backups for disaster recovery.

Imports are validated before confirmation and committed in one transaction. Invalid imports roll back both deletes and inserts. A legacy backup can preserve its competition content; account/password fields are ignored and are never restored.

## Saved squads

For existing installations that already applied consistency and safeupdate, apply `supabase/migrations/20260920075946_squad_goal_selection.sql` next. For fresh installations, follow the complete ordered sequence above; never append this older migration after the final safety review. Deploy the frontend only after the migration succeeds. Each account can then populate its squad from **التشكيلات**; the administrator can manage all squads. See [docs/SQUADS.md](docs/SQUADS.md).

## Latest update: private game nights

Apply `supabase/migrations/20260922115643_admin_evening_draw.sql` after the saved-squad migration and before deploying the evening UI. It creates a new table and functions without rewriting league data or changing account permissions. The existing competition export/import does not include evenings; they remain in the database and normal database backups. Deleting a season preserves its evenings and clears their season reference. See [docs/EVENINGS.md](docs/EVENINGS.md).
