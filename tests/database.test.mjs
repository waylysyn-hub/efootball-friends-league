import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { players } from './helpers/fixture.mjs';

test('Postgres security and transactional behavior',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("create role anon; create role authenticated; create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated; create publication supabase_realtime;");
 const migrations=['supabase-schema.sql','supabase-groups-chat-migration.sql','supabase-security-migration.sql','supabase-derived-data-migration.sql','supabase-consistency-migration.sql'];
 for(const file of migrations)await db.exec(await fs.readFile(new URL('../'+file,import.meta.url),'utf8'));
 // Reapplying the additive migration must remain safe.
 await db.exec(await fs.readFile(new URL('../supabase-consistency-migration.sql',import.meta.url),'utf8'));
 const accounts=Object.fromEntries(players.map(name=>[name,randomUUID()]));
 for(const [name,id] of Object.entries(accounts))await db.query('insert into public.player_accounts(name,auth_user_id) values($1,$2)',[name,id]);
 const as=(name,sql,params=[])=>db.transaction(async tx=>{
  await tx.exec('set local role '+(name?'authenticated':'anon'));
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[accounts[name] || '']);
  return (await tx.query(sql,params)).rows;
 });
 const season=(await db.query('select id from public.seasons')).rows[0].id;
 const match=randomUUID();const payload={id:match,player1:'Wael',player2:'Omar',goals1:1,goals2:0,date:'2026-09-09',season_id:season,timestamp:1000};
 const events=[{owner:'Wael',scorer:'Zlatan',assist:'Ronaldinho',minute:80}];
 await t.test('public roster is safe and all six identities resolve privately',async()=>{
  assert.equal((await as(null,'select name,role,created from public.players')).length,6);
  await assert.rejects(as(null,'select * from public.player_accounts'),/permission denied/);
  await assert.rejects(as('Wael','select auth_user_id from public.player_accounts'),/permission denied/);
  await assert.rejects(as(null,'select password from public.players'),/does not exist/);
  for(const name of players){assert.deepEqual(await as(name,'select name from public.player_accounts'),[{name}]);assert.equal((await as(name,'select private.is_league_admin() as admin'))[0].admin,name==='Wael');}
 });
 await t.test('every normal player is denied admin RPCs and derived writes',async()=>{
  for(const name of players.filter(n=>n!=='Wael')){
   await assert.rejects(as(name,'select public.save_league_match($1,$2)',[payload,events]),/insufficient_privilege|permission denied/i);
   await assert.rejects(as(name,"insert into public.matches(player1,player2,goals1,goals2,date) values('Wael','Omar',1,0,current_date)"),/row-level security/);
   await assert.rejects(as(name,"update public.standings set points=999"),/permission denied/);
   await assert.rejects(as(name,"update public.players set role='admin' where name=$1 returning name",[name]),/permission denied/);
  }
 });
 await t.test('match + events commit together and database refreshes standings/achievements',async()=>{
  await as('Wael','select public.save_league_match($1,$2)',[payload,events]);
  assert.equal((await as(null,'select * from public.match_goal_events where match_id=$1',[match])).length,1);
  const standing=(await as(null,"select points,wins,goals_for from public.standings where player='Wael' and season='all'"))[0];assert.deepEqual(standing,{points:3,wins:1,goals_for:1});
  assert.ok((await as(null,"select achievement_id from public.achievements where player='Wael'")).some(a=>a.achievement_id==='first_win'));
  await as('Wael','select public.save_league_match($1,$2)',[{...payload,goals1:0,goals2:0},[]]);
  assert.equal((await as(null,'select * from public.match_goal_events where match_id=$1',[match])).length,0);
  assert.equal((await as(null,"select points from public.standings where player='Wael' and season='all'"))[0].points,1);
 });
 await t.test('invalid events roll back score edits and failed restore preserves existing results/accounts',async()=>{
  await assert.rejects(as('Wael','select public.save_league_match($1,$2)',[payload,[{...events[0],minute:121}]]),/check constraint/);
  assert.equal((await as(null,'select goals1 from public.matches where id=$1',[match]))[0].goals1,0);
  await assert.rejects(as('Wael','select public.restore_league_competition($1)',[{seasons:[],matches:[{...payload,season:season}],goalEvents:[],matchStats:[]}]),/foreign key/);
  assert.equal((await as(null,'select id from public.matches')).length,1);assert.equal((await db.query('select name from public.player_accounts')).rows.length,6);
 });
 await t.test('season switches are atomic and empty seasons get derived standings',async()=>{
  const second=randomUUID();await as('Wael','insert into public.seasons(id,name) values($1,$2)',[second,'Season 2']);
  assert.equal((await as(null,'select player from public.standings where season=$1',[second])).length,6);
  await as('Wael','select public.set_league_active_season($1)',[second]);assert.deepEqual(await as(null,'select id from public.seasons where active'),[{id:second}]);
  await assert.rejects(as('Omar','select public.set_league_active_season($1)',[season]),/insufficient_privilege|permission denied/i);
 });
 const q=randomUUID(),q2=randomUUID(),answer=randomUUID();
 await t.test('Q&A enforces author identity, answer linkage and closure in Postgres',async()=>{
  await as('Wael','insert into public.questions(id,author,body) values($1,$2,$3)',[q,'Wael','Next match?']);
  await as('Omar','insert into public.questions(id,author,body) values($1,$2,$3)',[q2,'Omar','Another question?']);
  await assert.rejects(as('Omar',"insert into public.answers(question_id,author,body) values($1,'Wael','Impersonated')",[q]),/row-level security/);
  await as('Omar','insert into public.answers(id,question_id,author,body) values($1,$2,$3,$4)',[answer,q,'Omar','Tomorrow']);
  await assert.rejects(as('Omar','update public.questions set correct_answer_id=$1 where id=$2',[answer,q2]),/another question/);
  await as('Wael','update public.questions set closed=true,correct_answer_id=$1 where id=$2',[answer,q]);
  await assert.rejects(as('Omar',"insert into public.answers(question_id,author,body) values($1,'Omar','Too late')",[q]),/closed/);
 });
 const group=randomUUID(),invite=randomUUID();
 await t.test('group creation + owner membership is atomic and retry-safe',async()=>{
  const args=[group,'League chat','A local test','⚽',0];await as('Wael','select public.create_league_chat_group($1,$2,$3,$4,$5)',args);await as('Wael','select public.create_league_chat_group($1,$2,$3,$4,$5)',args);
  assert.equal((await as('Wael','select player from public.chat_group_members where group_id=$1',[group])).length,1);
  assert.equal((await as('Omar','select id from public.chat_groups where id=$1',[group])).length,0);
  await assert.rejects(as('Omar',"insert into public.chat_messages(group_id,author,body) values($1,'Omar','Not a member')",[group]),/row-level security/);
 });
 await t.test('invite acceptance is private, atomic and idempotent without membership UPDATE grant',async()=>{
  await as('Wael','insert into public.chat_invitations(id,group_id,invited_by,invited_player) values($1,$2,$3,$4)',[invite,group,'Wael','Omar']);
  assert.equal((await as('Mustafa','select id from public.chat_invitations')).length,0);
  await assert.rejects(as('Mustafa','select public.respond_chat_invitation($1,true)',[invite]),/not found/);
  await as('Omar','select public.respond_chat_invitation($1,true)',[invite]);await as('Omar','select public.respond_chat_invitation($1,true)',[invite]);
  assert.equal((await as('Omar','select id from public.chat_groups where id=$1',[group])).length,1);
  await as('Omar',"insert into public.chat_messages(group_id,author,body) values($1,'Omar','Confirmed member')",[group]);
  await assert.rejects(as('Omar',"insert into public.chat_messages(group_id,author,body) values($1,'Wael','Impersonation')",[group]),/row-level security/);
 });
 await t.test('competition restore preserves auth mapping, Q&A and private conversations',async()=>{
  await as('Wael','select public.restore_league_competition($1)',[{seasons:[{id:season,name:'Restored',active:true,created:1}],matches:[],goalEvents:[],matchStats:[]}]);
  assert.equal((await as(null,'select id from public.matches')).length,0);assert.equal((await as(null,"select achievement_id from public.achievements where achievement_id='first_win'")).length,0);
  assert.equal((await db.query('select name from public.player_accounts')).rows.length,6);assert.equal((await as(null,'select id from public.questions')).length,2);
  assert.equal((await as('Omar','select id from public.chat_messages')).length,1);
 });
});
