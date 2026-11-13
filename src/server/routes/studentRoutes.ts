import http from 'http';
import { URL } from 'url';
import { StudentService } from '../../services/studentService.js';
import {
  sendJson, sendError, readBody, readJsonBody, HttpError,
  MAX_STUDENT_UPLOAD_BYTES, isSupportedUploadSignature, safeUploadFilename,
} from '../httpUtils.js';
import { parseMultipart, multipartBoundary } from '../multipartParser.js';
import { ZodError } from 'zod';
import { StudentUpdateSchema, StudentListSchema, GroupSchema, validationMessage } from '../validation.js';

export async function handleStudentRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  parsedUrl: URL,
  students: StudentService
): Promise<boolean> {
  if (pathname === '/api/students' && req.method === 'GET') {
    const groupParam = parsedUrl.searchParams.get('group');
    if (groupParam) {
      const group = GroupSchema.safeParse(groupParam);
      if (!group.success) { sendError(res, 'Некорректная группа'); return true; }
      sendJson(res, { success: true, group: group.data, students: students.getStudents(group.data) });
    } else {
      const groups = students.getGroups();
      const all: Record<string, string[]> = {};
      for (const group of groups) all[group] = students.getStudents(group);
      sendJson(res, { success: true, groups, studentsByGroup: all });
    }
    return true;
  }

  if (pathname === '/api/students' && req.method === 'POST') {
    try {
      const payload = StudentUpdateSchema.parse(await readJsonBody(req));
      if (payload.students) students.setStudents(payload.group, payload.students);
      else if (payload.student) students.addStudent(payload.group, payload.student);
      sendJson(res, { success: true, group: payload.group, students: students.getStudents(payload.group) });
    } catch (error) {
      if (error instanceof HttpError) sendError(res, error.message, error.statusCode);
      else if (error instanceof ZodError) sendError(res, validationMessage(error));
      else throw error;
    }
    return true;
  }

  if (pathname === '/api/students' && req.method === 'DELETE') {
    const group = GroupSchema.safeParse(parsedUrl.searchParams.get('group') || '');
    const student = parsedUrl.searchParams.get('student') || '';
    if (!group.success || !student.trim()) { sendError(res, 'Необходимо указать корректные group и student'); return true; }
    const success = students.removeStudent(group.data, student);
    sendJson(res, { success, students: students.getStudents(group.data) });
    return true;
  }

  if (pathname === '/api/students/upload' && req.method === 'POST') {
    try {
      const contentType = req.headers['content-type'] || '';
      const bodyBuffer = await readBody(req, MAX_STUDENT_UPLOAD_BYTES);
      let fileBuffer: Buffer | null = null;
      let filename = 'students.txt';
      let groupName = parsedUrl.searchParams.get('group') || '';

      if (contentType.toLowerCase().includes('multipart/form-data')) {
        const parsed = parseMultipart(bodyBuffer, multipartBoundary(contentType));
        const file = parsed.files[0];
        if (file) { fileBuffer = file.data; filename = file.filename; }
        if (parsed.fields.group) groupName = parsed.fields.group;
      } else fileBuffer = bodyBuffer;

      const safeName = safeUploadFilename(filename, 'students.txt');
      const group = GroupSchema.safeParse(groupName);
      if (!fileBuffer || !fileBuffer.length) throw new HttpError(400, 'Файл не найден или пуст');
      if (!safeName || !group.success) throw new HttpError(400, 'Некорректное имя файла или группа');
      if (!isSupportedUploadSignature(fileBuffer, safeName, 'students')) throw new HttpError(400, 'Недопустимый формат или сигнатура файла');

      const parsedList = StudentListSchema.parse(students.parseStudentFile(fileBuffer, safeName));
      if (!parsedList.length) throw new HttpError(400, 'В файле не удалось обнаружить имена студентов');
      students.setStudents(group.data, parsedList);
      sendJson(res, { success: true, message: `Загружено ${parsedList.length} студентов для группы ${group.data}`, group: group.data, students: students.getStudents(group.data) });
    } catch (error) {
      if (error instanceof HttpError) sendError(res, error.message, error.statusCode);
      else if (error instanceof ZodError) sendError(res, validationMessage(error));
      else throw error;
    }
    return true;
  }

  return false;
}
