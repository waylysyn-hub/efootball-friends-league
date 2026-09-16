/**
 * Tournament Hub — loads real data from Supabase (Friends League).
 */

const PLAYER_META = {
  Wael: { abbreviation: 'WAE', color_class: 'p-wael' },
  Omar: { abbreviation: 'OMA', color_class: 'p-omar' },
  'Abdul Rahim': { abbreviation: 'ARH', color_class: 'p-arh' },
  Mohammad: { abbreviation: 'MOH', color_class: 'p-moh' },
  Mustafa: { abbreviation: 'MUS', color_class: 'p-mus' },
  'Abdul Qader': { abbreviation: 'AQA', color_class: 'p-aqa' },
};

const EMPTY = {
  tournament: null,
  teams: [],
  fixtures: [],
  scorers: [],
  seasons: [],
  activeSeasonId: null,
  standingsRows: [],
};

function getClient() { return window.EFLClient?.get() || null; }

function teamMeta(name) {
  const m = PLAYER_META[name];
  return {
    abbreviation:
      m?.abbreviation ||
      name
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 3)
        .toUpperCase(),
    color_class: m?.color_class || '',
  };
}

function buildTeams(playerNames) {
  return playerNames.map((name, i) => ({
    id: i + 1,
    name,
    ...teamMeta(name),
  }));
}

/**
 * @param {string|null} seasonId — specific season uuid, or null for active season
 */
export async function loadTournamentData(seasonId = null) {
  const sb = getClient();
  if (!sb) {
    throw new Error('Connection unavailable');
  }

  try {
    const [seasonsRes, playersRes, matchesRes, goalEventsRes, matchStatsRes, standingsRes] =
      await Promise.all([
        sb.from('seasons').select('*').order('created', { ascending: true }),
        sb.from('players').select('name').order('name'),
        sb.from('matches').select('*'),
        sb.from('match_goal_events').select('*'),
        sb.from('match_stats').select('*'),
        sb.from('standings').select('*').order('rank', { ascending: true }),
      ]);

    if (seasonsRes.error) throw seasonsRes.error;
    if (playersRes.error) throw playersRes.error;
    if (matchesRes.error) throw matchesRes.error;

    const seasons = seasonsRes.data || [];
    const playerNames = (playersRes.data || []).map((p) => p.name);
    const allMatches = matchesRes.data || [];
    for (const result of [goalEventsRes, matchStatsRes, standingsRes]) {
      if (result.error && !['42P01', 'PGRST205'].includes(result.error.code)) throw result.error;
    }
    const goalEvents = goalEventsRes.error ? [] : goalEventsRes.data || [];
    const matchStats = matchStatsRes.error ? [] : matchStatsRes.data || [];
    const allStandings = standingsRes.error ? [] : standingsRes.data || [];

    const activeSeason =
      (seasonId && seasons.find((s) => s.id === seasonId)) ||
      seasons.find((s) => s.active) ||
      seasons[seasons.length - 1] ||
      null;

    const teams = buildTeams(playerNames);
    const nameToId = Object.fromEntries(teams.map((t) => [t.name, t.id]));

    const seasonMatches = activeSeason
      ? allMatches.filter((m) => m.season_id === activeSeason.id)
      : allMatches;

    const tournament = {
      name: activeSeason ? `${activeSeason.name} League` : 'Friends League',
      season_name: activeSeason?.name || 'All Time',
      season_id: activeSeason?.id || null,
      type: 'league',
      format: 'Round Robin',
      total_matches: seasonMatches.length,
      points_win: 3,
      points_draw: 1,
      points_loss: 0,
    };

    const fixtures = seasonMatches.map((m) => ({
      id: m.id,
      home_team_id: nameToId[m.player1],
      away_team_id: nameToId[m.player2],
      home_score: m.goals1,
      away_score: m.goals2,
      status: 'completed',
      played_at: m.date || m.created_at,
      scheduled_at: null,
    }));

    const seasonMatchIds = new Set(seasonMatches.map((m) => m.id));
    const scorers = [];

    if (goalEvents.some(event => seasonMatchIds.has(event.match_id))) {
      const map = Object.create(null);
      goalEvents.forEach((e) => {
        if (!seasonMatchIds.has(e.match_id)) return;
        const teamId = nameToId[e.owner];
        if (!teamId || !e.scorer) return;
        const key = `${e.scorer}::${teamId}`;
        if (!map[key]) map[key] = { player_name: e.scorer, team_id: teamId, goals: 0 };
        map[key].goals += 1;
      });
      Object.values(map).forEach((s) => scorers.push(s));
    } else if (matchStats.length) {
      const map = Object.create(null);
      matchStats.forEach((s) => {
        if (!seasonMatchIds.has(s.match_id)) return;
        const teamId = nameToId[s.player];
        const name = s.character_name || s.player;
        if (!teamId) return;
        const key = `${name}::${teamId}`;
        if (!map[key]) map[key] = { player_name: name, team_id: teamId, goals: 0 };
        map[key].goals += s.goals || 0;
      });
      Object.values(map).forEach((s) => scorers.push(s));
    }

    const standingsKey = activeSeason ? String(activeSeason.id) : 'all';
    const standingsRows = allStandings.filter((r) => r.season === standingsKey);

    return {
      tournament,
      teams,
      fixtures,
      scorers,
      seasons,
      activeSeasonId: activeSeason?.id || null,
      standingsRows,
    };
  } catch (err) {
    throw err;
  }
}
