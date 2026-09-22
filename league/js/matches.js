import { displayName, displaySeason, matchesPlayerSearch, AR_LOCALE } from '../../shared/locale.js';
import { sb, state } from './state.js';
import { getActiveSeason, populateSeasonDropdowns } from './seasons.js';
import { getPlayers, matchPlayerLabel, populateMatchPlayerDropdowns } from './profiles.js';
import { collectGoalEventsFromForm, getMatchGoalEvents, matchAwardsHTML, matchGoalSummaryHTML, refreshGoalOwnerOptions, renderGoalEventsForm, updateGoalEventsUI, validateGoalEvents } from './goal-events.js';
import { closeDialog, errorMessage, isBusy, openDialog, withBusy } from '../../shared/ui.js';
import { esc, renderPage, showConfirm, showError, showToast } from './ui.js';
import { isAdmin, requireAdmin } from './admin.js';
import { updateSidebarPlayer } from './auth-ui.js';
import { fetchAllData } from './api.js';
import { setSyncStatus } from './realtime.js';

export function updateGoalEventsSetupBanner() {
  const banner = document.getElementById('goalEventsSetupBanner');
  banner.classList.toggle('hidden', state.goalsReady);
  banner.textContent = "تفاصيل الأهداف غير متاحة. تواصل مع مدير الدوري لإكمال الإعداد.";
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

  document.getElementById('scoreLabel1').textContent = p1 ? 'أهداف ' + displayName(p1) : "الأهداف";
  document.getElementById('scoreLabel2').textContent = p2 ? 'أهداف ' + displayName(p2) : "الأهداف";

  if (!p1 || !p2) {
    document.getElementById('previewResult').textContent = '— ضد —';
    if (state.goalsReady) refreshGoalOwnerOptions('goalEventsList');
    return;
  }

  let result = '';
  if (g1 > g2) result = `🏆 فوز ${displayName(p1)}`;
  else if (g2 > g1) result = `🏆 فوز ${displayName(p2)}`;
  else result = `🤝 تعادل`;

  document.getElementById('previewResult').textContent = `${displayName(p1)} (${g1}) — ${displayName(p2)} (${g2})  |  ${result}`;
  if (state.goalsReady) {
    refreshGoalOwnerOptions('goalEventsList');
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
    matchesPlayerSearch(m.player1, search) || matchesPlayerSearch(m.player2, search));
  if (filterPlayer) matches = matches.filter(m => m.player1 === filterPlayer || m.player2 === filterPlayer);
  if (filterSeason && filterSeason !== 'all') matches = matches.filter(m => m.season === filterSeason);

  matches.sort((a, b) => sort === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp);

  document.getElementById('historyCount').textContent = `عدد المباريات: ${matches.length}`;

  const container = document.getElementById('matchList');
  if (matches.length === 0) {
    container.innerHTML = `<div class="match-list-empty">
      <span class="empty-icon">⚽</span>
      <p>لا توجد مباريات مطابقة. جرّب تغيير البحث أو سجّل مباراة جديدة.</p>
    </div>`;
    return;
  }

  container.innerHTML = matches.map(m => matchCardHTML(m)).join('');
}

export function matchCardHTML(m) {
  const season = state.db.seasons.find(s => s.id === m.season);
  const seasonName = season ? displaySeason(season.name) : "موسم غير معروف";
  const date = m.date ? new Date(m.date).toLocaleDateString(AR_LOCALE, { day:'numeric', month:'short', year:'numeric' }) : '—';

  let resultBadge = `<span class="win-badge draw">تعادل</span>`;
  if (m.goals1 > m.goals2) resultBadge = `<span class="win-badge win">${esc(displayName(m.player1))} فاز</span>`;
  else if (m.goals2 > m.goals1) resultBadge = `<span class="win-badge win">${esc(displayName(m.player2))} فاز</span>`;

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
        <div class="match-score"><bdi>${m.goals1}</bdi> — <bdi>${m.goals2}</bdi></div>
        <div class="match-player right">${matchPlayerLabel(m.player2)}</div>
      </div>
      ${matchGoalSummaryHTML(m.id)}
      ${matchAwardsHTML(m.id)}
      <div class="match-card-actions">
        <button class="btn-sm" onclick="League.openMatchDetails('${m.id}')">📄 التفاصيل</button>
        ${isAdmin() ? `
        <button class="btn-sm edit" onclick="League.openEditModal('${m.id}')">✏️ تعديل</button>
        <button class="btn-sm delete" onclick="League.deleteMatch('${m.id}')">🗑️ حذف</button>` : ''}
      </div>
    </div>`;
}

export function deleteMatch(id) {
  if (!requireAdmin()) return;
  showConfirm("حذف المباراة", "هل تريد حذف هذه المباراة؟ لا يمكن التراجع عن الحذف.", async () => {
    if (!sb) return showToast("الاتصال بالخادم غير جاهز. تواصل مع مدير الدوري.", true);
    const { error } = await sb.from('matches').delete().eq('id', id);
    if (error) return showToast("تعذّر حذف المباراة.", true);

    state.db.matches = state.db.matches.filter(m => m.id !== id);
    state.db.matchStats = state.db.matchStats.filter(s => s.matchId !== id);
    state.db.goalEvents = state.db.goalEvents.filter(e => e.matchId !== id);


    renderHistory();
    updateSidebarPlayer();
    showToast("تم حذف المباراة.");
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
  if (!isAdmin()) return showError(errorElement, 'تسجيل النتائج وتعديلها متاح لمدير الدوري فقط.');
  const p1 = document.getElementById(prefix + 'Player1').value;
  const p2 = document.getElementById(prefix + 'Player2').value;
  const raw1 = document.getElementById(prefix + 'Goals1').value;
  const raw2 = document.getElementById(prefix + 'Goals2').value;
  const goals1 = Number(raw1), goals2 = Number(raw2);
  const date = document.getElementById(prefix + 'Date').value;
  const season = document.getElementById(prefix + 'Season').value;
  if (!getPlayers().includes(p1) || !getPlayers().includes(p2) || p1 === p2) return showError(errorElement, 'اختر لاعبين مختلفين من قائمة لاعبي الدوري.');
  if (!raw1 || !raw2 || !Number.isInteger(goals1) || !Number.isInteger(goals2) || goals1 < 0 || goals2 < 0 || goals1 > 99 || goals2 > 99) return showError(errorElement, 'أدخل نتيجة صحيحة لكل فريق من 0 إلى 99، دون كسور.');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return showError(errorElement, 'اختر تاريخًا صحيحًا للمباراة.');
  if (!state.db.seasons.some(row => row.id === season)) return showError(errorElement, 'اختر موسمًا موجودًا قبل الحفظ.');
  if (!state.squadsReady || !state.goalsReady) return showError(errorElement, 'تعذّر تحميل التشكيلات أو الأهداف. حدّث الصفحة قبل حفظ المباراة.');
  const goalRows = collectGoalEventsFromForm(editing ? 'editGoalEventsList' : 'goalEventsList');
  const invalid = validateGoalEvents(goalRows, p1, p2, goals1, goals2, { requireSquad: true, matchId: editing ? document.getElementById('editMatchId').value : null });
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
      catch { setSyncStatus("تم حفظ النتيجة. حدّث الصفحة لعرض الترتيب الجديد."); }
      if (editing) { closeDialog('editMatchModal'); renderPage(state.page); }
      else clearMatchForm(true);
      updateSidebarPlayer();
      showToast(editing ? 'تم تحديث المباراة.' : 'تم تسجيل المباراة.');
    } catch (error) { showError(errorElement, errorMessage(error, 'تعذّر حفظ المباراة. بياناتك محفوظة في النموذج؛ يمكنك إعادة المحاولة دون تكرارها.')); }
  });
 }
