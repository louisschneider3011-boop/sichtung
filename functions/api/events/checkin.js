export async function onRequestPost({ request, env }) {
  const { token, userId } = await request.json();

  const event = await env.DB.prepare(
    `SELECT id FROM kino_events WHERE token = ?`
  ).bind(token).first();

  if (!event) {
    return Response.json({ error: "Event nicht gefunden" }, { status: 404 });
  }

  await env.DB.prepare(
    `INSERT OR IGNORE INTO event_checkins (id, event_id, user_id) VALUES (?, ?, ?)`
  ).bind(crypto.randomUUID(), event.id, userId).run();

  const { results } = await env.DB.prepare(
    `SELECT u.username FROM event_checkins ec JOIN users u ON u.id = ec.user_id WHERE ec.event_id = ?`
  ).bind(event.id).all();

  return Response.json({ success: true, checkedIn: results });
}
