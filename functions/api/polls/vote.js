// POST   /api/polls/vote -> toggle your vote on one movie. Tapping a movie
//                           you've already voted for removes that vote;
//                           otherwise it's added, unless you've already used
//                           up the poll's votes_per_person allowance.
// DELETE /api/polls/vote -> remove ALL of your votes in this poll at once
//                           (not currently wired to any button, kept for
//                           a possible "reset my votes" action later).

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, poll_id, poll_movie_id } = body;

  if (!user_id || !poll_id || !poll_movie_id) {
    return Response.json({ error: 'Fehlende Felder' }, { status: 400 });
  }

  const poll = await env.DB.prepare(
    'SELECT status, votes_per_person FROM polls WHERE id = ?'
  ).bind(poll_id).first();
  if (!poll || poll.status !== 'open') {
    return Response.json({ error: 'Diese Abstimmung ist nicht mehr offen' }, { status: 409 });
  }

  const existing = await env.DB.prepare(
    'SELECT id FROM poll_votes WHERE poll_id = ? AND movie_id = ? AND user_id = ?'
  ).bind(poll_id, poll_movie_id, user_id).first();

  if (existing) {
    await env.DB.prepare('DELETE FROM poll_votes WHERE id = ?').bind(existing.id).run();
    return Response.json({ ok: true, voted: false });
  }

  const cap = poll.votes_per_person || 1;
  const { count } = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM poll_votes WHERE poll_id = ? AND user_id = ?'
  ).bind(poll_id, user_id).first();

  if (count >= cap) {
    return Response.json({
      error: `Du hast schon alle ${cap} Stimme${cap === 1 ? '' : 'n'} vergeben`
    }, { status: 409 });
  }

  await env.DB.prepare(
    'INSERT INTO poll_votes (poll_id, movie_id, user_id) VALUES (?, ?, ?)'
  ).bind(poll_id, poll_movie_id, user_id).run();

  return Response.json({ ok: true, voted: true });
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
