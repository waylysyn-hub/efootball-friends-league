import { sb, state } from './state.js';
import { fetchAllData } from './api.js';
import { updateSidebarPlayer } from './auth-ui.js';
import { errorMessage, isBusy } from '../../shared/ui.js';
import { populateSeasonDropdowns } from './seasons.js';
import { refreshGoalSquadOptions } from './goal-events.js';
import { renderPage } from './ui.js';

let channel = null;
let refreshing = null;
let timer;
export function subscribeRealtime() {
  if (!sb || channel) return;
  channel = sb.channel('efl-league');
  const tables = ['matches', 'seasons', 'players', 'questions', 'answers', 'match_stats', 'match_goal_events', 'squad_players', 'standings', 'achievements'];
  if (state.profile?.role === 'admin') tables.push('league_evenings');
  for (const table of tables) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh);
  }
  const subscribedChannel = channel;
  channel.subscribe(status => {
    if (channel !== subscribedChannel) return;
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSyncStatus("توقفت التحديثات المباشرة. اضغط تحديث للمحاولة مجددًا.");
    else if (status === 'SUBSCRIBED') setSyncStatus('');
  });
}

export function stopRealtime() {
  clearTimeout(timer);
  refreshing = null;
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
  const session = state.sessionVersion;
  if (refreshing?.session === session) { refreshing.again = true; return; }
  const request = { session, again: false };
  refreshing = request;
  try {
    do { request.again = false; await fetchAllData(); } while (request.again && session === state.sessionVersion);
    if (!state.user || session !== state.sessionVersion) return;
    setSyncStatus('');
    refreshGoalSquadOptions();
    updateSidebarPlayer();
    const editing = !document.getElementById('editMatchModal').classList.contains('hidden');
    const questionDraft = [...document.querySelectorAll('#qaAskBody, #qaAnswerBody')].some(input => input.value.trim());
    const formPage = ['recordMatch', 'settings'].includes(state.page) || questionDraft || isBusy('submitQuestion') || isBusy('submitAnswer');
    if (!editing && !formPage) { populateSeasonDropdowns(); renderPage(state.page); }
  } catch (error) {
    if (session === state.sessionVersion) setSyncStatus(errorMessage(error, "تعذّر تحديث الدوري. تُعرض آخر نتائج تم تحميلها."));
  } finally { if (refreshing === request) refreshing = null; }
}
