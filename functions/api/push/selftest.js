// GET /api/push/selftest
// TEMPORARY diagnostic endpoint — checks the VAPID keys stored as secrets
// actually round-trip (sign with the private key, verify with the public
// key) using the exact same code path notify.js uses to send. This isolates
// "our crypto/keys are broken" from "Apple didn't like this specific JWT",
// without needing a real device to receive a push.
// Delete this file once push delivery is confirmed working.

const b64uToBytes = (s) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export async function onRequestGet({ env }) {
  const pub = env.VAPID_PUBLIC_KEY;
  const priv = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;

  const report = {
    publicKeyPresent: !!pub,
    privateKeyPresent: !!priv,
    subjectPresent: !!subject,
    subjectValue: subject || null
  };

  if (!pub || !priv) {
    return Response.json({ ...report, error: 'Schluessel fehlen in env' }, { status: 200 });
  }

  try {
    const pubBytes = b64uToBytes(pub);
    report.publicKeyByteLength = pubBytes.length;      // must be exactly 65
    report.publicKeyFirstByte = pubBytes[0];            // must be exactly 4

    const privBytes = b64uToBytes(priv);
    report.privateKeyByteLength = privBytes.length;     // must be exactly 32

    if (pubBytes.length !== 65 || pubBytes[0] !== 4) {
      return Response.json({ ...report, error: 'Oeffentlicher Schluessel hat falsches Format' });
    }
    if (privBytes.length !== 32) {
      return Response.json({ ...report, error: 'Privater Schluessel hat falsche Laenge' });
    }

    const jwk = {
      kty: 'EC', crv: 'P-256',
      x: pub ? btoa(String.fromCharCode(...pubBytes.slice(1, 33))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'') : null,
      y: btoa(String.fromCharCode(...pubBytes.slice(33, 65))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),
      d: priv,
      ext: true
    };

    const signKey = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
    );
    const verifyKey = await crypto.subtle.importKey(
      'jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
    );

    const data = new TextEncoder().encode('selftest-payload');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signKey, data);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, sig, data);

    report.signVerifyRoundTrip = ok;
    return Response.json(report);
  } catch (e) {
    return Response.json({ ...report, error: String(e && e.message || e) });
  }
}
