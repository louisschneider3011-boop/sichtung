// POST /api/users/favorite
// Sets (or clears, with tmdb_id: null) a user's favorite movie.
// Requires the favorite_movie_tmdb_id column added by migration-d.sql.
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { user_id, tmdb_id } = body;

  if (!user_id) {
    return Response.json({ error: 'user_id erforderlich' }, { status: 400 });
  }

  await env.DB.prepare(
    `UPDATE users SET favorite_movie_tmdb_id = ? WHERE id = ?`
  ).bind(tmdb_id || null, user_id).run();

  return Response.json({ ok: true });
}
