import { sb, state } from './state.js';
import { fetchAllData } from './api.js';
import { updateSidebarPlayer } from './auth-ui.js';
import { errorMessage, isBusy } from '../../shared/ui.js';
import { populateSeasonDropdowns } from './seasons.js';
import { renderPage } from './ui.js';

let channel = null;
let refreshing = false;
let refreshAgain = false;
let timer;
export function subscribeRealtime() {
  if (!sb || channel) return;
  channel = sb.channel('efl-league');
  for (const table of ['matches', 'seasons', 'players', 'questions', 'answers', 'match_stats', 'match_goal_events', 'standings', 'achievements']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh);
  }
  channel.subscribe(status => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSyncStatus('Live updates paused. Use Refresh to try again.');
    else if (status === 'SUBSCRIBED') setSyncStatus('');
  });
}

export function stopRealtime() {
  clearTimeout(timer);
  if (channel) sb.removeChannel(channel);
  channel = null;
}

export function scheduleRefresh() {
  clearTimeout(timer);
  timer = setTimeout(refreshFromRemote, 400);
}

export function setSyncStatus(message) {
  const banner = document.getElementById('syncStatus');
  banner.hidden = !message;
  banner.textContent = message;
}

export async function refreshFromRemote() {
  if (!state.user) return;
  if (refreshing) { refreshAgain = true; return; }
  refreshing = true;
  try {
    do { refreshAgain = false; await fetchAllData(); } while (refreshAgain);
    if (!state.user) return;
    setSyncStatus('');
    updateSidebarPlayer();
    const editing = !document.getElementById('editMatchModal').classList.contains('hidden');
    const questionDraft = [...document.querySelectorAll('#qaAskBody, #qaAnswerBody')].some(input => input.value.trim());
    const formPage = ['recordMatch', 'settings'].includes(state.page) || questionDraft || isBusy('submitQuestion') || isBusy('submitAnswer');
    if (!editing && !formPage) { populateSeasonDropdowns(); renderPage(state.page); }
  } catch (error) {
    setSyncStatus(errorMessage(error, 'Could not refresh the league. Your last loaded results are still shown.'));
  } finally { refreshing = false; }
}
