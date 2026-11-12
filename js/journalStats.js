import { teacherLoad, semesterForDate } from './teachingLoad.js';
import { state } from './state.js';
import { findProgramForGroup } from './topicHelper.js';
import { normalizeGroup, normalizeSubgroup, scopedEntries, uniqueEntries,
  lessonType, programMatchesSubject, journalGroupEntries, countJournalTypes } from './lessonProgress.js';

export function calculateGroupStats(group, subgroup = '', date = new Date().toLocaleDateString('sv-SE')) {
  const semester = semesterForDate(date);
  const load = teacherLoad(state.currentTeacher, group, semester);
  const year = Number(date.slice(0, 4));
  const start = semester === 1 ? `${year}-09-01` : `${year}-01-01`;
  const end = semester === 1 ? `${year}-12-31` : `${year}-08-31`;
  const subject = state.schedule?.lessons?.find(l => normalizeGroup(l.group) === normalizeGroup(group))?.subject || state.schedule?.subject;
  const candidate = findProgramForGroup(group);
  const prog = programMatchesSubject(candidate, subject) ? candidate : null;
  const practiceOnly = load?.theoryHours === 0;
  const entries = uniqueEntries(scopedEntries(state, group, subject)).filter(e => {
    if (e.date < start || e.date > end) return false;
    const type = lessonType(e, prog);
    if (practiceOnly && type !== 'practice') return false;
    return normalizeSubgroup(e.subgroup) === normalizeSubgroup(subgroup)
      || (!practiceOnly && type === 'theory' && !normalizeSubgroup(e.subgroup));
  });
  const lessons = (prog?.lessons || []).filter(l => !practiceOnly || l.type === 'practice');
  const theoryTotal = load ? load.theoryHours / 2 : lessons.filter(l => l.type === 'theory').length;
  const practiceTotal = load ? load.practiceHours / 2 : lessons.filter(l => l.type === 'practice').length;
  const theoryConducted = entries.filter(e => lessonType(e, prog) === 'theory').length;
  const practiceConducted = entries.filter(e => lessonType(e, prog) === 'practice').length;
  const totalLessons = theoryTotal + practiceTotal;
  const totalConducted = theoryConducted + practiceConducted;
  const theoryLeft = Math.max(0, theoryTotal - theoryConducted);
  const practiceLeft = Math.max(0, practiceTotal - practiceConducted);
  return { group, subgroup, load, semester, topicsVerified: prog?.topicsVerified, programTitle: prog?.title || 'Учебная дисциплина',
    totalLessons, totalConducted, totalLeft: theoryLeft + practiceLeft,
    theoryTotal, practiceTotal, theoryConducted, practiceConducted, theoryLeft, practiceLeft,
    percent: totalLessons ? Math.min(100, Math.round(totalConducted / totalLessons * 100)) : 0,
    unknown: entries.length - totalConducted,
  };
}

export function renderJournalStats(group) {
  const container = document.getElementById('journalStatsWidget');
  if (!container) return;

  if (!group) {
    const gSel = document.getElementById('journalGroupSelect');
    group = gSel?.value || '51ф';
  }

  const selected = document.getElementById('journalSubgroupSelect')?.value;
  const subgroups = new Set([
    ...(state.schedule?.lessons || []).filter(l => normalizeGroup(l.group) === normalizeGroup(group)).map(l => normalizeSubgroup(l.subgroup)),
    ...scopedEntries(state, group).map(e => normalizeSubgroup(e.subgroup)),
  ].filter(Boolean));
  const scopes = selected && selected !== 'all' ? [selected] : subgroups.size ? [...subgroups].sort() : [''];
  const entries = journalGroupEntries(state, group);
  const counts = countJournalTypes(entries, findProgramForGroup(group));
  const other = counts.other ? ` · Другие записи: ${counts.other}` : '';
  container.innerHTML = `<div class="stats-card">Сводная по группе · Записей: ${entries.length} · Лекций: ${counts.theory} · Практик: ${counts.practice}${other}</div>`
    + scopes.map(sub => renderStatsContent(group, sub)).join('');
}

function renderStatsContent(group, subgroup) {
  const currentTeacher = state.currentTeacher || '';
  const stats = calculateGroupStats(group, subgroup, document.getElementById('journalDateInput')?.value || undefined);

  if (!stats.totalLessons) {
    const foundLesson = state.schedule?.lessons?.find((l) => l.group === group);
    const subjName = foundLesson?.subject || 'Учебная дисциплина';
    return `
      <div class="stats-card">
        <div class="stats-header">
          <div class="stats-title-box">
            <span class="stats-icon-badge">📊</span>
            <div class="stats-title-text-wrap">
              <h3 class="stats-main-title">Журнал: Гр. ${stats.group}${subgroup ? ` • ${subgroup} п/г` : ''}</h3>
              <p class="stats-sub-title">${subjName} • ${currentTeacher}</p>
            </div>
          </div>
          <span class="stats-total-pill">Записано: ${stats.totalConducted} пар</span>
        </div>
        <div class="stats-grid">
          <div class="stat-chip stat-chip-theory">
            <div class="stat-chip-label">
              <span>📖</span> <b>Лекции</b>
            </div>
            <div class="stat-chip-values">
              <span class="stat-chip-done">${stats.theoryConducted}</span>
            </div>
          </div>
          <div class="stat-chip stat-chip-practice">
            <div class="stat-chip-label">
              <span>💻</span> <b>Практики</b>
            </div>
            <div class="stat-chip-values">
              <span class="stat-chip-done">${stats.practiceConducted}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="stats-card">
      <div class="stats-header">
        <div class="stats-title-box">
          <span class="stats-icon-badge">📊</span>
          <div class="stats-title-text-wrap">
            <h3 class="stats-main-title">Учёт занятий: Гр. ${stats.group}${subgroup ? ` • ${subgroup} п/г` : ''}</h3>
            <p class="stats-sub-title">${stats.programTitle} • ${stats.load ? `${stats.semester} семестр • План по ведомости нагрузки. Нагрузка преподавателя: ${stats.load.teacherHours} акад. ч.; практика: ${stats.load.practiceHours} ч. × ${stats.load.practiceMultiplier}.` : 'План нагрузки не подтверждён; оценка по списку тем.'} 1 пара = 2 акад. ч. ${stats.topicsVerified ? 'Темы сверены с рабочей программой.' : 'Список тем требует сверки с КТП.'} Журнал может быть неполным.${stats.unknown ? ` Не определён тип у ${stats.unknown} записей.` : ''}</p>
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
          <div class="stat-chip-left">Не отражено в журнале: <b>${stats.theoryLeft}</b> (${stats.theoryLeft * 2}ч)</div>
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
          <div class="stat-chip-left">Не отражено в журнале: <b>${stats.practiceLeft}</b> (${stats.practiceLeft * 2}ч)</div>
        </div>
      </div>

      <div class="stats-progress-box">
        <div class="stats-progress-labels">
          <span class="stats-progress-text">В журнале: <b>${stats.totalConducted} из ${stats.totalLessons} пар</b></span>
          <span class="stats-progress-pct">${stats.percent}%</span>
        </div>
        <div class="stats-progress-track">
          <div class="stats-progress-fill" style="width: ${stats.percent}%;"></div>
        </div>
      </div>
    </div>
  `;
}
