import test from 'node:test';
import assert from 'node:assert/strict';
import { mount } from './helpers/dom.mjs';
import { ids } from './helpers/fixture.mjs';

function record(app, score = '1') {
 const { window:w, document:d } = app;
 w.League.navigateTo('recordMatch');
 d.getElementById('matchPlayer1').value='Wael'; d.getElementById('matchPlayer2').value='Omar';
 d.getElementById('matchGoals1').value=score; w.League.updateMatchPreview();
 w.League.setMatchEntryMode('match','detailed');
 return d.querySelector('#goalEventsList .ge-row');
}
test('scorer/assist select only the owner squad, omit self-assist and reset after team changes',async t=>{
 const app=await mount('league/index.html',{profile:'Wael'});t.after(()=>app.close());
 const {window:w,document:d}=app;const row=record(app);
 assert.equal(row.querySelector('.ge-scorer').tagName,'SELECT');
 const choices=[...row.querySelector('.ge-scorer').options].map(o=>o.value);
 assert.ok(choices.includes('s1'));assert.ok(!choices.includes('s4'));
 assert.equal(row.querySelector('.ge-assist option').textContent,'بدون أسيست');
 row.querySelector('.ge-scorer').value='s2';w.League.onGoalScorerChange('goalEventsList',0);
 assert.ok(![...row.querySelector('.ge-assist').options].some(o=>o.value==='s2'));
 row.querySelector('.ge-assist').value='s3';row.querySelector('.ge-owner').value='Omar';w.League.onGoalOwnerChange('goalEventsList',0);
 assert.equal(row.querySelector('.ge-scorer').value,'');assert.equal(row.querySelector('.ge-assist').value,'');
 assert.deepEqual([...row.querySelector('.ge-scorer').options].map(o=>o.value),['','s4']);
 d.getElementById('matchPlayer2').value='';w.League.updateMatchPreview();
 const changed=d.querySelector('#goalEventsList .ge-row');
 assert.equal(changed.querySelector('.ge-owner').value,'');assert.equal(changed.querySelector('.ge-scorer').value,'');
 assert.equal(changed.querySelector('.ge-scorer').disabled,true);assert.deepEqual(app.errors,[]);
});
test('detailed mode requires its scorer; optional assist and minute retain the existing data format',async t=>{
 const app=await mount('league/index.html',{profile:'Wael'});t.after(()=>app.close());const {window:w,document:d,client}=app;
 record(app);await w.League.saveMatch();
 assert.equal(client.calls.filter(c=>c.rpc==='save_league_match').length,0);assert.match(d.getElementById('goalEventsList-0-scorerError').textContent,/اختر المسجّل/);
 d.querySelector('.ge-scorer').value='s1';await w.League.saveMatch();await w.League.confirmMatchSave();
 const saved=client.calls.find(c=>c.rpc==='save_league_match');assert.equal(saved.args.goal_events[0].assist_id,null);assert.equal(saved.args.goal_events[0].minute,0);
});
test('empty squad can be filled within the match, failed save retains draft and retry identity',async t=>{
 const app=await mount('league/index.html',{profile:'Wael'});t.after(()=>app.close());const {window:w,document:d,client}=app;
 app.module('league/js/state.js').state.db.squads=[];client.db.squad_players=[];
 record(app);assert.match(d.querySelector('.ge-squad-note').textContent,/فارغة/);w.League.openGoalSquad('goalEventsList',0);
 d.getElementById('squadPlayerName').value='<img src=x onerror=alert(1)>';client.fail='insert';await w.League.saveSquadPlayer();
 assert.equal(d.getElementById('squadPlayerName').value,'<img src=x onerror=alert(1)>');assert.match(d.getElementById('squadPlayerError').textContent,/الخادم/);
 const first=client.calls.filter(c=>c.table==='squad_players'&&c.operation==='insert').at(-1);
 client.fail=null;await w.League.saveSquadPlayer();const second=client.calls.filter(c=>c.table==='squad_players'&&c.operation==='insert').at(-1);
 assert.equal(first.value.id,second.value.id);assert.equal(d.getElementById('matchGoals1').value,'1');assert.equal(d.querySelectorAll('#goalEventsList .ge-row').length,1);
 assert.equal(d.querySelectorAll('#goalEventsList img').length,0);assert.ok([...d.querySelector('.ge-scorer').options].some(o=>o.dataset.name==='<img src=x onerror=alert(1)>' && o.value===second.value.id));
 assert.deepEqual(app.errors,[]);
});
test('squad ownership controls, archive and restore work without changing match history',async t=>{
 const app=await mount('league/index.html',{profile:'Omar'});t.after(()=>app.close());const {window:w,document:d,client}=app;
 w.League.navigateTo('squads');assert.equal(d.getElementById('addSquadPlayer').hidden,false);
 const before=JSON.stringify(client.db.match_goal_events);const button=d.querySelector('[data-squad-toggle]');await w.League.toggleSquadPlayer('s4',button);
 assert.equal(client.db.squad_players.find(p=>p.id==='s4').active,false);assert.equal(JSON.stringify(client.db.match_goal_events),before);
 await w.League.toggleSquadPlayer('s4',d.querySelector('[data-squad-toggle]'));assert.equal(client.db.squad_players.find(p=>p.id==='s4').active,true);
 w.League.selectSquad('Wael');assert.equal(d.getElementById('addSquadPlayer').hidden,true);assert.equal(d.querySelectorAll('[data-squad-edit]').length,0);
});
test('historical selections remain in edit mode and realtime updates preserve draft minutes',async t=>{
 const app=await mount('league/index.html',{profile:'Wael'});t.after(()=>app.close());const {window:w,document:d,client}=app;
 client.db.squad_players=client.db.squad_players.filter(p=>p.name!=='Zlatan Ibrahimović');await w.League.refresh();
 w.League.openEditModal(ids.match);const scorer=d.querySelector('#editGoalEventsList .ge-scorer');
 assert.equal(scorer.value,'s1');assert.match(scorer.selectedOptions[0].textContent,/سابقًا/);
 const rows=w.League.collectGoalEventsFromForm('editGoalEventsList');assert.equal(w.League.validateGoalEvents(rows,'Wael','Omar',2,1,{requireSquad:true,matchId:ids.match}),null);
 assert.match(w.League.validateGoalEvents(rows,'Wael','Omar',2,1,{requireSquad:true}),/غير موجود/);
 d.querySelector('#editGoalEventsList .ge-minute').value='55';await w.League.refresh();assert.equal(d.querySelector('#editGoalEventsList .ge-minute').value,'55');
});
test('known backend errors give safe actionable messages instead of raw database details',async t=>{
 const app=await mount('league/index.html');t.after(()=>app.close());const error=app.module('shared/ui.js').errorMessage;
 assert.match(error({message:'EFL_SELF_ASSIST',status:400}),/لنفسه/);
 assert.match(error({message:'EFL_SCORER_NOT_IN_SQUAD',status:400}),/المسجّل غير موجود/);
 assert.match(error({code:'42501'}),/صلاحية/);assert.match(error({code:'PGRST301'}),/جلسة/);
 assert.match(error({name:'TypeError',message:'Failed to fetch'}),/الاتصال/);
 assert.equal(error({message:'SQL private.secret contents'},'حاول مجددًا'),'حاول مجددًا');
});
