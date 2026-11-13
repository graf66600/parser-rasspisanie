import http from 'http';
import fs from 'fs';
import path from 'path';

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

export const MAX_JSON_BODY_BYTES = 1024 * 1024;
export const MAX_UPLOAD_BODY_BYTES = 25 * 1024 * 1024;
export const MAX_STUDENT_UPLOAD_BYTES = 5 * 1024 * 1024;

export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export function sendJson(res: http.ServerResponse, data: unknown, statusCode = 200): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

export function sendError(res: http.ServerResponse, message: string, statusCode = 400): void {
  sendJson(res, { success: false, error: message }, statusCode);
}

export function readBody(req: http.IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject(new HttpError(413, 'Размер тела запроса превышает допустимый лимит'));
      req.resume();
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const part = Buffer.from(chunk);
      size += part.length;
      if (size > maxBytes) {
        chunks.length = 0;
        fail(new HttpError(413, 'Размер тела запроса превышает допустимый лимит'));
        return;
      }
      chunks.push(part);
    });
    req.on('end', () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('aborted', () => fail(new HttpError(400, 'Запрос прерван')));
    req.on('error', (error) => fail(error));
  });
}

export async function readJsonBody(
  req: http.IncomingMessage,
  maxBytes = MAX_JSON_BODY_BYTES
): Promise<Record<string, unknown>> {
  const body = await readBody(req, maxBytes);
  if (!body.length) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Некорректный JSON в теле запроса');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'Тело запроса должно быть JSON-объектом');
  }
  return parsed as Record<string, unknown>;
}

export function safeUploadFilename(filename: string, fallback: string): string | null {
  const value = filename.trim();
  if (!value || value.includes('\0') || value === '.' || value === '..') return null;
  if (path.basename(value) !== value || /[\\/:\x00-\x1f<>"|?*]/.test(value) || /\.\.[\\/]/.test(value)) return null;
  return value || fallback;
}

export function isSupportedUploadSignature(buffer: Buffer, filename: string, kind: 'schedule' | 'students'): boolean {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return kind === 'schedule' && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  if (lower.endsWith('.xlsx')) return buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (lower.endsWith('.xls')) return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  return kind === 'students' && (lower.endsWith('.txt') || lower.endsWith('.csv'));
}

export function errorStatus(error: unknown): number {
  if (error instanceof HttpError) return error.statusCode;
  return 500;
}

export function serveStaticFile(
  res: http.ServerResponse,
  publicDir: string,
  pathname: string
): void {
  const root = path.resolve(publicDir);
  let filePath = path.resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Access Denied');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
  if (!fs.existsSync(filePath)) filePath = path.join(root, 'index.html');
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}
