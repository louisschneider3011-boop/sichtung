// GET /api/social -> every reaction and comment in one go.
// For a group this size the whole set is a few kilobytes, so one request
// beats fetching per-entry as the feed scrolls.

export async function onRequestGet({ env }) {
  const [reactions, comments] = await Promise.all([
    env.DB.prepare(
      `SELECT r.id, r.target_type, r.target_id, r.user_id, r.emoji, r.created_at,
              u.name, u.color
       FROM reactions r JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at ASC`
    ).all(),
    env.DB.prepare(
      `SELECT c.id, c.target_type, c.target_id, c.user_id, c.text, c.created_at,
              u.name, u.color
       FROM comments c JOIN users u ON u.id = c.user_id
       ORDER BY c.created_at ASC`
    ).all()
  ]);

  return Response.json({
    reactions: reactions.results || [],
    comments: comments.results || []
  });
}
