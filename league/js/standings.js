import { state } from './state.js';
import { getPlayers, nickChip } from './profiles.js';
import { populateSeasonDropdowns } from './seasons.js';
import { esc } from './ui.js';

export function computePlayerStats(playerName, seasonFilter = 'all', countSeasonWins = true) {
  let matches = state.db.matches.filter(m =>
    (m.player1 === playerName || m.player2 === playerName) &&
    (seasonFilter === 'all' || m.season === seasonFilter)
  );

  let played = 0, wins = 0, draws = 0, losses = 0;
  let goalsFor = 0, goalsAgainst = 0, cleanSheets = 0;
  let biggestWin = null, biggestLoss = null;
  let currentStreak = 0, bestStreak = 0, tempStreak = 0;
  let seasonWins = 0;

  const chronological = [...matches].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));

  chronological.forEach(m => {
    played++;
    const isP1 = m.player1 === playerName;
    const gf = isP1 ? m.goals1 : m.goals2;
    const ga = isP1 ? m.goals2 : m.goals1;
    const diff = gf - ga;

    goalsFor += gf;
    goalsAgainst += ga;
    if (ga === 0) cleanSheets++;

    if (diff > 0) {
      wins++;
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
      if (!biggestWin || diff > biggestWin.diff)
        biggestWin = { opp: isP1 ? m.player2 : m.player1, gf, ga, diff, id: m.id };
    } else if (diff === 0) {
      draws++;
      tempStreak = 0;
    } else {
      losses++;
      tempStreak = 0;
      if (!biggestLoss || diff < biggestLoss.diff)
        biggestLoss = { opp: isP1 ? m.player2 : m.player1, gf, ga, diff, id: m.id };
    }
  });

  currentStreak = tempStreak;

  // Season wins (count how many seasons this player topped the table).
  if (countSeasonWins) {
    state.db.seasons.forEach(s => {
      const sTable = computeLeagueTable(s.id);
      if (sTable.length > 0 && sTable[0].played > 0 && sTable[0].player === playerName) seasonWins++;
    });
  }

  const winRate = played > 0 ? ((wins / played) * 100).toFixed(1) : '0.0';
  const avgGoals = played > 0 ? (goalsFor / played).toFixed(2) : '0.00';

  return {
    played, wins, draws, losses,
    goalsFor, goalsAgainst,
    goalDiff: goalsFor - goalsAgainst,
    cleanSheets,
    winRate, avgGoals,
    currentStreak, bestStreak, seasonWins,
    biggestWin, biggestLoss,
    points: wins * 3 + draws
  };
}

export function computeLeagueTable(seasonFilter = 'all') {
  const table = getPlayers().map(p => {
    const s = computePlayerStats(p, seasonFilter, false);
    return {
      player: p,
      played: s.played, wins: s.wins, draws: s.draws, losses: s.losses,
      goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst,
      goalDiff: s.goalDiff,
      points: s.points
    };
  });

  table.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    return b.goalsFor - a.goalsFor || a.player.localeCompare(b.player);
  });

  return table;
}

export function renderLeagueTable() {
  populateSeasonDropdowns();
  const filter = document.getElementById('tableSeasonFilter')?.value || 'all';
  const table = computeLeagueTable(filter);
  const tbody = document.getElementById('leagueTableBody');
  if (!tbody) return;

  tbody.innerHTML = table.map((r, i) => {
    const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
    const badge = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : 'rn';
    const gdStr = r.goalDiff > 0 ? `<span class="gd-pos">+${r.goalDiff}</span>` :
                  r.goalDiff < 0 ? `<span class="gd-neg">${r.goalDiff}</span>` : '0';
    return `
      <tr class="${rankClass}">
        <td><span class="rank-badge ${badge}">${i + 1}</span></td>
        <td><div class="lt-player">${esc(r.player)}${nickChip(r.player) ? `<div class="lt-nick">${nickChip(r.player)}</div>` : ''}</div></td>
        <td>${r.played}</td>
        <td>${r.wins}</td>
        <td>${r.draws}</td>
        <td>${r.losses}</td>
        <td>${r.goalsFor}</td>
        <td>${r.goalsAgainst}</td>
        <td>${gdStr}</td>
        <td><span class="pts-cell">${r.points}</span></td>
      </tr>`;
  }).join('');
}
