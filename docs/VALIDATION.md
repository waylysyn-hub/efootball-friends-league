# Validation record — 10 September 2026

This branch is a review candidate. Production password login and migration rollout remain release gates; fixture sessions are not evidence of real account authentication.

## Observed passing checks

- Static security regression checks: public-safe profile selection, private auth mapping, database admin enforcement, database-derived standings/achievements, no plaintext-password queries/storage, no service-role keys, no `document.write` bootstrap, explicit script order, valid relative assets and consistent CSS tokens.
- Node/PGlite suite: **23 passing tests** (13 frontend scenarios, 9 nested SQL scenarios and their parent test). The PostgreSQL tests run real grants, RLS, constraints, triggers and functions in an isolated engine, including a repeat installation of the additive migration.
- Browser fixture matrix: **161 screen/width combinations**, zero reported application JavaScript errors or document-level horizontal overflow. The same-origin frame has the exact specified viewport width; it is not a scaled CSS approximation. Desktop heights are 1080 at 1920px and 768 at 1366px; smaller widths use 768/844px heights.
- Widths: **1920, 1366, 1024, 768, 430, 390, 360**. Each runs 23 views: Hub; League login, dashboard, table, history, detail, record, edit dialog, profile, statistics, football-player performance, achievements, awards, head-to-head, rivalries, seasons, Q&A and settings; Chat login, groups, conversation, invitations and create-group dialog.
- Visual inspection exposed an incorrectly positioned Chat dialog and uneven Hub heading layout; both were corrected. The mobile match form was inspected for stacked controls and readable score inputs.
- The frontend suite was rerun after dialog/drawer corrections: **13/13 passed**.

## Functional coverage

- Six-player dropdown, simulated Supabase sign-in, session restore, logout and cross-tab account changes; admin controls use the resolved profile and normal users are redirected from recording results.
- Empty roster/competition, safe rendering of every League view, Hub navigation/retry and escaping of Q&A/message text.
- Failed match saves preserve inputs; simultaneous submissions coalesce; retries reuse the same match ID. Match/goal writes and invalid restores roll back atomically in Postgres.
- Database-derived scores/achievements refresh on match edits and season changes; restored competition retains private identities, Q&A and messages.
- Every normal player is denied admin RPCs/direct match inserts/derived writes and role escalation. Anonymous users cannot read auth mappings; authenticated users cannot select UUID columns.
- Q&A ownership, answer linkage and closure checks; group privacy, owner membership, involved-only invitations, idempotent acceptance and message-author enforcement.
- Chat failure retains text, retry preserves the message ID, late responses do not appear in another group, and realtime includes messages from the same author in another tab.

## Browser suite

`npm run test:browser` provides 35 Playwright smoke cases (five scenarios × seven widths). CI runs Chromium plus the security/integration suite. It checks app/roster readiness, the major League views, Hub navigation, conversation sending, dialogs and safe overflow. These tests always use synthetic clients; there are no test passwords or production writes.

The interactive harness uses the same fixtures and was exercised through the available browser. Its measured matrix is distinct from the Playwright CLI/CI results.

## Remaining release gates and scope limits

1. Install `supabase-consistency-migration.sql` in staging and validate existing-project rollout before deploying the frontend. It has **not** been applied to production. The new UI depends on its RPCs.
2. Verify an actual Wael password login, an actual normal-player login, session restore and sign-out against the configured Supabase project. No credentials were requested, changed, stored or committed during this refactor.
3. Live inspection confirmed all six public profiles, Wael's admin role, private mapping presence and enabled RLS. It did not prove password validity.
4. Browser fixtures and PGlite do not reproduce Supabase Auth servers, websocket delivery, PostgREST schema caching, or real-device Safari/Android behavior. Physical-device keyboard/screen-reader checks remain useful before release.
5. Competition JSON intentionally includes only seasons/results/goal events/aggregate match stats. It preserves accounts, Q&A and chat; it is not a disaster-recovery backup of the entire Supabase project.
6. The original database schemas remain at their established root paths, indexed in `supabase/README.md`, to avoid duplicate migration trees or breaking existing setup links.

No production schema/data mutation, main-branch commit, merge or deployment was performed.
