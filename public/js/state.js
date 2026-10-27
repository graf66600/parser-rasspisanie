// ==========================================================================
// STATE MANAGEMENT & DATA LOADERS
// ==========================================================================
import { PWA_VERSION, isStaticHost, safeFetchJson, clearPwaCacheAndReload, compareGroupNames } from './cacheHelper.js';
import { fetchRemoteStudents, fetchRemoteScheduleData } from './supabaseSync.js';
export { PWA_VERSION, isStaticHost, safeFetchJson, clearPwaCacheAndReload, compareGroupNames };

export const DAY_NAMES = {
  1: 'Понедельник', 2: 'Вторник', 3: 'Среда', 4: 'Четверг',
  5: 'Пятница', 6: 'Суббота', 7: 'Воскресенье',
};

const createDefaultState = () => ({
  currentTeacher: '',
  teachersList: [],
  schedulesAll: {},
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
  currentUser: null,
  currentProfile: null,
  isGuestMode: true,
});

if (typeof window !== 'undefined' && !window.__PWA_STATE__) {
  window.__PWA_STATE__ = createDefaultState();
}

export const state = typeof window !== 'undefined' ? window.__PWA_STATE__ : createDefaultState();

export function updateHeaderStatus() {
  const statusEl = document.getElementById('headerCurrentStatus');
  if (!statusEl) return;

  const titleEl = document.getElementById('headerTeacherTitle');
  if (titleEl) {
    titleEl.textContent = state.currentTeacher || 'Расписание';
  }

  const badgeEl = document.getElementById('headerSubjectBadge');
  if (badgeEl) {
    badgeEl.textContent = state.schedule?.subject || (state.currentTeacher ? 'Преподаватель' : 'Колледж');
  }

  if (!state.currentTeacher) {
    statusEl.textContent = 'Выберите преподавателя в списке';
    return;
  }

  if (!state.schedule?.lessons) {
    statusEl.textContent = 'Расписание загружается...';
    return;
  }

  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const todayLessons = state.schedule.lessons.filter((l) => l.dayOfWeek === day);
  const tName = state.currentTeacher;

  statusEl.textContent = todayLessons.length === 0
    ? `Пар нет (${tName}) • ${DAY_NAMES[day] || ''}`
    : `Сегодня ${todayLessons.length} пар(ы) (${tName}) • ${DAY_NAMES[day] || ''}`;
}

export function updateTeacherDisplay() {
  const titleEl = document.getElementById('headerTeacherTitle');
  if (titleEl) {
    titleEl.textContent = state.currentTeacher || 'Расписание';
  }

  const subtitle = document.getElementById('selectedTeacherSubtitle');
  if (subtitle) {
    subtitle.textContent = state.schedule?.subject || 'Занятия';
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
    Array.from(groups).sort(compareGroupNames).forEach((g) => {
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
      localStorage.removeItem('pwa_custom_schedule');
      localStorage.removeItem('pwa_kiosk_schedules_all');
      localStorage.removeItem('pwa_kiosk_groups_cache');
      localStorage.setItem('pwa_version', PWA_VERSION);
    }
  } catch (e) {}

  try {
    const savedT = localStorage.getItem('pwa_current_teacher');
    if (savedT) state.currentTeacher = savedT;
  } catch (e) {}

  try {
    const savedList = localStorage.getItem('pwa_teachers_list');
    if (savedList) {
      const parsed = JSON.parse(savedList);
      if (Array.isArray(parsed) && parsed.length > 0) state.teachersList = parsed;
    }
  } catch (e) {}

  try {
    const cachedAll = localStorage.getItem('pwa_kiosk_schedules_all');
    if (cachedAll) {
      const parsed = JSON.parse(cachedAll);
      if (parsed && typeof parsed === 'object') {
        state.schedulesAll = parsed;
        const keys = Object.keys(parsed).filter(k => k && k.length > 2);
        if (keys.length > 0 && state.teachersList.length === 0) {
          state.teachersList = keys;
        }
      }
    }
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

export async function loadTeachers(onTeachersLoaded) {
  try {
    // 1. Попытка получить преподавателей из Supabase базы диспетчера
    const remote = await fetchRemoteScheduleData();
    if (remote?.teachersList?.length > 0) {
      state.teachersList = remote.teachersList;
    }

    // 2. Fallback на локальный API или статический файл
    if (!state.teachersList || state.teachersList.length === 0) {
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
    }

    // Если текущий преподаватель не выбран, берём первого из списка
    if (!state.currentTeacher && state.teachersList.length > 0) {
      state.currentTeacher = state.teachersList[0];
      try {
        localStorage.setItem('pwa_current_teacher', state.currentTeacher);
      } catch (e) {}
    }
  } catch (e) {
    console.warn('loadTeachers error:', e);
  }

  const select = document.getElementById('teacherSelect');
  if (select) {
    select.innerHTML = '';
    state.teachersList.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      select.appendChild(opt);
    });
    if (state.currentTeacher) {
      select.value = state.currentTeacher;
    }
  }

  updateTeacherDisplay();
  if (typeof onTeachersLoaded === 'function') onTeachersLoaded();
}

export async function loadSchedule(onScheduleLoaded, targetTeacher = state.currentTeacher) {
  try {
    if (targetTeacher) {
      state.currentTeacher = targetTeacher;
      try {
        localStorage.setItem('pwa_current_teacher', targetTeacher);
      } catch (e) {}
    } else if (state.teachersList.length > 0) {
      state.currentTeacher = state.teachersList[0];
      targetTeacher = state.currentTeacher;
    }

    updateTeacherDisplay();
    let freshData = null;

    // 1. Проверяем кэш всех расписаний в памяти
    if (targetTeacher && state.schedulesAll && state.schedulesAll[targetTeacher]) {
      freshData = {
        success: true,
        teacher: targetTeacher,
        lessons: state.schedulesAll[targetTeacher],
        bells: state.bells,
      };
    }

    // 2. Проверяем удаленный Supabase если данных еще нет
    if (!freshData) {
      const remote = await fetchRemoteScheduleData();
      if (remote?.schedulesAll && remote.schedulesAll[targetTeacher]) {
        freshData = {
          success: true,
          teacher: targetTeacher,
          lessons: remote.schedulesAll[targetTeacher],
          bells: remote.bells || state.bells,
        };
      }
    }

    // 3. Fallback на API сервера
    if (!freshData && !isStaticHost) {
      const apiData = await safeFetchJson(`./api/schedule?teacher=${encodeURIComponent(targetTeacher)}`, 1500);
      if (apiData?.success && apiData.lessons) freshData = apiData;
    }

    // 4. Fallback на локальные JSON-файлы
    if (!freshData) {
      const allByTeacher = await safeFetchJson(`./data/schedules_all.json?v=${PWA_VERSION}`, 3000);
      if (allByTeacher && allByTeacher[targetTeacher]) {
        freshData = {
          success: true,
          teacher: targetTeacher,
          lessons: allByTeacher[targetTeacher],
          bells: state.bells,
          hasCurriculum: false,
        };
      } else {
        const singleSchedule = await safeFetchJson(`./data/schedule.json?v=${PWA_VERSION}`, 2000);
        if (singleSchedule?.lessons) {
          freshData = singleSchedule;
        }
      }
    }

    if (freshData?.lessons) {
      state.schedule = freshData;
      state.bells = freshData.bells || freshData.settings?.bellsSchedule || state.bells;
      try {
        localStorage.setItem('pwa_custom_schedule', JSON.stringify(freshData));
      } catch (e) {}
    }
  } catch (err) {
    console.warn('Использованы локальные данные расписания:', err);
  }

  updateHeaderStatus();
  if (typeof onScheduleLoaded === 'function') onScheduleLoaded();
}

export async function loadStudents(onStudentsLoaded) {
  try {
    let fresh = null;
    if (!isStaticHost) {
      const apiData = await safeFetchJson('./api/students', 1500);
      if (apiData?.success && apiData.studentsByGroup) fresh = apiData.studentsByGroup;
    }
    const [base, remote] = await Promise.all([
      Promise.resolve(null),
      fetchRemoteStudents(),
    ]);

    const merged = { ...(base || {}) };
    [remote, fresh, state.studentsByGroup].forEach((src) => {
      if (src) {
        Object.keys(src).forEach((g) => {
          if (Array.isArray(src[g]) && src[g].length > 0) merged[g] = src[g];
        });
      }
    });

    if (Array.isArray(state.journalEntries)) {
      state.journalEntries.forEach((e) => {
        if (e.group && e.attendance) {
          if (!merged[e.group]) merged[e.group] = [];
          Object.keys(e.attendance).forEach((n) => {
            const clean = n.trim();
            if (clean && !merged[e.group].includes(clean)) merged[e.group].push(clean);
          });
          merged[e.group].sort((a, b) => a.localeCompare(b, 'ru'));
        }
      });
    }

    state.studentsByGroup = merged;
    localStorage.setItem('pwa_custom_students', JSON.stringify(merged));
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
