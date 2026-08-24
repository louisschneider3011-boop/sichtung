// GET    /api/push/subscribe -> the VAPID public key the client needs
// POST   /api/push/subscribe -> store a subscription
// DELETE /api/push/subscribe -> remove one (user turned notifications off)

export async function onRequestGet({ env }) {
  return Response.json({ publicKey: env.VAPID_PUBLIC_KEY || null });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, subscription } = body;

  if (!user_id || !subscription || !subscription.endpoint) {
    return Response.json({ error: 'Fehlende Felder' }, { status: 400 });
  }

  const { endpoint, keys } = subscription;
  if (!keys || !keys.p256dh || !keys.auth) {
    return Response.json({ error: 'Ungueltige Subscription' }, { status: 400 });
  }

  // One row per endpoint. Re-subscribing on the same device updates the
  // owner instead of piling up duplicates.
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh  = excluded.p256dh,
       auth    = excluded.auth`
  ).bind(user_id, endpoint, keys.p256dh, keys.auth).run();

  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const body = await request.json().catch(() => ({}));
  if (!body.endpoint) {
    return Response.json({ error: 'endpoint erforderlich' }, { status: 400 });
  }
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
    .bind(body.endpoint).run();
  return Response.json({ ok: true });
}
