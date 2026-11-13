import fs from 'node:fs';
import path from 'node:path';

export function readJournalFile(file: string): unknown[] {
  if (!fs.existsSync(file)) return [];
  const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(value)) throw new Error('Неизвестный формат журнала. Запись заблокирована до восстановления резервной копии.');
  return value;
}

export function writeJournalFile(file: string, entries: unknown[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(entries, null, 2), 'utf8');
    fs.renameSync(temporary, file);
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* original error remains authoritative */ }
    throw error;
  }
}
