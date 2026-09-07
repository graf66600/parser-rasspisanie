import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { CONFIG } from '../config/config.js';

export interface GroupStudentsMap {
  [group: string]: string[];
}

export class StudentService {
  private static instance: StudentService;
  private studentsFile: string;
  private data: GroupStudentsMap = {};

  private constructor() {
    this.studentsFile = path.resolve(CONFIG.DATA_DIR, 'students.json');
    this.load();
  }

  public static getInstance(): StudentService {
    if (!StudentService.instance) {
      StudentService.instance = new StudentService();
    }
    return StudentService.instance;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.studentsFile)) {
        const raw = fs.readFileSync(this.studentsFile, 'utf8');
        this.data = JSON.parse(raw);
      } else {
        // Начальные примеры для групп из расписания
        this.data = {
          '51ф': [
            'Александров Михаил Сергеевич',
            'Беляева Анна Дмитриевна',
            'Волков Даниил Александрович',
            'Григорьева Екатерина Павловна',
            'Дмитриев Артем Игоревич',
            'Ермакова София Максимовна',
            'Жуков Кирилл Олегович',
            'Иванова Полина Романовна',
            'Ковалев Никита Денисович',
            'Морозова Алиса Владимировна',
          ],
          '31фм': [
            'Андреев Денис Викторович',
            'Борисова Вероника Андреевна',
            'Васильев Илья Алексеевич',
            'Гордеев Егор Тимофеевич',
            'Давыдова Дарья Михайловна',
            'Зайцев Максим Константинович',
            'Кузнецова Ксения Сергеевна',
            'Лебедев Арсений Даниилович',
          ],
        };
        this.save();
      }
    } catch (err) {
      console.error('Ошибка загрузки студентов:', err);
      this.data = {};
    }
  }

  private save(): void {
    try {
      if (!fs.existsSync(CONFIG.DATA_DIR)) {
        fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(this.studentsFile, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Ошибка сохранения студентов:', err);
    }
  }

  public normalizeGroup(group: string): string {
    return group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').trim();
  }

  public getGroups(): string[] {
    return Object.keys(this.data);
  }

  public getStudents(group: string): string[] {
    const clean = this.normalizeGroup(group);
    // Точное или частичное совпадение
    const key = Object.keys(this.data).find(
      (k) => this.normalizeGroup(k) === clean || clean.includes(this.normalizeGroup(k))
    );
    return key ? [...this.data[key]] : [];
  }

  public setStudents(group: string, students: string[]): void {
    const cleanList = students
      .map((s) => s.trim().replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim())
      .filter((s) => s.length > 0);

    // Удаляем дубликаты
    const unique = Array.from(new Set(cleanList));
    this.data[group.trim()] = unique;
    this.save();
  }

  public addStudent(group: string, studentName: string): void {
    const trimmed = studentName.trim().replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim();
    if (!trimmed) return;

    const groupKey = group.trim();
    if (!this.data[groupKey]) {
      this.data[groupKey] = [];
    }

    if (!this.data[groupKey].includes(trimmed)) {
      this.data[groupKey].push(trimmed);
      this.data[groupKey].sort((a, b) => a.localeCompare(b, 'ru'));
      this.save();
    }
  }

  public removeStudent(group: string, studentName: string): boolean {
    const groupKey = Object.keys(this.data).find(
      (k) => this.normalizeGroup(k) === this.normalizeGroup(group)
    );
    if (!groupKey || !this.data[groupKey]) return false;

    const initialLen = this.data[groupKey].length;
    this.data[groupKey] = this.data[groupKey].filter((s) => s !== studentName.trim());
    if (this.data[groupKey].length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Парсинг файла со студентами (Excel, TXT или CSV)
   */
  public parseStudentFile(buffer: Buffer, filename: string): string[] {
    const ext = path.extname(filename).toLowerCase();
    const students: string[] = [];

    if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      if (firstSheetName) {
        const sheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        for (const row of rows) {
          if (!row || row.length === 0) continue;
          // Ищем текстовую ячейку, похожую на ФИО
          for (const cell of row) {
            const val = String(cell || '').trim();
            if (val && !val.match(/^(№|п\/п|фио|студент|список|группа|дата)/i)) {
              const cleaned = val.replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim();
              if (cleaned.length >= 3 && cleaned.includes(' ')) {
                students.push(cleaned);
                break;
              } else if (cleaned.length >= 2 && !cell.toString().match(/^\d+$/)) {
                students.push(cleaned);
                break;
              }
            }
          }
        }
      }
    } else {
      // Текстовый файл или CSV
      const content = buffer.toString('utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.match(/^(№|п\/п|фио|студент|список|группа)/i)) continue;
        const cleaned = trimmed.replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim();
        if (cleaned) {
          students.push(cleaned);
        }
      }
    }

    return Array.from(new Set(students));
  }
}
