// GET /api/img/<tmdb path>   e.g. /api/img/w780/abc123.jpg
// Serves TMDB images from our own origin. Drawing a cross-origin image onto a
// canvas taints it and blocks toBlob(), which is exactly what the share card
// needs — routing through here keeps everything same-origin.

const ALLOWED_SIZES = new Set(['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original']);

export async function onRequestGet({ params }) {
  const parts = Array.isArray(params.path) ? params.path : [params.path];

  if (parts.length < 2) {
    return new Response('Bad path', { status: 400 });
  }

  const size = parts[0];
  if (!ALLOWED_SIZES.has(size)) {
    return new Response('Bad size', { status: 400 });
  }

  const file = parts.slice(1).join('/');
  if (!/^[A-Za-z0-9._-]+$/.test(file)) {
    return new Response('Bad file', { status: 400 });
  }

  const upstream = `https://image.tmdb.org/t/p/${size}/${file}`;
  const res = await fetch(upstream, { cf: { cacheTtl: 86400, cacheEverything: true } });

  if (!res.ok) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', res.headers.get('content-type') || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(res.body, { headers });
}
