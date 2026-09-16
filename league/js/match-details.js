import { state } from './state.js';
import { esc, navigateTo } from './ui.js';
import { getMatchGoalEvents, goalEventTimelineHTML, matchAwardsHTML } from './goal-events.js';
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
    cont.innerHTML = '<div class="empty-state">Match not found.</div>';
    return;
  }

  const season = state.db.seasons.find(s => s.id === m.season);
  const date = m.date ? new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  if (sub) sub.textContent = `${date} · ${season ? season.name : 'Unknown season'}`;

  let resultBadge = 'DRAW';
  if (m.goals1 > m.goals2) resultBadge = `${m.player1} wins`;
  else if (m.goals2 > m.goals1) resultBadge = `${m.player2} wins`;

  const events = getMatchGoalEvents(m.id);

  cont.innerHTML = `
    <div class="match-details-card">
      <div class="match-details-score">
        <span class="md-player">${esc(m.player1)}</span>
        <span class="md-score">${m.goals1} — ${m.goals2}</span>
        <span class="md-player">${esc(m.player2)}</span>
      </div>
      <div class="match-details-meta">${esc(resultBadge)}</div>
      ${matchAwardsHTML(m.id)}
      <div class="panel mt-16">
        <div class="panel-header">⚽ GOALS</div>
        <div class="panel-body">
          ${events.length ? goalEventTimelineHTML(m.id) : '<div class="empty-state">No goal events recorded for this match.</div>'}
        </div>
      </div>
      ${isAdmin() ? `<div class="form-actions mt-16">
        <button class="btn-sm edit" onclick="League.openEditModal('${m.id}')">✏️ Edit match</button>
      </div>` : ''}
    </div>`;
}
