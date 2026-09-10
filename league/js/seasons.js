import { sb, state } from './state.js';
import { isAdmin, requireAdmin } from './admin.js';
import { esc, showConfirm, showToast } from './ui.js';
import { withBusy } from '../../shared/ui.js';
import { fetchAllData } from './api.js';
import { updateSidebarPlayer } from './auth-ui.js';

export function getActiveSeason() {
  return state.db.seasons.find(s => s.active) || state.db.seasons[state.db.seasons.length - 1] || null;
}

export function populateSeasonDropdowns() {
  const dropdowns = ['matchSeason', 'historyFilterSeason', 'tableSeasonFilter',
                     'awardsSeasonFilter', 'statsSeasonFilter', 'fbStatsSeasonFilter', 'editSeason'];
  dropdowns.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = '';

    if (id === 'historyFilterSeason' || id === 'tableSeasonFilter' ||
        id === 'awardsSeasonFilter' || id === 'statsSeasonFilter' || id === 'fbStatsSeasonFilter') {
      const all = document.createElement('option');
      all.value = 'all';
      all.textContent = id === 'tableSeasonFilter' || id === 'statsSeasonFilter' ? 'All Seasons' : 'All Seasons (Overall)';
      el.appendChild(all);
    }

    state.db.seasons.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name + (s.active ? ' ★' : '');
      el.appendChild(opt);
    });

    if ([...el.options].some(option => option.value === prev)) el.value = prev;
    else if (id === 'matchSeason' || id === 'editSeason') el.value = getActiveSeason()?.id || '';
  });
}

export async function createSeason() {
  if (!requireAdmin()) return;
  const input = document.getElementById('newSeasonName');
  const name = input.value.trim();
  if (!name || name.length > 80) return showToast('Enter a season name up to 80 characters.', true);
  if (state.db.seasons.some(season => season.name.toLowerCase() === name.toLowerCase())) return showToast('A season with that name exists.', true);
  return withBusy('create-season', document.getElementById('createSeasonButton'), async () => {
    const { error } = await sb.from('seasons').insert({ id: state.pendingSeasonId ||= crypto.randomUUID(), name, active: false, created: Date.now() });
    if (error) throw error;
    state.pendingSeasonId = null;
    input.value = '';
    await fetchAllData(); populateSeasonDropdowns(); renderSeasons(); showToast('Season created.');
  });
 }

export async function setActiveSeason(id) {
  if (!requireAdmin()) return;
  return withBusy('active-season', document.activeElement, async () => {
    const { error } = await sb.rpc('set_league_active_season', { target: id });
    if (error) throw error;
    await fetchAllData(); populateSeasonDropdowns(); renderSeasons(); updateSidebarPlayer();
    document.getElementById('topbarSeason').textContent = getActiveSeason()?.name || 'No active season';
    showToast('Active season updated.');
  });
 }

export function deleteSeason(id) {
  if (!requireAdmin()) return;
  const season = state.db.seasons.find(s => s.id === id);
  if (!season) return;
  const matchCount = state.db.matches.filter(m => m.season === id).length;
  showConfirm(
    'Delete Season',
    `Delete "${season.name}"? This will also delete ${matchCount} match(es).`,
    async () => {
      if (!sb) return showToast('Supabase is not configured.', true);
      const { error } = await sb.from('seasons').delete().eq('id', id);
      if (error) return showToast('Could not delete season.', true);

      state.db.matches = state.db.matches.filter(m => m.season !== id);
      const keptIds = new Set(state.db.matches.map(m => m.id));
      state.db.goalEvents = state.db.goalEvents.filter(e => keptIds.has(e.matchId));
      state.db.matchStats = state.db.matchStats.filter(s => keptIds.has(s.matchId));
      state.db.seasons = state.db.seasons.filter(s => s.id !== id);
      if (state.db.seasons.length > 0 && !state.db.seasons.find(s => s.active)) {
        const last = state.db.seasons[state.db.seasons.length - 1];
        const { error: activationError } = await sb.rpc('set_league_active_season', { target: last.id });
        if (activationError) showToast('Season deleted. Choose a new active season.', true);
        else last.active = true;
      }


      populateSeasonDropdowns();
      renderSeasons();
      updateSidebarPlayer();
      showToast('Season deleted.');
    }
  );
}

export function renderSeasons() {
  const cont = document.getElementById('seasonsList');
  if (!cont) return;
  if (state.db.seasons.length === 0) {
    cont.innerHTML = '<div class="empty-state">No seasons yet. Create one above.</div>';
    return;
  }
  cont.innerHTML = state.db.seasons.map(s => {
    const matchCount = state.db.matches.filter(m => m.season === s.id).length;
    return `
      <div class="season-card">
        <div class="season-card-info">
          <h4>${esc(s.name)}</h4>
          <p>${matchCount} match${matchCount !== 1 ? 'es' : ''} recorded</p>
        </div>
        <div class="season-card-actions">
          ${s.active ? '<span class="season-badge-active">ACTIVE</span>' :
            (isAdmin() ? `<button class="btn-sm" onclick="League.setActiveSeason('${s.id}')">Set Active</button>` : '')}
          ${isAdmin() ? `<button class="btn-sm delete" onclick="League.deleteSeason('${s.id}')">Delete</button>` : ''}
        </div>
      </div>`;
  }).join('');
}
