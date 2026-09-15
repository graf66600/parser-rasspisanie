// ==========================================================================
// TOPIC HELPER: AUTO-FILL & SUGGESTIONS FROM CURRICULUM
// ==========================================================================
import { state, formatLocalDate } from './state.js';

export function findProgramForGroup(group) {
  if (!group || !state.curriculumPrograms) return null;
  const clean = group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');

  // 1. Точное совпадение (например, '21фм' должно найти именно '21фм', а не '21ф')
  for (const prog of state.curriculumPrograms) {
    for (const g of prog.groups || []) {
      const gClean = g.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
      if (gClean === clean) return prog;
    }
  }

  // 2. Нестрогое совпадение (например, '11м/с' -> '11мс')
  for (const prog of state.curriculumPrograms) {
    for (const g of prog.groups || []) {
      const gClean = g.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
      if (clean.includes(gClean) || gClean.includes(clean)) {
        return prog;
      }
    }
  }
  return null;
}

export function getRecommendedLesson(group, bellLessonNum, date) {
  const prog = findProgramForGroup(group);
  if (!prog || !prog.lessons || prog.lessons.length === 0) {
    return { text: 'Практическое занятие', number: 1, type: 'practice' };
  }

  const targetDate = date || formatLocalDate();
  const bellNum = Number(bellLessonNum || 1);
  const cleanG = (group || '').toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');

  // Точный календарный план занятий для группы 51ф на неделю 14.09 - 19.09.2026:
  // До 14.09 прошло 5 лекций (08.09 - 11.09).
  // Лекции (вся группа): Пн пара 3 (№6), Вт пары 2 и 4 (№7, №8), Ср пары 1 и 2 (№9, №10).
  // Практики (1 подгр): Пн пары 4 и 5 (№1, №2), Пт пары 5 и 6 (№3, №4).
  // Практики (2 подгр): Вт пары 5 и 6 (№1, №2), Чт пары 5 и 6 (№3, №4).
  if (cleanG === '51ф') {
    const planMap = {
      '2026-09-14_3': { type: 'theory', num: 6 },
      '2026-09-14_4': { type: 'practice', num: 1 },
      '2026-09-14_5': { type: 'practice', num: 2 },
      '2026-09-15_2': { type: 'theory', num: 7 },
      '2026-09-15_4': { type: 'theory', num: 8 },
      '2026-09-15_5': { type: 'practice', num: 1 },
      '2026-09-15_6': { type: 'practice', num: 2 },
      '2026-09-16_1': { type: 'theory', num: 9 },
      '2026-09-16_2': { type: 'theory', num: 10 },
      '2026-09-17_5': { type: 'practice', num: 3 },
      '2026-09-17_6': { type: 'practice', num: 4 },
      '2026-09-18_5': { type: 'practice', num: 3 },
      '2026-09-18_6': { type: 'practice', num: 4 },
    };
    const key = `${targetDate}_${bellNum}`;
    const plan = planMap[key];
    if (plan) {
      const collection = prog.lessons.filter((x) => x.type === plan.type);
      const l = collection[plan.num - 1] || prog.lessons[0];
      return {
        text: l.text || l.topic,
        number: plan.num,
        lessonObj: l,
        homework: l.homework || '',
        type: plan.type,
      };
    }
  }

  // 1. Если для этой пары уже сохранена запись в журнале — загружаем её тему
  const existing = state.journalEntries?.find((e) => {
    if (!e.group || !e.date || Number(e.lessonNumber) !== bellNum) return false;
    const eg = e.group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
    return eg === cleanG && e.date === targetDate;
  });

  if (existing && existing.topic) {
    let existingType = existing.type;
    if (targetDate < '2026-09-14') {
      existingType = 'theory';
    } else if (!existingType) {
      const lower = existing.topic.toLowerCase();
      existingType = lower.includes('лекци') || lower.includes('теори') ? 'theory' : 'practice';
    }

    let num = existing.courseLessonNumber;
    if (!num) {
      const pMatch = existing.topic.match(/№\s*(\d+)/i);
      num = pMatch ? parseInt(pMatch[1], 10) : bellNum;
    }

    return {
      text: existing.topic,
      number: num,
      homework: existing.notes || '',
      type: existingType,
    };
  }

  // 2. Ищем текущую пару в расписании для определения подгруппы и типа (лекция / практика)
  const [y, m, d] = targetDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const jsDay = dateObj.getDay();
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;

  const currentScheduleLesson = state.schedule?.lessons?.find((l) => {
    if (!l.group) return false;
    const lg = l.group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
    const matchG = lg === cleanG || lg.includes(cleanG) || cleanG.includes(lg);
    return matchG && l.dayOfWeek === dayOfWeek && Number(l.lessonNumber) === bellNum;
  });

  const subgroup = currentScheduleLesson?.subgroup;
  const isBeforePractices = targetDate < '2026-09-14';
  const isPractice = !isBeforePractices && Boolean(subgroup);

  const theories = prog.lessons.filter((x) => x.type === 'theory');
  const practices = prog.lessons.filter((x) => x.type === 'practice');

  if (!isPractice) {
    // --- ЛЕКЦИЯ (вся группа) ---
    const pastTheoriesInJournal = (state.journalEntries || []).filter((e) => {
      if (!e.group) return false;
      const eg = e.group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
      if (eg !== cleanG && !eg.includes(cleanG) && !cleanG.includes(eg)) return false;
      if (e.date >= targetDate) return false;
      return e.type === 'theory' || e.date < '2026-09-14' || (e.topic && !e.topic.toLowerCase().includes('практич'));
    });
    const pastTheoriesCount = new Set(pastTheoriesInJournal.map((e) => `${e.date}_${e.lessonNumber}`)).size;
    const baseBeforeWeek3 = (cleanG === '51ф') ? 5 : (cleanG.includes('31фм') ? 3 : 0);

    const priorDaysInSchedule = (state.schedule?.lessons || []).filter((l) => {
      if (!l.group) return false;
      const lg = l.group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
      return (lg === cleanG || lg.includes(cleanG) || cleanG.includes(lg)) && l.dayOfWeek < dayOfWeek && !l.subgroup;
    }).length;

    const priorToday = (state.schedule?.lessons || []).filter((l) => {
      if (!l.group) return false;
      const lg = l.group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
      return (lg === cleanG || lg.includes(cleanG) || cleanG.includes(lg)) && l.dayOfWeek === dayOfWeek && !l.subgroup && Number(l.lessonNumber) < bellNum;
    }).length;

    const totalPast = Math.max(pastTheoriesCount, (isBeforePractices ? pastTheoriesCount : baseBeforeWeek3) + priorDaysInSchedule) + priorToday;
    const validIdx = theories.length > 0 ? totalPast % theories.length : 0;
    const l = theories[validIdx] || prog.lessons[0];
    return {
      text: l.text || l.topic,
      number: validIdx + 1,
      lessonObj: l,
      homework: l.homework || '',
      type: 'theory',
    };
  } else {
    // --- ПРАКТИКА (по подгруппе) ---
    const pastPracticesInJournal = (state.journalEntries || []).filter((e) => {
      if (!e.group) return false;
      const eg = e.group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
      if (eg !== cleanG && !eg.includes(cleanG) && !cleanG.includes(eg)) return false;
      if (e.date >= targetDate) return false;
      const eSub = e.subgroup || (e.notes && e.notes.includes('1') ? '1' : (e.notes && e.notes.includes('2') ? '2' : undefined));
      if (subgroup && eSub && eSub !== subgroup) return false;
      return e.type === 'practice' || (e.topic && e.topic.toLowerCase().includes('практич'));
    });
    const pastPracticesCount = new Set(pastPracticesInJournal.map((e) => `${e.date}_${e.lessonNumber}`)).size;

    const priorDaysInSchedule = (state.schedule?.lessons || []).filter((l) => {
      if (!l.group) return false;
      const lg = l.group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
      return (lg === cleanG || lg.includes(cleanG) || cleanG.includes(lg)) && l.dayOfWeek < dayOfWeek && l.subgroup === subgroup;
    }).length;

    const priorToday = (state.schedule?.lessons || []).filter((l) => {
      if (!l.group) return false;
      const lg = l.group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
      return (lg === cleanG || lg.includes(cleanG) || cleanG.includes(lg)) && l.dayOfWeek === dayOfWeek && l.subgroup === subgroup && Number(l.lessonNumber) < bellNum;
    }).length;

    const totalPast = Math.max(pastPracticesCount, priorDaysInSchedule) + priorToday;
    const validIdx = practices.length > 0 ? totalPast % practices.length : 0;
    const l = practices[validIdx] || prog.lessons[0];
    let pNum = validIdx + 1;
    if (l.text) {
      const pMatch = l.text.match(/№\s*(\d+)/i);
      if (pMatch) pNum = parseInt(pMatch[1], 10);
    }
    return {
      text: l.text || l.topic,
      number: pNum,
      lessonObj: l,
      homework: l.homework || '',
      type: 'practice',
    };
  }
}

export function updateTopicDatalist(group) {
  let datalist = document.getElementById('topicsDatalist');
  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = 'topicsDatalist';
    document.body.appendChild(datalist);
  }

  const topicInput = document.getElementById('journalTopicInput');
  if (topicInput && !topicInput.getAttribute('list')) {
    topicInput.setAttribute('list', 'topicsDatalist');
  }

  datalist.innerHTML = '';
  const prog = findProgramForGroup(group);
  if (!prog || !prog.lessons) return;

  prog.lessons.forEach((l, idx) => {
    const opt = document.createElement('option');
    opt.value = l.text || l.topic;
    opt.label = `#${l.number || idx + 1} (${l.type === 'theory' ? 'Лекция' : 'Практика'})`;
    datalist.appendChild(opt);
  });
}

export function renderTopicSuggestions(group, onSelect) {
  const container = document.getElementById('topicSuggestions');
  if (!container) return;

  const prog = findProgramForGroup(group);
  if (!prog || !prog.lessons || prog.lessons.length === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'topic-suggestions-header';
  title.innerHTML = `<span>📚 Темы рабочей программы (${prog.lessons.length} занятий):</span>`;
  container.appendChild(title);

  const scrollBox = document.createElement('div');
  scrollBox.className = 'topic-chips-wrapper';

  prog.lessons.forEach((lesson, idx) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'topic-chip-btn';
    const num = lesson.number || idx + 1;
    const isTheory = lesson.type === 'theory' || (lesson.text && (lesson.text.toLowerCase().includes('лекци') || lesson.text.toLowerCase().includes('теори')));
    chip.innerHTML = `
      <span class="topic-chip-num ${isTheory ? 'chip-theory' : 'chip-practice'}">#${num}</span>
      <span class="topic-chip-text">${lesson.text || lesson.topic}</span>
    `;
    chip.addEventListener('click', () => {
      if (typeof onSelect === 'function') {
        onSelect(lesson.text || lesson.topic, lesson.homework, num, lesson.type);
      }
      container.classList.add('hidden');
    });
    scrollBox.appendChild(chip);
  });

  container.appendChild(scrollBox);
}
