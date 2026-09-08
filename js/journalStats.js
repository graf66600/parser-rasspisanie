// ==========================================================================
// JOURNAL STATS: PROGRESS, LECTURES & PRACTICES COUNTERS
// ==========================================================================
import { state } from './state.js';
import { findProgramForGroup } from './topicHelper.js';

export function calculateGroupStats(group) {
  const prog = findProgramForGroup(group);
  const entries = (state.journalEntries || []).filter((e) => {
    if (!e.group || !group) return false;
    const cleanG = group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '');
    const cleanEG = e.group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '');
    return cleanEG === cleanG || cleanEG.includes(cleanG) || cleanG.includes(cleanEG);
  });

  const totalLessons = prog?.lessons?.length || 0;
  let theoryTotal = 0;
  let practiceTotal = 0;

  if (prog?.lessons) {
    prog.lessons.forEach((l) => {
      const isTheory = l.type === 'theory' || (l.text && (l.text.toLowerCase().includes('лекци') || l.text.toLowerCase().includes('теори')));
      if (isTheory) theoryTotal++;
      else practiceTotal++;
    });
  }

  let theoryConducted = 0;
  let practiceConducted = 0;

  entries.forEach((e) => {
    if (e.type === 'theory') {
      theoryConducted++;
      return;
    }
    if (e.type === 'practice') {
      practiceConducted++;
      return;
    }

    if (prog?.lessons) {
      const matched = prog.lessons.find((l) => l.text === e.topic || l.topic === e.topic);
      if (matched) {
        if (matched.type === 'theory') theoryConducted++;
        else practiceConducted++;
        return;
      }
      if (e.courseLessonNumber && prog.lessons[e.courseLessonNumber - 1]) {
        if (prog.lessons[e.courseLessonNumber - 1].type === 'theory') theoryConducted++;
        else practiceConducted++;
        return;
      }
    }

    const lowerTopic = (e.topic || '').toLowerCase();
    const isTheory = lowerTopic.includes('лекци') || lowerTopic.includes('теори');
    if (isTheory) theoryConducted++;
    else practiceConducted++;
  });

  const totalConducted = entries.length;
  const theoryLeft = Math.max(0, theoryTotal - theoryConducted);
  const practiceLeft = Math.max(0, practiceTotal - practiceConducted);
  const totalLeft = Math.max(0, totalLessons - totalConducted);
  const percent = totalLessons > 0 ? Math.min(100, Math.round((totalConducted / totalLessons) * 100)) : 0;

  return {
    group,
    programTitle: prog?.title || 'Учебная дисциплина',
    totalLessons,
    totalConducted,
    totalLeft,
    theoryTotal,
    theoryConducted,
    theoryLeft,
    practiceTotal,
    practiceConducted,
    practiceLeft,
    percent,
  };
}

export function renderJournalStats(group) {
  const container = document.getElementById('journalStatsWidget');
  if (!container) return;

  if (!group) {
    const gSel = document.getElementById('journalGroupSelect');
    group = gSel?.value || '51ф';
  }

  const stats = calculateGroupStats(group);

  container.innerHTML = `
    <div class="stats-card">
      <div class="stats-header">
        <div class="stats-title-box">
          <span class="stats-icon-badge">📊</span>
          <div class="stats-title-text-wrap">
            <h3 class="stats-main-title">Прогресс по программе: Гр. ${stats.group}</h3>
            <p class="stats-sub-title">${stats.programTitle}</p>
          </div>
        </div>
        <span class="stats-total-pill">${stats.totalLessons} пар (${stats.totalLessons * 2}ч)</span>
      </div>

      <div class="stats-grid">
        <div class="stat-chip stat-chip-theory">
          <div class="stat-chip-label">
            <span>📖</span> <b>Лекции</b>
          </div>
          <div class="stat-chip-values">
            <span class="stat-chip-done">${stats.theoryConducted}</span>
            <span class="stat-chip-divider">/</span>
            <span class="stat-chip-total">${stats.theoryTotal} пар</span>
          </div>
          <div class="stat-chip-left">Осталось: <b>${stats.theoryLeft}</b> (${stats.theoryLeft * 2}ч)</div>
        </div>

        <div class="stat-chip stat-chip-practice">
          <div class="stat-chip-label">
            <span>💻</span> <b>Практики</b>
          </div>
          <div class="stat-chip-values">
            <span class="stat-chip-done">${stats.practiceConducted}</span>
            <span class="stat-chip-divider">/</span>
            <span class="stat-chip-total">${stats.practiceTotal} пар</span>
          </div>
          <div class="stat-chip-left">Осталось: <b>${stats.practiceLeft}</b> (${stats.practiceLeft * 2}ч)</div>
        </div>
      </div>

      <div class="stats-progress-box">
        <div class="stats-progress-labels">
          <span class="stats-progress-text">Выполнено: <b>${stats.totalConducted} из ${stats.totalLessons} пар</b></span>
          <span class="stats-progress-pct">${stats.percent}%</span>
        </div>
        <div class="stats-progress-track">
          <div class="stats-progress-fill" style="width: ${stats.percent}%;"></div>
        </div>
      </div>
    </div>
  `;
}
