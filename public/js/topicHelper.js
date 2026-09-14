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

  // 1. Если для этой пары уже сохранена запись в журнале — загружаем её тему
  const existing = state.journalEntries?.find((e) => {
    if (!e.group || !e.date || Number(e.lessonNumber) !== bellNum) return false;
    const eg = e.group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
    return eg === cleanG && e.date === targetDate;
  });

  if (existing && existing.topic) {
    // Если на 14.09 для 51ф была ошибочно записана старая лекция №1/№2 — игнорируем устаревшую тему
    const isOldWrongLectureOn14 = targetDate === '2026-09-14' && cleanG === '51ф' &&
      (existing.topic.includes('Цифровизация') || existing.topic.includes('Электронная'));

    if (!isOldWrongLectureOn14) {
      let existingType = existing.type;
      if (targetDate < '2026-09-14') {
        existingType = 'theory';
      } else if (!existingType) {
        const lower = existing.topic.toLowerCase();
        existingType = lower.includes('лекци') || lower.includes('теори') ? 'theory' : 'practice';
      }
      return {
        text: existing.topic,
        number: existing.courseLessonNumber || bellNum,
        homework: existing.notes || '',
        type: existingType,
      };
    }
  }

  // 2. Считаем, сколько занятий у этой группы уже сохранено в журнале до этой даты
  const pastEntries = (state.journalEntries || []).filter((e) => {
    if (!e.group || !cleanG) return false;
    const cleanEG = e.group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
    const match = cleanEG === cleanG || cleanEG.includes(cleanG) || cleanG.includes(cleanEG);
    return match && e.date < targetDate;
  });
  const distinctPast = new Set(pastEntries.map((e) => `${e.date}_${e.lessonNumber}`)).size;

  // 3. Определяем хронологический номер пары в расписании (недельном)
  let priorToday = 0;
  let scheduleIndex = 0;
  if (state.schedule?.lessons?.length) {
    const [y, m, d] = targetDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const jsDay = dateObj.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    // Все пары группы в расписании, отсортированные по дням недели и времени
    const groupWeeklyLessons = state.schedule.lessons
      .filter((l) => {
        if (!l.group) return false;
        const lg = l.group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
        return lg === cleanG || lg.includes(cleanG) || cleanG.includes(lg);
      })
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.lessonNumber - b.lessonNumber);

    priorToday = groupWeeklyLessons.filter(
      (l) => l.dayOfWeek === dayOfWeek && Number(l.lessonNumber) < bellNum
    ).length;

    const posInWeek = groupWeeklyLessons.findIndex(
      (l) => l.dayOfWeek === dayOfWeek && Number(l.lessonNumber) === bellNum
    );

    if (posInWeek >= 0) {
      scheduleIndex = posInWeek;
    } else {
      const priorDays = groupWeeklyLessons.filter((l) => l.dayOfWeek < dayOfWeek).length;
      scheduleIndex = priorDays + priorToday;
    }
  }

  // До 14.09.2026 практических занятий не было (проводились только лекции)
  const isBeforePractices = targetDate < '2026-09-14';
  const baseCompletedBeforeWeek3 = (cleanG === '51ф') ? 5 : (cleanG.includes('31фм') ? 3 : 0);
  const effectivePast = isBeforePractices ? distinctPast : Math.max(distinctPast, baseCompletedBeforeWeek3);

  const targetIndex = effectivePast > 0 ? (effectivePast + priorToday) : scheduleIndex;
  const validIndex = targetIndex % prog.lessons.length;
  const lesson = prog.lessons[validIndex] || prog.lessons[0];
  const lessonType = isBeforePractices ? 'theory' : (lesson.type || 'theory');

  return {
    text: lesson.text || lesson.topic,
    number: lesson.number || validIndex + 1,
    lessonObj: lesson,
    homework: lesson.homework || '',
    type: lessonType,
  };
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
