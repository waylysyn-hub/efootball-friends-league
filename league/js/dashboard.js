import { emptyCompetition } from './view-states.js';
import { displayName, displaySeason } from '../../shared/locale.js';
import { getActiveSeason, populateSeasonDropdowns } from './seasons.js';
import { computeLeagueTable } from './standings.js';
import { state } from './state.js';
import { computeFootballPlayerStats } from './goal-events.js';
import { esc, formatDate } from './ui.js';
import { openMatchDetails } from './match-details.js';

export function renderDashboard() {
  const activeSeason = getActiveSeason();
  populateSeasonDropdowns();
  const filter = document.getElementById('dashboardSeasonFilter').value || 'all';
  const season = state.db.seasons.find(row => row.id === filter);
  const scope = season ? displaySeason(season.name) : 'كل المواسم';
  document.getElementById('dashCurrentSeason').textContent =
    scope + (season && season.id === activeSeason?.id && season.active ? ' · نشط' : '');

  // One standings pass supplies every account metric for the selected scope.
  // Avoid repeatedly recalculating each player's titles for dashboard cards.
  const table = computeLeagueTable(filter);
  const seasonMatches = state.db.matches.filter(m => filter === 'all' || m.season === filter);

  // Leader
  const leader = table[0];
  setStatCard('sc-leader', leader?.played ? leader.player : 'لم يُحسم بعد', leader ? leader.points + ' نقطة' : "0 نقطة");

  // Top scorer
  const footballers = computeFootballPlayerStats(filter);
  const topScorer = footballers.find(player => player.goals > 0);
  setStatCard('sc-scorer', topScorer?.name || 'لم يُسجّل بعد', topScorer
    ? `${topScorer.goals} هدف · فريق ${displayName(topScorer.owner)}${footballers.filter(p => p.goals === topScorer.goals).length > 1 ? ' · صدارة مشتركة' : ''}`
    : 'بانتظار تفاصيل الأهداف');

  // Best defense (fewest conceded among those who played)
  const defenders = table.filter(p => p.played > 0).sort((a, b) => a.goalsAgainst - b.goalsAgainst);
  setStatCard('sc-defense', defenders[0] ? defenders[0].player : 'لم يُحسم بعد',
              defenders[0] ? defenders[0].goalsAgainst + ' هدف مستقبَل' : "0 هدف مستقبَل");

  // Best attack
  const attackers = [...table].sort((a, b) => b.goalsFor - a.goalsFor);
  setStatCard('sc-attack', (attackers[0]?.goalsFor || 0) > 0 ? attackers[0].player : 'لم يُحسم بعد',
              (attackers[0]?.goalsFor || 0) + ' هدف مسجّل');

  // Most wins
  const winPlayers = [...table].sort((a, b) => b.wins - a.wins);
  setStatCard('sc-wins', (winPlayers[0]?.wins || 0) > 0 ? winPlayers[0].player : 'لم يُحسم بعد',
              (winPlayers[0]?.wins || 0) + ' فوز');

  // Total matches
  setStatCard('sc-matches', seasonMatches.length.toString(), scope);

  // Recent matches
  const recent = [...seasonMatches].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  const recentEl = document.getElementById('dashRecentMatches');
  if (recent.length === 0) {
    recentEl.innerHTML = emptyCompetition(filter === 'all' ? 'لم تُسجّل مباريات بعد.' : 'لا توجد مباريات في هذا الموسم بعد.');
  } else {
    recentEl.innerHTML = recent.map(m => {
      const season = state.db.seasons.find(s => s.id === m.season);
      return `<button type="button" class="recent-match-mini" data-recent-match="${esc(m.id)}" aria-label="عرض مباراة ${esc(displayName(m.player1))} ضد ${esc(displayName(m.player2))}، النتيجة ${m.goals1} مقابل ${m.goals2}، ${esc(formatDate(m.date))}">
        <span class="recent-match-meta"><time datetime="${esc(m.date || '')}">${esc(formatDate(m.date))}</time><span>${esc(season ? displaySeason(season.name) : 'موسم سابق')}</span></span>
        <span class="recent-match-result"><span class="recent-team">${esc(displayName(m.player1))}</span><span class="recent-match-score"><bdi>${m.goals1}</bdi><span aria-hidden="true">—</span><bdi>${m.goals2}</bdi></span><span class="recent-team">${esc(displayName(m.player2))}</span></span>
      </button>`;
    }).join('');
    recentEl.querySelectorAll('[data-recent-match]').forEach(button => {
      button.addEventListener('click', () => openMatchDetails(button.dataset.recentMatch));
    });
  }

  // Mini standings
  const standingsEl = document.getElementById('dashMiniStandings');
  if (table.every(t => t.played === 0)) {
    standingsEl.innerHTML = emptyCompetition();
  } else {
    standingsEl.innerHTML = table.map((r, i) => `
      <div class="mini-standings-row">
        <span class="mini-rank">${i + 1}</span>
        <span class="mini-name">${esc(displayName(r.player))}<span class="mini-played">${r.played} مباراة</span></span>
        <span class="mini-pts">${r.points} نقطة</span>
      </div>`).join('');
  }
}

export function setStatCard(id, value, sub) {
  const valEl = document.getElementById(id + '-val');
  const subEl = document.getElementById(id + '-sub');
  if (valEl) valEl.textContent = displayName(value);
  if (subEl) subEl.textContent = sub;
}
