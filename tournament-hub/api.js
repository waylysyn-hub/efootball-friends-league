/**
 * Tournament Hub — Data layer
 *
 * غيّر API_URL ليشير لـ endpoint قاعدة البيانات تبعك.
 * الـ response لازم يكون بهالشكل:
 *
 * {
 *   tournament: { name, season_name, type, format, total_matchdays, current_matchday, points_win, points_draw, points_loss },
 *   teams: [{ id, name, abbreviation, color_class }],
 *   fixtures: [{ id, matchday, home_team_id, away_team_id, home_score, away_score, status, scheduled_at, played_at }],
 *   scorers: [{ fixture_id, user_id, team_id, player_name, goals }]
 * }
 */

const API_URL = '/api/tournament-hub';

async function loadTournamentData() {
  try {
    const res = await fetch(API_URL, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.warn('[Tournament Hub] API fetch failed:', err.message);
    return { tournament: null, teams: [], fixtures: [], scorers: [] };
  }
}
