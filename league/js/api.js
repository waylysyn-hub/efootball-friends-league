import { sb, state } from './state.js';
import { getPlayers, populateAllPlayerDropdowns } from './profiles.js';
import { updateGoalEventsSetupBanner } from './matches.js';

export function isQaTableMissing(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return err.code === '42P01' || err.code === 'PGRST205'
    || msg.includes('could not find') || msg.includes('does not exist')
    || msg.includes('schema cache') || err.status === 404;
}

export function isMatchStatsTableMissing(err) { return isQaTableMissing(err); }

export function isGoalEventsTableMissing(err) { return isQaTableMissing(err); }

export function mapSeason(row) {
  return { id: row.id, name: row.name, active: !!row.active, created: Number(row.created) || Date.now() };
}

export function mapMatch(row) {
  return {
    id: row.id,
    player1: row.player1, player2: row.player2,
    goals1: row.goals1, goals2: row.goals2,
    date: row.date, season: row.season_id,
    timestamp: Number(row.timestamp) || (row.created_at ? new Date(row.created_at).getTime() : Date.now())
  };
}

export function mapQuestion(row) {
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    closed: !!row.closed,
    correctAnswerId: row.correct_answer_id || null,
    timestamp: Number(row.timestamp) || (row.created_at ? new Date(row.created_at).getTime() : Date.now())
  };
}

export function mapAnswer(row) {
  return {
    id: row.id,
    questionId: row.question_id,
    author: row.author,
    body: row.body,
    timestamp: Number(row.timestamp) || (row.created_at ? new Date(row.created_at).getTime() : Date.now())
  };
}

export function mapMatchStat(row) {
  return {
    id: row.id,
    matchId: row.match_id,
    player: row.player,
    characterName: row.character_name || '',
    goals: row.goals,
    assists: row.assists
  };
}

export function mapGoalEvent(row) {
  return {
    id: row.id,
    matchId: row.match_id,
    owner: row.owner,
    scorer: row.scorer,
    assist: row.assist || '',
    minute: row.minute ?? 0,
    sortOrder: row.sort_order ?? 0
  };
}

export function setDefaultDate() {
  const d = document.getElementById('matchDate');
  if (d) d.value = new Date().toISOString().split('T')[0];
}

let fetchInFlight = null;
export async function fetchPlayers() {
  if (!sb) throw new Error('Connection unavailable');
  const { data, error } = await sb.from('players').select('name, role, created').order('name');
  if (error) throw error;
  state.db.accounts = Object.fromEntries((data || []).map(player => [player.name, player]));
  populateAllPlayerDropdowns();
  return data || [];
}

export function fetchAllData() {
  if (fetchInFlight) return fetchInFlight;
  fetchInFlight = loadSnapshot().finally(() => { fetchInFlight = null; });
  return fetchInFlight;
}

async function loadSnapshot() {
  if (!sb) throw new Error('Connection unavailable');
  const tables = ['players', 'seasons', 'matches', 'questions', 'answers', 'match_stats', 'match_goal_events', 'standings', 'achievements'];
  const results = await Promise.all(tables.map(table =>
    sb.from(table).select(table === 'players' ? 'name, role, created' : '*')
  ));
  const data = {};
  results.forEach((result, index) => {
    const table = tables[index];
    const optional = ['questions', 'answers', 'match_stats', 'match_goal_events'].includes(table);
    if (result.error && !(optional && isQaTableMissing(result.error))) throw result.error;
    data[table] = result.error ? null : result.data || [];
  });
  const previousRoster = getPlayers().join('\n');
  state.qaReady = data.questions !== null && data.answers !== null;
  state.statsReady = data.match_stats !== null;
  state.goalsReady = data.match_goal_events !== null;
  state.db = {
    accounts: Object.fromEntries(data.players.map(p => [p.name, p])),
    seasons: data.seasons.map(mapSeason).sort((a, b) => a.created - b.created),
    matches: data.matches.map(mapMatch),
    questions: (data.questions || []).map(mapQuestion).sort((a, b) => b.timestamp - a.timestamp),
    answers: (data.answers || []).map(mapAnswer),
    matchStats: (data.match_stats || []).map(mapMatchStat),
    goalEvents: (data.match_goal_events || []).map(mapGoalEvent),
    standings: data.standings,
    achievements: data.achievements,
  };
  if (getPlayers().join('\n') !== previousRoster) populateAllPlayerDropdowns();
  updateGoalEventsSetupBanner();
}
