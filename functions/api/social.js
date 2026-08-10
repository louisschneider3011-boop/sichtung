// GET /api/social
// Everything the frontend's loadSocial() needs in one call: all reactions
// and comments, joined with the user's name/color so the UI never has to
// look users up separately.
export async function onRequestGet({ env }) {
  const { results: reactions } = await env.DB.prepare(
    `SELECT r.id, r.target_type, r.target_id, r.user_id, r.emoji, r.created_at, u.name, u.color
     FROM reactions r JOIN users u ON u.id = r.user_id`
  ).all();

  const { results: comments } = await env.DB.prepare(
    `SELECT c.id, c.target_type, c.target_id, c.user_id, c.text, c.created_at, u.name, u.color
     FROM comments c JOIN users u ON u.id = c.user_id
     ORDER BY c.created_at ASC`
  ).all();

  return Response.json({ reactions, comments });
}
