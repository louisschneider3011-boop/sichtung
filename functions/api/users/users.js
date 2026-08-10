// GET  /api/users        -> all crew members incl. avatars (loaded once at app start)
// POST /api/users {name} -> join / re-login by name
const COLORS = ['#E8A33D', '#7A2436', '#4E7C8C', '#8C6A4E', '#5C7A3D', '#8C4E7A'];

function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, color, avatar, favorite_movie_tmdb_id FROM users ORDER BY created_at ASC'
  ).all();
  return Response.json({ users: results });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const name = (body.name || '').trim();

  if (!name || name.length > 40) {
    return Response.json({ error: 'Bitte einen gueltigen Namen angeben' }, { status: 400 });
  }

  const existing = await env.DB.prepare('SELECT id, name, color, avatar, favorite_movie_tmdb_id FROM users WHERE name = ?')
    .bind(name)
    .first();

  if (existing) {
    return Response.json({ user: existing });
  }

  const id = crypto.randomUUID();
  const color = colorFor(name);

  await env.DB.prepare('INSERT INTO users (id, name, color) VALUES (?, ?, ?)')
    .bind(id, name, color)
    .run();

  return Response.json({ user: { id, name, color, avatar: null, favorite_movie_tmdb_id: null } });
}
