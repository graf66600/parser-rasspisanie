import { teacherLoad, semesterForDate } from './teachingLoad.js';
import { state, formatLocalDate } from './state.js';
import { recommendLesson, findProgram } from './lessonProgress.js';

export function findProgramForGroup(group) {
  return findProgram(state.curriculumPrograms, group);
}

export function getRecommendedLesson(group, bellLessonNum, date, context = {}) {
  let scheduleOverrides = {};
  try { scheduleOverrides = JSON.parse(localStorage.getItem('pwa_schedule_overrides') || '{}'); } catch {}
  return recommendLesson({ ...state, scheduleOverrides }, group, bellLessonNum, date || formatLocalDate(), context);
}

function suggestedLessons(group) {
  const prog = findProgramForGroup(group);
  const date = document.getElementById('journalDateInput')?.value || formatLocalDate();
  const load = teacherLoad(state.currentTeacher, group, semesterForDate(date));
  const counters = {};
  return (prog?.lessons || []).map(l => ({ ...l, number: (counters[l.type] = (counters[l.type] || 0) + 1) }))
    .filter(l => !load || (l.type === 'theory' ? load.theoryHours > 0 : l.type === 'practice' && load.practiceHours > 0));
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

  suggestedLessons(group).forEach((l, idx) => {
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
  title.innerHTML = `<span>📚 ${prog.topicsVerified ? 'Темы из рабочей программы' : 'Список тем (нужна сверка порядка с КТП)'}:</span>`;
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
