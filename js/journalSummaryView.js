// ==========================================================================
// JOURNAL SUMMARY VIEW: GROUP STATS, SEMESTER GRADES & EXPORT (PDF/EXCEL)
// ==========================================================================
import { state } from './state.js';
import { formatScheduleDate, scheduleDate } from './scheduleDates.js';
import { scheduledReportEntries } from './scheduleArchive.js';
import { studentAttendance, normalizeStudentName, attendanceText, escapeHtml } from './attendanceUtils.js';
import { getStudentSubgroup } from './studentSubgroups.js';

import { countJournalTypes, journalReport, lessonType, solePracticeSubgroup,
  matchesJournalTeacher, normalizeGroup, normalizeSubgroup, uniqueGroupNames } from './lessonProgress.js';

const shortTypes = { theory: 'Л', practice: 'П', exam: 'Экз.' };

function reportForGroup(group) {
  const formGroup = document.getElementById('journalGroupSelect')?.value;
  const selected = normalizeGroup(formGroup) === normalizeGroup(group)
    ? normalizeSubgroup(document.getElementById('journalSubgroupSelect')?.value) : '';
  const subgroup = solePracticeSubgroup(state, group) || selected || null;
  return { ...journalReport(state, group, subgroup,
    document.getElementById('journalDateInput')?.value || undefined), subgroup };
}

function getGroupEntries(group) {
  const { entries, subgroup } = reportForGroup(group);
  const date = document.getElementById('journalDateInput')?.value || scheduleDate();
  return [...entries, ...scheduledReportEntries(state, group, subgroup, date, entries)]
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.lessonNumber) - Number(b.lessonNumber));
}

function getGroupStudents(group) {
  const key = normalizeGroup(group);
  const found = new Set();
  const { subgroup, entries } = reportForGroup(group);
  const roster = [...new Set(Object.entries(state.studentsByGroup)
    .filter(([name]) => normalizeGroup(name) === key)
    .flatMap(([, students]) => students))];
  const soleSubgroup = solePracticeSubgroup(state, group);
  roster.forEach((student, index) => {
    if (!subgroup || soleSubgroup === subgroup || String(getStudentSubgroup(group, student, index, roster.length)) === subgroup) {
      found.add(normalizeStudentName(student));
    }
  });
  entries.forEach((e) => {
    if (subgroup && normalizeSubgroup(e.subgroup) !== subgroup) return;
    const names = Object.keys(e.attendance || {});
    names.forEach(name => {
      const normalized = normalizeStudentName(name);
      const ambiguous = names.filter(value => normalizeStudentName(value) === normalized).length > 1;
      found.add(ambiguous ? name : normalized);
    });
  });
  return Array.from(found);
}

export function calculateStudentStats(student, entries) {
  let absentCount = 0;
  let excusedCount = 0;
  let presentCount = 0;
  const grades = [];

  entries.forEach((entry) => {
    const att = studentAttendance(entry, student);
    if (!att) return;
    if (att._alternatives?.status) { /* displayed as a conflict, not counted as certain */ }
    else if (att.status === 'absent') absentCount++;
    else if (att.status === 'excused') excusedCount++;
    else presentCount++;

    if (!att._alternatives?.grade && att.grade && !isNaN(Number(att.grade))) {
      grades.push(Number(att.grade));
    }
  });

  const avgGrade = grades.length > 0
    ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2)
    : null;

  return { absentCount, excusedCount, presentCount, grades, avgGrade };
}

function getAvgGradeClass(avg) {
  if (!avg) return 'avg-none';
  const num = Number(avg);
  if (num >= 4.5) return 'avg-excel';
  if (num >= 3.5) return 'avg-good';
  if (num >= 2.5) return 'avg-sat';
  return 'avg-bad';
}

export function renderSummaryTable(group) {
  const container = document.getElementById('summaryTableContainer');
  if (!container) return;

  const entries = getGroupEntries(group);
  const students = getGroupStudents(group);

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="summary-empty-state">
        <p class="text-sm font-semibold text-slate-300">В группе ${escapeHtml(group)} пока нет занятий за выбранный семестр</p>
      </div>`;
    return;
  }

  // Общая статистика
  let totalGradesCount = 0;
  let totalGradesSum = 0;
  let totalAbsences = 0;

  const rowsHtml = students.map((student, idx) => {
    const stats = calculateStudentStats(student, entries);
    if (stats.grades.length > 0) {
      totalGradesCount += stats.grades.length;
      totalGradesSum += stats.grades.reduce((a, b) => a + b, 0);
    }
    totalAbsences += stats.absentCount + stats.excusedCount;

    const cellsHtml = entries.map((entry) => {
      const att = studentAttendance(entry, student);
      if (!att) return `<td class="cell-mark cell-empty">—</td>`;
      const conflicts = att._alternatives && Object.keys(att._alternatives).length;
      const cls = conflicts ? 'cell-conflict' : att.status === 'absent' ? 'cell-absent'
        : att.status === 'excused' ? 'cell-excused' : att.grade ? 'cell-grade grade-' + escapeHtml(att.grade) : 'cell-present';
      return `<td class="cell-mark ${cls}" title="${escapeHtml(student)}: ${escapeHtml(att.comment || attendanceText(att))}">${escapeHtml(attendanceText(att))}${conflicts ? '<small>разные записи</small>' : ''}</td>`;
    }).join('');

    const avgBadge = stats.avgGrade
      ? `<span class="avg-score-badge ${getAvgGradeClass(stats.avgGrade)}">${stats.avgGrade}</span>`
      : `<span class="text-slate-500">—</span>`;

    return `
      <tr>
        <td class="cell-num">${idx + 1}</td>
        <td class="cell-name" title="${escapeHtml(student)}">${escapeHtml(student)}</td>
        ${cellsHtml}
        <td class="cell-stat text-rose-400 font-bold">${stats.absentCount || '0'}</td>
        <td class="cell-stat text-amber-400 font-medium">${stats.excusedCount || '0'}</td>
        <td class="cell-grades-list">${stats.grades.join(', ') || '—'}</td>
        <td class="cell-avg">${avgBadge}</td>
      </tr>
    `;
  }).join('');

  const program = reportForGroup(group).program;
  const counts = countJournalTypes(entries.filter(entry => !entry.scheduleOnly), program);
  const scheduledCount = entries.filter(entry => entry.scheduleOnly).length;

  // Заголовки дат занятий
  const dateHeaders = entries.map((e, idx) => {
    const d = e.date ? formatScheduleDate(e.date, false) : `Урок ${idx + 1}`;
    const typeShort = shortTypes[lessonType(e, program)] || '—';
    const subgLbl = e.subgroup ? ` (${e.subgroup})` : '';
    return `<th class="header-lesson" title="Пара №${idx + 1}${e.subgroup ? ` (подгр. ${e.subgroup})` : ''} (${e.date ? formatScheduleDate(e.date) : 'дата не указана'}): ${e.topic || 'Без темы'}">
      <div class="h-date">${d}</div>
      <div class="h-type">${typeShort}${subgLbl}${e.scheduleOnly ? ' · план' : ''}</div>
    </th>`;
  }).join('');

  // Подвал: пропуски по каждому занятию
  const footAbsents = entries.map((e) => {
    let abs = 0;
    Object.values(e.attendance || {}).forEach((a) => {
      if (!a._alternatives?.status && (a.status === 'absent' || a.status === 'excused')) abs++;
    });
    return `<td class="cell-foot-abs">${e.scheduleOnly ? '—' : abs}</td>`;
  }).join('');

  const groupAvg = totalGradesCount > 0 ? (totalGradesSum / totalGradesCount).toFixed(2) : '—';

  container.innerHTML = `
    <div class="summary-meta-bar">
      <div class="meta-item"><span>Занятий:</span> <b>${entries.length - scheduledCount}</b></div>
      ${scheduledCount ? `<div class="meta-item"><span>По расписанию без отметок:</span> <b>${scheduledCount}</b></div>` : ''}
      <div class="meta-item"><span>Лекций:</span> <b>${counts.theory}</b></div>
      <div class="meta-item"><span>Практик:</span> <b>${counts.practice}</b></div>
      <div class="meta-item"><span>Студентов:</span> <b>${students.length}</b></div>
      <div class="meta-item"><span>Всего пропусков:</span> <b>${totalAbsences}</b></div>
      <div class="meta-item"><span>Ср. балл группы:</span> <b class="text-blue-400">${groupAvg}</b></div>
    </div>
    <div class="summary-table-scroll">
      <table class="summary-table" id="summaryPrintTable">
        <thead>
          <tr>
            <th class="header-num">№</th>
            <th class="header-name">Студент</th>
            ${dateHeaders}
            <th class="header-stat" title="Пропуски неуважительные">Н</th>
            <th class="header-stat" title="Пропуски по уважительной">У</th>
            <th class="header-grades">Оценки</th>
            <th class="header-avg" title="Средняя семестровая оценка">Семестр.</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" class="foot-title">Итого отсутствовало:</td>
            ${footAbsents}
            <td colspan="4" class="foot-legend">Ср. балл: <b>${groupAvg}</b></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

export function openJournalSummary(group) {
  const modal = document.getElementById('journalSummaryModal');
  if (!modal) return;

  const currentTeacher = state.currentTeacher || 'Все преподаватели';
  const subEl = document.querySelector('.summary-header-sub');
  if (subEl) {
    const subj = state.schedule?.subject || 'Учебная дисциплина';
    subEl.textContent = `Преподаватель: ${currentTeacher} • ${subj}`;
  }

  const sel = document.getElementById('summaryGroupSelect');
  if (sel) {
    const groups = new Set();
    if (state.schedule?.lessons) {
      state.schedule.lessons.forEach((l) => {
        if (l.group && l.group !== '—') groups.add(l.group);
      });
    }
    (state.journalEntries || []).forEach((e) => {
      if (matchesJournalTeacher(e, currentTeacher) && e.group) groups.add(e.group);
    });
    if (groups.size === 0) {
      Object.keys(state.studentsByGroup || {}).forEach((g) => groups.add(g));
    }
    sel.innerHTML = '';
    const unique = uniqueGroupNames(groups);
    Array.from(unique.values()).sort().forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = `Группа ${g}`;
      if (g === group) opt.selected = true;
      sel.appendChild(opt);
    });
    const selectedGroup = unique.get(normalizeGroup(group));
    if (selectedGroup) sel.value = selectedGroup;
  }

  const currentGroup = sel?.value || group || '51ф';
  renderSummaryTable(currentGroup);
  modal.classList.remove('hidden');
}

export function refreshOpenJournalSummary() {
  const modal = document.getElementById('journalSummaryModal');
  const group = document.getElementById('summaryGroupSelect')?.value;
  if (modal && !modal.classList.contains('hidden') && group) renderSummaryTable(group);
}

export function closeJournalSummary() {
  document.getElementById('journalSummaryModal')?.classList.add('hidden');
}

export function printSummarySheet() {
  window.print();
}

export function exportSummaryToCsv(group) {
  const entries = getGroupEntries(group);
  const students = getGroupStudents(group);
  if (entries.length === 0 || students.length === 0) {
    alert('Нет данных для выгрузки');
    return;
  }

  const program = reportForGroup(group).program;
  const header = ['№', 'ФИО Студента'];
  entries.forEach((e, idx) => {
    header.push(`${e.date ? formatScheduleDate(e.date) : `Урок_${idx + 1}`} (${shortTypes[lessonType(e, program)] || '—'}${e.scheduleOnly ? ', план' : ''})`);
  });
  header.push('Пропусков (Н)', 'Уважительных (У)', 'Все оценки', 'Семестровая (Ср.балл)');

  const csvRows = [header.join(';')];

  students.forEach((student, idx) => {
    const stats = calculateStudentStats(student, entries);
    const row = [idx + 1, `"${student.replace(/"/g, '""')}"`];

    entries.forEach((e) => {
      const att = studentAttendance(e, student);
      if (!att) row.push('');
      else row.push(attendanceText(att));
    });

    row.push(stats.absentCount, stats.excusedCount, `"${stats.grades.join(', ')}"`, stats.avgGrade || '');
    csvRows.push(row.join(';'));
  });

  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute('href', url);
  link.setAttribute('download', `Vedomost_${group}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function setupSummaryListeners() {
  document.getElementById('summaryGroupSelect')?.addEventListener('change', (e) => {
    renderSummaryTable(e.target.value);
  });
  document.getElementById('closeSummaryModalBtn')?.addEventListener('click', closeJournalSummary);
  document.getElementById('printSummaryBtn')?.addEventListener('click', printSummarySheet);
  document.getElementById('exportCsvSummaryBtn')?.addEventListener('click', () => {
    const g = document.getElementById('summaryGroupSelect')?.value || 'group';
    exportSummaryToCsv(g);
  });
}
