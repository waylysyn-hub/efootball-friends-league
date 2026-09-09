import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const chatApi = read('groups-chat/api.js');
const schema = read('supabase-schema.sql');
const chatMigration = read('supabase-groups-chat-migration.sql');
const securityMigration = read('supabase-security-migration.sql');
const derivedMigration = read('supabase-derived-data-migration.sql');
const authRuntime = read('auth-runtime.js');
const leagueBootstrap = read('league/security-bootstrap.js');

assert.ok(!/select\s*\(\s*['"]name\s*,\s*password['"]\s*\)/i.test(chatApi),
  'Chat must never request player passwords.');
assert.ok(!/data\.password\s*!==|acc\.password\s*!==/i.test(chatApi),
  'Chat must not compare plaintext passwords in the browser.');

assert.ok(!/\bpassword\s+text\b/i.test(schema),
  'Fresh schema must not contain a plaintext password column.');
assert.ok(!/using\s*\(\s*true\s*\)\s*with\s+check\s*\(\s*true\s*\)/i.test(schema),
  'Fresh schema must not grant allow-everything RLS writes.');
assert.ok(!/using\s*\(\s*true\s*\)\s*with\s+check\s*\(\s*true\s*\)/i.test(chatMigration),
  'Chat bootstrap migration must not grant allow-everything RLS writes.');

assert.match(schema, /create table public\.player_accounts/i,
  'Auth links must be separated from the public player roster.');
assert.match(securityMigration, /create schema if not exists private/i,
  'Security-definer helpers must live in a non-exposed private schema.');
assert.match(securityMigration, /revoke all on table public\.players,public\.player_accounts/i,
  'Security migration must revoke broad browser privileges before granting least privilege.');
assert.match(securityMigration, /grant select\(name,role,created\) on public\.players to anon,authenticated/i,
  'Only safe player profile columns should be browser-readable.');
assert.match(securityMigration, /player_accounts_read_self/i,
  'Account mapping must be protected by self-only RLS.');
assert.match(securityMigration, /private\.is_league_admin\(\)/,
  'Admin writes must be enforced by database identity.');
assert.match(securityMigration, /status='accepted'/i,
  'A player may only join a chat after accepting an invitation.');
assert.match(securityMigration, /revoke execute on functions from public,anon,authenticated/i,
  'Future public functions must not receive accidental browser EXECUTE grants.');

assert.match(derivedMigration, /private\.refresh_league_standings/,
  'Standings must be derived in Postgres.');
assert.match(derivedMigration, /private\.refresh_league_achievements/,
  'Achievements must be derived in Postgres.');
assert.match(derivedMigration, /create trigger matches_refresh_derived/i,
  'Match changes must refresh derived data automatically.');

assert.match(authRuntime, /auth\.signInWithPassword/,
  'Authentication must use Supabase Auth.');
assert.match(authRuntime, /from\('player_accounts'\)/,
  'The browser must resolve its profile through the RLS-protected account mapping.');
assert.match(authRuntime, /localStorage\.removeItem\('efl_user'\)/,
  'Legacy localStorage auth marker must be purged.');
assert.match(leagueBootstrap, /window\.__eflProfile\.role === 'admin'/,
  'League UI admin state must come from the authenticated database profile.');
assert.match(leagueBootstrap, /persistStandings = async function \(\) \{\};/,
  'Browser-side standings persistence must remain disabled.');

console.log('Security regression checks passed.');
