/* =====================================================
   eFOOTBALL FRIENDS LEAGUE — SCRIPT.JS
   Full league management logic
===================================================== */

'use strict';

// ===== CONSTANTS =====
function getPlayers() {
  const names = Object.keys(db.accounts || {});
  return names.length ? names.sort((a, b) => a.localeCompare(b)) : [];
}

// Each player's legend nickname + signature icon, shown as a glowing chip
// next to their name across the app.
const NICKNAMES = {
  'Wael':        { nick: 'Zlatan',     icon: '🦁' },
  'Mustafa':     { nick: 'Ronaldinho', icon: '🪄' },
  'Abdul Rahim': { nick: 'Abu Al Wafa', icon: '🤝' },
  'Mohammad':    { nick: 'Del Piero',  icon: '🎯' },
  'Omar':        { nick: 'Drogba',     icon: '🐘' },
  'Abdul Qader': { nick: 'Nesta',      icon: '🛡️' },
};
function nick(name) { return NICKNAMES[name] ? NICKNAMES[name].nick : ''; }

// Legend label for dropdowns (e.g. "🦁 Zlatan"). DB still stores real name.
function playerLegendLabel(name) {
  const n = NICKNAMES[name];
  return n ? `${n.icon} ${n.nick}` : name;
}

function matchPlayerLabel(name) {
  return esc(name);
}

function fillPlayerSelect(selectEl, emptyLabel) {
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

function populateMatchPlayerDropdowns() {
  fillPlayerSelect(document.getElementById('matchPlayer1'), 'Select Player');
  fillPlayerSelect(document.getElementById('matchPlayer2'), 'Select Player');
  fillPlayerSelect(document.getElementById('editPlayer1'), null);
  fillPlayerSelect(document.getElementById('editPlayer2'), null);
}

function populateAllPlayerDropdowns() {
  fillPlayerSelect(document.getElementById('loginUsername'), '— SELECT PLAYER —');
  populateMatchPlayerDropdowns();
  fillPlayerSelect(document.getElementById('historyFilterPlayer'), 'All Players');
  fillPlayerSelect(document.getElementById('h2hPlayer1'), 'Player 1');
  fillPlayerSelect(document.getElementById('h2hPlayer2'), 'Player 2');
  fillPlayerSelect(document.getElementById('adminAccName'), null);
  renderPlayerTabBars();
}

function renderPlayerTabBars() {
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

// Returns a styled chip element (HTML string). Pass big=true for the large,
// animated variant used on the player profile.
function nickChip(name, big = false) {
  const n = NICKNAMES[name];
  if (!n) return '';
  return `<span class="nick-chip${big ? ' lg' : ''}">` +
    `<span class="nick-chip-icon">${n.icon}</span>` +
    `<span class="nick-chip-text">${esc(n.nick)}</span></span>`;
}

// ===== ADMIN / PERMISSIONS =====
// Only this account may create accounts and modify data (matches, seasons,
// resets, imports). Everyone else gets a read-only view.
// NOTE: this is enforced in the browser only. For true security you'd add
// real auth + row-level security in Supabase.
const ADMIN = 'Wael';
function isAdmin() { return currentUser === ADMIN; }
function requireAdmin() {
  if (!isAdmin()) { showToast('Only ' + ADMIN + ' (admin) can do this.', true); return false; }
  return true;
}
// Shows/hides every element marked `.admin-only` based on the current user.
function applyAdminUI() {
  const admin = isAdmin();
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !admin);
  });
  document.body.classList.toggle('is-admin', admin);
  document.body.classList.toggle('is-viewer', !admin);
  const badge = document.getElementById('viewerBadge');
  if (badge) badge.classList.toggle('hidden', admin);
}

const ACHIEVEMENT_DEFS = [
  { id: 'first_win',   icon: '🥇', name: 'First Win',         desc: 'Win your first match',         check: (s) => s.wins >= 1 },
  { id: 'wins10',      icon: '🏆', name: '10 Wins',           desc: 'Win 10 matches',                check: (s) => s.wins >= 10 },
  { id: 'goals50',     icon: '⚽', name: '50 Goals',          desc: 'Score 50 goals',                check: (s) => s.goalsFor >= 50 },
  { id: 'goals100',    icon: '💯', name: '100 Goals',         desc: 'Score 100 goals',               check: (s) => s.goalsFor >= 100 },
  { id: 'streak5',     icon: '🔥', name: '5 Win Streak',      desc: 'Win 5 matches in a row',        check: (s) => s.bestStreak >= 5 },
  { id: 'champion',    icon: '👑', name: 'Champion',          desc: 'Win a season',                  check: (s) => s.seasonWins >= 1 },
  { id: 'played20',    icon: '🎮', name: '20 Matches',        desc: 'Play 20 matches',               check: (s) => s.played >= 20 },
  { id: 'clean5',      icon: '🧱', name: '5 Clean Sheets',    desc: 'Keep 5 clean sheets',           check: (s) => s.cleanSheets >= 5 },
];

// ===== STATE =====
let currentUser = null;
// In-memory mirror of the Supabase data. Every render/compute function reads
// from this object synchronously; writes go to Supabase and then update it.
let db = { accounts: {}, matches: [], seasons: [], questions: [], answers: [], matchStats: [], goalEvents: [] };
let currentPage = 'dashboard';
let qaSelectedId = null;
let viewingMatchId = null;
let qaTablesReady = false;
let matchStatsTablesReady = false;
let goalEventsTablesReady = false;

// True when Q&A tables are not created in Supabase yet (REST 404 / PGRST205).
function isQaTableMissing(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return err.code === '42P01' || err.code === 'PGRST205'
    || msg.includes('could not find') || msg.includes('does not exist')
    || msg.includes('schema cache') || err.status === 404;
}
function isMatchStatsTableMissing(err) { return isQaTableMissing(err); }
function isGoalEventsTableMissing(err) { return isQaTableMissing(err); }

// ===== SUPABASE CLIENT =====
function isConfigured() {
  return typeof SUPABASE_CONFIG !== 'undefined' &&
    SUPABASE_CONFIG.url && !SUPABASE_CONFIG.url.includes('YOUR_') &&
    SUPABASE_CONFIG.anonKey && !SUPABASE_CONFIG.anonKey.includes('YOUR_');
}

const sb = (typeof window !== 'undefined' && window.supabase && isConfigured())
  ? window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
  : null;

// ===== ROW MAPPERS (Supabase row -> in-memory shape) =====
function mapSeason(row) {
  return { id: row.id, name: row.name, active: !!row.active, created: Number(row.created) || Date.now() };
}
function mapMatch(row) {
  return {
    id: row.id,
    player1: row.player1, player2: row.player2,
    goals1: row.goals1, goals2: row.goals2,
    date: row.date, season: row.season_id,
    timestamp: Number(row.timestamp) || (row.created_at ? new Date(row.created_at).getTime() : Date.now())
  };
}
function mapQuestion(row) {
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    closed: !!row.closed,
    correctAnswerId: row.correct_answer_id || null,
    timestamp: Number(row.timestamp) || (row.created_at ? new Date(row.created_at).getTime() : Date.now())
  };
}
function mapAnswer(row) {
  return {
    id: row.id,
    questionId: row.question_id,
    author: row.author,
    body: row.body,
    timestamp: Number(row.timestamp) || (row.created_at ? new Date(row.created_at).getTime() : Date.now())
  };
}
function mapMatchStat(row) {
  return {
    id: row.id,
    matchId: row.match_id,
    player: row.player,
    characterName: row.character_name || '',
    goals: row.goals,
    assists: row.assists
  };
}

function mapGoalEvent(row) {
  return {
    id: row.id,
    matchId: row.match_id,
    owner: row.owner,
    scorer: row.scorer,
    assist: row.assist || '',
    minute: row.minute ?? 0,
    sortOrder: row.sort_order ?? 0
  };
}

// ===== DATA FETCH =====
async function fetchAllData() {
  if (!sb) throw new Error('Supabase not configured');
  const [players, seasons, matches, questions, answers, matchStats, goalEvents] = await Promise.all([
    sb.from('players').select('*'),
    sb.from('seasons').select('*').order('created', { ascending: true }),
    sb.from('matches').select('*'),
    sb.from('questions').select('*').order('timestamp', { ascending: false }),
    sb.from('answers').select('*').order('timestamp', { ascending: true }),
    sb.from('match_stats').select('*'),
    sb.from('match_goal_events').select('*').order('sort_order', { ascending: true }),
  ]);
  if (players.error || seasons.error || matches.error) {
    throw players.error || seasons.error || matches.error;
  }
  // Q&A tables are optional until migration is run in Supabase.
  if (!questions.error && !answers.error) {
    db.questions = (questions.data || []).map(mapQuestion);
    db.answers = (answers.data || []).map(mapAnswer);
    qaTablesReady = true;
  } else if (isQaTableMissing(questions.error) || isQaTableMissing(answers.error)) {
    db.questions = [];
    db.answers = [];
    qaTablesReady = false;
  } else {
    throw questions.error || answers.error;
  }

  if (!matchStats.error) {
    db.matchStats = (matchStats.data || []).map(mapMatchStat);
    matchStatsTablesReady = true;
  } else if (isMatchStatsTableMissing(matchStats.error)) {
    db.matchStats = [];
    matchStatsTablesReady = false;
  } else {
    throw matchStats.error;
  }

  if (!goalEvents.error) {
    db.goalEvents = (goalEvents.data || []).map(mapGoalEvent);
    goalEventsTablesReady = true;
  } else if (isGoalEventsTableMissing(goalEvents.error)) {
    db.goalEvents = [];
    goalEventsTablesReady = false;
  } else {
    throw goalEvents.error;
  }

  db.accounts = {};
  (players.data || []).forEach(p => {
    db.accounts[p.name] = { username: p.name, password: p.password, created: Number(p.created) };
  });
  db.seasons = (seasons.data || []).map(mapSeason);
  db.matches = (matches.data || []).map(mapMatch);

  populateAllPlayerDropdowns();
  cacheDB();
  updateGoalEventsSetupBanner();
}

// ===== OPTIONAL LOCAL CACHE (for fast first paint only) =====
function cacheDB() {
  try {
    localStorage.setItem('efl_cache', JSON.stringify({
      accounts: db.accounts, seasons: db.seasons, matches: db.matches,
      questions: db.questions || [], answers: db.answers || [],
      matchStats: db.matchStats || [],
      goalEvents: db.goalEvents || []
    }));
  } catch (e) {}
}
function loadCache() {
  try {
    const raw = localStorage.getItem('efl_cache');
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.seasons && c.matches) {
        db = {
          accounts: c.accounts || {}, seasons: c.seasons, matches: c.matches,
          questions: c.questions || [], answers: c.answers || [],
          matchStats: c.matchStats || [],
          goalEvents: c.goalEvents || []
        };
      }
    }
  } catch (e) {}
}

// ===== STANDINGS + ACHIEVEMENTS PERSISTENCE =====
// Recomputes the league table (overall + per season) and stores it in Supabase.
// Called automatically whenever matches change so the stored league table
// always stays in sync for every user.
async function persistStandings() {
  if (!sb) return;
  const rows = [];
  const scopes = ['all', ...db.seasons.map(s => s.id)];
  scopes.forEach(scope => {
    const table = computeLeagueTable(scope);
    table.forEach((r, i) => rows.push({
      season: String(scope), player: r.player,
      played: r.played, wins: r.wins, draws: r.draws, losses: r.losses,
      goals_for: r.goalsFor, goals_against: r.goalsAgainst,
      goal_diff: r.goalDiff, points: r.points, rank: i + 1,
      updated_at: new Date().toISOString()
    }));
  });
  await sb.from('standings').delete().neq('player', '');
  if (rows.length) await sb.from('standings').insert(rows);
}

async function persistAchievements() {
  if (!sb) return;
  const rows = [];
  getPlayers().forEach(p => {
    const s = computePlayerStats(p);
    ACHIEVEMENT_DEFS.filter(a => a.check(s)).forEach(a => rows.push({ player: p, achievement_id: a.id }));
  });
  await sb.from('achievements').delete().neq('player', '');
  if (rows.length) await sb.from('achievements').insert(rows);
}

// Convenience: recompute everything derived from matches and refresh the UI.
async function syncDerivedData() {
  await persistStandings();
  await persistAchievements();
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  spawnParticles();
  setDefaultDate();

  if (!isConfigured() || !sb) {
    showLogin();
    showConfigWarning();
    return;
  }

  // Optional: paint instantly from last cache while we fetch fresh data.
  loadCache();

  try {
    await fetchAllData();
  } catch (e) {
    showToast('Could not reach Supabase. Check your config / connection.', true);
  }

  subscribeRealtime();

  // If the user logged in while data was still loading, don't call showLogin()
  // afterwards — that was hiding the app and leaving a blank screen.
  const saved = localStorage.getItem('efl_user');
  if (currentUser) {
    enterApp();
  } else if (saved && db.accounts[saved]) {
    currentUser = saved;
    enterApp();
  } else {
    showLogin();
  }
});

function showConfigWarning() {
  const err = document.getElementById('loginError');
  if (err) showError(err, 'Supabase is not configured yet. Edit supabase-config.js with your project URL and anon key.');
}

// ===== REALTIME (multi-user live sync) =====
let _refreshTimer = null;
function subscribeRealtime() {
  if (!sb) return;
  try {
    sb.channel('efl-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seasons' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_stats' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_goal_events' }, scheduleRefresh)
      .subscribe();
  } catch (e) { /* realtime optional */ }
}

function scheduleRefresh() {
  clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(refreshFromRemote, 400);
}

async function refreshFromRemote() {
  try { await fetchAllData(); } catch (e) { return; }
  if (!currentUser) return;
  populateSeasonDropdowns();
  updateSidebarPlayer();
  // Avoid clobbering a form the user may be filling in.
  if (currentPage !== 'recordMatch' && currentPage !== 'matchDetails'
    && !isQaFormActive() && !isGoalEventsFormActive()) {
    renderPage(currentPage);
  }
  if (currentPage === 'matchDetails' && viewingMatchId) renderMatchDetails();
}

function isGoalEventsFormActive() {
  if (currentPage !== 'recordMatch') return false;
  const el = document.activeElement;
  return el && (el.classList.contains('ge-scorer') || el.classList.contains('ge-assist')
    || el.classList.contains('ge-minute') || el.classList.contains('ge-owner'));
}

function isQaFormActive() {
  if (currentPage !== 'questions') return false;
  const el = document.activeElement;
  return el && (el.id === 'qaAskBody' || el.id === 'qaAnswerBody');
}

function setDefaultDate() {
  const d = document.getElementById('matchDate');
  if (d) d.value = new Date().toISOString().split('T')[0];
}

// ===== PARTICLES =====
function spawnParticles() {
  const container = document.getElementById('loginParticles');
  if (!container) return;
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (6 + Math.random() * 12) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
    container.appendChild(p);
  }
}

// ===== AUTH =====
function showLogin() {
  document.getElementById('loginScreen')?.classList.remove('hidden');
  document.getElementById('mainApp')?.classList.add('hidden');
  closeSidebar();
}

function handleLogin() {
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');

  if (!username) return showError(err, 'Please select your name.');
  if (!password) return showError(err, 'Please enter your password.');

  const acc = db.accounts[username];
  if (!acc) return showError(err, 'Account not found. Ask the admin to create it.');
  if (acc.password !== password) return showError(err, 'Incorrect password.');

  err.classList.add('hidden');
  currentUser = username;
  localStorage.setItem('efl_user', username);
  enterApp();
}

// Admin-only: create a new account or reset an existing player's password.
async function adminCreateAccount() {
  const err = document.getElementById('adminAccError');
  if (!isAdmin()) return showError(err, 'Only ' + ADMIN + ' (admin) can manage accounts.');

  const username = document.getElementById('adminAccName').value;
  const pw = document.getElementById('adminAccPassword').value;

  if (!sb) return showError(err, 'Supabase is not configured. See supabase-config.js.');
  if (!username) return showError(err, 'Please select a player.');
  if (!pw) return showError(err, 'Please set a password.');
  if (pw.length < 4) return showError(err, 'Password must be at least 4 characters.');

  const exists = !!db.accounts[username];
  // Upsert so the admin can both create and reset passwords.
  const { error } = await sb.from('players')
    .upsert({ name: username, password: pw, created: db.accounts[username]?.created || Date.now() },
            { onConflict: 'name' });
  if (error) return showError(err, 'Could not save account. Please try again.');

  await fetchAllData();
  err.classList.add('hidden');
  document.getElementById('adminAccPassword').value = '';
  showToast(`Account for ${username} ${exists ? 'updated' : 'created'}!`);
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('efl_user');
  showLogin();
}

function enterApp() {
  const login = document.getElementById('loginScreen');
  const app = document.getElementById('mainApp');
  if (!app) {
    showToast('App failed to load. Please refresh the page.', true);
    return;
  }

  try {
    login?.classList.add('hidden');
    app.classList.remove('hidden');

    updateSidebarPlayer();
    applyAdminUI();
    populateSeasonDropdowns();

    const hashPage = location.hash.slice(1);
    const hashNav = hashPage && document.querySelector(`.nav-item[data-page="${hashPage}"]`);
    if (hashNav) {
      navigateTo(hashPage, hashNav);
    } else {
      navigateTo('dashboard', document.querySelector('.nav-item[data-page="dashboard"]'));
    }

    // Keep the stored league table / achievements in sync with the latest
    // matches (self-heals if a previous write was interrupted). Fire-and-forget.
    if (sb && isAdmin()) syncDerivedData().catch(() => {});
  } catch (e) {
    console.error('enterApp failed:', e);
    showToast('Could not open the app. Please refresh and try again.', true);
    currentUser = null;
    try { localStorage.removeItem('efl_user'); } catch (err) {}
    showLogin();
  }
}

function updateSidebarPlayer() {
  if (!currentUser) return;
  document.getElementById('sidebarPlayerName').textContent = currentUser;
  document.getElementById('sidebarAvatar').textContent = currentUser.charAt(0).toUpperCase();
  document.getElementById('topbarPlayer').textContent = currentUser;

  const table = computeLeagueTable('all');
  const rank = table.findIndex(r => r.player === currentUser) + 1;
  document.getElementById('sidebarPlayerRank').textContent = rank ? '#' + rank : '#—';
  const nickEl = document.getElementById('sidebarNick');
  if (nickEl) nickEl.innerHTML = nickChip(currentUser);
}

// ===== NAVIGATION =====
function navigateTo(page, el) {
  if (!isAdmin() && page === 'recordMatch') {
    showToast('Only ' + ADMIN + ' (admin) can record matches.', true);
    page = 'dashboard';
    el = document.querySelector('.nav-item[data-page="dashboard"]');
  }
  const target = document.getElementById('page-' + page);
  if (!target) {
    console.error('Unknown page:', page);
    page = 'dashboard';
  }
  const pageEl = document.getElementById('page-' + page) || document.getElementById('page-dashboard');

  document.querySelectorAll('.page').forEach(p => {
    if (p !== pageEl) p.classList.add('hidden');
  });
  pageEl.classList.remove('hidden');
  pageEl.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');

  const titles = {
    dashboard: 'Dashboard', recordMatch: 'Record Match',
    matchHistory: 'Match History', matchDetails: 'Match Details',
    footballStats: 'Player Performance', leagueTable: 'League Table',
    playerProfile: 'Player Profiles', headToHead: 'Head to Head',
    seasons: 'Seasons', awards: 'Awards', achievements: 'Achievements',
    rivalries: 'Rivalries', statistics: 'Statistics', questions: 'League Q&A',
    settings: 'Settings'
  };
  const topTitle = document.getElementById('topbarTitle');
  if (topTitle) topTitle.textContent = titles[page] || page;

  const activeSeason = getActiveSeason();
  const topSeason = document.getElementById('topbarSeason');
  if (topSeason) topSeason.textContent = activeSeason ? activeSeason.name : 'No Season';

  closeSidebar();
  if (page !== 'questions') qaSelectedId = null;
  currentPage = page;
  try {
    renderPage(page);
  } catch (e) {
    console.error('renderPage failed:', page, e);
    showToast('Could not load this page.', true);
  }
}

// Renders a page's content. Kept separate from navigateTo so realtime updates
// can re-render the page the user is currently viewing.
function renderPage(page) {
  switch(page) {
    case 'dashboard': renderDashboard(); break;
    case 'matchHistory': renderHistory(); break;
    case 'matchDetails': renderMatchDetails(); break;
    case 'footballStats': renderFootballStats(); break;
    case 'leagueTable': renderLeagueTable(); break;
    case 'playerProfile': {
      const first = getPlayers()[0];
      if (first) selectProfilePlayer(first, document.querySelector('#profilePlayerTabs .player-tab'));
      break;
    }
    case 'seasons': renderSeasons(); break;
    case 'awards': renderAwards(); break;
    case 'achievements': {
      const first = getPlayers()[0];
      if (first) selectAchievementsPlayer(first, document.querySelector('#achievementsPlayerTabs .player-tab'));
      break;
    }
    case 'rivalries': renderRivalries(); break;
    case 'statistics': renderStatistics(); break;
    case 'recordMatch': initRecordForm(); break;
    case 'headToHead': renderH2H(); break;
    case 'questions': renderQuestions(); break;
  }
}

// ===== SIDEBAR TOGGLE =====
function toggleSidebar() {
  const s = document.getElementById('sidebar');
  const o = document.getElementById('sidebarOverlay');
  s.classList.toggle('open');
  o.classList.toggle('visible');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
}

// ===== SEASONS =====
function getActiveSeason() {
  return db.seasons.find(s => s.active) || db.seasons[db.seasons.length - 1] || null;
}

function populateSeasonDropdowns() {
  const dropdowns = ['matchSeason', 'historyFilterSeason', 'tableSeasonFilter',
                     'awardsSeasonFilter', 'statsSeasonFilter', 'fbStatsSeasonFilter', 'editSeason'];
  dropdowns.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = '';

    if (id === 'historyFilterSeason' || id === 'tableSeasonFilter' ||
        id === 'awardsSeasonFilter' || id === 'statsSeasonFilter' || id === 'fbStatsSeasonFilter') {
      const all = document.createElement('option');
      all.value = 'all';
      all.textContent = id === 'tableSeasonFilter' || id === 'statsSeasonFilter' ? 'All Seasons' : 'All Seasons (Overall)';
      el.appendChild(all);
    }

    db.seasons.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name + (s.active ? ' ★' : '');
      el.appendChild(opt);
    });

    if (id === 'matchSeason' || id === 'editSeason') {
      const active = getActiveSeason();
      if (active) el.value = active.id;
    } else {
      if (prev && el.querySelector(`option[value="${prev}"]`)) el.value = prev;
    }
  });
}

async function createSeason() {
  if (!requireAdmin()) return;
  const name = document.getElementById('newSeasonName').value.trim();
  if (!sb) return showToast('Supabase is not configured.', true);
  if (!name) return showToast('Please enter a season name.', true);

  const existing = db.seasons.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (existing) return showToast('Season already exists.', true);

  const { data, error } = await sb.from('seasons')
    .insert({ name, active: false, created: Date.now() })
    .select().single();
  if (error) return showToast('Could not create season.', true);

  db.seasons.push(mapSeason(data));
  cacheDB();
  await persistStandings();
  document.getElementById('newSeasonName').value = '';
  populateSeasonDropdowns();
  renderSeasons();
  showToast('Season "' + name + '" created!');
}

async function setActiveSeason(id) {
  if (!requireAdmin()) return;
  if (!sb) return showToast('Supabase is not configured.', true);
  const r1 = await sb.from('seasons').update({ active: false }).neq('created', -1);
  const r2 = await sb.from('seasons').update({ active: true }).eq('id', id);
  if (r1.error || r2.error) return showToast('Could not update active season.', true);

  db.seasons.forEach(s => s.active = (s.id === id));
  cacheDB();
  populateSeasonDropdowns();
  renderSeasons();
  updateSidebarPlayer();
  showToast('Active season updated!');
}

function deleteSeason(id) {
  if (!requireAdmin()) return;
  const season = db.seasons.find(s => s.id === id);
  if (!season) return;
  const matchCount = db.matches.filter(m => m.season === id).length;
  showConfirm(
    'Delete Season',
    `Delete "${season.name}"? This will also delete ${matchCount} match(es).`,
    async () => {
      if (!sb) return showToast('Supabase is not configured.', true);
      const { error } = await sb.from('seasons').delete().eq('id', id);
      if (error) return showToast('Could not delete season.', true);

      db.matches = db.matches.filter(m => m.season !== id);
      const keptIds = new Set(db.matches.map(m => m.id));
      db.goalEvents = db.goalEvents.filter(e => keptIds.has(e.matchId));
      db.matchStats = db.matchStats.filter(s => keptIds.has(s.matchId));
      db.seasons = db.seasons.filter(s => s.id !== id);
      if (db.seasons.length > 0 && !db.seasons.find(s => s.active)) {
        const last = db.seasons[db.seasons.length - 1];
        last.active = true;
        await sb.from('seasons').update({ active: true }).eq('id', last.id);
      }
      cacheDB();
      await syncDerivedData();
      populateSeasonDropdowns();
      renderSeasons();
      updateSidebarPlayer();
      showToast('Season deleted.');
    }
  );
}

function renderSeasons() {
  const cont = document.getElementById('seasonsList');
  if (!cont) return;
  if (db.seasons.length === 0) {
    cont.innerHTML = '<div class="empty-state">No seasons yet. Create one above.</div>';
    return;
  }
  cont.innerHTML = db.seasons.map(s => {
    const matchCount = db.matches.filter(m => m.season === s.id).length;
    return `
      <div class="season-card">
        <div class="season-card-info">
          <h4>${esc(s.name)}</h4>
          <p>${matchCount} match${matchCount !== 1 ? 'es' : ''} recorded</p>
        </div>
        <div class="season-card-actions">
          ${s.active ? '<span class="season-badge-active">ACTIVE</span>' :
            (isAdmin() ? `<button class="btn-sm" onclick="setActiveSeason('${s.id}')">Set Active</button>` : '')}
          ${isAdmin() ? `<button class="btn-sm delete" onclick="deleteSeason('${s.id}')">Delete</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ===== GOAL EVENTS & MATCH AWARDS =====
function getMatchGoalEvents(matchId) {
  return db.goalEvents
    .filter(e => e.matchId === matchId)
    .sort((a, b) => (a.minute - b.minute) || (a.sortOrder - b.sortOrder));
}

function getMainMatchPlayers(containerId) {
  if (containerId === 'editGoalEventsList') {
    return {
      p1: document.getElementById('editPlayer1')?.value || '',
      p2: document.getElementById('editPlayer2')?.value || ''
    };
  }
  return {
    p1: document.getElementById('matchPlayer1')?.value || '',
    p2: document.getElementById('matchPlayer2')?.value || ''
  };
}

function getMatchScoreFromForm(containerId) {
  if (containerId === 'editGoalEventsList') {
    return {
      g1: parseInt(document.getElementById('editGoals1')?.value) || 0,
      g2: parseInt(document.getElementById('editGoals2')?.value) || 0
    };
  }
  return {
    g1: parseInt(document.getElementById('matchGoals1')?.value) || 0,
    g2: parseInt(document.getElementById('matchGoals2')?.value) || 0
  };
}

function goalEventsSummaryId(containerId) {
  return containerId === 'goalEventsList' ? 'goalEventsSummary' : 'editGoalEventsSummary';
}

function ownerOptionsHTML(p1, p2, selected) {
  if (!p1 && !p2) return '<option value="">— Select players above —</option>';
  let html = '';
  if (p1) html += `<option value="${esc(p1)}"${selected === p1 ? ' selected' : ''}>${esc(p1)}</option>`;
  if (p2 && p2 !== p1) html += `<option value="${esc(p2)}"${selected === p2 ? ' selected' : ''}>${esc(p2)}</option>`;
  return html;
}

function goalEventRowHTML(e, idx, containerId, p1, p2) {
  return `<div class="ge-row" data-idx="${idx}">
    <select class="ge-owner" onchange="updateGoalEventsUI('${containerId}')">${ownerOptionsHTML(p1, p2, e.owner)}</select>
    <input type="text" class="ge-scorer" placeholder="Scorer" value="${esc(e.scorer || '')}" oninput="updateGoalEventsUI('${containerId}')">
    <input type="text" class="ge-assist" placeholder="Assist (opt.)" value="${esc(e.assist || '')}" oninput="updateGoalEventsUI('${containerId}')">
    <input type="number" class="ge-minute" min="0" max="120" placeholder="Min" value="${e.minute ?? ''}" oninput="updateGoalEventsUI('${containerId}')">
    <button type="button" class="btn-sm delete ge-remove" onclick="removeGoalEventRow('${containerId}', ${idx})" title="Remove">✕</button>
  </div>`;
}

function collectGoalEventsFromForm(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return [];
  const events = [];
  el.querySelectorAll('.ge-row').forEach((row, i) => {
    const owner = row.querySelector('.ge-owner')?.value || '';
    const scorer = (row.querySelector('.ge-scorer')?.value || '').trim();
    const assist = (row.querySelector('.ge-assist')?.value || '').trim();
    const minute = parseInt(row.querySelector('.ge-minute')?.value);
    if (!scorer && !owner) return;
    events.push({
      owner,
      scorer,
      assist,
      minute: isNaN(minute) ? 0 : Math.min(120, Math.max(0, minute)),
      sortOrder: i
    });
  });
  return events;
}

function renderGoalEventsForm(containerId, events) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const { p1, p2 } = getMainMatchPlayers(containerId);
  const list = events || [];

  if (!list.length) {
    el.innerHTML = `<div class="ge-header">
      <span>Owner</span><span>Scorer</span><span>Assist</span><span>Min</span><span></span>
    </div>
    <div class="empty-state ge-empty">No goals yet — click “Add Goal Event”.</div>`;
  } else {
    el.innerHTML = `<div class="ge-header">
      <span>Owner</span><span>Scorer</span><span>Assist</span><span>Min</span><span></span>
    </div>
    ${list.map((e, i) => goalEventRowHTML(e, i, containerId, p1, p2)).join('')}`;
  }
  updateGoalEventsUI(containerId);
}

function addGoalEventRow(containerId) {
  const { p1, p2 } = getMainMatchPlayers(containerId);
  if (!p1 || !p2) return showToast('Select Player 1 and Player 2 first.', true);
  const events = collectGoalEventsFromForm(containerId);
  events.push({ owner: p1, scorer: '', assist: '', minute: 0, sortOrder: events.length });
  renderGoalEventsForm(containerId, events);
}

function removeGoalEventRow(containerId, idx) {
  const events = collectGoalEventsFromForm(containerId);
  events.splice(idx, 1);
  renderGoalEventsForm(containerId, events);
}

function countGoalsByOwner(events, p1, p2) {
  let c1 = 0, c2 = 0;
  events.forEach(e => {
    if (e.owner === p1) c1++;
    else if (e.owner === p2) c2++;
  });
  return { c1, c2 };
}

function validateGoalEvents(events, p1, p2, g1, g2) {
  if (!events.length) return null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e.scorer) return `Goal ${i + 1}: enter a scorer name.`;
    if (!e.owner) return `Goal ${i + 1}: select team owner.`;
    if (e.owner !== p1 && e.owner !== p2) return `Goal ${i + 1}: owner must be ${p1} or ${p2}.`;
  }
  const { c1, c2 } = countGoalsByOwner(events, p1, p2);
  if (c1 !== g1 || c2 !== g2) {
    return `Goal events: ${p1} has ${c1} (need ${g1}), ${p2} has ${c2} (need ${g2}).`;
  }
  return null;
}

function goalEventsSummaryHTML(containerId, events) {
  const { p1, p2 } = getMainMatchPlayers(containerId);
  const { g1, g2 } = getMatchScoreFromForm(containerId);
  const { c1, c2 } = countGoalsByOwner(events, p1, p2);
  const total = events.length;
  const expected = g1 + g2;
  const ok = c1 === g1 && c2 === g2 && total === expected;
  return `<div class="ms-total-line ${ok ? 'ok' : 'bad'}">
    Goals: <strong>${esc(p1 || 'P1')} ${c1}/${g1}</strong> · <strong>${esc(p2 || 'P2')} ${c2}/${g2}</strong>
    · Total <strong>${total}</strong> / <strong>${expected}</strong>
    ${ok ? ' ✓' : ''}
  </div>`;
}

function updateGoalEventsUI(containerId) {
  const events = collectGoalEventsFromForm(containerId);
  const summaryEl = document.getElementById(goalEventsSummaryId(containerId));
  if (summaryEl) summaryEl.innerHTML = events.length ? goalEventsSummaryHTML(containerId, events) : '';

  const previewId = containerId === 'goalEventsList' ? 'matchAwardsPreview' : 'editMatchAwardsPreview';
  const preview = document.getElementById(previewId);
  if (!preview) return;
  if (!events.length) {
    preview.innerHTML = '<span class="text-dim">Add goal events to preview match awards.</span>';
    return;
  }
  const fakeId = '__preview__';
  const prevEv = db.goalEvents.filter(e => e.matchId !== fakeId);
  db.goalEvents = [...prevEv, ...events.map((e, i) => ({ id: '', matchId: fakeId, ...e, sortOrder: i }))];
  preview.innerHTML = matchAwardsHTML(fakeId) || '<span class="text-dim">No awards yet.</span>';
  db.goalEvents = prevEv;
}

function syncScoreFromGoalEvents(containerId) {
  const { p1, p2 } = getMainMatchPlayers(containerId);
  const events = collectGoalEventsFromForm(containerId);
  const { c1, c2 } = countGoalsByOwner(events, p1, p2);
  if (containerId === 'editGoalEventsList') {
    document.getElementById('editGoals1').value = c1;
    document.getElementById('editGoals2').value = c2;
  } else {
    document.getElementById('matchGoals1').value = c1;
    document.getElementById('matchGoals2').value = c2;
    updateMatchPreview();
  }
  updateGoalEventsUI(containerId);
  showToast('Score updated from goal events.');
}

function aggregateOwnerStatsFromEvents(matchId) {
  const byOwner = {};
  getMatchGoalEvents(matchId).forEach(e => {
    if (!byOwner[e.owner]) byOwner[e.owner] = { goals: 0, assists: 0 };
    byOwner[e.owner].goals++;
    if (e.assist) byOwner[e.owner].assists++;
  });
  return byOwner;
}

function computeMatchAwards(matchId) {
  const byOwner = aggregateOwnerStatsFromEvents(matchId);
  const owners = Object.keys(byOwner);
  if (!owners.length) return [];
  const awards = [];
  const maxGoals = Math.max(...owners.map(o => byOwner[o].goals));
  const maxAssists = Math.max(...owners.map(o => byOwner[o].assists));
  const maxMvp = Math.max(...owners.map(o => byOwner[o].goals * 2 + byOwner[o].assists));

  if (maxGoals > 0) {
    owners.filter(o => byOwner[o].goals === maxGoals).forEach(o => {
      awards.push({ icon: '⚽', title: 'Match Top Scorer', player: o, detail: `${byOwner[o].goals} goal${byOwner[o].goals !== 1 ? 's' : ''}` });
    });
  }
  if (maxAssists > 0) {
    owners.filter(o => byOwner[o].assists === maxAssists).forEach(o => {
      awards.push({ icon: '🎯', title: 'Best Playmaker', player: o, detail: `${byOwner[o].assists} assist${byOwner[o].assists !== 1 ? 's' : ''}` });
    });
  }
  if (maxMvp > 0) {
    owners.filter(o => byOwner[o].goals * 2 + byOwner[o].assists === maxMvp).forEach(o => {
      awards.push({ icon: '👑', title: 'MVP', player: o, detail: `${byOwner[o].goals}G · ${byOwner[o].assists}A` });
    });
  }
  owners.filter(o => byOwner[o].goals >= 3).forEach(o => {
    awards.push({ icon: '🎩', title: 'Hat-trick', player: o, detail: `${byOwner[o].goals} goals` });
  });
  return awards;
}

function matchAwardsHTML(matchId) {
  const awards = computeMatchAwards(matchId);
  if (!awards.length) return '';
  return `<div class="match-awards">${awards.map(a =>
    `<span class="match-award-chip" title="${esc(a.title)} — ${esc(a.detail)}">` +
    `${a.icon} <strong>${esc(a.player)}</strong> <span class="match-award-title">${esc(a.title)}</span></span>`
  ).join('')}</div>`;
}

function goalEventTimelineHTML(matchId) {
  const events = getMatchGoalEvents(matchId);
  if (!events.length) return '';
  return `<div class="goal-timeline">${events.map(e => {
    const min = e.minute > 0 ? `${e.minute}'` : "—";
    const assist = e.assist
      ? `<div class="goal-timeline-assist">🎯 ${esc(e.assist)}</div>` : '';
    return `<div class="goal-timeline-item">
      <div class="goal-timeline-main">⚽ <span class="goal-min">${min}</span> <strong>${esc(e.scorer)}</strong></div>
      ${assist}
      <div class="goal-timeline-owner">${esc(e.owner)}</div>
    </div>`;
  }).join('')}</div>`;
}

function matchGoalSummaryHTML(matchId) {
  const n = getMatchGoalEvents(matchId).length;
  if (!n) return '';
  return `<span class="match-goal-count">${n} goal event${n !== 1 ? 's' : ''}</span>`;
}

async function persistGoalEvents(matchId, events) {
  if (!sb || !goalEventsTablesReady) return;
  await sb.from('match_goal_events').delete().eq('match_id', matchId);
  if (!events.length) {
    db.goalEvents = db.goalEvents.filter(e => e.matchId !== matchId);
    return;
  }
  const payload = events.map((e, i) => ({
    match_id: matchId,
    owner: e.owner,
    scorer: e.scorer,
    assist: e.assist || '',
    minute: e.minute ?? 0,
    sort_order: i
  }));
  const { data, error } = await sb.from('match_goal_events').insert(payload).select();
  if (error) throw error;
  db.goalEvents = db.goalEvents.filter(e => e.matchId !== matchId);
  (data || []).forEach(row => db.goalEvents.push(mapGoalEvent(row)));
}

function getSeasonStatTotals(player, seasonFilter) {
  const matchIds = new Set(
    db.matches.filter(m => seasonFilter === 'all' || m.season === seasonFilter).map(m => m.id)
  );
  let goals = 0, assists = 0;
  if (goalEventsTablesReady) {
    db.goalEvents.filter(e => matchIds.has(e.matchId)).forEach(e => {
      if (e.owner === player) {
        goals++;
        if (e.assist) assists++;
      }
    });
    return { goals, assists };
  }
  db.matchStats.filter(s => s.player === player && matchIds.has(s.matchId)).forEach(s => {
    goals += s.goals;
    assists += s.assists;
  });
  return { goals, assists };
}

function fbPlayerKey(name) {
  return (name || '').trim().toLowerCase();
}

function getMatchIdsForSeason(seasonFilter) {
  return new Set(
    db.matches.filter(m => seasonFilter === 'all' || m.season === seasonFilter).map(m => m.id)
  );
}

function computeFootballPlayerStats(seasonFilter = 'all') {
  const matchIds = getMatchIdsForSeason(seasonFilter);
  const map = {};

  const ensure = (rawName) => {
    const key = fbPlayerKey(rawName);
    if (!key) return null;
    if (!map[key]) map[key] = { name: rawName.trim(), goals: 0, assists: 0, matchIds: new Set() };
    return map[key];
  };

  db.goalEvents.filter(e => matchIds.has(e.matchId)).forEach(e => {
    const scorer = ensure(e.scorer);
    if (scorer) {
      scorer.goals++;
      scorer.matchIds.add(e.matchId);
    }
    if (e.assist) {
      const a = ensure(e.assist);
      if (a) {
        a.assists++;
        a.matchIds.add(e.matchId);
      }
    }
  });

  return Object.values(map).map(p => {
    const matches = p.matchIds.size;
    return {
      name: p.name,
      goals: p.goals,
      assists: p.assists,
      contributions: p.goals + p.assists,
      matches,
      gpg: matches ? (p.goals / matches) : 0
    };
  }).sort((a, b) => b.goals - a.goals || b.assists - a.assists);
}

// ===== RECORD MATCH =====
function updateGoalEventsSetupBanner() {
  const el = document.getElementById('goalEventsSetupBanner');
  if (!el) return;
  if (goalEventsTablesReady) {
    el.classList.add('hidden');
    el.innerHTML = '';
  } else {
    el.classList.remove('hidden');
    el.innerHTML = `<h3>⚠️ Goal events table not set up</h3>
      <p>Run <code>supabase-match-goal-events-migration.sql</code> in Supabase SQL Editor to enable goal-by-goal tracking.</p>
      <p class="qa-hint">Matches still save score only until migration is run.</p>`;
  }
}

function initRecordForm() {
  document.getElementById('matchDate').value = new Date().toISOString().split('T')[0];
  populateSeasonDropdowns();
  populateMatchPlayerDropdowns();
  updateGoalEventsSetupBanner();
  clearMatchForm();
  if (goalEventsTablesReady) renderGoalEventsForm('goalEventsList', []);
}

function clearMatchForm() {
  document.getElementById('matchPlayer1').value = '';
  document.getElementById('matchPlayer2').value = '';
  document.getElementById('matchGoals1').value = '0';
  document.getElementById('matchGoals2').value = '0';
  document.getElementById('matchDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('matchFormError').classList.add('hidden');
  updateMatchPreview();
  if (goalEventsTablesReady) renderGoalEventsForm('goalEventsList', []);
  const active = getActiveSeason();
  if (active) document.getElementById('matchSeason').value = active.id;
}

function updateMatchPreview() {
  const p1 = document.getElementById('matchPlayer1').value;
  const p2 = document.getElementById('matchPlayer2').value;
  const g1 = parseInt(document.getElementById('matchGoals1').value) || 0;
  const g2 = parseInt(document.getElementById('matchGoals2').value) || 0;

  document.getElementById('scoreLabel1').textContent = p1 ? p1 + ' Goals' : 'Goals';
  document.getElementById('scoreLabel2').textContent = p2 ? p2 + ' Goals' : 'Goals';

  if (!p1 || !p2) {
    document.getElementById('previewResult').textContent = '— vs —';
    if (goalEventsTablesReady) updateGoalEventsUI('goalEventsList');
    return;
  }

  let result = '';
  if (g1 > g2) result = `🏆 ${p1} WINS`;
  else if (g2 > g1) result = `🏆 ${p2} WINS`;
  else result = `🤝 DRAW`;

  document.getElementById('previewResult').textContent = `${p1} ${g1} — ${g2} ${p2}  |  ${result}`;
  if (goalEventsTablesReady) updateGoalEventsUI('goalEventsList');
}

async function saveMatch() {
  const p1 = document.getElementById('matchPlayer1').value;
  const p2 = document.getElementById('matchPlayer2').value;
  const g1 = parseInt(document.getElementById('matchGoals1').value);
  const g2 = parseInt(document.getElementById('matchGoals2').value);
  const date = document.getElementById('matchDate').value;
  const season = document.getElementById('matchSeason').value;
  const errEl = document.getElementById('matchFormError');

  if (!isAdmin()) return showError(errEl, 'Only ' + ADMIN + ' (admin) can record matches.');
  if (!p1 || !p2) return showError(errEl, 'Please select both players.');
  if (p1 === p2) return showError(errEl, 'A player cannot play against themselves.');
  if (isNaN(g1) || isNaN(g2) || g1 < 0 || g2 < 0) return showError(errEl, 'Goals cannot be negative.');
  if (!date) return showError(errEl, 'Please select a match date.');
  if (!season) return showError(errEl, 'Please select a season.');

  if (!sb) return showError(errEl, 'Supabase is not configured. See supabase-config.js.');

  errEl.classList.add('hidden');

  const goalRows = collectGoalEventsFromForm('goalEventsList');
  if (goalEventsTablesReady && goalRows.length) {
    const geErr = validateGoalEvents(goalRows, p1, p2, g1, g2);
    if (geErr) return showError(errEl, geErr);
  }

  const { data, error } = await sb.from('matches')
    .insert({ player1: p1, player2: p2, goals1: g1, goals2: g2, date, season_id: season, timestamp: Date.now() })
    .select().single();
  if (error) return showError(errEl, 'Could not save match to Supabase.');

  db.matches.push(mapMatch(data));
  try {
    await persistGoalEvents(data.id, goalRows);
  } catch (e) {
    showToast('Match saved but goal events failed to save.', true);
  }
  cacheDB();
  updateSidebarPlayer();
  await syncDerivedData();
  showToast(`Match saved! ${p1} ${g1}–${g2} ${p2}`);
  clearMatchForm();
}

// ===== MATCH HISTORY =====
function renderHistory() {
  const search = (document.getElementById('historySearch')?.value || '').toLowerCase();
  const filterPlayer = document.getElementById('historyFilterPlayer')?.value || '';
  const filterSeason = document.getElementById('historyFilterSeason')?.value || '';
  const sort = document.getElementById('historySort')?.value || 'newest';

  let matches = [...db.matches];

  if (search) matches = matches.filter(m =>
    m.player1.toLowerCase().includes(search) || m.player2.toLowerCase().includes(search));
  if (filterPlayer) matches = matches.filter(m => m.player1 === filterPlayer || m.player2 === filterPlayer);
  if (filterSeason && filterSeason !== 'all') matches = matches.filter(m => m.season === filterSeason);

  matches.sort((a, b) => sort === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp);

  document.getElementById('historyCount').textContent = `${matches.length} match${matches.length !== 1 ? 'es' : ''} found`;

  const container = document.getElementById('matchList');
  if (matches.length === 0) {
    container.innerHTML = `<div class="match-list-empty">
      <span class="empty-icon">⚽</span>
      <p>No matches found. Record your first match!</p>
    </div>`;
    return;
  }

  container.innerHTML = matches.map(m => matchCardHTML(m)).join('');
}

function matchCardHTML(m) {
  const season = db.seasons.find(s => s.id === m.season);
  const seasonName = season ? season.name : 'Unknown Season';
  const date = m.date ? new Date(m.date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';

  let resultBadge = `<span class="win-badge draw">DRAW</span>`;
  if (m.goals1 > m.goals2) resultBadge = `<span class="win-badge win">${esc(m.player1)} W</span>`;
  else if (m.goals2 > m.goals1) resultBadge = `<span class="win-badge win">${esc(m.player2)} W</span>`;

  return `
    <div class="match-card" id="match-card-${m.id}">
      <div class="match-card-header">
        <span>📅 ${date}</span>
        <span>|</span>
        <span>🏆 ${esc(seasonName)}</span>
        <span>|</span>
        ${resultBadge}
      </div>
      <div class="match-card-result">
        <div class="match-player">${matchPlayerLabel(m.player1)}</div>
        <div class="match-score">${m.goals1} — ${m.goals2}</div>
        <div class="match-player right">${matchPlayerLabel(m.player2)}</div>
      </div>
      ${matchGoalSummaryHTML(m.id)}
      ${matchAwardsHTML(m.id)}
      <div class="match-card-actions">
        <button class="btn-sm" onclick="openMatchDetails('${m.id}')">📄 Details</button>
        ${isAdmin() ? `
        <button class="btn-sm edit" onclick="openEditModal('${m.id}')">✏️ Edit</button>
        <button class="btn-sm delete" onclick="deleteMatch('${m.id}')">🗑️ Delete</button>` : ''}
      </div>
    </div>`;
}

function deleteMatch(id) {
  if (!requireAdmin()) return;
  showConfirm('Delete Match', 'Are you sure you want to delete this match? This cannot be undone.', async () => {
    if (!sb) return showToast('Supabase is not configured.', true);
    const { error } = await sb.from('matches').delete().eq('id', id);
    if (error) return showToast('Could not delete match.', true);

    db.matches = db.matches.filter(m => m.id !== id);
    db.matchStats = db.matchStats.filter(s => s.matchId !== id);
    db.goalEvents = db.goalEvents.filter(e => e.matchId !== id);
    cacheDB();
    await syncDerivedData();
    renderHistory();
    updateSidebarPlayer();
    showToast('Match deleted.');
  });
}

function openEditModal(id) {
  if (!requireAdmin()) return;
  const m = db.matches.find(x => x.id === id);
  if (!m) return;

  populateSeasonDropdowns();
  populateMatchPlayerDropdowns();

  document.getElementById('editMatchId').value = m.id;
  document.getElementById('editPlayer1').value = m.player1;
  document.getElementById('editPlayer2').value = m.player2;
  document.getElementById('editGoals1').value = m.goals1;
  document.getElementById('editGoals2').value = m.goals2;
  document.getElementById('editDate').value = m.date;
  document.getElementById('editSeason').value = m.season;

  if (goalEventsTablesReady) {
    renderGoalEventsForm('editGoalEventsList', getMatchGoalEvents(id).map(e => ({
      owner: e.owner, scorer: e.scorer, assist: e.assist, minute: e.minute
    })));
  }
  document.getElementById('editMatchModal').classList.remove('hidden');
}

function onEditMatchPlayersChange() {
  const events = collectGoalEventsFromForm('editGoalEventsList');
  renderGoalEventsForm('editGoalEventsList', events);
}

function closeEditModal() {
  document.getElementById('editMatchModal').classList.add('hidden');
}

async function saveEditMatch() {
  const id = document.getElementById('editMatchId').value;
  const p1 = document.getElementById('editPlayer1').value;
  const p2 = document.getElementById('editPlayer2').value;
  const g1 = parseInt(document.getElementById('editGoals1').value);
  const g2 = parseInt(document.getElementById('editGoals2').value);
  const date = document.getElementById('editDate').value;
  const season = document.getElementById('editSeason').value;
  const errEl = document.getElementById('editError');

  if (!isAdmin()) return showError(errEl, 'Only ' + ADMIN + ' (admin) can edit matches.');
  if (!p1 || !p2) return showError(errEl, 'Please select both players.');
  if (p1 === p2) return showError(errEl, 'A player cannot play against themselves.');
  if (isNaN(g1) || isNaN(g2) || g1 < 0 || g2 < 0) return showError(errEl, 'Goals cannot be negative.');
  if (!date) return showError(errEl, 'Please select a match date.');

  if (!sb) return showError(errEl, 'Supabase is not configured.');

  errEl.classList.add('hidden');

  const idx = db.matches.findIndex(m => m.id === id);
  if (idx === -1) return;

  const goalRows = collectGoalEventsFromForm('editGoalEventsList');
  if (goalEventsTablesReady && goalRows.length) {
    const geErr = validateGoalEvents(goalRows, p1, p2, g1, g2);
    if (geErr) return showError(errEl, geErr);
  }

  const { error } = await sb.from('matches')
    .update({ player1: p1, player2: p2, goals1: g1, goals2: g2, date, season_id: season })
    .eq('id', id);
  if (error) return showError(errEl, 'Could not update match.');

  db.matches[idx] = { ...db.matches[idx], player1: p1, player2: p2, goals1: g1, goals2: g2, date, season };
  try {
    await persistGoalEvents(id, goalRows);
  } catch (e) {
    showToast('Match updated but goal events failed to save.', true);
  }
  cacheDB();
  await syncDerivedData();
  closeEditModal();
  renderHistory();
  updateSidebarPlayer();
  showToast('Match updated!');
}

// ===== MATCH DETAILS =====
function openMatchDetails(matchId) {
  viewingMatchId = matchId;
  navigateTo('matchDetails', null);
}

function backFromMatchDetails() {
  viewingMatchId = null;
  navigateTo('matchHistory', document.querySelector('.nav-item[data-page="matchHistory"]'));
}

function renderMatchDetails() {
  const cont = document.getElementById('matchDetailsContent');
  const sub = document.getElementById('matchDetailsSubtitle');
  if (!cont) return;

  if (!goalEventsTablesReady) {
    cont.innerHTML = `<div class="qa-setup-banner">
      <h3>⚠️ Goal events not set up</h3>
      <p>Run <code>supabase-match-goal-events-migration.sql</code> in Supabase SQL Editor, then refresh.</p>
    </div>`;
    return;
  }

  const m = db.matches.find(x => x.id === viewingMatchId);
  if (!m) {
    if (sub) sub.textContent = '—';
    cont.innerHTML = '<div class="empty-state">Match not found.</div>';
    return;
  }

  const season = db.seasons.find(s => s.id === m.season);
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
        <button class="btn-sm edit" onclick="openEditModal('${m.id}')">✏️ Edit match</button>
      </div>` : ''}
    </div>`;
}

// ===== FOOTBALL PLAYER PERFORMANCE =====
function renderFootballStats() {
  populateSeasonDropdowns();
  const seasonSel = document.getElementById('fbStatsSeasonFilter');

  const contLb = document.getElementById('fbLeaderboards');
  const contTbl = document.getElementById('fbStatsTable');
  const detail = document.getElementById('fbPlayerDetail');
  if (!contLb || !contTbl) return;

  if (!goalEventsTablesReady) {
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
        ${players.map(p => `<tr class="fb-row-click" onclick='showFootballPlayerDetail(${JSON.stringify(p.name)})'>
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

function showFootballPlayerDetail(name) {
  const detail = document.getElementById('fbPlayerDetail');
  if (!detail) return;
  const filter = document.getElementById('fbStatsSeasonFilter')?.value || 'all';
  const matchIds = getMatchIdsForSeason(filter);
  const key = fbPlayerKey(name);

  const goals = [];
  const assists = [];
  db.goalEvents.filter(e => matchIds.has(e.matchId)).forEach(e => {
    const m = db.matches.find(x => x.id === e.matchId);
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

// ===== STATS ENGINE =====
// `countSeasonWins` is set to false when called from computeLeagueTable to
// prevent infinite mutual recursion (table -> stats -> table -> ...).
function computePlayerStats(playerName, seasonFilter = 'all', countSeasonWins = true) {
  let matches = db.matches.filter(m =>
    (m.player1 === playerName || m.player2 === playerName) &&
    (seasonFilter === 'all' || m.season === seasonFilter)
  );

  let played = 0, wins = 0, draws = 0, losses = 0;
  let goalsFor = 0, goalsAgainst = 0, cleanSheets = 0;
  let biggestWin = null, biggestLoss = null;
  let currentStreak = 0, bestStreak = 0, tempStreak = 0;
  let seasonWins = 0;

  const chronological = [...matches].sort((a, b) => a.timestamp - b.timestamp);

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
    db.seasons.forEach(s => {
      const sTable = computeLeagueTable(s.id);
      if (sTable.length > 0 && sTable[0].player === playerName) seasonWins++;
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

function computeLeagueTable(seasonFilter = 'all') {
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
    return b.goalsFor - a.goalsFor;
  });

  return table;
}

// ===== DASHBOARD =====
function renderDashboard() {
  const activeSeason = getActiveSeason();
  document.getElementById('dashCurrentSeason').textContent =
    activeSeason ? `${activeSeason.name} — Active` : 'No Active Season';

  const table = computeLeagueTable('all');
  const seasonMatches = activeSeason ? db.matches.filter(m => m.season === activeSeason.id) : [];

  // Leader
  const leader = table[0];
  setStatCard('sc-leader', leader ? leader.player : '—', leader ? leader.points + ' pts' : '0 pts');

  // Top scorer
  const scorers = getPlayers().map(p => ({ player: p, goals: computePlayerStats(p).goalsFor }))
                         .sort((a, b) => b.goals - a.goals);
  setStatCard('sc-scorer', scorers[0].goals > 0 ? scorers[0].player : '—',
              scorers[0].goals + ' goals');

  // Best defense (fewest conceded among those who played)
  const defenders = getPlayers().map(p => { const s = computePlayerStats(p); return { player: p, ga: s.goalsAgainst, played: s.played }; })
    .filter(p => p.played > 0).sort((a, b) => a.ga - b.ga);
  setStatCard('sc-defense', defenders[0] ? defenders[0].player : '—',
              defenders[0] ? defenders[0].ga + ' conceded' : '0 conceded');

  // Best attack
  const attackers = [...scorers];
  setStatCard('sc-attack', attackers[0].goals > 0 ? attackers[0].player : '—',
              attackers[0].goals + ' scored');

  // Most wins
  const winPlayers = getPlayers().map(p => { const s = computePlayerStats(p); return { player: p, wins: s.wins }; })
                             .sort((a, b) => b.wins - a.wins);
  setStatCard('sc-wins', winPlayers[0].wins > 0 ? winPlayers[0].player : '—',
              winPlayers[0].wins + ' wins');

  // Total matches
  setStatCard('sc-matches', seasonMatches.length.toString(), 'this season');

  // Recent matches
  const recent = [...db.matches].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
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

function setStatCard(id, value, sub) {
  const valEl = document.getElementById(id + '-val');
  const subEl = document.getElementById(id + '-sub');
  if (valEl) valEl.textContent = value;
  if (subEl) subEl.textContent = sub;
}

// ===== LEAGUE TABLE =====
function renderLeagueTable() {
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

// ===== PLAYER PROFILE =====
function selectProfilePlayer(name, btn) {
  document.querySelectorAll('#profilePlayerTabs .player-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const s = computePlayerStats(name);
  const matches = db.matches.filter(m => m.player1 === name || m.player2 === name);
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

function statItem(label, value, color = '') {
  const colorClass = color === 'neon' ? 'text-neon' : color === 'red' ? 'text-red' : color === 'gold' ? 'text-gold' : '';
  return `<div class="profile-stat-item">
    <div class="psi-label">${label}</div>
    <div class="psi-value ${colorClass}">${esc(String(value))}</div>
  </div>`;
}

// ===== HEAD TO HEAD =====
function renderH2H() {
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

  const matches = db.matches.filter(m =>
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

// ===== AWARDS =====
function renderAwards() {
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
    { icon: '⚽', title: 'TOP SCORER', winner: scorers[0].goals > 0 ? scorers[0].player : null, desc: `${scorers[0].goals} goals` },
    { icon: '🧱', title: 'BEST DEFENSE', winner: defenders[0] ? defenders[0].player : null, desc: defenders[0] ? `${defenders[0].ga} goals conceded` : 'No matches yet' },
    { icon: '🔥', title: 'MOST WINS', winner: winners[0].wins > 0 ? winners[0].player : null, desc: `${winners[0].wins} wins` },
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

// ===== ACHIEVEMENTS =====
function selectAchievementsPlayer(name, btn) {
  document.querySelectorAll('#achievementsPlayerTabs .player-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const s = computePlayerStats(name);
  const unlocked = ACHIEVEMENT_DEFS.filter(a => a.check(s));
  const unlockedIds = unlocked.map(a => a.id);

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

// ===== RIVALRIES =====
function renderRivalries() {
  const cont = document.getElementById('rivalriesContent');
  if (!cont) return;

  const pairs = {};
  db.matches.forEach(m => {
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

// ===== STATISTICS =====
function renderStatistics() {
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
        const pct = maxVal > 0 ? (Math.max(d[valueKey], 0) / maxVal) * 100 : 0;
        return `<div class="chart-bar-row">
          <div class="chart-bar-label">${esc(d.player)}</div>
          <div class="chart-bar-track">
            <div class="chart-bar-fill ${color}" style="width:${pct}%" data-val="${d[valueKey]}"></div>
          </div>
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
      ${(goalEventsTablesReady || matchStatsTablesReady) ? `
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

// ===== LEAGUE Q&A =====
function getQuestionAnswers(questionId) {
  return db.answers.filter(a => a.questionId === questionId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function renderQuestions() {
  const cont = document.getElementById('qaContent');
  if (!cont) return;

  if (!sb) {
    cont.innerHTML = '<div class="empty-state">Supabase is not configured.</div>';
    return;
  }

  if (!qaTablesReady) {
    cont.innerHTML = `<div class="qa-setup-banner">
      <h3>⚠️ Q&amp;A tables not set up yet</h3>
      <p>Open <strong>Supabase → SQL Editor</strong> and run the file <code>supabase-questions-migration.sql</code> from the project (one time only).</p>
      <p class="qa-hint">After running it, refresh this page (Ctrl+Shift+R).</p>
    </div>`;
    return;
  }

  if (qaSelectedId) {
    renderQuestionDetail(qaSelectedId);
    return;
  }

  const open = db.questions.filter(q => !q.closed);
  const closed = db.questions.filter(q => q.closed);

  const card = (q) => {
    const n = getQuestionAnswers(q.id).length;
    const adminDel = isAdmin()
      ? `<button class="btn-sm delete qa-delete" onclick="event.stopPropagation();deleteQuestion('${q.id}')" title="Admin: delete question">🗑️</button>`
      : '';
    return `<div class="qa-card" onclick="openQuestion('${q.id}')">
      <div class="qa-card-top">
        <span class="qa-author">${esc(q.author)}</span>
        <span class="qa-card-top-right">
          ${q.closed
            ? '<span class="qa-badge closed">CLOSED</span>'
            : '<span class="qa-badge open">OPEN</span>'}
          ${adminDel}
        </span>
      </div>
      <p class="qa-card-body">${esc(q.body)}</p>
      <div class="qa-card-meta">${n} answer${n !== 1 ? 's' : ''} · ${formatDate(q.timestamp)}</div>
    </div>`;
  };

  cont.innerHTML = `
    <div class="qa-list-view">
      <div class="panel qa-ask-panel">
        <div class="panel-header">❓ ASK A QUESTION</div>
        <div class="panel-body">
          <textarea id="qaAskBody" rows="3" placeholder="Write your question for the league..."></textarea>
          <div id="qaAskError" class="login-error hidden"></div>
          <button class="btn-primary" onclick="submitQuestion()">POST QUESTION</button>
        </div>
      </div>
      <h3 class="qa-section-title">Open (${open.length})</h3>
      <div class="qa-list">${open.length ? open.map(card).join('') : '<div class="empty-state">No open questions yet.</div>'}</div>
      ${closed.length ? `<h3 class="qa-section-title">Closed (${closed.length})</h3>
        <div class="qa-list">${closed.map(card).join('')}</div>` : ''}
      ${isAdmin() && closed.length ? `
      <div class="qa-admin-actions">
        <button class="btn-danger btn-sm" onclick="deleteAllClosedQuestions()">🗑️ Delete all closed questions (${closed.length})</button>
      </div>` : ''}
    </div>`;
}

function openQuestion(id) {
  qaSelectedId = id;
  renderQuestionDetail(id);
}

function backToQuestions() {
  qaSelectedId = null;
  renderQuestions();
}

function renderQuestionDetail(id) {
  const cont = document.getElementById('qaContent');
  const q = db.questions.find(x => x.id === id);
  if (!cont || !q) { qaSelectedId = null; renderQuestions(); return; }

  const answers = getQuestionAnswers(id);
  const isAuthor = q.author === currentUser;
  const canAnswer = !q.closed;

  const answerHtml = answers.length ? answers.map(a => {
    const isCorrect = q.correctAnswerId === a.id;
    const markBtn = (isAuthor && !q.closed)
      ? `<button class="btn-sm qa-mark-correct" onclick="event.stopPropagation();markCorrectAnswer('${q.id}','${a.id}')">✓ Mark Correct</button>`
      : '';
    return `<div class="qa-answer ${isCorrect ? 'correct' : ''}">
      <div class="qa-answer-top">
        <span class="qa-author">${esc(a.author)}</span>
        ${isCorrect ? '<span class="qa-badge correct">✓ CORRECT</span>' : ''}
      </div>
      <p class="qa-answer-body">${esc(a.body)}</p>
      <div class="qa-answer-foot">
        <span class="qa-card-meta">${formatDate(a.timestamp)}</span>
        ${markBtn}
      </div>
    </div>`;
  }).join('') : '<div class="empty-state">No answers yet. Be the first!</div>';

  cont.innerHTML = `
    <div class="qa-detail-view">
      <button class="btn-sm qa-back" onclick="backToQuestions()">← All Questions</button>
      <div class="panel qa-question-panel">
        <div class="panel-header qa-detail-header">
          <span>Question by ${esc(q.author)}</span>
          <span class="qa-card-top-right">
            ${q.closed ? '<span class="qa-badge closed">CLOSED</span>' : '<span class="qa-badge open">OPEN</span>'}
            ${isAdmin() ? `<button class="btn-sm delete" onclick="deleteQuestion('${q.id}')">🗑️ Delete Question</button>` : ''}
          </span>
        </div>
        <div class="panel-body">
          <p class="qa-question-body">${esc(q.body)}</p>
          ${q.closed && isAuthor ? '<p class="qa-hint">You picked the correct answer. No more replies.</p>' : ''}
          ${!q.closed && isAuthor ? '<p class="qa-hint">Pick one answer as correct to close this question.</p>' : ''}
        </div>
      </div>
      <h3 class="qa-section-title">Answers (${answers.length})</h3>
      <div class="qa-answers">${answerHtml}</div>
      ${canAnswer ? `
      <div class="panel qa-answer-panel">
        <div class="panel-header">💬 YOUR ANSWER</div>
        <div class="panel-body">
          <textarea id="qaAnswerBody" rows="3" placeholder="Write your answer..."></textarea>
          <div id="qaAnswerError" class="login-error hidden"></div>
          <button class="btn-primary" onclick="submitAnswer('${q.id}')">SUBMIT ANSWER</button>
        </div>
      </div>` : '<div class="qa-closed-note">🔒 This question is closed — no more answers.</div>'}
    </div>`;
}

async function submitQuestion() {
  const err = document.getElementById('qaAskError');
  const body = (document.getElementById('qaAskBody')?.value || '').trim();
  if (!sb) return showError(err, 'Supabase is not configured.');
  if (!currentUser) return showError(err, 'Please log in.');
  if (!body) return showError(err, 'Please write a question.');
  if (body.length < 3) return showError(err, 'Question is too short.');

  const { data, error } = await sb.from('questions')
    .insert({ author: currentUser, body, timestamp: Date.now() })
    .select().single();
  if (error) {
    if (isQaTableMissing(error)) return showError(err, 'Q&A tables missing. Run supabase-questions-migration.sql in Supabase.');
    return showError(err, 'Could not post question.');
  }

  db.questions.unshift(mapQuestion(data));
  cacheDB();
  err?.classList.add('hidden');
  showToast('Question posted!');
  qaSelectedId = null;
  renderQuestions();
}

async function submitAnswer(questionId) {
  const err = document.getElementById('qaAnswerError');
  const body = (document.getElementById('qaAnswerBody')?.value || '').trim();
  const q = db.questions.find(x => x.id === questionId);
  if (!sb) return showError(err, 'Supabase is not configured.');
  if (!currentUser) return showError(err, 'Please log in.');
  if (!q) return;
  if (q.closed) return showError(err, 'This question is closed.');
  if (!body) return showError(err, 'Please write an answer.');
  if (body.length < 2) return showError(err, 'Answer is too short.');

  const { data, error } = await sb.from('answers')
    .insert({ question_id: questionId, author: currentUser, body, timestamp: Date.now() })
    .select().single();
  if (error) {
    if (isQaTableMissing(error)) return showError(err, 'Q&A tables missing. Run supabase-questions-migration.sql in Supabase.');
    return showError(err, 'Could not post answer.');
  }

  db.answers.push(mapAnswer(data));
  cacheDB();
  err?.classList.add('hidden');
  showToast('Answer posted!');
  renderQuestionDetail(questionId);
}

function deleteQuestion(id) {
  if (!requireAdmin()) return;
  const q = db.questions.find(x => x.id === id);
  if (!q) return;
  const n = getQuestionAnswers(id).length;
  showConfirm(
    'Delete Question',
    `Delete this question and ${n} answer${n !== 1 ? 's' : ''}? This cannot be undone.`,
    async () => {
      if (!sb) return showToast('Supabase is not configured.', true);
      const { error } = await sb.from('questions').delete().eq('id', id);
      if (error) return showToast('Could not delete question.', true);

      db.questions = db.questions.filter(x => x.id !== id);
      db.answers = db.answers.filter(a => a.questionId !== id);
      cacheDB();
      if (qaSelectedId === id) qaSelectedId = null;
      showToast('Question deleted.');
      renderQuestions();
    }
  );
}

function deleteAllClosedQuestions() {
  if (!requireAdmin()) return;
  const closed = db.questions.filter(q => q.closed);
  if (!closed.length) return showToast('No closed questions to delete.', true);
  const totalAnswers = closed.reduce((sum, q) => sum + getQuestionAnswers(q.id).length, 0);
  showConfirm(
    'Delete All Closed Questions',
    `Delete ${closed.length} closed question(s) and ${totalAnswers} answer(s)? This cannot be undone.`,
    async () => {
      if (!sb) return showToast('Supabase is not configured.', true);
      const ids = closed.map(q => q.id);
      const { error } = await sb.from('questions').delete().in('id', ids);
      if (error) return showToast('Could not delete questions.', true);

      const idSet = new Set(ids);
      db.questions = db.questions.filter(q => !idSet.has(q.id));
      db.answers = db.answers.filter(a => !idSet.has(a.questionId));
      cacheDB();
      qaSelectedId = null;
      showToast(`${closed.length} question(s) deleted.`);
      renderQuestions();
    }
  );
}

function markCorrectAnswer(questionId, answerId) {
  const q = db.questions.find(x => x.id === questionId);
  if (!q) return;
  if (q.author !== currentUser) return showToast('Only the person who asked can pick the correct answer.', true);
  if (q.closed) return showToast('This question is already closed.', true);
  const ans = db.answers.find(a => a.id === answerId && a.questionId === questionId);
  if (!ans) return showToast('Answer not found.', true);

  showConfirm(
    'Mark Correct Answer',
    `Mark ${ans.author}'s answer as correct? The question will close and no one can reply anymore.`,
    async () => {
      if (!sb) return showToast('Supabase is not configured.', true);
      const { error } = await sb.from('questions')
        .update({ closed: true, correct_answer_id: answerId })
        .eq('id', questionId);
      if (error) return showToast('Could not close question.', true);

      q.closed = true;
      q.correctAnswerId = answerId;
      cacheDB();
      showToast('Correct answer chosen — question closed!');
      renderQuestionDetail(questionId);
    }
  );
}

// ===== SETTINGS =====
function exportData() {
  const data = JSON.stringify(db, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'efootball_league_backup_' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported successfully!');
}

function importData(event) {
  if (!requireAdmin()) { event.target.value = ''; return; }
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.matches || !data.seasons) throw new Error('Invalid format');
      showConfirm('Import Data', 'This will REPLACE all current data in Supabase with the imported backup. Are you sure?', async () => {
        if (!sb) return showToast('Supabase is not configured.', true);
        try {
          await wipeAllData();

          // Insert seasons (Supabase assigns fresh ids) and map old -> new ids.
          const seasonIdMap = {};
          for (const s of data.seasons) {
            const { data: row, error } = await sb.from('seasons')
              .insert({ name: s.name, active: !!s.active, created: s.created || Date.now() })
              .select().single();
            if (error) throw error;
            seasonIdMap[s.id] = row.id;
          }

          if (data.accounts) {
            const accs = Object.values(data.accounts).map(a => ({
              name: a.username, password: a.password, created: a.created || Date.now()
            }));
            if (accs.length) await sb.from('players').insert(accs);
          }

          const ms = data.matches.map(m => ({
            player1: m.player1, player2: m.player2,
            goals1: m.goals1, goals2: m.goals2,
            date: m.date, season_id: seasonIdMap[m.season] || null,
            timestamp: m.timestamp || Date.now()
          }));
          if (ms.length) await sb.from('matches').insert(ms);

          await fetchAllData();
          await syncDerivedData();
          populateSeasonDropdowns();
          updateSidebarPlayer();
          navigateTo('dashboard', document.querySelector('.nav-item[data-page="dashboard"]'));
          showToast('Data imported successfully!');
        } catch (err) {
          showToast('Import failed. Please check the backup file.', true);
        }
      });
    } catch(err) {
      showToast('Invalid backup file.', true);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// Deletes every row from all data tables. Used by import + reset all.
async function wipeAllData() {
  if (!sb) return;
  await sb.from('matches').delete().neq('timestamp', -1);
  await sb.from('seasons').delete().neq('created', -1);
  await sb.from('players').delete().neq('name', '');
  await sb.from('standings').delete().neq('player', '');
  await sb.from('achievements').delete().neq('player', '');
  try {
    await sb.from('answers').delete().neq('timestamp', -1);
    await sb.from('questions').delete().neq('timestamp', -1);
  } catch (e) { /* Q&A tables may not exist yet */ }
  try {
    await sb.from('match_goal_events').delete().neq('minute', -1);
    await sb.from('match_stats').delete().neq('goals', -1);
  } catch (e) { /* optional tables */ }
}

function confirmResetSeason() {
  if (!requireAdmin()) return;
  const active = getActiveSeason();
  if (!active) return showToast('No active season to reset.', true);
  const count = db.matches.filter(m => m.season === active.id).length;
  showConfirm('Reset Season', `Delete all ${count} match(es) from "${active.name}"? This cannot be undone.`, async () => {
    if (!sb) return showToast('Supabase is not configured.', true);
    const { error } = await sb.from('matches').delete().eq('season_id', active.id);
    if (error) return showToast('Could not reset season.', true);

    db.matches = db.matches.filter(m => m.season !== active.id);
    const keptIds = new Set(db.matches.map(m => m.id));
    db.goalEvents = db.goalEvents.filter(e => keptIds.has(e.matchId));
    db.matchStats = db.matchStats.filter(s => keptIds.has(s.matchId));
    cacheDB();
    await syncDerivedData();
    updateSidebarPlayer();
    renderPage(currentPage);
    showToast('Season reset.');
  });
}

function confirmResetAll() {
  if (!requireAdmin()) return;
  showConfirm('⚠️ RESET ALL DATA', 'This will permanently delete ALL matches, seasons, and accounts. This CANNOT be undone!', async () => {
    if (!sb) return showToast('Supabase is not configured.', true);
    try {
      await wipeAllData();
      // Re-seed one active season so the app stays usable.
      const { data } = await sb.from('seasons').insert({ name: 'Season 1', active: true }).select().single();
      db = { accounts: {}, matches: [], seasons: data ? [mapSeason(data)] : [], questions: [], answers: [], matchStats: [], goalEvents: [] };
    } catch (e) {
      return showToast('Could not reset data.', true);
    }
    currentUser = null;
    localStorage.removeItem('efl_user');
    try { localStorage.removeItem('efl_cache'); } catch (e) {}
    showToast('All data has been reset.');
    setTimeout(() => showLogin(), 1000);
  });
}

// ===== HELPERS =====
function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

function showConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmModal').classList.remove('hidden');
  document.getElementById('confirmYes').onclick = () => {
    closeConfirmModal();
    onConfirm();
  };
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.add('hidden');
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}
