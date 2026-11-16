// Bound network attempts and reject HTTP errors, not only disconnected sockets.
export async function checkedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`Синхронизация не подтверждена: HTTP ${response.status}`);
      error.status = response.status;
      const detail = await response.json?.().catch(() => ({})) || {};
      error.code = detail.code;
      error.detail = detail.message || '';
      if (detail.code === 'PGRST204' && /subgroup/.test(error.detail)) {
        error.message += ' — облако ещё не поддерживает подгруппы. Требуется обновление базы; записи сохранены на телефоне.';
      } else if (response.status === 401 || response.status === 403) {
        error.message += ' — облако отклонило доступ. Войдите в аккаунт повторно.';
      }
      throw error;
    }
    return response;
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TypeError') {
      const networkError = new Error('Облако недоступно. Изменения сохранены на устройстве и ждут отправки.', { cause: error });
      networkError.code = 'SYNC_NETWORK';
      throw networkError;
    }
    throw error;
  } finally { clearTimeout(timer); }
}
