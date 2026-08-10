// POST   /api/ratings/rewatch { user_id, movie_tmdb_id }  -> +1 rewatch
// DELETE /api/ratings/rewatch?user_id=..&movie_tmdb_id=..  -> -1 (undo a misclick)
// Only works on a film the person has already rated — a rewatch without a
// first viewing makes no sense and would create an orphan row.

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, movie_tmdb_id } = body;

  if (!user_id || !movie_tmdb_id) {
    return Response.json({ error: 'user_id und movie_tmdb_id erforderlich' }, { status: 400 });
  }

  const row = await env.DB.prepare(
    'SELECT id, rewatch_count FROM ratings WHERE user_id = ? AND movie_tmdb_id = ?'
  ).bind(user_id, movie_tmdb_id).first();

  if (!row) {
    return Response.json({ error: 'Bewerte den Film zuerst' }, { status: 404 });
  }

  const next = (row.rewatch_count || 0) + 1;

  await env.DB.prepare(
    "UPDATE ratings SET rewatch_count = ?, last_rewatch = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).bind(next, row.id).run();

  return Response.json({ ok: true, rewatch_count: next });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const user_id = url.searchParams.get('user_id');
  const movie_tmdb_id = url.searchParams.get('movie_tmdb_id');

  if (!user_id || !movie_tmdb_id) {
    return Response.json({ error: 'user_id und movie_tmdb_id erforderlich' }, { status: 400 });
  }

  const row = await env.DB.prepare(
    'SELECT id, rewatch_count FROM ratings WHERE user_id = ? AND movie_tmdb_id = ?'
  ).bind(user_id, movie_tmdb_id).first();

  if (!row) return Response.json({ error: 'Nicht gefunden' }, { status: 404 });

  const next = Math.max(0, (row.rewatch_count || 0) - 1);
  await env.DB.prepare('UPDATE ratings SET rewatch_count = ? WHERE id = ?').bind(next, row.id).run();

  return Response.json({ ok: true, rewatch_count: next });
}
