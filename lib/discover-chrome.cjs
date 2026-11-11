/**
 * Discover the OpenI username/password saved in a local Chrome profile.
 * Output is a single JSON line. The secret is returned to the calling plugin,
 * never written to disk, and the temporary Login Data copy is removed.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function arg(name) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : '';
}

const baseUrl = (arg('base-url') || 'https://openi.pcl.ac.cn').replace(/\/$/, '');
const host = new URL(baseUrl).hostname;
const userData = arg('user-data') || path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Google', 'Chrome', 'User Data',
);
const onlyProfile = arg('profile');

function aesKey() {
  const localState = path.join(userData, 'Local State');
  if (!fs.existsSync(localState)) throw new Error(`Chrome Local State not found: ${localState}`);
  const ps = [
    'Add-Type -AssemblyName System.Security;',
    `$ls = Get-Content '${localState.replace(/'/g, "''")}' -Raw | ConvertFrom-Json;`,
    '$k = [Convert]::FromBase64String($ls.os_crypt.encrypted_key);',
    '$e = $k[5..($k.Length-1)];',
    '$p = [System.Security.Cryptography.ProtectedData]::Unprotect($e, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);',
    '[Convert]::ToBase64String($p)',
  ].join(' ');
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8', windowsHide: true, timeout: 30000,
  }).trim();
  if (!out) throw new Error('DPAPI could not decrypt the Chrome encryption key');
  return Buffer.from(out, 'base64');
}

function decrypt(blob, key) {
  if (blob.subarray(0, 3).toString() === 'v10' || blob.subarray(0, 3).toString() === 'v11') {
    const nonce = blob.subarray(3, 15);
    const tag = blob.subarray(blob.length - 16);
    const body = blob.subarray(15, blob.length - 16);
    const dec = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    dec.setAuthTag(tag);
    return Buffer.concat([dec.update(body), dec.final()]).toString('utf8');
  }
  const ps = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String('${blob.toString('base64')}'); $p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Text.Encoding]::UTF8.GetString($p)`;
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8', windowsHide: true, timeout: 30000,
  }).trim();
}

function profiles() {
  if (onlyProfile) return [path.join(userData, onlyProfile)];
  if (!fs.existsSync(userData)) return [];
  return fs.readdirSync(userData, { withFileTypes: true })
    .filter(d => d.isDirectory() && (d.name === 'Default' || /^Profile \d+$/.test(d.name)))
    .map(d => path.join(userData, d.name));
}

function main() {
  if (process.platform !== 'win32') throw new Error('Chrome credential discovery requires Windows');
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); }
  catch { throw new Error('Chrome credential discovery requires Node.js 22+; use manual sign-in instead'); }
  let key = null;
  const attempts = [];
  for (const dir of profiles()) {
    const dbPath = path.join(dir, 'Login Data');
    if (!fs.existsSync(dbPath)) continue;
    const tmp = path.join(os.tmpdir(), `dsh-openi-logins-${process.pid}-${path.basename(dir).replace(/\W/g, '')}.db`);
    let row = null;
    try {
      fs.copyFileSync(dbPath, tmp);
      const db = new DatabaseSync(tmp);
      row = db.prepare('select username_value, password_value from logins where origin_url = ? or signon_realm = ?')
        .get(`${baseUrl}/user/login`, baseUrl) ||
        db.prepare('select username_value, password_value from logins where origin_url like ?')
          .get(`%${host}%`);
      db.close();
    } catch (error) {
      attempts.push(`${path.basename(dir)}: ${error.message}`);
    } finally {
      try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    }
    if (row && row.password_value) {
      if (!key) key = aesKey();
      const password = decrypt(Buffer.from(row.password_value), key);
      if (password) {
        process.stdout.write(JSON.stringify({
          username: String(row.username_value || ''),
          password,
          chromeUserData: userData,
          chromeProfile: path.basename(dir),
        }));
        return;
      }
    }
    attempts.push(`${path.basename(dir)}: no OpenI password`);
  }
  throw new Error(`No saved OpenI password found in Chrome. ${attempts.join('; ')}`);
}

try { main(); }
catch (error) {
  process.stderr.write(String(error.message || error));
  process.exit(1);
}
