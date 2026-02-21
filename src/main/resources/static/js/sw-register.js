// Service worker registration.
// Dev-friendly: by default, we DO NOT register on localhost to avoid caching headaches.
// To enable on localhost, run in the console:
//   localStorage.setItem('enableSW', '1'); location.reload();

(function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  const host = location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const enableOnLocal = localStorage.getItem('enableSW') === '1';

  if (isLocal && !enableOnLocal) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      // Optional: auto-refresh once when a new SW takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });

      // Trigger update check
      reg.update().catch(() => {});
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  });
})();
