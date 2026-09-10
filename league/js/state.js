

export const state = {
  profile: null, user: null, page: 'dashboard', questionId: null, matchId: null,
  qaReady: false, statsReady: false, goalsReady: false, signingIn: false,
  selectedProfile: null, selectedAchievements: null,
  db: { accounts: {}, matches: [], seasons: [], questions: [], answers: [], matchStats: [], goalEvents: [], standings: [], achievements: [] },
};

export const sb = window.EFLClient?.get() || null;

export const NICKNAMES = {
  'Wael':        { nick: 'Zlatan',     icon: '🦁' },
  'Mustafa':     { nick: 'Ronaldinho', icon: '🪄' },
  'Abdul Rahim': { nick: 'Abu Al Wafa', icon: '🤝' },
  'Mohammad':    { nick: 'Del Piero',  icon: '🎯' },
  'Omar':        { nick: 'Drogba',     icon: '🐘' },
  'Abdul Qader': { nick: 'Nesta',      icon: '🛡️' },
};

export const ACHIEVEMENT_DEFS = [
  { id: 'first_win',   icon: '🥇', name: 'First Win',         desc: 'Win your first match',         check: (s) => s.wins >= 1 },
  { id: 'wins10',      icon: '🏆', name: '10 Wins',           desc: 'Win 10 matches',                check: (s) => s.wins >= 10 },
  { id: 'goals50',     icon: '⚽', name: '50 Goals',          desc: 'Score 50 goals',                check: (s) => s.goalsFor >= 50 },
  { id: 'goals100',    icon: '💯', name: '100 Goals',         desc: 'Score 100 goals',               check: (s) => s.goalsFor >= 100 },
  { id: 'streak5',     icon: '🔥', name: '5 Win Streak',      desc: 'Win 5 matches in a row',        check: (s) => s.bestStreak >= 5 },
  { id: 'champion',    icon: '👑', name: 'Champion',          desc: 'Win a season',                  check: (s) => s.seasonWins >= 1 },
  { id: 'played20',    icon: '🎮', name: '20 Matches',        desc: 'Play 20 matches',               check: (s) => s.played >= 20 },
  { id: 'clean5',      icon: '🧱', name: '5 Clean Sheets',    desc: 'Keep 5 clean sheets',           check: (s) => s.cleanSheets >= 5 },
];
