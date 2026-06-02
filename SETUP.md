# eFootball Friends League — Supabase Setup

This app now stores all data in **Supabase** (Postgres) instead of `localStorage`.
That means every player shares the same league data, multiple people can use the
site at the same time, and the league table updates automatically for everyone.

`localStorage` is only used for **optional caching** (fast first paint + remembering
who is logged in on this device).

---

## What gets stored in Supabase

| Table          | Purpose                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `players`      | Accounts (name + password) for each friend.                             |
| `seasons`      | League seasons (one is marked active).                                  |
| `matches`      | Every recorded match (players, score, date, season).                    |
| `standings`    | The computed league table (overall + per season). Auto-updated.         |
| `achievements` | Unlocked achievement badges per player. Auto-updated.                   |

`standings` and `achievements` are recalculated and saved automatically whenever a
match is added, edited, or deleted, so they stay correct for every user.

---

## Step 1 — Create a Supabase project

1. Go to <https://supabase.com> and sign in (free tier is fine).
2. Click **New project**, give it a name, set a database password, and create it.
3. Wait ~1 minute for the project to finish provisioning.

## Step 2 — Create the database tables

1. In your project, open the left sidebar → **SQL Editor** → **New query**.
2. Open the file **`supabase-schema.sql`** from this project, copy its entire contents,
   and paste it into the SQL editor.
3. Click **Run**. You should see "Success". This creates all tables, security
   policies, realtime, and seeds an initial "Season 1".

> Re-running the script is safe — it drops and recreates the tables (this also wipes
> existing data, so only re-run it intentionally).

## Step 3 — Get your API credentials

1. In the sidebar, open **Project Settings** → **API**.
2. Copy the **Project URL** (e.g. `https://abcdefgh.supabase.co`).
3. Copy the **anon / public** key (a long `eyJ...` string).

The anon key is meant for browser use — access is controlled by the Row Level
Security policies created in Step 2.

## Step 4 — Configure the app

Open **`supabase-config.js`** and paste your values:

```js
const SUPABASE_CONFIG = {
  url: 'https://abcdefgh.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
};
```

## Step 5 — Run the app

This is a static site (no build step). Serve the folder with any static server, e.g.:

```bash
# Python 3
python3 -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000> in your browser.

> Opening `index.html` directly via `file://` usually works too, but using a local
> web server avoids browser restrictions and matches how it will be hosted.

## Step 6 — Register the players

On first run there are no accounts. Each friend should click **Register**, pick their
name, and create a password. After that they can log in from any device and everyone
sees the same shared league.

---

## How multi-user / live updates work

- On page load the app **fetches the latest data from Supabase**.
- When anyone adds / edits / deletes a match, it is **saved to Supabase** and the
  **league table + achievements are recomputed and stored automatically**.
- The app subscribes to **Supabase Realtime**, so other open browsers refresh their
  view within a moment — no manual reload needed. (Realtime is enabled by the SQL
  script. If you disable it, the app still works; users just need to reload to see
  changes made by others.)

---

## Deploying online

Host the static files (`index.html`, `style.css`, `script.js`, `supabase-config.js`)
on any static host — **GitHub Pages, Netlify, Vercel, Cloudflare Pages**, etc.
No server code is required because Supabase is the backend.

---

## Security note

Passwords are stored in plain text in the `players` table (this mirrors the original
app's behaviour for a small private group of friends). For anything beyond a casual
private league, switch to **Supabase Auth** for proper hashed credentials and
per-user Row Level Security.
