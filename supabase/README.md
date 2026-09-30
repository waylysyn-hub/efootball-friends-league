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
| `migrations/20260920075946_squad_goal_selection.sql` | Saved squads and scorer/assist validation | After consistency |
| `migrations/20260922115643_admin_evening_draw.sql` | Admin-only game nights | After squad migration |
| `migrations/20260923055900_quick_match_entry.sql` | Score-only match entry and deferred goal details | After evening migration |
| `migrations/20260924064448_match_player_identifiers.sql` | Stable player/squad identities used by current match entry | Last of the current match-entry migrations |
| `migrations/20260930063126_squad_presentation.sql` | Squad presentation metadata | After stable identifiers |
| `migrations/20260930070000_squad_lineup_role.sql` | Starter/substitute status independent from football position | After squad presentation |
| `migrations/20260930071000_squad_player_images.sql` | Managed WebP player images, Storage bucket and owner/admin RLS | After lineup role |

Installing the consistency migration is additive: it creates functions/triggers and does not invoke the reset/restore functions or remove existing rows. Those RPCs remain subject to caller identity and RLS. Its public functions use `security invoker`, an empty search path, explicit authenticated-only EXECUTE grants, and qualified object names.

No migration was applied to production as part of this refactor. Test the upgrade in staging and take a normal database backup before rollout. See [SETUP.md](../SETUP.md) for account creation and deployment order. SQL integration tests run all core migrations and the additive migration twice in an isolated PostgreSQL engine (PGlite).

## Existing installations: safeupdate compatibility

`migrations/20260916114754_safeupdate_compatibility.sql` patches four internal DELETE statements in three existing functions. Supabase API connections preload `pg-safeupdate`, so derived-data refreshes and competition restores require explicit predicates even inside functions. Function ownership, execution grants, RLS, and the API guard remain unchanged; installing this patch does not execute a reset or change application rows. The root SQL files include the same predicates for new installations. The patch is idempotent and stops if it finds an unexpected function definition.

## Saved squads and goal selection

Apply `migrations/20260920075946_squad_goal_selection.sql` **after** consistency and safeupdate, before deploying the squad-based goal editor. This additive migration creates an RLS-protected roster table and validates the scorer and optional assist against the goal owner's saved squad. Historical goal names and existing score-only results remain editable. Read [SQUADS.md](../docs/SQUADS.md) for behavior and validation details. Do not rerun the older consistency file after this migration unless you reapply this migration last.

## Private game nights

Apply `migrations/20260922115643_admin_evening_draw.sql` next. `league_evenings` has admin-only RLS and authenticated column grants; anonymous access and client deletion are revoked. An invoker trigger validates distinct registered attendees, generates the random order server-side and stamps the creator/time. Clients can only close an existing evening; a partial unique index permits one active evening. Invoker RPCs preserve a retry's exact order and reject competing active evenings. Reapplying the migration preserves records. No matches are inserted by the draw. See [EVENINGS.md](../docs/EVENINGS.md).


## Squad presentation and player images

The current squad UI requires the three 2026-09-30 migrations in timestamp order. Substitute status is stored in `lineup_role`; `SUB` is not a football position. Player images use the public `squad-player-images` bucket for public delivery, while insert/select-for-management/delete operations are restricted by Storage RLS to the mapped squad owner or league admin. Browser-selected images are normalized to WebP before upload; the bucket enforces WebP and a 2 MiB object limit.
