// GET  /api/ratings?movie_tmdb_id=27205   -> all ratings for one movie (with user names)
// POST /api/ratings {user_id, movie, rating, note, scores} -> upsert a rating

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const movieId = url.searchParams.get('movie_tmdb_id');

  if (!movieId) {
    return Response.json({ error: 'movie_tmdb_id fehlt' }, { status: 400 });
  }

  const { results } = await env.DB.prepare(
    `SELECT r.id, r.rating, r.note, r.scores, r.watched_at, r.rewatch_count, r.last_rewatch,
            u.id as user_id, u.name, u.color
     FROM ratings r JOIN users u ON u.id = r.user_id
     WHERE r.movie_tmdb_id = ?
     ORDER BY r.watched_at DESC`
  ).bind(movieId).all();

  const ratings = results.map(r => ({
    ...r,
    scores: r.scores ? JSON.parse(r.scores) : null
  }));

  return Response.json({ ratings });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, movie, rating, note, scores } = body;

  if (!user_id || !movie || !movie.tmdb_id || typeof rating !== 'number') {
    return Response.json({ error: 'user_id, movie und rating sind erforderlich' }, { status: 400 });
  }
  if (rating < 0.5 || rating > 10) {
    return Response.json({ error: 'rating muss zwischen 0.5 und 10 liegen' }, { status: 400 });
  }

  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(user_id).first();
  if (!user) {
    return Response.json({ error: 'Unbekannter Nutzer, bitte neu eintragen' }, { status: 401 });
  }

  await env.DB.prepare(
    `INSERT INTO movies (tmdb_id, title, original_title, poster_path, backdrop_path, release_date, overview, genres, runtime, director)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tmdb_id) DO NOTHING`
  ).bind(
    movie.tmdb_id, movie.title, movie.original_title || null, movie.poster_path || null,
    movie.backdrop_path || null, movie.release_date || null, movie.overview || null,
    movie.genres || null, movie.runtime || null, movie.director || null
  ).run();

  const scoresJson = scores ? JSON.stringify(scores) : null;

  await env.DB.prepare(
    `INSERT INTO ratings (movie_tmdb_id, user_id, rating, note, scores, watched_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(movie_tmdb_id, user_id) DO UPDATE SET
       rating = excluded.rating,
       note = excluded.note,
       scores = excluded.scores,
       updated_at = datetime('now')`
    // rewatch_count bleibt bewusst unangetastet

  ).bind(movie.tmdb_id, user_id, rating, note || null, scoresJson).run();

  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const ratingId = url.searchParams.get('id');
  if (!ratingId) {
    return Response.json({ error: 'id fehlt' }, { status: 400 });
  }
  await env.DB.prepare('DELETE FROM ratings WHERE id = ?').bind(ratingId).run();
  return Response.json({ ok: true });
}
