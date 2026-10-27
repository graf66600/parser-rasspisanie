// ==========================================================================
// PWA CACHE AND NETWORK HELPERS
// ==========================================================================

export const PWA_VERSION = 'v44';

export const isStaticHost = typeof window !== 'undefined' && (
  window.location.hostname.includes('github.io') ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === '::1' ||
  window.location.protocol === 'file:'
);

export function compareGroupNames(a = '', b = '') {
  const parse = (str) => {
    const s = String(str || '').trim();
    const match = s.match(/^(\d+)(.*)$/);
    if (!match) return { num: 9999, suffix: s.toLowerCase() };
    return {
      num: parseInt(match[1], 10),
      suffix: match[2].trim().toLowerCase(),
    };
  };

  const pa = parse(a);
  const pb = parse(b);

  if (pa.num !== pb.num) return pa.num - pb.num;

  const specPriority = {
    'ф': 1, 'f': 1,
    'мс': 2, 'mc': 2,
    'фм': 3, 'fm': 3,
    'лм': 4, 'lm': 4,
  };

  const prioA = specPriority[pa.suffix] ?? 99;
  const prioB = specPriority[pb.suffix] ?? 99;

  if (prioA !== prioB) return prioA - prioB;
  return pa.suffix.localeCompare(pb.suffix, 'ru');
}

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
    localStorage.removeItem('pwa_kiosk_schedules_all');
    localStorage.removeItem('pwa_kiosk_groups_cache');
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
