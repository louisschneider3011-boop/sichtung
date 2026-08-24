// GET  /api/recommendations?user_id=...  -> films other people sent me,
//                                           plus the ones I sent out.
// POST /api/recommendations              -> recommend a film to someone.
// PUT  /api/recommendations              -> mark mine as seen.
//
// Film metadata is snapshotted the same way the personal lists do it, so a
// recommendation works for films nobody has rated yet.

export async function onRequestGet({ request, env }) {
  const userId = new URL(request.url).searchParams.get('user_id');
  if (!userId) {
    return Response.json({ error: 'user_id erforderlich' }, { status: 400 });
  }

  const { results: incoming } = await env.DB.prepare(
    `SELECT r.id, r.movie_tmdb_id, r.title, r.poster_path, r.release_date,
            r.message, r.created_at, r.seen_at,
            u.id AS from_user_id, u.name AS from_name, u.color AS from_color
     FROM recommendations r JOIN users u ON u.id = r.from_user_id
     WHERE r.to_user_id = ? ORDER BY r.created_at DESC`
  ).bind(userId).all();

  const { results: outgoing } = await env.DB.prepare(
    `SELECT r.id, r.movie_tmdb_id, r.title, r.poster_path, r.created_at, r.seen_at,
            u.id AS to_user_id, u.name AS to_name, u.color AS to_color
     FROM recommendations r JOIN users u ON u.id = r.to_user_id
     WHERE r.from_user_id = ? ORDER BY r.created_at DESC`
  ).bind(userId).all();

  return Response.json({ incoming, outgoing });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { from_user_id, to_user_id, movie, message } = body;

  if (!from_user_id || !to_user_id || !movie || !movie.tmdb_id) {
    return Response.json({ error: 'Fehlende Felder' }, { status: 400 });
  }
  if (from_user_id === to_user_id) {
    return Response.json({ error: 'Geht nicht an dich selbst' }, { status: 400 });
  }

  await env.DB.prepare(
    `INSERT INTO recommendations
       (from_user_id, to_user_id, movie_tmdb_id, title, poster_path, release_date, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(from_user_id, to_user_id, movie_tmdb_id) DO UPDATE SET
       message = excluded.message,
       created_at = datetime('now'),
       seen_at = NULL`
  ).bind(
    from_user_id, to_user_id, movie.tmdb_id,
    movie.title || null, movie.poster_path || null, movie.release_date || null,
    (message || '').trim() || null
  ).run();

  return Response.json({ ok: true });
}

export async function onRequestPut({ request, env }) {
  const body = await request.json().catch(() => ({}));
  if (!body.user_id) {
    return Response.json({ error: 'user_id erforderlich' }, { status: 400 });
  }
  await env.DB.prepare(
    `UPDATE recommendations SET seen_at = datetime('now')
     WHERE to_user_id = ? AND seen_at IS NULL`
  ).bind(body.user_id).run();
  return Response.json({ ok: true });
}
