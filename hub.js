import { displayName, displaySeason, playerInitials, AR_LOCALE } from './shared/locale.js';
import { loadTournamentData } from './hub-api.js';
import { escapeHtml as esc, errorMessage, debounce, setupDrawer, setupConnectivity } from './shared/ui.js';
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
  return d.toLocaleDateString(AR_LOCALE, { month: 'short', day: 'numeric' });
}

function formatTime(iso) {
  if (!iso) return "لم يُحدّد بعد";
  const d = new Date(iso);
  return d.toLocaleTimeString(AR_LOCALE, { hour: 'numeric', minute: '2-digit' });
}

function teamLogo(team, size) {
  const cls = team.color_class ? ` ${team.color_class}` : '';
  const style = size ? ' data-size="small"' : '';
  return `<div class="hub-team-logo${cls}"${style}>${esc(playerInitials(team.name))}</div>`;
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
  const map = Object.create(null);
  scorers.forEach((s) => {
    const key = `${s.player_name}::${s.team_id}`;
    if (!map[key]) {
      map[key] = { name: s.player_name || "غير معروف", team: teamById(teams, s.team_id), goals: 0 };
    }
    map[key].goals += s.goals ?? 1;
  });

  return Object.values(map)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, limit)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

function standingsFromDb(rows, teams) {
  const byName = Object.fromEntries(teams.map((t) => [t.name, t]));
  return rows
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((r) => ({
      rank: r.rank,
      team: byName[r.player] || {
        name: r.player,
        abbreviation: r.player.slice(0, 3).toUpperCase(),
        color_class: '',
      },
      pld: r.played,
      w: r.wins,
      d: r.draws,
      l: r.losses,
      gf: r.goals_for,
      ga: r.goals_against,
      gd: r.goal_diff,
      pts: r.points,
    }));
}

function resolveStandings(data) {
  const { tournament, teams, fixtures, standingsRows } = data;
  if (standingsRows?.length) return standingsFromDb(standingsRows, teams);
  return computeStandings(tournament, teams, fixtures);
}

// ---------- Render ----------
let activeSeasonId = null;
let hubProfile = null;
let requestVersion = 0;
let hasContent = false;

function renderTabs(seasons, currentId) {
  const tabsEl = $('#tabs');
  if (!seasons?.length) {
    tabsEl.innerHTML = '';
    return;
  }

  tabsEl.innerHTML = seasons
    .map(
      (s) => `
    <button class="hub-tab${s.id === currentId ? ' active' : ''}" type="button" data-season-id="${s.id}">
      <div class="hub-tab-icon ${s.active ? 'gold' : 'blue'}">${s.active ? '🏆' : '📅'}</div>
      <div class="hub-tab-label">${esc(displaySeason(s.name))}</div>
      <span class="hub-tab-label-ar">${s.active ? 'الموسم النشط' : 'موسم'}</span>
    </button>`
    )
    .join('');

  $$('#tabs .hub-tab').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.seasonId;
      if (sid === activeSeasonId) return;
      await loadHub(sid);
    });
  });
}

function renderStandings(tournament, standings) {
  const subtitle =
    tournament.total_matches > 0
      ? `${esc(tournament.season_name || "الموسم")} &nbsp;|&nbsp; المباريات المكتملة: ${tournament.total_matches}`
      : esc(tournament.season_name || '');

  if (!standings.length) {
    $('#standingsCard').innerHTML = `
      <div class="hub-card-header">
        <div><h2 class="hub-card-title">ترتيب ${esc(tournament.name)}</h2>
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
      <td><div class="hub-team-cell">${teamLogo(r.team)}<span class="hub-team-name">${esc(displayName(r.team.name))}</span></div></td>
      <td>${r.pld}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
      <td>${r.gf}</td><td>${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td>
      <td class="pts">${r.pts}</td>
    </tr>`
    )
    .join('');

  $('#standingsCard').innerHTML = `
    <div class="hub-card-header">
      <div><h2 class="hub-card-title">ترتيب ${esc(tournament.name)}</h2>
      <div class="hub-card-subtitle">${subtitle}</div></div>
    </div>
    <div class="table-scroll" tabindex="0" role="region" aria-label="ترتيب الدوري"><table class="hub-standings">
      <thead><tr>
        <th>#</th><th>الفريق</th><th>لعب</th><th>فوز</th><th>تعادل</th><th>خسارة</th><th>له</th><th>عليه</th><th>الفارق</th><th>النقاط</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="hub-card-footer"><a href="league/index.html#leagueTable" class="hub-link">عرض الترتيب الكامل ←</a></div>`;
}

function renderAside(tournament, teams, stats) {
  const pts = `فوز ${tournament.points_win ?? 3} · تعادل ${tournament.points_draw ?? 1} · خسارة ${tournament.points_loss ?? 0}`;

  $('#asidePanel').innerHTML = `
    <div class="hub-card">
      <div class="hub-card-header"><h2 class="hub-card-title">معلومات البطولة</h2></div>
      <div class="hub-info-list">
        <div class="hub-info-item"><span>النظام</span><span>${esc(tournament.format || '—')}</span></div>
        <div class="hub-info-item"><span>الفرق</span><span>${teams.length}</span></div>
        <div class="hub-info-item"><span>المباريات</span><span>${tournament.total_matches || 0}</span></div>
        <div class="hub-info-item"><span>نظام النقاط</span><span>${pts}</span></div>
      </div>
    </div>
    <div class="hub-card hub-section" id="section-statistics">
      <div class="hub-card-header"><h2 class="hub-card-title">إحصائيات سريعة</h2></div>
      <div class="hub-stats-grid">
        <div class="hub-stat"><div class="hub-stat-icon">⚽</div><div class="hub-stat-value">${stats.total_matches}</div><div class="hub-stat-label">إجمالي المباريات</div></div>
        <div class="hub-stat"><div class="hub-stat-icon">🥅</div><div class="hub-stat-value">${stats.total_goals}</div><div class="hub-stat-label">إجمالي الأهداف</div></div>
        <div class="hub-stat"><div class="hub-stat-icon">📊</div><div class="hub-stat-value">${stats.goals_per_match}</div><div class="hub-stat-label">أهداف لكل مباراة</div></div>
        <div class="hub-stat"><div class="hub-stat-icon">🏠</div><div class="hub-stat-value">${stats.home_wins}</div><div class="hub-stat-label">فوز صاحب الأرض</div></div>
        <div class="hub-stat"><div class="hub-stat-icon">🤝</div><div class="hub-stat-value">${stats.draws}</div><div class="hub-stat-label">التعادلات</div></div>
        <div class="hub-stat"><div class="hub-stat-icon">✈️</div><div class="hub-stat-value">${stats.away_wins}</div><div class="hub-stat-label">فوز الضيف</div></div>
      </div>
    </div>
    ${hubProfile?.role === 'admin' ? `<a href="league/index.html#recordMatch" class="hub-btn-gold" id="addResultBtn">
      <span>+ إضافة نتيجة مباراة</span>
      <span class="hub-btn-gold-sub">سجّل نتيجة مباراة جديدة</span>
    </a>` : ''}`;
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
            ${teamLogo(home, 24)}<span>${esc(displayName(home.name))}</span>
            <span class="hub-match-score"><bdi>${f.home_score}</bdi> — <bdi>${f.away_score}</bdi></span>
            <span>${esc(displayName(away.name))}</span>${teamLogo(away, 24)}
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
        <div class="hub-scorer-info"><div class="hub-scorer-name">${esc(s.name)}</div><div class="hub-scorer-team">${esc(displayName(s.team.name))}</div></div>
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
            ${teamLogo(home, 24)}<span>${esc(displayName(home.name))}</span>
            <span class="match-versus">ضد</span>
            <span>${esc(displayName(away.name))}</span>${teamLogo(away, 24)}
          </div>
          <span class="hub-match-time">${formatTime(f.scheduled_at)}</span></li>`;
        })
        .join('')
    : '<div class="hub-empty-inline"><p>لا توجد مباريات قادمة.</p></div>';

  $('#bottomGrid').innerHTML = `
    <div class="hub-card hub-section" id="section-matches"><div class="hub-card-header"><h2 class="hub-card-title">أحدث المباريات</h2></div>
      <ul class="hub-match-list">${recentHtml}</ul></div>
    <div class="hub-card hub-section" id="section-players"><div class="hub-card-header"><h2 class="hub-card-title">الهدافون</h2></div>
      <div>${scorersHtml}</div></div>
    <div class="hub-card hub-section" id="section-upcoming"><div class="hub-card-header"><h2 class="hub-card-title">المباريات القادمة</h2></div>
      <ul class="hub-match-list">${upcomingHtml}</ul></div>`;
}

function renderHub(data) {
  const { tournament, teams, fixtures, scorers, seasons, activeSeasonId: seasonId, standingsRows } = data;

  if (!tournament || !teams.length) {
    $('#loading').classList.add('hidden');
    $('#emptyState').classList.remove('hidden');
    $('#hubContent').classList.add('hidden');
    $('#emptyState h2').textContent = "دوريك يبدأ من هنا";
    $('#emptyState p').textContent = "سيظهر اللاعبون والنتائج عندما يصبح الدوري جاهزًا.";
    return;
  }

  $('#emptyState').classList.add('hidden');
  activeSeasonId = seasonId;
  const standings = resolveStandings(data);
  const stats = computeQuickStats(fixtures);

  hasContent = true;
  $('#hubSeasonSummary').textContent = `${tournament.season_name} · عدد اللاعبين: ${teams.length} · المباريات: ${stats.total_matches}`;
  renderTabs(seasons, activeSeasonId);
  renderStandings(tournament, standings);
  renderAside(tournament, teams, stats);
  renderBottom(teams, fixtures, scorers);

  $('#loading').classList.add('hidden');
  $('#hubContent').classList.remove('hidden');
}

// ---------- Mobile menu ----------
function initMobileMenu() {
  setupDrawer({sidebar: $('#sidebar'), overlay: $('#overlay'), toggles: [$('#menuToggle')]});
}

// ---------- In-page nav (scroll to hub sections) ----------
const HUB_SECTIONS = {
  tournaments: '#hubTop',
  matches: '#section-matches',
  standings: '#standingsCard',
  players: '#section-players',
  statistics: '#section-statistics',
};

function initNav() {
  $$('#nav .hub-nav-link[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      $$('#nav .hub-nav-link[data-page]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const target = HUB_SECTIONS[page];
      if (!target) return;
      const el = document.querySelector(target);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (page === 'tournaments') window.scrollTo({ top: 0, behavior: 'smooth' });

      $('#sidebar')?.classList.remove('open');
      $('#overlay')?.classList.remove('show');
    });
  });
}

// ---------- Boot ----------
async function loadHub(seasonId = activeSeasonId) {
  const ticket = ++requestVersion;
  $('#hubError').hidden = true;
  if (!hasContent) $('#loading').classList.remove('hidden');
  try {
    const data = await loadTournamentData(seasonId);
    if (ticket !== requestVersion) return;
    renderHub(data);
  } catch (error) {
    if (ticket !== requestVersion) return;
    $('#loading').classList.add('hidden');
    $('#hubError').hidden = false;
    $('#hubErrorText').textContent = errorMessage(error, "تعذّر تحميل البطولة. حاول مجددًا.");
  }
}
async function init() {
  $('#year').textContent = new Date().getFullYear();
  initMobileMenu(); initNav();
  $('#retryHub').addEventListener('click', () => loadHub());
  const client = window.EFLClient?.get();
  if (client) {
    try { hubProfile = await window.EFLAuth.restore(client); } catch { hubProfile = null; }
    const refresh = debounce(() => loadHub(), 450);
    const channel = client.channel('efl-hub');
    for (const table of ['matches','seasons','players','standings','match_goal_events','match_stats']) {
      channel.on('postgres_changes', {event:'*',schema:'public',table}, refresh);
    }
    channel.subscribe();
    const unsubscribe = window.EFLAuth.subscribe(client, profile => { hubProfile = profile; refresh(); });
    window.addEventListener('pagehide', () => { refresh.cancel(); client.removeChannel(channel); unsubscribe(); });
  }
  setupConnectivity(() => loadHub());
  await loadHub();
}
init();
