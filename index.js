/**
 * OpenI daily check-in - DeepSeek Harness Host plugin (multi-account).
 *
 * The kit's engine is copied into lib/openi-checkin.cjs. This plugin adapts it
 * to the Harness with one independent account per profile:
 *   - each account keeps its own secret in a credential record;
 *   - each account has its own random daily window inside the global window;
 *   - each account gets its own Windows Scheduled Task and in-process timer;
 *   - one Host service backs the settings-page route and the agent tool.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const localRequire = createRequire(import.meta.url);
const localDefineTool = localRequire('./lib/tool.cjs').defineTool;
// Prefer the local schema builder: it emits raw JSON Schema the registry accepts
// and never rejects nested array/object parameters. The official helper is only
// a fallback when the local one is unavailable.
let officialDefineTool = null;
try { const tools = await import('@deepseek-ai/dsh-tools'); officialDefineTool = tools.defineTool ?? tools.default?.defineTool ?? null; } catch { officialDefineTool = null; }
const defineTool = localDefineTool ?? officialDefineTool;
let credentialKey = null;
try { const credentials = await import('@deepseek-ai/dsh-credentials'); credentialKey = credentials.credentialKey ?? credentials.default?.credentialKey; } catch { credentialKey = null; }

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(PACKAGE_DIR, 'lib', 'openi-checkin.cjs');
const DISCOVERY = path.join(PACKAGE_DIR, 'lib', 'discover-chrome.cjs');
const STATE_DIR = path.join(os.homedir(), '.dsh', 'openi-checkin');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const CONFIG_DIR = path.join(STATE_DIR, 'accounts');
const LOG_DIR = path.join(STATE_DIR, 'logs');
const LOGIN_URL = 'https://openi.pcl.ac.cn/user/login';
const RECORD_SCOPE = 'openi-checkin';
const TASK_PREFIX = 'OpenI-Daily-Checkin-DSH';

/** Plugin configuration rendered as editable settings and persisted in the user's patch. */
export const Config = localRequire('./lib/config.cjs').Config;

export const inject = ['credentials', 'timer'];
export const name = 'openi-checkin';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const SOURCES = new Set(['chrome', 'plain', 'cookie']);
const MAX_ACCOUNTS = 20;

function text(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function clock(value, fallback) {
  const raw = text(value, 8);
  return TIME_RE.test(raw) ? raw : fallback;
}

function minutes(value) {
  const [, h, m] = TIME_RE.exec(value);
  return Number(h) * 60 + Number(m);
}

function inWindow(value, start, end) {
  if (!TIME_RE.test(value)) return false;
  const at = minutes(value);
  return at >= minutes(start) && at <= minutes(end);
}

function errorOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function writeState(patch) {
  const next = { ...readState(), ...patch };
  atomicWrite(STATE_FILE, next);
  return next;
}

/** Atomically write a UTF-8 JSON file inside this plugin's owned state directory. */
function atomicWrite(file, value) {
  atomicWriteBytes(file, Buffer.from(JSON.stringify(value, null, 2), 'utf8'));
}

function atomicWriteBytes(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}-${process.pid}.tmp`);
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function randomBetween(start, end) {
  return Math.floor(start + Math.random() * Math.max(0, end - start));
}

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function taskNameFor(accountId) {
  return `${TASK_PREFIX}-${accountId}`;
}

function accountConfigPath(accountId) {
  return path.join(CONFIG_DIR, `${accountId}.json`);
}

function sealedPath(accountId) {
  return path.join(CONFIG_DIR, `${accountId}.bin`);
}

function logPathFor(accountId) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  return path.join(LOG_DIR, `${accountId}.log`);
}

function recordKey(accountId) {
  const id = accountId === 'default' ? 'account' : `account-${accountId}`;
  return credentialKey ? credentialKey(RECORD_SCOPE, id) : `${RECORD_SCOPE}/${id}`;
}

/** Build the exact config file consumed by the unmodified engine. */
function runtimeConfig(secret, account) {
  return {
    baseUrl: secret.baseUrl,
    credentialSource: secret.source,
    username: secret.username,
    password: secret.password,
    cookie: secret.cookie,
    chromeUserData: secret.chromeUserData,
    chromeProfile: secret.chromeProfile,
    specMatcher: { compute_resource: 'GPU', acc_card_type: 'V100', acc_cards_num: 0, cpu_cores: 4, mem_gi_b: 32 },
    clusterType: 'C2Net',
    computeSource: 'GPU',
    jobType: 'DEBUG',
    imageUrl: 'liuzx/ubuntu22.04-cuda11.8.0-py310-torch2.1.0-tf2.14.0',
    timeLimitHours: 4,
    maxTaskAgeDays: 30,
    httpTimeoutMs: 30000,
    logFile: logPathFor(account.id),
    startTime: account.startTime,
    randomDelay: 'PT0S',
    taskName: taskNameFor(account.id),
  };
}

/** Windows: seal one account's runtime config with the current user's DPAPI key. */
function sealBytes(value) {
  if (process.platform !== 'win32') return null;
  const input = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
  // ASCII base64 as a command argument: PowerShell console stdin uses the OEM
  // code page and adds a BOM, which corrupts UTF-8 JSON and even base64.
  const ps = [
    'Add-Type -AssemblyName System.Security;',
    `$b = [Convert]::FromBase64String('${input}');`,
    '$s = [System.Security.Cryptography.ProtectedData]::Protect($b, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);',
    '[Convert]::ToBase64String($s)',
  ].join(' ');
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8', windowsHide: true, timeout: 30000,
  }).replace(/^\uFEFF/, '').trim();
  if (!out) throw new Error('DPAPI sealing failed');
  return Buffer.from(out, 'base64');
}

/** Persist one account's engine config without leaving plaintext at rest. */
function persistAccountConfig(account, secret) {
  const value = runtimeConfig(secret, account);
  const sealed = sealBytes(value);
  if (sealed) atomicWriteBytes(sealedPath(account.id), Buffer.from(sealed.toString('base64'), 'ascii'));
  else atomicWrite(accountConfigPath(account.id), value);
}

function ensureRunner() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const runner = path.join(STATE_DIR, 'run.cjs');
  fs.writeFileSync(runner, [
    "'use strict';",
    'const fs = require("node:fs");',
    'const os = require("node:os");',
    'const path = require("node:path");',
    'const { execFileSync, spawnSync } = require("node:child_process");',
    `const engine = ${JSON.stringify(ENGINE)};`,
    '// args: <sealedOrPlainJsonWithoutExt> - the scheduled task passes the account base name.',
    'const base = process.argv[2];',
    'if (!base) { console.error("missing account config argument"); process.exit(1); }',
    'const sealed = path.join(__dirname, "accounts", base + ".bin");',
    'const plain = path.join(__dirname, "accounts", base + ".json");',
    'let configPath = plain;',
    'let temporary = false;',
    'if (fs.existsSync(sealed)) {',
    '  const base64 = fs.readFileSync(sealed, "utf8").replace(/^\\uFEFF/, "").trim();',
    '  const ps = [',
    '    "Add-Type -AssemblyName System.Security;",',
    '    `$s = [Convert]::FromBase64String(\'${base64}\');`,',
    '    "$b = [System.Security.Cryptography.ProtectedData]::Unprotect($s, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);",',
    '    "[Convert]::ToBase64String($b)"',
    '  ].join(" ");',
    '  const json = Buffer.from(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {',
    '    encoding: "utf8", windowsHide: true, timeout: 30000,',
    '  }).replace(/^\\uFEFF/, "").trim(), "base64").toString("utf8");',
    '  configPath = path.join(os.tmpdir(), `dsh-openi-${process.pid}.json`);',
    '  fs.writeFileSync(configPath, json, { mode: 0o600 });',
    '  temporary = true;',
    '}',
    'const result = spawnSync(process.execPath, [engine, `--config=${configPath}`], { stdio: "inherit" });',
    'if (temporary) { try { fs.rmSync(configPath, { force: true }); } catch {} }',
    'process.exit(result.status ?? 1);',
    '',
  ].join('\n'), 'utf8');
  return runner;
}

function delayOf(startTime, endTime) {
  const span = Math.max(0, minutes(endTime) - minutes(startTime));
  const hours = Math.floor(span / 60);
  const mins = span % 60;
  if (span === 0) return 'PT0S';
  if (hours === 0) return `PT${mins}M`;
  return `PT${hours}H${mins > 0 ? `${mins}M` : ''}`;
}

function taskXml(account) {
  const runner = ensureRunner();
  const today = new Date();
  const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>DSH OpenI check-in (${xmlEscape(account.label)}), ${xmlEscape(account.startTime)}-${xmlEscape(account.endTime)}</Description></RegistrationInfo>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType></Principal></Principals>
  <Settings>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT2H</ExecutionTimeLimit>
  </Settings>
  <Triggers><CalendarTrigger>
    <StartBoundary>${date}T${account.startTime}:00</StartBoundary>
    <Enabled>true</Enabled><RandomDelay>${delayOf(account.startTime, account.endTime)}</RandomDelay>
    <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
  </CalendarTrigger></Triggers>
  <Actions Context="Author"><Exec>
    <Command>${xmlEscape(process.execPath)}</Command>
    <Arguments>${xmlEscape(`"${runner}" "${account.id}"`)}</Arguments>
    <WorkingDirectory>${xmlEscape(STATE_DIR)}</WorkingDirectory>
  </Exec></Actions>
</Task>`;
}

function run(cmd, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${error.message}${stderr ? `: ${String(stderr).slice(0, 500)}` : ''}`));
      else resolve(String(stdout));
    });
  });
}

const taskInfoCache = new Map();

/**
 * Ask Windows Task Scheduler for each task's own next run time and state.
 * This is the authoritative schedule: it holds whether or not DSH is running,
 * while an in-process timer only covers the current session.
 */
async function readTaskInfo(taskNames, timeoutMs = 15000) {
  const result = {};
  for (const taskName of taskNames) result[taskName] = { exists: false, nextRunAt: null, state: null };
  if (process.platform !== 'win32' || taskNames.length === 0) return result;
  const pending = [];
  for (const taskName of taskNames) {
    const cached = taskInfoCache.get(taskName);
    if (cached && Date.now() - cached.at < 15000) result[taskName] = cached.value;
    else pending.push(taskName);
  }
  if (pending.length === 0) return result;
  const ps = [
    'Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue;',
    `$names = @(${pending.map(n => `'${n.replaceAll("'", "''")}'`).join(',')});`,
    'foreach ($n in $names) {',
    '  $t = Get-ScheduledTaskInfo -TaskName $n -ErrorAction SilentlyContinue;',
    '  if ($null -eq $t) { "T|" + $n + "|MISSING||"; continue; };',
    '  $d = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue;',
    '  $next = "";',
    '  if ($null -ne $t.NextRunTime -and $t.NextRunTime.Year -ge 2000 -and $t.NextRunTime.Year -lt 2100) { $next = $t.NextRunTime.ToString("o") };',
    '  "T|" + $n + "|OK|" + $next + "|" + [string]$d.State;',
    '}',
  ].join(' ');
  try {
    const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], timeoutMs);
    for (const line of out.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
      const parts = line.split('|');
      if (parts[0] !== 'T' || parts.length < 5) continue;
      const [, taskName, status, nextRaw, state] = parts;
      const parsed = nextRaw ? new Date(nextRaw) : null;
      const value = {
        exists: status === 'OK',
        nextRunAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
        state: state || null,
      };
      result[taskName] = value;
      taskInfoCache.set(taskName, { at: Date.now(), value });
    }
  } catch { /* task service unavailable: report what the plugin can observe */ }
  return result;
}

/** Open the OpenI login page in the user's system default browser. */
async function openSystemBrowser(url = LOGIN_URL) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Only HTTP(S) login URLs are allowed');
  if (process.platform === 'win32') {
    const script = `Start-Process -FilePath '${parsed.href.replaceAll("'", "'")}' -ErrorAction Stop`;
    await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], 10000);
  } else if (process.platform === 'darwin') {
    await run('/usr/bin/open', [parsed.href], 10000);
  } else {
    await run('xdg-open', [parsed.href], 10000);
  }
  return { opened: true, url: parsed.href };
}

function normalizeSecret(payload = {}) {
  return {
    version: 1,
    source: SOURCES.has(payload.source) ? payload.source : null,
    username: text(payload.username, 300),
    password: text(payload.password, 2000),
    cookie: text(payload.cookie, 12000),
    chromeUserData: text(payload.chromeUserData, 1000),
    chromeProfile: text(payload.chromeProfile, 200),
    baseUrl: text(payload.baseUrl, 500) || 'https://openi.pcl.ac.cn',
  };
}

async function readSecret(credentials, accountId) {
  const record = await credentials.readRecord(recordKey(accountId));
  const payload = record?.kind === 'grant' && record.payload && typeof record.payload === 'object' ? record.payload : {};
  return normalizeSecret(payload);
}

async function saveSecret(credentials, accountId, value) {
  await credentials.modifyRecord(recordKey(accountId), async () => ({ kind: 'grant', payload: value }));
}

async function dropSecret(credentials, accountId) {
  try { await credentials.deleteRecord(recordKey(accountId)); } catch { /* already absent */ }
}

async function discoverChromeCredentials(baseUrl, hint = {}) {
  if (!fs.existsSync(DISCOVERY)) throw new Error(`Chrome credential discovery script is missing: ${DISCOVERY}`);
  const args = [DISCOVERY, '--base-url', baseUrl];
  if (hint.chromeUserData) args.push('--user-data', hint.chromeUserData);
  if (hint.chromeProfile) args.push('--profile', hint.chromeProfile);
  const out = await run(process.execPath, args, 60000);
  let result;
  try { result = JSON.parse(out); } catch { throw new Error('Chrome credential discovery returned invalid output'); }
  if (!result.username || !result.password) throw new Error('No saved OpenI password was found in Chrome');
  return result;
}

async function runEngine(account, secret, args = ['--check'], timeout = 180000) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const cfgPath = path.join(CONFIG_DIR, `.run-${account.id}-${process.pid}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(runtimeConfig(secret, account), null, 2), { mode: 0o600 });
  try {
    return await run(process.execPath, [ENGINE, `--config=${cfgPath}`, ...args], timeout);
  } finally {
    try { fs.rmSync(cfgPath, { force: true }); } catch { /* best effort */ }
  }
}

async function verifyLogin(account, secret) {
  // --verify-login exits non-zero on failure, so the exit status is trustworthy.
  const out = await runEngine(account, secret, ['--verify-login'], 120000);
  if (!/登录与接口\s*:\s*OK/.test(out)) {
    const line = out.split(/\r?\n/).find(l => /登录与接口|登录失败|无法获取登录凭据|凭据\s*:/.test(l));
    throw new Error(line ? line.trim() : 'OpenI login verification failed');
  }
  return out;
}

function newAccountId(existing) {
  for (let n = 1; n <= MAX_ACCOUNTS + 1; n++) if (!existing.includes(`acct${n}`)) return `acct${n}`;
  return `acct${Date.now()}`;
}

function createService(ctx, config) {
  const credentials = ctx.credentials;
  const timers = new Map();      // accountId -> disposer
  const planAt = new Map();      // accountId -> ms
  const runningIds = new Set();

  const live = (key, fallback) => {
    const field = config[key];
    const value = typeof field?.get === 'function' ? field.get() : field;
    return value === undefined || value === null || value === '' ? fallback : value;
  };

  const globalSettings = (overrides = {}) => ({
    enabled: overrides.enabled ?? live('enabled', false) === true,
    startTime: clock(overrides.startTime ?? live('startTime', '09:00'), '09:00'),
    endTime: clock(overrides.endTime ?? live('endTime', '10:00'), '10:00'),
  });

  const accountMap = () => (readState().accounts && typeof readState().accounts === 'object') ? readState().accounts : {};

  function listAccountIds() {
    return Object.keys(accountMap()).sort((a, b) => Number(accountMap()[a].order ?? 0) - Number(accountMap()[b].order ?? 0));
  }

  /** Merge stored account settings with the global window bounds. */
  function accountSettings(accountId, g = globalSettings()) {
    const stored = accountMap()[accountId] ?? {};
    return {
      id: accountId,
      enabled: stored.enabled !== false,
      startTime: clock(stored.startTime, g.startTime),
      endTime: clock(stored.endTime, g.endTime),
      scheduledDay: stored.scheduledDay ?? null,
      lastRunAt: stored.lastRunAt ?? null,
      lastResult: stored.lastResult ?? null,
      lastError: stored.lastError ?? null,
    };
  }

  function listAccounts(g = globalSettings()) {
    return listAccountIds().map(id => {
      const stored = accountMap()[id] ?? {};
      return {
        ...accountSettings(id, g),
        label: stored.label ?? '',
        username: stored.username ?? '',
        source: stored.source ?? null,
        chromeProfile: stored.chromeProfile ?? '',
        verifiedAt: stored.verifiedAt ?? null,
        taskName: taskNameFor(id),
      };
    });
  }

  /** Patch one account's stored settings without touching the others. */
  function patchAccount(accountId, patch) {
    const state = readState();
    const accounts = { ...(state.accounts ?? {}) };
    accounts[accountId] = { ...(accounts[accountId] ?? {}), ...patch };
    writeState({ accounts });
    return accounts[accountId];
  }

  function requireAccount(accountId) {
    const id = text(accountId, 40);
    if (!id || !accountMap()[id]) throw new Error('Unknown account');
    return id;
  }

  async function requireSecret(accountId) {
    const secret = await readSecret(credentials, accountId);
    if (!secret.source) throw new Error('This account is not signed in yet');
    return secret;
  }

  async function saveSettings(patch = {}) {
    const current = globalSettings();
    const next = globalSettings(patch);
    if (minutes(next.endTime) < minutes(next.startTime)) throw new Error('The end time must not be earlier than the start time');
    if (Array.isArray(patch.accounts)) {
      for (const entry of patch.accounts) {
        const id = text(entry?.id, 40);
        if (!id || !accountMap()[id]) continue;
        if (!inWindow(clock(entry.startTime, next.startTime), next.startTime, next.endTime)) {
          throw new Error(`Account ${id}: the start time must be inside ${next.startTime}-${next.endTime}`);
        }
        if (!inWindow(clock(entry.endTime, next.endTime), next.startTime, next.endTime)) {
          throw new Error(`Account ${id}: the end time must be inside ${next.startTime}-${next.endTime}`);
        }
        if (minutes(clock(entry.endTime, next.endTime)) < minutes(clock(entry.startTime, next.startTime))) {
          throw new Error(`Account ${id}: the end time must not be earlier than the start time`);
        }
      }
    }
    const entry = ctx.fiber?.entry;
    const editor = ctx.get('configEditor');
    if (!entry || !editor) throw new Error('This profile cannot persist plugin configuration');
    await editor.edit(entry, existing => ({
      ...existing,
      enabled: next.enabled,
      startTime: next.startTime,
      endTime: next.endTime,
    }));
    for (const item of patch.accounts ?? []) {
      const id = text(item?.id, 40);
      if (!id || !accountMap()[id]) continue;
      patchAccount(id, {
        enabled: item.enabled !== false,
        startTime: clock(item.startTime, next.startTime),
        endTime: clock(item.endTime, next.endTime),
      });
    }
    try { void reconcile(); } catch { /* fiber replaced by the config reload */ }
    return { ...next, persisted: true };
  }

  async function addAccount(input = {}) {
    if (listAccountIds().length >= MAX_ACCOUNTS) throw new Error(`At most ${MAX_ACCOUNTS} accounts are supported`);
    const g = globalSettings();
    const mode = text(input.mode, 20).toLowerCase() || 'auto';
    const base = { startTime: g.startTime, endTime: g.endTime };
    let secret;
    if (mode === 'chrome' || mode === 'auto') {
      const found = await discoverChromeCredentials(text(input.baseUrl, 500) || 'https://openi.pcl.ac.cn', {
        chromeUserData: text(input.chromeUserData, 1000),
        chromeProfile: text(input.chromeProfile, 200),
      });
      secret = normalizeSecret({
        source: 'chrome',
        username: found.username,
        password: found.password,
        chromeUserData: found.chromeUserData,
        chromeProfile: found.chromeProfile,
        baseUrl: text(input.baseUrl, 500),
      });
    } else if (mode === 'plain') {
      const username = text(input.username, 300);
      const password = text(input.password, 2000);
      if (!username || !password) throw new Error('Username and password are required');
      secret = normalizeSecret({ source: 'plain', username, password, baseUrl: text(input.baseUrl, 500) });
    } else if (mode === 'cookie') {
      const cookie = text(input.cookie, 12000);
      if (!cookie) throw new Error('Cookie is required');
      secret = normalizeSecret({ source: 'cookie', cookie, baseUrl: text(input.baseUrl, 500) });
    } else {
      throw new Error('Unknown sign-in mode');
    }
    const id = newAccountId(listAccountIds());
    const account = { id, startTime: base.startTime, endTime: base.endTime, enabled: true, label: text(input.label, 120) };
    const check = await verifyLogin(account, secret);
    await saveSecret(credentials, id, secret);
    patchAccount(id, {
      order: listAccountIds().length + 1,
      label: account.label || secret.username || id,
      username: secret.username,
      source: secret.source,
      chromeProfile: secret.chromeProfile,
      verifiedAt: new Date().toISOString(),
      enabled: true,
      startTime: base.startTime,
      endTime: base.endTime,
      lastError: null,
    });
    persistAccountConfig(accountSettings(id), secret);
    try { await reconcile(); } catch { /* scheduled registration is reported in reconcile */ }
    return { added: true, account: listAccounts().find(a => a.id === id), check: text(check, 3000) };
  }

  async function signInAccount(accountId, input = {}) {
    const id = requireAccount(accountId);
    const mode = text(input.mode, 20).toLowerCase() || 'auto';
    const current = await readSecret(credentials, id);
    let secret;
    if (mode === 'chrome' || mode === 'auto') {
      const found = await discoverChromeCredentials(text(input.baseUrl, 500) || current.baseUrl, {
        chromeUserData: text(input.chromeUserData, 1000) || current.chromeUserData,
        chromeProfile: text(input.chromeProfile, 200) || current.chromeProfile,
      });
      secret = normalizeSecret({ ...current, source: 'chrome', username: found.username, password: found.password, cookie: '', chromeUserData: found.chromeUserData || current.chromeUserData, chromeProfile: found.chromeProfile || current.chromeProfile });
    } else if (mode === 'plain') {
      const username = text(input.username, 300);
      const password = text(input.password, 2000);
      if (!username || !password) throw new Error('Username and password are required');
      secret = normalizeSecret({ ...current, source: 'plain', username, password, cookie: '' });
    } else if (mode === 'cookie') {
      const cookie = text(input.cookie, 12000);
      if (!cookie) throw new Error('Cookie is required');
      secret = normalizeSecret({ ...current, source: 'cookie', cookie });
    } else {
      throw new Error('Unknown sign-in mode');
    }
    const account = accountSettings(id);
    const check = await verifyLogin(account, secret);
    await saveSecret(credentials, id, secret);
    patchAccount(id, {
      username: secret.username,
      source: secret.source,
      chromeProfile: secret.chromeProfile,
      verifiedAt: new Date().toISOString(),
      lastError: null,
    });
    persistAccountConfig(account, secret);
    try { await reconcile(); } catch { /* registration is reported elsewhere */ }
    return { signedIn: true, account: listAccounts().find(a => a.id === id), check: text(check, 3000) };
  }

  async function removeAccount(accountId) {
    const id = requireAccount(accountId);
    stopTimer(id);
    await dropSecret(credentials, id);
    await unregisterTask(id).catch(() => undefined);
    const state = readState();
    const accounts = { ...(state.accounts ?? {}) };
    delete accounts[id];
    writeState({ accounts });
    for (const file of [accountConfigPath(id), sealedPath(id)]) {
      try { fs.rmSync(file, { force: true }); } catch { /* best effort */ }
    }
    try { fs.rmSync(logPathFor(id), { force: true }); } catch { /* best effort */ }
    return { removed: true, accountId: id };
  }

  async function checkInAccount(accountId, dryRun = false) {
    const id = requireAccount(accountId);
    const account = accountSettings(id);
    const secret = await requireSecret(id);
    if (runningIds.has(id)) return { ok: false, accountId: id, reason: 'already running' };
    runningIds.add(id);
    try {
      const out = await runEngine(account, secret, dryRun ? ['--dry-run'] : [], 1500000);
      const lastRunAt = new Date().toISOString();
      patchAccount(id, { lastRunAt, lastResult: dryRun ? 'dry-run' : 'completed', lastError: null });
      return { ok: true, accountId: id, dryRun, output: text(out, 12000), lastRunAt };
    } finally {
      runningIds.delete(id);
    }
  }

  async function registerTask(accountId) {
    const id = requireAccount(accountId);
    if (process.platform !== 'win32') return { registered: false, reason: 'Windows Task Scheduler is required' };
    const account = accountSettings(id);
    const secret = await requireSecret(id);
    persistAccountConfig(account, secret);
    const xmlPath = path.join(STATE_DIR, `task-${id}.xml`);
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(xmlPath, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(taskXml(account), 'utf16le')]));
    try {
      const out = await run('schtasks.exe', ['/Create', '/TN', taskNameFor(id), '/XML', xmlPath, '/F'], 30000);
      taskInfoCache.delete(taskNameFor(id));
      patchAccount(id, { taskRegistered: true, taskWindow: `${account.startTime}-${account.endTime}` });
      return { registered: true, accountId: id, taskName: taskNameFor(id), output: text(out, 1000) };
    } catch (error) {
      patchAccount(id, { lastError: errorOf(error) });
      throw error;
    } finally {
      try { fs.rmSync(xmlPath, { force: true }); } catch { /* best effort */ }
    }
  }

  async function unregisterTask(accountId) {
    const id = text(accountId, 40);
    if (!id) return { registered: false };
    if (process.platform !== 'win32') return { registered: false, reason: 'Windows Task Scheduler is required' };
    try { await run('schtasks.exe', ['/Delete', '/TN', taskNameFor(id), '/F'], 30000); } catch (error) {
      if (!/cannot find|找不到|does not exist/i.test(errorOf(error))) throw error;
    }
    taskInfoCache.delete(taskNameFor(id));
    if (accountMap()[id]) patchAccount(id, { taskRegistered: false, taskWindow: null });
    return { registered: false, accountId: id, taskName: taskNameFor(id) };
  }

  async function status() {
    const g = globalSettings();
    const accounts = listAccounts(g);
    const taskInfo = await readTaskInfo(accounts.map(a => taskNameFor(a.id)));
    const enriched = accounts.map(account => {
      const info = taskInfo[taskNameFor(account.id)];
      const sessionAt = planAt.get(account.id) > Date.now() ? planAt.get(account.id) : 0;
      const nextScheduledAt = info?.nextRunAt
        ?? (sessionAt ? new Date(sessionAt).toISOString() : null);
      return {
        ...account,
        signedIn: Boolean(account.source),
        running: runningIds.has(account.id),
        taskRegistered: info ? info.exists : account.scheduledDay !== null,
        taskState: info?.state ?? null,
        nextScheduledAt,
        nextScheduledSource: info?.nextRunAt ? 'scheduled-task'
          : (nextScheduledAt ? 'plugin-session-timer' : null),
        logFile: logPathFor(account.id),
      };
    });
    return {
      enabled: g.enabled,
      startTime: g.startTime,
      endTime: g.endTime,
      accounts: enriched,
      loginUrl: LOGIN_URL,
      platform: process.platform,
    };
  }

  async function log(accountId, limit = 80) {
    const id = requireAccount(accountId);
    try {
      const lines = fs.readFileSync(logPathFor(id), 'utf8').split(/\r?\n/).filter(Boolean);
      return { lines: lines.slice(-Math.max(1, Math.min(300, Number(limit) || 80))) };
    } catch { return { lines: [] }; }
  }

  /** Pick one random instant inside an account's next upcoming window. */
  function stopTimer(accountId) {
    const dispose = timers.get(accountId);
    if (dispose) { try { dispose(); } catch { /* already gone */ } }
    timers.delete(accountId);
    planAt.delete(accountId);
  }

  function planAccount(accountId, g) {
    stopTimer(accountId);
    if (!g.enabled) return;
    const account = accountSettings(accountId, g);
    if (!account.enabled || !account.source) return;
    const now = new Date();
    const from = minutes(account.startTime) * 60000;
    const to = minutes(account.endTime) * 60000;
    const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const ranToday = account.lastRunAt?.slice(0, 10) === now.toISOString().slice(0, 10);
    let dayOffset = 0;
    let target = localMidnight + randomBetween(from, Math.max(from, to));
    if (target <= Date.now() || ranToday) {
      dayOffset = 1;
      target = localMidnight + 86400000 + randomBetween(from, Math.max(from, to));
    }
    planAt.set(accountId, target);
    const dispose = ctx.setTimeout(async () => {
      planAt.delete(accountId);
      try { await checkInAccount(accountId, false); }
      catch (error) { patchAccount(accountId, { lastError: errorOf(error), lastResult: 'failed' }); }
      finally { planAccount(accountId, globalSettings()); }
    }, Math.max(0, target - Date.now()));
    timers.set(accountId, dispose);
  }

  /** Keep tasks, per-account timers and enablement in sync with stored settings. */
  async function reconcile() {
    const g = globalSettings();
    for (const id of listAccountIds()) {
      planAccount(id, g);
      const account = accountSettings(id, g);
      const stored = accountMap()[id] ?? {};
      const shouldRun = g.enabled && account.enabled && Boolean(stored.source);
      if (!shouldRun) {
        if (stored.taskRegistered) await unregisterTask(id).catch(() => undefined);
        continue;
      }
      if (stored.taskWindow !== `${account.startTime}-${account.endTime}` || !stored.taskRegistered) {
        await registerTask(id).catch(error => patchAccount(id, { lastError: errorOf(error) }));
      }
    }
    const known = new Set(listAccountIds());
    for (const id of [...timers.keys()]) if (!known.has(id)) stopTimer(id);
  }

  /** Bring the legacy single-account records forward into the account map. */
  async function migrateLegacy() {
    const state = readState();
    if (state.accounts && typeof state.accounts === 'object') return;
    if (!state.source && !state.username) { writeState({ accounts: {} }); return; }
    const secret = await readSecret(credentials, 'default');
    const account = {
      id: 'default',
      startTime: clock(state.startTime, globalSettings().startTime),
      endTime: clock(state.endTime, globalSettings().endTime),
      enabled: true,
    };
    if (!secret.source && state.source) {
      secret.source = SOURCES.has(state.source) ? state.source : null;
      if (secret.source) await saveSecret(credentials, 'default', secret);
    }
    writeState({
      accounts: {
        default: {
          order: 1,
          label: state.username || 'default',
          username: state.username ?? '',
          source: secret.source ?? state.source ?? null,
          chromeProfile: state.chromeProfile ?? '',
          verifiedAt: state.verifiedAt ?? null,
          enabled: true,
          startTime: account.startTime,
          endTime: account.endTime,
          lastRunAt: state.lastRunAt ?? null,
          lastResult: state.lastResult ?? null,
          lastError: state.lastError ?? null,
        },
      },
    });
    // The legacy task pointed at the old single runner; re-register under the
    // per-account name and drop the old entry.
    try { await run('schtasks.exe', ['/Delete', '/TN', TASK_PREFIX, '/F'], 20000); } catch { /* not present */ }
  }

  async function execute(action, payload = {}) {
    switch (action) {
      case 'status': return status();
      case 'openLoginBrowser': return openSystemBrowser(LOGIN_URL);
      case 'addAccount': return addAccount(payload);
      case 'signIn': return signInAccount(payload.accountId ?? payload.id, payload);
      case 'removeAccount': return removeAccount(payload.accountId ?? payload.id);
      case 'saveSettings': return saveSettings(payload);
      case 'installTask': {
        const id = payload.accountId ?? payload.id;
        if (id) return registerTask(id);
        const names = [];
        for (const accountId of listAccountIds()) names.push(await registerTask(accountId).catch(error => ({ accountId, registered: false, error: errorOf(error) })));
        return { tasks: names };
      }
      case 'removeTask': {
        const id = payload.accountId ?? payload.id;
        if (id) return unregisterTask(id);
        const results = [];
        for (const accountId of listAccountIds()) results.push(await unregisterTask(accountId).catch(() => ({ accountId, registered: false })));
        return { tasks: results };
      }
      case 'dryRun': return checkInAccount(payload.accountId ?? payload.id, true);
      case 'checkIn': return checkInAccount(payload.accountId ?? payload.id, false);
      case 'log': return log(payload.accountId ?? payload.id, payload.limit);
      default: throw new Error(`Unknown OpenI action: ${action}`);
    }
  }

  // The Web carrier can mount after this plugin. Register its route under an
  // injection-owned fiber so removal is automatic, even after replacement.
  ctx.inject(['webServer'], scoped => {
    const server = scoped.webServer;
    if (!server?.register) return;
    scoped.effect(() => server.register({
      kind: 'prefix',
      path: '/api/openi-checkin',
      handler: async (req, res) => {
        const send = (code, payload) => {
          res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(JSON.stringify(payload));
        };
        try {
          let connection;
          try { connection = ctx.get('connection'); } catch { connection = undefined; }
          const raw = connection?.admit?.(req);
          const admission = raw !== undefined ? raw : connection?.requestRejection?.(req);
          const rejected = typeof admission === 'object' && admission !== null ? admission.rejection : admission;
          if (rejected !== undefined && rejected !== null) return send(Number(rejected) || 403, { error: 'unauthorized' });
          const url = new URL(req.url ?? '/', 'http://localhost');
          const action = url.pathname.replace(/^\/api\/openi-checkin\/?/, '').replace(/\/+$/, '') || 'status';
          let body = {};
          if ((req.method ?? 'GET').toUpperCase() === 'POST') {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            if (chunks.length) {
              try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'Invalid JSON' }); }
            }
          }
          const result = await execute(action, body);
          send(200, { ok: true, result });
        } catch (error) {
          send(400, { ok: false, error: errorOf(error) });
        }
      },
    }), 'openi-checkin: settings API');
  });

  // The tools registry is available in the root context in some compositions and
  // published later in others. Try eagerly, then fall back to an injection-owned
  // fiber; never register twice under the same name.
  let toolRegistered = false;
  const registerTool = tools => {
    if (toolRegistered || !tools?.register) return;
    toolRegistered = true;
    try {
      tools.register(defineTool({
      name: 'openi_checkin',
      description: 'Manage the OpenI daily check-in across several accounts: add or remove an account (sign in, or discover the password saved in Chrome), set one random daily window per account, inspect status and logs, and run a dry-run or real check-in.',
      parameters: {
        action: {
          type: 'string', required: true,
          description: 'One of: status, openLoginBrowser, addAccount, signIn, removeAccount, saveSettings, installTask, removeTask, dryRun, checkIn, log.',
        },
        accountId: { type: 'string', description: 'Target account id from status. Required for signIn, removeAccount, dryRun, checkIn and log; optional for installTask/removeTask to limit to one account.' },
        mode: { type: 'string', description: 'For addAccount/signIn: auto/chrome (discover Chrome password), plain, or cookie.' },
        label: { type: 'string', description: 'For addAccount: a display name for the account.' },
        username: { type: 'string', description: 'For plain sign-in only.' },
        password: { type: 'string', description: 'For plain sign-in only; stored in a credential record.' },
        cookie: { type: 'string', description: 'For cookie sign-in only; stored in a credential record.' },
        enabled: { type: 'boolean', description: 'For saveSettings: enable automatic check-in.' },
        startTime: { type: 'string', description: 'For saveSettings: global window start, HH:MM.' },
        endTime: { type: 'string', description: 'For saveSettings: global window end, HH:MM.' },
        accounts: {
          type: 'array',
          description: 'For saveSettings: per-account overrides, each { id, enabled, startTime, endTime } inside the global window.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              enabled: { type: 'boolean' },
              startTime: { type: 'string' },
              endTime: { type: 'string' },
            },
          },
        },
        limit: { type: 'number', description: 'For log: number of trailing lines (1-300).' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true, properties: {} },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args) {
        const { action, ...payload } = args;
        return execute(action, payload);
      },
      }));
    } catch (error) {
      toolRegistered = false;
      const message = `[openi-checkin] could not register the agent tool: ${errorOf(error)}`;
      try { fs.appendFileSync(path.join(STATE_DIR, 'plugin.log'), `${new Date().toISOString()} ${message}\n`); } catch { /* best effort */ }
      ctx.logger?.error?.(message);
    }
  };

  try { registerTool(ctx.get('tools')); } catch { /* not published yet */ }
  if (!toolRegistered) {
    ctx.inject(['tools'], scoped => {
      scoped.effect(() => registerTool(scoped.tools), 'openi-checkin: agent tool');
    });
  }

  void (async () => { await migrateLegacy(); await reconcile(); })();
  const poll = ctx.setInterval(() => { reconcile().catch(() => undefined); }, 60000);

  return {
    execute,
    status,
    saveSettings,
    addAccount,
    signInAccount,
    removeAccount,
    checkInAccount,
    dispose() {
      for (const id of [...timers.keys()]) stopTimer(id);
      poll?.();
    },
  };
}

export function apply(ctx, config = {}) {
  const service = createService(ctx, config);
  ctx.provide('openiCheckin', service);
  return () => { try { service.dispose(); } catch { /* cleanup is best effort */ } };
}
