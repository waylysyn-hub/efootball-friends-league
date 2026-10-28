import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, settle } from './helpers/dom.mjs';
import { ids } from './helpers/fixture.mjs';
const writes = c => c.calls.filter(x => x.rpc === 'restore_league_competition' || x.operation === 'delete');
const setup = async t => { const app = await mount('league/index.html', { profile: 'Wael' }); t.after(() => app.close()); app.window.League.navigateTo('settings'); return app; };
function type(d,w,text) { d.getElementById('dangerConfirmInput').value = text; w.League.updateDangerConfirm(); }

test('settings scope and exact confirmation gate destructive calls; double submit is coalesced', async t => {
  const {document:d,window:w,client:c,errors} = await setup(t);
  assert.equal(d.getElementById('page-settings').textContent.includes('\\n'),false);
  assert.equal(d.querySelectorAll('.settings-danger .btn-danger').length,2);
  w.League.confirmResetSeason();
  assert.match(d.getElementById('dangerConfirmScope').textContent,/الموسم 01/);
  assert.match(d.getElementById('dangerConfirmScope').textContent,/المباريات1/);
  for (const text of ['', 'تصفير', 'تصفير البطولة']) {
    type(d,w,text); assert.equal(d.getElementById('dangerConfirmExecute').disabled,true);
    await w.League.executeDangerConfirm(); assert.equal(writes(c).length,0);
  }
  let release, started;
  const atWrite = new Promise(r => started = r);
  c.hold = ({operation}) => operation === 'delete' ? new Promise(r => { release=r; started(); }) : undefined;
  type(d,w,'تصفير الموسم'); const operation=w.League.executeDangerConfirm(); await atWrite;
  assert.equal(d.getElementById('dangerConfirmExecute').disabled,true);
  assert.equal(d.getElementById('dangerConfirmInput').disabled,true);
  w.League.closeDangerConfirm(); assert.equal(d.getElementById('dangerConfirmModal').classList.contains('hidden'),false);
  await w.League.executeDangerConfirm(); assert.equal(writes(c).length,1);
  release(); await operation;
  assert.match(d.getElementById('dangerConfirmStatus').textContent,/بنجاح/);
  assert.equal(d.getElementById('dangerConfirmStatus').getAttribute('role'),'status');
  assert.equal(d.getElementById('dangerConfirmExecute').disabled,true);
  await w.League.executeDangerConfirm(); assert.equal(writes(c).length,1);
  assert.equal(c.db.seasons.length,1); assert.equal(c.db.players.length,6);
  w.League.closeDangerConfirm(); assert.deepEqual(errors,[]);
});

test('changed scope forces a new review and session downgrade prevents destructive execution', async t => {
  const {document:d,window:w,client:c} = await setup(t);
  w.League.confirmResetAll(); type(d,w,'تصفير البطولة');
  c.db.matches.push({...c.db.matches[0],id:'new-match'});
  await w.League.executeDangerConfirm();
  assert.equal(writes(c).length,0); assert.match(d.getElementById('dangerConfirmStatus').textContent,/تغيّرت البيانات/);
  assert.equal(d.getElementById('dangerConfirmInput').value,'');
  assert.equal(d.getElementById('dangerConfirmExecute').disabled,true);
  type(d,w,'تصفير البطولة'); c.emitAuth('SIGNED_IN','Omar'); await settle();
  await w.League.executeDangerConfirm(); assert.equal(writes(c).length,0);
  w.League.navigateTo('settings'); assert.match(d.getElementById('settingsPermission').textContent,/متاحة للمدير فقط/);
});

test('restore confirms its exact incoming data, preserves selection on error, and cannot repeat success', async t => {
  const app=await setup(t), {document:d,window:w,client:c}=app;
  const backup={seasons:[{id:ids.season,name:'نسخة اختبار',active:true}],matches:[],goalEvents:[],matchStats:[]};
  const file={size:300,text:async()=>JSON.stringify(backup)};
  Object.defineProperty(d.getElementById('importFile'),'files',{value:[file],configurable:true});
  w.League.selectImportFile(); await w.League.importData();
  assert.equal(writes(c).length,0);
  assert.match(d.getElementById('dangerConfirmScope').textContent,/النسخة المختارة تحتوي على 1 موسم و0 مباراة/);
  type(d,w,'استيراد النسخة'); c.fail='rpc'; await w.League.executeDangerConfirm();
  assert.equal(d.getElementById('importFile').files[0],file);
  assert.equal(d.getElementById('dangerConfirmStatus').getAttribute('role'),'alert');
  assert.equal(d.getElementById('dangerConfirmExecute').disabled,false);
  c.fail=null; await w.League.executeDangerConfirm(); await w.League.executeDangerConfirm();
  assert.equal(c.calls.filter(x=>x.rpc==='restore_league_competition').length,2);
  assert.equal(c.calls.filter(x=>x.rpc==='restore_league_competition').at(-1).args.backup.seasons[0].name,'نسخة اختبار');
  assert.equal(d.getElementById('dangerConfirmExecute').disabled,true);
});

test('failed import validation and export expose inline alert and recovery states', async t => {
  const {document:d,window:w,client:c}=await setup(t);
  const file={size:5,text:async()=>'{bad'};
  Object.defineProperty(d.getElementById('importFile'),'files',{value:[file],configurable:true});
  await w.League.importData(); assert.equal(d.getElementById('importStatus').getAttribute('role'),'alert');
  assert.equal(d.getElementById('importFile').files[0],file); assert.equal(writes(c).length,0);
  c.fail='matches'; await w.League.exportData(); assert.equal(d.getElementById('exportStatus').getAttribute('role'),'alert');
  c.fail=null; w.URL.createObjectURL=()=> 'blob:fixture-backup'; w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=()=>{};
  await w.League.exportData(); assert.match(d.getElementById('exportStatus').textContent,/بنجاح/);
  assert.equal(d.getElementById('exportDataButton').disabled,false);
});

test('reset cancellation and nested dialog Escape preserve drafts and restore first-field focus', async t => {
  const {document:d,window:w}=await setup(t);
  w.League.navigateTo('recordMatch');
  assert.equal(d.querySelector('label[for=matchPlayer1]').textContent,'اللاعب الأول');
  d.getElementById('matchPlayer1').value='Wael'; w.League.onMatchEntryChange('match');
  d.getElementById('newMatchButton').focus(); w.League.clearMatchForm();
  assert.equal(d.getElementById('confirmCancel').textContent,'متابعة التعديل');
  w.League.closeConfirmModal(); assert.equal(d.getElementById('matchPlayer1').value,'Wael');
  w.League.clearMatchForm(); await d.getElementById('confirmYes').onclick();
  assert.equal(d.getElementById('matchPlayer1').value,''); assert.equal(d.activeElement.id,'matchPlayer1');
  w.League.openEditModal(ids.match); d.getElementById('editGoals1').value='5'; w.League.onMatchEntryChange('edit');
  w.League.closeEditModal(); d.getElementById('confirmCancel').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(d.getElementById('confirmModal').classList.contains('hidden'),true);
  assert.equal(d.getElementById('editMatchModal').classList.contains('hidden'),false);
  assert.equal(d.getElementById('editGoals1').value,'5');
});

test('loading/error states cover all data pages and keep the snapshot and form inputs on retry', async t => {
  const app=await setup(t), {document:d,window:w,client:c}=app;
  w.League.navigateTo('recordMatch'); d.getElementById('matchGoals1').value='7';
  let release; c.hold=({table})=>table==='matches'?new Promise(r=>release=r):undefined;
  const pending=w.League.refresh(); await settle();
  for(const page of d.querySelectorAll('.page:not(#page-settings)')) {
    assert.equal(page.getAttribute('aria-busy'),'true'); assert.match(page.querySelector('.page-data-status').textContent,/جارٍ تحميل البيانات/);
  }
  c.fail='matches'; release(); await pending;
  assert.equal(d.getElementById('matchGoals1').value,'7');
  assert.equal(app.module('league/js/state.js').state.db.matches.length,1);
  assert.equal(d.querySelector('#page-recordMatch .page-data-status [role=alert]').textContent.includes('إعادة المحاولة'),true);
  c.hold=null;c.fail=null;await w.League.refresh();
  assert.equal(d.getElementById('matchGoals1').value,'7');
  assert.equal(d.querySelector('#page-recordMatch .page-data-status').hidden,true);
});

test('empty/filter states distinguish no results from true zero and expose recovery actions', async t => {
  const app=await setup(t), {document:d,window:w}=app, state=app.module('league/js/state.js').state;
  w.League.navigateTo('matchHistory'); d.getElementById('historySearch').value='لا يوجد';w.League.renderHistory();
  assert.match(d.getElementById('matchList').textContent,/لا توجد مباريات مطابقة/);
  w.League.clearHistoryFilters();assert.equal(d.querySelectorAll('.match-card').length,1);
  state.db.matches=[];state.db.goalEvents=[];state.db.achievements=[];
  for(const page of ['dashboard','matchHistory','leagueTable','statistics','footballStats','awards','rivalries','achievements','playerProfile']) {
    w.League.navigateTo(page); assert.ok(d.querySelector('#page-'+page+' .view-state'),page);
    assert.ok(!d.querySelector('#page-'+page).textContent.includes('\\n'),page);
  }
  assert.equal(d.getElementById('sc-matches-val').textContent,'0');
  assert.equal(d.querySelectorAll('#leagueTableBody tr').length,6);
  assert.deepEqual(app.errors,[]);
});

test('field validation links errors and focuses the invalid field', async t => {
  const {document:d,window:w}=await setup(t);
  w.League.navigateTo('seasons');await w.League.createSeason();
  assert.equal(d.activeElement.id,'newSeasonName');assert.equal(d.activeElement.getAttribute('aria-invalid'),'true');
  w.League.navigateTo('squads');w.League.openSquadPlayer();await w.League.saveSquadPlayer();
  assert.equal(d.activeElement.id,'squadPlayerName');assert.match(d.activeElement.getAttribute('aria-describedby'),/squadPlayerNameError/);
});
