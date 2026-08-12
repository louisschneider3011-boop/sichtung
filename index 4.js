// GET  /api/lists?user_id=...  -> this person's watchlist, Blu-ray shelf and
//                                 Blu-ray wishlist in one call.
// POST /api/lists              -> toggle a movie on one of those lists.
//
// Film metadata (title/poster/year) is snapshotted onto the row on purpose:
// a watchlist entry is usually a film nobody has rated yet, so it does not
// exist in the shared `movies` table and there would otherwise be nothing
// to render in the private area.

const LIST_TYPES = ['watchlist', 'bluray_owned', 'bluray_wishlist'];

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');

  if (!userId) {
    return Response.json({ error: 'user_id erforderlich' }, { status: 400 });
  }

  const { results } = await env.DB.prepare(
    `SELECT movie_tmdb_id, list_type, title, poster_path, release_date, added_at
     FROM user_lists WHERE user_id = ? ORDER BY added_at DESC`
  ).bind(userId).all();

  const lists = { watchlist: [], bluray_owned: [], bluray_wishlist: [] };
  for (const row of results) {
    if (lists[row.list_type]) lists[row.list_type].push(row);
  }

  return Response.json({ lists });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, list_type, movie } = body;

  if (!user_id || !list_type || !movie || !movie.tmdb_id) {
    return Response.json({ error: 'Fehlende Felder' }, { status: 400 });
  }
  if (!LIST_TYPES.includes(list_type)) {
    return Response.json({ error: 'Unbekannte Liste' }, { status: 400 });
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM user_lists WHERE user_id = ? AND movie_tmdb_id = ? AND list_type = ?`
  ).bind(user_id, movie.tmdb_id, list_type).first();

  if (existing) {
    await env.DB.prepare('DELETE FROM user_lists WHERE id = ?').bind(existing.id).run();
    return Response.json({ ok: true, added: false });
  }

  await env.DB.prepare(
    `INSERT INTO user_lists (user_id, movie_tmdb_id, list_type, title, poster_path, release_date)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    user_id,
    movie.tmdb_id,
    list_type,
    movie.title || null,
    movie.poster_path || null,
    movie.release_date || null
  ).run();

  return Response.json({ ok: true, added: true });
}
