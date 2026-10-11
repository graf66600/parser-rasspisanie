// ==========================================================================
// PWA CACHE AND NETWORK HELPERS
// ==========================================================================

export const PWA_VERSION = 'v31';

export const isStaticHost = typeof window !== 'undefined' && (
  window.location.hostname.includes('github.io') ||
  window.location.protocol === 'file:'
);

export async function safeFetchJson(url, timeoutMs = 4000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      cache: 'no-cache',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res?.ok) return await res.json();
  } catch (e) {}
  return null;
}

export async function clearPwaCacheAndReload() {
  try {
    localStorage.removeItem('pwa_custom_schedule');
    localStorage.removeItem('pwa_custom_curriculum');
    localStorage.removeItem('pwa_custom_students');
    localStorage.removeItem('pwa_version');

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.unregister();
      }
    }
  } catch (e) {
    console.warn('Ошибка при очистке кэша PWA:', e);
  }

  const cleanUrl = window.location.origin + window.location.pathname + '?reload=' + Date.now();
  window.location.replace(cleanUrl);
}
