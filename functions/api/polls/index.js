// GET  /api/polls?user_id=...   -> the open poll (with movies, vote counts,
//                                  voters, and whether this user already
//                                  voted) plus a short history of past ones.
// POST /api/polls               -> admin only: start a new poll.
// PUT  /api/polls                -> admin only: edit the open poll's settings.
//
// Admin is always re-checked server-side against users.is_admin — a client
// could claim anything, so the client-side gate in the UI is convenience
// only, never the actual boundary.

async function isAdmin(env, userId) {
  if (!userId) return false;
  const row = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(userId).first();
  return !!(row && row.is_admin);
}

export async function onRequestGet({ request, env }) {
  const userId = new URL(request.url).searchParams.get('user_id');

  const open = await env.DB.prepare(
    `SELECT * FROM polls WHERE status = 'open' ORDER BY created_at DESC LIMIT 1`
  ).first();

  let poll = null;
  if (open) {
    const { results: movies } = await env.DB.prepare(
      `SELECT * FROM poll_movies WHERE poll_id = ? ORDER BY added_at ASC`
    ).bind(open.id).all();

    const { results: votes } = await env.DB.prepare(
      `SELECT v.movie_id, v.user_id, u.name, u.color
       FROM poll_votes v JOIN users u ON u.id = v.user_id
       WHERE v.poll_id = ?`
    ).bind(open.id).all();

    const votesByMovie = {};
    votes.forEach((v) => { (votesByMovie[v.movie_id] ||= []).push(v); });

    poll = {
      ...open,
      movies: movies.map((m) => ({
        ...m,
        votes: votesByMovie[m.id] || [],
        vote_count: (votesByMovie[m.id] || []).length
      })),
      my_vote: userId ? (votes.find((v) => v.user_id === userId)?.movie_id ?? null) : null
    };
  }

  const { results: history } = await env.DB.prepare(
    `SELECT p.id, p.title, p.movie_night_at, p.closed_at, p.winner_tmdb_id,
            pm.title AS winner_title, pm.poster_path AS winner_poster
     FROM polls p
     LEFT JOIN poll_movies pm ON pm.poll_id = p.id AND pm.tmdb_id = p.winner_tmdb_id
     WHERE p.status = 'closed'
     ORDER BY p.closed_at DESC LIMIT 5`
  ).all();

  return Response.json({ poll, history });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, title, movie_night_at, allow_suggestions } = body;

  if (!(await isAdmin(env, user_id))) {
    return Response.json({ error: 'Nur der Admin kann eine Abstimmung starten' }, { status: 403 });
  }
  if (!title || !title.trim()) {
    return Response.json({ error: 'Titel fehlt' }, { status: 400 });
  }

  const existing = await env.DB.prepare(`SELECT id FROM polls WHERE status = 'open'`).first();
  if (existing) {
    return Response.json({ error: 'Es laeuft noch eine Abstimmung — die muss zuerst beendet werden' }, { status: 409 });
  }

  const res = await env.DB.prepare(
    `INSERT INTO polls (title, movie_night_at, allow_suggestions, created_by)
     VALUES (?, ?, ?, ?)`
  ).bind(title.trim(), movie_night_at || null, allow_suggestions ? 1 : 0, user_id).run();

  return Response.json({ ok: true, poll_id: res.meta.last_row_id });
}

export async function onRequestPut({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { user_id, poll_id, title, movie_night_at, allow_suggestions } = body;

  if (!(await isAdmin(env, user_id))) {
    return Response.json({ error: 'Nur der Admin kann das aendern' }, { status: 403 });
  }
  if (!poll_id) {
    return Response.json({ error: 'poll_id erforderlich' }, { status: 400 });
  }

  await env.DB.prepare(
    `UPDATE polls SET title = ?, movie_night_at = ?, allow_suggestions = ?
     WHERE id = ? AND status = 'open'`
  ).bind(title.trim(), movie_night_at || null, allow_suggestions ? 1 : 0, poll_id).run();

  return Response.json({ ok: true });
}
