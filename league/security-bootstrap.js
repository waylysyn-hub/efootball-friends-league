/* Secure league bootstrap: registered before script.js, executed first on DOMContentLoaded. */
'use strict';

window.__eflProfile = null;

document.addEventListener('DOMContentLoaded', () => {
  isAdmin = function () {
    return !!window.__eflProfile && window.__eflProfile.role === 'admin';
  };

  requireAdmin = function () {
    if (!isAdmin()) {
      showToast('Admin permission is required for this action.', true);
      return false;
    }
    return true;
  };

  cacheDB = function () {
    try {
      const safeAccounts = {};
      Object.entries(db.accounts || {}).forEach(([name, account]) => {
        safeAccounts[name] = {
          username: name,
          role: account?.role || 'player',
          created: Number(account?.created) || 0,
        };
      });
      localStorage.setItem('efl_cache', JSON.stringify({
        accounts: safeAccounts,
        seasons: db.seasons,
        matches: db.matches,
        questions: db.questions || [],
        answers: db.answers || [],
        matchStats: db.matchStats || [],
        goalEvents: db.goalEvents || [],
      }));
    } catch (_) {}
  };

  loadCache = function () {
    try {
      const raw = localStorage.getItem('efl_cache');
      if (!raw) return;
      const c = JSON.parse(raw);
      if (!c || !c.seasons || !c.matches) return;
      const safeAccounts = {};
      Object.entries(c.accounts || {}).forEach(([name, account]) => {
        safeAccounts[name] = {
          username: name,
          role: account?.role || 'player',
          created: Number(account?.created) || 0,
        };
      });
      db = {
        accounts: safeAccounts,
        seasons: c.seasons,
        matches: c.matches,
        questions: c.questions || [],
        answers: c.answers || [],
        matchStats: c.matchStats || [],
        goalEvents: c.goalEvents || [],
      };
    } catch (_) {}
  };

  fetchAllData = async function () {
    if (!sb) throw new Error('Supabase not configured');

    try {
      const profile = await EFLAuth.restore(sb);
      if (profile) {
        window.__eflProfile = profile;
        currentUser = profile.name;
      } else {
        window.__eflProfile = null;
        currentUser = null;
      }
    } catch (error) {
      console.warn('[Auth] session restore failed:', error?.message || error);
      window.__eflProfile = null;
      currentUser = null;
    }

    const [players, seasons, matches, questions, answers, matchStats, goalEvents] = await Promise.all([
      sb.from('players').select('name, role, created').order('name'),
      sb.from('seasons').select('*').order('created', { ascending: true }),
      sb.from('matches').select('*'),
      sb.from('questions').select('*').order('timestamp', { ascending: false }),
      sb.from('answers').select('*').order('timestamp', { ascending: true }),
      sb.from('match_stats').select('*'),
      sb.from('match_goal_events').select('*').order('sort_order', { ascending: true }),
    ]);

    if (players.error || seasons.error || matches.error) throw players.error || seasons.error || matches.error;

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
    (players.data || []).forEach((p) => {
      db.accounts[p.name] = { username: p.name, role: p.role || 'player', created: Number(p.created) || 0 };
    });
    db.seasons = (seasons.data || []).map(mapSeason);
    db.matches = (matches.data || []).map(mapMatch);

    populateAllPlayerDropdowns();
    cacheDB();
    updateGoalEventsSetupBanner();
  };

  handleLogin = async function () {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const err = document.getElementById('loginError');
    if (!username) return showError(err, 'Please select your name.');
    if (!password) return showError(err, 'Please enter your password.');

    try {
      const profile = await EFLAuth.signIn(sb, username, password);
      window.__eflProfile = profile;
      currentUser = profile.name;
      try { localStorage.setItem('efl_last_user', profile.name); } catch (_) {}
      err.classList.add('hidden');
      await fetchAllData();
      enterApp();
    } catch (error) {
      console.warn('[Auth] sign-in failed:', error?.message || error);
      showError(err, 'Invalid username or password.');
    }
  };

  handleLogout = async function () {
    try { await EFLAuth.signOut(sb); } catch (_) {}
    window.__eflProfile = null;
    currentUser = null;
    showLogin();
  };

  adminCreateAccount = async function () {
    const err = document.getElementById('adminAccError');
    if (!isAdmin()) return showError(err, 'Admin permission is required.');
    const username = document.getElementById('adminAccName').value;
    const password = document.getElementById('adminAccPassword').value;
    try {
      await EFLAuth.createPlayerAccount(sb, username, password);
      await fetchAllData();
      err.classList.add('hidden');
      document.getElementById('adminAccPassword').value = '';
      showToast(`Secure login created for ${username}.`);
    } catch (error) {
      showError(err, error?.message || 'Could not create secure account.');
    }
  };

  // Derived standings/achievements are refreshed by database triggers.
  persistStandings = async function () {};
  persistAchievements = async function () {};
  syncDerivedData = async function () {};

  try {
    const remembered = localStorage.getItem('efl_last_user');
    const select = document.getElementById('loginUsername');
    if (remembered && select && [...select.options].some((o) => o.value === remembered)) select.value = remembered;
  } catch (_) {}
});
