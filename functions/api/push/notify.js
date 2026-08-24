// POST /api/push/notify
// Fans a notification out to the crew. The sender is always excluded — nobody
// needs a push about their own action.
//
// to_user_ids: array of recipients, or omitted for "everyone else".
import { sendToUsers } from './lib.js';

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { from_user_id, to_user_ids, title, message, url } = body;

  if (!from_user_id || !title) {
    return Response.json({ error: 'Fehlende Felder' }, { status: 400 });
  }
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return Response.json({ error: 'VAPID-Schluessel fehlen' }, { status: 500 });
  }

  let recipients;
  if (Array.isArray(to_user_ids) && to_user_ids.length) {
    recipients = to_user_ids.filter((id) => id !== from_user_id);
  } else {
    const { results } = await env.DB.prepare(
      'SELECT id FROM users WHERE id != ?'
    ).bind(from_user_id).all();
    recipients = results.map((r) => r.id);
  }

  const result = await sendToUsers(env, recipients, {
    title,
    body: message || '',
    url: url || '/'
  });

  return Response.json({ ok: true, ...result });
}
