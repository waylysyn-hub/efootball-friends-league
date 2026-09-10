# Database file map

The existing root SQL filenames remain stable so bookmarked installation instructions and existing deployments keep working. This directory is their index; copying historical migrations into a second executable tree would invite accidental reruns.

| Root file | Purpose | When to run |
| --- | --- | --- |
| `supabase-schema.sql` | Destructive fresh-install schema and six-player roster | New empty projects only |
| `supabase-groups-chat-migration.sql` | Chat tables and membership structure | When chat tables are absent |
| `supabase-questions-migration.sql` | Legacy optional Q&A tables | Before security migration, if absent |
| `supabase-match-stats-migration.sql` | Legacy aggregate match stats | Before security migration, if absent |
| `supabase-match-goal-events-migration.sql` | Legacy goal-event tables | Before security migration, if absent |
| `supabase-security-migration.sql` | Private identity helpers, least-privilege grants and RLS | After all table-creation migrations |
| `supabase-derived-data-migration.sql` | Database-derived standings and achievements | After security |
| `supabase-consistency-migration.sql` | Atomic match writes, season switch, competition restore, chat creation/invite response and Q&A guards | Last, before deploying this frontend |

Installing the consistency migration is additive: it creates functions/triggers and does not invoke the reset/restore functions or remove existing rows. Those RPCs remain subject to caller identity and RLS. Its public functions use `security invoker`, an empty search path, explicit authenticated-only EXECUTE grants, and qualified object names.

No migration was applied to production as part of this refactor. Test the upgrade in staging and take a normal database backup before rollout. See [SETUP.md](../SETUP.md) for account creation and deployment order. SQL integration tests run all core migrations and the additive migration twice in an isolated PostgreSQL engine (PGlite).
