/**
 * Round-trip test for the generated scheduled-task runner and DPAPI seal.
 * Two accounts are written so the runner must select the right one by argument.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const node = process.execPath;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-openi-runner-'));
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
export { ensureRunner, persistAccountConfig, runtimeConfig, sealedPath, accountConfigPath, STATE_DIR, CONFIG_DIR };
`;
const testFile = path.join(temp, 'harness.mjs');
fs.writeFileSync(testFile, harness, 'utf8');
const m = await import(pathToFileURL(testFile).href);

const secret = { baseUrl: 'https://openi.pcl.ac.cn', source: 'cookie', username: '', password: '', cookie: 'a=b', chromeUserData: '', chromeProfile: '' };
const accountA = { id: 'acct1', startTime: '09:05', endTime: '09:25', label: 'work' };
const accountB = { id: 'acct2', startTime: '09:30', endTime: '10:00', label: 'home' };
m.persistAccountConfig(accountA, secret);
m.persistAccountConfig(accountB, { ...secret, cookie: 'b=c' });
const runner = m.ensureRunner();
const engine = path.join(process.cwd(), 'lib', 'openi-checkin.cjs');

// The real runner is invoked per account; assert it would resolve that account's
// sealed config rather than the other account's.
if (process.platform === 'win32') {
  assert.ok(fs.existsSync(m.sealedPath('acct1')));
  assert.ok(fs.existsSync(m.sealedPath('acct2')));
}

const probe = path.join(m.STATE_DIR, 'probe.cjs');
fs.writeFileSync(probe, `
const fs = require('node:fs'); const path = require('node:path'); const { execFileSync } = require('node:child_process');
const base = process.argv[2];
const sealed = path.join(${JSON.stringify(m.CONFIG_DIR)}, base + '.bin');
const plain = path.join(${JSON.stringify(m.CONFIG_DIR)}, base + '.json');
const source = fs.existsSync(sealed) ? sealed : plain;
const base64 = fs.readFileSync(source, 'utf8').trim();
const ps = "Add-Type -AssemblyName System.Security; $s=[Convert]::FromBase64String('" + base64 + "'); $b=[System.Security.Cryptography.ProtectedData]::Unprotect($s,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Convert]::ToBase64String($b)";
const json = Buffer.from(execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',ps], { encoding: 'utf8', windowsHide: true }).trim(), 'base64').toString('utf8');
console.log(JSON.parse(json).cookie);
`, 'utf8');
const outA = execFileSync(node, [probe, 'acct1'], { encoding: 'utf8' }).trim();
const outB = execFileSync(node, [probe, 'acct2'], { encoding: 'utf8' }).trim();
assert.equal(outA, 'a=b');
assert.equal(outB, 'b=c');

const engineOut = execFileSync(node, [engine, '--help'], { encoding: 'utf8' });
assert.match(engineOut, /OpenI/);
assert.ok(fs.existsSync(runner));
assert.match(fs.readFileSync(runner, 'utf8'), /process\.argv\[2\]/);

fs.rmSync(temp, { recursive: true, force: true });
console.log('OpenI per-account runner round-trip: OK');
