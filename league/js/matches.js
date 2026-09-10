import { sb, state } from './state.js';
import { getActiveSeason, populateSeasonDropdowns } from './seasons.js';
import { getPlayers, matchPlayerLabel, populateMatchPlayerDropdowns } from './profiles.js';
import { collectGoalEventsFromForm, getMatchGoalEvents, matchAwardsHTML, matchGoalSummaryHTML, ownerOptionsHTML, renderGoalEventsForm, updateGoalEventsUI, validateGoalEvents } from './goal-events.js';
import { closeDialog, errorMessage, isBusy, openDialog, withBusy } from '../../shared/ui.js';
import { esc, renderPage, showConfirm, showError, showToast } from './ui.js';
import { isAdmin, requireAdmin } from './admin.js';
import { updateSidebarPlayer } from './auth-ui.js';
import { fetchAllData } from './api.js';
import { setSyncStatus } from './realtime.js';

export function updateGoalEventsSetupBanner() {
  const banner = document.getElementById('goalEventsSetupBanner');
  banner.classList.toggle('hidden', state.goalsReady);
  banner.textContent = 'Goal tracking is unavailable. Please ask the league administrator to finish setup.';
 }

export function initRecordForm() {
  document.getElementById('matchDate').value = new Date().toISOString().split('T')[0];
  populateSeasonDropdowns();
  populateMatchPlayerDropdowns();
  updateGoalEventsSetupBanner();
  clearMatchForm();
  if (state.goalsReady) renderGoalEventsForm('goalEventsList', []);
}

export function clearMatchForm(saved = false) {
  if (!saved && isBusy('save-match')) return;
  state.pendingMatchId = null;
  document.getElementById('matchPlayer1').value = '';
  document.getElementById('matchPlayer2').value = '';
  document.getElementById('matchGoals1').value = '0';
  document.getElementById('matchGoals2').value = '0';
  document.getElementById('matchDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('matchFormError').classList.add('hidden');
  updateMatchPreview();
  if (state.goalsReady) renderGoalEventsForm('goalEventsList', []);
  const active = getActiveSeason();
  if (active) document.getElementById('matchSeason').value = active.id;
}

export function updateMatchPreview() {
  const p1 = document.getElementById('matchPlayer1').value;
  const p2 = document.getElementById('matchPlayer2').value;
  const g1 = parseInt(document.getElementById('matchGoals1').value) || 0;
  const g2 = parseInt(document.getElementById('matchGoals2').value) || 0;

  document.getElementById('scoreLabel1').textContent = p1 ? p1 + ' Goals' : 'Goals';
  document.getElementById('scoreLabel2').textContent = p2 ? p2 + ' Goals' : 'Goals';

  if (!p1 || !p2) {
    document.getElementById('previewResult').textContent = '— vs —';
    if (state.goalsReady) updateGoalEventsUI('goalEventsList');
    return;
  }

  let result = '';
  if (g1 > g2) result = `🏆 ${p1} WINS`;
  else if (g2 > g1) result = `🏆 ${p2} WINS`;
  else result = `🤝 DRAW`;

  document.getElementById('previewResult').textContent = `${p1} ${g1} — ${g2} ${p2}  |  ${result}`;
  if (state.goalsReady) {
    document.querySelectorAll('#goalEventsList .ge-owner').forEach(select => {
      const previous = select.value;
      select.innerHTML = ownerOptionsHTML(p1, p2, previous);
      if (previous !== p1 && previous !== p2) select.value = '';
    });
    updateGoalEventsUI('goalEventsList');
  }
}

export async function saveMatch() { return saveMatchForm(false); }

export function renderHistory() {
  const search = (document.getElementById('historySearch')?.value || '').toLowerCase();
  const filterPlayer = document.getElementById('historyFilterPlayer')?.value || '';
  const filterSeason = document.getElementById('historyFilterSeason')?.value || '';
  const sort = document.getElementById('historySort')?.value || 'newest';

  let matches = [...state.db.matches];

  if (search) matches = matches.filter(m =>
    m.player1.toLowerCase().includes(search) || m.player2.toLowerCase().includes(search));
  if (filterPlayer) matches = matches.filter(m => m.player1 === filterPlayer || m.player2 === filterPlayer);
  if (filterSeason && filterSeason !== 'all') matches = matches.filter(m => m.season === filterSeason);

  matches.sort((a, b) => sort === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp);

  document.getElementById('historyCount').textContent = `${matches.length} match${matches.length !== 1 ? 'es' : ''} found`;

  const container = document.getElementById('matchList');
  if (matches.length === 0) {
    container.innerHTML = `<div class="match-list-empty">
      <span class="empty-icon">⚽</span>
      <p>No matches found. Record your first match!</p>
    </div>`;
    return;
  }

  container.innerHTML = matches.map(m => matchCardHTML(m)).join('');
}

export function matchCardHTML(m) {
  const season = state.db.seasons.find(s => s.id === m.season);
  const seasonName = season ? season.name : 'Unknown Season';
  const date = m.date ? new Date(m.date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';

  let resultBadge = `<span class="win-badge draw">DRAW</span>`;
  if (m.goals1 > m.goals2) resultBadge = `<span class="win-badge win">${esc(m.player1)} W</span>`;
  else if (m.goals2 > m.goals1) resultBadge = `<span class="win-badge win">${esc(m.player2)} W</span>`;

  return `
    <div class="match-card" id="match-card-${m.id}">
      <div class="match-card-header">
        <span>📅 ${date}</span>
        <span>|</span>
        <span>🏆 ${esc(seasonName)}</span>
        <span>|</span>
        ${resultBadge}
      </div>
      <div class="match-card-result">
        <div class="match-player">${matchPlayerLabel(m.player1)}</div>
        <div class="match-score">${m.goals1} — ${m.goals2}</div>
        <div class="match-player right">${matchPlayerLabel(m.player2)}</div>
      </div>
      ${matchGoalSummaryHTML(m.id)}
      ${matchAwardsHTML(m.id)}
      <div class="match-card-actions">
        <button class="btn-sm" onclick="League.openMatchDetails('${m.id}')">📄 Details</button>
        ${isAdmin() ? `
        <button class="btn-sm edit" onclick="League.openEditModal('${m.id}')">✏️ Edit</button>
        <button class="btn-sm delete" onclick="League.deleteMatch('${m.id}')">🗑️ Delete</button>` : ''}
      </div>
    </div>`;
}

export function deleteMatch(id) {
  if (!requireAdmin()) return;
  showConfirm('Delete Match', 'Are you sure you want to delete this match? This cannot be undone.', async () => {
    if (!sb) return showToast('Supabase is not configured.', true);
    const { error } = await sb.from('matches').delete().eq('id', id);
    if (error) return showToast('Could not delete match.', true);

    state.db.matches = state.db.matches.filter(m => m.id !== id);
    state.db.matchStats = state.db.matchStats.filter(s => s.matchId !== id);
    state.db.goalEvents = state.db.goalEvents.filter(e => e.matchId !== id);


    renderHistory();
    updateSidebarPlayer();
    showToast('Match deleted.');
  });
}

export function openEditModal(id) {
  if (!requireAdmin()) return;
  const m = state.db.matches.find(x => x.id === id);
  if (!m) return;

  populateSeasonDropdowns();
  populateMatchPlayerDropdowns();

  document.getElementById('editMatchId').value = m.id;
  document.getElementById('editPlayer1').value = m.player1;
  document.getElementById('editPlayer2').value = m.player2;
  document.getElementById('editGoals1').value = m.goals1;
  document.getElementById('editGoals2').value = m.goals2;
  document.getElementById('editDate').value = m.date;
  document.getElementById('editSeason').value = m.season;

  if (state.goalsReady) {
    renderGoalEventsForm('editGoalEventsList', getMatchGoalEvents(id).map(e => ({
      owner: e.owner, scorer: e.scorer, assist: e.assist, minute: e.minute
    })));
  }
  document.getElementById('editError').classList.add('hidden');
  openDialog('editMatchModal', closeEditModal);
}

export function onEditMatchPlayersChange() {
  const events = collectGoalEventsFromForm('editGoalEventsList');
  renderGoalEventsForm('editGoalEventsList', events);
}

export function closeEditModal() { if (!isBusy('edit-match')) closeDialog('editMatchModal'); }

export async function saveEditMatch() { return saveMatchForm(true); }

export async function saveMatchForm(editing) {
  const prefix = editing ? 'edit' : 'match';
  const errorElement = document.getElementById(editing ? 'editError' : 'matchFormError');
  if (!isAdmin()) return showError(errorElement, 'Administrator permission is required.');
  const p1 = document.getElementById(prefix + 'Player1').value;
  const p2 = document.getElementById(prefix + 'Player2').value;
  const raw1 = document.getElementById(prefix + 'Goals1').value;
  const raw2 = document.getElementById(prefix + 'Goals2').value;
  const goals1 = Number(raw1), goals2 = Number(raw2);
  const date = document.getElementById(prefix + 'Date').value;
  const season = document.getElementById(prefix + 'Season').value;
  if (!getPlayers().includes(p1) || !getPlayers().includes(p2) || p1 === p2) return showError(errorElement, 'Select two different league players.');
  if (!raw1 || !raw2 || !Number.isInteger(goals1) || !Number.isInteger(goals2) || goals1 < 0 || goals2 < 0 || goals1 > 99 || goals2 > 99) return showError(errorElement, 'Enter whole-number scores between 0 and 99.');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return showError(errorElement, 'Choose a valid match date.');
  if (!state.db.seasons.some(row => row.id === season)) return showError(errorElement, 'Choose an existing season.');
  const goalRows = collectGoalEventsFromForm(editing ? 'editGoalEventsList' : 'goalEventsList');
  const invalid = validateGoalEvents(goalRows, p1, p2, goals1, goals2);
  if (invalid) return showError(errorElement, invalid);
  const key = editing ? 'edit-match' : 'save-match';
  return withBusy(key, document.getElementById(editing ? 'saveEditButton' : 'saveMatchButton'), async () => {
    const id = editing ? document.getElementById('editMatchId').value : (state.pendingMatchId ||= crypto.randomUUID());
    errorElement.classList.add('hidden');
    try {
      const { error } = await sb.rpc('save_league_match', {
        match_data: { id, player1: p1, player2: p2, goals1, goals2, date, season_id: season, timestamp: Date.now() },
        goal_events: goalRows,
      });
      if (error) throw error;
      // The committed result and all goal events are one database transaction.
      state.pendingMatchId = null;
      try { await fetchAllData(); }
      catch { setSyncStatus('Result saved. Refresh to load the latest standings.'); }
      if (editing) { closeDialog('editMatchModal'); renderPage(state.page); }
      else clearMatchForm(true);
      updateSidebarPlayer();
      showToast(editing ? 'Match updated.' : 'Match recorded.');
    } catch (error) { showError(errorElement, errorMessage(error, 'Could not save the result. Your form is kept; retrying will not create a duplicate.')); }
  });
 }
