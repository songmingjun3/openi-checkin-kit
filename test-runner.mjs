/**
 * Round-trip test for the generated scheduled-task runner and DPAPI seal.
 * No network call: the engine is invoked with --help after decrypting.
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
let z = null, credentialKey = null;
${body}
export { ensureRunner, persistRuntimeConfig, runtimeConfig, SEALED_FILE, STATE_DIR };
`;
const testFile = path.join(temp, 'harness.mjs');
fs.writeFileSync(testFile, harness, 'utf8');
const m = await import(pathToFileURL(testFile).href);
const secret = { baseUrl: 'https://openi.pcl.ac.cn', source: 'cookie', username: '', password: '', cookie: 'a=b', chromeUserData: '', chromeProfile: '' };
m.persistRuntimeConfig(m.runtimeConfig(secret));
const runner = m.ensureRunner();
const wrapper = path.join(m.STATE_DIR, 'help-wrapper.cjs');
const engine = path.join(process.cwd(), 'lib', 'openi-checkin.cjs');
fs.writeFileSync(wrapper, `
const fs = require('node:fs'); const path = require('node:path'); const { execFileSync } = require('node:child_process');
const sealed = ${JSON.stringify(m.SEALED_FILE)};
const base64 = fs.readFileSync(sealed, 'utf8').trim();
const ps = "Add-Type -AssemblyName System.Security; $s=[Convert]::FromBase64String('" + base64 + "'); $b=[System.Security.Cryptography.ProtectedData]::Unprotect($s,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Convert]::ToBase64String($b)";
const json = Buffer.from(execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',ps], { encoding: 'utf8', windowsHide: true }).trim(), 'base64').toString('utf8');
const cfg = JSON.parse(json);
if (cfg.cookie !== 'a=b') throw new Error('seal did not round-trip');
const out = execFileSync(process.execPath, [${JSON.stringify(engine)}, '--help'], { encoding: 'utf8' });
if (!out.includes('OpenI')) throw new Error('engine help missing');
console.log('sealed runner: OK');
`, 'utf8');
const output = execFileSync(node, [wrapper], { encoding: 'utf8', cwd: process.cwd() });
assert.match(output, /sealed runner: OK/);
assert.ok(fs.existsSync(runner));
fs.rmSync(temp, { recursive: true, force: true });
console.log('OpenI runner round-trip: OK');
