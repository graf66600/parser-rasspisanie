import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isPdfBuffer, parseScheduleBuffer } from './services/scheduleFileHelper.js';
import { DEFAULT_BELLS } from './config/config.js';

assert.equal(isPdfBuffer(Buffer.from('%PDF-1.7\n')), true);
for (const value of ['', '%PDF', '%PDFx', 'not a pdf', 'PK\x03\x04']) {
  assert.equal(isPdfBuffer(Buffer.from(value)), false, value);
}
console.log('PDF signature unit tests passed.');

async function integration(): Promise<void> {
  if (process.env.RUN_PDF_INTEGRATION !== '1') {
    console.log('PDF parsing integration skipped; set RUN_PDF_INTEGRATION=1 to enable.');
    return;
  }
  const fixture = path.resolve(__dirname, '../data/latest_schedule.pdf');
  assert.ok(fs.existsSync(fixture), `Tracked PDF fixture is missing: ${fixture}`);
  const result = await parseScheduleBuffer(fs.readFileSync(fixture), DEFAULT_BELLS, 'Трипольский', 'Информатика');
  assert.ok(result.totalFound > 0, 'PDF fixture should contain lessons for Трипольский');
  assert.equal(result.totalFound, result.lessons.length);
  console.log(`PDF integration fixture parsed: ${result.totalFound} lessons.`);
}

integration().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
