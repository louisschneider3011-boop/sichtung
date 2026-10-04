// POST /api/polls/close -> admin only: ends the open poll and records the
// winner (the movie with the most votes; ties go to whichever was added
// first, same tie-break the ranking list elsewhere in the app uses).

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, poll_id } = body;

  const admin = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(user_id).first();
  if (!admin?.is_admin) {
    return Response.json({ error: 'Nur der Admin kann die Abstimmung beenden' }, { status: 403 });
  }
  if (!poll_id) {
    return Response.json({ error: 'poll_id erforderlich' }, { status: 400 });
  }

  const { results: movies } = await env.DB.prepare(
    `SELECT pm.id, pm.tmdb_id, pm.title, pm.poster_path, COUNT(v.id) AS votes
     FROM poll_movies pm LEFT JOIN poll_votes v ON v.movie_id = pm.id
     WHERE pm.poll_id = ?
     GROUP BY pm.id ORDER BY votes DESC, pm.added_at ASC`
  ).bind(poll_id).all();

  const winner = movies[0] || null;

  await env.DB.prepare(
    `UPDATE polls SET status = 'closed', closed_at = datetime('now'), winner_tmdb_id = ?
     WHERE id = ?`
  ).bind(winner ? winner.tmdb_id : null, poll_id).run();

  return Response.json({ ok: true, winner });
}
