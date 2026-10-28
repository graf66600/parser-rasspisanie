// ==========================================================================
// IN-APP NOTIFICATION TOAST (VISUAL BANNER OVERLAY)
// ==========================================================================

let toastContainer = null;
let activeToastTimeout = null;

function ensureToastContainer() {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.getElementById('pwaToastContainer');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'pwaToastContainer';
      toastContainer.className = 'pwa-toast-container';
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
}

/**
 * Показать визуальный баннер-уведомление в интерфейсе PWA
 */
export function showInAppToast({ title, body, icon = '🔔', duration = 7000, onClick = null }) {
  if (typeof document === 'undefined') return;

  const container = ensureToastContainer();

  // Удаляем предыдущий тост, если висит
  if (activeToastTimeout) {
    clearTimeout(activeToastTimeout);
    activeToastTimeout = null;
  }
  container.innerHTML = '';

  const toast = document.createElement('div');
  toast.className = 'pwa-toast pwa-toast-enter';

  // Разделяем body на строки для красивого отображения (например, тема на новой строке)
  const lines = (body || '').split('\n').filter(Boolean);
  const mainLine = lines[0] || '';
  const subLine = lines.slice(1).join(' • ');

  toast.innerHTML = `
    <div class="pwa-toast-icon-wrap">
      <span class="pwa-toast-icon">${icon}</span>
    </div>
    <div class="pwa-toast-content">
      <div class="pwa-toast-title">${escapeHtml(title || 'Уведомление')}</div>
      <div class="pwa-toast-desc">${escapeHtml(mainLine)}</div>
      ${subLine ? `<div class="pwa-toast-sub">${escapeHtml(subLine)}</div>` : ''}
    </div>
    <button type="button" class="pwa-toast-close" title="Закрыть" aria-label="Закрыть">✕</button>
  `;

  const closeToast = () => {
    toast.classList.remove('pwa-toast-enter');
    toast.classList.add('pwa-toast-leave');
    setTimeout(() => {
      toast.remove();
    }, 250);
  };

  toast.querySelector('.pwa-toast-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeToast();
  });

  if (typeof onClick === 'function') {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', () => {
      closeToast();
      onClick();
    });
  }

  container.appendChild(toast);

  // Плавный запуск анимации
  requestAnimationFrame(() => {
    toast.classList.remove('pwa-toast-enter');
  });

  if (duration > 0) {
    activeToastTimeout = setTimeout(() => {
      closeToast();
    }, duration);
  }

  return toast;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
