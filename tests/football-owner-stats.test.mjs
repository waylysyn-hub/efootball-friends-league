import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, settle } from './helpers/dom.mjs';
import { ids } from './helpers/fixture.mjs';

const striker = 'Zlatan Ibrahimović';
const maker = 'Ronaldinho';
const plain = value => JSON.parse(JSON.stringify(value));

test('same-name strikers and playmakers keep separate owner totals, appearances and averages', async t => {
  const app = await mount('league/index.html', { profile: 'Wael', overlappingSquads: true }); t.after(() => app.close());
  const state = app.module('league/js/state.js').state;
  const stats = app.window.League.computeFootballPlayerStats(ids.season);
  const totals = (name, owner) => { const p = stats.find(p => p.name === name && p.owner === owner); return [p.goals, p.assists, p.contributions, p.matches, p.gpg]; };
  assert.deepEqual(totals(striker, 'Wael'), [1, 0, 1, 1, 1]);
  assert.deepEqual(totals(striker, 'Mustafa'), [3, 0, 3, 1, 3]);
  assert.deepEqual(totals(maker, 'Wael'), [0, 1, 1, 1, 0]);
  assert.deepEqual(totals(maker, 'Mustafa'), [0, 2, 2, 1, 0]);
  assert.equal(stats.length, 4);
  assert.notEqual(app.window.League.fbPlayerKey(striker, 'Wael'), app.window.League.fbPlayerKey(striker, 'Mustafa'));
  assert.equal(app.window.League.fbPlayerKey(' Ronaldinho ', 'Wael'), app.window.League.fbPlayerKey('RONALDINHO', 'Wael'));
  assert.notEqual(app.window.League.fbPlayerKey('a::b', 'c'), app.window.League.fbPlayerKey('a', 'b::c'));
  const secondSeason = 'second-season';
  state.db.matches.push({id:'other-match',player1:'Wael',player2:'Omar',season:secondSeason});
  state.db.goalEvents.push({matchId:'other-match',owner:'Wael',scorer:'  Zlatan Ibrahimović  ',assist:maker,minute:20});
  // A footballer may score and assist in the same match; count that appearance once.
  state.db.goalEvents.push({matchId:'other-match',owner:'Wael',scorer:maker,assist:striker,minute:30});
  state.db.goalEvents.push({matchId:'missing-match',owner:'Wael',scorer:striker,assist:'',minute:0});
  const all = app.window.League.computeFootballPlayerStats('all');
  const wael = all.find(p => p.name === striker && p.owner === 'Wael');
  assert.deepEqual([wael.goals, wael.assists, wael.matches, wael.gpg], [2, 1, 2, 1]);
  assert.deepEqual(plain(app.window.League.computeFootballPlayerStats(ids.season)), plain(stats));
  assert.equal(app.window.League.computeFootballPlayerStats(secondSeason).length, 2);
  assert.equal(app.window.League.aggregateFootballPlayerStats([{owner:'',scorer:striker}]).length, 0);
});

test('rankings identify each owner and pointer/keyboard details stay scoped after filtering', async t => {
  const app = await mount('league/index.html', { profile: 'Wael', overlappingSquads: true }); t.after(() => app.close());
  const {window:w, document:d} = app;
  w.League.navigateTo('footballStats');
  const goals = [...d.querySelectorAll('[data-football-ranking="goals"] li')];
  assert.equal(goals.length, 2); assert.match(goals[0].textContent, /مصطفى/); assert.equal(goals[0].querySelector('.fb-lb-val').textContent, '3');
  assert.match(goals[1].textContent, /وائل/); assert.equal(goals[1].querySelector('.fb-lb-val').textContent, '1');
  const assists = [...d.querySelectorAll('[data-football-ranking="assists"] li')];
  assert.match(assists[0].textContent, /مصطفى/); assert.equal(assists[0].querySelector('.fb-lb-val').textContent, '2');
  const rows = [...d.querySelectorAll('[data-football-player]')];
  rows.find(row => row.dataset.footballPlayer === striker && row.dataset.footballOwner === 'Mustafa').querySelector('strong').click();
  assert.match(d.querySelector('#fbPlayerDetail .panel-header').textContent, /مصطفى/);
  assert.match(d.querySelector('.fb-detail-stats').textContent, /الأهداف: 3/);
  assert.equal(d.querySelectorAll('#fbPlayerDetail .fb-detail-list li').length, 3);
  const waelRow = rows.find(row => row.dataset.footballPlayer === striker && row.dataset.footballOwner === 'Wael');
  waelRow.dispatchEvent(new w.KeyboardEvent('keydown', {key:'Enter',bubbles:true}));
  assert.match(d.querySelector('#fbPlayerDetail .panel-header').textContent, /وائل/);
  assert.match(d.querySelector('.fb-detail-stats').textContent, /الأهداف: 1/);
  assert.equal(d.querySelectorAll('#fbPlayerDetail .fb-detail-list li').length, 1);
  d.getElementById('fbPlayerSearch').value = 'مصطفى'; w.League.renderFootballStats();
  assert.equal(d.querySelectorAll('[data-football-player]').length, 2);
  assert.ok(d.getElementById('fbPlayerDetail').classList.contains('hidden'));
  d.getElementById('fbPlayerSearch').value = ''; w.League.renderFootballStats();
  w.League.showFootballPlayerDetail(maker, 'Mustafa'); assert.match(d.querySelector('.fb-detail-stats').textContent, /التمريرات الحاسمة: 2/);
  app.client.db.match_goal_events[1].assist = ''; await w.League.refresh();
  assert.match(d.querySelector('.fb-detail-stats').textContent, /التمريرات الحاسمة: 1/);
  w.League.closeFootballPlayerDetail(); w.League.renderFootballStats(); assert.ok(d.getElementById('fbPlayerDetail').classList.contains('hidden'));
  w.League.showFootballPlayerDetail(striker); assert.ok(d.getElementById('fbPlayerDetail').classList.contains('hidden'), 'an owner is required for details');
  assert.deepEqual(app.errors, []);
});

test('match and season awards name the winning squad member and retain tied winners separately', async t => {
  const app = await mount('league/index.html', { profile: 'Wael', overlappingSquads: true }); t.after(() => app.close());
  const {window:w, document:d} = app;
  const awards = w.League.computeMatchAwards(ids.match);
  assert.deepEqual(plain(awards.filter(a => a.title === 'هداف المباراة').map(a => [a.player,a.owner,a.detail])), [[striker,'Mustafa','الأهداف: 3']]);
  assert.deepEqual(plain(awards.filter(a => a.title === 'أفضل صانع أهداف').map(a => [a.player,a.owner,a.detail])), [[maker,'Mustafa','التمريرات الحاسمة: 2']]);
  assert.equal(awards.filter(a => a.title === 'ثلاثية').length, 1);
  assert.match(w.League.matchAwardsHTML(ids.match), /مصطفى/);
  w.League.navigateTo('awards');
  assert.match(d.querySelector('[data-football-award="goals"]').textContent, /Zlatan Ibrahimović.*مصطفى/s);
  assert.equal(d.querySelector('[data-football-award="goals"] .award-desc').textContent, '3 هدف');
  assert.match(d.querySelector('[data-football-award="assists"]').textContent, /Ronaldinho.*مصطفى/s);
  assert.equal(d.querySelector('[data-football-award="assists"] .award-desc').textContent, '2 أسيست');
  app.client.db.match_goal_events = app.client.db.match_goal_events.slice(0, 2); await w.League.refresh();
  for (const metric of ['goals','assists']) {
    assert.equal(d.querySelectorAll(`[data-football-award="${metric}"] .award-winner`).length, 2);
    assert.match(d.querySelector(`[data-football-award="${metric}"]`).textContent, /وائل/);
    assert.match(d.querySelector(`[data-football-award="${metric}"]`).textContent, /مصطفى/);
  }
  const split = [
    {owner:'Wael',scorer:striker,assist:''}, {owner:'Mustafa',scorer:striker,assist:''},
    {owner:'Mustafa',scorer:striker,assist:''}, {owner:'Mustafa',scorer:maker,assist:''},
  ];
  const splitAwards = w.League.computeMatchAwards(null, split);
  assert.equal(splitAwards.some(a => a.title === 'ثلاثية'), false, 'neither matching names nor different teammates combine for a hat trick');
  assert.equal(splitAwards.some(a => a.title === 'أفضل صانع أهداف'), false);
  assert.deepEqual(app.errors, []);
});

test('football names remain escaped and season changes cannot show stale details or awards', async t => {
  const app = await mount('league/index.html', { profile:'Wael', overlappingSquads:true }); t.after(() => app.close());
  const state = app.module('league/js/state.js').state;
  const name = '<img src=x onerror=alert(1)>';
  state.db.goalEvents[0].scorer = name;
  state.db.seasons.push({id:'empty-season',name:'موسم آخر',active:false,created:2});
  app.window.League.navigateTo('footballStats'); app.window.League.showFootballPlayerDetail(name, 'Wael');
  assert.equal(app.document.querySelectorAll('#fbLeaderboards img, #fbStatsTable img, #fbPlayerDetail img').length, 0);
  app.document.getElementById('fbStatsSeasonFilter').value = 'empty-season'; app.window.League.renderFootballStats();
  assert.equal(app.document.querySelectorAll('[data-football-player]').length, 0);
  assert.ok(app.document.getElementById('fbPlayerDetail').classList.contains('hidden'));
  app.window.League.navigateTo('awards');
  app.document.getElementById('awardsSeasonFilter').value = 'empty-season'; app.window.League.renderAwards();
  for (const metric of ['goals','assists']) assert.equal(app.document.querySelector(`[data-football-award="${metric}"] .award-winner`).textContent, '—');
  assert.deepEqual(app.errors, []);
});

test('public hub also keeps same-name scorers separate for event and legacy statistics', async t => {
  const app = await mount('index.html', { overlappingSquads:true }); t.after(() => app.close());
  const assertOwners = () => {
    const rows = [...app.document.querySelectorAll('.hub-scorer-item')];
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(row => [row.querySelector('.hub-scorer-name').textContent,row.querySelector('.hub-scorer-team').textContent,row.querySelector('.hub-scorer-goals').textContent]), [[striker,'مصطفى','3'],[striker,'وائل','1']]);
  };
  assertOwners();
  app.client.db.match_goal_events = [];
  app.client.db.match_stats = [{match_id:ids.match,player:'Wael',character_name:striker,goals:1,assists:0},{match_id:ids.match,player:'Mustafa',character_name:striker,goals:3,assists:0}];
  app.document.getElementById('retryHub').click(); await settle(); assertOwners();
  assert.deepEqual(app.errors, []);
});
