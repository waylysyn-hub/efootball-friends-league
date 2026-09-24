# Saved squads and goal entry

Each league account now has a saved squad of football players. Owners can add, edit, archive and restore their own players; the league administrator can manage every squad. Other players can view squads. These are roster lists with positions, not tactical starting-XI diagrams.

Recording or editing a goal uses native select controls for the scorer and assist, filtered to the selected owner's active squad. The assist defaults to **بدون أسيست** (stored as an empty string). Changing the owner clears both player choices, and choosing a scorer removes that player from assist choices. A player can be added from the goal card without discarding the match draft.

Quick entry is the default: admins can save scores without goal details. Detailed entry creates one row per goal and requires a squad scorer for each row, unless the admin explicitly chooses to defer all details. Both paths present a review before saving the match and events in one transaction. A nonempty goal list must exactly match both team scores; Postgres rejects foreign-team players and self-assists. Historical names remain snapshots: edits can retain a previously recorded name even if the player was renamed or archived, while new matches require active squad members.

Quick matches update league results and standings immediately. Individual scorer/assist awards use only the goal events actually entered, still separated by squad owner. The history marks scored matches with missing details and supports completing them later through Edit. A 0–0 result needs no goal details. Blank optional minutes keep the existing stored value `0`; entered minutes must be integers from 1 to 120.

Entry modes preserve drafts; changing a team clears that team's scorer/assist choices. Score increases create blank goal rows, reductions ask before discarding rows, and manual goal/team changes update scores automatically. New/cancel actions confirm before clearing a draft. Failed saves retain both the inputs and stable match ID, including recovery after a committed result's response is lost.

## Football-player statistics and awards

Each footballer's statistical identity is the canonical squad owner plus the trimmed, case-insensitive saved name. Matching footballer names in different squads remain separate in goals, assists, contributions, match counts, averages and detail views. The owner appears alongside the name in leaderboards, table rows and awards; player search also accepts the owner's Arabic or canonical name. Season filters and live refreshes keep open details scoped to that owner.

Match awards (scorer, assist maker, MVP and hat trick) use individual squad members, with the owner shown beside each name. Season scorer and assist awards use the same ownership-aware totals and display all tied winners separately. The league account's total goals remain available as **أقوى هجوم**. The public Hub already separates same-name scorers by team; regression tests cover both goal events and legacy aggregate rows there.

For example, Zlatan with Wael scoring once and Zlatan with Mustafa scoring three times appear as two entries with 1 and 3 goals. This correction uses the owner already stored with every goal event, so no database migration or rewriting of historical results is needed.

## Database rollout

Run `supabase/migrations/20260920075946_squad_goal_selection.sql` after the consistency and safeupdate migrations. It creates `squad_players`, enables RLS and grants authenticated reads and owner/admin writes. Then apply `supabase/migrations/20260923055900_quick_match_entry.sql` before deploying this frontend. The latest migration replaces only the existing `save_league_match` function to accept an empty goal array for score-only games. It preserves its signature, invoker security, admin check, row locks, squad validation and atomic transaction. It adds no tables, columns or real players and does not rewrite competition data. If an older migration is reapplied, apply the quick-entry migration last to retain this behavior.

Squad ownership and IDs cannot be changed through client table updates. Players are archived rather than deleted. Competition export/restore continues to cover seasons, matches and goal snapshots; squads, accounts and chat remain separate and are preserved by competition resets/restores.

## Verification

- `npm test`: SQL/RLS/transaction tests plus frontend behavior, including owner isolation, cross-team rejection, exact counts, no assist, historical edits, archived players, form retention and retry identity.
- `npm run test:browser`: seven full regression viewport projects, plus match-entry coverage at 320, 375 and 414 pixels. Quick/review/edit and detailed 3–2 flows check overflow, touch targets, optional-minute validation and score-reduction cancellation. Screenshots are saved for mobile and desktop review.
- GitHub's native PostgreSQL job also runs with `pg-safeupdate` enabled.

Only synthetic test players are used by these automated tests.

## Validation status

The Node/PGlite/frontend suite covers quick 0–0, 1–0, 3–2, detailed 3–2, deferred details completed later, duplicate teams, invalid scores/minutes, confirmed deletion, mode switching, network failure, lost responses and admin permissions. Native PostgreSQL with `pg-safeupdate` runs in GitHub Actions before deployment, including migration repeatability and preservation of existing matches and events. No real matches or squad players are added by tests.
