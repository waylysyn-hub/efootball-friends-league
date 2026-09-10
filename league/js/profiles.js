import { NICKNAMES, state } from './state.js';
import { esc, formatDate } from './ui.js';
import { selectAchievementsPlayer } from './achievements.js';
import { computePlayerStats } from './standings.js';

export function getPlayers() {
  const names = Object.keys(state.db.accounts || {});
  return names.length ? names.sort((a, b) => a.localeCompare(b)) : [];
}

export function nick(name) { return NICKNAMES[name] ? NICKNAMES[name].nick : ''; }

export function playerLegendLabel(name) {
  const n = NICKNAMES[name];
  return n ? `${n.icon} ${n.nick}` : name;
}

export function matchPlayerLabel(name) {
  return esc(name);
}

export function fillPlayerSelect(selectEl, emptyLabel) {
  if (!selectEl) return;
  const prev = selectEl.value;
  selectEl.innerHTML = emptyLabel ? `<option value="">${emptyLabel}</option>` : '';
  getPlayers().forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    selectEl.appendChild(opt);
  });
  if (prev && [...selectEl.options].some(o => o.value === prev)) selectEl.value = prev;
}

export function populateMatchPlayerDropdowns() {
  fillPlayerSelect(document.getElementById('matchPlayer1'), 'Select Player');
  fillPlayerSelect(document.getElementById('matchPlayer2'), 'Select Player');
  fillPlayerSelect(document.getElementById('editPlayer1'), null);
  fillPlayerSelect(document.getElementById('editPlayer2'), null);
}

export function populateAllPlayerDropdowns() {
  fillPlayerSelect(document.getElementById('loginUsername'), '— SELECT PLAYER —');
  populateMatchPlayerDropdowns();
  fillPlayerSelect(document.getElementById('historyFilterPlayer'), 'All Players');
  fillPlayerSelect(document.getElementById('h2hPlayer1'), 'Player 1');
  fillPlayerSelect(document.getElementById('h2hPlayer2'), 'Player 2');

  const login = document.getElementById('loginUsername');
  if (!login.value) login.value = window.EFLAuth.lastPlayer();
  renderPlayerTabBars();
}

export function renderPlayerTabBars() {
  const players = getPlayers();
  const profileTabs = document.getElementById('profilePlayerTabs');
  const achTabs = document.getElementById('achievementsPlayerTabs');

  if (profileTabs) {
    profileTabs.innerHTML = players
      .map(
        (p, i) =>
          `<button class="player-tab${i === 0 ? ' active' : ''}" type="button" data-player="${esc(p)}">${esc(p)}</button>`
      )
      .join('');
    profileTabs.querySelectorAll('.player-tab').forEach((btn) => {
      btn.addEventListener('click', () => selectProfilePlayer(btn.dataset.player, btn));
    });
  }

  if (achTabs) {
    achTabs.innerHTML = players
      .map(
        (p, i) =>
          `<button class="player-tab${i === 0 ? ' active' : ''}" type="button" data-player="${esc(p)}">${esc(p)}</button>`
      )
      .join('');
    achTabs.querySelectorAll('.player-tab').forEach((btn) => {
      btn.addEventListener('click', () => selectAchievementsPlayer(btn.dataset.player, btn));
    });
  }
}

export function nickChip(name, big = false) {
  const n = NICKNAMES[name];
  if (!n) return '';
  return `<span class="nick-chip${big ? ' lg' : ''}">` +
    `<span class="nick-chip-icon">${n.icon}</span>` +
    `<span class="nick-chip-text">${esc(n.nick)}</span></span>`;
}

export function selectProfilePlayer(name, btn) {
  state.selectedProfile = name;
  btn ||= [...document.querySelectorAll('#profilePlayerTabs .player-tab')].find(button => button.dataset.player === name);
  document.querySelectorAll('#profilePlayerTabs .player-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const s = computePlayerStats(name);
  const matches = state.db.matches.filter(m => m.player1 === name || m.player2 === name);
  const recentMatches = [...matches].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);

  const html = `
    <div class="profile-header">
      <div class="profile-avatar">${name.charAt(0)}</div>
      <div class="profile-info">
        <h3>${esc(name)}</h3>
        ${nickChip(name, true)}
        <div class="profile-rank">${s.winRate}% win rate · ${s.points} points</div>
      </div>
    </div>
    <div class="profile-stats-grid">
      ${statItem('PLAYED', s.played)}
      ${statItem('WINS', s.wins, 'neon')}
      ${statItem('DRAWS', s.draws)}
      ${statItem('LOSSES', s.losses, 'red')}
      ${statItem('GOALS SCORED', s.goalsFor, 'neon')}
      ${statItem('GOALS CONCEDED', s.goalsAgainst, 'red')}
      ${statItem('GOAL DIFF', (s.goalDiff >= 0 ? '+' : '') + s.goalDiff, s.goalDiff >= 0 ? 'neon' : 'red')}
      ${statItem('WIN RATE', s.winRate + '%', 'gold')}
      ${statItem('AVG GOALS/MATCH', s.avgGoals)}
      ${statItem('WIN STREAK', s.currentStreak)}
      ${statItem('BEST STREAK', s.bestStreak)}
      ${statItem('CLEAN SHEETS', s.cleanSheets)}
      ${statItem('POINTS', s.points, 'neon')}
      ${statItem('SEASON TITLES', s.seasonWins, 'gold')}
      ${s.biggestWin ? statItem('BIGGEST WIN', `${s.biggestWin.gf}–${s.biggestWin.ga} vs ${s.biggestWin.opp}`, 'neon') : statItem('BIGGEST WIN', '—')}
      ${s.biggestLoss ? statItem('BIGGEST LOSS', `${s.biggestLoss.gf}–${s.biggestLoss.ga} vs ${s.biggestLoss.opp}`, 'red') : statItem('BIGGEST LOSS', '—')}
    </div>
    ${recentMatches.length > 0 ? `
    <div class="panel mt-16">
      <div class="panel-header">⚽ RECENT MATCHES</div>
      <div class="panel-body">
        ${recentMatches.map(m => `
          <div class="recent-match-mini">
            <strong>${esc(m.player1)}</strong>
            <span class="recent-match-score"> ${m.goals1}–${m.goals2} </span>
            <strong>${esc(m.player2)}</strong>
            <span class="text-dim" style="float:right;font-size:.8em">${formatDate(m.date)}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}`;

  document.getElementById('profileContent').innerHTML = html;
}

export function statItem(label, value, color = '') {
  const colorClass = color === 'neon' ? 'text-neon' : color === 'red' ? 'text-red' : color === 'gold' ? 'text-gold' : '';
  return `<div class="profile-stat-item">
    <div class="psi-label">${label}</div>
    <div class="psi-value ${colorClass}">${esc(String(value))}</div>
  </div>`;
}
