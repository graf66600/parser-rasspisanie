// ==========================================================================
// SCHEDULE UPLOAD VIEW (MULTI-FILE EXCEL & PDF SUPPORT)
// ==========================================================================

export async function ensureXLSX() {
  if (window.XLSX) return window.XLSX;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error('Не удалось загрузить библиотеку обработки Excel'));
    document.head.appendChild(script);
  });
}

export async function handleFiles(filesList, onUploadSuccess) {
  const sStatus = document.getElementById('uploadStatusBox');
  if (!sStatus) return;

  const isStatic = (typeof window !== 'undefined' && (window.location.hostname.includes('github.io') || window.location.protocol === 'file:'));
  if (isStatic) {
    sStatus.classList.remove('hidden');
    sStatus.style.cssText = 'padding: 12px; border-radius: 12px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #93c5fd; font-size: 12px;';
    sStatus.innerHTML = `
      <div class="font-bold">ℹ️ Демонстрационный режим (GitHub Pages)</div>
      <div class="mt-1 text-slate-300">
        На GitHub Pages серверный парсинг Excel/PDF отключен. Запустите приложение локально (<code>npm start</code>) для автоматической обработки и слияния файлов.
      </div>
    `;
    return;
  }

  const files = Array.from(filesList || []);
  if (files.length === 0) return;

  const mergeCheckbox = document.getElementById('mergeScheduleCheckbox');
  const isMerge = mergeCheckbox ? mergeCheckbox.checked : true;
  const mode = isMerge ? 'append' : 'replace';

  const fileNames = files.map((f) => f.name).join(', ');
  sStatus.classList.remove('hidden');
  sStatus.style.cssText = 'padding: 12px; border-radius: 12px; background: rgba(37, 99, 235, 0.15); border: 1px solid rgba(37, 99, 235, 0.3); color: #60a5fa; font-size: 12px;';
  sStatus.textContent = `⏳ Обработка и слияние файлов (${files.length}): ${fileNames}...`;

  // Отправляем все файлы через FormData на бэкенд
  try {
    const formData = new FormData();
    formData.append('mode', mode);
    files.forEach((file) => {
      formData.append('files', file, file.name);
    });

    const res = await fetch('./api/upload-schedule', {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        sStatus.style.cssText = 'padding: 12px; border-radius: 12px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; font-size: 12px;';
        const tripCount = data.lessons?.length ?? 0;
        sStatus.innerHTML = `
          <div class="font-bold">✅ Расписание успешно обновлено и объединено!</div>
          <div class="mt-1 text-slate-200">
            Файлов обработано: <b>${data.processedFiles?.length || files.length}</b> • 
            Преподавателей: <b>${data.teachersCount}</b> • 
            Всего пар: <b>${data.totalLessons}</b> • 
            Пар Трипольского: <b>${tripCount}</b>
          </div>
        `;
        if (typeof onUploadSuccess === 'function') onUploadSuccess();
        return;
      }
    }
  } catch (e) {
    console.warn('Серверный API загрузки недоступен:', e);
  }

  // Если серверный API недоступен (GitHub Pages)
  sStatus.style.cssText = 'padding: 12px; border-radius: 12px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #fbbf24; font-size: 12px;';
  sStatus.innerHTML = `
    <div class="font-bold">ℹ️ Внимание: режим GitHub Pages</div>
    <div class="mt-1 text-slate-300">
      В облачном PWA расписание читается из репозитория. Для применения новых файлов (${files.length} шт.):<br>
      • Запустите локальный сервер: <code>npm run dev</code> или <code>npm run parse</code>.<br>
      • Либо отправьте PDF-файлы в Telegram-бота колледжа.
    </div>
  `;
}

export function setupUploadListeners(onUploadSuccess) {
  const sDrop = document.getElementById('scheduleDropZone');
  const sInput = document.getElementById('scheduleFileInput');

  sDrop?.addEventListener('click', () => sInput?.click());

  sInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files, onUploadSuccess);
    }
  });

  // Drag and Drop поддержка множественных файлов
  ['dragenter', 'dragover'].forEach((eventName) => {
    sDrop?.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      sDrop.classList.add('border-blue-500', 'bg-blue-950/20');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    sDrop?.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      sDrop.classList.remove('border-blue-500', 'bg-blue-950/20');
    });
  });

  sDrop?.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFiles(dt.files, onUploadSuccess);
    }
  });
}
