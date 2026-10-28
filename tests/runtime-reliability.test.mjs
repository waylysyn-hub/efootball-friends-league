import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, settle } from './helpers/dom.mjs';
import { ids } from './helpers/fixture.mjs';

function competition(client, size) {
  const match = client.db.matches[0];
  client.db.matches = Array.from({length:size}, (_, i) => ({...match,
    id:`20000000-0000-4000-8000-${String(i + 1).padStart(12,'0')}`,goals1:1,goals2:0,timestamp:i}));
  client.db.match_goal_events = client.db.matches.map((m, i) => ({
    id:`70000000-0000-4000-8000-${String(i + 1).padStart(12,'0')}`,
    match_id:m.id,owner:'Wael',owner_id:m.player1_id,scorer:'Zlatan Ibrahimović',scorer_id:'s1',assist:'',minute:10,sort_order:0,
  }));
}

test('league and public rankings include matches and goals beyond the API row limit', async t => {
  const app = await mount('league/index.html', {profile:'Wael'}); t.after(() => app.close());
  competition(app.client,1105);
  await app.window.League.refresh();
  const state = app.module('league/js/state.js').state;
  assert.equal(state.db.matches.length,1105);
  assert.equal(state.db.goalEvents.length,1105);
  assert.equal(app.window.League.computeFootballPlayerStats('all')[0].goals,1105);
  assert.equal(app.window.League.computeLeagueTable('all')[0].points,3315);

  const hub = await mount('index.html'); t.after(() => hub.close());
  competition(hub.client,1105);
  hub.document.getElementById('retryHub').click(); await settle();
  assert.equal(hub.document.querySelector('.hub-scorer-goals').textContent,'1105');
  assert.deepEqual(app.errors,[]); assert.deepEqual(hub.errors,[]);
});

test('a configured lower API cap still loads every page and a later failure retains the prior snapshot', async t => {
  const app = await mount('league/index.html', {profile:'Wael'}); t.after(() => app.close());
  app.client.rowLimit = 137; competition(app.client,275);
  await app.window.League.refresh();
  const state = app.module('league/js/state.js').state;
  assert.equal(state.db.matches.length,275);
  assert.equal(state.db.goalEvents.length,275);
  competition(app.client,600);
  app.client.hold = ({table,rangeStart}) => {
    if (table === 'matches' && rangeStart >= 137) throw {status:503};
  };
  await app.window.League.refresh();
  assert.equal(state.db.matches.length,275);
  assert.equal(state.db.goalEvents.length,275);
  assert.equal(state.dataStatus,'error');
});

test('a response from a signed-out session cannot repopulate the cleared snapshot', async t => {
  const app = await mount('league/index.html', {profile:'Wael'}); t.after(() => app.close());
  let release;
  app.client.hold = ({table}) => table === 'matches' ? new Promise(resolve => release=resolve) : undefined;
  const pending = app.module('league/js/api.js').fetchAllData(); await settle();
  app.client.emitAuth('SIGNED_OUT',null); await settle();
  release(); await pending;
  const state = app.module('league/js/state.js').state;
  assert.equal(state.user,null);
  assert.equal(state.db.matches.length,0);
  assert.equal(state.db.evenings.length,0);
  assert.equal(app.document.getElementById('mainApp').classList.contains('hidden'),true);
});

test('same-route match navigation records separate history entries and restores each match', async t => {
  const app = await mount('league/index.html', {profile:'Wael'}); t.after(() => app.close());
  const {window:w} = app;
  const state = app.module('league/js/state.js').state;
  state.db.matches.push({...state.db.matches[0],id:'another-match',goals1:5});
  w.League.openMatchDetails(ids.match);
  const first = w.history.length;
  w.League.openMatchDetails('another-match');
  assert.equal(w.history.length,first+1);
  w.history.back(); await settle();
  assert.equal(state.matchId,ids.match);
  assert.equal(app.document.querySelector('.md-score bdi').textContent,'2');
  w.history.forward(); await settle();
  assert.equal(state.matchId,'another-match');
});

test('invalid Q&A submission focuses the enabled field and does not send a request', async t => {
  const app = await mount('league/index.html', {profile:'Omar'}); t.after(() => app.close());
  app.window.League.navigateTo('questions');
  await app.window.League.submitQuestion();
  assert.equal(app.document.activeElement.id,'qaAskBody');
  assert.equal(app.document.activeElement.disabled,false);
  assert.equal(app.client.calls.filter(c => c.table === 'questions' && c.operation === 'insert').length,0);
});

test('a new session loads independently and is not overwritten by an older response', async t => {
  const app = await mount('league/index.html', {profile:'Wael'}); t.after(() => app.close());
  let release, held = false;
  app.client.after = ({table}) => {
    if (table === 'matches' && !held) { held = true; return new Promise(resolve => release=resolve); }
  };
  const pending = app.module('league/js/api.js').fetchAllData(); await settle();
  app.client.emitAuth('SIGNED_OUT',null); await settle();
  app.client.db.matches = []; app.client.db.match_goal_events = [];
  app.client.emitAuth('SIGNED_IN','Omar'); await settle();
  const state = app.module('league/js/state.js').state;
  assert.equal(state.user,'Omar'); assert.equal(state.db.matches.length,0);
  release(); await pending;
  assert.equal(state.user,'Omar'); assert.equal(state.db.matches.length,0);
  assert.equal(state.db.evenings.length,0);
});

test('dashboard metrics, owned footballer totals and recent results share one season scope', async t => {
  const app = await mount('league/index.html', {profile:'Wael',overlappingSquads:true}); t.after(() => app.close());
  const {client,window:w,document:d} = app;
  client.db.seasons.push({id:'previous',name:'Previous season',active:false,created:0});
  client.db.matches.push({...client.db.matches[0],id:'previous-match',season_id:'previous',player1:'Omar',player2:'Wael',goals1:9,goals2:0});
  await w.League.refresh(); w.League.navigateTo('dashboard');
  assert.equal(d.getElementById('dashboardSeasonFilter').value,ids.season);
  assert.equal(d.getElementById('sc-matches-val').textContent,'1');
  assert.equal(d.getElementById('sc-leader-val').textContent,'مصطفى');
  assert.match(d.getElementById('sc-scorer-sub').textContent,/3 هدف · فريق مصطفى/);
  assert.equal(d.querySelectorAll('[data-recent-match]').length,1);
  d.getElementById('dashboardSeasonFilter').value='previous'; w.League.renderDashboard();
  assert.equal(d.getElementById('sc-leader-val').textContent,'عمر');
  assert.equal(d.getElementById('sc-attack-sub').textContent,'9 هدف مسجّل');
  assert.equal(d.querySelector('[data-recent-match]').dataset.recentMatch,'previous-match');
  w.League.navigateTo('settings'); w.League.navigateTo('dashboard'); await w.League.refresh();
  assert.equal(d.getElementById('dashboardSeasonFilter').value,'previous');
  d.getElementById('dashboardSeasonFilter').value='all'; w.League.renderDashboard();
  assert.equal(d.getElementById('sc-matches-val').textContent,'2');
  assert.equal(d.querySelectorAll('[data-recent-match]').length,2);
  assert.deepEqual(app.errors,[]);
});

test('empty goal rows can be reduced immediately while entered details require confirmation', async t => {
  const app = await mount('league/index.html', {profile:'Wael'}); t.after(() => app.close());
  const {window:w,document:d} = app;
  w.League.navigateTo('recordMatch');
  d.getElementById('matchPlayer1').value='Wael'; d.getElementById('matchPlayer2').value='Omar';
  d.getElementById('matchGoals1').value='3'; w.League.onMatchEntryChange('match');
  w.League.setMatchEntryMode('match','detailed');
  w.League.changeMatchScore('match',1,-1);
  assert.equal(d.querySelectorAll('#goalEventsList .ge-row').length,2);
  assert.equal(d.getElementById('confirmModal').classList.contains('hidden'),true);
  w.League.removeGoalEventRow('goalEventsList',1);
  assert.equal(d.getElementById('matchGoals1').value,'1');
  d.querySelector('#goalEventsList .ge-minute').value='15';
  w.League.removeGoalEventRow('goalEventsList',0);
  assert.equal(d.getElementById('confirmModal').classList.contains('hidden'),false);
  w.League.closeConfirmModal();
  assert.equal(d.querySelector('#goalEventsList .ge-minute').value,'15');
  const leave = new w.Event('beforeunload',{cancelable:true}); w.dispatchEvent(leave);
  assert.equal(leave.defaultPrevented,true);
});

test('squad deletion has a cancellable confirmation and preserves the dialog on failure', async t => {
  const app = await mount('league/index.html', {profile:'Wael'}); t.after(() => app.close());
  const {window:w,document:d,client} = app;
  w.League.navigateTo('squads');
  client.db.squad_players.push({id:'unused',owner:'Wael',name:'Unused',position:'CF',lineup_role:'substitute',active:true});
  await w.League.refresh();
  w.League.requestDeleteSquadPlayer('unused');
  d.getElementById('confirmModal').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(d.getElementById('confirmModal').classList.contains('hidden'),true);
  assert.equal(client.calls.filter(c=>c.rpc==='delete_squad_player').length,0);
  w.League.requestDeleteSquadPlayer('unused'); client.fail='rpc';
  await d.getElementById('confirmYes').onclick();
  assert.equal(d.getElementById('confirmModal').classList.contains('hidden'),false);
  assert.ok(client.db.squad_players.some(p=>p.id==='unused'));
});

test('restored zero timestamps remain stable through refresh and destructive-scope review', async t => {
  const app = await mount('league/index.html', {profile:'Wael'}); t.after(() => app.close());
  const {window:w,document:d,client} = app;
  client.db.seasons[0].created=0; client.db.matches[0].timestamp=0;
  await w.League.refresh();
  const state=app.module('league/js/state.js').state;
  assert.equal(state.db.seasons[0].created,0);
  assert.equal(state.db.matches[0].timestamp,0);
  w.League.navigateTo('settings'); w.League.confirmResetSeason();
  d.getElementById('dangerConfirmInput').value='تصفير الموسم'; w.League.updateDangerConfirm();
  await w.League.executeDangerConfirm();
  assert.match(d.getElementById('dangerConfirmStatus').textContent,/بنجاح/);
  assert.equal(client.calls.filter(c=>c.table==='matches'&&c.operation==='delete').length,1);
});
