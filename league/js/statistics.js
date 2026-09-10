import { populateSeasonDropdowns } from './seasons.js';
import { state } from './state.js';
import { computeFootballPlayerStats, fbPlayerKey, getMatchIdsForSeason, getSeasonStatTotals } from './goal-events.js';
import { esc, formatDate } from './ui.js';
import { getPlayers } from './profiles.js';
import { computePlayerStats } from './standings.js';

export function renderFootballStats() {
  populateSeasonDropdowns();
  const seasonSel = document.getElementById('fbStatsSeasonFilter');

  const contLb = document.getElementById('fbLeaderboards');
  const contTbl = document.getElementById('fbStatsTable');
  const detail = document.getElementById('fbPlayerDetail');
  if (!contLb || !contTbl) return;

  if (!state.goalsReady) {
    contLb.innerHTML = '';
    contTbl.innerHTML = `<div class="qa-setup-banner">
      <h3>⚠️ Goal events table required</h3>
      <p>Run <code>supabase-match-goal-events-migration.sql</code> in Supabase SQL Editor.</p>
    </div>`;
    if (detail) detail.classList.add('hidden');
    return;
  }

  const filter = seasonSel?.value || 'all';
  const search = (document.getElementById('fbPlayerSearch')?.value || '').trim().toLowerCase();
  let players = computeFootballPlayerStats(filter);
  if (search) players = players.filter(p => p.name.toLowerCase().includes(search));

  const topG = [...players].sort((a, b) => b.goals - a.goals).slice(0, 5);
  const topA = [...players].sort((a, b) => b.assists - a.assists).slice(0, 5);
  const topC = [...players].sort((a, b) => b.contributions - a.contributions).slice(0, 5);

  const lbCard = (title, icon, rows, valKey) => {
    if (!rows.length || rows[0][valKey] === 0) {
      return `<div class="fb-lb-card"><div class="fb-lb-title">${icon} ${title}</div><p class="text-dim">No data yet</p></div>`;
    }
    return `<div class="fb-lb-card">
      <div class="fb-lb-title">${icon} ${title}</div>
      <ol class="fb-lb-list">${rows.map((r, i) =>
        `<li><span class="fb-lb-rank">${i + 1}</span> <strong>${esc(r.name)}</strong> <span class="fb-lb-val">${r[valKey]}</span></li>`
      ).join('')}</ol>
    </div>`;
  };

  contLb.innerHTML = `
    <div class="fb-lb-grid">
      ${lbCard('Top Scorers', '⚽', topG, 'goals')}
      ${lbCard('Top Assists', '🎯', topA, 'assists')}
      ${lbCard('Goal Contributions', '⭐', topC, 'contributions')}
    </div>`;

  if (!players.length) {
    contTbl.innerHTML = '<div class="empty-state">No football player stats yet. Record matches with goal events.</div>';
    if (detail) detail.classList.add('hidden');
    return;
  }

  contTbl.innerHTML = `
    <table class="league-table fb-stats-table">
      <thead>
        <tr>
          <th>Player</th><th>G</th><th>A</th><th>G+A</th><th>Matches</th><th>G/M</th>
        </tr>
      </thead>
      <tbody>
        ${players.map(p => `<tr class="fb-row-click" data-football-player="${esc(p.name)}" tabindex="0">
          <td><strong>${esc(p.name)}</strong></td>
          <td>${p.goals}</td>
          <td>${p.assists}</td>
          <td>${p.contributions}</td>
          <td>${p.matches}</td>
          <td>${p.gpg.toFixed(2)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

export function showFootballPlayerDetail(name) {
  const detail = document.getElementById('fbPlayerDetail');
  if (!detail) return;
  const filter = document.getElementById('fbStatsSeasonFilter')?.value || 'all';
  const matchIds = getMatchIdsForSeason(filter);
  const key = fbPlayerKey(name);

  const goals = [];
  const assists = [];
  state.db.goalEvents.filter(e => matchIds.has(e.matchId)).forEach(e => {
    const m = state.db.matches.find(x => x.id === e.matchId);
    if (!m) return;
    if (fbPlayerKey(e.scorer) === key) goals.push({ e, m });
    if (e.assist && fbPlayerKey(e.assist) === key) assists.push({ e, m });
  });

  const matchSet = new Set([...goals, ...assists].map(x => x.m.id));
  const gpg = matchSet.size ? (goals.length / matchSet.size).toFixed(2) : '0.00';

  detail.classList.remove('hidden');
  detail.innerHTML = `
    <div class="panel">
      <div class="panel-header">👤 ${esc(name)}</div>
      <div class="panel-body">
        <div class="fb-detail-stats">
          <span>⚽ ${goals.length} goals</span>
          <span>🎯 ${assists.length} assists</span>
          <span>📋 ${matchSet.size} matches</span>
          <span>📈 ${gpg} goals/match</span>
        </div>
        ${goals.length ? `<h4 class="fb-detail-h4">Goals</h4>
          <ul class="fb-detail-list">${goals.sort((a,b)=>a.e.minute-b.e.minute).map(({e,m}) =>
            `<li>${e.minute ? e.minute + "'" : '—'} vs ${esc(m.player1 === e.owner ? m.player2 : m.player1)} (${esc(e.owner)})${e.assist ? ' · A: ' + esc(e.assist) : ''}</li>`
          ).join('')}</ul>` : ''}
        ${assists.length ? `<h4 class="fb-detail-h4">Assists</h4>
          <ul class="fb-detail-list">${assists.map(({e,m}) =>
            `<li>${e.minute ? e.minute + "'" : '—'} ${esc(e.scorer)} (${esc(e.owner)})</li>`
          ).join('')}</ul>` : ''}
        <button type="button" class="btn-sm mt-8" onclick="document.getElementById('fbPlayerDetail').classList.add('hidden')">Close</button>
      </div>
    </div>`;
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function renderH2H() {
  const p1 = document.getElementById('h2hPlayer1')?.value;
  const p2 = document.getElementById('h2hPlayer2')?.value;
  const cont = document.getElementById('h2hContent');
  if (!cont) return;

  if (!p1 || !p2) {
    cont.innerHTML = '<div class="empty-state">Select two players to compare</div>';
    return;
  }
  if (p1 === p2) {
    cont.innerHTML = '<div class="empty-state">Please select two different players</div>';
    return;
  }

  const matches = state.db.matches.filter(m =>
    (m.player1 === p1 && m.player2 === p2) || (m.player1 === p2 && m.player2 === p1)
  ).sort((a, b) => b.timestamp - a.timestamp);

  let p1wins = 0, p2wins = 0, draws = 0, p1goals = 0, p2goals = 0;

  matches.forEach(m => {
    const isP1first = m.player1 === p1;
    const g1 = isP1first ? m.goals1 : m.goals2;
    const g2 = isP1first ? m.goals2 : m.goals1;
    p1goals += g1; p2goals += g2;
    if (g1 > g2) p1wins++;
    else if (g2 > g1) p2wins++;
    else draws++;
  });

  const total = matches.length;

  cont.innerHTML = `
    <div class="h2h-panel">
      <div class="panel-header">⚔️ OVERALL RECORD</div>
      <div class="panel-body">
        <div class="h2h-stat-grid">
          <div class="h2h-player-col">
            <h3>${esc(p1)}</h3>
            <div class="h2h-big-stat">${p1wins}</div>
            <div class="text-dim">Wins</div>
          </div>
          <div class="h2h-vs-col">
            <div style="margin-bottom:4px">TOTAL<br><span style="font-size:1.5rem;color:var(--neon)">${total}</span></div>
            <div>DRAWS<br><span style="font-size:1.2rem;color:var(--gold)">${draws}</span></div>
          </div>
          <div class="h2h-player-col">
            <h3>${esc(p2)}</h3>
            <div class="h2h-big-stat">${p2wins}</div>
            <div class="text-dim">Wins</div>
          </div>
        </div>
        <div class="h2h-row">
          <div>${p1goals}</div>
          <div class="label">GOALS</div>
          <div>${p2goals}</div>
        </div>
        <div class="h2h-row">
          <div>${total > 0 ? (p1goals / total).toFixed(1) : '0'}</div>
          <div class="label">AVG GOALS/M</div>
          <div>${total > 0 ? (p2goals / total).toFixed(1) : '0'}</div>
        </div>
        <div class="h2h-row">
          <div>${total > 0 ? ((p1wins / total) * 100).toFixed(0) : '0'}%</div>
          <div class="label">WIN RATE</div>
          <div>${total > 0 ? ((p2wins / total) * 100).toFixed(0) : '0'}%</div>
        </div>
      </div>
    </div>
    ${matches.length > 0 ? `
    <div class="h2h-panel">
      <div class="panel-header">📋 LAST MATCHES</div>
      <div class="panel-body">
        ${matches.slice(0, 8).map(m => {
          const isP1first = m.player1 === p1;
          const g1 = isP1first ? m.goals1 : m.goals2;
          const g2 = isP1first ? m.goals2 : m.goals1;
          let badge = `<span class="win-badge draw">DRAW</span>`;
          if (g1 > g2) badge = `<span class="win-badge win">${esc(p1)} W</span>`;
          else if (g2 > g1) badge = `<span class="win-badge win">${esc(p2)} W</span>`;
          return `<div class="match-card" style="margin-bottom:8px">
            <div class="match-card-header"><span>${formatDate(m.date)}</span> | ${badge}</div>
            <div class="match-card-result">
              <div class="match-player">${esc(p1)}</div>
              <div class="match-score">${g1} — ${g2}</div>
              <div class="match-player right">${esc(p2)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '<div class="empty-state">No matches between these players yet</div>'}`;
}

export function renderRivalries() {
  const cont = document.getElementById('rivalriesContent');
  if (!cont) return;

  const pairs = Object.create(null);
  state.db.matches.forEach(m => {
    const key = [m.player1, m.player2].sort().join('|');
    if (!pairs[key]) pairs[key] = { p1: m.player1.localeCompare(m.player2) <= 0 ? m.player1 : m.player2,
                                    p2: m.player1.localeCompare(m.player2) <= 0 ? m.player2 : m.player1,
                                    matches: [], totalGoals: 0, wins1: 0, wins2: 0, draws: 0 };
    pairs[key].matches.push(m);
  });

  Object.values(pairs).forEach(pair => {
    pair.matches.forEach(m => {
      const isP1 = m.player1 === pair.p1 || m.player2 === pair.p2 ? m.player1 === pair.p1 : false;
      const g1 = (m.player1 === pair.p1) ? m.goals1 : m.goals2;
      const g2 = (m.player2 === pair.p2) ? m.goals2 : m.goals1;
      pair.totalGoals += m.goals1 + m.goals2;
      if (m.goals1 > m.goals2) {
        if (m.player1 === pair.p1) pair.wins1++; else pair.wins2++;
      } else if (m.goals2 > m.goals1) {
        if (m.player2 === pair.p2) pair.wins2++; else pair.wins1++;
      } else {
        pair.draws++;
      }
    });
    pair.count = pair.matches.length;
    pair.winDiff = Math.abs(pair.wins1 - pair.wins2);
    pair.avgGoals = pair.count > 0 ? pair.totalGoals / pair.count : 0;
  });

  const pairArr = Object.values(pairs).filter(p => p.count > 0);
  if (pairArr.length === 0) {
    cont.innerHTML = '<div class="empty-state">No matches recorded yet. Rivalries will appear automatically.</div>';
    return;
  }

  const mostPlayed = [...pairArr].sort((a, b) => b.count - a.count)[0];
  const closest = [...pairArr].sort((a, b) => a.winDiff - b.winDiff)[0];
  const highestScoring = [...pairArr].sort((a, b) => b.avgGoals - a.avgGoals)[0];

  const rivalryCard = (icon, title, pair, desc) => `
    <div class="rivalry-card">
      <div class="rivalry-title">${icon} ${title}</div>
      <div class="rivalry-matchup">${esc(pair.p1)} vs ${esc(pair.p2)}</div>
      <div class="rivalry-stats">
        <span>${esc(pair.p1)} wins: <span>${pair.wins1}</span></span>
        <span>${esc(pair.p2)} wins: <span>${pair.wins2}</span></span>
        <span>Draws: <span>${pair.draws}</span></span>
        <span>Total Matches: <span>${pair.count}</span></span>
        <span>${desc}</span>
      </div>
    </div>`;

  cont.innerHTML = `
    ${rivalryCard('⚡', 'MOST PLAYED RIVALRY', mostPlayed, `${mostPlayed.count} matches total`)}
    ${rivalryCard('⚔️', 'CLOSEST RIVALRY', closest, `Win difference: ${closest.winDiff}`)}
    ${rivalryCard('🎯', 'HIGHEST SCORING RIVALRY', highestScoring, `Avg ${highestScoring.avgGoals.toFixed(1)} goals/match`)}
    ${pairArr.length > 3 ? `<div class="panel mt-16">
      <div class="panel-header">📊 ALL RIVALRIES</div>
      <div class="panel-body">
        ${pairArr.sort((a,b)=>b.count-a.count).map(pair=>`
          <div class="mini-standings-row">
            <span class="mini-name">${esc(pair.p1)} vs ${esc(pair.p2)}</span>
            <span style="color:var(--text-secondary);font-size:.8em;font-family:'Share Tech Mono'">${pair.count} matches</span>
          </div>`).join('')}
      </div>
    </div>` : ''}`;
}

export function renderStatistics() {
  populateSeasonDropdowns();
  const filter = document.getElementById('statsSeasonFilter')?.value || 'all';
  const cont = document.getElementById('statsContent');
  if (!cont) return;

  const stats = getPlayers().map(p => {
    const s = computePlayerStats(p, filter);
    const ms = getSeasonStatTotals(p, filter);
    return {
      player: p, goals: s.goalsFor, wins: s.wins, points: s.points, goalDiff: s.goalDiff,
      played: s.played, assists: ms.assists, sessionGoals: ms.goals
    };
  });

  const maxGoals = Math.max(...stats.map(s => s.goals), 1);
  const maxWins = Math.max(...stats.map(s => s.wins), 1);
  const maxPts = Math.max(...stats.map(s => s.points), 1);
  const maxGD = Math.max(...stats.map(s => Math.abs(s.goalDiff)), 1);
  const maxAssists = Math.max(...stats.map(s => s.assists), 1);
  const maxSessionG = Math.max(...stats.map(s => s.sessionGoals), 1);

  const barChart = (data, maxVal, valueKey, color) => `
    <div class="chart-bar-container">
      ${data.sort((a, b) => b[valueKey] - a[valueKey]).map(d => {
        const pct = maxVal > 0 ? (Math.abs(d[valueKey]) / maxVal) * 100 : 0;
        return `<div class="chart-bar-row">
          <div class="chart-bar-label">${esc(d.player)}</div>
          <div class="chart-bar-track">
            <div class="chart-bar-fill ${color}${d[valueKey] < 0 ? ' negative' : ''}" style="width:${pct}%"></div>
          </div>
          <span class="chart-value">${d[valueKey]}</span>
        </div>`;
      }).join('')}
    </div>`;

  cont.innerHTML = `
    <div class="stats-grid">
      <div class="chart-section">
        <div class="chart-title">⚽ GOALS SCORED</div>
        ${barChart(stats, maxGoals, 'goals', '')}
      </div>
      <div class="chart-section">
        <div class="chart-title">🏆 WINS</div>
        ${barChart(stats, maxWins, 'wins', 'blue')}
      </div>
      <div class="chart-section">
        <div class="chart-title">📊 POINTS</div>
        ${barChart(stats, maxPts, 'points', 'orange')}
      </div>
      <div class="chart-section">
        <div class="chart-title">📈 GOAL DIFFERENCE</div>
        ${barChart(stats, maxGD, 'goalDiff', 'purple')}
      </div>
      ${(state.goalsReady || state.statsReady) ? `
      <div class="chart-section">
        <div class="chart-title">🎯 ASSISTS (goal events)</div>
        ${barChart(stats, maxAssists, 'assists', 'blue')}
      </div>
      <div class="chart-section">
        <div class="chart-title">⚽ SESSION GOALS (goal events)</div>
        ${barChart(stats, maxSessionG, 'sessionGoals', '')}
      </div>` : ''}
    </div>`;
}
