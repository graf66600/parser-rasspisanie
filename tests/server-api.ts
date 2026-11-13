import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import type http from 'node:http';
import { handleJournalRoutes } from '../src/server/routes/journalRoutes';
import { handleStudentRoutes } from '../src/server/routes/studentRoutes';
import { handleScheduleUpload } from '../src/server/routes/scheduleUploadRoute';
import { JournalService } from '../src/services/journalService';
import { CONFIG } from '../src/config/config';
import {
  errorStatus, HttpError, isSupportedUploadSignature, MAX_JSON_BODY_BYTES,
  MAX_STUDENT_UPLOAD_BYTES, MAX_UPLOAD_BODY_BYTES, readBody, safeUploadFilename,
} from '../src/server/httpUtils';
import { multipartBoundary, parseMultipart } from '../src/server/multipartParser';

function request(body: string | Buffer, headers: Record<string, string> = {}): http.IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(body)]), { method: 'POST', headers }) as http.IncomingMessage;
}
function response() {
  const result = { status: 0, data: undefined as any };
  const res = {
    writeHead(status: number) { result.status = status; },
    end(body: string) { result.data = JSON.parse(body); },
  } as unknown as http.ServerResponse;
  return { result, res };
}
function multipart(filename: string, data: Buffer = Buffer.from('%PDF-1.7\nfixture')): Buffer {
  return Buffer.concat([
    Buffer.from(`--test\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    data, Buffer.from('\r\n--test--\r\n'),
  ]);
}
const curriculum = {} as any;
const url = new URL('http://localhost/api/journal/mark');

async function mark(body: unknown, journal: any = { getAllEntries: () => [], recordLesson: () => { throw new Error('must not write'); } }) {
  const { result, res } = response();
  await handleJournalRoutes(request(typeof body === 'string' ? body : JSON.stringify(body)), res, '/api/journal/mark', url, journal, curriculum);
  return result;
}

test('DATA_DIR and schedules path are isolated before module imports', () => {
  assert.ok(process.env.TEST_DATA_DIR);
  assert.equal(CONFIG.DATA_DIR, path.resolve(process.env.TEST_DATA_DIR!));
  assert.equal(CONFIG.SCHEDULES_FILE, path.join(CONFIG.DATA_DIR, 'schedules.json'));
});

test('malformed and non-object JSON return 400 without writes', async () => {
  for (const body of ['{oops', 'null', '[]', '"hello"']) assert.equal((await mark(body)).status, 400);
});

test('invalid journal values return 400 without writes', async () => {
  const base = { group: '11фм', lessonNumber: 1 };
  for (const patch of [
    { group: 12 }, { group: '   ' }, { lessonNumber: true }, { lessonNumber: 11 },
    { lessonNumber: 'abc' }, { subgroup: 3 }, { subgroup: true }, { startTime: '25:90' },
    { date: '2026-02-30' }, { topic: {} }, { courseLessonNumber: -1 },
    { attendance: { Иванов: { status: 'missing' } } }, { attendance: { Иванов: { grade: 5 } } },
  ]) assert.equal((await mark({ ...base, ...patch })).status, 400, JSON.stringify(patch));
});

test('valid journal strings, null optionals and defaults remain compatible', async () => {
  let received: any;
  const journal = { getAllEntries: () => [], recordLesson: (entry: any) => (received = entry) };
  const result = await mark({ group: '11фм', lessonNumber: '2', subgroup: '1', topicIndex: 0, courseLessonNumber: null }, journal);
  assert.equal(result.status, 200);
  assert.equal(received.lessonNumber, 2);
  assert.equal(received.subgroup, 1);
  assert.equal(received.topicIndex, 0);
  assert.equal(received.courseLessonNumber, undefined);
  assert.equal(received.startTime, '08:00');
  assert.equal(received.endTime, '09:20');
  assert.equal(received.subject, 'Информатика');
});

test('journal preserves id, unmentioned students and all existing attendance fields', async () => {
  const journal = JournalService.getInstance();
  const params = { id: 'original-id', date: '2026-10-01', group: 'test', subject: 'Информатика', lessonNumber: 1, startTime: '08:00', endTime: '09:20', topic: 'Лекция №1' };
  journal.recordLesson({ ...params, attendance: {
    Иванов: { status: 'absent', grade: '5', comment: 'saved' }, Петров: { status: 'excused', grade: '4' },
  } });
  const result = await mark({ ...params, courseLessonNumber: null, attendance: { Иванов: { grade: '3', extra: 'retained' } } }, journal);
  assert.equal(result.status, 200);
  const entry = result.data.entry;
  assert.equal(entry.id, 'original-id');
  assert.deepEqual(entry.attendance.Иванов, { status: 'absent', grade: '3', comment: 'saved', extra: 'retained' });
  assert.deepEqual(entry.attendance.Петров, { status: 'excused', grade: '4' });
  assert.equal((await mark({ ...params, lessonNumber: 2 }, journal)).status, 400);
  assert.equal(journal.getAllEntries().length, 1);
});

test('student payload validation and malformed JSON do not call mutations', async () => {
  let writes = 0;
  const students = { setStudents: () => writes++, addStudent: () => writes++, getStudents: () => [] } as any;
  for (const body of ['{', { group: 3, students: [] }, { group: '11фм', students: [null] }, { group: '11фм', students: [12] }, { group: '11фм' }]) {
    const { result, res } = response();
    await handleStudentRoutes(request(typeof body === 'string' ? body : JSON.stringify(body)), res, '/api/students', new URL('http://localhost/api/students'), students);
    assert.equal(result.status, 400);
  }
  assert.equal(writes, 0);
  const { result, res } = response();
  await handleStudentRoutes(request(JSON.stringify({ group: '11фм', students: [] })), res, '/api/students', new URL('http://localhost/api/students'), students);
  assert.equal(result.status, 200);
  assert.equal(writes, 1);
});

test('JSON and upload body limits return 413 for declared and streamed sizes', async () => {
  assert.equal((await mark(JSON.stringify({ group: 'x', lessonNumber: 1, notes: 'x'.repeat(MAX_JSON_BODY_BYTES) }))).status, 413);
  await assert.rejects(readBody(request('small', { 'content-length': String(MAX_UPLOAD_BODY_BYTES + 1) }), MAX_UPLOAD_BODY_BYTES), (error: unknown) => errorStatus(error) === 413);
  await assert.rejects(readBody(request('12345'), 4), (error: unknown) => errorStatus(error) === 413);
  const { result, res } = response();
  await handleStudentRoutes(request('small', { 'content-length': String(MAX_STUDENT_UPLOAD_BYTES + 1) }), res, '/api/students/upload', new URL('http://localhost/api/students/upload?group=test'), {} as any);
  assert.equal(result.status, 413);
});

test('filename and signature guards reject traversal, alternate streams and mismatches', async () => {
  for (const name of ['../evil.pdf', '..\\evil.pdf', '/evil.pdf', 'C:\\evil.pdf', 'file.pdf:stream', '.', '..', 'evil\0.pdf']) {
    assert.equal(safeUploadFilename(name, 'fallback.pdf'), null, name);
  }
  assert.equal(safeUploadFilename('расписание.pdf', 'fallback.pdf'), 'расписание.pdf');
  assert.equal(isSupportedUploadSignature(Buffer.from('%PDF-1.7'), 'file.pdf', 'schedule'), true);
  assert.equal(isSupportedUploadSignature(Buffer.from('%PDF-1.7'), 'file.xlsx', 'schedule'), false);
  assert.equal(isSupportedUploadSignature(Buffer.from('text'), 'file.txt', 'schedule'), false);
  assert.equal(isSupportedUploadSignature(Buffer.from('text'), 'file.txt', 'students'), true);
  const before = fs.readdirSync(CONFIG.DATA_DIR);
  for (const [filename, data] of [['../evil.pdf', Buffer.from('%PDF-1.7')], ['file.xlsx', Buffer.from('bad')]] as const) {
    await assert.rejects(handleScheduleUpload(request(multipart(filename, data), { 'content-type': 'multipart/form-data; boundary="test"' }), response().res, '/api/upload-schedule', {} as any, 1), (error: unknown) => errorStatus(error) === 400);
  }
  assert.deepEqual(fs.readdirSync(CONFIG.DATA_DIR), before);
});

test('multipart parser handles quoted boundaries and rejects incomplete bodies', () => {
  assert.equal(multipartBoundary('multipart/form-data; boundary="test"; charset=utf-8'), 'test');
  assert.equal(parseMultipart(multipart('safe.pdf'), 'test').files[0].filename, 'safe.pdf');
  assert.throws(() => multipartBoundary('multipart/form-data'), HttpError);
  assert.throws(() => parseMultipart(Buffer.from('--test\r\nbroken'), 'test'), HttpError);
});

test('HTTP errors map status explicitly and ordinary errors stay 500', () => {
  assert.equal(errorStatus(new HttpError(400, 'bad')), 400);
  assert.equal(errorStatus(new HttpError(413, 'large')), 413);
  assert.equal(errorStatus(new Error('bad')), 500);
  assert.equal(errorStatus({ statusCode: 200 }), 500);
});
