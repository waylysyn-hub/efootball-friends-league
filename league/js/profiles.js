import { displayName, playerInitials } from '../../shared/locale.js';
import { NICKNAMES, state } from './state.js';
import { esc, formatDate } from './ui.js';
import { selectAchievementsPlayer } from './achievements.js';
import { computePlayerStats } from './standings.js';

export function getPlayers() {
  const names = Object.keys(state.db.accounts || {});
  return names.length ? names.sort((a, b) => a.localeCompare(b)) : [];
}

export function playerId(name) { return state.db.accounts[name]?.id || null; }

export function nick(name) { return NICKNAMES[name] ? NICKNAMES[name].nick : ''; }

export function playerLegendLabel(name) {
  const n = NICKNAMES[name];
  return n ? `${n.icon} ${n.nick}` : displayName(name);
}

export function matchPlayerLabel(name) {
  return esc(displayName(name));
}

export function fillPlayerSelect(selectEl, emptyLabel) {
  if (!selectEl) return;
  const prev = selectEl.value;
  selectEl.innerHTML = emptyLabel ? `<option value="">${emptyLabel}</option>` : '';
  getPlayers().forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = displayName(p);
    selectEl.appendChild(opt);
  });
  if (prev && [...selectEl.options].some(o => o.value === prev)) selectEl.value = prev;
}

export function populateMatchPlayerDropdowns() {
  fillPlayerSelect(document.getElementById('matchPlayer1'), "اختر اللاعب");
  fillPlayerSelect(document.getElementById('matchPlayer2'), "اختر اللاعب");
  fillPlayerSelect(document.getElementById('editPlayer1'), null);
  fillPlayerSelect(document.getElementById('editPlayer2'), null);
}

export function populateAllPlayerDropdowns() {
  fillPlayerSelect(document.getElementById('loginUsername'), "— اختر اللاعب —");
  populateMatchPlayerDropdowns();
  fillPlayerSelect(document.getElementById('historyFilterPlayer'), "كل اللاعبين");
  fillPlayerSelect(document.getElementById('h2hPlayer1'), "اللاعب الأول");
  fillPlayerSelect(document.getElementById('h2hPlayer2'), "اللاعب الثاني");

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
          `<button class="player-tab${i === 0 ? ' active' : ''}" type="button" data-player="${esc(p)}">${esc(displayName(p))}</button>`
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
          `<button class="player-tab${i === 0 ? ' active' : ''}" type="button" data-player="${esc(p)}">${esc(displayName(p))}</button>`
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
      <div class="profile-avatar">${esc(playerInitials(name))}</div>
      <div class="profile-info">
        <h3>${esc(displayName(name))}</h3>
        ${nickChip(name, true)}
        <div class="profile-rank">نسبة الفوز: ${s.winRate}% · النقاط: ${s.points}</div>
      </div>
    </div>
    <div class="profile-stats-grid">
      ${statItem("المباريات", s.played)}
      ${statItem("الانتصارات", s.wins, 'neon')}
      ${statItem("التعادلات", s.draws)}
      ${statItem("الهزائم", s.losses, 'red')}
      ${statItem("الأهداف المسجّلة", s.goalsFor, 'neon')}
      ${statItem("الأهداف المستقبَلة", s.goalsAgainst, 'red')}
      ${statItem("فارق الأهداف", (s.goalDiff >= 0 ? '+' : '') + s.goalDiff, s.goalDiff >= 0 ? 'neon' : 'red')}
      ${statItem("نسبة الفوز", s.winRate + '%', 'gold')}
      ${statItem("متوسط الأهداف للمباراة", s.avgGoals)}
      ${statItem("الانتصارات المتتالية", s.currentStreak)}
      ${statItem("أفضل سلسلة انتصارات", s.bestStreak)}
      ${statItem("شباك نظيفة", s.cleanSheets)}
      ${statItem("النقاط", s.points, 'neon')}
      ${statItem("ألقاب المواسم", s.seasonWins, 'gold')}
      ${s.biggestWin ? statItem("أكبر فوز", `${s.biggestWin.gf}–${s.biggestWin.ga} ضد ${displayName(s.biggestWin.opp)}`, 'neon') : statItem("أكبر فوز", '—')}
      ${s.biggestLoss ? statItem("أكبر خسارة", `${s.biggestLoss.gf}–${s.biggestLoss.ga} ضد ${displayName(s.biggestLoss.opp)}`, 'red') : statItem("أكبر خسارة", '—')}
    </div>
    ${recentMatches.length > 0 ? `
    <div class="panel mt-16">
      <div class="panel-header">⚽ أحدث المباريات</div>
      <div class="panel-body">
        ${recentMatches.map(m => `
          <div class="recent-match-mini">
            <strong>${esc(displayName(m.player1))}</strong>
            <span class="recent-match-score"> <bdi>${m.goals1}</bdi> — <bdi>${m.goals2}</bdi> </span>
            <strong>${esc(displayName(m.player2))}</strong>
            <span class="text-dim profile-match-date">${formatDate(m.date)}</span>
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
