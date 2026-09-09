# eFootball Friends League — Secure Supabase Setup

The app is a static frontend backed by **Supabase Postgres + Auth + Realtime**.
Passwords belong to **Supabase Auth only**. The `players` table stores league profiles
(`name`, linked Auth user id, role, creation time) and never needs to expose credentials.

## Fresh installation

Run the SQL files in this order from **Supabase → SQL Editor**:

1. `supabase-schema.sql` — creates the league tables and roster. **This wipes existing league data.**
2. `supabase-groups-chat-migration.sql` — creates chat/group tables with RLS enabled and no open-write policies.
3. `supabase-security-migration.sql` — installs Auth-backed identity helpers, least-privilege RLS, and server-side standings/achievements.
4. `supabase-auth-rpc-migration.sql` — exposes only the signed-in player's safe profile and an admin-only account-link RPC.
5. `supabase-chat-rls-fix.sql` — installs recursion-safe membership/ownership policies for chat.

Then create one user in **Supabase Authentication → Users** for each league player and link
that user's `auth.users.id` to `public.players.auth_user_id`.

The frontend uses deterministic private-league login addresses derived from each name:

- `Wael` → `wael@efootball-friends.example`
- `Abdul Rahim` → `abdul-rahim@efootball-friends.example`

Create the Auth users with those addresses and the passwords you want. For a private
league, create/confirm them from the Supabase dashboard so email delivery is not required.

## Upgrading the existing project

Do **not** run `supabase-schema.sql` on the live database because it recreates tables.
Instead:

1. Back up the database.
2. Run `supabase-groups-chat-migration.sql` only if the chat tables do not already exist.
3. Run `supabase-security-migration.sql`.
4. Run `supabase-auth-rpc-migration.sql`.
5. Run `supabase-chat-rls-fix.sql`.
6. Create/link Supabase Auth users for every player.
7. Verify every player can sign in and the admin can add/edit a test match.
8. Rotate every password that ever appeared in this repository or its Git history.
9. After every player is linked and verified, permanently remove the legacy column:

```sql
alter table public.players drop column if exists password;
```

The migration revokes browser access to the legacy password column immediately, even
before that final drop.

## Supabase project configuration

`supabase-config.js` contains the Project URL and publishable/anon key. A publishable key
is expected to be visible in a browser application; security comes from Auth and RLS,
not from hiding that key.

Do **not** put a Supabase `service_role` key, database password, private token, or other
server secret in this repository.

## Authorization model

- Tournament Hub data is read-only for anonymous visitors.
- Signed-in players can read league data and participate in Q&A.
- Only the database profile with `role = 'admin'` can mutate matches, seasons, match stats, and goal events.
- Chat messages are readable/writable only by group members.
- Group invitations are restricted to involved users.
- Browser `localStorage` is used only for non-sensitive cache/last-selected-player convenience and is never trusted as authentication.

## Derived data

`standings` and `achievements` are refreshed in Postgres through triggers whenever
matches or player profiles change. The browser no longer deletes and recreates standings,
which avoids race conditions between simultaneous sessions.

## Running locally

No build step is required.

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`.

## Deployment

The site can remain on GitHub Pages, Netlify, Vercel, Cloudflare Pages, or another static
host. Supabase remains the backend and authorization boundary.

## CI

The repository includes a GitHub Actions security/static check. It validates JavaScript
syntax and blocks known regressions such as plaintext-password queries and allow-everything
RLS policies in the active setup files.
