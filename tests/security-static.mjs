import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const chatApi = read('groups-chat/api.js');
const schema = read('supabase-schema.sql');
const chatMigration = read('supabase-groups-chat-migration.sql');
const securityMigration = read('supabase-security-migration.sql');
const chatRlsFix = read('supabase-chat-rls-fix.sql');
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

assert.match(securityMigration, /revoke all on table public\.players from anon, authenticated/i,
  'Security migration must revoke broad player-table privileges.');
assert.match(securityMigration, /grant select \(name, role, created\) on public\.players to anon, authenticated/i,
  'Only non-sensitive player profile columns should be browser-readable.');
assert.match(securityMigration, /public\.is_league_admin\(\)/,
  'Admin writes must be enforced by database identity.');
assert.match(securityMigration, /refresh_league_standings/,
  'Standings must be database-derived.');
assert.match(securityMigration, /refresh_league_achievements/,
  'Achievements must be database-derived.');

assert.match(chatRlsFix, /security definer/i,
  'Chat membership helpers must bypass recursive RLS safely.');
assert.match(chatRlsFix, /public\.is_chat_member\(group_id\)/,
  'Chat message policies must enforce group membership.');

assert.match(authRuntime, /auth\.signInWithPassword/,
  'Authentication must use Supabase Auth.');
assert.match(authRuntime, /localStorage\.removeItem\('efl_user'\)/,
  'Legacy localStorage auth marker must be purged.');
assert.match(leagueBootstrap, /profile\.role === 'admin'/,
  'League UI admin state must come from the authenticated database profile.');
assert.match(leagueBootstrap, /persistStandings = async function \(\) \{\};/,
  'Browser-side standings persistence must remain disabled.');

console.log('Security regression checks passed.');
