// POST   /api/polls/movies -> add a movie to the open poll (admin always
//                              allowed; anyone else only if the poll has
//                              suggestions switched on).
// DELETE /api/polls/movies -> admin only: remove a movie (and its votes).

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, poll_id, movie } = body;

  if (!user_id || !poll_id || !movie || !movie.tmdb_id) {
    return Response.json({ error: 'Fehlende Felder' }, { status: 400 });
  }

  const poll = await env.DB.prepare(
    `SELECT id, status, allow_suggestions FROM polls WHERE id = ?`
  ).bind(poll_id).first();

  if (!poll || poll.status !== 'open') {
    return Response.json({ error: 'Diese Abstimmung ist nicht mehr offen' }, { status: 409 });
  }

  const admin = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(user_id).first();
  if (!admin?.is_admin && !poll.allow_suggestions) {
    return Response.json({ error: 'Vorschlaege sind fuer diese Abstimmung deaktiviert' }, { status: 403 });
  }

  await env.DB.prepare(
    `INSERT INTO poll_movies (poll_id, tmdb_id, title, poster_path, release_date, genres, overview, trailer_key, added_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(poll_id, tmdb_id) DO NOTHING`
  ).bind(
    poll_id, movie.tmdb_id, movie.title || 'Unbekannt', movie.poster_path || null,
    movie.release_date || null, movie.genres || null, movie.overview || null,
    movie.trailer_key || null, user_id
  ).run();

  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, poll_movie_id } = body;

  const admin = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(user_id).first();
  if (!admin?.is_admin) {
    return Response.json({ error: 'Nur der Admin kann Filme entfernen' }, { status: 403 });
  }
  if (!poll_movie_id) {
    return Response.json({ error: 'poll_movie_id erforderlich' }, { status: 400 });
  }

  await env.DB.prepare('DELETE FROM poll_votes WHERE movie_id = ?').bind(poll_movie_id).run();
  await env.DB.prepare('DELETE FROM poll_movies WHERE id = ?').bind(poll_movie_id).run();

  return Response.json({ ok: true });
}
