import { displayName, displaySeason, AR_LOCALE } from '../../shared/locale.js';
import { state } from './state.js';
import { esc, navigateTo } from './ui.js';
import { getMatchGoalEvents, goalEventTimelineHTML, matchAwardsHTML, hasMissingGoalDetails } from './goal-events.js';
import { isAdmin } from './admin.js';

export function openMatchDetails(matchId) {
  state.matchId = matchId;
  navigateTo('matchDetails', null);
}

export function backFromMatchDetails() {
  state.matchId = null;
  navigateTo('matchHistory', document.querySelector('.nav-item[data-page="matchHistory"]'));
}

export function renderMatchDetails() {
  const cont = document.getElementById('matchDetailsContent');
  const sub = document.getElementById('matchDetailsSubtitle');
  if (!cont) return;


  const m = state.db.matches.find(x => x.id === state.matchId);
  if (!m) {
    if (sub) sub.textContent = '—';
    cont.innerHTML = "<div class=\"empty-state\">المباراة غير موجودة.</div>";
    return;
  }

  const season = state.db.seasons.find(s => s.id === m.season);
  const date = m.date ? new Date(m.date).toLocaleDateString(AR_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  if (sub) sub.textContent = `${date} · ${season ? displaySeason(season.name) : "موسم غير معروف"}`;

  let resultBadge = "تعادل";
  if (m.goals1 > m.goals2) resultBadge = `فوز ${displayName(m.player1)}`;
  else if (m.goals2 > m.goals1) resultBadge = `فوز ${displayName(m.player2)}`;

  const events = getMatchGoalEvents(m.id);

  cont.innerHTML = `
    <div class="match-details-card">
      <div class="match-details-score">
        <span class="md-player">${esc(displayName(m.player1))}</span>
        <span class="md-score"><bdi>${m.goals1}</bdi> — <bdi>${m.goals2}</bdi></span>
        <span class="md-player">${esc(displayName(m.player2))}</span>
      </div>
      <div class="match-details-meta">${esc(resultBadge)}</div>
      ${hasMissingGoalDetails(m) ? '<p class="entry-note"><span class="entry-missing-badge">تفاصيل ناقصة</span> النتيجة محفوظة. يمكن للمدير إضافة تفاصيل الأهداف من تعديل المباراة.</p>' : ''}
      ${matchAwardsHTML(m.id)}
      <div class="panel mt-16">
        <div class="panel-header">⚽ الأهداف</div>
        <div class="panel-body">
          ${events.length ? goalEventTimelineHTML(m.id) : `<div class="empty-state">${m.goals1 + m.goals2 === 0 ? 'لا توجد أهداف في هذه المباراة.' : 'لم تُسجّل تفاصيل أهداف لهذه المباراة.'}</div>`}
        </div>
      </div>
      ${isAdmin() ? `<div class="form-actions mt-16">
        <button class="btn-sm edit" onclick="League.openEditModal('${m.id}')">✏️ تعديل المباراة</button>
      </div>` : ''}
    </div>`;
}
