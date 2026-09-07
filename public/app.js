// Инициализация PWA и Telegram WebApp
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.log('SW registration failed:', err));
  });
}

// Telegram WebApp адаптация
if (window.Telegram && window.Telegram.WebApp) {
  try {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  } catch (e) {
    console.error('Telegram WebApp error:', e);
  }
}

// Установка PWA
let deferredPrompt;
const installBtn = document.getElementById('installPwaBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      installBtn.classList.add('hidden');
    }
    deferredPrompt = null;
  }
});

// Глобальное состояние
const state = {
  schedule: null,
  activeDay: 'today',
  bells: [],
  studentsByGroup: {},
  journalEntries: [],
  curriculumPrograms: [],
};

const DAY_NAMES = {
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
  7: 'Воскресенье',
};

// Переключение табов
const tabs = {
  tabSchedule: document.getElementById('tabSchedule'),
  tabJournal: document.getElementById('tabJournal'),
  tabStudents: document.getElementById('tabStudents'),
  tabUpload: document.getElementById('tabUpload'),
  tabBells: document.getElementById('tabBells'),
};

const navButtons = document.querySelectorAll('.tab-nav-btn');

function switchTab(tabId) {
  Object.keys(tabs).forEach((id) => {
    if (tabs[id]) {
      if (id === tabId) {
        tabs[id].classList.remove('hidden');
      } else {
        tabs[id].classList.add('hidden');
      }
    }
  });

  navButtons.forEach((btn) => {
    const isTarget = btn.getAttribute('data-tab') === tabId;
    btn.classList.toggle('text-blue-500', isTarget);
    btn.classList.toggle('text-slate-400', !isTarget);
  });

  if (tabId === 'tabJournal') {
    loadJournalHistory();
    updateJournalStudents();
  } else if (tabId === 'tabStudents') {
    renderManageStudents();
  } else if (tabId === 'tabBells') {
    renderBells();
  }
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabId = btn.getAttribute('data-tab');
    switchTab(tabId);
  });
});

// Загрузка данных расписания
async function loadSchedule() {
  try {
    const res = await fetch('/api/schedule');
    const data = await res.json();
    if (data.success) {
      state.schedule = data;
      state.bells = data.bells || [];
      updateHeaderStatus();
      renderSchedule();
      populateGroupSelects();
    }
  } catch (err) {
    console.error('Ошибка загрузки расписания:', err);
    document.getElementById('headerCurrentStatus').textContent = 'Офлайн режим (кэш)';
  }
}

// Загрузка студентов
async function loadStudents() {
  try {
    const res = await fetch('/api/students');
    const data = await res.json();
    if (data.success && data.studentsByGroup) {
      state.studentsByGroup = data.studentsByGroup;
      populateGroupSelects();
    }
  } catch (err) {
    console.error('Ошибка загрузки студентов:', err);
  }
}

// Загрузка программ КТП
async function loadCurriculum() {
  try {
    const res = await fetch('/api/curriculum');
    const data = await res.json();
    if (data.success) {
      state.curriculumPrograms = data.programs || [];
    }
  } catch (err) {
    console.error('Ошибка КТП:', err);
  }
}

function updateHeaderStatus() {
  if (!state.schedule) return;
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const todayLessons = state.schedule.lessons.filter((l) => l.dayOfWeek === day);

  const statusEl = document.getElementById('headerCurrentStatus');
  if (todayLessons.length === 0) {
    statusEl.textContent = 'Пар сегодня нет (выходной)';
  } else {
    statusEl.textContent = `Сегодня ${todayLessons.length} пар(ы) • ${DAY_NAMES[day]}`;
  }
}

// Отрисовка расписания
function renderSchedule() {
  if (!state.schedule) return;

  const now = new Date();
  const jsDay = now.getDay();
  const todayNum = jsDay === 0 ? 7 : jsDay;
  const tomorrowNum = todayNum === 7 ? 1 : todayNum + 1;

  let targetDay = todayNum;
  if (state.activeDay === 'tomorrow') targetDay = tomorrowNum;
  else if (state.activeDay === 'all') targetDay = 'all';
  else if (state.activeDay !== 'today') targetDay = Number(state.activeDay);

  const container = document.getElementById('lessonsList');
  container.innerHTML = '';

  let filtered = [];
  if (targetDay === 'all') {
    filtered = [...state.schedule.lessons].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.lessonNumber - b.lessonNumber;
    });
    document.getElementById('currentDayTitle').textContent = 'Вся неделя';
    document.getElementById('currentDaySubtitle').textContent = `Всего найдено ${filtered.length} пар`;
  } else {
    filtered = state.schedule.lessons
      .filter((l) => l.dayOfWeek === targetDay)
      .sort((a, b) => a.lessonNumber - b.lessonNumber);

    document.getElementById('currentDayTitle').textContent = DAY_NAMES[targetDay] || 'День';
    document.getElementById('currentDaySubtitle').textContent = filtered.length > 0
      ? `${filtered.length} пар(ы) на этот день`
      : 'В этот день пар нет';
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center">
        <div class="w-12 h-12 mx-auto rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mb-2">☕</div>
        <p class="text-sm font-semibold text-slate-300">Пар нет</p>
        <p class="text-xs text-slate-500 mt-1">Отличный повод отдохнуть или подготовиться к занятиям</p>
      </div>
    `;
    return;
  }

  filtered.forEach((lesson) => {
    const card = document.createElement('div');
    card.className = 'bg-slate-900 border border-slate-800/90 hover:border-slate-700 rounded-2xl p-4 transition shadow-sm';

    const dayPrefix = targetDay === 'all'
      ? `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-800 text-blue-400 mr-2">${DAY_NAMES[lesson.dayOfWeek]?.slice(0, 2) || ''}</span>`
      : '';

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-sm">
            #${lesson.lessonNumber}
          </div>
          <div>
            <div class="flex items-center gap-1.5">
              ${dayPrefix}
              <span class="text-xs font-semibold text-slate-300">${lesson.startTime} – ${lesson.endTime}</span>
            </div>
            <h3 class="text-sm font-bold text-white mt-0.5">${lesson.subject}</h3>
          </div>
        </div>

        <span class="px-2.5 py-1 rounded-xl text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          Гр. ${lesson.group}
        </span>
      </div>

      <div class="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between">
        <div class="flex items-center gap-1.5 text-xs text-slate-400">
          <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
          <span>${lesson.classroom ? lesson.classroom : 'Аудитория не указана'}</span>
        </div>
        <button class="open-journal-btn px-3 py-1 rounded-lg text-xs font-medium bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 transition flex items-center gap-1"
          data-group="${lesson.group}"
          data-lesson="${lesson.lessonNumber}"
          data-start="${lesson.startTime}"
          data-end="${lesson.endTime}"
          data-room="${lesson.classroom || ''}"
          data-subject="${lesson.subject}">
          <span>📝 Журнал</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  // Навешиваем клик на кнопки "Журнал"
  document.querySelectorAll('.open-journal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.getAttribute('data-group');
      const lessonNum = btn.getAttribute('data-lesson');
      const start = btn.getAttribute('data-start');
      const end = btn.getAttribute('data-end');
      const room = btn.getAttribute('data-room');
      const subject = btn.getAttribute('data-subject');

      // Переключаем группу и номер в табе Журнала
      document.getElementById('journalGroupSelect').value = group;
      document.getElementById('journalLessonNumSelect').value = lessonNum;

      // Автозаполнение даты сегодняшним днем
      const now = new Date();
      document.getElementById('journalDateInput').value = now.toISOString().split('T')[0];

      // Подтягиваем тему
      autoFillTopicForGroup(group);

      // Переходим во вкладку Журнала
      switchTab('tabJournal');
    });
  });
}

// Кнопки фильтра дней
document.querySelectorAll('.day-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.day-btn').forEach((b) => {
      b.classList.remove('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-600/30');
      b.classList.add('bg-slate-800', 'text-slate-300');
    });
    btn.classList.add('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-600/30');
    btn.classList.remove('bg-slate-800', 'text-slate-300');

    state.activeDay = btn.getAttribute('data-day');
    renderSchedule();
  });
});

// Заполнение выпадающих списков групп
function populateGroupSelects() {
  const groups = new Set();
  if (state.schedule?.lessons) {
    state.schedule.lessons.forEach((l) => {
      if (l.group && l.group !== '—') groups.add(l.group);
    });
  }
  Object.keys(state.studentsByGroup).forEach((g) => groups.add(g));

  const selects = [
    document.getElementById('journalGroupSelect'),
    document.getElementById('manageGroupSelect'),
  ];

  selects.forEach((sel) => {
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '';
    Array.from(groups).sort().forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = `Группа ${g}`;
      sel.appendChild(opt);
    });
    if (currentVal && groups.has(currentVal)) {
      sel.value = currentVal;
    }
  });

  updateJournalStudents();
}

// ЖУРНАЛ: Обновление списка студентов при выборе группы
function updateJournalStudents() {
  const group = document.getElementById('journalGroupSelect').value;
  const listEl = document.getElementById('journalStudentsList');
  const countEl = document.getElementById('studentsCountLabel');
  if (!listEl) return;

  const students = state.studentsByGroup[group] || [];
  countEl.textContent = students.length;

  if (students.length === 0) {
    listEl.innerHTML = `
      <div class="text-xs text-slate-400 py-3 text-center bg-slate-950/40 rounded-xl border border-slate-800">
        В группе ${group} пока нет студентов. Добавьте их во вкладке «Студенты».
      </div>
    `;
    return;
  }

  listEl.innerHTML = '';
  students.forEach((student, idx) => {
    const row = document.createElement('div');
    row.className = 'student-row flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs';
    row.setAttribute('data-student', student);

    row.innerHTML = `
      <div class="flex items-center gap-2 flex-1 pr-2 truncate">
        <span class="text-[11px] text-slate-500 w-5">${idx + 1}.</span>
        <span class="font-medium text-slate-200 truncate">${student}</span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Посещаемость -->
        <div class="flex rounded-lg bg-slate-900 border border-slate-700 p-0.5 gap-0.5 attendance-toggle">
          <button type="button" data-val="present" class="status-btn px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-600 text-white transition">Был</button>
          <button type="button" data-val="absent" class="status-btn px-2 py-1 rounded-md text-[10px] font-bold text-slate-400 hover:text-white transition">Н</button>
          <button type="button" data-val="excused" class="status-btn px-2 py-1 rounded-md text-[10px] font-bold text-slate-400 hover:text-white transition">У</button>
        </div>

        <!-- Оценка -->
        <select class="grade-select bg-slate-800 border border-slate-700 rounded-lg px-1.5 py-1 text-xs text-amber-400 font-bold focus:outline-none">
          <option value="">—</option>
          <option value="5">5</option>
          <option value="4">4</option>
          <option value="3">3</option>
          <option value="2">2</option>
        </select>
      </div>
    `;

    // Логика переключения статуса посещаемости
    const statusBtns = row.querySelectorAll('.status-btn');
    statusBtns.forEach((b) => {
      b.addEventListener('click', () => {
        statusBtns.forEach((other) => {
          other.className = 'status-btn px-2 py-1 rounded-md text-[10px] font-bold text-slate-400 hover:text-white transition';
        });
        const val = b.getAttribute('data-val');
        if (val === 'present') {
          b.className = 'status-btn px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-600 text-white transition';
        } else if (val === 'absent') {
          b.className = 'status-btn px-2 py-1 rounded-md text-[10px] font-bold bg-rose-600 text-white transition';
        } else if (val === 'excused') {
          b.className = 'status-btn px-2 py-1 rounded-md text-[10px] font-bold bg-amber-600 text-white transition';
        }
      });
    });

    listEl.appendChild(row);
  });
}

document.getElementById('journalGroupSelect')?.addEventListener('change', () => {
  const group = document.getElementById('journalGroupSelect').value;
  updateJournalStudents();
  autoFillTopicForGroup(group);
});

// Кнопка "Все были"
document.getElementById('markAllPresentBtn')?.addEventListener('click', () => {
  document.querySelectorAll('#journalStudentsList .student-row').forEach((row) => {
    const btns = row.querySelectorAll('.status-btn');
    btns.forEach((b) => {
      if (b.getAttribute('data-val') === 'present') {
        b.className = 'status-btn px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-600 text-white transition';
      } else {
        b.className = 'status-btn px-2 py-1 rounded-md text-[10px] font-bold text-slate-400 hover:text-white transition';
      }
    });
  });
});

// Автоподстановка темы из КТП
async function autoFillTopicForGroup(group) {
  try {
    const res = await fetch(`/api/curriculum?group=${encodeURIComponent(group)}`);
    const data = await res.json();
    if (data.success && data.nextTopic) {
      document.getElementById('journalTopicInput').value = data.nextTopic.topic;
    }
  } catch (e) {
    console.error('Ошибка темы КТП:', e);
  }
}

document.getElementById('autoFillTopicBtn')?.addEventListener('click', () => {
  const group = document.getElementById('journalGroupSelect').value;
  autoFillTopicForGroup(group);
});

// Сохранение пары в журнал
document.getElementById('saveJournalBtn')?.addEventListener('click', async () => {
  const group = document.getElementById('journalGroupSelect').value;
  const lessonNumber = Number(document.getElementById('journalLessonNumSelect').value);
  const date = document.getElementById('journalDateInput').value || new Date().toISOString().split('T')[0];
  const topic = document.getElementById('journalTopicInput').value || 'Практическое занятие';
  const notes = document.getElementById('journalNotesInput').value || '';

  // Собираем посещаемость и оценки
  const attendance = {};
  document.querySelectorAll('#journalStudentsList .student-row').forEach((row) => {
    const student = row.getAttribute('data-student');
    const activeBtn = row.querySelector('.status-btn.bg-emerald-600, .status-btn.bg-rose-600, .status-btn.bg-amber-600');
    const status = activeBtn ? activeBtn.getAttribute('data-val') : 'present';
    const grade = row.querySelector('.grade-select').value;

    attendance[student] = { status, grade: grade || undefined };
  });

  const payload = {
    group,
    lessonNumber,
    date,
    topic,
    notes,
    subject: 'Информатика',
    attendance,
  };

  try {
    const btn = document.getElementById('saveJournalBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Сохранение...';

    const res = await fetch('/api/journal/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.success) {
      alert('✅ Занятие успешно записано в журнал!');
      loadJournalHistory();
    } else {
      alert('❌ Ошибка: ' + data.error);
    }
    btn.disabled = false;
    btn.textContent = '💾 Сохранить пару в электронный журнал';
  } catch (e) {
    alert('Ошибка сети при сохранении журнала');
  }
});

// Загрузка истории журнала
async function loadJournalHistory() {
  try {
    const res = await fetch('/api/journal');
    const data = await res.json();
    if (data.success) {
      state.journalEntries = data.entries || [];
      renderJournalHistory();
    }
  } catch (e) {
    console.error('Ошибка истории журнала:', e);
  }
}

function renderJournalHistory() {
  const container = document.getElementById('journalHistoryList');
  if (!container) return;

  if (state.journalEntries.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-500 py-2">Записей пока нет</div>`;
    return;
  }

  container.innerHTML = '';
  state.journalEntries.slice(-10).reverse().forEach((entry) => {
    const card = document.createElement('div');
    card.className = 'p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-1';

    const attendKeys = Object.keys(entry.attendance || {});
    const absents = attendKeys.filter((k) => entry.attendance[k].status === 'absent').length;

    card.innerHTML = `
      <div class="flex items-center justify-between font-semibold text-slate-200">
        <span>${entry.dateFormatted} • Пара #${entry.lessonNumber}</span>
        <span class="text-blue-400">Гр. ${entry.group}</span>
      </div>
      <div class="text-slate-300 font-medium">${entry.topic}</div>
      <div class="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800/60">
        <span>Отмечено студентов: ${attendKeys.length}</span>
        <span class="${absents > 0 ? 'text-rose-400' : 'text-emerald-400'}">Отсутствовали: ${absents}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// УПРАВЛЕНИЕ СТУДЕНТАМИ
function renderManageStudents() {
  const group = document.getElementById('manageGroupSelect').value;
  const listEl = document.getElementById('manageStudentsList');
  if (!listEl) return;

  const students = state.studentsByGroup[group] || [];
  if (students.length === 0) {
    listEl.innerHTML = `<div class="text-xs text-slate-400 py-3 text-center">В этой группе пока нет студентов</div>`;
    return;
  }

  listEl.innerHTML = '';
  students.forEach((student, idx) => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs';
    item.innerHTML = `
      <span class="text-slate-200 truncate pr-2"><b class="text-slate-500 mr-1">${idx + 1}.</b> ${student}</span>
      <button class="delete-student-btn text-rose-400 hover:text-rose-300 text-xs px-2 py-0.5 rounded transition" data-student="${student}">
        ✕
      </button>
    `;

    item.querySelector('.delete-student-btn').addEventListener('click', async () => {
      if (confirm(`Удалить студента ${student} из группы ${group}?`)) {
        await fetch(`/api/students?group=${encodeURIComponent(group)}&student=${encodeURIComponent(student)}`, {
          method: 'DELETE',
        });
        await loadStudents();
        renderManageStudents();
        updateJournalStudents();
      }
    });

    listEl.appendChild(item);
  });
}

document.getElementById('manageGroupSelect')?.addEventListener('change', renderManageStudents);

// Добавить одного студента
document.getElementById('addStudentBtn')?.addEventListener('click', async () => {
  const input = document.getElementById('newStudentNameInput');
  const student = input.value.trim();
  const group = document.getElementById('manageGroupSelect').value;
  if (!student) return;

  await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group, student }),
  });

  input.value = '';
  await loadStudents();
  renderManageStudents();
  updateJournalStudents();
});

// Сохранить список студентов из текста
document.getElementById('saveBulkStudentsBtn')?.addEventListener('click', async () => {
  const textarea = document.getElementById('bulkStudentsText');
  const text = textarea.value.trim();
  const group = document.getElementById('manageGroupSelect').value;
  if (!text) return;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group, students: lines }),
  });

  textarea.value = '';
  alert(`✅ Список студентов группы ${group} сохранен!`);
  await loadStudents();
  renderManageStudents();
  updateJournalStudents();
});

// Загрузка студентов из файла
const studentsDropZone = document.getElementById('studentsDropZone');
const studentsFileInput = document.getElementById('studentsFileInput');

studentsDropZone?.addEventListener('click', () => studentsFileInput.click());

studentsFileInput?.addEventListener('change', async () => {
  if (!studentsFileInput.files || studentsFileInput.files.length === 0) return;
  const file = studentsFileInput.files[0];
  const group = document.getElementById('manageGroupSelect').value;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`/api/students/upload?group=${encodeURIComponent(group)}`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ ${data.message}`);
      await loadStudents();
      renderManageStudents();
      updateJournalStudents();
    } else {
      alert(`❌ Ошибка: ${data.error}`);
    }
  } catch (e) {
    alert('Ошибка при загрузке файла со студентами');
  }
});

// ЗАГРУЗКА РАСПИСАНИЯ EXCEL
const scheduleDropZone = document.getElementById('scheduleDropZone');
const scheduleFileInput = document.getElementById('scheduleFileInput');
const uploadStatusBox = document.getElementById('uploadStatusBox');

scheduleDropZone?.addEventListener('click', () => scheduleFileInput.click());

['dragenter', 'dragover'].forEach((eventName) => {
  scheduleDropZone?.addEventListener(eventName, (e) => {
    e.preventDefault();
    scheduleDropZone.classList.add('border-blue-400', 'bg-blue-900/30');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  scheduleDropZone?.addEventListener(eventName, (e) => {
    e.preventDefault();
    scheduleDropZone.classList.remove('border-blue-400', 'bg-blue-900/30');
  });
});

scheduleDropZone?.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files && files.length > 0) {
    handleScheduleFileUpload(files[0]);
  }
});

scheduleFileInput?.addEventListener('change', () => {
  if (scheduleFileInput.files && scheduleFileInput.files.length > 0) {
    handleScheduleFileUpload(scheduleFileInput.files[0]);
  }
});

async function handleScheduleFileUpload(file) {
  uploadStatusBox.classList.remove('hidden');
  uploadStatusBox.className = 'p-3.5 rounded-xl border border-blue-500/30 bg-blue-950/40 text-blue-300 text-xs flex items-center gap-2';
  uploadStatusBox.innerHTML = `<span>⏳ Обработка и парсинг файла ${file.name}...</span>`;

  try {
    const res = await fetch('/api/upload-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });

    const data = await res.json();
    if (data.success) {
      uploadStatusBox.className = 'p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 text-xs';
      uploadStatusBox.innerHTML = `
        <div>
          <p class="font-bold">✅ Расписание успешно обновлено!</p>
          <p class="mt-1">Найдено пар: <b>${data.totalLessons}</b></p>
          <p class="text-[11px] text-emerald-400/80">Листы: ${data.sheets.join(', ')}</p>
        </div>
      `;
      await loadSchedule();
      setTimeout(() => switchTab('tabSchedule'), 1200);
    } else {
      uploadStatusBox.className = 'p-3.5 rounded-xl border border-rose-500/30 bg-rose-950/40 text-rose-300 text-xs';
      uploadStatusBox.innerHTML = `<b>❌ Ошибка парсинга:</b> ${data.error}`;
    }
  } catch (err) {
    uploadStatusBox.className = 'p-3.5 rounded-xl border border-rose-500/30 bg-rose-950/40 text-rose-300 text-xs';
    uploadStatusBox.innerHTML = `<b>❌ Ошибка сети при отправке файла</b>`;
  }
}

// ЗВОНКИ
function renderBells() {
  const container = document.getElementById('bellsList');
  if (!container || !state.bells) return;

  container.innerHTML = '';
  state.bells.forEach((bell) => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs';
    item.innerHTML = `
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 rounded-lg bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center">${bell.lessonNumber}</span>
        <span class="font-semibold text-slate-200">${bell.lessonNumber} пара</span>
      </div>
      <span class="px-2.5 py-1 rounded-lg bg-slate-800 font-mono text-slate-300 font-medium">${bell.startTime} — ${bell.endTime}</span>
    `;
    container.appendChild(item);
  });
}

// Инициализация при старте
(async () => {
  const todayInput = document.getElementById('journalDateInput');
  if (todayInput) {
    todayInput.value = new Date().toISOString().split('T')[0];
  }
  await loadSchedule();
  await loadStudents();
  await loadCurriculum();
})();
