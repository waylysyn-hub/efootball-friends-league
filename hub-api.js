/**
 * Tournament Hub — loads real data from Supabase (Friends League).
 */

const PLAYERS = ['Wael', 'Omar', 'Abdul Rahim', 'Mohammad', 'Mustafa', 'Abdul Qader'];

const PLAYER_META = {
  Wael: { abbreviation: 'WAE', color_class: 'p-wael' },
  Omar: { abbreviation: 'OMA', color_class: 'p-omar' },
  'Abdul Rahim': { abbreviation: 'ARH', color_class: 'p-arh' },
  Mohammad: { abbreviation: 'MOH', color_class: 'p-moh' },
  Mustafa: { abbreviation: 'MUS', color_class: 'p-mus' },
  'Abdul Qader': { abbreviation: 'AQA', color_class: 'p-aqa' },
};

const EMPTY = { tournament: null, teams: [], fixtures: [], scorers: [] };

function isConfigured() {
  return (
    typeof SUPABASE_CONFIG !== 'undefined' &&
    SUPABASE_CONFIG.url &&
    SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL' &&
    SUPABASE_CONFIG.anonKey &&
    SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY'
  );
}

function getClient() {
  if (!window.supabase || !isConfigured()) return null;
  return window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
}

async function loadTournamentData() {
  const sb = getClient();
  if (!sb) {
    console.warn('[Hub] Supabase not configured');
    return EMPTY;
  }

  try {
    const [seasonsRes, matchesRes, goalEventsRes, matchStatsRes] = await Promise.all([
      sb.from('seasons').select('*').order('created', { ascending: true }),
      sb.from('matches').select('*'),
      sb.from('match_goal_events').select('*'),
      sb.from('match_stats').select('*'),
    ]);

    if (seasonsRes.error) throw seasonsRes.error;
    if (matchesRes.error) throw matchesRes.error;

    const seasons = seasonsRes.data || [];
    const allMatches = matchesRes.data || [];
    const goalEvents = goalEventsRes.error ? [] : goalEventsRes.data || [];
    const matchStats = matchStatsRes.error ? [] : matchStatsRes.data || [];

    const activeSeason = seasons.find((s) => s.active) || seasons[seasons.length - 1];

    const teams = PLAYERS.map((name, i) => ({
      id: i + 1,
      name,
      abbreviation: PLAYER_META[name]?.abbreviation || name.slice(0, 3).toUpperCase(),
      color_class: PLAYER_META[name]?.color_class || '',
    }));

    const nameToId = Object.fromEntries(teams.map((t) => [t.name, t.id]));

    const tournament = {
      name: activeSeason ? `${activeSeason.name} League` : 'Friends League',
      season_name: activeSeason?.name || 'All Time',
      type: 'league',
      format: 'Round Robin',
      total_matchdays: 0,
      current_matchday: 0,
      points_win: 3,
      points_draw: 1,
      points_loss: 0,
    };

    const seasonMatches = activeSeason
      ? allMatches.filter((m) => m.season_id === activeSeason.id)
      : allMatches;

    tournament.total_matchdays = seasonMatches.length;
    tournament.current_matchday = seasonMatches.length;

    const fixtures = seasonMatches.map((m) => ({
      id: m.id,
      matchday: 1,
      home_team_id: nameToId[m.player1],
      away_team_id: nameToId[m.player2],
      home_score: m.goals1,
      away_score: m.goals2,
      status: 'completed',
      played_at: m.date || m.created_at,
      scheduled_at: null,
    }));

    const scorers = [];

    if (goalEvents.length) {
      const map = {};
      goalEvents.forEach((e) => {
        const teamId = nameToId[e.owner];
        if (!teamId || !e.scorer) return;
        const key = `${e.scorer}::${teamId}`;
        if (!map[key]) {
          map[key] = {
            player_name: e.scorer,
            team_id: teamId,
            goals: 0,
          };
        }
        map[key].goals += 1;
      });
      Object.values(map).forEach((s) => scorers.push(s));
    } else if (matchStats.length) {
      const map = {};
      matchStats.forEach((s) => {
        const teamId = nameToId[s.player];
        const name = s.character_name || s.player;
        if (!teamId) return;
        const key = `${name}::${teamId}`;
        if (!map[key]) {
          map[key] = { player_name: name, team_id: teamId, goals: 0 };
        }
        map[key].goals += s.goals || 0;
      });
      Object.values(map).forEach((s) => scorers.push(s));
    }

    return { tournament, teams, fixtures, scorers };
  } catch (err) {
    console.warn('[Hub] Supabase load failed:', err.message);
    return EMPTY;
  }
}
