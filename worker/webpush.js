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

async function importVapidPrivateKey(privateKeyB64Url) {
  const raw = base64UrlDecode(privateKeyB64Url);
  // Raw VAPID private keys are the 32-byte P-256 scalar (d). Build a PKCS8
  // wrapper around it so it can be imported as an ECDSA signing key.
  const pkcs8Prefix = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
    0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02,
    0x01, 0x01, 0x04, 0x20,
  ]);
  const suffix = new Uint8Array([0xa1, 0x44, 0x03, 0x42, 0x00]);
  const pkcs8 = new Uint8Array(pkcs8Prefix.length + raw.length + suffix.length);
  pkcs8.set(pkcs8Prefix, 0);
  pkcs8.set(raw, pkcs8Prefix.length);
  // The public key point isn't strictly required for signing, but WebCrypto's
  // PKCS8 parser for EC keys expects a well-formed structure; omit gracefully
  // isn't reliable across runtimes, so this minimal prefix/suffix works for
  // V8 (Workers) which only needs the private scalar to sign.
  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8.buffer,
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

  const key = await importVapidPrivateKey(privateKeyB64Url);
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
