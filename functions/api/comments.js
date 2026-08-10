// POST /api/comments
// Adds a comment on a rating, or a reply on another comment
// (target_type is 'rating' or 'comment' — the frontend already sends both).
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { user_id, target_type, target_id, text } = body;

  if (!user_id || !target_type || !target_id || !text || !text.trim()) {
    return Response.json({ error: 'Fehlende Felder' }, { status: 400 });
  }

  const res = await env.DB.prepare(
    `INSERT INTO comments (target_type, target_id, user_id, text) VALUES (?, ?, ?, ?)`
  ).bind(target_type, String(target_id), user_id, text.trim()).run();

  return Response.json({ ok: true, id: res.meta.last_row_id });
}
