// POST /api/tmdb/suggest { seeds: [tmdbId], exclude: [tmdbId], page }
// Builds a pool of films the person plausibly has seen but hasn't rated yet.
// Seeds are their own well-rated films — TMDB's recommendations for those are
// a far better signal than raw popularity. Falls back to top_rated for newcomers.

export async function onRequestPost({ request, env }) {
  if (!env.TMDB_API_KEY) {
    return Response.json({ error: 'TMDB_API_KEY fehlt' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const seeds = Array.isArray(body.seeds) ? body.seeds.filter(Number.isFinite) : [];
  const exclude = new Set(Array.isArray(body.exclude) ? body.exclude : []);
  const page = Math.max(1, Math.min(20, parseInt(body.page) || 1));

  const headers = { Authorization: `Bearer ${env.TMDB_API_KEY}` };
  const buckets = [];

  if (seeds.length) {
    // Rotate through the seeds by page so repeated loads don't hit the same ones.
    const shuffled = shuffle([...seeds]);
    const picks = [];
    for (let i = 0; i < 4 && i < shuffled.length; i++) {
      picks.push(shuffled[(i + page) % shuffled.length]);
    }
    const unique = [...new Set(picks)];

    const results = await Promise.all(unique.map(async id => {
      const url = new URL(`https://api.themoviedb.org/3/movie/${id}/recommendations`);
      url.searchParams.set('language', 'de-DE');
      url.searchParams.set('page', String(((page - 1) % 3) + 1));
      const r = await fetch(url, { headers });
      if (!r.ok) return [];
      const d = await r.json();
      return d.results || [];
    }));
    results.forEach(list => buckets.push(...list));
  }

  // Always mix in some broadly-known films so the feed never dries up.
  const topUrl = new URL('https://api.themoviedb.org/3/movie/top_rated');
  topUrl.searchParams.set('language', 'de-DE');
  topUrl.searchParams.set('page', String(page));
  const topRes = await fetch(topUrl, { headers });
  if (topRes.ok) {
    const d = await topRes.json();
    buckets.push(...(d.results || []));
  }

  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const out = [];

  for (const m of buckets) {
    if (!m || !m.id) continue;
    if (seen.has(m.id)) continue;
    if (exclude.has(m.id)) continue;
    // Skip unreleased films and very obscure entries — the point is
    // "you might have seen this", not "here is a random unknown title".
    if (!m.release_date || m.release_date > today) continue;
    if ((m.vote_count || 0) < 300) continue;
    if (!m.poster_path) continue;

    seen.add(m.id);
    out.push({
      tmdb_id: m.id,
      title: m.title,
      original_title: m.original_title,
      poster_path: m.poster_path,
      backdrop_path: m.backdrop_path,
      release_date: m.release_date,
      overview: m.overview,
      vote_average: m.vote_average
    });
  }

  return Response.json({ results: shuffle(out).slice(0, 20) });
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
