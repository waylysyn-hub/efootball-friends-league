import { getActiveSeason } from './seasons.js';
import { computeLeagueTable, computePlayerStats } from './standings.js';
import { state } from './state.js';
import { getPlayers } from './profiles.js';
import { esc } from './ui.js';

export function renderDashboard() {
  const activeSeason = getActiveSeason();
  document.getElementById('dashCurrentSeason').textContent =
    activeSeason ? `${activeSeason.name} — Active` : 'No Active Season';

  const table = computeLeagueTable('all');
  const seasonMatches = activeSeason ? state.db.matches.filter(m => m.season === activeSeason.id) : [];

  // Leader
  const leader = table[0];
  setStatCard('sc-leader', leader?.played ? leader.player : '—', leader ? leader.points + ' pts' : '0 pts');

  // Top scorer
  const scorers = getPlayers().map(p => ({ player: p, goals: computePlayerStats(p).goalsFor }))
                         .sort((a, b) => b.goals - a.goals);
  setStatCard('sc-scorer', (scorers[0]?.goals || 0) > 0 ? scorers[0].player : '—',
              (scorers[0]?.goals || 0) + ' goals');

  // Best defense (fewest conceded among those who played)
  const defenders = getPlayers().map(p => { const s = computePlayerStats(p); return { player: p, ga: s.goalsAgainst, played: s.played }; })
    .filter(p => p.played > 0).sort((a, b) => a.ga - b.ga);
  setStatCard('sc-defense', defenders[0] ? defenders[0].player : '—',
              defenders[0] ? defenders[0].ga + ' conceded' : '0 conceded');

  // Best attack
  const attackers = [...scorers];
  setStatCard('sc-attack', (attackers[0]?.goals || 0) > 0 ? attackers[0].player : '—',
              (attackers[0]?.goals || 0) + ' scored');

  // Most wins
  const winPlayers = getPlayers().map(p => { const s = computePlayerStats(p); return { player: p, wins: s.wins }; })
                             .sort((a, b) => b.wins - a.wins);
  setStatCard('sc-wins', (winPlayers[0]?.wins || 0) > 0 ? winPlayers[0].player : '—',
              (winPlayers[0]?.wins || 0) + ' wins');

  // Total matches
  setStatCard('sc-matches', seasonMatches.length.toString(), 'this season');

  // Recent matches
  const recent = [...state.db.matches].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  const recentEl = document.getElementById('dashRecentMatches');
  if (recent.length === 0) {
    recentEl.innerHTML = '<div class="empty-state">No matches yet</div>';
  } else {
    recentEl.innerHTML = recent.map(m => `
      <div class="recent-match-mini">
        <span>${esc(m.player1)} <span class="recent-match-score">${m.goals1}—${m.goals2}</span> ${esc(m.player2)}</span>
      </div>`).join('');
  }

  // Mini standings
  const standingsEl = document.getElementById('dashMiniStandings');
  if (table.every(t => t.played === 0)) {
    standingsEl.innerHTML = '<div class="empty-state">No data yet</div>';
  } else {
    standingsEl.innerHTML = table.map((r, i) => `
      <div class="mini-standings-row">
        <span class="mini-rank">${i + 1}</span>
        <span class="mini-name">${esc(r.player)}</span>
        <span class="mini-pts">${r.points} pts</span>
      </div>`).join('');
  }
}

export function setStatCard(id, value, sub) {
  const valEl = document.getElementById(id + '-val');
  const subEl = document.getElementById(id + '-sub');
  if (valEl) valEl.textContent = value;
  if (subEl) subEl.textContent = sub;
}
