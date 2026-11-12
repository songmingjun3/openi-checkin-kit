/**
 * Offline contract test for the state, per-account task and sealing helpers.
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
let credentialKey = null;
${body}
export { taskXml, runtimeConfig, readState, writeState, atomicWrite, ensureRunner, sealBytes,
  taskNameFor, accountConfigPath, sealedPath, logPathFor, logDirFor, inWindow, minutes, clock,
  STATE_DIR, STATE_FILE, CONFIG_DIR, LOG_DIR, TASK_PREFIX };
`;
const testFile = path.join(temp, 'harness.mjs');
fs.writeFileSync(testFile, harness, 'utf8');
const m = await import(pathToFileURL(testFile).href);

assert.equal(m.clock('09:30', '09:00'), '09:30');
assert.equal(m.clock('bad', '09:00'), '09:00');
assert.equal(m.minutes('10:00') - m.minutes('09:00'), 60);
assert.equal(m.inWindow('09:30', '09:00', '10:00'), true);
assert.equal(m.inWindow('10:30', '09:00', '10:00'), false);
assert.equal(m.inWindow('08:59', '09:00', '10:00'), false);

m.writeState({ accounts: { acct1: { enabled: true, startTime: '09:10', endTime: '09:40' } } });
assert.equal(m.readState().accounts.acct1.startTime, '09:10');
assert.ok(fs.existsSync(m.STATE_FILE));

// Per-account identity: task names, config and log paths never collide.
assert.equal(m.taskNameFor('acct1'), `${m.TASK_PREFIX}-acct1`);
assert.notEqual(m.taskNameFor('acct1'), m.taskNameFor('acct2'));
assert.equal(m.accountConfigPath('acct1'), path.join(m.CONFIG_DIR, 'acct1.json'));
assert.equal(m.sealedPath('acct2'), path.join(m.CONFIG_DIR, 'acct2.bin'));
// Each account's log lives in its own directory: the engine's lock is derived
// from dirname(logFile), so a shared directory would serialize all accounts.
const logA = m.logPathFor('acct1');
const logB = m.logPathFor('acct2');
assert.equal(path.dirname(logA), path.join(m.LOG_DIR, 'acct1'));
assert.notEqual(path.dirname(logA), path.dirname(logB), 'accounts must not share a lock directory');
assert.ok(logA.endsWith('openi-checkin.log'));

// The engine's lock makes same-account runs exclusive; different accounts must
// not sink each other's run, which is why the log directories must differ.
assert.equal(path.join(path.dirname(logA), '.openi-checkin.lock') === path.join(path.dirname(logB), '.openi-checkin.lock'), false);

const secret = {
  baseUrl: 'https://openi.pcl.ac.cn', source: 'cookie', username: '', password: '',
  cookie: 'a=b', chromeUserData: '', chromeProfile: '',
};
const account = { id: 'acct1', startTime: '09:12', endTime: '09:47', label: 'work' };
const config = m.runtimeConfig(secret, account);
assert.equal(config.baseUrl, 'https://openi.pcl.ac.cn');
assert.equal(config.cookie, 'a=b');
assert.equal(config.credentialSource, 'cookie');
// A resolved Chrome credential is handed over as explicit plain credentials so
// the engine cannot re-scan Chrome and authenticate a different account.
const chromeConfig = m.runtimeConfig({ ...secret, source: 'chrome', username: 'shanehongyu', password: 'pw' }, account);
assert.equal(chromeConfig.credentialSource, 'plain');
assert.equal(chromeConfig.username, 'shanehongyu');
assert.equal(chromeConfig.password, 'pw');
assert.equal(config.taskName, `${m.TASK_PREFIX}-acct1`);
assert.equal(config.startTime, '09:12');
assert.ok(config.logFile.endsWith(path.join('acct1', 'openi-checkin.log')));

// Each account's task carries its own start boundary, random-delay window and config argument.
const xml1 = m.taskXml(account);
assert.match(xml1, /<StartBoundary>\d{4}-\d{2}-\d{2}T09:12:00<\/StartBoundary>/);
assert.match(xml1, /<RandomDelay>PT35M<\/RandomDelay>/);
assert.match(xml1, /&quot;acct1&quot;/);
const xml2 = m.taskXml({ id: 'acct2', startTime: '09:30', endTime: '10:30', label: 'home' });
assert.match(xml2, /T09:30:00<\/StartBoundary>/);
assert.match(xml2, /<RandomDelay>PT1H<\/RandomDelay>/);
assert.match(xml2, /&quot;acct2&quot;/);

// The runner resolves per-account config by the argument the task passes.
const runner = fs.readFileSync(path.join(m.STATE_DIR, 'run.cjs'), 'utf8');
assert.match(runner, /process\.argv\[2\]/);
assert.match(runner, /"accounts"/);
assert.match(runner, /--config=/);

// DPAPI sealing round-trips (Windows) or falls back to plain JSON (elsewhere).
if (process.platform === 'win32') {
  const sealed = m.sealBytes(config);
  assert.ok(sealed.length > 100);
}

fs.rmSync(temp, { recursive: true, force: true });
console.log('OpenI plugin helper tests: OK');
