// ==========================================================================
// STATE MANAGEMENT & DATA LOADERS
// ==========================================================================

export const DAY_NAMES = {
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
  7: 'Воскресенье',
};

export const state = {
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

export function updateHeaderStatus() {
  const statusEl = document.getElementById('headerCurrentStatus');
  if (!statusEl) return;
  if (!state.schedule?.lessons) {
    statusEl.textContent = 'Расписание загружается...';
    return;
  }
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const todayLessons = state.schedule.lessons.filter((l) => l.dayOfWeek === day);

  statusEl.textContent = todayLessons.length === 0
    ? `Пар сегодня нет • ${DAY_NAMES[day]}`
    : `Сегодня ${todayLessons.length} пар(ы) • ${DAY_NAMES[day]}`;
}

export function populateGroupSelects(onGroupChange) {
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

  if (typeof onGroupChange === 'function') {
    onGroupChange();
  }
}

export function initLocalState() {
  try {
    const cached = localStorage.getItem('pwa_custom_schedule');
    if (cached) {
      const parsed = JSON.parse(cached);
      const target = Array.isArray(parsed)
        ? (parsed.find((s) => s.userId === 1 && s.lessons?.length) || parsed[0])
        : parsed;
      if (target?.lessons?.length) {
        state.schedule = target;
        state.bells = target.bells || target.settings?.bellsSchedule || state.bells;
      }
    }
  } catch (e) {}

  try {
    const cached = localStorage.getItem('pwa_custom_students');
    if (cached) state.studentsByGroup = JSON.parse(cached);
  } catch (e) {}

  try {
    const cached = localStorage.getItem('pwa_custom_curriculum');
    if (cached) state.curriculumPrograms = JSON.parse(cached);
  } catch (e) {}
}

const isStaticHost = typeof window !== 'undefined' && (
  window.location.hostname.includes('github.io') ||
  window.location.protocol === 'file:'
);

async function safeFetchJson(url, timeoutMs = 1500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res?.ok) return await res.json();
  } catch (e) {}
  return null;
}

export async function loadSchedule(onScheduleLoaded) {
  try {
    let freshData = null;
    if (!isStaticHost) {
      const apiData = await safeFetchJson('./api/schedule', 1500);
      if (apiData?.success && apiData.lessons) freshData = apiData;
    }

    if (!freshData) {
      freshData = await safeFetchJson('./data/schedule.json', 3000);
      if (!freshData) {
        const multi = await safeFetchJson('./data/schedules.json', 3000);
        if (multi) {
          freshData = Array.isArray(multi)
            ? (multi.find((s) => s.userId === 1 && s.lessons?.length) || multi[0])
            : multi;
        }
      }
    }

    if (freshData?.lessons?.length) {
      state.schedule = freshData;
      state.bells = freshData.bells || freshData.settings?.bellsSchedule || state.bells;
      localStorage.setItem('pwa_custom_schedule', JSON.stringify(freshData));
    }
  } catch (err) {
    console.warn('Использованы локальные данные расписания:', err);
  }

  updateHeaderStatus();
  if (typeof onScheduleLoaded === 'function') onScheduleLoaded();
}

export async function loadStudents(onStudentsLoaded) {
  try {
    let freshStudents = null;
    if (!isStaticHost) {
      const apiData = await safeFetchJson('./api/students', 1500);
      if (apiData?.success && apiData.studentsByGroup) {
        freshStudents = apiData.studentsByGroup;
      }
    }

    if (!freshStudents && (!state.studentsByGroup || Object.keys(state.studentsByGroup).length === 0)) {
      freshStudents = await safeFetchJson('./data/students.json', 3000);
    }

    if (freshStudents) {
      state.studentsByGroup = freshStudents;
      localStorage.setItem('pwa_custom_students', JSON.stringify(freshStudents));
    }
  } catch (err) {
    console.warn('Использованы локальные студенты:', err);
  }

  if (typeof onStudentsLoaded === 'function') onStudentsLoaded();
}

export async function loadCurriculum(onCurriculumLoaded) {
  try {
    let freshCurriculum = null;
    if (!isStaticHost) {
      const apiData = await safeFetchJson('./api/curriculum', 1500);
      if (apiData?.success && apiData.programs) {
        freshCurriculum = apiData.programs;
      }
    }

    if (!freshCurriculum) {
      freshCurriculum = await safeFetchJson('./data/curriculum.json', 3000);
    }

    if (freshCurriculum) {
      state.curriculumPrograms = freshCurriculum;
      localStorage.setItem('pwa_custom_curriculum', JSON.stringify(freshCurriculum));
    }
  } catch (err) {
    console.warn('Ошибка загрузки КТП:', err);
  }

  if (typeof onCurriculumLoaded === 'function') onCurriculumLoaded();
}
