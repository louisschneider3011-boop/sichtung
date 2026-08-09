// GET /api/tmdb/search?q=interstellar
// Proxies TMDB search so the API key never reaches the client.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q');
  const page = url.searchParams.get('page') || '1';

  if (!q || q.trim().length === 0) {
    return Response.json({ results: [] });
  }

  if (!env.TMDB_API_KEY) {
    return Response.json({ error: 'TMDB_API_KEY fehlt in den Cloudflare Pages Environment Variables' }, { status: 500 });
  }

  const tmdbUrl = new URL('https://api.themoviedb.org/3/search/movie');
  tmdbUrl.searchParams.set('query', q);
  tmdbUrl.searchParams.set('page', page);
  tmdbUrl.searchParams.set('language', 'de-DE');
  tmdbUrl.searchParams.set('include_adult', 'false');

  const res = await fetch(tmdbUrl, {
    headers: { Authorization: `Bearer ${env.TMDB_API_KEY}` }
  });

  if (!res.ok) {
    return Response.json({ error: 'TMDB Anfrage fehlgeschlagen' }, { status: 502 });
  }

  const data = await res.json();

  const results = (data.results || []).map(m => ({
    tmdb_id: m.id,
    title: m.title,
    original_title: m.original_title,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    release_date: m.release_date,
    overview: m.overview
  }));

  return Response.json({ results, page: data.page, total_pages: data.total_pages });
}
