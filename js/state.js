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

export async function loadSchedule(onScheduleLoaded) {
  try {
    const cached = localStorage.getItem('pwa_custom_schedule');
    if (cached) {
      const parsed = JSON.parse(cached);
      let target = parsed;
      if (Array.isArray(parsed)) {
        target = parsed.find((s) => s.userId === 1 && s.lessons?.length) || parsed[0];
      }
      if (target && target.lessons && target.lessons.length > 0) {
        state.schedule = target;
        state.bells = target.bells || target.settings?.bellsSchedule || state.bells;
        updateHeaderStatus();
        if (typeof onScheduleLoaded === 'function') onScheduleLoaded();
      }
    }

    let freshData = null;
    const res = await fetch('./api/schedule').catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (data.success && data.lessons) freshData = data;
    }

    if (!freshData) {
      const staticRes = await fetch('./data/schedule.json').catch(() => null);
      if (staticRes && staticRes.ok) {
        freshData = await staticRes.json();
      } else {
        const multiRes = await fetch('./data/schedules.json').catch(() => null);
        if (multiRes && multiRes.ok) {
          const multi = await multiRes.json();
          if (Array.isArray(multi)) {
            freshData = multi.find((s) => s.userId === 1 && s.lessons?.length) || multi[0];
          } else {
            freshData = multi;
          }
        }
      }
    }

    if (freshData) {
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
    const cached = localStorage.getItem('pwa_custom_students');
    if (cached) {
      state.studentsByGroup = JSON.parse(cached);
      if (typeof onStudentsLoaded === 'function') onStudentsLoaded();
    }

    const res = await fetch('./api/students').catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (data.success && data.studentsByGroup) {
        state.studentsByGroup = data.studentsByGroup;
        localStorage.setItem('pwa_custom_students', JSON.stringify(data.studentsByGroup));
      }
    } else if (Object.keys(state.studentsByGroup).length === 0) {
      const staticRes = await fetch('./data/students.json');
      const staticData = await staticRes.json();
      state.studentsByGroup = staticData;
      localStorage.setItem('pwa_custom_students', JSON.stringify(staticData));
    }
  } catch (err) {
    console.warn('Использованы локальные студенты:', err);
  }

  if (typeof onStudentsLoaded === 'function') onStudentsLoaded();
}

export async function loadCurriculum(onCurriculumLoaded) {
  try {
    const cached = localStorage.getItem('pwa_custom_curriculum');
    if (cached) {
      state.curriculumPrograms = JSON.parse(cached);
      if (typeof onCurriculumLoaded === 'function') onCurriculumLoaded();
    }

    const res = await fetch('./api/curriculum').catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (data.success && data.programs) {
        state.curriculumPrograms = data.programs;
        localStorage.setItem('pwa_custom_curriculum', JSON.stringify(data.programs));
      }
    } else {
      const staticRes = await fetch('./data/curriculum.json').catch(() => null);
      if (staticRes && staticRes.ok) {
        const staticData = await staticRes.json();
        state.curriculumPrograms = staticData;
        localStorage.setItem('pwa_custom_curriculum', JSON.stringify(staticData));
      }
    }
  } catch (err) {
    console.warn('Ошибка загрузки КТП:', err);
  }

  if (typeof onCurriculumLoaded === 'function') onCurriculumLoaded();
}
