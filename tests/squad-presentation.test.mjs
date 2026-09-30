import test from 'node:test';
import assert from 'node:assert/strict';
import { mount } from './helpers/dom.mjs';
import { presentationSquad } from './helpers/squad-fixture.mjs';

async function setup(t) {
  const app=await mount('league/index.html',{profile:'Wael'});t.after(()=>app.close());
  app.client.db.squad_players=presentationSquad();await app.window.League.refresh();app.window.League.navigateTo('squads');
  return app;
}
const ids=d=>[...d.querySelectorAll('#squadPlayers [data-squad-player]')].map(p=>p.dataset.squadPlayer);

test('eFootball pitch keeps all identities and exactly eleven starters',async t=>{
  const {window:w,document:d}=await setup(t);
  const pitch=ids(d);assert.equal(pitch.length,25);assert.equal(new Set(pitch).size,25);
  for(const [key,count] of Object.entries({GK:2,DF:7,MF:8,FW:8})) {
    assert.equal(d.querySelector(`[data-squad-stat="${key}"] strong`).textContent,String(count));
  }
  assert.equal(d.querySelector('[data-squad-stat="starter"] strong').textContent,'11/11');
  assert.equal(d.querySelector('[data-squad-stat="substitute"] strong').textContent,'14');
  assert.equal(d.querySelectorAll('#squadPlayers [data-squad-role="starter"]').length,11);
  assert.equal(d.querySelectorAll('#squadPlayers [data-squad-role="substitute"]').length,14);
  assert.match(d.getElementById('squadLineupStatus').textContent,/11\/11/);
  assert.ok(d.getElementById('squadLineupStatus').classList.contains('is-complete'));
  assert.match(d.getElementById('squadUpdated').textContent,/2026/);
  w.League.setSquadView('list');assert.deepEqual(ids(d).sort(),pitch.sort());
});

test('detailed PES positions render and filter by exact code',async t=>{
  const {window:w,document:d}=await setup(t);
  assert.equal(d.querySelector('[data-squad-player="qa-roster-1"]').dataset.squadPosition,'LB');
  assert.match(d.querySelector('[data-squad-player="qa-roster-1"] .roster-player-position').textContent,/LB/);
  assert.equal(d.querySelector('[data-squad-player="qa-roster-7"]').dataset.squadPosition,'AMF');
  d.getElementById('squadPositionFilter').value='RB';w.League.filterSquad();
  assert.deepEqual(ids(d).sort(),['qa-roster-14','qa-roster-4']);
  d.getElementById('squadPositionFilter').value='';d.getElementById('squadSearch').value='إبراهيموفيتش';w.League.filterSquad();
  assert.deepEqual(ids(d),['qa-roster-9']);
});

test('a twelfth starter is rejected until a starter becomes substitute',async t=>{
  const {window:w,document:d,client}=await setup(t);
  const before=client.db.squad_players.length;
  w.League.openSquadPlayer('Wael');
  d.getElementById('squadPlayerName').value='الأساسي الثاني عشر';
  d.getElementById('squadPlayerPosition').value='CF';
  d.getElementById('squadPlayerRole').value='starter';
  await w.League.saveSquadPlayer();
  assert.match(d.getElementById('squadPlayerError').textContent,/11\/11/);
  assert.equal(client.db.squad_players.length,before);

  w.League.closeSquadPlayer();
  w.League.openSquadPlayer('Wael','qa-roster-10');
  d.getElementById('squadPlayerRole').value='substitute';
  await w.League.saveSquadPlayer();
  assert.equal(client.db.squad_players.filter(p=>p.active&&p.lineup_role==='starter').length,10);

  w.League.openSquadPlayer('Wael');
  d.getElementById('squadPlayerName').value='أساسي بديل';
  d.getElementById('squadPlayerPosition').value='SS';
  d.getElementById('squadPlayerRole').value='starter';
  await w.League.saveSquadPlayer();
  assert.equal(client.db.squad_players.filter(p=>p.active&&p.lineup_role==='starter').length,11);
  assert.ok(d.getElementById('squadLineupStatus').classList.contains('is-complete'));
});

test('editor changes detailed position and archive keeps historical match data untouched',async t=>{
  const {window:w,document:d,client}=await setup(t);
  const matches=JSON.stringify(client.db.matches),events=JSON.stringify(client.db.match_goal_events);
  w.League.editSquad();w.League.openSquadPlayer('Wael','qa-roster-1');
  d.getElementById('squadPlayerPosition').value='GK';
  d.getElementById('squadPlayerRole').value='substitute';
  d.getElementById('squadPlayerNumber').value='99';
  d.getElementById('squadPlayerRating').value='103.5';
  await w.League.saveSquadPlayer();await w.League.refresh();
  assert.equal(d.querySelector('[data-squad-player="qa-roster-1"]').dataset.squadPosition,'GK');
  assert.equal(client.db.squad_players.find(p=>p.id==='qa-roster-1').lineup_role,'substitute');
  assert.equal(client.db.squad_players.find(p=>p.id==='qa-roster-1').rating,103.5);
  assert.match(d.getElementById('squadLineupStatus').textContent,/10\/11/);
  await w.League.toggleSquadPlayer('qa-roster-1',d.querySelector('[data-squad-toggle="qa-roster-1"]'));
  assert.ok(!ids(d).includes('qa-roster-1'));
  assert.equal(d.querySelectorAll('#squadArchivePlayers [data-squad-player="qa-roster-1"]').length,1);
  assert.equal(JSON.stringify(client.db.matches),matches);assert.equal(JSON.stringify(client.db.match_goal_events),events);
});

test('safe delete removes unused players and refuses historical scorer or assist rows',async t=>{
  const {window:w,document:d,client}=await setup(t);
  client.db.squad_players.push(
    {id:'unused-delete',owner:'Wael',name:'قابل للحذف',position:'SS',lineup_role:'substitute',active:true},
    {id:'history-delete',owner:'Wael',name:'له سجل',position:'CF',lineup_role:'substitute',active:true}
  );
  client.db.match_goal_events.push({id:'history-event',match_id:'fixture-history',owner:'Wael',scorer:'له سجل',scorer_id:'history-delete',assist:'',assist_id:null,minute:1,sort_order:0});
  await w.League.refresh();

  w.League.requestDeleteSquadPlayer('unused-delete');
  await d.getElementById('confirmYes').onclick();
  assert.equal(client.db.squad_players.some(p=>p.id==='unused-delete'),false);

  w.League.requestDeleteSquadPlayer('history-delete');
  await d.getElementById('confirmYes').onclick();
  assert.equal(client.db.squad_players.some(p=>p.id==='history-delete'),true);
  assert.match(d.getElementById('toast').textContent,/لا يمكن حذف/);
});

test('unsafe photos are rejected and broken images fall back to initials',async t=>{
  const app=await setup(t),{window:w,document:d,client}=app;
  const before=client.db.squad_players.length;
  w.League.openSquadPlayer('Wael');
  d.getElementById('squadPlayerName').value='صورة خاطئة';
  d.getElementById('squadPlayerPosition').value='CF';
  d.getElementById('squadPlayerRole').value='substitute';
  d.getElementById('squadPlayerPhoto').value='javascript:alert(1)';
  await w.League.saveSquadPlayer();assert.equal(client.db.squad_players.length,before);
  const view=app.module('league/js/squad-view.js');assert.equal(view.safeSquadPhoto('https://user:secret@example.test/a.png'),'');
  const images=app.module('league/js/squad-images.js');
  assert.equal(images.normalizeExternalSquadPhotoUrl('https://share.google/example'),'');
  client.db.squad_players[0].photo_url='https://example.test/missing.png';await w.League.refresh();
  const image=d.querySelector('#squadPlayers img');assert.ok(image);image.dispatchEvent(new w.Event('error'));
  assert.equal(d.querySelector('#squadPlayers img'),null);assert.ok(d.querySelector('.roster-avatar span').textContent);
  assert.deepEqual(app.errors,[]);
});
