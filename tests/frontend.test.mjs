import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mount,settle } from './helpers/dom.mjs';
import { players,ids } from './helpers/fixture.mjs';

for(const page of ['league/index.html','groups-chat/index.html']) {
 test(page+' loads all six players without errors and authenticates using Supabase',async t=>{
  const app=await mount(page);t.after(()=>app.close());const {document:d,window:w,client}=app;
  assert.deepEqual([...d.querySelectorAll('#loginUsername option')].map(o=>o.value).filter(Boolean).sort(),[...players].sort());
  assert.equal(d.getElementById('loginButton').disabled,false);assert.deepEqual(app.errors,[]);
  d.getElementById('loginUsername').value='Omar';d.getElementById('loginPassword').value=randomUUID();
  d.getElementById('loginForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(d.getElementById('loginScreen').classList.contains('hidden'),true);assert.equal(d.getElementById('loginPassword').value,'');assert.equal(d.body.classList.contains('is-admin'),false);
  assert.equal(w.localStorage.getItem('efl_last_user'),'Omar');assert.equal(w.localStorage.getItem('efl_user'),null);
  client.emitAuth('SIGNED_OUT',null);await settle();assert.equal(d.getElementById('loginScreen').classList.contains('hidden'),false);
 });
 test(page+' handles empty roster and unavailable backend',async t=>{
  const app=await mount(page,{empty:true});t.after(()=>app.close());assert.equal(app.document.getElementById('loginButton').disabled,true);assert.match(app.document.getElementById('loginError').textContent,/No players/);assert.deepEqual(app.errors,[]);
 });
}

test('League restores admin profile and renders every major page',async t=>{
 const app=await mount('league/index.html',{profile:'Wael'});t.after(()=>app.close());
 assert.equal(app.document.body.classList.contains('is-admin'),true);
 const pages=[...app.document.querySelectorAll('.page')].map(p=>p.id.slice(5));
 for(const page of pages)app.window.League.navigateTo(page);
 assert.deepEqual(app.errors,[]);assert.ok(pages.length>=14);
 app.client.emitAuth('SIGNED_IN','Omar');await settle();assert.equal(app.document.body.classList.contains('is-admin'),false);
 app.window.League.navigateTo('recordMatch');assert.equal(app.module('league/js/state.js').state.page,'dashboard');
});

test('League empty competition renders statistics, awards and profiles safely',async t=>{
 const app=await mount('league/index.html',{profile:'Wael'});t.after(()=>app.close());
 const state=app.module('league/js/state.js').state;state.db.matches=[];state.db.seasons=[];state.db.goalEvents=[];state.db.achievements=[];
 for(const page of ['dashboard','leagueTable','playerProfile','statistics','awards','achievements','headToHead','rivalries','footballStats','seasons'])app.window.League.navigateTo(page);
 assert.deepEqual(app.errors,[]);
});

test('Failed match save preserves form, duplicate click coalesces and retry reuses identity',async t=>{
 const app=await mount('league/index.html',{profile:'Wael'});t.after(()=>app.close());const {window:w,document:d,client}=app;
 w.League.navigateTo('recordMatch');
 d.getElementById('matchPlayer1').value='Wael';d.getElementById('matchPlayer2').value='Omar';d.getElementById('matchGoals1').value='0';d.getElementById('matchGoals2').value='0';d.getElementById('matchDate').value='2026-09-09';
 client.fail='rpc';const first=w.League.saveMatch();const duplicate=w.League.saveMatch();await Promise.all([first,duplicate]);
 const failed=client.calls.filter(call=>call.rpc==='save_league_match');assert.equal(failed.length,1);assert.equal(d.getElementById('matchPlayer1').value,'Wael');
 client.fail=null;await w.League.saveMatch();const saved=client.calls.filter(call=>call.rpc==='save_league_match');assert.equal(saved.length,2);assert.equal(saved[0].args.match_data.id,saved[1].args.match_data.id);assert.equal(client.db.matches.length,2);
});

test('Realtime refresh preserves match drafts and selected profile',async t=>{
 const app=await mount('league/index.html',{profile:'Wael'});t.after(()=>app.close());const {window:w,document:d}=app;
 w.League.navigateTo('recordMatch');d.getElementById('matchGoals1').value='7';await w.League.refresh();assert.equal(d.getElementById('matchGoals1').value,'7');
 w.League.navigateTo('playerProfile');w.League.selectProfilePlayer('Omar');await w.League.refresh();assert.equal(app.module('league/js/state.js').state.selectedProfile,'Omar');
});

test('Hub loads, switches all views and recovers from failure without discarding results',async t=>{
 const app=await mount('index.html');t.after(()=>app.close());const {document:d,window:w}=app;
 assert.equal(d.getElementById('hubContent').classList.contains('hidden'),false);
 for(const button of d.querySelectorAll('[data-page]')){button.click();await settle();}
 assert.deepEqual(app.errors,[]);
 app.client.fail='matches';d.getElementById('retryHub').click();await settle();assert.equal(d.getElementById('hubError').hidden,false);
 app.client.fail=null;d.getElementById('retryHub').click();await settle();assert.equal(d.getElementById('hubError').hidden,true);
 assert.equal(w.location.pathname,'/efootball-friends-league/index.html');
});

test('Q&A escapes text, enforces ownership UI and preserves typed text on failure',async t=>{
 const app=await mount('league/index.html',{profile:'Omar'});t.after(()=>app.close());const {window:w,document:d}=app;
 app.module('league/js/state.js').state.db.questions[0].body='<img src=x onerror=alert(1)>';
 w.League.navigateTo('questions');assert.equal(d.querySelectorAll('#qaContent img').length,0);
 d.getElementById('qaAskBody').value='A valid question?';app.client.fail='questions';await w.League.submitQuestion();assert.equal(d.getElementById('qaAskBody').value,'A valid question?');
 assert.equal(d.querySelectorAll('.qa-delete').length,0);
});

test('Chat confirms messages only after server success and retries with same ID',async t=>{
 const app=await mount('groups-chat/index.html',{profile:'Wael'});t.after(()=>app.close());const {document:d,window:w,client}=app;
 d.querySelector('.open-btn').click();await settle();assert.equal(d.querySelectorAll('.msg').length,2);
 const input=d.getElementById('messageInput');input.value='<script>test</script>';client.fail='chat_messages';d.getElementById('composer').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
 assert.equal(input.value,'<script>test</script>');assert.equal(d.querySelectorAll('.msg').length,2);const first=client.calls.filter(call=>call.table==='chat_messages'&&call.operation==='insert').at(-1);
 client.fail=null;d.getElementById('composer').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();const second=client.calls.filter(call=>call.table==='chat_messages'&&call.operation==='insert').at(-1);
 assert.equal(first.value.id,second.value.id);assert.equal(d.querySelectorAll('.msg').length,3);assert.equal(d.querySelectorAll('#messages script').length,0);assert.equal(input.value,'');
 client.emitTable('chat_messages',{id:'other-tab',group_id:ids.group,author:'Wael',body:'From another tab',created_at:'2026-09-09T12:00:00Z'});assert.match(d.getElementById('messages').textContent,/From another tab/);assert.deepEqual(app.errors,[]);
});

test('Chat ignores a late message response after changing group view',async t=>{
 const app=await mount('groups-chat/index.html',{profile:'Wael'});t.after(()=>app.close());const {document:d,window:w,client}=app;
 d.querySelector('.open-btn').click();await settle();let release;client.hold=({operation})=>operation==='insert'?new Promise(resolve=>release=resolve):undefined;
 d.getElementById('messageInput').value='pending';d.getElementById('composer').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
 d.getElementById('backToGroups').click();release();await settle();assert.equal(d.getElementById('view-groups').classList.contains('active'),true);assert.equal(d.querySelectorAll('.msg').length,2);
});

test('Dialogs trap focus and close with Escape',async t=>{
 const app=await mount('groups-chat/index.html',{profile:'Wael'});t.after(()=>app.close());const {document:d,window:w}=app;
 d.getElementById('createGroupBtn').focus();d.getElementById('createGroupBtn').click();assert.equal(d.getElementById('createGroupModal').getAttribute('aria-modal'),'true');
 d.getElementById('createGroupModal').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(d.getElementById('createGroupModal').classList.contains('hidden'),true);assert.equal(d.activeElement.id,'createGroupBtn');
});
