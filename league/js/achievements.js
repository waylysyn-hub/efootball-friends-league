import { populateSeasonDropdowns } from './seasons.js';
import { computeLeagueTable, computePlayerStats } from './standings.js';
import { getPlayers } from './profiles.js';
import { esc } from './ui.js';
import { ACHIEVEMENT_DEFS, state } from './state.js';

export function renderAwards() {
  populateSeasonDropdowns();
  const filter = document.getElementById('awardsSeasonFilter')?.value || 'all';
  const cont = document.getElementById('awardsContent');
  if (!cont) return;

  const table = computeLeagueTable(filter);
  const hasData = table.some(t => t.played > 0);

  const scorers = getPlayers().map(p => ({ player: p, goals: computePlayerStats(p, filter).goalsFor }))
                         .sort((a, b) => b.goals - a.goals);
  const defenders = getPlayers().map(p => { const s = computePlayerStats(p, filter); return { player: p, ga: s.goalsAgainst, played: s.played }; })
    .filter(p => p.played > 0).sort((a, b) => a.ga - b.ga);
  const winners = getPlayers().map(p => ({ player: p, wins: computePlayerStats(p, filter).wins }))
                         .sort((a, b) => b.wins - a.wins);

  // MVP: points * 0.5 + goals * 0.3 + wins * 0.2
  const mvpScores = getPlayers().map(p => {
    const s = computePlayerStats(p, filter);
    const score = s.points * 0.5 + s.goalsFor * 0.3 + s.wins * 0.2;
    return { player: p, score, played: s.played };
  }).filter(p => p.played > 0).sort((a, b) => b.score - a.score);

  const awards = [
    { icon: '🏆', title: 'CHAMPION', winner: hasData && table[0].played > 0 ? table[0].player : null, desc: hasData ? `${table[0].points} points` : 'No matches yet' },
    { icon: '⚽', title: 'TOP SCORER', winner: (scorers[0]?.goals || 0) > 0 ? scorers[0].player : null, desc: `${(scorers[0]?.goals || 0)} goals` },
    { icon: '🧱', title: 'BEST DEFENSE', winner: defenders[0] ? defenders[0].player : null, desc: defenders[0] ? `${defenders[0].ga} goals conceded` : 'No matches yet' },
    { icon: '🔥', title: 'MOST WINS', winner: (winners[0]?.wins || 0) > 0 ? winners[0].player : null, desc: `${(winners[0]?.wins || 0)} wins` },
    { icon: '👑', title: 'MVP', winner: mvpScores[0] ? mvpScores[0].player : null, desc: mvpScores[0] ? `Score: ${mvpScores[0].score.toFixed(1)}` : 'No matches yet' },
  ];

  cont.innerHTML = `<div class="awards-grid">
    ${awards.map(a => `
      <div class="award-card">
        <span class="award-icon">${a.icon}</span>
        <div class="award-title">${a.title}</div>
        <div class="award-winner">${a.winner ? esc(a.winner) : '—'}</div>
        <div class="award-desc">${a.desc}</div>
      </div>`).join('')}
  </div>`;
}

export function selectAchievementsPlayer(name, btn) {
  state.selectedAchievements = name;
  btn ||= [...document.querySelectorAll('#achievementsPlayerTabs .player-tab')].find(button => button.dataset.player === name);
  document.querySelectorAll('#achievementsPlayerTabs .player-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const s = computePlayerStats(name);
  const unlockedIds = state.db.achievements.filter(row => row.player === name).map(row => row.achievement_id);

  document.getElementById('achievementsContent').innerHTML = `
    <div class="achievements-grid">
      ${ACHIEVEMENT_DEFS.map(a => {
        const isUnlocked = unlockedIds.includes(a.id);
        return `<div class="achievement-badge ${isUnlocked ? 'unlocked' : 'locked'}">
          ${isUnlocked ? '<span class="unlocked-stamp">✓</span>' : ''}
          <span class="achievement-icon">${a.icon}</span>
          <div class="achievement-name">${a.name}</div>
          <div class="achievement-desc">${a.desc}</div>
        </div>`;
      }).join('')}
    </div>`;
}
