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
test('pitch and list share all 25 identities, grouped counts and optional rating summary',async t=>{
  const {window:w,document:d}=await setup(t);
  const pitch=ids(d);assert.equal(pitch.length,25);assert.equal(new Set(pitch).size,25);
  for(const [key,count] of Object.entries({GK:1,DF:9,MF:8,FW:6,UNK:1})) {
    assert.equal(d.querySelector(`[data-squad-stat="${key}"] strong`).textContent,String(count));
  }
  assert.equal(d.querySelector('[data-squad-stat="substitute"] strong').textContent,'2');
  assert.equal(d.querySelectorAll('#squadPlayers [data-squad-role="substitute"]').length,2);
  assert.match(d.getElementById('squadUpdated').textContent,/2026/);
  assert.ok(d.querySelector('[data-squad-stat="rating"]'));
  assert.equal(d.querySelector('#squadPlayers table'),null);
  w.League.setSquadView('list');assert.deepEqual(ids(d).sort(),pitch.sort());
  assert.equal(d.getElementById('squadView-list').getAttribute('aria-pressed'),'true');
});
test('two keepers, missing/unknown positions and duplicate fetched IDs stay complete and unique',async t=>{
  const app=await setup(t),{window:w,document:d,client}=app;
  client.db.squad_players.push({...client.db.squad_players[0]}, {id:'second-gk',owner:'Wael',name:'حارس ثان',position:'GK',lineup_role:'substitute',active:true},
    {id:'missing-position',owner:'Wael',name:'بلا مركز',position:null,active:true});
  await w.League.refresh();assert.equal(ids(d).length,27);assert.equal(new Set(ids(d)).size,27);
  assert.equal(d.querySelectorAll('[data-squad-player].position-GK').length,2);
  assert.equal(d.querySelector('[data-squad-player="second-gk"]').dataset.squadRole,'substitute');
  assert.equal(d.querySelectorAll('[data-squad-group="UNK"] [data-squad-player]').length,2);
  w.League.setSquadView('list');assert.equal(ids(d).length,27);
});
test('search, position filter, global name/rating order and view switches remain synchronized',async t=>{
  const {window:w,document:d}=await setup(t);
  d.getElementById('squadSearch').value='إبراهيموفيتش';w.League.filterSquad();assert.equal(ids(d).length,1);
  const found=ids(d);w.League.setSquadView('list');assert.deepEqual(ids(d),found);
  d.getElementById('squadSearch').value='';d.getElementById('squadPositionFilter').value='GK';w.League.filterSquad();assert.deepEqual(ids(d),['qa-roster-0']);
  d.getElementById('squadPositionFilter').value='';d.getElementById('squadSort').value='rating';w.League.filterSquad();
  const ratings=[...d.querySelectorAll('#squadPlayers .roster-player')].map(p=>Number(p.querySelector('.roster-rating bdi')?.textContent??-1));
  assert.deepEqual(ratings,[...ratings].sort((a,b)=>b-a));
  d.getElementById('squadSort').value='name';w.League.filterSquad();
  const names=[...d.querySelectorAll('#squadPlayers .roster-player-copy strong')].map(el=>el.textContent);
  assert.deepEqual(names,[...names].sort(new Intl.Collator('ar',{numeric:true,sensitivity:'base'}).compare));
  w.League.selectSquad('Omar');assert.match(d.getElementById('squadPlayers').textContent,/لم تتم إضافة لاعبين بعد/);
});
test('editor moves a player, keeps metadata on refetch and archives without touching past matches',async t=>{
  const {window:w,document:d,client}=await setup(t);
  const matches=JSON.stringify(client.db.matches),events=JSON.stringify(client.db.match_goal_events);
  w.League.editSquad();w.League.openSquadPlayer('Wael','qa-roster-1');
  d.getElementById('squadPlayerPosition').value='GK';d.getElementById('squadPlayerRole').value='substitute';d.getElementById('squadPlayerNumber').value='99';d.getElementById('squadPlayerRating').value='103.5';
  await w.League.saveSquadPlayer();await w.League.refresh();
  assert.equal(d.querySelectorAll('[data-squad-player].position-GK').length,2);
  assert.equal(d.querySelectorAll('[data-squad-group="DF"] [data-squad-player]').length,8);
  assert.equal(client.db.squad_players.find(p=>p.id==='qa-roster-1').rating,103.5);
  assert.equal(client.db.squad_players.find(p=>p.id==='qa-roster-1').lineup_role,'substitute');
  assert.ok(client.db.squad_players.find(p=>p.id==='qa-roster-1').updated_at);
  await w.League.toggleSquadPlayer('qa-roster-1',d.querySelector('[data-squad-toggle="qa-roster-1"]'));
  assert.ok(!ids(d).includes('qa-roster-1'));assert.equal(d.querySelectorAll('#squadArchivePlayers [data-squad-player="qa-roster-1"]').length,1);
  w.League.setSquadView('list');assert.ok(!ids(d).includes('qa-roster-1'));
  assert.equal(JSON.stringify(client.db.matches),matches);assert.equal(JSON.stringify(client.db.match_goal_events),events);
});
test('unknown position can be saved, duplicate names and unsafe photos cannot be saved, missing images fall back',async t=>{
  const app=await setup(t),{window:w,document:d,client}=app;
  w.League.openSquadPlayer('Wael');d.getElementById('squadPlayerName').value='لاعب جديد';d.getElementById('squadPlayerPosition').value='UNK';await w.League.saveSquadPlayer();
  assert.equal(client.db.squad_players.at(-1).position,'UNK');
  const before=client.db.squad_players.length;w.League.openSquadPlayer('Wael');d.getElementById('squadPlayerName').value='لاعب جديد';await w.League.saveSquadPlayer();
  assert.match(d.getElementById('squadPlayerError').textContent,/موجود/);assert.equal(client.db.squad_players.length,before);
  d.getElementById('squadPlayerName').value='صورة خاطئة';d.getElementById('squadPlayerPhoto').value='javascript:alert(1)';await w.League.saveSquadPlayer();assert.equal(client.db.squad_players.length,before);
  const view=app.module('league/js/squad-view.js');assert.equal(view.safeSquadPhoto('https://user:secret@example.test/a.png'),'');
  const images=app.module('league/js/squad-images.js');
  assert.equal(images.normalizeExternalSquadPhotoUrl('https://share.google/example'),'');
  assert.equal(
    images.normalizeExternalSquadPhotoUrl('https://www.google.com/imgres?imgurl=https%3A%2F%2Fcdn.example.test%2Fplayer.jpg&imgrefurl=https%3A%2F%2Fexample.test'),
    'https://cdn.example.test/player.jpg'
  );
  client.db.squad_players[0].photo_url='https://example.test/missing.png';await w.League.refresh();
  const image=d.querySelector('#squadPlayers img');assert.ok(image);assert.ok(!image.parentElement.classList.contains('has-photo'));image.dispatchEvent(new w.Event('error'));
  assert.equal(d.querySelector('#squadPlayers img'),null);assert.ok(d.querySelector('.roster-avatar span').textContent);
  assert.deepEqual(app.errors,[]);
});
