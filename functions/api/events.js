export async function onRequestPost({ request, env }) {
  const { title, movieId, eventDate, userId } = await request.json();
  const id = crypto.randomUUID();
  const token = crypto.randomUUID().slice(0, 8);

  await env.DB.prepare(
    `INSERT INTO kino_events (id, token, title, movie_id, event_date, created_by) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, token, title, movieId || null, eventDate || null, userId).run();

  return Response.json({ id, token });
}

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM kino_events ORDER BY created_at DESC LIMIT 20`
  ).all();

  return Response.json(results);
}
