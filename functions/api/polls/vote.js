// POST   /api/polls/vote -> cast or move your vote (one per person per poll).
// DELETE /api/polls/vote -> retract it.

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, poll_id, poll_movie_id } = body;

  if (!user_id || !poll_id || !poll_movie_id) {
    return Response.json({ error: 'Fehlende Felder' }, { status: 400 });
  }

  const poll = await env.DB.prepare('SELECT status FROM polls WHERE id = ?').bind(poll_id).first();
  if (!poll || poll.status !== 'open') {
    return Response.json({ error: 'Diese Abstimmung ist nicht mehr offen' }, { status: 409 });
  }

  await env.DB.prepare(
    `INSERT INTO poll_votes (poll_id, movie_id, user_id) VALUES (?, ?, ?)
     ON CONFLICT(poll_id, user_id) DO UPDATE SET movie_id = excluded.movie_id, voted_at = datetime('now')`
  ).bind(poll_id, poll_movie_id, user_id).run();

  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, poll_id } = body;

  if (!user_id || !poll_id) {
    return Response.json({ error: 'Fehlende Felder' }, { status: 400 });
  }

  await env.DB.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?')
    .bind(poll_id, user_id).run();

  return Response.json({ ok: true });
}
