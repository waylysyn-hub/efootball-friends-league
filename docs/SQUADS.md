# Saved squads and goal entry

Each league account has a saved squad of football players. Owners can add, edit, archive and restore their own players; the league administrator can manage every squad. Other players can view squads.

## Squad presentation

The squad card shows the owner, active player count, position counts, substitute count, recorded last-update time and average of the available ratings (unrated players are excluded). Pitch and list views render the same deduplicated UUID collection, with shared search, position/status filtering and sorting. Football position and lineup status are independent: a reserve goalkeeper remains `GK` with `lineup_role = 'substitute'`; a reserve defender remains `DF`, and so on. `active = false` is reserved for players outside the squad. Pitch view keeps starters on the field and renders active substitutes in a separate reserve section without losing their true football position.

Each card has a position accent, initials or an optional photo, lineup-status badge, and optional shirt number/rating. The editor supports positions `GK`, `DF`, `MF`, `FW`, `UNK` plus lineup status `starter` / `substitute`. Images are normally selected from the user's device: JPG/PNG/WebP sources up to 10 MiB are center-cropped square in the browser, resized to at most 512×512, encoded as WebP, then uploaded to the public `squad-player-images` bucket. The bucket itself accepts WebP only up to 2 MiB. Public reads are intentional because player photos are visible on the public-facing app; Storage writes/deletes remain RLS-protected to the squad owner or league admin. Object paths use league-player UUID + squad-member UUID + image UUID, so renames do not break files. The editor keeps HTTPS URL entry only as an advanced fallback. Broken images fall back to initials.

Use **تعديل التشكيلة** to reveal member actions. **إبعاد** removes a player from both active views and the current scorer lists while preserving their historical identity; **خارج التشكيلة** exposes archived players and the existing restore action. Archiving is distinct from the active substitute position. No hard-delete permission is added.

Apply `20260930063126_squad_presentation.sql`, then `20260930070000_squad_lineup_role.sql`, then `20260930071000_squad_player_images.sql` after the existing squad/identity migrations before rolling out the new editor. The lineup migration removes `SUB` as a position and introduces `lineup_role`; a legacy `SUB` row, if one exists, becomes `lineup_role='substitute'` with `position='UNK'` rather than guessing a real position. The image migration adds `photo_path`, creates the WebP-only Storage bucket and its owner/admin RLS policies. These migrations do not rewrite matches, goal events, standings, accounts or seasons and are safe to reapply.

`tests/squad-presentation.test.mjs` covers single/multiple keepers, large squads, unknown positions, deduplication, sorting, metadata edits, archive/refetch, fallback images and unchanged match history. The SQL suite tests persisted metadata, permissions, validation and repeat migration. `tests/browser/squads.spec.mjs` checks layout, long names, section collapse and editing/reload across the responsive viewport matrix. Its `fixture=squads` data is **isolated QA only**, with session persistence solely for browser reload tests; it is never production persistence proof.

Recording or editing a goal uses native select controls for the scorer and assist, filtered to the selected owner's active squad. The assist defaults to **بدون أسيست** (stored as an empty string). Changing the owner clears both player choices, and choosing a scorer removes that player from assist choices. A player can be added from the goal card without discarding the match draft.

Quick entry is the default: admins can save scores without goal details. Detailed entry creates one row per goal and requires a squad scorer for each row, unless the admin explicitly chooses to defer all details. Both paths present a review before saving the match and events in one transaction. A nonempty goal list must exactly match both team scores; Postgres rejects foreign-team players and self-assists. Historical names remain snapshots: edits can retain a previously recorded name even if the player was renamed or archived, while new matches require active squad members.

Quick matches update league results and standings immediately. Individual scorer/assist awards use only the goal events actually entered, still separated by squad owner. The history marks scored matches with missing details and supports completing them later through Edit. A 0–0 result needs no goal details. Blank optional minutes keep the existing stored value `0`; entered minutes must be integers from 1 to 120.

Entry modes preserve drafts; changing a team clears that team's scorer/assist choices. Score increases create blank goal rows, reductions ask before discarding rows, and manual goal/team changes update scores automatically. New/cancel actions confirm before clearing a draft. Failed saves retain both the inputs and stable match ID, including recovery after a committed result's response is lost.

## Football-player statistics and awards

Each footballer's statistical identity is the saved squad player's UUID. Match entry sends league-player UUIDs and scorer/assist UUIDs rather than names; Postgres resolves and validates their ownership. Renaming a squad player keeps their totals together, while different players with the same name stay separate in goals, assists, contributions, match counts, averages and detail views. Historical event names remain snapshots. Only old, unresolved records fall back to the canonical owner plus the trimmed, case-insensitive snapshot name; they are never guessed from a newly reused name. The owner appears alongside the name in leaderboards, table rows and awards; player search also accepts the owner's Arabic or canonical name. Season filters and live refreshes keep open details scoped to the saved identity.

Match awards (scorer, assist maker, MVP and hat trick) use individual squad members, with the owner shown beside each name. Season scorer and assist awards use the same ownership-aware totals and display all tied winners separately. The league account's total goals remain available as **أقوى هجوم**. The public Hub already separates same-name scorers by team; regression tests cover both goal events and legacy aggregate rows there.

For example, Zlatan with Wael scoring once and Zlatan with Mustafa scoring three times appear as two entries with 1 and 3 goals. A renamed player also keeps the same UUID, and a different player later given that old name cannot inherit their goals.

## Database rollout

Run `supabase/migrations/20260920075946_squad_goal_selection.sql` after the consistency and safeupdate migrations, followed by `20260923055900_quick_match_entry.sql` and `20260924064448_match_player_identifiers.sql`, before deploying this frontend. Squads have RLS with authenticated reads and owner/admin writes. The identifier migration adds a public UUID to each league player, two match references and three goal-event references, with foreign-key indexes. It backfills existing identities once, retaining every original column and historical snapshot; unresolved old scorers/assists remain nullable. Derived-cache refresh is suspended only inside the locked backfill transaction so existing standings and achievement timestamps remain unchanged.

The latest migration updates `save_league_match` and competition restore, keeping invoker security, the admin check and existing RLS. Direct-write triggers also reject duplicate opponents and foreign-owner UUIDs. Saves remain atomic, accept score-only games, and preserve existing event UUIDs during edits and retries. Cached name-based clients and old backups remain accepted. If an older migration is reapplied, apply the identifier migration last. No authentication mapping or account permission is changed; public roster reads additionally include the new, non-auth UUID.

Squad ownership and IDs cannot be changed through client table updates. Players are archived rather than deleted. Competition export/restore covers seasons, matches and goal snapshots, including the new UUID references (backup version 3); squads, accounts and chat remain separate and are preserved by competition resets/restores. Imports preserve squad identities while remapping competition record IDs as before.

## Verification

- `npm test`: SQL/RLS/transaction tests plus frontend behavior, including owner isolation, UUID-only and direct-table rejection, renamed/reused names, backup round trips, exact counts, no assist, historical/partial edits, archived players, form retention and retry identity.
- `npm run test:browser`: seven full regression viewport projects, plus match-entry coverage at 320, 375 and 414 pixels. Quick/review/edit and detailed 3–2 flows check overflow, touch targets, optional-minute validation and score-reduction cancellation. Screenshots are saved for mobile and desktop review.
- GitHub's native PostgreSQL job also runs with `pg-safeupdate` enabled.

Only synthetic test players are used by these automated tests.

## Validation status

The Node/PGlite/frontend suite covers quick 0–0, 1–0, 3–2, detailed 3–2, deferred details completed later, duplicate teams, invalid scores/minutes, confirmed deletion, mode switching, network failure, lost responses and admin permissions. Native PostgreSQL with `pg-safeupdate` runs in GitHub Actions before deployment, including migration repeatability and preservation of existing matches and events. No real matches or squad players are added by tests.
