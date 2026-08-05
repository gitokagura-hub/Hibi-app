import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// The default registerSW.js injected by vite-plugin-pwa swallows any
// registration error silently. Register explicitly here instead, and stash
// the result on window so Settings can surface the real failure reason
// (this was needed to debug a stuck "navigator.serviceWorker.ready" hang).
//
// This also fixes a recurring issue where new deploys silently failed to
// reach the phone: the old service worker kept serving its cached bundle
// forever because nothing ever told it a new version was available. Now we
// actively poll for updates and force a reload the moment a new worker
// takes over, so a fresh deploy always shows up within a few seconds of
// opening the app instead of requiring a manual cache wipe.
if ('serviceWorker' in navigator) {
  window.__swRegistration = null;
  window.__swRegistrationError = null;
  let reloaded = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(
      (reg) => {
        window.__swRegistration = reg;
        // Check for a newer worker every time the app is opened/foregrounded,
        // and again periodically while it stays open.
        reg.update();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update();
        });
        setInterval(() => reg.update(), 60 * 1000);

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // A new version is installed and waiting. Activate it immediately
              // rather than waiting for all tabs to close.
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      },
      (err) => { window.__swRegistrationError = err?.message || String(err); }
    );
  });
}

createRoot(document.getElementById('root')).render(<App />);
