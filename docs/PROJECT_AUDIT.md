# eFootball Friends League — project audit and implementation

28 October 2026 · implementation commits `36421a800c0ec9af9dc16536dfb3e6aeb247f966` and `bf0748035906a4ab2676f1f7d6071a8453ede129`

## 1. Project Audit

The work started from the fetched current `main` at `b5a77494e9db5c42ce99b45252192c00b0093dd6`, in a dedicated worktree on `improve/premium-runtime-audit-20261028`. Both previously available checkouts were clean on older feature branches; their source content was left intact. The baseline passed **95 Node/PGlite tests and 240 browser tests**. The old PR failure report was not treated as evidence that main was broken.

The existing architecture was retained: build-free Arabic RTL HTML/CSS with Cairo, native ES modules, a single pinned Supabase client per page, shared Auth helpers, Postgres/RLS ownership and admin checks, invoker RPCs for atomic writes, database-derived standings/achievements, and Realtime refreshes. The audit covered the root Hub, League modules, squad presentation/images, private chat, shared UI/auth/runtime, SQL/migrations, tests, setup/feature docs and CI. UUID identities, historical snapshots, saved squads and private conversations remain part of the same model.

### Confirmed findings

| Severity | Finding | Resolution/evidence |
| --- | --- | --- |
| High | Whole-table selects silently stopped at the API row cap; late goals/results could disappear from rankings, backups and destructive-scope previews | Ordered pagination and complete-snapshot replacement; regressions with 1,105 records, a 137-row cap and failed later pages |
| High | QA only substituted the SDK when `fixture=` was present; ordinary links could select real configuration | Every QA app entrypoint now substitutes fixtures; browser test follows launcher/Hub links while rejecting real Supabase requests |
| High rollout gap | SETUP omitted safeupdate compatibility, image-path correction and the final squad safety review | Both installation paths list all timestamped migrations in order; executable documentation regression. The live applied-migration state was not inspected |
| Medium | A late snapshot could repopulate cleared data after sign-out, and another account could share the old in-flight load | Session-scoped coalescing, invalidation and cleared private state; late-response and account-switch tests |
| Medium | Legacy zero timestamps were replaced with the current time, changing chronology and falsely invalidating a reviewed destructive scope | Preserve epoch zero in row mappings; Node and browser confirmation regressions |
| Medium | Navigation replaced history and changing matches within the same details route lost individual history entries | Match-specific history state, popstate/hash restoration and reload coverage |
| Medium | Dashboard mixed all-time leaders/results with an active-season match count | One explicit season scope for every card, recent result and mini-standing |
| Medium | PR #25 navigation moved focus away from the mobile drawer opener after selection | Preserve the originating drawer focus; actual mobile interaction regression |
| Medium | Squad deletion used a separate dialog without Escape cancellation | Shared confirmation, cancellation focus, request coalescing and retained confirmation on failure |
| Low accessibility | Q&A validation tried to focus a field already disabled by the busy wrapper | Validate before disabling controls; keep the invalid enabled field focused |
| Low test integration | PR #25 contained a stale expected message and a label locator matching both entry/edit forms | Retain behavioral checks with the intended Arabic text and a form-scoped locator |

No JavaScript runtime errors were observed in the final 250 harness combinations. This does not establish correctness for every possible production dataset or hosted-service condition.

### Open pull requests

- [PR #25](https://github.com/waylysyn-hub/efootball-friends-league/pull/25): read the metadata, changed frontend/tests and [CI run 37762703032](https://github.com/waylysyn-hub/efootball-friends-league/actions/runs/37762703032), including job 113262756098 logs. Its 28 failures comprised ten stale text assertions, ten ambiguous-label checks and eight mobile focus checks. A detached 390px reproduction produced **31 passes and the same three failure classes**. Reviewed missing frontend improvements were integrated selectively; their test/focus defects were corrected. No PR was merged or cherry-picked.
- [PR #19](https://github.com/waylysyn-hub/efootball-friends-league/pull/19): inspected its pitch changes. Current main already had literal LTR pitch coordinates, detailed positions and browser x/y assertions, including AMF above CMF above DMF and GK at the bottom. The older conflicting pitch implementation was not copied over the newer one.
- [PR #10](https://github.com/waylysyn-hub/efootball-friends-league/pull/10): inspected its file list, acceptance description and match-entry patch. Current opponent UUID validation/exclusion and retry behavior were retained. Empty goal rows now disappear directly; entered details still require confirmation. Its older conflicting backend/E2E setup was not transplanted. Actual hosted/local Supabase Auth acceptance remains outside this session's verified environment.

## 2. Implemented Improvements

The shared charcoal/gold/emerald identity, Arabic RTL and Cairo font were retained. League navigation now has meaningful collapsible groups, active states, real browser history, heading focus and mobile opener restoration. Cards, table context, filter recovery, form labels, invalid-field styling and empty/loading/error states follow the same visual language. Recent result cards emphasize the score, date, season, winner/draw and goal-detail status; narrow layouts keep names and controls readable. Settings separate backups, account management and destructive actions.

The dashboard has a season selector whose scope consistently drives standings, recent matches and account metrics. Its footballer scorer card identifies the squad owner and indicates tied leaders. Reusing one standings calculation avoids repeatedly calculating every player's season titles for each metric. Footballer aggregation and detail rendering use maps instead of repeated squad/match searches.

Settings exports refresh the full snapshot first. Imports retain the selected file on validation or request failure. Destructive operations show their scope/counts, require the exact typed phrase, recheck the loaded scope, block repeat submission and retain a persistent result. These checks supplement existing server authorization and atomic writes; browser-side checks never grant database privileges.

Full snapshot loading now traverses ordered API pages, including installations with a lower server cap. A later-page error retains the prior complete snapshot. Session changes invalidate pending loads, clear private snapshots/drafts and prevent stale status updates. The public Hub and squad reloads use the same paging helper. Legacy epoch-zero timestamps remain stable across reads, preserving chronology and preventing false changed-scope warnings after restore. The Hub drawer has one owner for closing/inert/focus state.

Quick and detailed match entry retain review, edits, optional assists, deferred details, score synchronization and stable retry IDs. Reducing an unfilled row no longer prompts unnecessarily. Removing entered scorer/assist/minute/history data still requires confirmation. In-tab drafts survive navigation and failed requests; leaving a dirty match form triggers the browser's standard warning. A deliberate reload or sign-out clears them.

Squad deletion now uses the shared cancellable, busy-aware confirmation. Existing XI completion remains derived from exactly 11 active starters, with the database cap preventing a twelfth. Bench players retain their real positions and UUIDs; archived players remain separate. Existing image upload, external-URL normalization, reload persistence, fallback, uncertain-write reconciliation and referenced-object protection were retained and exercised. No player-photo or football identity schema was rewritten.

Game-night permissions, server-side random draws, distinct attendance, odd-count rests, persisted pairings, retries, preparation of a match, closure and history remain intact. Form validation is now associated with the relevant enabled field.

The complete browser suite now runs at every configured width, including Hub/Chat smoke checks at 320/375/414px. CI collects the new UX/audit screenshots. QA mode is isolated even through ordinary links; explicit live mode remains separate. No frontend framework, production dependency or SQL schema change was introduced.

## 3. Files Changed

**Snapshot/session runtime** — Ordered complete reads, session invalidation/coalescing, safe request lifecycle and action wiring.

`hub-api.js`, `league/js/api.js`, `league/js/app.js`, `league/js/auth-ui.js`, `league/js/realtime.js`, `league/js/state.js`, `shared/data.js`.

**Dashboard and statistics** — Consistent season scope, owned scorer identity, efficient lookups and clear empty/statistical states.

`league/js/achievements.js`, `league/js/dashboard.js`, `league/js/goal-events.js`, `league/js/profiles.js`, `league/js/standings.js`, `league/js/statistics.js`.

**UI, navigation and forms** — Shared visuals, form accessibility, mobile focus, routes/history, cards and recovery states.

`hub.js`, `league/css/ux.css`, `league/index.html`, `league/js/evenings.js`, `league/js/match-details.js`, `league/js/matches.js`, `league/js/questions.js`, `league/js/seasons.js`, `league/js/ui.js`, `league/js/view-states.js`, `shared/components.css`, `shared/ui.js`.

**Safe actions and drafts** — Typed settings scopes, session-bound operations, protected row removal, dirty-draft warning and cancellable squad deletion.

`league/js/admin.js`, `league/js/match-entry.js`, `league/js/squads.js`.

**QA configuration and fixtures** — Fixture-only QA routes, all ten viewport projects, realistic server limits/counts and screenshot collection.

`.github/workflows/security-checks.yml`, `playwright.config.mjs`, `tests/helpers/fixture.mjs`, `tests/preview/harness.mjs`, `tests/preview/index.html`, `vite.config.mjs`.

**Regression tests** — Preserved assertions plus new security/installation, snapshot, history, draft, dialog and UI regressions; image-path migration now exercised in default PGlite.

`tests/browser/audit.spec.mjs`, `tests/browser/match-entry.spec.mjs`, `tests/browser/ux.spec.mjs`, `tests/database.test.mjs`, `tests/football-owner-stats.test.mjs`, `tests/frontend.test.mjs`, `tests/match-entry.test.mjs`, `tests/migration-order.test.mjs`, `tests/runtime-reliability.test.mjs`, `tests/ux.test.mjs`.

**Documentation and measured results** — Complete installation order, current audit, actual results, scope boundaries and review evidence.

`README.md`, `SETUP.md`, `docs/PROJECT_AUDIT.md`, `docs/SQUADS.md`, `docs/VALIDATION.md`, `docs/browser-validation.json`, `docs/responsive-matrix.json`, `supabase/README.md`.

**Review screenshots** — Six synthetic-data desktop/mobile screenshots, visually inspected after the final implementation.

`docs/screenshots/audit-chat-390.png`, `docs/screenshots/audit-dashboard-1366.png`, `docs/screenshots/audit-dashboard-390.png`, `docs/screenshots/audit-match-entry-390.png`, `docs/screenshots/audit-settings-1366.png`, `docs/screenshots/audit-squads-320.png`.

Total: **58 changed/new files** across implementation, regressions, documentation and screenshots. Root SQL files, timestamped migration contents, `auth-runtime.js`, `client-runtime.js`, the Supabase SDK version and `package-lock.json` are unchanged.

## 4. Tests

| Command/check | Executed result |
| --- | --- |
| `npm ci` | Successful installation |
| Baseline `npm test` / browser suite | 95 / 240 passed on fetched main |
| Detached PR #25 browser suite at 390px | 31 passed, 3 failures reproduced and investigated |
| New reliability regressions before their fixes | All five initial scenarios failed as expected; all now pass |
| Epoch-zero restoration regression before its fix | Confirmed failure; now passing in Node and at every browser width |
| Updated match-entry/UX at 1366/390px | 28 passed |
| New browser audit at 1366/390px | 16 passed |
| Final `npm test` | **114 passed, 0 failed, 0 skipped** |
| `npm run test:browser -- --workers=3 --reporter=list,json,html` | **430 passed, 0 failed/skipped/flaky**, about 5m37s |
| Same-origin interactive QA harness in Chromium | **250/250 combinations**, no horizontal overflow or reported script errors |
| `git diff --check` | Passed |

Each of 1920, 1366, 1024, 768, 430, 390, 375, 360, 320 and 414px ran all **43 browser scenarios** and all **25 harness views**. Assertions include real navigation, keyboard controls, forms/dialogs, fixture mutations, image decode/upload/reload paths, exact XI and pitch geometry. SQL tests execute PostgreSQL/RLS/RPC behavior in PGlite, with transactional rollback and preservation checks; their storage schema reproduces policy predicates rather than a running Storage HTTP service.

The standard Playwright download failed with invalid ZIP archives. Chromium **153.0.8010.0** from `@sparticuz/chromium@153.0.0` was installed only in the scratch QA toolchain and used by pinned Playwright **1.63.0**. It is not a new project dependency. The final JSON reporter contains 430 expected results, zero top-level errors and zero non-passing statuses. [Browser summary](browser-validation.json) and [measured matrix](responsive-matrix.json) are committed evidence. No test was deleted, skipped or loosened to hide a failure.

## 5. Runtime Verification

`npm run dev:qa` starts successfully with a loopback bind at **http://127.0.0.1:4173/**. The root is an interactive screen/viewport harness; direct League/Hub/Chat entrypoints also use fixtures in QA mode. Live mode was not used for automated writes.

The separate cloud browser returned `net::ERR_CONNECTION_REFUSED` for the local port. Chromium ran next to its QA server in the same execution namespace, so actual authored HTML, CSS, native modules, navigation, forms, dialogs and fixture writes were verified. The independent harness used temporary port 4176. The supplied 4173 URL is local to the execution environment, not a public deployment.

[Validation record](VALIDATION.md) links six visually inspected screenshots: desktop/mobile dashboard, desktop settings, detailed mobile entry, 320px squad/bench, and mobile chat. They show synthetic data only.

## 6. Remaining Risks

**Confirmed limitations:** match drafts are tab-local and are cleared by deliberate reload/sign-out, with a warning for dirty matches. Ambiguous photo writes intentionally retain uncertain uploads instead of risking removal of a saved image, so an orphan may remain after an interrupted session. The static architecture still loads whole competition snapshots into memory; the audit removes truncation and repeated searches but is not a large-scale production load benchmark. Destructive preflight scope checks are client-side freshness checks, not a serializable database revision lock across concurrent admin tabs.

**Unverified production behavior:** no authorized staging credentials or isolated hosted/local Supabase stack were available; Docker, psql and Supabase CLI were absent. Actual password sessions, JWT refresh/expiration against hosted Auth, Storage HTTP enforcement/delivery, Realtime websocket timing, schema-cache refresh, native pg-safeupdate/concurrency stress, external image-host availability and physical Safari/Android/screen-reader use were not exercised. Current production migration state is unknown; rehearse the complete SETUP sequence in authorized staging before rollout, with the safety review last. Historical CI successes are not claimed as new local native-Postgres results.

There are no remaining failing cases in the executed suites. This is not a claim that untested production behavior is defect-free. No production record, image, account, chat, season or schema was mutated by this work.

## 7. Git Status

- Working branch: `improve/premium-runtime-audit-20261028`.
- Base main: `b5a77494e9db5c42ce99b45252192c00b0093dd6`.
- Implementation commit: `36421a800c0ec9af9dc16536dfb3e6aeb247f966` — `Improve league UX, complete snapshots and isolated QA`.
- Legacy timestamp fix: `bf0748035906a4ab2676f1f7d6071a8453ede129` — `Preserve legacy epoch timestamps during safety reviews`.
- Documentation/evidence are recorded in the following local commit; its hash is available from `git log -2` and the delivery response.
- Final delivery uses a clean working tree. No push, PR merge, cherry-pick, deployment or production migration was performed. Earlier checkouts and unrelated project files were preserved.
