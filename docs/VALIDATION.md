# Validation record — 28 October 2026

This is the original implementation validation record. See the subsequent [independent Arabic review](INDEPENDENT_REVIEW_AR.md), [new execution summary](independent-validation.json) and [fresh responsive matrix](independent-responsive-matrix.json) for the follow-up verification and fixes.

Current implementation base: `b5a77494e9db5c42ce99b45252192c00b0093dd6`. The application remains static HTML/CSS/native ES modules with Supabase Auth, Postgres, RLS, RPC and Realtime. All writes exercised during this audit used synthetic clients or an isolated PGlite database. No production data or schema was changed.

## Executed checks

| Check | Result |
| --- | --- |
| `npm ci` | Passed; committed dependency versions and lockfile retained |
| Baseline `npm test` on current main | 95 passed, 0 failed |
| Baseline `npm run test:browser -- --workers=2` | 240 passed |
| Detached PR #25 at 390px | 31 passed, 3 reproduced failures; see audit |
| Targeted updated match-entry/UX browser checks at 1366/390px | 28 passed |
| New audit browser checks at 1366/390px | 16 passed |
| Final `npm test` | **114 passed, 0 failed, 0 skipped** |
| Final `npm run test:browser -- --workers=3 --reporter=list,json,html` | **430 passed, 0 failed, 0 skipped, 0 flaky** |
| Interactive QA harness, automated in Chromium | **250 screen/viewport combinations; 0 horizontal overflow; 0 reported script errors** |
| `git diff --check` | Passed |

The final browser run took about 5m37s. [Machine-readable browser results](browser-validation.json) contain the run timestamp, tool versions and counts. [Measured screen matrix](responsive-matrix.json) records every harness screen. Its 25 views run at 1920, 1366, 1024, 768, 430, 390, 375, 360, 320 and 414px; the full browser suite runs 43 scenarios at each of the same ten widths.

The standard Playwright browser download returned invalid ZIP files in this environment. Verification used Chromium **153.0.8010.0** from the registry package `@sparticuz/chromium@153.0.0`, outside repository dependencies, with the pinned Playwright **1.63.0** suite. No test was removed or skipped. Existing text assertions were updated to the final Arabic copy, and an ambiguous label locator was scoped to its form.

## Coverage

The suites cover account restoration and login-form UI, every main League/Hub/Chat view, normal-user admin restrictions, keyboard drawers, direct routes and match-specific browser history, nested dialogs, filter retention, empty/loading/error/retry states, typed destructive scopes, double submission, lost responses, Q&A validation, and competition backup retention.

Match coverage includes quick 0–0/1–0/3–2, detailed 3–2, owner-scoped scorer/assist selection, no assist, invalid numeric/minute input, score synchronization, empty-row removal, confirmation before losing entered details, review, save, edit, deferred details, retry UUIDs and dirty-draft warnings. Squad coverage retains all identities across pitch/list/filter/bench/archive, exact 11-starter status, reserve goalkeepers, physical left/right and midfield depth, image uploads/reloads/external URLs/fallbacks and protected deletion. Game nights cover distinct attendance, odd counts, saved draws, retries, match preparation, closure, history and admin-only database access.

New regressions also exercise 1,105 matches/goals, a lower 137-row API cap, failure on a later page, stable restored epoch-zero timestamps, stale responses across sign-out and account changes, season-consistent dashboard cards, owned footballer highlights and QA navigation without fixture parameters.

PGlite executes real PostgreSQL grants, RLS, constraints, triggers and RPCs, including repeat installation, atomic rollback, stable historical UUIDs/snapshots, same-name footballer isolation, Storage policy predicates and preservation of accounts/chat during competition restore. The image-path correction now runs twice in the default suite too. Both documented installation sequences are checked against every timestamped migration.

## Runtime and review evidence

`npm run dev:qa` starts successfully at **http://127.0.0.1:4173/**. All QA app entrypoints use synthetic clients, including ordinary links without `fixture=`. The default bind is loopback. A plain static server or `npm run dev:live` uses actual Supabase configuration and was not used for write testing.

The separate cloud browser could not reach the local port (`net::ERR_CONNECTION_REFUSED`). Chromium automation ran alongside its QA server inside the same execution namespace and exercised the actual authored pages. The harness used a temporary 4176 port for its independent run; the persistent preview command uses 4173. This is a local preview, not a published deployment.

All six current screenshots were visually inspected:

- [Dashboard · 1366px](screenshots/audit-dashboard-1366.png)
- [Dashboard · 390px](screenshots/audit-dashboard-390.png)
- [Settings · 1366px](screenshots/audit-settings-1366.png)
- [Detailed match entry · 390px](screenshots/audit-match-entry-390.png)
- [Squad and bench · 320px](screenshots/audit-squads-320.png)
- [Chat · 390px](screenshots/audit-chat-390.png)

## Remaining verification boundaries

No authorized staging credentials, Docker, psql or Supabase CLI were available. Actual Supabase password login, hosted Auth/Storage/PostgREST, websocket delivery, production schema-cache behavior, native PostgreSQL/pg-safeupdate stress and physical Safari/Android/screen-reader behavior were not verified in this session. Existing CI history is not presented as a new native-Postgres run.

The production migration state is unknown. Apply and verify the complete [SETUP order](../SETUP.md) in an authorized staging environment before rollout; `20261001062141_squad_safety_review.sql` must remain last. No reset, push, merge or deployment was performed.

See [PROJECT_AUDIT.md](PROJECT_AUDIT.md) for findings, implementation details, all changed-file groups and Git state. Earlier September validation and screenshots are historical evidence; the counts above describe this implementation.
