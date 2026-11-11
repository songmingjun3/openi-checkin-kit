/**
 * Offline contract test for the state and scheduled-task helpers.
 * Uses a temporary HOME so no real credential or scheduled task is touched.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-openi-test-'));
process.env.HOME = temp;
process.env.USERPROFILE = temp;

const source = fs.readFileSync(path.join(process.cwd(), 'index.js'), 'utf8');
const body = source
  .replace(/^import[\s\S]*?from 'node:url';\n/m, '')
  .replace(/^const localRequire[\s\S]*?credentialKey = null; }\n/m, '')
  .replace(/^export const Config[\s\S]*?^\n/m, '')
  .replace(/^export const inject[\s\S]*?^\n/m, '')
  .replace(/^export function apply[\s\S]*$/m, '');
const harness = `
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let z = null, credentialKey = null;
${body}
export { taskXml, runtimeConfig, readState, writeState, atomicWrite, persistRuntimeConfig, sealRuntimeConfig, ensureRunner, STATE_DIR, STATE_FILE, RUNTIME_FILE, SEALED_FILE, TIME_RE, minutes, clock };
`;
const testFile = path.join(temp, 'harness.mjs');
fs.writeFileSync(testFile, harness, 'utf8');
const m = await import(pathToFileURL(testFile).href);

assert.equal(m.clock('09:30', '09:00'), '09:30');
assert.equal(m.clock('bad', '09:00'), '09:00');
assert.equal(m.minutes('10:00') - m.minutes('09:00'), 60);

m.writeState({ source: 'cookie', username: 'tester' });
assert.equal(m.readState().username, 'tester');
assert.ok(fs.existsSync(m.STATE_FILE));

const secret = {
  baseUrl: 'https://openi.pcl.ac.cn', source: 'cookie', username: '', password: '',
  cookie: 'a=b', chromeUserData: '', chromeProfile: '',
};
const config = m.runtimeConfig(secret);
assert.equal(config.baseUrl, 'https://openi.pcl.ac.cn');
assert.equal(config.cookie, 'a=b');
assert.equal(config.logFile, path.join(m.STATE_DIR, 'openi-checkin.log'));

m.persistRuntimeConfig(config);
if (process.platform === 'win32') {
  assert.ok(fs.existsSync(m.SEALED_FILE));
  assert.ok(m.sealRuntimeConfig(config).length > 100);
} else {
  assert.ok(fs.existsSync(m.RUNTIME_FILE));
}
const xml = m.taskXml('09:15', '10:45');
assert.match(xml, /<StartBoundary>\d{4}-\d{2}-\d{2}T09:15:00<\/StartBoundary>/);
assert.match(xml, /<RandomDelay>PT1H30M<\/RandomDelay>/);
assert.match(xml, /run\.cjs/);
const runner = fs.readFileSync(path.join(m.STATE_DIR, 'run.cjs'), 'utf8');
assert.match(runner, /runtime-config/);
assert.match(runner, /--config=/);

fs.rmSync(temp, { recursive: true, force: true });
console.log('OpenI plugin helper tests: OK');
