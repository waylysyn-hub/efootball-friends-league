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
| `supabase-consistency-migration.sql` | Atomic match writes, season switch, competition restore, chat creation/invite response and Q&A guards | After derived-data; before newer migrations |

Installing the consistency migration is additive: it creates functions/triggers and does not invoke the reset/restore functions or remove existing rows. Those RPCs remain subject to caller identity and RLS. Its public functions use `security invoker`, an empty search path, explicit authenticated-only EXECUTE grants, and qualified object names.

No migration was applied to production as part of this refactor. Test the upgrade in staging and take a normal database backup before rollout. See [SETUP.md](../SETUP.md) for account creation and deployment order. SQL integration tests run all core migrations and the additive migration twice in an isolated PostgreSQL engine (PGlite).

## Existing installations: safeupdate compatibility

`migrations/20260916114754_safeupdate_compatibility.sql` patches four internal DELETE statements in three existing functions. Supabase API connections preload `pg-safeupdate`, so derived-data refreshes and competition restores require explicit predicates even inside functions. Function ownership, execution grants, RLS, and the API guard remain unchanged; installing this patch does not execute a reset or change application rows. The root SQL files include the same predicates for new installations. The patch is idempotent and stops if it finds an unexpected function definition.

## Saved squads and goal selection

Apply `migrations/20260920075946_squad_goal_selection.sql` **after** consistency and safeupdate, before deploying the squad-based goal editor. This additive migration creates an RLS-protected roster table and validates the scorer and optional assist against the goal owner's saved squad. Historical goal names and existing score-only results remain editable. Read [SQUADS.md](../docs/SQUADS.md) for behavior and validation details. Do not rerun the older consistency file after this migration unless you reapply this migration last.
