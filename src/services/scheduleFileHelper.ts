import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/config.js';

/**
 * Находит самый свежий файл расписания Excel в проекте
 */
export function findLatestScheduleFile(): string | null {
  const searchDirs = [process.cwd(), CONFIG.DATA_DIR];
  let latestFile: string | null = null;
  let latestTime = 0;

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (!entry.endsWith('.xlsx') && !entry.endsWith('.xls')) continue;
        if (entry.startsWith('~$')) continue; // Пропуск временных файлов Excel

        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs > latestTime) {
          latestTime = stat.mtimeMs;
          latestFile = fullPath;
        }
      }
    } catch (e) {
      console.warn(`Ошибка сканирования папки ${dir}:`, e);
    }
  }

  return latestFile;
}
