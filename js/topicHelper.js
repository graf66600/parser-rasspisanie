// ==========================================================================
// TOPIC HELPER: AUTO-FILL & SUGGESTIONS FROM CURRICULUM
// ==========================================================================
import { state } from './state.js';

export function findProgramForGroup(group) {
  if (!group || !state.curriculumPrograms) return null;
  const clean = group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '');
  for (const prog of state.curriculumPrograms) {
    for (const g of prog.groups || []) {
      const gClean = g.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '');
      if (gClean === clean || clean.includes(gClean) || gClean.includes(clean)) {
        return prog;
      }
    }
  }
  return null;
}

export function getRecommendedLesson(group, bellLessonNum, date) {
  const prog = findProgramForGroup(group);
  if (!prog || !prog.lessons || prog.lessons.length === 0) {
    return { text: 'Практическое занятие', number: 1 };
  }

  // 1. Если для этой пары уже сохранена запись в журнале — загружаем её тему
  const targetDate = date || new Date().toISOString().split('T')[0];
  const bellNum = Number(bellLessonNum || 1);
  const existing = state.journalEntries.find(
    (e) => e.group === group && e.date === targetDate && Number(e.lessonNumber) === bellNum
  );
  if (existing && existing.topic) {
    return { text: existing.topic, number: bellNum };
  }

  // 2. Рассчитываем порядковый номер пары внутри текущего дня
  let orderInDay = 0;
  if (state.schedule?.lessons) {
    const dateObj = new Date(targetDate);
    const jsDay = dateObj.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    const groupLessonsToday = state.schedule.lessons
      .filter((l) => l.group === group && l.dayOfWeek === dayOfWeek)
      .sort((a, b) => a.lessonNumber - b.lessonNumber);

    const pos = groupLessonsToday.findIndex((l) => Number(l.lessonNumber) === bellNum);
    if (pos >= 0) {
      orderInDay = pos;
    }
  }

  // 3. Считаем, сколько занятий у этой группы уже было проведено ранее
  const pastEntries = state.journalEntries.filter(
    (e) => e.group === group && e.date < targetDate
  );
  const distinctPast = new Set(pastEntries.map((e) => `${e.date}_${e.lessonNumber}`)).size;

  const targetIndex = distinctPast + orderInDay;
  const lesson = prog.lessons[targetIndex] || prog.lessons[prog.lessons.length - 1] || prog.lessons[0];

  return {
    text: lesson.text || lesson.topic,
    number: lesson.number || targetIndex + 1,
    lessonObj: lesson,
    homework: lesson.homework || '',
    type: lesson.type || 'theory',
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
    const isTheory = lesson.type === 'theory' || (lesson.text && lesson.text.includes('Лекция'));
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
