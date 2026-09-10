import { sb, state } from './state.js';
import { navigateTo, renderPage, showConfirm, showToast } from './ui.js';
import { getActiveSeason, populateSeasonDropdowns } from './seasons.js';
import { updateSidebarPlayer } from './auth-ui.js';
import { getPlayers } from './profiles.js';
import { validateGoalEvents } from './goal-events.js';
import { fetchAllData } from './api.js';

export function applyAdminUI() {
  const admin = isAdmin();
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !admin);
  });
  document.body.classList.toggle('is-admin', admin);
  document.body.classList.toggle('is-viewer', !admin);
  const badge = document.getElementById('viewerBadge');
  if (badge) badge.classList.toggle('hidden', admin);
}

export function exportData() {
  const { seasons, matches, goalEvents, matchStats } = state.db;
  const backup = { version: 2, exportedAt: new Date().toISOString(), seasons, matches, goalEvents, matchStats };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'efootball-competition-' + new Date().toISOString().slice(0, 10) + '.json';
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Competition backup downloaded.');
 }

export function confirmResetSeason() {
  if (!requireAdmin()) return;
  const active = getActiveSeason();
  if (!active) return showToast('No active season to reset.', true);
  const count = state.db.matches.filter(m => m.season === active.id).length;
  showConfirm('Reset Season', `Delete all ${count} match(es) from "${active.name}"? This cannot be undone.`, async () => {
    if (!sb) return showToast('Supabase is not configured.', true);
    const { error } = await sb.from('matches').delete().eq('season_id', active.id);
    if (error) return showToast('Could not reset season.', true);

    state.db.matches = state.db.matches.filter(m => m.season !== active.id);
    const keptIds = new Set(state.db.matches.map(m => m.id));
    state.db.goalEvents = state.db.goalEvents.filter(e => keptIds.has(e.matchId));
    state.db.matchStats = state.db.matchStats.filter(s => keptIds.has(s.matchId));


    updateSidebarPlayer();
    renderPage(state.page);
    showToast('Season reset.');
  });
}

export function isAdmin() { return state.profile?.role === 'admin'; }

export function requireAdmin() { if (isAdmin()) return true; showToast('Administrator permission is required.', true); return false; }

export function normalizeBackup(data, players = getPlayers()) {
  if (!data || !Array.isArray(data.seasons) || !Array.isArray(data.matches)) throw new Error('Invalid backup format.');
  const mapIds = rows => {
    const result = new Map();
    for (const row of rows) {
      if (!row || row.id == null || result.has(String(row.id))) throw new Error('Backup has missing or duplicate IDs.');
      result.set(String(row.id), crypto.randomUUID());
    }
    return result;
  };
  const seasonIds = mapIds(data.seasons), matchIds = mapIds(data.matches);
  const requireNumber = (value, min, max) => {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error('Backup contains an invalid number.');
    return value;
  };
  const requirePlayer = name => { if (!players.includes(name)) throw new Error('Backup references a player outside this league.'); return name; };
  const seasons = data.seasons.map(row => {
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 80) throw new Error('Invalid season name.');
    return { id: seasonIds.get(String(row.id)), name: row.name.trim(), active: !!row.active, created: Number(row.created) || 0 };
  });
  if (seasons.filter(s => s.active).length > 1) throw new Error('Backup contains more than one active season.');
  const matches = data.matches.map(row => {
    const seasonKey = row.season ?? row.season_id;
    const season = seasonKey == null ? null : seasonIds.get(String(seasonKey));
    if (seasonKey != null && !season) throw new Error('A match references a missing season.');
    if (row.player1 === row.player2 || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(row.date))) throw new Error('Invalid match data.');
    return { id: matchIds.get(String(row.id)), player1: requirePlayer(row.player1), player2: requirePlayer(row.player2),
      goals1: requireNumber(row.goals1, 0, 99), goals2: requireNumber(row.goals2, 0, 99), date: row.date, season, timestamp: Number(row.timestamp) || 0 };
  });
  const list = key => { if (data[key] != null && !Array.isArray(data[key])) throw new Error('Invalid backup list.'); return data[key] || []; };
  const goalEvents = list('goalEvents').map(row => {
    const matchId = matchIds.get(String(row.matchId ?? row.match_id));
    const match = matches.find(m => m.id === matchId);
    if (!match || ![match.player1, match.player2].includes(row.owner) || typeof row.scorer !== 'string' || !row.scorer.trim()) throw new Error('Invalid goal event.');
    return { matchId, owner: row.owner, scorer: row.scorer.trim(), assist: String(row.assist || ''),
      minute: requireNumber(row.minute ?? 0, 0, 120), sortOrder: requireNumber(row.sortOrder ?? row.sort_order ?? 0, 0, 1000) };
  });
  for (const match of matches) {
    const error = validateGoalEvents(goalEvents.filter(e => e.matchId === match.id), match.player1, match.player2, match.goals1, match.goals2);
    if (error) throw new Error(error);
  }
  const matchStats = list('matchStats').map(row => {
    const matchId = matchIds.get(String(row.matchId ?? row.match_id));
    const match = matches.find(m => m.id === matchId);
    if (!match || ![match.player1, match.player2].includes(row.player)) throw new Error('Invalid match statistics.');
    return { matchId, player: requirePlayer(row.player), characterName: String(row.characterName ?? row.character_name ?? ''),
      goals: requireNumber(row.goals, 0, 99), assists: requireNumber(row.assists, 0, 99) };
  });
  return { seasons, matches, goalEvents, matchStats };
 }

export async function importData(event) {
  const input = event.target;
  if (!requireAdmin()) { input.value = ''; return; }
  const file = input.files[0]; input.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return showToast('Choose a backup smaller than 5 MB.', true);
  let backup;
  try { backup = normalizeBackup(JSON.parse(await file.text())); }
  catch (error) { return showToast(error.message || 'Invalid competition backup.', true); }
  showConfirm('Restore competition',
    'Replace the current competition with ' + backup.seasons.length + ' seasons and ' + backup.matches.length + ' matches? Player accounts and conversations are preserved.',
    async () => {
      if (!requireAdmin()) return;
      const { error } = await sb.rpc('restore_league_competition', { backup });
      if (error) throw error;
      await fetchAllData(); populateSeasonDropdowns(); updateSidebarPlayer();
      navigateTo('dashboard'); showToast('Competition restored.');
    });
 }

export function confirmResetAll() {
  if (!requireAdmin()) return;
  showConfirm('Reset competition', 'Permanently delete all seasons, matches and goal events? Player accounts and conversations are preserved.', async () => {
    if (!requireAdmin()) return;
    const backup = { seasons: [{ id: crypto.randomUUID(), name: 'Season 1', active: true, created: Date.now() }], matches: [], goalEvents: [], matchStats: [] };
    const { error } = await sb.rpc('restore_league_competition', { backup });
    if (error) throw error;
    await fetchAllData(); populateSeasonDropdowns(); updateSidebarPlayer();
    showToast('Competition reset.');
  });
 }
