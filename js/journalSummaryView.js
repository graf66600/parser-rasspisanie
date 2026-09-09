// ==========================================================================
// JOURNAL SUMMARY VIEW: GROUP STATS, SEMESTER GRADES & EXPORT (PDF/EXCEL)
// ==========================================================================
import { state } from './state.js';

function normalizeGroup(g) {
  return (g || '').toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').trim();
}

function getGroupEntries(group) {
  const clean = normalizeGroup(group);
  return (state.journalEntries || [])
    .filter((e) => normalizeGroup(e.group) === clean || clean.includes(normalizeGroup(e.group)))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return Number(a.lessonNumber) - Number(b.lessonNumber);
    });
}

function getGroupStudents(group) {
  const list = state.studentsByGroup[group] || [];
  if (list.length > 0) return [...list];

  // Если список не задан, соберем уникальных студентов из записей
  const entries = getGroupEntries(group);
  const found = new Set();
  entries.forEach((e) => {
    Object.keys(e.attendance || {}).forEach((s) => found.add(s));
  });
  return Array.from(found).sort();
}

export function calculateStudentStats(student, entries) {
  let absentCount = 0;
  let excusedCount = 0;
  let presentCount = 0;
  const grades = [];

  entries.forEach((entry) => {
    const att = entry.attendance?.[student];
    if (!att) return;
    if (att.status === 'absent') absentCount++;
    else if (att.status === 'excused') excusedCount++;
    else presentCount++;

    if (att.grade && !isNaN(Number(att.grade))) {
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
        <p class="text-sm font-semibold text-slate-300">В группе ${group} пока нет сохраненных занятий</p>
        <p class="text-xs text-slate-500 mt-1">Проведите и сохраните хотя бы одно занятие в журнале, чтобы сформировать ведомость.</p>
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
      const att = entry.attendance?.[student];
      if (!att) return `<td class="cell-mark cell-empty">—</td>`;
      if (att.status === 'absent') return `<td class="cell-mark cell-absent" title="${student}: Отсутствовал (Н)">Н</td>`;
      if (att.status === 'excused') return `<td class="cell-mark cell-excused" title="${student}: Уважительная причина (У)">У</td>`;
      if (att.grade) return `<td class="cell-mark cell-grade grade-${att.grade}" title="${student}: Оценка ${att.grade}">${att.grade}</td>`;
      return `<td class="cell-mark cell-present" title="${student}: Был">·</td>`;
    }).join('');

    const avgBadge = stats.avgGrade
      ? `<span class="avg-score-badge ${getAvgGradeClass(stats.avgGrade)}">${stats.avgGrade}</span>`
      : `<span class="text-slate-500">—</span>`;

    return `
      <tr>
        <td class="cell-num">${idx + 1}</td>
        <td class="cell-name" title="${student}">${student}</td>
        ${cellsHtml}
        <td class="cell-stat text-rose-400 font-bold">${stats.absentCount || '0'}</td>
        <td class="cell-stat text-amber-400 font-medium">${stats.excusedCount || '0'}</td>
        <td class="cell-grades-list">${stats.grades.join(', ') || '—'}</td>
        <td class="cell-avg">${avgBadge}</td>
      </tr>
    `;
  }).join('');

  // Заголовки дат занятий
  const dateHeaders = entries.map((e, idx) => {
    const d = e.date ? e.date.slice(5).replace('-', '.') : `Урок ${idx + 1}`;
    const typeShort = (e.type === 'practice' || (e.topic || '').toLowerCase().includes('практик')) ? 'П' : 'Л';
    return `<th class="header-lesson" title="Пара №${idx + 1} (${e.dateFormatted || e.date}): ${e.topic || 'Без темы'}">
      <div class="h-date">${d}</div>
      <div class="h-type">${typeShort}</div>
    </th>`;
  }).join('');

  // Подвал: пропуски по каждому занятию
  const footAbsents = entries.map((e) => {
    let abs = 0;
    Object.values(e.attendance || {}).forEach((a) => {
      if (a.status === 'absent' || a.status === 'excused') abs++;
    });
    return `<td class="cell-foot-abs">${abs}</td>`;
  }).join('');

  const groupAvg = totalGradesCount > 0 ? (totalGradesSum / totalGradesCount).toFixed(2) : '—';

  container.innerHTML = `
    <div class="summary-meta-bar">
      <div class="meta-item"><span>Занятий:</span> <b>${entries.length}</b></div>
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

  const sel = document.getElementById('summaryGroupSelect');
  if (sel) {
    // Обновим список групп в селекторе
    const groups = new Set();
    Object.keys(state.studentsByGroup || {}).forEach((g) => groups.add(g));
    (state.journalEntries || []).forEach((e) => { if (e.group) groups.add(e.group); });
    sel.innerHTML = '';
    Array.from(groups).sort().forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = `Группа ${g}`;
      if (g === group) opt.selected = true;
      sel.appendChild(opt);
    });
    if (group) sel.value = group;
  }

  const currentGroup = sel?.value || group || '51ф';
  renderSummaryTable(currentGroup);
  modal.classList.remove('hidden');
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

  const header = ['№', 'ФИО Студента'];
  entries.forEach((e, idx) => {
    header.push(`${e.date || `Урок_${idx + 1}`} (${e.type === 'practice' ? 'Пр' : 'Лек'})`);
  });
  header.push('Пропусков (Н)', 'Уважительных (У)', 'Все оценки', 'Семестровая (Ср.балл)');

  const csvRows = [header.join(';')];

  students.forEach((student, idx) => {
    const stats = calculateStudentStats(student, entries);
    const row = [idx + 1, `"${student}"`];

    entries.forEach((e) => {
      const att = e.attendance?.[student];
      if (!att) row.push('');
      else if (att.status === 'absent') row.push('Н');
      else if (att.status === 'excused') row.push('У');
      else if (att.grade) row.push(att.grade);
      else row.push('+');
    });

    row.push(stats.absentCount);
    row.push(stats.excusedCount);
    row.push(`"${stats.grades.join(', ')}"`);
    row.push(stats.avgGrade || '');
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
