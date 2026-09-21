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
  currentTeacher: 'Трипольский',
  teachersList: ['Трипольский'],
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
  const tName = state.currentTeacher || 'Трипольский';

  statusEl.textContent = todayLessons.length === 0
    ? `Пар нет (${tName}) • ${DAY_NAMES[day]}`
    : `Сегодня ${todayLessons.length} пар(ы) (${tName}) • ${DAY_NAMES[day]}`;
}

export function updateTeacherDisplay() {
  const subtitle = document.getElementById('selectedTeacherSubtitle');
  if (subtitle) {
    subtitle.textContent = state.currentTeacher === 'Трипольский'
      ? 'Трипольский (Информатика + КТП)'
      : `${state.currentTeacher} (Расписание)`;
  }
  const select = document.getElementById('teacherSelect');
  if (select && select.value !== state.currentTeacher) {
    select.value = state.currentTeacher;
  }
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

export const PWA_VERSION = 'v23';

export function formatLocalDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function initLocalState() {
  try {
    const ver = localStorage.getItem('pwa_version');
    if (ver !== PWA_VERSION) {
      localStorage.removeItem('pwa_custom_curriculum');
      localStorage.removeItem('pwa_custom_schedule');
      localStorage.setItem('pwa_version', PWA_VERSION);
    }
  } catch (e) {}

  try {
    const savedT = localStorage.getItem('pwa_current_teacher');
    if (savedT) state.currentTeacher = savedT;
  } catch (e) {}

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

  try {
    const cachedJournal = localStorage.getItem('pwa_journal');
    if (cachedJournal) {
      const list = JSON.parse(cachedJournal);
      if (Array.isArray(list)) state.journalEntries = list;
    }
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

export async function loadTeachers(onTeachersLoaded) {
  try {
    let list = null;
    if (!isStaticHost) {
      const res = await safeFetchJson('./api/teachers', 1500);
      if (res?.success && Array.isArray(res.teachers)) list = res.teachers;
    }
    if (!list) {
      list = await safeFetchJson(`./data/teachers.json?v=${PWA_VERSION}`, 2000);
    }
    if (Array.isArray(list) && list.length > 0) {
      state.teachersList = list;
    }
  } catch (e) {}

  const select = document.getElementById('teacherSelect');
  if (select) {
    select.innerHTML = '';
    state.teachersList.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t === 'Трипольский' ? 'Трипольский (КТП)' : t;
      select.appendChild(opt);
    });
    select.value = state.currentTeacher;
  }

  updateTeacherDisplay();
  if (typeof onTeachersLoaded === 'function') onTeachersLoaded();
}

export async function loadSchedule(onScheduleLoaded, targetTeacher = state.currentTeacher) {
  try {
    state.currentTeacher = targetTeacher;
    localStorage.setItem('pwa_current_teacher', targetTeacher);
    updateTeacherDisplay();
    const isTripolsky = targetTeacher.toLowerCase().includes('трипольский');
    let freshData = null;

    if (!isStaticHost) {
      const apiData = await safeFetchJson(`./api/schedule?teacher=${encodeURIComponent(targetTeacher)}`, 1500);
      if (apiData?.success && apiData.lessons) freshData = apiData;
    }

    if (!freshData) {
      if (isTripolsky) {
        freshData = await safeFetchJson(`./data/schedule.json?v=${PWA_VERSION}`, 3000);
      } else {
        const allByTeacher = await safeFetchJson(`./data/schedules_all.json?v=${PWA_VERSION}`, 3000);
        if (allByTeacher && allByTeacher[targetTeacher]) {
          freshData = {
            success: true,
            teacher: targetTeacher,
            lessons: allByTeacher[targetTeacher],
            bells: state.bells,
            hasCurriculum: false,
          };
        }
      }
    }

    if (freshData?.lessons) {
      state.schedule = freshData;
      state.bells = freshData.bells || freshData.settings?.bellsSchedule || state.bells;
      if (isTripolsky) {
        localStorage.setItem('pwa_custom_schedule', JSON.stringify(freshData));
      }
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
      freshStudents = await safeFetchJson(`./data/students.json?v=${PWA_VERSION}`, 3000);
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
      freshCurriculum = await safeFetchJson(`./data/curriculum.json?v=${PWA_VERSION}`, 3000);
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
