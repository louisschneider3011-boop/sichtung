// GET /api/tmdb/:id
// Full detail incl. genres, runtime, director, and a YouTube trailer key —
// used once, when a movie is first opened, to cache it into D1 and show a trailer.
export async function onRequestGet({ params, env }) {
  const id = params.id;

  if (!env.TMDB_API_KEY) {
    return Response.json({ error: 'TMDB_API_KEY fehlt in den Cloudflare Pages Environment Variables' }, { status: 500 });
  }

  const tmdbUrl = new URL(`https://api.themoviedb.org/3/movie/${id}`);
  tmdbUrl.searchParams.set('language', 'de-DE');
  tmdbUrl.searchParams.set('append_to_response', 'credits,videos');

  const res = await fetch(tmdbUrl, {
    headers: { Authorization: `Bearer ${env.TMDB_API_KEY}` }
  });

  if (!res.ok) {
    return Response.json({ error: 'Film nicht gefunden' }, { status: 404 });
  }

  const m = await res.json();
  const director = (m.credits?.crew || []).find(c => c.job === 'Director');

  let videos = m.videos?.results || [];
  let trailer = pickTrailer(videos);

  if (!trailer) {
    const fallbackUrl = new URL(`https://api.themoviedb.org/3/movie/${id}/videos`);
    fallbackUrl.searchParams.set('language', 'en-US');
    const fbRes = await fetch(fallbackUrl, { headers: { Authorization: `Bearer ${env.TMDB_API_KEY}` } });
    if (fbRes.ok) {
      const fb = await fbRes.json();
      trailer = pickTrailer(fb.results || []);
    }
  }

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
    director: director ? director.name : null,
    trailer_key: trailer ? trailer.key : null
  });
}

function pickTrailer(videos) {
  const yt = videos.filter(v => v.site === 'YouTube');
  return (
    yt.find(v => v.type === 'Trailer' && v.official) ||
    yt.find(v => v.type === 'Trailer') ||
    yt.find(v => v.type === 'Teaser') ||
    null
  );
}
