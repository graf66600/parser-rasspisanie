export interface MultipartResult {
  fields: Record<string, string>;
  files: Array<{ filename: string; data: Buffer }>;
}

export function parseMultipart(body: Buffer, boundary: string): MultipartResult {
  const fields: Record<string, string> = {};
  const files: Array<{ filename: string; data: Buffer }> = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);

  let start = 0;
  while (start < body.length) {
    const boundaryIndex = body.indexOf(boundaryBuffer, start);
    if (boundaryIndex === -1) break;

    const nextBoundaryIndex = body.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
    if (nextBoundaryIndex === -1) break;

    const partBuffer = body.subarray(boundaryIndex + boundaryBuffer.length, nextBoundaryIndex);
    const headerEndIndex = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEndIndex !== -1) {
      const headerStr = partBuffer.subarray(0, headerEndIndex).toString('utf8');
      let data = partBuffer.subarray(headerEndIndex + 4);
      if (data.subarray(data.length - 2).toString() === '\r\n') {
        data = data.subarray(0, data.length - 2);
      }

      const nameMatch = headerStr.match(/name="([^"]+)"/);
      const filenameMatch = headerStr.match(/filename="([^"]+)"/);

      if (filenameMatch && filenameMatch[1]) {
        files.push({ filename: filenameMatch[1], data });
      } else if (nameMatch && nameMatch[1]) {
        fields[nameMatch[1]] = data.toString('utf8');
      }
    }
    start = nextBoundaryIndex;
  }

  return { fields, files };
}
