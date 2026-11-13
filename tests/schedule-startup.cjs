// Run: node --experimental-vm-modules --test tests/schedule-startup.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { SourceTextModule, SyntheticModule, createContext } = require('node:vm');

async function loadView(file, state, document, stored = [], { now, remote, staticHost = true, fetch: fetchMock, isPending = () => false } = {}) {
  const storage = new Map([['pwa_journal', JSON.stringify(stored)]]);
  const context = createContext({
    console, document, fetch: fetchMock,
    Date: now ? class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
    } : Date,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  const noop = () => {};
  const dependencies = {
    './state.js': {
      state, PWA_VERSION: 'test', isStaticHost: staticHost,
      DAY_NAMES: { 1: 'Понедельник', 4: 'Четверг', 5: 'Пятница' },
      formatLocalDate: () => '2026-10-26',
    },
    './topicHelper.js': { getRecommendedLesson: () => null },
    './lessonProgress.js': { matchesJournalTeacher: (entry, teacher) => entry.teacher === teacher },
    './journalSummaryView.js': { refreshOpenJournalSummary: noop },
    './journalStats.js': { renderJournalStats: noop },
    './journalView.js': { autoFillTopicForGroup: noop, loadEntryToForm: noop },
    './journalCard.js': { createHistoryCardElement: noop },
    './bellsPresets.js': {
      getLessonOverride: () => null,
      setLessonOverride: noop,
      renderBellsPresetSelector: noop,
      initBellsPreset: noop,
    },
    './syncQueue.js': { enqueueJournalDeletion: noop, flushSyncQueue: noop },
    './syncStorage.js': { getJournalTombstones: () => ({}), hasPendingJournalMutation: isPending, markJournalTombstone: noop },
    './supabaseSync.js': {
      fetchRemoteJournal: remote || (async () => null), deleteJournalEntryFromCloud: noop,
    },
  };
  const linked = [];
  const module = new SourceTextModule(readFileSync(file, 'utf8'), { context });
  module._linked = linked;
  await module.link(name => {
    if (['./scheduleDates.js', './journalMerge.js', './journalRecovery.js'].includes(name)) {
      return new SourceTextModule(readFileSync('js/' + name.slice(2), 'utf8'), { context });
    }
    const values = dependencies[name];
    assert.ok(values, `Unexpected dependency: ${name}`);
    const sm = new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
    linked.push(sm);
    return sm;
  });
  await module.evaluate();
  return { ...module.namespace, storage };
}

for (const root of ['', 'public/']) {
  for (const teacher of ['Трипольский', 'Иванова']) {
    test(`${root}schedule renders lessons for ${teacher}`, async () => {
      const cards = [];
      const container = { innerHTML: '', appendChild: card => cards.push(card) };
      const document = {
        getElementById: id => id === 'scheduleLessonsList' ? container : null,
        createElement: () => ({}), querySelectorAll: () => [],
      };
      const state = {
        currentTeacher: teacher, activeDay: 'all',
        schedule: { lessons: [{ dayOfWeek: 1, lessonNumber: 2,
          subject: 'Информатика', group: '11ф', startTime: '09:30', endTime: '10:50' }] },
      };
      const view = await loadView(`${root}js/scheduleView.js`, state, document);
      view.renderSchedule();
      assert.equal(cards.length, 1);
      assert.match(cards[0].innerHTML, /Информатика/);
      assert.match(cards[0].innerHTML, /open-journal-btn/);
    });

    test(`${root}journal startup completes for ${teacher}`, async () => {
      const state = { currentTeacher: teacher };
      const entry = { id: 'existing', teacher, date: '2026-09-10', type: 'practice' };
      const view = await loadView(`${root}js/journalHistory.js`, state,
        { getElementById: () => null }, [entry]);
      await view.loadJournalHistory();
      assert.equal(state.journalEntries.length, 1);
      assert.equal(state.journalEntries[0].type,
        'practice');
    });
  }
}

test('November 12 and 13 render published Thursday and Friday in Moscow time', async () => {
  const cards = [];
  const list = { set innerHTML(value) { cards.length = 0; this.html = value; },
    appendChild: card => cards.push(card) };
  const title = {};
  const count = {};
  const state = { activeDay: 'today', currentTeacher: 'Трипольский',
    schedule: JSON.parse(readFileSync('data/schedule.json', 'utf8')) };
  const document = { getElementById: id => ({ scheduleLessonsList: list,
    scheduleDayTitle: title, scheduleTotalLessons: count })[id],
    createElement: () => ({}), querySelectorAll: () => [] };
  const view = await loadView('js/scheduleView.js', state, document, [], { now: '2026-11-11T21:01:00Z' });
  for (const [activeDay, day, date] of [['today', 'Четверг', '12'], ['tomorrow', 'Пятница', '13']]) {
    state.activeDay = activeDay;
    view.renderSchedule();
    assert.equal(title.textContent, day);
    assert.equal(count.textContent, '3 пары');
    assert.equal(cards.length, 3);
    for (const card of cards) assert.match(card.innerHTML, new RegExp('data-date="2026-11-' + date + '"'));
  }
  state.schedule.weekEnd = '2026-11-12';
  view.renderSchedule();
  assert.match(list.html, /Расписание на эту дату не опубликовано/);
  assert.equal(count.textContent, '');
});

test('a journal refresh keeps grades saved while the cloud request was in flight', async () => {
  const state = { currentTeacher: 'Трипольский' };
  const original = { id: '1', attendance: { student: { grade: '3' } } };
  const removed = { id: '2' };
  let finish;
  const remote = () => new Promise(resolve => { finish = resolve; });
  const view = await loadView('js/journalHistory.js', state, { getElementById: () => null },
    [original, removed], { remote });
  const pending = view.loadJournalHistory();
  const updated = { ...original, attendance: { student: { grade: '5' } } };
  view.storage.set('pwa_journal', JSON.stringify([updated]));
  finish([original, removed, { id: '3' }]);
  await pending;
  assert.deepEqual(JSON.parse(view.storage.get('pwa_journal')), [updated, { id: '3' }]);
});

test('a clean cached row accepts an edit from another device', async () => {
  const state = { currentTeacher: 'Трипольский' };
  const original = { id: 'remote-edit', topic: 'old' };
  const updated = { ...original, topic: 'new' };
  const view = await loadView('js/journalHistory.js', state, { getElementById: () => null },
    [original], { remote: async () => [updated] });
  await view.loadJournalHistory();
  assert.deepEqual(JSON.parse(view.storage.get('pwa_journal')), [updated]);
});


test('an empty API result does not hide cloud-only phone records', async () => {
  const state = { currentTeacher: 'Трипольский' };
  const phone = { id: 'phone-only', attendance: { A: { grade: '5', status: 'absent' } } };
  const view = await loadView('js/journalHistory.js', state, { getElementById: () => null }, [], {
    staticHost: false, fetch: async () => ({ ok: true, json: async () => ({ success: true, entries: [] }) }),
    remote: async () => [phone],
  });
  await view.loadJournalHistory();
  assert.deepEqual(JSON.parse(view.storage.get('pwa_journal')), [phone]);
});

test('API, cloud and device-only entries are combined instead of source fallback', async () => {
  const state = { currentTeacher: 'Трипольский' };
  const view = await loadView('js/journalHistory.js', state, { getElementById: () => null }, [{ id: 'local' }], {
    staticHost: false, fetch: async () => ({ ok: true, json: async () => ({ success: true, entries: [{ id: 'api' }] }) }),
    remote: async () => [{ id: 'cloud' }],
  });
  await view.loadJournalHistory();
  assert.deepEqual(JSON.parse(view.storage.get('pwa_journal')).map(x => x.id).sort(), ['api', 'cloud', 'local']);
});

test('a late stale read cannot erase marks after the pending save was acknowledged', async () => {
  let finish;
  let pending = true;
  const state = { currentTeacher: 'Трипольский' };
  const current = { id: 'a', attendance: { A: { grade: '5' } } };
  const stale = { id: 'a', attendance: { A: { grade: '3' } } };
  const view = await loadView('js/journalHistory.js', state, { getElementById: () => null }, [current], {
    isPending: () => pending, remote: () => new Promise(resolve => { finish = resolve; }),
  });
  const loading = view.loadJournalHistory();
  pending = false;
  view.storage.set('pwa_journal_cloud_baseline', JSON.stringify({ a: current }));
  finish([stale]); await loading;
  assert.equal(JSON.parse(view.storage.get('pwa_journal'))[0].attendance.A.grade, '5');
  const conflicts = JSON.parse(view.storage.get('pwa_journal_conflicts'));
  assert.equal(conflicts[0].remote.attendance.A.grade, '3');
});
