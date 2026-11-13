// Shared display-only attendance utilities. Never rewrite stored name keys.
export const normalizeStudentName = value => String(value || '').trim().replace(/\s+/g, ' ');
export function attendanceKey(attendance, student) {
  if (Object.prototype.hasOwnProperty.call(attendance || {}, student)) return student;
  const matches = Object.keys(attendance || {}).filter(name => normalizeStudentName(name) === normalizeStudentName(student));
  return matches.length === 1 ? matches[0] : student;
}
export const studentAttendance = (entry, student) => entry.attendance?.[attendanceKey(entry.attendance, student)];
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function combineLessonCopies(entries, identity) {
  const grouped = new Map();
  for (const entry of [...entries].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const key = identity(entry);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...entry, attendance: JSON.parse(JSON.stringify(entry.attendance || {})), _sourceIds: [entry.id] });
      continue;
    }
    existing._sourceIds.push(entry.id);
    for (const [name, mark] of Object.entries(entry.attendance || {})) {
      const target = attendanceKey(existing.attendance, name);
      if (!existing.attendance[target]) { existing.attendance[target] = { ...mark }; continue; }
      const cell = existing.attendance[target];
      for (const [field, value] of Object.entries(mark)) {
        if (cell[field] === undefined || cell[field] === '') cell[field] = value;
        else if (value !== undefined && value !== '' && JSON.stringify(cell[field]) !== JSON.stringify(value)) {
          const alternatives = cell._alternatives ||= {};
          alternatives[field] = [...new Set([...(alternatives[field] || [cell[field]]), value])].sort();
        }
      }
    }
  }
  return [...grouped.values()];
}

export function attendanceText(cell) {
  if (!cell) return '';
  const statusLabel = value => ({ absent: 'Н', excused: 'У', present: 'Был' })[value] || value;
  const status = cell._alternatives?.status
    ? cell._alternatives.status.map(statusLabel).join(' / ') : cell.status === 'absent' ? 'Н' : cell.status === 'excused' ? 'У' : '';
  const grade = cell._alternatives?.grade ? cell._alternatives.grade.join(' / ') : cell.grade || '';
  return [status, grade].filter(Boolean).join(' · ') || '+';
}
