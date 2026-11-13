import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../src/config/config';
import { JournalService } from '../src/services/journalService';
import { writeJournalFile } from '../src/services/journalPersistence';

test('saving a lesson preserves unknown stored fields and unrecognized legacy rows', async () => {
  const filename = path.join(CONFIG.DATA_DIR, 'journal.json');
  const original = {
    id: 'legacy', date: '2026-10-01', dateFormatted: 'original date', group: 'legacy-group',
    subject: 'old subject', lessonNumber: 1, startTime: '08:00', endTime: '09:20',
    classroom: '305', teacher: 'Трипольский', topic: 'Лекция №1',
    customField: { preserved: true },
    attendance: { Иванов: { status: 'absent', grade: '5', comment: 'saved', custom: 'old' } },
  };
  const unrecognized = { id: 'old-format', date: '2020-01-01', attendance: { Петров: { grade: 4, status: 'absent' } } };
  fs.writeFileSync(filename, JSON.stringify([original, unrecognized]));
  const journal = JournalService.getInstance();
  journal.recordLesson({
    id: original.id, date: original.date, group: original.group, subject: original.subject,
    lessonNumber: 1, startTime: original.startTime, endTime: original.endTime, topic: original.topic,
    attendance: { Иванов: { grade: '4' } },
  });
  const stored = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert.equal(stored.length, 2);
  assert.deepEqual(stored.find((entry: any) => entry.id === 'old-format'), unrecognized);
  const updated = stored.find((entry: any) => entry.id === original.id);
  assert.deepEqual(updated.customField, original.customField);
  assert.deepEqual(updated.attendance.Иванов, { ...original.attendance.Иванов, grade: '4' });
  assert.equal(updated.classroom, '305');
  await new Promise<void>((resolve) => setImmediate(resolve));
});


test('a failed atomic replacement leaves the original journal byte-for-byte intact', (context) => {
  const filename = path.join(CONFIG.DATA_DIR, 'atomic-journal.json');
  const original = '[{"id":"saved","attendance":{"A":{"grade":"5","status":"absent"}}}]';
  fs.writeFileSync(filename, original);
  context.mock.method(fs, 'renameSync', () => { throw new Error('simulated disk error'); });
  assert.throws(() => writeJournalFile(filename, [{ id: 'new' }]), /simulated/);
  assert.equal(fs.readFileSync(filename, 'utf8'), original);
  assert.equal(fs.existsSync(`${filename}.${process.pid}.tmp`), false);
});

test('an unreadable legacy journal is never silently replaced by an empty cache', (context) => {
  const filename = path.join(CONFIG.DATA_DIR, 'journal.json');
  const invalid = '{broken JSON with preserved original bytes';
  fs.writeFileSync(filename, invalid);
  context.mock.method(console, 'error', () => {});
  const IndependentJournal = JournalService as unknown as { new(): JournalService };
  const journal = new IndependentJournal();
  assert.throws(() => journal.recordLesson({ date: '2026-11-12', group: 'test', subject: 'test',
    lessonNumber: 1, startTime: '08:00', endTime: '09:20', topic: 'test', syncCloud: false }), /Перезапись запрещена/);
  assert.equal(fs.readFileSync(filename, 'utf8'), invalid);
  assert.equal(journal.getAllEntries().length, 0);
});
