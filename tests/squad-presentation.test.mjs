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

test('pitch keeps left/right literal and midfield depth AMF then CMF then DMF',async t=>{
  const {document:d}=await setup(t);
  const left=d.querySelector('[data-pitch-position="LWF"]');
  const right=d.querySelector('[data-pitch-position="RWF"]');
  assert.ok(left);assert.ok(right);
  assert.ok(left.classList.contains('pitch-left'));
  assert.ok(right.classList.contains('pitch-right'));

  const mfRows=[...d.querySelectorAll('[data-squad-group="MF"] .roster-pitch-row')];
  assert.equal(mfRows.length,3);
  assert.ok(mfRows[0].querySelector('[data-pitch-position="AMF"]'));
  assert.ok(mfRows[1].querySelector('[data-pitch-position="CMF"]'));
  assert.ok(mfRows[2].querySelector('[data-pitch-position="DMF"]'));

  const defRow=d.querySelector('[data-squad-group="DF"] .roster-pitch-row');
  assert.ok(defRow.children[0].matches('[data-pitch-position="LB"]'));
  assert.ok(defRow.children[1].matches('[data-pitch-position="CB"]'));
  assert.ok(defRow.children[2].matches('[data-pitch-position="RB"]'));
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

test('legacy archived player must choose a detailed position before restore',async t=>{
  const {window:w,document:d,client}=await setup(t);
  client.db.squad_players.push({id:'legacy-archived',owner:'Wael',name:'مؤرشف قديم',position:'UNK',lineup_role:'substitute',active:false});
  await w.League.refresh();
  w.League.toggleSquadPlayer('legacy-archived');
  assert.equal(client.db.squad_players.find(p=>p.id==='legacy-archived').active,false);
  assert.equal(d.getElementById('squadPlayerModal').classList.contains('hidden'),false);
  assert.equal(d.getElementById('squadPlayerPosition').value,'CF');
  assert.match(d.getElementById('toast').textContent,/حدّد مركز/);
  w.League.closeSquadPlayer();
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

test('unknown legacy positions and duplicate input retain field/list identity parity',async t=>{
  const app=await setup(t),{window:w,document:d,client}=app;
  client.db.squad_players.push(
    {id:'unknown-starter',owner:'Wael',name:'مركز قديم',position:'UNKNOWN',active:true,lineup_role:'starter'},
    {id:'unknown-reserve',owner:'Wael',name:'احتياط قديم',position:null,active:true,lineup_role:'substitute'}
  );
  client.db.squad_players.push({...client.db.squad_players[0]});
  await w.League.refresh();
  const pitch=ids(d);assert.equal(pitch.length,27);assert.equal(new Set(pitch).size,27);
  assert.ok(d.querySelector('[data-squad-group="UNK"] [data-squad-player="unknown-starter"]'));
  w.League.setSquadView('list');assert.deepEqual(ids(d).sort(),pitch.sort());
  d.getElementById('squadPositionFilter').value='UNK';w.League.filterSquad();assert.equal(ids(d).length,2);
});

test('an unavailable unchanged photo never blocks editing a player',async t=>{
  const {window:w,document:d,client}=await setup(t);
  client.db.squad_players[0].photo_url='https://images.example.test/offline.webp';
  client.db.squad_players[0].photo_path='unchanged-managed-path';await w.League.refresh();
  let verifications=0;w.Image=class {constructor(){verifications++;throw new Error('offline');}};
  w.League.openSquadPlayer('Wael','qa-roster-0');d.getElementById('squadPlayerRating').value='106';
  await w.League.saveSquadPlayer();
  assert.equal(client.db.squad_players[0].rating,106);assert.equal(verifications,0);
  assert.equal(client.db.squad_players[0].photo_path,'unchanged-managed-path');
  assert.equal(d.getElementById('squadPlayerModal').classList.contains('hidden'),true);
});

test('an archived former starter remains editable when the active XI is full',async t=>{
  const {window:w,document:d,client}=await setup(t);
  client.db.squad_players.push({id:'archived-starter',owner:'Wael',name:'أساسي سابق',position:'GK',active:false,lineup_role:'starter'});
  await w.League.refresh();w.League.openSquadPlayer('Wael','archived-starter');
  d.getElementById('squadPlayerName').value='اسم مؤرشف معدل';await w.League.saveSquadPlayer();
  const saved=client.db.squad_players.find(p=>p.id==='archived-starter');assert.equal(saved.name,'اسم مؤرشف معدل');assert.equal(saved.active,false);
  assert.equal(client.db.squad_players.filter(p=>p.active&&p.lineup_role==='starter').length,11);
});

function preparePhoto(app) {
  const {window:w,document:d}=app;
  w.URL.createObjectURL=()=> 'blob:qa-photo';w.URL.revokeObjectURL=()=>{};
  w.createImageBitmap=async()=>({width:4,height:4,close(){}});
  w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
  w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new w.Blob(['compressed'],{type:'image/webp'}));};
  w.League.openSquadPlayer('Wael');d.getElementById('squadPlayerName').value='صورة استجابة مفقودة';
  d.getElementById('squadPlayerRole').value='substitute';
  w.League.selectSquadPhoto({target:{files:[new w.File(['image'],'photo.png',{type:'image/png'})]}});
}

test('lost insert response and failed read reuse one player and upload on retry',async t=>{
  const app=await setup(t),{window:w,document:d,client}=app;preparePhoto(app);
  let lost=false;
  client.after=async({table,operation})=>{
    if(table==='squad_players'&&operation==='insert'&&!lost){lost=true;client.fail='squad_players';throw new Error('Failed to fetch');}
  };
  await w.League.saveSquadPlayer();assert.equal(d.getElementById('squadPlayerModal').classList.contains('hidden'),false);
  const saved=client.db.squad_players.find(p=>p.name==='صورة استجابة مفقودة');assert.ok(saved.photo_path);
  client.fail=null;await w.League.refresh();await w.League.saveSquadPlayer();
  assert.equal(d.getElementById('squadPlayerModal').classList.contains('hidden'),true);
  assert.equal(client.db.squad_players.filter(p=>p.name===saved.name).length,1);
  assert.equal(client.calls.filter(c=>c.storage==='upload').length,1);
  assert.equal(client.calls.filter(c=>c.table==='squad_players'&&c.operation==='insert').length,1);
  assert.equal(client.calls.filter(c=>c.storage==='remove').length,0);
  assert.equal(client.db.squad_players.find(p=>p.id===saved.id).photo_url,saved.photo_url);
});

test('cancel after an unconfirmed save preserves the potentially referenced photo',async t=>{
  const app=await setup(t),{window:w,client}=app;preparePhoto(app);
  client.after=async({table,operation})=>{
    if(table==='squad_players'&&operation==='insert'){client.fail='squad_players';throw new Error('Failed to fetch');}
  };
  await w.League.saveSquadPlayer();w.League.closeSquadPlayer();
  assert.equal(client.calls.filter(c=>c.storage==='remove').length,0);
  assert.ok(client.db.squad_players.find(p=>p.name==='صورة استجابة مفقودة').photo_path);
});

test('logout during photo upload cannot submit or reopen an old squad editor',async t=>{
  const app=await setup(t),{window:w,document:d,client}=app;preparePhoto(app);
  const from=client.storage.from;let release,started;
  const uploading=new Promise(resolve=>{started=resolve;});
  client.storage.from=bucket=>{
    const storage=from(bucket),upload=storage.upload;
    storage.upload=async(...args)=>{started();await new Promise(resolve=>{release=resolve;});return upload(...args);};return storage;
  };
  const saving=w.League.saveSquadPlayer();await uploading;
  app.module('league/js/auth-ui.js').clearSession();release();await saving;
  assert.equal(client.calls.filter(c=>c.table==='squad_players'&&c.operation==='insert').length,0);
  assert.equal(app.module('league/js/state.js').state.squadEditor,null);
  assert.equal(d.getElementById('squadPlayerModal').classList.contains('hidden'),true);
});

test('immutable photo upload retries return the same public URL and referenced photos survive cleanup',async t=>{
  const app=await setup(t),{window:w,client}=app;preparePhoto(app);
  const images=app.module('league/js/squad-images.js');
  const file=new w.File(['image'],'photo.png',{type:'image/png'});
  const first=await images.uploadSquadPhoto(client,file,'owner','member','object');
  const second=await images.uploadSquadPhoto(client,file,'owner','member','object');
  assert.equal(first.url,second.url);assert.equal(first.path,second.path);
  client.db.squad_players[0].photo_path=first.path;
  await images.removeUnusedSquadPhoto(client,first.path);assert.equal(client.calls.filter(c=>c.storage==='remove').length,0);
  client.db.squad_players[0].photo_path=null;client.fail='squad_players';
  await images.removeUnusedSquadPhoto(client,first.path);assert.equal(client.calls.filter(c=>c.storage==='remove').length,0);
  client.fail=null;await images.removeUnusedSquadPhoto(client,first.path);assert.equal(client.calls.filter(c=>c.storage==='remove').length,1);
});
