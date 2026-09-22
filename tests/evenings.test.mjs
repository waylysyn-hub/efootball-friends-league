import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, settle } from './helpers/dom.mjs';
import { players, ids } from './helpers/fixture.mjs';

function select(app, names) {
  for (const input of app.document.querySelectorAll('[name="eveningAttendee"]')) {
    input.checked = names.includes(input.value);
    input.dispatchEvent(new app.window.Event('change', { bubbles: true }));
  }
}

test('admin attendance draft survives refresh, odd draw persists and prefills canonical match values', async t => {
  const app = await mount('league/index.html', { profile: 'Wael' }); t.after(() => app.close());
  const { window, document, client } = app;
  window.League.navigateTo('evenings');
  assert.equal(document.getElementById('drawEveningButton').disabled, true);
  select(app, ['Wael', 'Omar', 'Mustafa']);
  const title = document.getElementById('eveningTitle'); title.value = '<img src=x> سهرة'; title.dispatchEvent(new window.Event('input'));
  await window.League.refresh();
  assert.equal(document.getElementById('eveningTitle').value, '<img src=x> سهرة');
  assert.equal(document.querySelectorAll('[name="eveningAttendee"]:checked').length, 3);
  await window.League.startEvening();
  assert.equal(client.db.league_evenings.length, 1);
  const saved = structuredClone(client.db.league_evenings[0]);
  assert.equal(document.querySelectorAll('.evening-pair').length, 2);
  assert.equal(document.querySelectorAll('.evening-bye').length, 1);
  assert.equal(document.querySelectorAll('[data-evening-match]').length, 1);
  assert.equal(document.querySelector('#eveningContent img'), null, 'escape user titles');
  window.League.navigateTo('dashboard'); await window.League.refresh(); window.League.navigateTo('evenings');
  assert.deepEqual(client.db.league_evenings[0], saved);
  window.League.prepareEveningMatch(saved.id, 0);
  assert.equal(document.getElementById('matchPlayer1').value, saved.drawn_order[0]);
  assert.equal(document.getElementById('matchPlayer2').value, saved.drawn_order[1]);
  assert.equal(document.getElementById('matchSeason').value, ids.season);
  assert.equal(client.db.matches.length, 1, 'prefill is not a saved result');
  window.League.navigateTo('evenings'); window.League.finishEvening(saved.id);
  await document.getElementById('confirmYes').onclick(); await settle();
  assert.ok(client.db.league_evenings[0].ended_at);
  assert.ok(document.getElementById('eveningForm')); assert.equal(document.querySelectorAll('.evening-history details').length, 1);
  assert.deepEqual(app.errors, []);
});

test('lost response retries keep their id and never draw or save twice', async t => {
  const app = await mount('league/index.html', { profile: 'Wael' }); t.after(() => app.close());
  app.window.League.navigateTo('evenings'); select(app, players);
  const original = app.client.rpc.bind(app.client); let lose = true;
  app.client.rpc = async (...args) => { const saved = await original(...args); if (lose) { lose = false; return { error: { status: 503 } }; } return saved; };
  await app.window.League.startEvening();
  assert.equal(app.document.querySelectorAll('[name="eveningAttendee"]:checked').length, 6);
  assert.equal(app.document.getElementById('eveningError').classList.contains('hidden'), false);
  const first = app.client.calls.find(call => call.rpc === 'start_league_evening');
  await Promise.all([app.window.League.startEvening(), app.window.League.startEvening()]);
  const calls = app.client.calls.filter(call => call.rpc === 'start_league_evening');
  assert.equal(calls.length, 2); assert.equal(calls[1].args.evening_id, first.args.evening_id);
  assert.equal(app.client.db.league_evenings.length, 1);
  assert.equal(app.document.querySelectorAll('[data-evening-match]').length, 3);
  assert.equal(app.document.querySelectorAll('.evening-bye').length, 0);
});

test('normal players cannot navigate or call evening actions and do not fetch or subscribe to private nights', async t => {
  for (const player of players.filter(name => name !== 'Wael')) {
    const app = await mount('league/index.html', { profile: player }); t.after(() => app.close());
    const { window, document, client } = app;
    assert.ok(document.querySelector('[data-page="evenings"]').classList.contains('hidden'));
    window.League.navigateTo('evenings');
    assert.ok(document.getElementById('page-evenings').classList.contains('hidden'));
    await window.League.startEvening(); window.League.finishEvening('other'); window.League.prepareEveningMatch('other', 0); window.League.renderEvenings();
    assert.equal(client.calls.some(call => call.table === 'league_evenings' || call.rpc?.includes('league_evening')), false);
    assert.equal(client.channels.some(channel => channel.events.some(event => event.filter.table === 'league_evenings')), false);
    assert.equal(document.getElementById('eveningContent').childElementCount, 0);
  }
});

test('signing out during a draw clears private state and ignores its late response', async t => {
  const app = await mount('league/index.html', { profile: 'Wael' }); t.after(() => app.close());
  app.window.League.navigateTo('evenings'); select(app, ['Wael', 'Omar']);
  let release; app.client.hold = ({ rpc }) => rpc === 'start_league_evening' ? new Promise(resolve => { release = resolve; }) : undefined;
  const pending = app.window.League.startEvening(); await settle();
  await app.window.League.handleLogout(); release(); await pending;
  const state = app.module('league/js/state.js').state;
  assert.equal(state.eveningsReady, false); assert.equal(state.db.evenings.length, 0);
  assert.equal(app.document.getElementById('eveningContent').childElementCount, 0);
  assert.ok(app.document.getElementById('mainApp').classList.contains('hidden'));
});
