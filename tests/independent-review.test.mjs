import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, settle } from './helpers/dom.mjs';
import { ids } from './helpers/fixture.mjs';

test('a same-account token refresh preserves the reviewed admin confirmation', async t => {
  const app = await mount('league/index.html', { profile: 'Wael' });
  t.after(() => app.close());
  const { window: w, document: d, client } = app;
  w.League.navigateTo('settings');
  w.League.confirmResetSeason();
  client.emitAuth('TOKEN_REFRESHED');
  await settle();
  d.getElementById('dangerConfirmInput').value = 'تصفير الموسم';
  w.League.updateDangerConfirm();
  await w.League.executeDangerConfirm();
  assert.match(d.getElementById('dangerConfirmStatus').textContent, /بنجاح/);
  assert.equal(client.calls.filter(c => c.table === 'matches' && c.operation === 'delete').length, 1);
  assert.deepEqual(app.errors, []);
});

test('a same-account token refresh lets a committed squad save finish once', async t => {
  const app = await mount('league/index.html', { profile: 'Wael' });
  t.after(() => app.close());
  const { window: w, document: d, client } = app;
  w.League.navigateTo('squads');
  w.League.openSquadPlayer('Wael');
  d.getElementById('squadPlayerName').value = 'Refresh substitute';
  d.getElementById('squadPlayerRole').value = 'substitute';
  let release;
  client.hold = ({ table, operation }) => table === 'squad_players' && operation === 'insert'
    ? new Promise(resolve => { release = resolve; }) : undefined;
  const saving = w.League.saveSquadPlayer();
  await settle();
  try {
    assert.equal(typeof release, 'function');
    client.emitAuth('TOKEN_REFRESHED');
    await settle();
  } finally {
    release?.();
    await saving;
  }
  assert.equal(d.getElementById('squadPlayerModal').classList.contains('hidden'), true);
  assert.equal(app.module('league/js/state.js').state.db.squads.filter(p => p.name === 'Refresh substitute').length, 1);
  assert.equal(client.calls.filter(c => c.table === 'squad_players' && c.operation === 'insert').length, 1);
  assert.deepEqual(app.errors, []);
});

test('a previous account realtime request cannot block the next account updates', async t => {
  const app = await mount('league/index.html', { profile: 'Wael' });
  t.after(() => app.close());
  const { client } = app;
  const realtime = app.module('league/js/realtime.js');
  let release, held = false;
  client.after = ({ table }) => {
    if (table === 'matches' && !held) {
      held = true;
      return new Promise(resolve => { release = resolve; });
    }
  };
  const previous = realtime.refreshFromRemote();
  await settle();
  try {
    client.emitAuth('SIGNED_OUT', null);
    await settle();
    client.db.matches = [];
    client.db.match_goal_events = [];
    client.emitAuth('SIGNED_IN', 'Omar');
    await settle();
    const state = app.module('league/js/state.js').state;
    assert.equal(state.user, 'Omar');
    assert.equal(state.db.matches.length, 0);
    client.db.matches.push({ id: 'next-account-result', player1: 'Omar', player2: 'Wael', goals1: 1, goals2: 0, timestamp: 1 });
    await realtime.refreshFromRemote();
    assert.equal(state.db.matches.length, 1);
  } finally {
    release?.();
    await previous;
  }
  assert.deepEqual(app.errors, []);
});

test('a real role change invalidates a previously reviewed admin action', async t => {
  const app = await mount('league/index.html', { profile: 'Wael' });
  t.after(() => app.close());
  const { window: w, document: d, client } = app;
  w.League.navigateTo('settings');
  w.League.confirmResetAll();
  d.getElementById('dangerConfirmInput').value = 'تصفير البطولة';
  w.League.updateDangerConfirm();
  client.db.players.find(p => p.name === 'Wael').role = 'player';
  client.emitAuth('TOKEN_REFRESHED');
  await settle();
  await w.League.executeDangerConfirm();
  assert.equal(app.module('league/js/state.js').state.profile.role, 'player');
  assert.equal(d.getElementById('dangerConfirmModal').classList.contains('hidden'), true);
  assert.equal(client.calls.filter(c => c.rpc === 'restore_league_competition').length, 0);
  assert.deepEqual(app.errors, []);
});

test('same-account realtime events during a request trigger one fresh follow-up snapshot', async t => {
  const app = await mount('league/index.html', { profile: 'Wael' });
  t.after(() => app.close());
  const { client } = app;
  const realtime = app.module('league/js/realtime.js');
  const original = client.calls.filter(c => c.table === 'matches').length;
  let release, held = false;
  client.after = ({ table }) => {
    if (table === 'matches' && !held) {
      held = true;
      return new Promise(resolve => { release = resolve; });
    }
  };
  const pending = realtime.refreshFromRemote();
  await settle();
  try {
    client.db.matches.push({ ...client.db.matches[0], id: 'arrived-during-request' });
    await realtime.refreshFromRemote();
    await realtime.refreshFromRemote();
  } finally {
    release?.();
    await pending;
  }
  assert.equal(app.module('league/js/state.js').state.db.matches.length, 2);
  assert.equal(client.calls.filter(c => c.table === 'matches').length - original, 2);
  assert.deepEqual(app.errors, []);
});

for (const target of ['match', 'season']) test(`a failed ${target} deletion keeps the confirmation available for retry`, async t => {
  const app = await mount('league/index.html', { profile: 'Wael' });
  t.after(() => app.close());
  const { window: w, document: d, client } = app;
  w.League.navigateTo(target === 'match' ? 'matchHistory' : 'seasons');
  if (target === 'match') w.League.deleteMatch(ids.match);
  else w.League.deleteSeason(ids.season);
  client.fail = 'delete';
  await d.getElementById('confirmYes').onclick();
  assert.equal(d.getElementById('confirmModal').classList.contains('hidden'), false);
  assert.equal(client.db.matches.length, 1);
  assert.equal(client.db.seasons.length, 1);
  assert.equal(d.getElementById('confirmYes').disabled, false);
  client.fail = null;
  await d.getElementById('confirmYes').onclick();
  assert.equal(d.getElementById('confirmModal').classList.contains('hidden'), true);
  assert.equal(client.db[target === 'match' ? 'matches' : 'seasons'].length, 0);
  assert.deepEqual(app.errors, []);
});
