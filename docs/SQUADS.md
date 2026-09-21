# Saved squads and goal entry

Each league account now has a saved squad of football players. Owners can add, edit, archive and restore their own players; the league administrator can manage every squad. Other players can view squads. These are roster lists with positions, not tactical starting-XI diagrams.

Recording or editing a goal uses native select controls for the scorer and assist, filtered to the selected owner's active squad. The assist defaults to **بدون أسيست** (stored as an empty string). Changing the owner clears both player choices, and choosing a scorer removes that player from assist choices. A player can be added from the goal card without discarding the match draft.

New scored matches require details for every goal. The match and goal events are saved in one transaction; Postgres rejects missing details, foreign-team players and self-assists. Existing score-only matches may keep their original score without inventing goal details. Historical names remain snapshots: edits can retain a previously recorded name even if the player was renamed or archived, while new matches require active squad members.

## Database rollout

Run `supabase/migrations/20260920075946_squad_goal_selection.sql` after the consistency and safeupdate migrations, before deploying the frontend. The migration creates `squad_players`, enables RLS, grants authenticated reads and owner/admin writes, and updates the existing `save_league_match` function. It adds no real players automatically and does not reset or rewrite competition data. Re-running an older consistency migration afterwards would replace the new match validation; reapply the squad migration last if this is ever necessary.

Squad ownership and IDs cannot be changed through client table updates. Players are archived rather than deleted. Competition export/restore continues to cover seasons, matches and goal snapshots; squads, accounts and chat remain separate and are preserved by competition resets/restores.

## Verification

- `npm test`: SQL/RLS/transaction tests plus frontend behavior, including owner isolation, cross-team rejection, exact counts, no assist, historical edits, archived players, form retention and retry identity.
- `npm run test:browser`: all seven viewport projects include squad navigation and goal entry, opening the player dialog, preserving the match draft and saving without an assist.
- GitHub's native PostgreSQL job also runs with `pg-safeupdate` enabled.

Only synthetic test players are used by these automated tests.

## Validation status

The local Node/PGlite/frontend suite passes all 38 tests, together with static security, syntax and asset checks. Seven-viewport browser scenarios and native PostgreSQL with `pg-safeupdate` run in GitHub Actions before deployment. No real squad players are added by the migration or tests.
