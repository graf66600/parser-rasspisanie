// ==========================================================================
// STUDENTS MANAGEMENT VIEW
// ==========================================================================
import { state } from './state.js';
import { ensureXLSX } from './uploadView.js';

export function renderManageStudents(onStudentsChanged) {
  const groupSel = document.getElementById('manageGroupSelect');
  if (!groupSel) return;
  const group = groupSel.value;
  const listEl = document.getElementById('manageStudentsList');
  if (!listEl) return;

  const students = state.studentsByGroup[group] || [];
  if (students.length === 0) {
    listEl.innerHTML = `<div style="text-align: center; color: #64748b; font-size: 12px; padding: 12px;">В этой группе пока нет студентов</div>`;
    return;
  }

  listEl.innerHTML = '';
  students.forEach((student, idx) => {
    const item = document.createElement('div');
    item.className = 'student-manage-item';
    item.innerHTML = `
      <span class="student-manage-name"><b style="color: #64748b; margin-right: 6px;">${idx + 1}.</b>${student}</span>
      <button class="student-del-btn" title="Удалить студента">✕</button>
    `;

    item.querySelector('.student-del-btn')?.addEventListener('click', () => {
      if (confirm(`Удалить студента ${student}?`)) {
        state.studentsByGroup[group] = state.studentsByGroup[group].filter((s) => s !== student);
        localStorage.setItem('pwa_custom_students', JSON.stringify(state.studentsByGroup));
        renderManageStudents(onStudentsChanged);
        if (typeof onStudentsChanged === 'function') onStudentsChanged();
      }
    });

    listEl.appendChild(item);
  });
}

export function setupStudentsListeners(onStudentsChanged) {
  document.getElementById('manageGroupSelect')?.addEventListener('change', () => {
    renderManageStudents(onStudentsChanged);
  });

  document.getElementById('addStudentBtn')?.addEventListener('click', () => {
    const input = document.getElementById('newStudentNameInput');
    const group = document.getElementById('manageGroupSelect')?.value;
    const name = input?.value.trim();
    if (!name || !group) return;

    if (!state.studentsByGroup[group]) state.studentsByGroup[group] = [];
    if (!state.studentsByGroup[group].includes(name)) {
      state.studentsByGroup[group].push(name);
      state.studentsByGroup[group].sort((a, b) => a.localeCompare(b, 'ru'));
      localStorage.setItem('pwa_custom_students', JSON.stringify(state.studentsByGroup));
    }

    input.value = '';
    renderManageStudents(onStudentsChanged);
    if (typeof onStudentsChanged === 'function') onStudentsChanged();
  });

  document.getElementById('saveBulkStudentsBtn')?.addEventListener('click', () => {
    const textarea = document.getElementById('bulkStudentsText');
    const group = document.getElementById('manageGroupSelect')?.value;
    const text = textarea?.value.trim();
    if (!text || !group) return;

    const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim()).filter((l) => l.length > 0);
    state.studentsByGroup[group] = Array.from(new Set(lines));
    localStorage.setItem('pwa_custom_students', JSON.stringify(state.studentsByGroup));

    textarea.value = '';
    alert(`✅ Список студентов группы ${group} сохранен!`);
    renderManageStudents(onStudentsChanged);
    if (typeof onStudentsChanged === 'function') onStudentsChanged();
  });

  document.getElementById('studentsDropZone')?.addEventListener('click', () => {
    document.getElementById('studentsFileInput')?.click();
  });

  document.getElementById('studentsFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    const group = document.getElementById('manageGroupSelect')?.value;
    if (!file || !group) return;

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      try {
        await ensureXLSX();
      } catch (e) {
        alert('Не удалось загрузить библиотеку для чтения Excel');
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const data = evt.target.result;
        let names = [];
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          if (window.XLSX) {
            const wb = window.XLSX.read(data, { type: 'binary' });
            const firstSheet = wb.Sheets[wb.SheetNames[0]];
            const rows = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
            for (const r of rows) {
              for (const c of (r || [])) {
                const val = String(c || '').trim();
                if (val && !val.match(/^(№|п\/п|фио|студент|список)/i)) {
                  const cleaned = val.replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim();
                  if (cleaned.length >= 3 && cleaned.includes(' ')) names.push(cleaned);
                }
              }
            }
          }
        } else {
          const text = new TextDecoder('utf-8').decode(data);
          names = text.split(/\r?\n/).map((l) => l.trim().replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim()).filter((l) => l.length > 2);
        }

        if (names.length > 0) {
          state.studentsByGroup[group] = Array.from(new Set(names));
          localStorage.setItem('pwa_custom_students', JSON.stringify(state.studentsByGroup));
          alert(`✅ Загружено ${names.length} студентов для группы ${group}!`);
          renderManageStudents(onStudentsChanged);
          if (typeof onStudentsChanged === 'function') onStudentsChanged();
        } else {
          alert('В файле не найдено ФИО студентов');
        }
      } catch (err) {
        alert('Ошибка парсинга файла со студентами');
      }
    };

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}
