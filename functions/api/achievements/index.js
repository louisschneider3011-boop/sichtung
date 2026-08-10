// GET  /api/achievements  -> every unlocked achievement across the whole crew,
//                             joined with user info (feeds the activity stream
//                             and everyone's trophy-preview badges).
// POST /api/achievements  -> unlock one achievement for a user. Idempotent —
//                             calling it again for an already-unlocked one is a no-op.
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT ua.user_id, ua.achievement_id, ua.unlocked_at, u.name, u.color
     FROM user_achievements ua JOIN users u ON u.id = ua.user_id
     ORDER BY ua.unlocked_at DESC`
  ).all();

  return Response.json({ achievements: results });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { user_id, achievement_id } = body;

  if (!user_id || !achievement_id) {
    return Response.json({ error: 'user_id und achievement_id erforderlich' }, { status: 400 });
  }

  await env.DB.prepare(
    `INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)
     ON CONFLICT(user_id, achievement_id) DO NOTHING`
  ).bind(user_id, achievement_id).run();

  return Response.json({ ok: true });
}
