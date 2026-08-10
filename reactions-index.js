// POST /api/reactions { user_id, target_type, target_id, emoji }
// Toggles: sending the same emoji twice removes it. Keeps the UI honest
// without needing a separate delete call from the client.

const ALLOWED = ['🔥', '😂', '💯', '👀', '😐', '💀'];
const TYPES = ['rating', 'comment'];

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, target_type, target_id, emoji } = body;

  if (!user_id || !target_type || !target_id || !emoji) {
    return Response.json({ error: 'Unvollstaendige Anfrage' }, { status: 400 });
  }
  if (!TYPES.includes(target_type)) {
    return Response.json({ error: 'Unbekannter Typ' }, { status: 400 });
  }
  if (!ALLOWED.includes(emoji)) {
    return Response.json({ error: 'Emoji nicht erlaubt' }, { status: 400 });
  }

  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(user_id).first();
  if (!user) return Response.json({ error: 'Unbekannter Nutzer' }, { status: 401 });

  const existing = await env.DB.prepare(
    'SELECT id FROM reactions WHERE target_type = ? AND target_id = ? AND user_id = ? AND emoji = ?'
  ).bind(target_type, String(target_id), user_id, emoji).first();

  if (existing) {
    await env.DB.prepare('DELETE FROM reactions WHERE id = ?').bind(existing.id).run();
    return Response.json({ ok: true, active: false });
  }

  await env.DB.prepare(
    'INSERT INTO reactions (target_type, target_id, user_id, emoji) VALUES (?, ?, ?, ?)'
  ).bind(target_type, String(target_id), user_id, emoji).run();

  return Response.json({ ok: true, active: true });
}
