# Majles Al-Kibbar · eFootball Friends League

A build-free league workspace with a public Tournament Hub and private group chat. GitHub Pages serves the authored HTML, CSS and native JavaScript modules; Supabase supplies Auth, Postgres, RLS and Realtime.

## App entrypoints

| Page | Purpose |
| --- | --- |
| `index.html` | Public season standings, results, players and scorers |
| `league/index.html` | Authenticated league workspace, profiles, stats, Q&A and admin result/season tools |
| `groups-chat/index.html` | Membership-protected groups, invitations and messages |
| `hub.html`, `tournament-hub/index.html` | Backward-compatible redirects to the root Hub |

## Architecture

- `supabase-config.js` contains public configuration only. Explicit HTML scripts load the pinned Supabase SDK, one client per page, shared Auth helpers, then the page's ES module entrypoint.
- `shared/` owns design tokens, forms, buttons, tables, errors, busy states, focus-managed dialogs and mobile drawers.
- `league/js/app.js` wires UI events. `state.js` holds authenticated profile and loaded snapshots; `api.js` maps Supabase rows; `realtime.js` coalesces refreshes and preserves drafts. Match, goal-event, season, stats, profile, achievement, Q&A and administrative functions have separate responsibility-based modules.
- `window.League` is a frozen action namespace for the existing HTML handlers. It contains no authentication shortcut. Private UUID mappings and actual write permissions stay in Postgres.
- `hub-api.js` and `groups-chat/api.js` isolate data access. Chat deduplicates messages by ID, ignores stale group responses and loads earlier messages with keyset pagination.

The charcoal/gold design system is shared across the three apps. Tables scroll within bounded containers, navigation becomes a drawer at 1024px, and goal-event forms and dialogs adapt to phones. Chat preserves the optional light-theme preference.

## Development and checks

See [SETUP.md](SETUP.md) for Auth account setup, migration order and local commands, [supabase/README.md](supabase/README.md) for SQL responsibilities, and [docs/VALIDATION.md](docs/VALIDATION.md) for verified behavior and rollout limitations.

```bash
npm ci
npm test
npm run dev:qa
```

All Node dependencies are development-only. A normal static HTTP server is sufficient to run the real app; there is no production build step or framework migration.

## Security boundaries

Passwords are handled by Supabase Auth. Public profiles expose `name`, `role` and `created`; private `player_accounts` rows resolve only the signed-in user. Admin UI follows the authenticated profile, while RLS and private helpers enforce permission independently of the browser. Standings and achievements are derived by database triggers. Competition imports preserve identities and private conversations.
