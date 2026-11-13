import { HttpError } from './httpUtils.js';

export interface MultipartResult {
  fields: Record<string, string>;
  files: Array<{ filename: string; data: Buffer }>;
}

export function multipartBoundary(contentType: string): string {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (match?.[1] || match?.[2] || '').trim();
  if (!boundary || boundary.length > 200 || /[\r\n]/.test(boundary)) {
    throw new HttpError(400, 'Некорректный multipart boundary');
  }
  return boundary;
}

export function parseMultipart(body: Buffer, boundary: string): MultipartResult {
  if (!boundary || boundary.length > 200 || /[\r\n]/.test(boundary)) {
    throw new HttpError(400, 'Некорректный multipart boundary');
  }
  const fields: Record<string, string> = Object.create(null);
  const files: MultipartResult['files'] = [];
  const delimiter = Buffer.from(`\r\n--${boundary}`);
  const opening = Buffer.from(`--${boundary}\r\n`);
  if (!body.subarray(0, opening.length).equals(opening)) throw new HttpError(400, 'Некорректный multipart запрос');
  let start = opening.length;
  let parts = 0;
  while (start < body.length) {
    const end = body.indexOf(delimiter, start);
    if (end < 0) throw new HttpError(400, 'Multipart запрос не завершён');
    if (++parts > 30) throw new HttpError(413, 'Слишком много частей multipart');
    const part = body.subarray(start, end);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd < 0 || headerEnd > 8192) throw new HttpError(400, 'Некорректные заголовки multipart');
    const header = part.subarray(0, headerEnd).toString('utf8');
    const data = part.subarray(headerEnd + 4);
    const name = header.match(/\bname="([^"]+)"/i)?.[1];
    const filename = header.match(/\bfilename="([^"]*)"/i)?.[1];
    if (!name) throw new HttpError(400, 'Не указано имя части multipart');
    if (filename !== undefined) files.push({ filename, data });
    else {
      if (data.length > 8192) throw new HttpError(413, 'Слишком большое поле multipart');
      fields[name] = data.toString('utf8');
    }
    start = end + delimiter.length;
    if (body.subarray(start, start + 2).toString() === '--') return { fields, files };
    if (body.subarray(start, start + 2).toString() !== '\r\n') throw new HttpError(400, 'Некорректный разделитель multipart');
    start += 2;
  }
  throw new HttpError(400, 'Multipart запрос не завершён');
}
