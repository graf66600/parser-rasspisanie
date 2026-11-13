// Only served by tools/preview-server.cjs. Never included in the deployed PWA.
(() => {
  const url = new URL(location.href);
  const fixture = { id: 'preview-lesson', group: '31фм', teacher: 'Трипольский', subject: 'Информационные технологии',
    date: '2026-11-12', dateFormatted: '12.11.2026', lessonNumber: 3, subgroup: null,
    type: 'practice', courseLessonNumber: 8, topic: 'Работа с информационными ресурсами', notes: 'Тестовые данные для проверки интерфейса',
    attendance: { 'Студент А': { status: 'absent', grade: '3', comment: 'Сохранённый комментарий' }, 'Студент Б': { status: 'present', grade: '5' } } };
  if (!sessionStorage.getItem('preview-fixture-ready') || url.searchParams.has('reset')) {
    for (const key of Object.keys(localStorage)) if (key.startsWith('pwa_')) localStorage.removeItem(key);
    localStorage.setItem('pwa_journal', JSON.stringify([fixture]));
    localStorage.setItem('pwa_custom_students', JSON.stringify({ '31фм': ['Студент А', 'Студент Б'] }));
    localStorage.setItem('pwa_current_teacher', 'Трипольский');
    localStorage.setItem('pwa_admin_authorized', 'true');
    localStorage.setItem('pwa_auth_role', 'admin');
    sessionStorage.setItem('preview-fixture-ready', '1');
  }
  if (url.searchParams.has('conflict')) {
    const remote = structuredClone(fixture);
    remote.attendance['Студент А'].grade = '4';
    const signature = JSON.stringify([fixture.id, fixture, remote]);
    localStorage.setItem('pwa_journal_conflicts', JSON.stringify([{ id: fixture.id, local: fixture, remote,
      fields: ['attendance.Студент А.grade'], paths: [['attendance', 'Студент А', 'grade']], signature }]));
  }
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const requestUrl = String(input?.url || input);
    if (/supabase\.co/.test(requestUrl)) {
      // No production reads or writes: changes stay inside this preview's browser storage.
      const rows = [];
      return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (requestUrl.includes('/api/')) return new Response('{}', { status: 503 });
    return originalFetch(input, options);
  };
  document.addEventListener('DOMContentLoaded', () => {
    document.title = 'Локальная проверка · тестовые данные';
  });
})();
