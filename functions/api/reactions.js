// POST /api/reactions
// Toggles a reaction: inserts it if it doesn't exist yet, removes it if it does.
// This is what was missing — the frontend already called this endpoint,
// but the file never existed in functions/api, so every call 404'd silently.
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { user_id, target_type, target_id, emoji } = body;

  if (!user_id || !target_type || !target_id || !emoji) {
    return Response.json({ error: 'Fehlende Felder' }, { status: 400 });
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM reactions WHERE target_type=? AND target_id=? AND user_id=? AND emoji=?`
  ).bind(target_type, String(target_id), user_id, emoji).first();

  if (existing) {
    await env.DB.prepare(`DELETE FROM reactions WHERE id=?`).bind(existing.id).run();
    return Response.json({ ok: true, removed: true });
  }

  await env.DB.prepare(
    `INSERT INTO reactions (target_type, target_id, user_id, emoji) VALUES (?, ?, ?, ?)`
  ).bind(target_type, String(target_id), user_id, emoji).run();

  return Response.json({ ok: true, removed: false });
}
