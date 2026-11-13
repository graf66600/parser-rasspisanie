const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-parser-test-'));
process.env.DATA_DIR = dataDir;
process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_ANON_KEY = 'test-key';

const emptyResponse = () => ({ ok: false, status: 503, json: async () => ({}) });
global.fetch = async () => emptyResponse();
process.env.TEST_DATA_DIR = dataDir;

process.on('exit', () => {
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
});
