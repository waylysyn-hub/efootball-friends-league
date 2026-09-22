

export const state = {
  profile: null, user: null, page: 'dashboard', questionId: null, matchId: null,
  qaReady: false, statsReady: false, goalsReady: false, squadsReady: false, eveningsReady: false, signingIn: false,
  selectedProfile: null, selectedAchievements: null,
  db: { accounts: {}, matches: [], seasons: [], questions: [], answers: [], matchStats: [], goalEvents: [], squads: [], evenings: [], standings: [], achievements: [] },
};

export const sb = window.EFLClient?.get() || null;

export const NICKNAMES = {
  'Wael':        { nick: "زلاتان",     icon: '🦁' },
  'Mustafa':     { nick: "رونالدينيو", icon: '🪄' },
  'Abdul Rahim': { nick: "أبو الوفا", icon: '🤝' },
  'Mohammad':    { nick: "ديل بييرو",  icon: '🎯' },
  'Omar':        { nick: "دروغبا",     icon: '🐘' },
  'Abdul Qader': { nick: "نيستا",      icon: '🛡️' },
};

export const ACHIEVEMENT_DEFS = [
  { id: 'first_win',   icon: '🥇', name: "الفوز الأول",         desc: "فُز بمباراتك الأولى",         check: (s) => s.wins >= 1 },
  { id: 'wins10',      icon: '🏆', name: "10 انتصارات",           desc: "فُز بعشر مباريات",                check: (s) => s.wins >= 10 },
  { id: 'goals50',     icon: '⚽', name: "50 هدفًا",          desc: "سجّل 50 هدفًا",                check: (s) => s.goalsFor >= 50 },
  { id: 'goals100',    icon: '💯', name: "100 هدف",         desc: "سجّل 100 هدف",               check: (s) => s.goalsFor >= 100 },
  { id: 'streak5',     icon: '🔥', name: "5 انتصارات متتالية",      desc: "فُز بخمس مباريات متتالية",        check: (s) => s.bestStreak >= 5 },
  { id: 'champion',    icon: '👑', name: "البطل",          desc: "تصدّر أحد المواسم",                  check: (s) => s.seasonWins >= 1 },
  { id: 'played20',    icon: '🎮', name: "20 مباراة",        desc: "العب 20 مباراة",               check: (s) => s.played >= 20 },
  { id: 'clean5',      icon: '🧱', name: "5 مباريات بشباك نظيفة",    desc: "حافظ على نظافة شباكك في خمس مباريات",           check: (s) => s.cleanSheets >= 5 },
];
