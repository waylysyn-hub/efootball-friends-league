import { displayName, displaySeason, matchesPlayerSearch, AR_LOCALE } from '../../shared/locale.js';
import { sb, state } from './state.js';
import { matchPlayerLabel } from './profiles.js';
import { matchAwardsHTML, matchGoalSummaryHTML, hasMissingGoalDetails } from './goal-events.js';
import { esc, showConfirm, showToast } from './ui.js';
import { isAdmin, requireAdmin } from './admin.js';
import { updateSidebarPlayer } from './auth-ui.js';
export * from './match-entry.js';

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
        ${hasMissingGoalDetails(m) ? '<span class="entry-missing-badge">تفاصيل ناقصة</span>' : ''}
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
        <span class="match-delete-wrap"><button class="btn-sm delete match-delete" onclick="League.deleteMatch('${m.id}')">🗑️ حذف</button></span>` : ''}
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
