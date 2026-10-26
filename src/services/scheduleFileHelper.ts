import fs from 'fs';
import path from 'path';
import { CONFIG, DEFAULT_BELLS } from '../config/config.js';
import { LessonTime } from '../types/schedule.js';
import { ExcelParser, ParseResult, MultiTeacherParseResult } from './excelParser.js';
import { PdfParser } from './pdfParser.js';

/**
 * Проверяет, является ли буфер PDF-файлом
 */
export function isPdfBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString('latin1').startsWith('%PDF');
}

/**
 * Проверяет, является ли путь к файлу PDF-документом
 */
export function isPdfFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.pdf');
}

/**
 * Находит самый свежий файл расписания (Excel, PDF или любого типа) в проекте
 */
export function findLatestScheduleFile(type: 'all' | 'excel' | 'pdf' = 'all'): string | null {
  const searchDirs = [process.cwd(), CONFIG.DATA_DIR];
  let latestFile: string | null = null;
  let latestTime = 0;

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const lower = entry.toLowerCase();
        const isXlsx = lower.endsWith('.xlsx') || lower.endsWith('.xls');
        const isPdf = lower.endsWith('.pdf');

        if (type === 'excel' && !isXlsx) continue;
        if (type === 'pdf' && !isPdf) continue;
        if (type === 'all' && !isXlsx && !isPdf) continue;

        if (entry.startsWith('~$')) continue; // Временные файлы Excel
        if (entry.includes('КП_') || entry.includes('стол') || entry.includes('преподавателей_')) continue; // Не первичное расписание

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

/**
 * Универсальный парсинг расписания (автоопределение Excel или PDF) для конкретного преподавателя
 */
export async function parseScheduleBuffer(
  buffer: Buffer,
  bells: LessonTime[] = DEFAULT_BELLS,
  teacherFilter: string = CONFIG.DEFAULT_TEACHER,
  subjectFilter: string = CONFIG.DEFAULT_SUBJECT
): Promise<ParseResult> {
  if (isPdfBuffer(buffer)) {
    return PdfParser.parseBuffer(buffer, bells, teacherFilter, subjectFilter);
  }
  return ExcelParser.parseBuffer(buffer, bells, teacherFilter, subjectFilter);
}

/**
 * Универсальный мульти-парсинг всех преподавателей (автоопределение Excel или PDF)
 */
export async function parseScheduleBufferAllTeachers(
  buffer: Buffer,
  bells: LessonTime[] = DEFAULT_BELLS
): Promise<MultiTeacherParseResult> {
  if (isPdfBuffer(buffer)) {
    return PdfParser.parseAllTeachers(buffer, bells);
  }
  return ExcelParser.parseAllTeachers(buffer, bells);
}
