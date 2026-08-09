// GET /api/omdb/:imdbId -> critic scores from OMDb (IMDb, Rotten Tomatoes, Metascore)
export async function onRequestGet({ params, env }) {
  const imdbId = params.imdbId;

  if (!env.OMDB_API_KEY) {
    return Response.json({ error: 'OMDB_API_KEY fehlt' }, { status: 500 });
  }
  if (!imdbId || !imdbId.startsWith('tt')) {
    return Response.json({ error: 'ungueltige imdb id' }, { status: 400 });
  }

  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('i', imdbId);
  url.searchParams.set('apikey', env.OMDB_API_KEY);

  const res = await fetch(url);
  if (!res.ok) return Response.json({ error: 'OMDb Anfrage fehlgeschlagen' }, { status: 502 });

  const data = await res.json();
  if (data.Response === 'False') return Response.json({ scores: null });

  const find = (name) => (data.Ratings || []).find(r => r.Source === name)?.Value || null;

  return Response.json({
    scores: {
      imdb: data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null,
      rotten_tomatoes: find('Rotten Tomatoes'),
      metascore: data.Metascore && data.Metascore !== 'N/A' ? data.Metascore : null
    }
  });
}
