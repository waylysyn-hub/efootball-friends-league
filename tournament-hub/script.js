// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function teamById(teams, id) {
  return teams.find((t) => t.id === id) || { name: '?', abbreviation: '?', color_class: '' };
}

function rankBadge(rank) {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return 'default';
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(iso) {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function teamLogo(team, size) {
  const cls = team.color_class ? ` ${team.color_class}` : '';
  const style = size ? ` style="width:${size}px;height:${size}px;font-size:0.55rem;"` : '';
  return `<div class="hub-team-logo${cls}"${style}>${team.abbreviation}</div>`;
}

// ---------- Compute standings from fixtures ----------
function computeStandings(tournament, teams, fixtures) {
  const pts = {
    win: tournament.points_win ?? 3,
    draw: tournament.points_draw ?? 1,
    loss: tournament.points_loss ?? 0,
  };

  const stats = {};
  teams.forEach((t) => {
    stats[t.id] = { team: t, pld: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  });

  fixtures
    .filter((f) => f.status === 'completed' && f.home_score != null && f.away_score != null)
    .forEach((f) => {
      const h = stats[f.home_team_id];
      const a = stats[f.away_team_id];
      if (!h || !a) return;

      h.pld++;
      a.pld++;
      h.gf += f.home_score;
      h.ga += f.away_score;
      a.gf += f.away_score;
      a.ga += f.home_score;

      if (f.home_score > f.away_score) {
        h.w++;
        h.pts += pts.win;
        a.l++;
        a.pts += pts.loss;
      } else if (f.home_score < f.away_score) {
        a.w++;
        a.pts += pts.win;
        h.l++;
        h.pts += pts.loss;
      } else {
        h.d++;
        a.d++;
        h.pts += pts.draw;
        a.pts += pts.draw;
      }
    });

  return Object.values(stats)
    .map((s) => ({ ...s, gd: s.gf - s.ga }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.name.localeCompare(b.team.name))
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

function computeQuickStats(fixtures) {
  const completed = fixtures.filter(
    (f) => f.status === 'completed' && f.home_score != null && f.away_score != null
  );

  let totalGoals = 0;
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  completed.forEach((f) => {
    totalGoals += f.home_score + f.away_score;
    if (f.home_score > f.away_score) homeWins++;
    else if (f.home_score < f.away_score) awayWins++;
    else draws++;
  });

  const total = completed.length;

  return {
    total_matches: total,
    total_goals: totalGoals,
    goals_per_match: total ? (totalGoals / total).toFixed(2) : '0.00',
    home_wins: homeWins,
    draws,
    away_wins: awayWins,
  };
}

function computeTopScorers(scorers, teams, limit = 5) {
  const map = {};
  scorers.forEach((s) => {
    const key = s.user_id ?? s.player_name;
    if (!map[key]) {
      map[key] = { name: s.player_name || 'Unknown', team: teamById(teams, s.team_id), goals: 0 };
    }
    map[key].goals += s.goals ?? 1;
  });

  return Object.values(map)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, limit)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

// ---------- Render ----------
function renderTabs(tournament) {
  const type = tournament.type || 'league';
  const tabs = [
    { key: 'league', icon: '🏆', cls: 'gold', en: 'Current Season League', ar: 'الدوري الحالي' },
    { key: 'cup', icon: '🏆', cls: 'blue', en: 'Cup Tournament', ar: 'كأس البطولة' },
    { key: 'friendly', icon: '🤝', cls: 'green', en: 'Friendly Matches', ar: 'مباريات ودية' },
    { key: 'halloffame', icon: '🏛️', cls: 'purple', en: 'Hall of Fame', ar: 'قاعة المشاهير' },
  ];

  $('#tabs').innerHTML = tabs
    .map(
      (t) => `
    <button class="hub-tab${type === t.key ? ' active' : ''}" type="button">
      <div class="hub-tab-icon ${t.cls}">${t.icon}</div>
      <div class="hub-tab-label">${t.en}</div>
      <span class="hub-tab-label-ar">${t.ar}</span>
    </button>`
    )
    .join('');
}

function renderStandings(tournament, standings) {
  const subtitle =
    tournament.total_matchdays > 0
      ? `${tournament.season_name || 'Season'} &nbsp;|&nbsp; Matchday ${tournament.current_matchday || 0} / ${tournament.total_matchdays}`
      : tournament.season_name || '';

  if (!standings.length) {
    $('#standingsCard').innerHTML = `
      <div class="hub-card-header">
        <div><div class="hub-card-title">${tournament.name} Standings</div>
        <div class="hub-card-subtitle">${subtitle}</div></div>
      </div>
      <div class="hub-empty-inline"><p>لا توجد فرق أو نتائج بعد.</p></div>`;
    return;
  }

  const rows = standings
    .map(
      (r) => `
    <tr class="rank-${r.rank}">
      <td><span class="hub-rank-badge ${rankBadge(r.rank)}">${r.rank}</span></td>
      <td><div class="hub-team-cell">${teamLogo(r.team)}<span class="hub-team-name">${r.team.name}</span></div></td>
      <td>${r.pld}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
      <td>${r.gf}</td><td>${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td>
      <td class="pts">${r.pts}</td>
    </tr>`
    )
    .join('');

  $('#standingsCard').innerHTML = `
    <div class="hub-card-header">
      <div><div class="hub-card-title">${tournament.name} Standings</div>
      <div class="hub-card-subtitle">${subtitle}</div></div>
    </div>
    <table class="hub-standings">
      <thead><tr>
        <th>#</th><th>Team</th><th>PLD</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>PTS</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="hub-card-footer"><a href="#" class="hub-link">View Full Standings →</a></div>`;
}

function renderAside(tournament, teams, stats) {
  const pts = `${tournament.points_win ?? 3}-${tournament.points_draw ?? 1}-${tournament.points_loss ?? 0}`;

  $('#asidePanel').innerHTML = `
    <div class="hub-card">
      <div class="hub-card-header"><div class="hub-card-title">Tournament Information</div></div>
      <div class="hub-info-list">
        <div class="hub-info-item"><span>Format</span><span>${tournament.format || '—'}</span></div>
        <div class="hub-info-item"><span>Teams</span><span>${teams.length}</span></div>
        <div class="hub-info-item"><span>Matchdays</span><span>${tournament.total_matchdays || '—'}</span></div>
        <div class="hub-info-item"><span>Points System</span><span>${pts}</span></div>
      </div>
    </div>
    <div class="hub-card">
      <div class="hub-card-header"><div class="hub-card-title">Quick Stats</div></div>
      <div class="hub-stats-grid">
        <div class="hub-stat"><div class="hub-stat-icon">⚽</div><div class="hub-stat-value">${stats.total_matches}</div><div class="hub-stat-label">Total Matches</div></div>
        <div class="hub-stat"><div class="hub-stat-icon">🥅</div><div class="hub-stat-value">${stats.total_goals}</div><div class="hub-stat-label">Total Goals</div></div>
        <div class="hub-stat"><div class="hub-stat-icon">📊</div><div class="hub-stat-value">${stats.goals_per_match}</div><div class="hub-stat-label">Goals / Match</div></div>
        <div class="hub-stat"><div class="hub-stat-icon">🏠</div><div class="hub-stat-value">${stats.home_wins}</div><div class="hub-stat-label">Home Wins</div></div>
        <div class="hub-stat"><div class="hub-stat-icon">🤝</div><div class="hub-stat-value">${stats.draws}</div><div class="hub-stat-label">Draws</div></div>
        <div class="hub-stat"><div class="hub-stat-icon">✈️</div><div class="hub-stat-value">${stats.away_wins}</div><div class="hub-stat-label">Away Wins</div></div>
      </div>
    </div>
    <button type="button" class="hub-btn-gold" id="addResultBtn">
      <span>+ ADD MATCH RESULT</span>
      <span class="hub-btn-gold-sub">Record a new match result</span>
    </button>`;
}

function renderBottom(teams, fixtures, scorers) {
  const recent = fixtures
    .filter((f) => f.status === 'completed')
    .sort((a, b) => new Date(b.played_at || 0) - new Date(a.played_at || 0))
    .slice(0, 5);

  const upcoming = fixtures
    .filter((f) => f.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0))
    .slice(0, 5);

  const topScorers = computeTopScorers(scorers, teams);

  const recentHtml = recent.length
    ? recent
        .map((f) => {
          const home = teamById(teams, f.home_team_id);
          const away = teamById(teams, f.away_team_id);
          return `<li class="hub-match-item">
          <span class="hub-match-date">${formatDate(f.played_at)}</span>
          <div class="hub-match-teams">
            ${teamLogo(home, 24)}<span>${home.name.toUpperCase()}</span>
            <span class="hub-match-score">${f.home_score} - ${f.away_score}</span>
            <span>${away.name.toUpperCase()}</span>${teamLogo(away, 24)}
          </div></li>`;
        })
        .join('')
    : '<div class="hub-empty-inline"><p>لا توجد مباريات مكتملة بعد.</p></div>';

  const scorersHtml = topScorers.length
    ? topScorers
        .map(
          (s) => `<div class="hub-scorer-item">
        <span class="hub-scorer-rank${s.rank <= 3 ? ' top' : ''}">${s.rank}</span>
        ${teamLogo(s.team, 28)}
        <div class="hub-scorer-info"><div class="hub-scorer-name">${s.name}</div><div class="hub-scorer-team">${s.team.name}</div></div>
        <span class="hub-scorer-goals">${s.goals}</span></div>`
        )
        .join('')
    : '<div class="hub-empty-inline"><p>لا يوجد هدافون مسجّلون بعد.</p></div>';

  const upcomingHtml = upcoming.length
    ? upcoming
        .map((f) => {
          const home = teamById(teams, f.home_team_id);
          const away = teamById(teams, f.away_team_id);
          return `<li class="hub-match-item">
          <span class="hub-match-date">${formatDate(f.scheduled_at)}</span>
          <div class="hub-match-teams">
            ${teamLogo(home, 24)}<span>${home.name.toUpperCase()}</span>
            <span style="color:var(--hub-text-dim);font-size:0.7rem">vs</span>
            <span>${away.name.toUpperCase()}</span>${teamLogo(away, 24)}
          </div>
          <span class="hub-match-time">${formatTime(f.scheduled_at)}</span></li>`;
        })
        .join('')
    : '<div class="hub-empty-inline"><p>لا توجد مباريات قادمة.</p></div>';

  $('#bottomGrid').innerHTML = `
    <div class="hub-card"><div class="hub-card-header"><div class="hub-card-title">Recent Matches</div></div>
      <ul class="hub-match-list">${recentHtml}</ul></div>
    <div class="hub-card"><div class="hub-card-header"><div class="hub-card-title">Top Scorers</div></div>
      <div>${scorersHtml}</div></div>
    <div class="hub-card"><div class="hub-card-header"><div class="hub-card-title">Upcoming Matches</div></div>
      <ul class="hub-match-list">${upcomingHtml}</ul></div>`;
}

function renderHub(data) {
  const { tournament, teams, fixtures, scorers } = data;

  if (!tournament) {
    $('#loading').classList.add('hidden');
    $('#emptyState').classList.remove('hidden');
    return;
  }

  const standings = computeStandings(tournament, teams, fixtures);
  const stats = computeQuickStats(fixtures);

  renderTabs(tournament);
  renderStandings(tournament, standings);
  renderAside(tournament, teams, stats);
  renderBottom(teams, fixtures, scorers);

  $('#loading').classList.add('hidden');
  $('#hubContent').classList.remove('hidden');
}

// ---------- Mobile menu ----------
function initMobileMenu() {
  const sidebar = $('#sidebar');
  const overlay = $('#overlay');
  const toggle = $('#menuToggle');

  toggle?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  });

  overlay?.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  });
}

// ---------- Nav highlight ----------
function initNav() {
  $$('#nav .hub-nav-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('#nav .hub-nav-link').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ---------- Boot ----------
async function init() {
  $('#year').textContent = new Date().getFullYear();
  initMobileMenu();
  initNav();

  const data = await loadTournamentData();
  renderHub(data);
}

init();
