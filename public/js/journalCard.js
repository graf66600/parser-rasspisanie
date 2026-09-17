// ==========================================================================
// JOURNAL CARD: RENDER INDIVIDUAL LESSON RECORD IN HISTORY
// ==========================================================================

export function formatShortName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

export function createHistoryCardElement(entry, { onDelete, onEdit }) {
  const card = document.createElement('div');
  card.className = 'history-card';

  const isTheory = entry.type === 'theory' || (entry.topic && (entry.topic.toLowerCase().includes('лекци') || entry.topic.toLowerCase().includes('теори')));
  const typeLabel = isTheory ? 'Лекция' : 'Практика';
  const typeClass = isTheory ? 'badge-theory' : 'badge-practice';

  const attendance = entry.attendance || {};
  const attendKeys = Object.keys(attendance);

  const absentList = [];
  const excusedList = [];
  const gradeList = [];

  attendKeys.forEach((name) => {
    const att = attendance[name];
    if (!att) return;
    if (att.status === 'absent') absentList.push(name);
    else if (att.status === 'excused') excusedList.push(name);
    if (att.grade && att.grade !== '') gradeList.push({ name, grade: att.grade });
  });

  const totalStudents = attendKeys.length;
  const cardId = `history_entry_${(entry.id || '').replace(/[^a-zA-Z0-9_]/g, '_')}`;

  card.innerHTML = `
    <div class="history-card-top">
      <div class="history-card-date">
        <span class="history-badge-num">Пара №${entry.calculatedCourseNum || 1}</span>
        <span class="history-type-badge ${typeClass}">${typeLabel}</span>
        <span class="history-date-text">${entry.dateFormatted || entry.date} (${entry.lessonNumber} пара)</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="history-group-badge">Гр. ${entry.group}</span>
        <button type="button" class="history-edit-btn" title="Загрузить пару в форму для просмотра или редактирования">✏️ Изменить</button>
        <button type="button" class="history-del-btn" title="Удалить запись">🗑️</button>
      </div>
    </div>

    <div class="history-topic">${entry.topic || 'Без темы'}</div>
    ${entry.notes ? `<div class="history-notes">📝 ${entry.notes}</div>` : ''}

    <div class="history-details-summary">
      ${absentList.length > 0 ? `
        <div class="history-tag-row tag-row-absent">
          <span class="tag-title">✕ Не были (${absentList.length}):</span>
          <span class="tag-names">${absentList.map(formatShortName).join(', ')}</span>
        </div>
      ` : `
        <div class="history-tag-row tag-row-present">
          <span class="tag-title">✓ Все были</span>
        </div>
      `}

      ${excusedList.length > 0 ? `
        <div class="history-tag-row tag-row-excused">
          <span class="tag-title">📋 Уважительные (${excusedList.length}):</span>
          <span class="tag-names">${excusedList.map(formatShortName).join(', ')}</span>
        </div>
      ` : ''}

      ${gradeList.length > 0 ? `
        <div class="history-tag-row tag-row-grades">
          <span class="tag-title">⭐ Оценки (${gradeList.length}):</span>
          <div class="grade-pills-wrap">
            ${gradeList.map((g) => `<span class="history-grade-pill grade-pill-${g.grade}">${formatShortName(g.name)}: <b>${g.grade}</b></span>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>

    <div class="history-card-footer">
      <span class="history-stat-all">👥 Всего в записи: <b>${totalStudents}</b></span>
      <button type="button" class="history-expand-btn" data-target="${cardId}">
        <span>Список группы</span>
        <span class="expand-icon">▼</span>
      </button>
    </div>

    <div id="${cardId}" class="history-full-list hidden">
      <div class="history-table-header">
        <span>Студент</span>
        <span>Статус</span>
        <span>Оценка</span>
      </div>
      ${totalStudents === 0 ? '<div class="text-xs text-slate-500 py-2 text-center">Список студентов не был сохранен для этой пары</div>' : ''}
      ${attendKeys.map((name, idx) => {
        const att = attendance[name] || { status: 'present' };
        let statusText = 'Был';
        let statusClass = 'text-emerald-400';
        if (att.status === 'absent') {
          statusText = '✕ Не был';
          statusClass = 'text-rose-400 font-bold';
        } else if (att.status === 'excused') {
          statusText = '📋 Уважит.';
          statusClass = 'text-amber-400 font-medium';
        }
        return `
          <div class="history-student-item">
            <span class="item-name"><span class="item-idx">${idx + 1}.</span> ${name}</span>
            <span class="item-status ${statusClass}">${statusText}</span>
            <span class="item-grade">${att.grade ? `<b class="grade-badge-${att.grade}">${att.grade}</b>` : '—'}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;

  card.querySelector('.history-del-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof onDelete === 'function') onDelete(entry.id);
  });

  card.querySelector('.history-edit-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof onEdit === 'function') onEdit(entry);
  });

  const expandBtn = card.querySelector('.history-expand-btn');
  const fullList = card.querySelector(`#${cardId}`);
  expandBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!fullList) return;
    const isHidden = fullList.classList.toggle('hidden');
    const icon = expandBtn.querySelector('.expand-icon');
    if (icon) icon.textContent = isHidden ? '▼' : '▲';
    expandBtn.classList.toggle('active', !isHidden);
  });

  return card;
}
