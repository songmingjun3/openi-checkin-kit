/**
 * Discover OpenI usernames/passwords saved in local Chrome profiles.
 *
 * Output is one JSON object on stdout. The secrets are returned to the calling
 * plugin, never written to disk, and every temporary Login Data copy is removed.
 *
 * Modes:
 *   default            -> { username, password, chromeUserData, chromeProfile }
 *   --list             -> { accounts: [{ username, chromeProfile, lastUsed, timesUsed }] }
 *   --username=<name>  -> pick that exact account; also accepts a 1-based --index
 *
 * Chrome may hold several saved logins for the same site; the newest-used one is
 * preferred, because returning whichever row happened to be first in the table is
 * what made a freshly added account resolve to an older one.
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
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const baseUrl = (arg('base-url') || 'https://openi.pcl.ac.cn').replace(/\/$/, '');
const host = new URL(baseUrl).hostname;
const userData = arg('user-data') || path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Google', 'Chrome', 'User Data',
);
const onlyProfile = arg('profile');
const wantedUser = arg('username');
const wantedIndex = Number(arg('index') || 0);

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

/** Every saved OpenI login across profiles, newest-used first. */
function rowsFor(DatabaseSync) {
  const found = [];
  const attempts = [];
  for (const dir of profiles()) {
    const dbPath = path.join(dir, 'Login Data');
    if (!fs.existsSync(dbPath)) continue;
    const tmp = path.join(os.tmpdir(), `dsh-openi-logins-${process.pid}-${path.basename(dir).replace(/\W/g, '')}.db`);
    try {
      fs.copyFileSync(dbPath, tmp);
      const db = new DatabaseSync(tmp);
      const rows = db.prepare(
        "select username_value, password_value, CAST(date_last_used AS TEXT) as last_used, CAST(times_used AS TEXT) as times_used " +
        'from logins where origin_url = ? or signon_realm = ? or origin_url like ? ' +
        'order by date_last_used desc, times_used desc',
      ).all(`${baseUrl}/user/login`, baseUrl, `%${host}%`);
      for (const row of rows) {
        if (!row || !row.password_value) continue;
        const username = String(row.username_value || '');
        // A repo-migration entry can store a URL as its "username"; those are not
        // accounts and must not appear in the picker.
        if (username.includes('://')) continue;
        found.push({
          username,
          passwordBlob: Buffer.from(row.password_value),
          lastUsed: Number(row.last_used || 0),
          timesUsed: Number(row.times_used || 0),
          chromeProfile: path.basename(dir),
        });
      }
      db.close();
    } catch (error) {
      attempts.push(`${path.basename(dir)}: ${error.message}`);
    } finally {
      try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    }
  }
  return { found, attempts };
}

function main() {
  if (process.platform !== 'win32') throw new Error('Chrome credential discovery requires Windows');
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); }
  catch { throw new Error('Chrome credential discovery requires Node.js 22+; use manual sign-in instead'); }

  const { found, attempts } = rowsFor(DatabaseSync);
  if (flag('list')) {
    const accounts = found.map(row => ({
      username: row.username,
      chromeProfile: row.chromeProfile,
      lastUsed: row.lastUsed || null,
      timesUsed: row.timesUsed || 0,
    }));
    process.stdout.write(JSON.stringify({ accounts, attempts }));
    return;
  }
  if (found.length === 0) {
    throw new Error(`No saved OpenI password found in Chrome. ${attempts.join('; ')}`);
  }

  let pick = null;
  if (wantedUser) pick = found.find(row => row.username === wantedUser) || null;
  else if (wantedIndex > 0) pick = found[wantedIndex - 1] || null;
  if (wantedUser && !pick) {
    throw new Error(`No saved OpenI password for "${wantedUser}" in Chrome. Saved accounts: ${found.map(r => r.username || '(blank)').join(', ')}`);
  }
  if (wantedIndex > 0 && !pick) {
    throw new Error(`Chrome has only ${found.length} saved OpenI password(s); index ${wantedIndex} is out of range`);
  }
  if (!pick) pick = found[0];

  const key = aesKey();
  const password = decrypt(pick.passwordBlob, key);
  if (!password) throw new Error(`Could not decrypt the saved password for "${pick.username}"`);

  process.stdout.write(JSON.stringify({
    username: pick.username,
    password,
    chromeUserData: userData,
    chromeProfile: pick.chromeProfile,
    savedAccounts: found.map(row => row.username).filter(Boolean),
  }));
}

try { main(); }
catch (error) {
  process.stderr.write(String(error.message || error));
  process.exit(1);
}
