// Web Push subscription helpers for task reminder notifications.
// The VAPID public key must match the private key configured on the Worker.

export const VAPID_PUBLIC_KEY = 'BDaMyYPE7uoaqN9DbMoyP36TkDy5PMlBi6eM8gxNCn4DMc-yZv8I9VHfnGo9S4mJL5aP18SNF3cwMnpkCWOT_4Y';
const API_TOKEN = 'Le9PsVoMj-aiupu8QeMZU0I9i7V9EVtw';

const SUBSCRIBED_FLAG = 'hibi-push-subscribed';

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function wasPushSubscribedBefore() {
  return localStorage.getItem(SUBSCRIBED_FLAG) === '1';
}

export function notificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT_${label}`)), ms)),
  ]);
}

// Requests notification permission, subscribes to Push, and sends the
// subscription to the Worker so it can send reminders later. Must be
// called from a direct user gesture (button click) — permission prompts
// are blocked otherwise on iOS Safari.
export async function subscribeToPush() {
  if (!isPushSupported()) throw new Error('PUSH_NOT_SUPPORTED');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('PERMISSION_DENIED');

  if (window.__swRegistrationError) {
    throw new Error('SW_REGISTRATION_FAILED_' + window.__swRegistrationError);
  }

  const registration = await withTimeout(navigator.serviceWorker.ready, 10000, 'SW_READY');
  let subscription = await withTimeout(registration.pushManager.getSubscription(), 10000, 'GET_SUBSCRIPTION');
  if (!subscription) {
    subscription = await withTimeout(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }),
      10000,
      'PUSH_SUBSCRIBE'
    );
  }

  const res = await withTimeout(
    fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_TOKEN}` },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    }),
    10000,
    'SAVE_TO_SERVER'
  );
  if (!res.ok) throw new Error('SUBSCRIBE_SAVE_FAILED_' + res.status);

  localStorage.setItem(SUBSCRIBED_FLAG, '1');
  return subscription;
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    try {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_TOKEN}` },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    } catch {}
    await subscription.unsubscribe();
  }
  localStorage.removeItem(SUBSCRIBED_FLAG);
}

// Forcibly removes every registered service worker and every Cache Storage
// entry for this origin, without touching Safari's site data for other
// sites. Used to recover from a service worker stuck failing to install
// (e.g. after fixing a bug in the precache manifest) — a normal reload
// isn't enough because the browser keeps retrying the same broken
// installation from its own cached copy of the old script.
export async function resetServiceWorker() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) await reg.unregister();
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    for (const key of keys) await caches.delete(key);
  }
  localStorage.removeItem(SUBSCRIBED_FLAG);
}
