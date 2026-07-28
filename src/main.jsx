import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// The default registerSW.js injected by vite-plugin-pwa swallows any
// registration error silently. Register explicitly here instead, and stash
// the result on window so Settings can surface the real failure reason
// (this was needed to debug a stuck "navigator.serviceWorker.ready" hang).
if ('serviceWorker' in navigator) {
  window.__swRegistration = null;
  window.__swRegistrationError = null;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(
      (reg) => { window.__swRegistration = reg; },
      (err) => { window.__swRegistrationError = err?.message || String(err); }
    );
  });
}

createRoot(document.getElementById('root')).render(<App />);
