/**
 * Minimal Web Push sender for Cloudflare Workers.
 * Implements VAPID-authenticated push (RFC 8291/8292) using only Web Crypto
 * APIs available in the Workers runtime — no Node "crypto" module, so the
 * standard "web-push" npm package (which needs Node's crypto) can't be used
 * directly here.
 */

function base64UrlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Imports the VAPID private key for signing. Rather than hand-building a
// PKCS8 DER structure (error-prone — the previous attempt omitted the
// public key point, which the WebCrypto PKCS8 parser requires and rejected
// with "Invalid PKCS8 input"), build a JWK instead. JWK just needs the raw
// coordinates, which Web Crypto is happy to import directly and correctly.
async function importVapidPrivateKey(privateKeyB64Url, publicKeyB64Url) {
  const publicKeyBytes = base64UrlDecode(publicKeyB64Url);
  // An uncompressed P-256 public key point is 0x04 || x(32 bytes) || y(32 bytes).
  const x = publicKeyBytes.slice(1, 33);
  const y = publicKeyBytes.slice(33, 65);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: privateKeyB64Url,
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    ext: true,
  };
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

async function buildVapidJwt(audience, subject, publicKeyB64Url, privateKeyB64Url) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;

  const key = await importVapidPrivateKey(privateKeyB64Url, publicKeyB64Url);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(unsigned)
  );
  const sigB64 = base64UrlEncode(new Uint8Array(signature));
  return `${unsigned}.${sigB64}`;
}

/**
 * Sends a Web Push notification to a single subscription.
 * subscription: { endpoint, keys: { p256dh, auth } } (from PushSubscription.toJSON())
 * payload: plain object, will be JSON-stringified and encrypted per RFC 8291.
 */
export async function sendWebPush(subscription, payload, vapidPublicKey, vapidPrivateKey, vapidSubject) {
  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const jwt = await buildVapidJwt(audience, vapidSubject, vapidPublicKey, vapidPrivateKey);

  // aes128gcm content-encoding per RFC 8291, using the subscription's keys.
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await encryptPayload(plaintext, subscription.keys.p256dh, subscription.keys.auth, vapidPublicKey);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '60',
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    },
    body: encrypted,
  });
  return res;
}

// RFC 8291 message encryption (aes128gcm) for Web Push.
async function encryptPayload(plaintext, clientPublicKeyB64Url, authSecretB64Url, vapidPublicKeyB64Url) {
  const clientPublicKeyBytes = base64UrlDecode(clientPublicKeyB64Url);
  const authSecret = base64UrlDecode(authSecretB64Url);

  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyBytes.buffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );

  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const localPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeyPair.publicKey));

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPublicKey }, localKeyPair.privateKey, 256)
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const authInfo = new TextEncoder().encode('WebPush: info\0');
  const prkCombined = concatBytes(authInfo, clientPublicKeyBytes, localPublicKeyRaw);
  const prk = await hkdf(authSecret, sharedSecret, prkCombined, 32);

  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdf(salt, prk, cekInfo, 16);

  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await hkdf(salt, prk, nonceInfo, 12);

  // Padding: single 0x02 delimiter then no padding (minimal, valid per spec).
  const recordPad = new Uint8Array([2]);
  const paddedPlaintext = concatBytes(plaintext, recordPad);

  const gcmKey = await crypto.subtle.importKey('raw', cek.buffer, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, gcmKey, paddedPlaintext)
  );

  // aes128gcm header: salt(16) | rs(4, record size) | idlen(1) | keyid(local pub key, 65 bytes)
  const recordSize = 4096;
  const header = new Uint8Array(16 + 4 + 1 + localPublicKeyRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = localPublicKeyRaw.length;
  header.set(localPublicKeyRaw, 21);

  return concatBytes(header, ciphertext);
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm.buffer || ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}
