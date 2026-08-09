// GET /api/tmdb/:id
// Detail incl. genres, runtime, director, trailer, IMDb id (for critic scores)
// and German streaming availability (TMDB sources this from JustWatch).
export async function onRequestGet({ params, env }) {
  const id = params.id;

  if (!env.TMDB_API_KEY) {
    return Response.json({ error: 'TMDB_API_KEY fehlt in den Cloudflare Pages Environment Variables' }, { status: 500 });
  }

  const tmdbUrl = new URL(`https://api.themoviedb.org/3/movie/${id}`);
  tmdbUrl.searchParams.set('language', 'de-DE');
  tmdbUrl.searchParams.set('append_to_response', 'credits,videos,external_ids,watch/providers');

  const res = await fetch(tmdbUrl, {
    headers: { Authorization: `Bearer ${env.TMDB_API_KEY}` }
  });

  if (!res.ok) {
    return Response.json({ error: 'Film nicht gefunden' }, { status: 404 });
  }

  const m = await res.json();
  const director = (m.credits?.crew || []).find(c => c.job === 'Director');

  let trailer = pickTrailer(m.videos?.results || []);
  if (!trailer) {
    const fallbackUrl = new URL(`https://api.themoviedb.org/3/movie/${id}/videos`);
    fallbackUrl.searchParams.set('language', 'en-US');
    const fbRes = await fetch(fallbackUrl, { headers: { Authorization: `Bearer ${env.TMDB_API_KEY}` } });
    if (fbRes.ok) {
      const fb = await fbRes.json();
      trailer = pickTrailer(fb.results || []);
    }
  }

  // Germany only — the app is for a German-speaking group.
  const de = m['watch/providers']?.results?.DE || null;
  const providers = de ? {
    flatrate: mapProviders(de.flatrate),
    rent: mapProviders(de.rent),
    buy: mapProviders(de.buy),
    link: de.link || null
  } : null;

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
    trailer_key: trailer ? trailer.key : null,
    imdb_id: m.external_ids?.imdb_id || null,
    providers
  });
}

function mapProviders(list) {
  if (!Array.isArray(list)) return [];
  return list.map(p => ({ name: p.provider_name, logo_path: p.logo_path }));
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
