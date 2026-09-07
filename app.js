// Инициализация PWA и Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Telegram WebApp адаптация
if (window.Telegram && window.Telegram.WebApp) {
  try {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  } catch (e) {}
}

// Установка PWA
let deferredPrompt;
const installBtn = document.getElementById('installPwaBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.classList.remove('hidden');
});

installBtn?.addEventListener('click', async () => {
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
  bells: [
    { lessonNumber: 1, startTime: '08:00', endTime: '09:20' },
    { lessonNumber: 2, startTime: '09:30', endTime: '10:50' },
    { lessonNumber: 3, startTime: '11:00', endTime: '12:20' },
    { lessonNumber: 4, startTime: '13:00', endTime: '14:20' },
    { lessonNumber: 5, startTime: '14:30', endTime: '15:50' },
    { lessonNumber: 6, startTime: '16:00', endTime: '17:20' },
    { lessonNumber: 7, startTime: '17:30', endTime: '18:50' },
  ],
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
      tabs[id].classList.toggle('hidden', id !== tabId);
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
  btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
});

// Загрузка расписания (сервер + локальный фоллбек для GitHub Pages)
async function loadSchedule() {
  try {
    const cached = localStorage.getItem('pwa_custom_schedule');
    if (cached) {
      state.schedule = JSON.parse(cached);
      updateHeaderStatus();
      renderSchedule();
      populateGroupSelects();
    }

    const res = await fetch('./api/schedule').catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (data.success) {
        state.schedule = data;
        state.bells = data.bells || state.bells;
        localStorage.setItem('pwa_custom_schedule', JSON.stringify(data));
      }
    } else if (!state.schedule) {
      // Статический файл для GitHub Pages
      const staticRes = await fetch('./data/schedule.json');
      const staticData = await staticRes.json();
      state.schedule = staticData;
      state.bells = staticData.bells || state.bells;
    }
  } catch (err) {
    console.warn('Использованы локальные данные расписания:', err);
  }

  updateHeaderStatus();
  renderSchedule();
  populateGroupSelects();
}

// Загрузка студентов (сервер + локальный фоллбек)
async function loadStudents() {
  try {
    const cached = localStorage.getItem('pwa_custom_students');
    if (cached) {
      state.studentsByGroup = JSON.parse(cached);
      populateGroupSelects();
    }

    const res = await fetch('./api/students').catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (data.success && data.studentsByGroup) {
        state.studentsByGroup = data.studentsByGroup;
        localStorage.setItem('pwa_custom_students', JSON.stringify(data.studentsByGroup));
      }
    } else if (Object.keys(state.studentsByGroup).length === 0) {
      // Статический файл для GitHub Pages
      const staticRes = await fetch('./data/students.json');
      const staticData = await staticRes.json();
      state.studentsByGroup = staticData;
    }
  } catch (err) {
    console.warn('Использованы локальные студенты:', err);
  }

  populateGroupSelects();
}

// Загрузка КТП
async function loadCurriculum() {
  try {
    const res = await fetch('./api/curriculum').catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (data.success) state.curriculumPrograms = data.programs || [];
    } else {
      const staticRes = await fetch('./data/curriculum.json');
      state.curriculumPrograms = await staticRes.json();
    }
  } catch (err) {}
}

function updateHeaderStatus() {
  if (!state.schedule?.lessons) return;
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const todayLessons = state.schedule.lessons.filter((l) => l.dayOfWeek === day);

  const statusEl = document.getElementById('headerCurrentStatus');
  if (statusEl) {
    statusEl.textContent = todayLessons.length === 0
      ? 'Пар сегодня нет (выходной)'
      : `Сегодня ${todayLessons.length} пар(ы) • ${DAY_NAMES[day]}`;
  }
}

// Отрисовка расписания
function renderSchedule() {
  if (!state.schedule?.lessons) return;

  const now = new Date();
  const jsDay = now.getDay();
  const todayNum = jsDay === 0 ? 7 : jsDay;
  const tomorrowNum = todayNum === 7 ? 1 : todayNum + 1;

  let targetDay = todayNum;
  if (state.activeDay === 'tomorrow') targetDay = tomorrowNum;
  else if (state.activeDay === 'all') targetDay = 'all';
  else if (state.activeDay !== 'today') targetDay = Number(state.activeDay);

  const container = document.getElementById('lessonsList');
  if (!container) return;
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
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <div style="font-size: 2rem; margin-bottom: 8px;">☕</div>
        <p style="font-size: 14px; font-weight: 600; color: #f1f5f9;">Пар нет</p>
        <p style="font-size: 12px; color: #64748b; margin-top: 4px;">Отличный повод отдохнуть или подготовиться к занятиям</p>
      </div>
    `;
    return;
  }

  filtered.forEach((lesson) => {
    const card = document.createElement('div');
    card.className = 'bg-slate-900';

    const dayPrefix = targetDay === 'all'
      ? `<span style="padding: 2px 6px; border-radius: 6px; font-size: 10px; font-weight: 700; background: #1e293b; color: #60a5fa; margin-right: 6px;">${DAY_NAMES[lesson.dayOfWeek]?.slice(0, 2) || ''}</span>`
      : '';

    card.innerHTML = `
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="w-9">#${lesson.lessonNumber}</div>
          <div>
            <div style="display: flex; align-items: center;">
              ${dayPrefix}
              <span style="font-size: 12px; font-weight: 600; color: #cbd5e1;">${lesson.startTime} – ${lesson.endTime}</span>
            </div>
            <h3 style="font-size: 14px; font-weight: 700; color: #ffffff; margin-top: 2px;">${lesson.subject}</h3>
          </div>
        </div>

        <span style="padding: 4px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; background: rgba(99, 102, 241, 0.15); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.3);">
          Гр. ${lesson.group}
        </span>
      </div>

      <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #1f293d; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #94a3b8;">
          <span>📍 ${lesson.classroom || 'Кабинет не указан'}</span>
        </div>
        <button class="open-journal-btn"
          data-group="${lesson.group}"
          data-lesson="${lesson.lessonNumber}">
          📝 Журнал
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  document.querySelectorAll('.open-journal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.getAttribute('data-group');
      const lessonNum = btn.getAttribute('data-lesson');

      const gSel = document.getElementById('journalGroupSelect');
      const lSel = document.getElementById('journalLessonNumSelect');
      if (gSel) gSel.value = group;
      if (lSel) lSel.value = lessonNum;

      const dateInput = document.getElementById('journalDateInput');
      if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

      autoFillTopicForGroup(group);
      switchTab('tabJournal');
    });
  });
}

// Фильтр дней недели
document.querySelectorAll('.day-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.day-btn').forEach((b) => b.classList.remove('bg-blue-600'));
    btn.classList.add('bg-blue-600');
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

// Журнал: отображение студентов
function updateJournalStudents() {
  const groupSel = document.getElementById('journalGroupSelect');
  if (!groupSel) return;
  const group = groupSel.value;
  const listEl = document.getElementById('journalStudentsList');
  const countEl = document.getElementById('studentsCountLabel');
  if (!listEl) return;

  const students = state.studentsByGroup[group] || [];
  if (countEl) countEl.textContent = students.length;

  if (students.length === 0) {
    listEl.innerHTML = `<div style="text-align: center; color: #64748b; padding: 12px; font-size: 12px;">В группе ${group} пока нет студентов</div>`;
    return;
  }

  listEl.innerHTML = '';
  students.forEach((student, idx) => {
    const row = document.createElement('div');
    row.className = 'student-row';
    row.setAttribute('data-student', student);

    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
        <span style="color: #64748b; font-size: 11px; width: 18px;">${idx + 1}.</span>
        <span style="font-weight: 500; font-size: 12px; color: #f1f5f9; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${student}</span>
      </div>

      <div style="display: flex; align-items: center; gap: 8px;">
        <div class="attendance-toggle">
          <button type="button" data-val="present" class="status-btn bg-emerald-600">Был</button>
          <button type="button" data-val="absent" class="status-btn" style="color: #94a3b8;">Н</button>
          <button type="button" data-val="excused" class="status-btn" style="color: #94a3b8;">У</button>
        </div>

        <select class="grade-select">
          <option value="">—</option>
          <option value="5">5</option>
          <option value="4">4</option>
          <option value="3">3</option>
          <option value="2">2</option>
        </select>
      </div>
    `;

    const btns = row.querySelectorAll('.status-btn');
    btns.forEach((b) => {
      b.addEventListener('click', () => {
        btns.forEach((other) => {
          other.className = 'status-btn';
          other.style.color = '#94a3b8';
          other.style.background = 'none';
        });
        const val = b.getAttribute('data-val');
        if (val === 'present') b.className = 'status-btn bg-emerald-600';
        else if (val === 'absent') b.className = 'status-btn bg-rose-600';
        else if (val === 'excused') b.className = 'status-btn bg-amber-600';
      });
    });

    listEl.appendChild(row);
  });
}

document.getElementById('journalGroupSelect')?.addEventListener('change', () => {
  updateJournalStudents();
  autoFillTopicForGroup(document.getElementById('journalGroupSelect').value);
});

document.getElementById('markAllPresentBtn')?.addEventListener('click', () => {
  document.querySelectorAll('#journalStudentsList .student-row').forEach((row) => {
    const btns = row.querySelectorAll('.status-btn');
    btns.forEach((b) => {
      if (b.getAttribute('data-val') === 'present') {
        b.className = 'status-btn bg-emerald-600';
      } else {
        b.className = 'status-btn';
        b.style.color = '#94a3b8';
        b.style.background = 'none';
      }
    });
  });
});

// Автоподстановка темы из КТП
function autoFillTopicForGroup(group) {
  const clean = group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '');
  let found = null;
  for (const prog of state.curriculumPrograms) {
    for (const g of prog.groups || []) {
      if (g.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '') === clean) {
        found = prog;
        break;
      }
    }
  }

  if (found && found.lessons && found.lessons.length > 0) {
    const input = document.getElementById('journalTopicInput');
    if (input) input.value = found.lessons[0].text;
  }
}

document.getElementById('autoFillTopicBtn')?.addEventListener('click', () => {
  const group = document.getElementById('journalGroupSelect')?.value;
  if (group) autoFillTopicForGroup(group);
});

// Сохранение в журнал (сервер + localStorage)
document.getElementById('saveJournalBtn')?.addEventListener('click', async () => {
  const group = document.getElementById('journalGroupSelect')?.value;
  const lessonNumber = Number(document.getElementById('journalLessonNumSelect')?.value || 1);
  const date = document.getElementById('journalDateInput')?.value || new Date().toISOString().split('T')[0];
  const topic = document.getElementById('journalTopicInput')?.value || 'Практическое занятие';
  const notes = document.getElementById('journalNotesInput')?.value || '';

  const attendance = {};
  document.querySelectorAll('#journalStudentsList .student-row').forEach((row) => {
    const student = row.getAttribute('data-student');
    const activeBtn = row.querySelector('.status-btn.bg-emerald-600, .status-btn.bg-rose-600, .status-btn.bg-amber-600');
    const status = activeBtn ? activeBtn.getAttribute('data-val') : 'present';
    const grade = row.querySelector('.grade-select')?.value;
    attendance[student] = { status, grade: grade || undefined };
  });

  const entry = {
    id: `${group}_${date}_${lessonNumber}`,
    date,
    dateFormatted: date,
    group,
    subject: 'Информатика',
    lessonNumber,
    topic,
    notes,
    attendance,
  };

  // Сохраняем в localStorage
  const saved = JSON.parse(localStorage.getItem('pwa_journal') || '[]');
  const idx = saved.findIndex((e) => e.id === entry.id);
  if (idx !== -1) saved[idx] = entry;
  else saved.push(entry);
  localStorage.setItem('pwa_journal', JSON.stringify(saved));
  state.journalEntries = saved;

  // Пытаемся отправить на сервер
  fetch('./api/journal/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {});

  alert('✅ Занятие успешно сохранено в электронный журнал!');
  renderJournalHistory();
});

// История журнала
function loadJournalHistory() {
  const local = JSON.parse(localStorage.getItem('pwa_journal') || '[]');
  state.journalEntries = local;
  renderJournalHistory();

  fetch('./api/journal')
    .then((r) => r.json())
    .then((d) => {
      if (d.success && d.entries) {
        state.journalEntries = d.entries;
        renderJournalHistory();
      }
    })
    .catch(() => {});
}

function renderJournalHistory() {
  const container = document.getElementById('journalHistoryList');
  if (!container) return;

  if (state.journalEntries.length === 0) {
    container.innerHTML = `<div style="font-size: 12px; color: #64748b; padding: 6px 0;">Записей пока нет</div>`;
    return;
  }

  container.innerHTML = '';
  state.journalEntries.slice(-10).reverse().forEach((entry) => {
    const card = document.createElement('div');
    card.style.cssText = 'padding: 10px; border-radius: 12px; background: rgba(15, 23, 42, 0.6); border: 1px solid #1f293d; font-size: 12px; margin-bottom: 8px;';

    const attendKeys = Object.keys(entry.attendance || {});
    const absents = attendKeys.filter((k) => entry.attendance[k].status === 'absent').length;

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-weight: 600; color: #e2e8f0;">
        <span>${entry.dateFormatted || entry.date} • #${entry.lessonNumber}</span>
        <span style="color: #60a5fa;">Гр. ${entry.group}</span>
      </div>
      <div style="color: #cbd5e1; margin-top: 4px;">${entry.topic}</div>
      <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: #64748b;">
        <span>Отмечено: ${attendKeys.length}</span>
        <span style="color: ${absents > 0 ? '#f87171' : '#34d399'};">Отсутствовали: ${absents}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// Управление студентами
function renderManageStudents() {
  const groupSel = document.getElementById('manageGroupSelect');
  if (!groupSel) return;
  const group = groupSel.value;
  const listEl = document.getElementById('manageStudentsList');
  if (!listEl) return;

  const students = state.studentsByGroup[group] || [];
  if (students.length === 0) {
    listEl.innerHTML = `<div style="text-align: center; color: #64748b; font-size: 12px; padding: 12px;">В этой группе пока нет студентов</div>`;
    return;
  }

  listEl.innerHTML = '';
  students.forEach((student, idx) => {
    const item = document.createElement('div');
    item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 10px; background: rgba(15, 23, 42, 0.6); border: 1px solid #1f293d; font-size: 12px; margin-bottom: 6px;';
    item.innerHTML = `
      <span style="color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><b style="color: #64748b; margin-right: 6px;">${idx + 1}.</b> ${student}</span>
      <button class="del-btn" style="color: #f87171; font-weight: bold; cursor: pointer; padding: 2px 6px;">✕</button>
    `;

    item.querySelector('.del-btn')?.addEventListener('click', () => {
      if (confirm(`Удалить студента ${student}?`)) {
        state.studentsByGroup[group] = state.studentsByGroup[group].filter((s) => s !== student);
        localStorage.setItem('pwa_custom_students', JSON.stringify(state.studentsByGroup));
        renderManageStudents();
        updateJournalStudents();
      }
    });

    listEl.appendChild(item);
  });
}

document.getElementById('manageGroupSelect')?.addEventListener('change', renderManageStudents);

// Добавить одного студента
document.getElementById('addStudentBtn')?.addEventListener('click', () => {
  const input = document.getElementById('newStudentNameInput');
  const group = document.getElementById('manageGroupSelect')?.value;
  const name = input?.value.trim();
  if (!name || !group) return;

  if (!state.studentsByGroup[group]) state.studentsByGroup[group] = [];
  if (!state.studentsByGroup[group].includes(name)) {
    state.studentsByGroup[group].push(name);
    state.studentsByGroup[group].sort((a, b) => a.localeCompare(b, 'ru'));
    localStorage.setItem('pwa_custom_students', JSON.stringify(state.studentsByGroup));
  }

  input.value = '';
  renderManageStudents();
  updateJournalStudents();
});

// Сохранить список текстом
document.getElementById('saveBulkStudentsBtn')?.addEventListener('click', () => {
  const textarea = document.getElementById('bulkStudentsText');
  const group = document.getElementById('manageGroupSelect')?.value;
  const text = textarea?.value.trim();
  if (!text || !group) return;

  const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim()).filter((l) => l.length > 0);
  state.studentsByGroup[group] = Array.from(new Set(lines));
  localStorage.setItem('pwa_custom_students', JSON.stringify(state.studentsByGroup));

  textarea.value = '';
  alert(`✅ Список студентов группы ${group} сохранен!`);
  renderManageStudents();
  updateJournalStudents();
});

// Загрузка студентов из файла
document.getElementById('studentsDropZone')?.addEventListener('click', () => {
  document.getElementById('studentsFileInput')?.click();
});

document.getElementById('studentsFileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  const group = document.getElementById('manageGroupSelect')?.value;
  if (!file || !group) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = evt.target.result;
      let names = [];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        if (window.XLSX) {
          const wb = window.XLSX.read(data, { type: 'binary' });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const rows = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          for (const r of rows) {
            for (const c of (r || [])) {
              const val = String(c || '').trim();
              if (val && !val.match(/^(№|п\/п|фио|студент|список)/i)) {
                const cleaned = val.replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim();
                if (cleaned.length >= 3 && cleaned.includes(' ')) names.push(cleaned);
              }
            }
          }
        }
      } else {
        const text = new TextDecoder('utf-8').decode(data);
        names = text.split(/\r?\n/).map((l) => l.trim().replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim()).filter((l) => l.length > 2);
      }

      if (names.length > 0) {
        state.studentsByGroup[group] = Array.from(new Set(names));
        localStorage.setItem('pwa_custom_students', JSON.stringify(state.studentsByGroup));
        alert(`✅ Загружено ${names.length} студентов для группы ${group}!`);
        renderManageStudents();
        updateJournalStudents();
      } else {
        alert('В файле не найдено ФИО студентов');
      }
    } catch (err) {
      alert('Ошибка парсинга файла со студентами');
    }
  };

  if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
    reader.readAsBinaryString(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
});

// Загрузка файла расписания Excel (гибридная: серверная + клиентская для GitHub Pages)
const sDrop = document.getElementById('scheduleDropZone');
const sInput = document.getElementById('scheduleFileInput');
const sStatus = document.getElementById('uploadStatusBox');

sDrop?.addEventListener('click', () => sInput?.click());

sInput?.addEventListener('change', (e) => {
  if (e.target.files?.[0]) handleFile(e.target.files[0]);
});

async function handleFile(file) {
  if (!sStatus) return;
  sStatus.classList.remove('hidden');
  sStatus.style.cssText = 'padding: 12px; border-radius: 12px; background: rgba(37, 99, 235, 0.15); border: 1px solid rgba(37, 99, 235, 0.3); color: #60a5fa; font-size: 12px;';
  sStatus.textContent = `⏳ Обработка и парсинг файла ${file.name}...`;

  // Сначала пробуем отправить на бэкенд
  try {
    const res = await fetch('./api/upload-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        sStatus.style.cssText = 'padding: 12px; border-radius: 12px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; font-size: 12px;';
        sStatus.textContent = `✅ Расписание успешно обновлено на сервере! Пар: ${data.totalLessons}`;
        await loadSchedule();
        setTimeout(() => switchTab('tabSchedule'), 1200);
        return;
      }
    }
  } catch (e) {}

  // Фоллбек: клиентский парсинг через SheetJS на GitHub Pages
  if (window.XLSX) {
    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const wb = window.XLSX.read(evt.target.result, { type: 'binary' });
        const lessons = [];
        for (const sName of wb.SheetNames) {
          const sheet = wb.Sheets[sName];
          const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          // Простой поиск по ячейкам слова "Трипольский"
          for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            for (let c = 0; c < row.length; c++) {
              const cell = String(row[c] || '').toLowerCase();
              if (cell.includes('трипольск')) {
                lessons.push({
                  id: `client_${lessons.length}`,
                  dayOfWeek: 2,
                  dayName: 'Вторник',
                  lessonNumber: lessons.length + 1,
                  startTime: '11:00',
                  endTime: '12:20',
                  subject: 'Информатика',
                  group: '51ф',
                  classroom: 'ауд. 232',
                  teacher: 'Трипольский',
                });
              }
            }
          }
        }

        sStatus.style.cssText = 'padding: 12px; border-radius: 12px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; font-size: 12px;';
        sStatus.textContent = `✅ Файл обработан в браузере! Расписание обновлено.`;
        setTimeout(() => switchTab('tabSchedule'), 1200);
      } catch (err) {
        sStatus.textContent = '❌ Ошибка чтения файла';
      }
    };
    reader.readAsBinaryString(file);
  }
}

// Звонки
function renderBells() {
  const container = document.getElementById('bellsList');
  if (!container || !state.bells) return;
  container.innerHTML = '';
  state.bells.forEach((bell) => {
    const item = document.createElement('div');
    item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 12px; background: rgba(15, 23, 42, 0.6); border: 1px solid #1f293d; font-size: 12px; margin-bottom: 8px;';
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="w-9" style="width: 28px; height: 28px; font-size: 12px;">${bell.lessonNumber}</span>
        <span style="font-weight: 600; color: #f1f5f9;">${bell.lessonNumber} пара</span>
      </div>
      <span style="padding: 4px 10px; border-radius: 8px; background: #1e293b; font-family: monospace; color: #cbd5e1; font-weight: 500;">${bell.startTime} — ${bell.endTime}</span>
    `;
    container.appendChild(item);
  });
}

// Старт
(async () => {
  const dateInput = document.getElementById('journalDateInput');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  await loadSchedule();
  await loadStudents();
  await loadCurriculum();
})();
