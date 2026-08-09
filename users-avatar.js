// POST /api/users/avatar {user_id, avatar}
// avatar is a data URL (image/jpeg), already resized to 256x256 in the browser.
// Kept small on purpose so it can live in D1 without needing R2 object storage.

const MAX_CHARS = 200000; // ~150 KB of image data — generous for a 256px JPEG

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, avatar } = body;

  if (!user_id) {
    return Response.json({ error: 'user_id fehlt' }, { status: 400 });
  }

  // Allow clearing the avatar by sending null.
  if (avatar !== null) {
    if (typeof avatar !== 'string' || !avatar.startsWith('data:image/')) {
      return Response.json({ error: 'Ungueltiges Bildformat' }, { status: 400 });
    }
    if (avatar.length > MAX_CHARS) {
      return Response.json({ error: 'Bild zu gross' }, { status: 413 });
    }
  }

  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(user_id).first();
  if (!user) {
    return Response.json({ error: 'Unbekannter Nutzer' }, { status: 401 });
  }

  await env.DB.prepare('UPDATE users SET avatar = ? WHERE id = ?')
    .bind(avatar, user_id)
    .run();

  return Response.json({ ok: true });
}
