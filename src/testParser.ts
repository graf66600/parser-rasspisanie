import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as xlsx from 'xlsx';

async function runTests(): Promise<void> {
  // Set this before importing config or any singleton service. Running this file
  // directly must be just as safe as running through the test bootstrap.
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-parser-unit-'));
  process.env.DATA_DIR = temporaryDir;
  const previousFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string }> = [];
  let teachers: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    requests.push({ url, method });
    if (url.includes('/teachers') && method === 'POST') {
      teachers = JSON.parse(String(init?.body)).map((row: { name: string }) => row.name);
    }
    return new Response(JSON.stringify(url.includes('/teachers') ? teachers.map((name) => ({ name })) : []), { status: 200 });
  }) as typeof fetch;

  try {
    const { CONFIG, DEFAULT_BELLS } = await import('./config/config.js');
    const { ExcelParser } = await import('./services/excelParser.js');
    const { StorageService } = await import('./services/storageService.js');
    const { JournalService } = await import('./services/journalService.js');
    const { CurriculumService } = await import('./services/curriculumService.js');
    const { SupabaseService } = await import('./services/supabaseService.js');
    assert.equal(CONFIG.DATA_DIR, temporaryDir);
    assert.equal(CONFIG.SCHEDULES_FILE, path.join(temporaryDir, 'schedules.json'));

    const workbook = xlsx.utils.book_new();
    const rows = [
      ['День недели', 'Пара', 'Группа', 'Предмет', 'Преподаватель', 'Аудитория'],
      ['Понедельник', '1', '11фм', 'Информатика', 'Трипольский Б.А.', '305'],
      ['Вторник', '2', '11фм', 'Информатика', 'Трипольский Б.А.', '305'],
      ['Среда', '3', '11фм', 'Математика', 'Иванов И.И.', '101'],
    ];
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), 'Расписание');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const parsed = ExcelParser.parseBuffer(buffer, DEFAULT_BELLS, 'Трипольский', 'Информатика');
    assert.equal(parsed.totalFound, 2);
    assert.equal(parsed.lessons[0].group, '11фм');
    assert.deepEqual(parsed.lessons.map((lesson) => lesson.lessonNumber), [1, 2]);
    const all = ExcelParser.parseAllTeachers(buffer, DEFAULT_BELLS);
    assert.deepEqual(all.lessonsByTeacher['Трипольский'], parsed.lessons);
    assert.ok(all.teachers.includes('Трипольский'));

    const storage = StorageService.getInstance();
    storage.saveUserSchedule(999999999, 999999999, parsed.lessons);
    assert.equal(storage.getUserSchedule(999999999)?.lessons.length, 2);
    assert.equal(JSON.parse(fs.readFileSync(CONFIG.SCHEDULES_FILE, 'utf8')).length, 1);

    const curriculumFixture = path.resolve(__dirname, '../data/curriculum.json');
    fs.copyFileSync(curriculumFixture, path.join(temporaryDir, 'curriculum.json'));
    const curriculum = CurriculumService.getInstance();
    assert.ok(curriculum.getAllPrograms().length >= 9);
    assert.ok(curriculum.findProgramForGroup('51ф')?.title.includes('Информационное обеспечение'));
    assert.ok(curriculum.findProgramForGroup('31фм')?.title.includes('Информационные технологии'));

    const journal = JournalService.getInstance();
    const entry = journal.recordLesson({
      group: 'тест99ф', subject: 'Информатика', lessonNumber: 1,
      startTime: '08:00', endTime: '09:20', topic: 'Лекция №1', date: '2026-10-01',
    });
    assert.equal(journal.getGroupHistory('тест99ф').length, 1);
    assert.equal(journal.getEntriesByDate('2026-10-01')[0].id, entry.id);
    assert.equal(journal.deleteEntry(entry.id), true);

    const cloud = SupabaseService.getInstance();
    assert.equal(await cloud.saveTeachers(['Трипольский', 'Иванов']), true);
    assert.deepEqual(await cloud.getTeachers(), ['Трипольский', 'Иванов']);
    assert.ok(requests.length >= 2);
    // Allow JournalService's dynamic import/sync to finish before cleanup.
    await new Promise<void>((resolve) => setImmediate(resolve));
    console.log('Parser, local services and mocked Supabase tests passed.');
  } finally {
    globalThis.fetch = previousFetch;
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
