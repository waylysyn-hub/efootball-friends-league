# Architecture and design pass

Base: `5172519aa5e21bc94141c8ec56221b570fe725c8`. Work only on
`refactor/ui-architecture-polish`; submit a pull request, without merging or deploying.

## Findings

- League's 2,574-line script contains obsolete password, name-based authorization,
  cache and derived-table writes. A DOMContentLoaded monkey patch currently masks
  these paths, loaded using `document.write` from the configuration file.
- Import/reset still attempt forbidden roster/derived writes and ignore errors.
  Match and goal-event saves are separate operations; event deletion errors are lost.
- Empty rosters crash dashboard/awards. Form dropdowns and player tabs reset during
  realtime updates. Hub creates repeated clients, lacks realtime and conflates empty
  data with network errors. Some rendered values permit HTML injection.
- Chat authentication has competing bootstraps. Failed optimistic messages look
  sent; switching chats can race; invitations use an upsert that requires an UPDATE
  privilege intentionally absent from the membership table.
- Legacy feature migrations recreate permissive write policies if rerun. Existing
  security and derived-data migrations must retain their least-privilege behavior.
- Three unrelated visual themes, small type, incomplete keyboard dialogs, and
  cramped mobile goal editors/chat navigation need a unified design system.
- `tournament-hub/index.html` redirects to the active root Hub; its JS/CSS have no
  external references. Keep the redirect and remove only unused assets.

## Implementation order

1. Replace runtime overrides with explicit auth/client loading. Extract native ES
   modules around state, data, auth, navigation, matches/goals, statistics, profiles,
   seasons, Q&A and admin tools. Keep GitHub Pages and no production build step.
2. Fix authentication/session lifecycle, single-flight saves, errors, injection,
   empty states, realtime races and retry behavior. Keep all authorization in RLS.
   Prepare any database additions separately; do not mutate production schema.
3. Share charcoal/gold design tokens, typography, forms, feedback and accessible
   interaction primitives. Rework League, Hub and Chat layouts and mobile drawers.
4. Retain and broaden security checks; add executable frontend integration/smoke
   tests, responsive checks and browser QA where supported. Never store credentials.
5. Document migration order, architecture, limitations and verification. Make
   logical commits, push the feature branch, and open a PR with reviewable evidence.

## Verification boundaries

Production inspection is read-only. Six public player profiles are present, with
six private account links; Wael is admin and the other five are players. All 14
public app tables have RLS enabled and public tables contain no password columns.
Password-based live sign-in requires user-supplied test credentials; fixture auth
tests and SQL policy checks do not substitute for that acceptance gate.
