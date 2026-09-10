import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parse } from 'acorn';
const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.name.startsWith('.') || entry.name==='node_modules' ? [] : entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
const files=walk('.');
const source=files.filter(f=>f.endsWith('.js')&&!f.startsWith('tests/')).map(read).join('\n');
const schema=read('supabase-schema.sql'),security=read('supabase-security-migration.sql'),derived=read('supabase-derived-data-migration.sql'),auth=read('auth-runtime.js');
assert.ok(!/select\s*\([^)]*password/i.test(source),'Never query player passwords');
assert.ok(!/data\.password\s*!==|acc\.password\s*!==/.test(source),'No plaintext password comparison');
assert.ok(!/localStorage\.setItem\([^;]*password/i.test(source),'Never store passwords');
assert.ok(!/document\.write\s*\(/.test(source),'No injected script bootstrap');
assert.ok(!/sb_secret_|service_role|"role"\s*:\s*"service_role"/.test(source),'No privileged frontend keys');
assert.ok(!/from\(['"](?:standings|achievements)['"]\)\s*\.(insert|update|upsert|delete)/.test(source),'Derived writes stay in Postgres');
assert.ok(!/\bpassword\s+text\b/i.test(schema),'No public plaintext password column');
for(const file of files.filter(f=>f.endsWith('.sql'))) {
 const sql=read(file);assert.ok(!/using\s*\(\s*true\s*\)\s*with\s+check\s*\(\s*true\s*\)/i.test(sql),file+' must not allow unrestricted writes');
 assert.ok(!/insert\s+into\s+auth\.users/i.test(sql),'Never handcraft auth.users inserts');
}
for(const [regex,message] of [
 [/create schema if not exists private/i,'Private helpers'],[/revoke all on table public\.players,public\.player_accounts/i,'Revoke broad profile grants'],[/grant select\(name,role,created\) on public\.players to anon,authenticated/i,'Safe public profile columns'],[/player_accounts_read_self/,'Self-only private mapping'],[/private\.is_league_admin\(\)/,'Database identity enforcement'],[/status='accepted'/i,'Membership invitation check'],[/revoke execute on functions from public,anon,authenticated/i,'Least privilege future functions'],
])assert.match(security,regex,message);
assert.match(schema,/create table public\.player_accounts/i);
assert.match(derived,/private\.refresh_league_standings/);assert.match(derived,/private\.refresh_league_achievements/);assert.match(derived,/create trigger matches_refresh_derived/i);
assert.match(auth,/auth\.signInWithPassword/);assert.match(auth,/from\('player_accounts'\)/);assert.match(auth,/localStorage\.removeItem\('efl_user'\)/);
assert.match(read('league/js/admin.js'),/state\.profile\?\.role === 'admin'/,'Admin UI reads authenticated profile');
for(const page of ['index.html','league/index.html','groups-chat/index.html']) {
 const doc=new JSDOM(read(page)).window.document;
 const scripts=[...doc.querySelectorAll('script[src]')];const names=scripts.map(s=>path.basename(s.getAttribute('src')));
 assert.equal(names.length,5,page+' explicit script count');
 assert.ok(scripts[0].src.includes('supabase-js@2.116.0'));assert.deepEqual(names.slice(1,4),['supabase-config.js','client-runtime.js','auth-runtime.js']);assert.equal(scripts.at(-1).type,'module');
 const ids=[...doc.querySelectorAll('[id]')].map(el=>el.id);assert.equal(new Set(ids).size,ids.length,page+' unique IDs');
 for(const element of doc.querySelectorAll('[src],link[href],a[href]')) {
  const href=element.getAttribute('src')||element.getAttribute('href');
  if(!href || /^(?:https?:|data:|#|mailto:)/.test(href))continue;
  assert.ok(!href.startsWith('/'),page+' must work on GitHub project paths');
  assert.ok(fs.existsSync(path.resolve(root,path.dirname(page),href.split('#')[0])),page+' broken asset '+href);
 }
 for(const id of page==='index.html'?['hubError','retryHub','hubContent']:['loginForm','loginUsername','loginPassword','loginButton'])assert.ok(doc.getElementById(id),page+' missing '+id);
}
for(const file of files.filter(f=>f.endsWith('.js')))parse(read(file),{ecmaVersion:'latest',sourceType:'module'});
const tokens=new Set([...read('shared/tokens.css').matchAll(/(--[\w-]+)\s*:/g)].map(m=>m[1]));
const css=files.filter(f=>f.endsWith('.css')).map(read).join('\n');
for(const m of css.matchAll(/(--[\w-]+)\s*:/g))tokens.add(m[1]);
for(const m of css.matchAll(/var\((--[\w-]+)\)/g))assert.ok(tokens.has(m[1]),'Undefined design token '+m[1]);
console.log('Security, script order, syntax, design tokens and GitHub Pages paths passed.');
