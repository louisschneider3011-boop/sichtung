// GET /api/movies -> every movie the crew has rated, with average, count and each
// member's individual rating. This powers the "Wall" and the stats view.
export async function onRequestGet({ env }) {
  const { results: movies } = await env.DB.prepare(
    `SELECT tmdb_id, title, original_title, poster_path, backdrop_path, release_date,
            overview, genres, runtime, director, added_at
     FROM movies ORDER BY added_at DESC`
  ).all();

  const { results: ratings } = await env.DB.prepare(
    `SELECT r.movie_tmdb_id, r.rating, r.note, r.watched_at, u.id as user_id, u.name, u.color
     FROM ratings r JOIN users u ON u.id = r.user_id`
  ).all();

  const byMovie = {};
  for (const r of ratings) {
    (byMovie[r.movie_tmdb_id] ||= []).push(r);
  }

  const enriched = movies.map(m => {
    const rs = byMovie[m.tmdb_id] || [];
    const avg = rs.length ? rs.reduce((s, r) => s + r.rating, 0) / rs.length : null;
    return {
      ...m,
      average: avg !== null ? Math.round(avg * 10) / 10 : null,
      rating_count: rs.length,
      ratings: rs.map(r => ({
        user_id: r.user_id, name: r.name, color: r.color,
        rating: r.rating, note: r.note, watched_at: r.watched_at
      }))
    };
  });

  return Response.json({ movies: enriched });
}
