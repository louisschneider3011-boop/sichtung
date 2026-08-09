// GET /api/tmdb/:id
// Full detail incl. genres, runtime, director (from credits) — used once, when a movie
// is first rated by anyone, to cache it into D1.
export async function onRequestGet({ params, env }) {
  const id = params.id;

  if (!env.TMDB_API_KEY) {
    return Response.json({ error: 'TMDB_API_KEY fehlt in den Cloudflare Pages Environment Variables' }, { status: 500 });
  }

  const tmdbUrl = new URL(`https://api.themoviedb.org/3/movie/${id}`);
  tmdbUrl.searchParams.set('language', 'de-DE');
  tmdbUrl.searchParams.set('append_to_response', 'credits');

  const res = await fetch(tmdbUrl, {
    headers: { Authorization: `Bearer ${env.TMDB_API_KEY}` }
  });

  if (!res.ok) {
    return Response.json({ error: 'Film nicht gefunden' }, { status: 404 });
  }

  const m = await res.json();
  const director = (m.credits?.crew || []).find(c => c.job === 'Director');

  return Response.json({
    tmdb_id: m.id,
    title: m.title,
    original_title: m.original_title,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    release_date: m.release_date,
    overview: m.overview,
    genres: (m.genres || []).map(g => g.name).join(', '),
    runtime: m.runtime,
    director: director ? director.name : null
  });
}
