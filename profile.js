// POST /api/users/profile
// Updates the editable profile fields. Only the keys actually present in the
// request body are written, so the client can send one field at a time without
// wiping the others.
const FIELDS = {
  favorite_genres: 'favorite_genres',
  favorite_actor: 'favorite_actor',
  color: 'color',
  next_movie_tmdb_id: 'next_movie_tmdb_id',
  next_movie_title: 'next_movie_title',
  next_movie_poster: 'next_movie_poster'
};

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id } = body;

  if (!user_id) {
    return Response.json({ error: 'user_id erforderlich' }, { status: 400 });
  }

  const sets = [];
  const values = [];

  for (const key of Object.keys(FIELDS)) {
    if (key in body) {
      sets.push(`${FIELDS[key]} = ?`);
      const v = body[key];
      values.push(v === '' || v === undefined ? null : v);
    }
  }

  if (!sets.length) {
    return Response.json({ error: 'Keine Felder zum Speichern' }, { status: 400 });
  }

  values.push(user_id);
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return Response.json({ ok: true });
}
