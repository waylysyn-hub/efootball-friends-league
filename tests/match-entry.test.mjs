import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, settle } from './helpers/dom.mjs';
import { ids, players } from './helpers/fixture.mjs';

async function setup(t) {
  const app = await mount('league/index.html', { profile: 'Wael' }); t.after(() => app.close());
  app.window.League.navigateTo('recordMatch'); return app;
}
function fill(app, g1 = 1, g2 = 0, prefix = 'match') {
  const d = app.document;
  for (const [key, value] of Object.entries({ Player1: 'Wael', Player2: 'Omar', Goals1: g1, Goals2: g2 })) d.getElementById(prefix + key).value = value;
  app.window.League.onMatchEntryChange(prefix);
}
function complete(app, prefix = 'match') {
  const id = prefix === 'edit' ? 'editGoalEventsList' : 'goalEventsList';
  app.document.querySelectorAll(`#${id} .ge-row`).forEach((row, i) => {
    row.querySelector('.ge-scorer').value = row.querySelector('.ge-owner').value === 'Wael' ? 'Zlatan Ibrahimović' : 'Didier Drogba';
    app.window.League.onGoalScorerChange(id, i);
  });
}
const calls = app => app.client.calls.filter(row => row.rpc === 'save_league_match');

for (const score of [[0, 0], [1, 0], [3, 2]]) test(`quick ${score.join('–')} requires review, saves no invented goals, resets and refreshes`, async t => {
  const app = await setup(t), { document: d, window: w } = app;
  assert.equal(d.getElementById('matchQuickTab').getAttribute('aria-pressed'), 'true');
  assert.equal(d.getElementById('matchSeason').value, ids.season);
  const now = new Date(); assert.equal(d.getElementById('matchDate').value, `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`);
  fill(app, ...score); w.League.saveMatch();
  assert.equal(calls(app).length, 0); assert.equal(d.getElementById('matchReviewModal').classList.contains('hidden'), false);
  if (score[0]) assert.match(d.getElementById('matchReviewSummary').textContent, /بنتيجته فقط/);
  await w.League.confirmMatchSave();
  const saved = calls(app)[0].args; assert.deepEqual(Array.from(saved.goal_events), []);
  assert.equal(saved.match_data.goals1, score[0]); assert.equal(saved.match_data.goals2, score[1]);
  assert.equal(d.getElementById('matchPlayer1').value, ''); assert.equal(d.getElementById('matchGoals1').value, '0');
  assert.equal(d.getElementById('matchEntrySuccess').hidden, false);
  const state = app.module('league/js/state.js').state;
  const match = state.db.matches.find(row => row.id === saved.match_data.id);
  assert.ok(match); assert.equal(w.League.hasMissingGoalDetails(match), score[0] + score[1] > 0);
  const table = w.League.computeLeagueTable(ids.season); assert.equal(table.find(row => row.player === 'Wael').played, 2);
  w.League.navigateTo('matchHistory'); assert.equal(d.querySelectorAll('.entry-missing-badge').length, score[0] + score[1] > 0 ? 1 : 0);
  assert.deepEqual(app.errors, []);
});

test('detailed 3–2 automatically creates owner rows, switches modes without loss and saves five goals', async t => {
  const app = await setup(t), { document: d, window: w } = app;
  fill(app, 3, 2); w.League.setMatchEntryMode('match', 'detailed'); complete(app);
  let rows = w.League.collectGoalEventsFromForm('goalEventsList');
  assert.deepEqual(Array.from(rows, row => row.owner), ['Wael','Wael','Wael','Omar','Omar']);
  d.querySelector('.ge-assist').value = 'Ronaldinho'; d.querySelector('.ge-minute').value = '120';
  const before = JSON.stringify(w.League.collectGoalEventsFromForm('goalEventsList'));
  w.League.setMatchEntryMode('match','quick'); w.League.setMatchEntryMode('match','detailed');
  assert.equal(JSON.stringify(w.League.collectGoalEventsFromForm('goalEventsList')), before);
  w.League.saveMatch(); assert.match(d.getElementById('matchReviewSummary').textContent, /تفاصيل أهداف مكتملة5/);
  await w.League.confirmMatchSave(); rows = calls(app)[0].args.goal_events;
  assert.equal(rows.length, 5); assert.equal(rows[0].assist, 'Ronaldinho'); assert.equal(rows[0].minute, 120);
  assert.equal(rows[1].minute, 0); assert.equal(rows[1].assist, ''); assert.deepEqual(app.errors, []);
});

test('0–0 detailed mode has an empty explanation and no required scorer', async t => {
  const app = await setup(t); fill(app,0,0); app.window.League.setMatchEntryMode('match','detailed');
  assert.match(app.document.getElementById('goalEventsList').textContent, /لا توجد أهداف مسجلة/);
  app.window.League.saveMatch(); await app.window.League.confirmMatchSave(); assert.equal(calls(app).length,1);
});

test('score increases preserve filled rows and decreases can be cancelled before deleting details', async t => {
  const app = await setup(t), { document: d, window: w } = app;
  fill(app,3,2); w.League.setMatchEntryMode('match','detailed'); complete(app); d.querySelector('.ge-minute').value='44';
  w.League.changeMatchScore('match',1,1); assert.equal(d.querySelectorAll('#goalEventsList .ge-row').length,6);
  assert.equal(d.querySelector('.ge-minute').value,'44');
  d.getElementById('matchGoals1').value='1'; w.League.updateMatchPreview();
  assert.equal(d.getElementById('matchGoals1').value,'4'); assert.equal(d.querySelectorAll('#goalEventsList .ge-row').length,6);
  w.League.closeConfirmModal(); assert.equal(d.querySelectorAll('#goalEventsList .ge-row').length,6);
  d.getElementById('matchGoals1').value='1'; w.League.updateMatchPreview(); await d.getElementById('confirmYes').onclick();
  assert.equal(d.getElementById('matchGoals1').value,'1'); assert.equal(d.querySelectorAll('#goalEventsList .ge-row').length,3);
  assert.equal(d.querySelector('.ge-minute').value,'44'); assert.deepEqual(app.errors,[]);
});

test('manual row additions, owner reassignment and confirmed removals update the score automatically', async t => {
  const app=await setup(t),{document:d,window:w}=app; fill(app,1,0); w.League.setMatchEntryMode('match','detailed'); complete(app);
  w.League.addGoalEventRow('goalEventsList'); assert.equal(d.getElementById('matchGoals1').value,'2');
  d.querySelectorAll('.ge-owner')[1].value='Omar'; w.League.onGoalOwnerChange('goalEventsList',1);
  assert.equal(d.getElementById('matchGoals1').value,'1'); assert.equal(d.getElementById('matchGoals2').value,'1');
  w.League.removeGoalEventRow('goalEventsList',1); w.League.closeConfirmModal(); assert.equal(d.getElementById('matchGoals2').value,'1');
  w.League.removeGoalEventRow('goalEventsList',1); await d.getElementById('confirmYes').onclick(); assert.equal(d.getElementById('matchGoals2').value,'0');
});

test('field errors reject missing/duplicate teams, fractions, negatives and invalid optional minutes', async t => {
  const app=await setup(t),{document:d,window:w}=app;
  w.League.saveMatch(); assert.equal(d.getElementById('matchPlayer1').getAttribute('aria-invalid'),'true');
  fill(app); assert.equal(d.querySelector('#matchPlayer2 option[value="Wael"]').disabled,true);
  d.getElementById('matchPlayer2').value='Wael'; w.League.saveMatch(); assert.match(d.getElementById('matchPlayer2Error').textContent,/نفسه/);
  fill(app); for(const value of ['','-1','1.5','100']) {d.getElementById('matchGoals1').value=value; w.League.saveMatch(); assert.equal(d.getElementById('matchGoals1').getAttribute('aria-invalid'),'true');}
  fill(app); w.League.setMatchEntryMode('match','detailed'); w.League.saveMatch(); assert.equal(d.querySelector('.ge-scorer').getAttribute('aria-invalid'),'true'); complete(app);
  for(const value of ['0','-1','1.5','121']) {d.querySelector('.ge-minute').value=value; w.League.saveMatch(); assert.match(d.querySelector('.ge-minute').nextElementSibling.textContent,/1 إلى 120/);}
  assert.equal(calls(app).length,0); d.querySelector('.ge-minute').value=''; w.League.saveMatch(); await w.League.confirmMatchSave(); assert.equal(calls(app).length,1);
});

test('explicit deferral permits unfinished rows and the saved game can be completed later without duplication', async t => {
  const app=await setup(t),{document:d,window:w}=app; fill(app,3,2); w.League.setMatchEntryMode('match','detailed');
  d.getElementById('matchDeferDetails').checked=true; w.League.toggleDeferredDetails('match'); w.League.saveMatch(); await w.League.confirmMatchSave();
  const id=calls(app)[0].args.match_data.id; assert.equal(calls(app)[0].args.goal_events.length,0);
  w.League.navigateTo('matchHistory'); assert.match(d.getElementById('match-card-'+id).textContent,/تفاصيل ناقصة/);
  w.League.openEditModal(id); assert.equal(d.getElementById('editQuickTab').getAttribute('aria-pressed'),'true');
  w.League.setMatchEntryMode('edit','detailed'); assert.equal(d.querySelectorAll('#editGoalEventsList .ge-row').length,5); complete(app,'edit');
  w.League.saveEditMatch(); await w.League.confirmMatchSave();
  assert.equal(calls(app)[1].args.match_data.id,id); assert.equal(app.client.db.matches.length,2);
  assert.equal(d.querySelectorAll('#match-card-'+id+' .entry-missing-badge').length,0); assert.equal(app.client.db.match_goal_events.filter(row=>row.match_id===id).length,5);
});

test('new/cancel confirmation preserves drafts, navigation and realtime do not silently reset them', async t => {
  const app=await setup(t),{document:d,window:w}=app; fill(app,3,2); w.League.setMatchEntryMode('match','detailed'); complete(app);
  w.League.clearMatchForm(); assert.match(d.getElementById('confirmMessage').textContent,/ستفقد المعلومات/); w.League.closeConfirmModal(); assert.equal(d.getElementById('matchGoals1').value,'3');
  w.League.navigateTo('dashboard'); w.League.navigateTo('recordMatch'); await w.League.refresh(); assert.equal(d.querySelectorAll('#goalEventsList .ge-row').length,5);
  w.League.clearMatchForm(); await d.getElementById('confirmYes').onclick(); assert.equal(d.getElementById('matchPlayer1').value,''); assert.equal(d.getElementById('matchQuickTab').getAttribute('aria-pressed'),'true');
});

test('quick mode score reduction does not silently discard a retained detailed draft',async t=>{
  const app=await setup(t),{document:d,window:w}=app; fill(app,3,2); w.League.setMatchEntryMode('match','detailed'); complete(app);
  w.League.setMatchEntryMode('match','quick'); d.getElementById('matchGoals1').value='1'; w.League.updateMatchPreview(); w.League.setMatchEntryMode('match','detailed');
  w.League.closeConfirmModal(); assert.equal(d.getElementById('matchQuickTab').getAttribute('aria-pressed'),'true'); assert.equal(d.getElementById('matchGoals1').value,'1'); assert.equal(d.querySelectorAll('#goalEventsList .ge-row').length,5);
  w.League.setMatchEntryMode('match','detailed'); await d.getElementById('confirmYes').onclick(); assert.equal(d.querySelectorAll('#goalEventsList .ge-row').length,3);
});

test('a lost response after commit can be retried without duplicating a scored match',async t=>{
  const app=await setup(t),{document:d,window:w,client}=app; fill(app,1,0); w.League.saveMatch();
  const rpc=client.rpc.bind(client); let lose=true;
  client.rpc=async(name,args)=>{const result=await rpc(name,args);if(name==='save_league_match'&&lose){lose=false;return {error:{message:'Failed to fetch',status:0}};}return result;};
  await w.League.confirmMatchSave(); assert.equal(d.getElementById('matchPlayer1').value,'Wael'); assert.match(d.getElementById('matchReviewError').textContent,/الاتصال/);
  assert.equal(client.db.matches.length,2); await w.League.confirmMatchSave(); assert.equal(client.db.matches.length,2); assert.equal(calls(app)[0].args.match_data.id,calls(app)[1].args.match_data.id);
});

test('late save response cannot reopen a review or restore private drafts after logout', async t => {
  const app=await setup(t),{document:d,window:w,client}=app; fill(app); w.League.saveMatch();
  let release; client.hold=({rpc})=>rpc==='save_league_match'?new Promise(resolve=>{release=resolve;}):Promise.resolve();
  const saving=w.League.confirmMatchSave(); await settle(); client.emitAuth('SIGNED_OUT',null); await settle(); release(); await saving;
  assert.equal(d.getElementById('matchReviewModal').classList.contains('hidden'),true); assert.equal(d.getElementById('mainApp').classList.contains('hidden'),true);
  assert.equal(app.module('league/js/state.js').state.pendingMatchId,null);
});

test('all normal player accounts are denied both quick entry and editing in the UI',async t=>{
  for(const profile of players.filter(name=>name!=='Wael')) {
    const app=await mount('league/index.html',{profile}); t.after(()=>app.close());
    app.window.League.navigateTo('recordMatch'); app.window.League.openEditModal(ids.match); app.window.League.saveMatch(); app.window.League.confirmMatchSave();
    assert.equal(app.module('league/js/state.js').state.page,'dashboard'); assert.equal(calls(app).length,0);
    assert.equal(app.document.getElementById('editMatchModal').classList.contains('hidden'),true);
  }
});
