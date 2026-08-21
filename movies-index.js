// GET /api/movies -> every movie the crew has rated, with average, count, each
// member's rating, and per-dimension averages from the guided rating flow.
export async function onRequestGet({ env }) {
  const { results: movies } = await env.DB.prepare(
    `SELECT tmdb_id, title, original_title, poster_path, backdrop_path, release_date,
            overview, genres, runtime, director, added_at
     FROM movies ORDER BY added_at DESC`
  ).all();

  const { results: ratings } = await env.DB.prepare(
    `SELECT r.id as rating_id, r.movie_tmdb_id, r.rating, r.note, r.scores,
            r.watched_at, r.updated_at, r.rewatch_count,
            u.id as user_id, u.name, u.color
     FROM ratings r JOIN users u ON u.id = r.user_id`
  ).all();

  const byMovie = {};
  for (const r of ratings) {
    (byMovie[r.movie_tmdb_id] ||= []).push(r);
  }

  const DIMS = ['story', 'craft', 'impact', 'echo'];

  // --- Bayesian-gewichteter Score -------------------------------------
  // Ein Film mit nur 1 Bewertung soll nicht automatisch über Filmen mit
  // mehreren Bewertungen stehen. CONFIDENCE gibt an, wie viele "virtuelle"
  // Durchschnittsbewertungen jeder Film zusätzlich bekommt, bevor er
  // vollständig nach seinem eigenen Schnitt sortiert wird.
  // Bei 6 Crew-Mitgliedern ist m=3 (halbe Crew) ein guter Startwert.
  const CONFIDENCE = 3;
  // Ab wie vielen Bewertungen ein Film als "bestätigt" (Konsens) gilt.
  const MIN_CONFIRMED = 2;

  // Referenzwert C = Durchschnitt der Film-Durchschnitte (nicht aller
  // Einzelbewertungen), damit vielbewertete Filme den Referenzwert nicht
  // nach oben oder unten verzerren.
  const perMovieAverages = movies
    .map(m => byMovie[m.tmdb_id])
    .filter(rs => rs && rs.length)
    .map(rs => rs.reduce((s, r) => s + r.rating, 0) / rs.length);

  const globalAverage = perMovieAverages.length
    ? perMovieAverages.reduce((s, a) => s + a, 0) / perMovieAverages.length
    : 0;

  const enriched = movies.map(m => {
    const rs = byMovie[m.tmdb_id] || [];
    const avg = rs.length ? rs.reduce((s, r) => s + r.rating, 0) / rs.length : null;

    const weighted = rs.length
      ? (rs.length * avg + CONFIDENCE * globalAverage) / (rs.length + CONFIDENCE)
      : null;

    // Average each dimension across everyone who used the guided flow.
    const dimSums = {};
    const dimCounts = {};
    for (const r of rs) {
      if (!r.scores) continue;
      let parsed;
      try { parsed = JSON.parse(r.scores); } catch { continue; }
      for (const d of DIMS) {
        if (typeof parsed[d] === 'number') {
          dimSums[d] = (dimSums[d] || 0) + parsed[d];
          dimCounts[d] = (dimCounts[d] || 0) + 1;
        }
      }
    }
    const dimensions = {};
    for (const d of DIMS) {
      if (dimCounts[d]) {
        dimensions[d] = Math.round((dimSums[d] / dimCounts[d]) * 10) / 10;
      }
    }

    return {
      ...m,
      average: avg !== null ? Math.round(avg * 10) / 10 : null,
      weighted_average: weighted !== null ? Math.round(weighted * 100) / 100 : null,
      confirmed: rs.length >= MIN_CONFIRMED,
      rating_count: rs.length,
      dimensions: Object.keys(dimensions).length ? dimensions : null,
      ratings: rs.map(r => ({
        rating_id: r.rating_id,
        user_id: r.user_id, name: r.name, color: r.color,
        rating: r.rating, note: r.note,
        watched_at: r.watched_at, updated_at: r.updated_at,
        rewatch_count: r.rewatch_count || 0,
        scores: r.scores ? safeParse(r.scores) : null
      }))
    };
  });

  // Serverseitige Sortierung: bestätigte Filme (>= MIN_CONFIRMED Bewertungen)
  // zuerst, sortiert nach weighted_average. Unbestätigte danach, ebenfalls
  // nach weighted_average, damit die Reihenfolge innerhalb der Gruppe
  // trotzdem sinnvoll ist.
  enriched.sort((a, b) => {
    if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
    return (b.weighted_average ?? -1) - (a.weighted_average ?? -1);
  });

  return Response.json({ movies: enriched });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
