import http from 'http';
import { URL } from 'url';
import { StudentService } from '../../services/studentService.js';
import { sendJson, sendError, readBody } from '../httpUtils.js';
import { parseMultipart } from '../multipartParser.js';

export async function handleStudentRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  parsedUrl: URL,
  students: StudentService
): Promise<boolean> {
  // 1. Студенты: получение списков
  if (pathname === '/api/students' && req.method === 'GET') {
    const groupParam = parsedUrl.searchParams.get('group');
    if (groupParam) {
      const list = students.getStudents(groupParam);
      sendJson(res, { success: true, group: groupParam, students: list });
    } else {
      const groups = students.getGroups();
      const all: Record<string, string[]> = {};
      for (const g of groups) {
        all[g] = students.getStudents(g);
      }
      sendJson(res, { success: true, groups, studentsByGroup: all });
    }
    return true;
  }

  // 2. Студенты: сохранение / добавление вручную
  if (pathname === '/api/students' && req.method === 'POST') {
    const bodyBuffer = await readBody(req);
    const payload = JSON.parse(bodyBuffer.toString('utf8') || '{}');
    const { group, students: studentList, student } = payload;

    if (!group) {
      sendError(res, 'Не указана группа');
      return true;
    }

    if (Array.isArray(studentList)) {
      students.setStudents(group, studentList);
    } else if (student && typeof student === 'string') {
      students.addStudent(group, student);
    } else {
      sendError(res, 'Не переданы данные студентов');
      return true;
    }

    const updated = students.getStudents(group);
    sendJson(res, { success: true, group, students: updated });
    return true;
  }

  // 3. Студенты: удаление
  if (pathname === '/api/students' && req.method === 'DELETE') {
    const group = parsedUrl.searchParams.get('group') || '';
    const student = parsedUrl.searchParams.get('student') || '';
    if (!group || !student) {
      sendError(res, 'Необходимо указать group и student');
      return true;
    }
    const ok = students.removeStudent(group, student);
    sendJson(res, { success: ok, students: students.getStudents(group) });
    return true;
  }

  // 4. Студенты: загрузка через файл
  if (pathname === '/api/students/upload' && req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';
    const bodyBuffer = await readBody(req);
    let fileBuffer: Buffer | null = null;
    let filename = 'students.txt';
    let groupName = parsedUrl.searchParams.get('group') || '';

    if (contentType.includes('multipart/form-data')) {
      const boundary = contentType.split('boundary=')[1];
      if (boundary) {
        const parsed = parseMultipart(bodyBuffer, boundary.trim());
        if (parsed.files.length > 0) {
          fileBuffer = parsed.files[0].data;
          filename = parsed.files[0].filename;
        }
        if (parsed.fields.group) {
          groupName = parsed.fields.group;
        }
      }
    } else {
      fileBuffer = bodyBuffer;
    }

    if (!fileBuffer) {
      sendError(res, 'Файл не найден');
      return true;
    }

    if (!groupName) {
      sendError(res, 'Укажите группу для привязки студентов');
      return true;
    }

    const parsedList = students.parseStudentFile(fileBuffer, filename);
    if (parsedList.length === 0) {
      sendError(res, 'В файле не удалось обнаружить имена студентов');
      return true;
    }

    students.setStudents(groupName, parsedList);
    sendJson(res, {
      success: true,
      message: `Загружено ${parsedList.length} студентов для группы ${groupName}`,
      group: groupName,
      students: students.getStudents(groupName),
    });
    return true;
  }

  return false;
}
