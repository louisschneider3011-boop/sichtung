// Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) built on the Web Crypto API.
//
// This is NOT an endpoint — it's a helper imported by the other files in this
// folder. The usual `web-push` npm package can't be used here: it depends on
// Node's crypto/https modules, which don't exist in the Workers runtime, and
// this project deploys without a build step so npm packages aren't an option
// at all. Everything below therefore uses only primitives the runtime has.

const b64uToBytes = (s) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const bytesToB64u = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const concat = (...arrays) => {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
};

const utf8 = (s) => new TextEncoder().encode(s);

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

/* Builds the VAPID Authorization header for one push endpoint. */
async function vapidHeader(endpoint, publicKeyB64u, privateKeyB64u, subject) {
  const aud = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject
  };

  const signingInput = utf8(
    `${bytesToB64u(utf8(JSON.stringify(header)))}.${bytesToB64u(utf8(JSON.stringify(payload)))}`
  );

  // Rebuild the full JWK from the raw public point plus the private scalar.
  const pub = b64uToBytes(publicKeyB64u);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
    d: privateKeyB64u,
    ext: true
  };

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput);

  const jwt = `${new TextDecoder().decode(signingInput)}.${bytesToB64u(sig)}`;
  return `vapid t=${jwt}, k=${publicKeyB64u}`;
}

/* Encrypts the payload for one subscription (RFC 8291). */
async function encrypt(payload, p256dhB64u, authB64u) {
  const uaPublic = b64uToBytes(p256dhB64u);
  const authSecret = b64uToBytes(authB64u);

  // Ephemeral key pair for this one message.
  const asKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey(
    'raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256)
  );

  const ikm = await hkdf(
    authSecret,
    shared,
    concat(utf8('WebPush: info\0'), uaPublic, asPublic),
    32
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 is the final-record padding delimiter.
  const plaintext = concat(utf8(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext)
  );

  // Header: salt(16) | record size(4) | key id length(1) | key id(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);

  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/* Sends one notification. Returns the HTTP status so callers can prune
   subscriptions the push service has retired (404/410). */
export async function sendPush(subscription, payload, env) {
  const body = await encrypt(
    typeof payload === 'string' ? payload : JSON.stringify(payload),
    subscription.p256dh,
    subscription.auth
  );

  const auth = await vapidHeader(
    subscription.endpoint,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
    env.VAPID_SUBJECT || 'mailto:kontakt@edp-agency.de'
  );

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal'
    },
    body
  });

  return res.status;
}

/* Fans out to many subscriptions and deletes the dead ones. */
export async function sendToUsers(env, userIds, payload) {
  if (!userIds || !userIds.length) return { sent: 0 };

  const placeholders = userIds.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions
     WHERE user_id IN (${placeholders})`
  ).bind(...userIds).all();

  let sent = 0;
  const dead = [];

  for (const sub of results) {
    try {
      const status = await sendPush(sub, payload, env);
      if (status === 404 || status === 410) dead.push(sub.id);
      else if (status >= 200 && status < 300) sent++;
    } catch (e) {
      // A single bad endpoint must not stop the rest of the fan-out.
    }
  }

  if (dead.length) {
    await env.DB.prepare(
      `DELETE FROM push_subscriptions WHERE id IN (${dead.map(() => '?').join(',')})`
    ).bind(...dead).run();
  }

  return { sent };
}
