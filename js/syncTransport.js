// Bound network attempts and reject HTTP errors, not only disconnected sockets.
export async function checkedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`Синхронизация не подтверждена: HTTP ${response.status}`);
      error.status = response.status;
      // No fallback that silently removes subgroup from a rejected journal row.
      if (response.status === 400) error.message += ' — проверьте формат данных и миграции БД (включая subgroup)';
      throw error;
    }
    return response;
  } finally { clearTimeout(timer); }
}
