// POST   /api/comments { user_id, target_type, target_id, text }
// DELETE /api/comments?id=..&user_id=..   (only your own)

const TYPES = ['rating', 'comment'];
const MAX_LEN = 500;

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, target_type, target_id } = body;
  const text = (body.text || '').trim();

  if (!user_id || !target_type || !target_id || !text) {
    return Response.json({ error: 'Unvollstaendige Anfrage' }, { status: 400 });
  }
  if (!TYPES.includes(target_type)) {
    return Response.json({ error: 'Unbekannter Typ' }, { status: 400 });
  }
  if (text.length > MAX_LEN) {
    return Response.json({ error: 'Kommentar zu lang' }, { status: 400 });
  }

  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(user_id).first();
  if (!user) return Response.json({ error: 'Unbekannter Nutzer' }, { status: 401 });

  const res = await env.DB.prepare(
    'INSERT INTO comments (target_type, target_id, user_id, text) VALUES (?, ?, ?, ?)'
  ).bind(target_type, String(target_id), user_id, text).run();

  return Response.json({ ok: true, id: res.meta?.last_row_id || null });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const user_id = url.searchParams.get('user_id');

  if (!id || !user_id) {
    return Response.json({ error: 'id und user_id erforderlich' }, { status: 400 });
  }

  const row = await env.DB.prepare('SELECT user_id FROM comments WHERE id = ?').bind(id).first();
  if (!row) return Response.json({ error: 'Nicht gefunden' }, { status: 404 });
  if (row.user_id !== user_id) {
    return Response.json({ error: 'Nur eigene Kommentare' }, { status: 403 });
  }

  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  // Reactions on a deleted comment would be orphans.
  await env.DB.prepare("DELETE FROM reactions WHERE target_type = 'comment' AND target_id = ?")
    .bind(String(id)).run();

  return Response.json({ ok: true });
}
