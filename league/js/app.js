import { state, sb } from './state.js';
import { fetchPlayers, fetchAllData } from './api.js';
import { handleLogin, handleLogout, showLogin, clearSession, enterApp } from './auth-ui.js';
import { applyAdminUI } from './admin.js';
import { refreshFromRemote, stopRealtime } from './realtime.js';
import { withBusy, showError, setupConnectivity } from '../../shared/ui.js';
import * as ui from './ui.js';
import * as matches from './matches.js';
import * as details from './match-details.js';
import * as goals from './goal-events.js';
import * as seasons from './seasons.js';
import * as profiles from './profiles.js';
import * as standings from './standings.js';
import * as statistics from './statistics.js';
import * as achievements from './achievements.js';
import * as questions from './questions.js';
import * as admin from './admin.js';

// One explicit compatibility namespace for existing HTML actions. Data and
// authenticated state stay module-local; RLS remains the authorization boundary.
const actions = { ...ui, ...matches, ...details, ...goals, ...seasons, ...profiles,
  ...standings, ...statistics, ...achievements, ...questions, ...admin, handleLogin, handleLogout,
  refresh: refreshFromRemote, retryLogin: loadRoster };
for (const name of ['submitQuestion', 'submitAnswer']) {
  const action = actions[name];
  actions[name] = (...args) => withBusy(name, document.activeElement, () => action(...args));
}
window.League = Object.freeze(actions);

document.getElementById('loginForm').addEventListener('submit', event => { event.preventDefault(); handleLogin(); });
document.getElementById('loginPasswordToggle').addEventListener('click', event => {
  const input = document.getElementById('loginPassword');
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  event.currentTarget.textContent = visible ? 'Hide' : 'Show';
  event.currentTarget.setAttribute('aria-pressed', String(visible));
});
document.addEventListener('click', event => {
  const link = event.target.closest('.nav-item[data-page]');
  if (link) { event.preventDefault(); ui.navigateTo(link.dataset.page, link); }
  const row = event.target.closest('[data-football-player]');
  if (row) statistics.showFootballPlayerDetail(row.dataset.footballPlayer);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') ui.closeSidebar();
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-football-player]')) {
    event.preventDefault(); statistics.showFootballPlayerDetail(event.target.dataset.footballPlayer);
  }
});
window.addEventListener('hashchange', () => {
  if (state.user) ui.navigateTo(location.hash.slice(1) || 'dashboard');
});
setupConnectivity(refreshFromRemote);
window.addEventListener('pagehide', stopRealtime);

async function loadRoster() {
  const select = document.getElementById('loginUsername');
  const button = document.getElementById('loginButton');
  const error = document.getElementById('loginError');
  button.disabled = true;
  select.disabled = true;
  error.classList.add('hidden');
  try {
    const players = await fetchPlayers();
    if (!players.length) showError(error, 'No players are registered yet. Please contact your league administrator.');
    button.disabled = !players.length;
  } catch {
    showError(error, 'Could not load players. Check your connection and use Try again.');
  } finally { select.disabled = false; }
}

async function init() {
  applyAdminUI();
  if (!sb) {
    showLogin();
    showError(document.getElementById('loginError'), 'The league is temporarily unavailable. Please try again shortly.');
    document.getElementById('loginButton').disabled = true;
    return;
  }
  const [, restored] = await Promise.allSettled([loadRoster(), window.EFLAuth.restore(sb)]);
  if (restored.status === 'fulfilled' && restored.value) {
    state.profile = restored.value; state.user = restored.value.name;
    try { await fetchAllData(); enterApp(); }
    catch { showLogin(); showError(document.getElementById('loginError'), 'Could not load your league. Please sign in to retry.'); }
  } else showLogin();
  const unsubscribe = window.EFLAuth.subscribe(sb, async (profile, event) => {
    if (!profile) { clearSession(); return; }
    const changed = state.user !== profile.name;
    state.profile = profile; state.user = profile.name; applyAdminUI();
    if (changed && !state.signingIn) {
      try { await fetchAllData(); enterApp(); }
      catch { clearSession(); }
    }
  });
  window.addEventListener('pagehide', unsubscribe, { once: true });
}
init().catch(() => { showLogin(); showError(document.getElementById('loginError'), 'Could not open the league. Please refresh.'); });
