/**
 * OpenI daily check-in — DeepSeek Harness Host plugin.
 *
 * The original kit's engine is copied verbatim into lib/openi-checkin.cjs.
 * This plugin adapts it to the Harness:
 *   - login secrets live in a credential record, never in the patch config;
 *   - first sign-in accepts explicit credentials, a cookie, or automatic
 *     discovery of the password saved in Chrome;
 *   - the daily random execution window is persisted through configEditor;
 *   - a Windows Scheduled Task runs the bundled engine while DSH is running,
 *     with a fallback in-process timer that covers missed starts;
 *   - one Host service backs a settings-page HTTP route and the agent tool.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const localRequire = createRequire(import.meta.url);
const localDefineTool = localRequire('./lib/tool.cjs').defineTool;
let officialDefineTool = null;
try { const tools = await import('@deepseek-ai/dsh-tools'); officialDefineTool = tools.defineTool ?? tools.default?.defineTool ?? null; } catch { officialDefineTool = null; }
const defineTool = officialDefineTool ?? localDefineTool;
let credentialKey = null;
try { const credentials = await import('@deepseek-ai/dsh-credentials'); credentialKey = credentials.credentialKey ?? credentials.default?.credentialKey; } catch { credentialKey = null; }

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(PACKAGE_DIR, 'lib', 'openi-checkin.cjs');
const DISCOVERY = path.join(PACKAGE_DIR, 'lib', 'discover-chrome.cjs');
const STATE_DIR = path.join(os.homedir(), '.dsh', 'openi-checkin');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const RUNTIME_FILE = path.join(STATE_DIR, 'runtime-config.json');
const SEALED_FILE = path.join(STATE_DIR, 'runtime-config.bin');
const LOG_FILE = path.join(STATE_DIR, 'openi-checkin.log');
const LOGIN_URL = 'https://openi.pcl.ac.cn/user/login';
const TASK_NAME = 'OpenI-Daily-Checkin-DSH';
const RECORD_ID = 'account';
const RECORD_SCOPE = 'openi-checkin';

/** Plugin configuration rendered as editable settings and persisted in the user's patch. */
export const Config = createRequire(import.meta.url)('./lib/config.cjs').Config;

export const inject = ['credentials', 'timer'];
export const name = 'openi-checkin';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const SOURCES = new Set(['chrome', 'plain', 'cookie']);

function text(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function clock(value, fallback) {
  const raw = text(value, 8);
  if (!TIME_RE.test(raw)) return fallback;
  return raw;
}

function minutes(value) {
  const [, h, m] = TIME_RE.exec(value);
  return Number(h) * 60 + Number(m);
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

/** Windows: seal the runtime config with the current user's DPAPI key. */
function sealRuntimeConfig(value) {
  if (process.platform !== 'win32') return null;
  const json = JSON.stringify(value, null, 2);
  const input = Buffer.from(json, 'utf8').toString('base64');
  // Pass ASCII base64 as a command argument: PowerShell console stdin uses the
  // OEM code page and adds a BOM, which corrupts UTF-8 JSON and even base64.
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

/** Persist the scheduled runner's credentials without leaving plaintext at rest. */
function persistRuntimeConfig(value) {
  const sealed = sealRuntimeConfig(value);
  // Keep the seal as ASCII base64 text: the scheduled runner and PowerShell
  // command both read it as a UTF-8 string, never as raw binary.
  if (sealed) atomicWriteBytes(SEALED_FILE, Buffer.from(sealed.toString('base64'), 'ascii'));
  else atomicWrite(RUNTIME_FILE, value);
}

function atomicWriteBytes(file, data) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = path.join(STATE_DIR, `.${path.basename(file)}-${process.pid}.tmp`);
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function publicState() {
  const state = readState();
  return {
    signedIn: state.source === 'chrome' || Boolean(state.username || state.cookie),
    source: state.source ?? null,
    username: state.username ?? '',
    chromeProfile: state.chromeProfile ?? '',
    verifiedAt: state.verifiedAt ?? null,
    lastRunAt: state.lastRunAt ?? null,
    lastResult: state.lastResult ?? null,
    lastError: state.lastError ?? null,
  };
}

function randomBetween(start, end) {
  return Math.floor(start + Math.random() * Math.max(0, end - start));
}

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
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
    `const sealed = path.join(__dirname, ${JSON.stringify(path.basename(SEALED_FILE))});`,
    `const plain = path.join(__dirname, ${JSON.stringify(path.basename(RUNTIME_FILE))});`,
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

function taskXml(startTime, endTime) {
  const runner = ensureRunner();
  const today = new Date();
  const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  const span = Math.max(0, minutes(endTime) - minutes(startTime));
  const hours = Math.floor(span / 60);
  const mins = span % 60;
  const delay = span === 0 ? 'PT0S'
    : hours === 0 ? `PT${mins}M`
    : `PT${hours}H${mins > 0 ? `${mins}M` : ''}`;
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>DSH OpenI daily check-in, ${xmlEscape(startTime)}–${xmlEscape(endTime)}</Description></RegistrationInfo>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType></Principal></Principals>
  <Settings>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT2H</ExecutionTimeLimit>
  </Settings>
  <Triggers><CalendarTrigger>
    <StartBoundary>${date}T${startTime}:00</StartBoundary>
    <Enabled>true</Enabled><RandomDelay>${delay}</RandomDelay>
    <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
  </CalendarTrigger></Triggers>
  <Actions Context="Author"><Exec>
    <Command>${xmlEscape(process.execPath)}</Command>
    <Arguments>${xmlEscape(`"${runner}"`)}</Arguments>
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

/** Open the OpenI login page in the user's system browser. */
async function openSystemBrowser(url = LOGIN_URL) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Only HTTP(S) login URLs are allowed');
  if (process.platform === 'win32') {
    const script = `Start-Process -FilePath '${parsed.href.replaceAll("'", "''")}' -ErrorAction Stop`;
    await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], 10000);
  } else if (process.platform === 'darwin') {
    await run('/usr/bin/open', [parsed.href], 10000);
  } else {
    await run('xdg-open', [parsed.href], 10000);
  }
  return { opened: true, url: parsed.href };
}

function recordKey() {
  return credentialKey ? credentialKey(RECORD_SCOPE, RECORD_ID) : `${RECORD_SCOPE}/${RECORD_ID}`;
}

async function readRecord(credentials) {
  const record = await credentials.readRecord(recordKey());
  const payload = record?.kind === 'grant' && record.payload && typeof record.payload === 'object'
    ? record.payload : {};
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

async function saveRecord(credentials, value) {
  await credentials.modifyRecord(recordKey(), async () => ({ kind: 'grant', payload: value }));
}

async function discoverChromeCredentials(secret, hint = {}) {
  if (!fs.existsSync(DISCOVERY)) throw new Error(`Chrome credential discovery script is missing: ${DISCOVERY}`);
  const args = [DISCOVERY, '--base-url', secret.baseUrl];
  if (hint.chromeUserData) args.push('--user-data', hint.chromeUserData);
  if (hint.chromeProfile) args.push('--profile', hint.chromeProfile);
  const out = await run(process.execPath, args, 60000);
  let result;
  try { result = JSON.parse(out); } catch { throw new Error('Chrome credential discovery returned invalid output'); }
  if (!result.username || !result.password) throw new Error('No saved OpenI password was found in Chrome');
  return result;
}

/** Build the exact config file consumed by the unmodified engine. */
function runtimeConfig(secret) {
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
    logFile: LOG_FILE,
    startTime: '09:00',
    randomDelay: 'PT1H',
    taskName: TASK_NAME,
  };
}

async function runEngine(secret, args = ['--check'], timeout = 180000) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const cfgPath = path.join(STATE_DIR, `run-${process.pid}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(runtimeConfig(secret), null, 2), { mode: 0o600 });
  try {
    return await run(process.execPath, [ENGINE, `--config=${cfgPath}`, ...args], timeout);
  } finally {
    try { fs.rmSync(cfgPath, { force: true }); } catch { /* best effort */ }
  }
}

async function verifyLogin(secret) {
  const out = await runEngine(secret, ['--check'], 120000);
  if (!/登录与接口\s*:\s*OK/.test(out)) {
    const line = out.split(/\r?\n/).find(l => /登录与接口|登录失败|无法获取登录凭据|凭据\s*:/.test(l));
    throw new Error(line ? line.trim() : 'OpenI login verification failed');
  }
  return out;
}

function createService(ctx, config) {
  const credentials = ctx.credentials;
  let timer = null;
  let scheduledDay = null;
  let scheduledAt = 0;
  let running = false;

  const live = (key, fallback) => {
    const field = config[key];
    const value = typeof field?.get === 'function' ? field.get() : field;
    return value === undefined || value === null || value === '' ? fallback : value;
  };
  const settings = (overrides = {}) => ({
    enabled: overrides.enabled ?? live('enabled', false) === true,
    startTime: clock(overrides.startTime ?? live('startTime', '09:00'), '09:00'),
    endTime: clock(overrides.endTime ?? live('endTime', '10:00'), '10:00'),
  });

  async function currentSecret() {
    const secret = await readRecord(credentials);
    if (!publicState().signedIn) throw new Error('Sign in to OpenI first');
    if (!secret.source) throw new Error('OpenI credential is incomplete; sign in again');
    return secret;
  }

  async function saveSettings(patch) {
    const current = settings();
    const next = settings(patch);
    if (minutes(next.endTime) < minutes(next.startTime)) throw new Error('The end time must not be earlier than the start time');
    const entry = ctx.fiber?.entry;
    // Captured before the write: a volatile config edit restarts this plugin.
    const editor = ctx.get('configEditor');
    if (!entry || !editor) throw new Error('This profile cannot persist plugin configuration');
    const capturedEntry = entry;
    const capturedEditor = editor;
    await capturedEditor.edit(capturedEntry, existing => ({
      ...existing,
      enabled: next.enabled,
      startTime: next.startTime,
      endTime: next.endTime,
    }));
    return { ...next, persisted: true, current };
  }

  async function registerTask(next = settings()) {
    if (process.platform !== 'win32') return { registered: false, reason: 'Windows Task Scheduler is required' };
    const secret = await currentSecret();
    persistRuntimeConfig(runtimeConfig(secret));
    const xmlPath = path.join(STATE_DIR, 'task.xml');
    ensureRunner();
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(xmlPath, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(taskXml(next.startTime, next.endTime), 'utf16le')]));
    try {
      const out = await run('schtasks.exe', ['/Create', '/TN', TASK_NAME, '/XML', xmlPath, '/F'], 30000);
      writeState({ taskRegistered: true, taskWindow: `${next.startTime}-${next.endTime}` });
      return { registered: true, taskName: TASK_NAME, output: text(out, 1000) };
    } finally {
      try { fs.rmSync(xmlPath, { force: true }); } catch { /* best effort */ }
    }
  }

  async function unregisterTask() {
    if (process.platform !== 'win32') return { registered: false, reason: 'Windows Task Scheduler is required' };
    try { await run('schtasks.exe', ['/Delete', '/TN', TASK_NAME, '/F'], 30000); } catch (error) {
      if (!/cannot find|找不到|does not exist/i.test(errorOf(error))) throw error;
    }
    writeState({ taskRegistered: false, taskWindow: null });
    return { registered: false, taskName: TASK_NAME };
  }

  async function signIn(input = {}) {
    const mode = text(input.mode, 20).toLowerCase() || 'auto';
    const current = await readRecord(credentials);
    let secret;
    if (mode === 'chrome' || mode === 'auto') {
      const found = await discoverChromeCredentials(current, {
        chromeUserData: text(input.chromeUserData, 1000) || current.chromeUserData,
        chromeProfile: text(input.chromeProfile, 200) || current.chromeProfile,
      });
      secret = {
        ...current,
        source: 'chrome',
        username: found.username,
        password: found.password,
        cookie: '',
        chromeUserData: found.chromeUserData || current.chromeUserData,
        chromeProfile: found.chromeProfile || current.chromeProfile,
        baseUrl: text(input.baseUrl, 500) || current.baseUrl,
      };
    } else if (mode === 'plain') {
      const username = text(input.username, 300);
      const password = text(input.password, 2000);
      if (!username || !password) throw new Error('Username and password are required');
      secret = { ...current, source: 'plain', username, password, cookie: '', baseUrl: text(input.baseUrl, 500) || current.baseUrl };
    } else if (mode === 'cookie') {
      const cookie = text(input.cookie, 12000);
      if (!cookie) throw new Error('Cookie is required');
      secret = { ...current, source: 'cookie', username: '', password: '', cookie, baseUrl: text(input.baseUrl, 500) || current.baseUrl };
    } else {
      throw new Error('Unknown sign-in mode');
    }
    const check = await verifyLogin(secret);
    await saveRecord(credentials, secret);
    persistRuntimeConfig(runtimeConfig(secret));
    const state = writeState({
      source: secret.source,
      username: secret.username,
      chromeProfile: secret.chromeProfile,
      verifiedAt: new Date().toISOString(),
      lastError: null,
    });
    return {
      signedIn: true,
      source: secret.source,
      username: secret.username,
      chromeProfile: state.chromeProfile,
      verifiedAt: state.verifiedAt,
      check: text(check, 4000),
    };
  }

  async function signOut() {
    await credentials.deleteRecord(recordKey());
    await unregisterTask().catch(() => undefined);
    writeState({ source: null, username: '', chromeProfile: '', verifiedAt: null, lastError: null });
    for (const file of [STATE_FILE, RUNTIME_FILE, SEALED_FILE]) {
      try { fs.rmSync(file, { force: true }); } catch { /* best effort */ }
    }
    return { signedIn: false };
  }

  async function checkIn(dryRun = false) {
    const secret = await currentSecret();
    const out = await runEngine(secret, dryRun ? ['--dry-run'] : [], 1500000);
    const state = writeState({
      lastRunAt: new Date().toISOString(),
      lastResult: dryRun ? 'dry-run' : 'completed',
      lastError: null,
    });
    return { ok: true, dryRun, output: text(out, 12000), lastRunAt: state.lastRunAt };
  }

  async function status() {
    const s = settings();
    const state = publicState();
    return {
      ...state,
      ...s,
      taskName: TASK_NAME,
      taskRegistered: readState().taskRegistered === true,
      taskWindow: readState().taskWindow ?? null,
      nextScheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      running,
      loginUrl: LOGIN_URL,
      logFile: LOG_FILE,
    };
  }

  async function log(limit = 80) {
    try {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
      return { lines: lines.slice(-Math.max(1, Math.min(300, Number(limit) || 80))) };
    } catch { return { lines: [] }; }
  }

  async function execute(action, payload = {}) {
    switch (action) {
      case 'status': return status();
      case 'openLoginBrowser': return openSystemBrowser(LOGIN_URL);
      case 'signIn': return signIn(payload);
      case 'signOut': return signOut();
      case 'saveSettings': return saveSettings(payload);
      case 'installTask': return registerTask(settings(payload));
      case 'removeTask': return unregisterTask();
      case 'dryRun': return checkIn(true);
      case 'checkIn': return checkIn(false);
      case 'log': return log(payload.limit);
      default: throw new Error(`Unknown OpenI action: ${action}`);
    }
  }

  /** Randomly choose one instant inside today's window and wake at that instant. */
  function planToday() {
    timer?.();
    const s = settings();
    const today = new Date();
    const key = today.toDateString();
    if (!s.enabled || !publicState().signedIn) {
      scheduledDay = null;
      scheduledAt = 0;
      return;
    }
    if (scheduledDay === key && scheduledAt > Date.now()) return;
    const from = minutes(s.startTime) * 60000;
    const to = minutes(s.endTime) * 60000;
    const localMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const target = localMidnight + randomBetween(from, Math.max(from, to));
    if (target <= Date.now() && readState().lastRunAt?.slice(0, 10) === today.toISOString().slice(0, 10)) return;
    scheduledDay = key;
    scheduledAt = Math.max(Date.now(), target);
    timer = ctx.setTimeout(async () => {
      scheduledDay = null;
      scheduledAt = 0;
      if (running) return;
      running = true;
      try { await checkIn(false); }
      catch (error) { writeState({ lastError: errorOf(error), lastResult: 'failed' }); }
      finally { running = false; }
    }, Math.max(0, scheduledAt - Date.now()));
  }

  /** Verify the task still exists after settings/profile changes. */
  async function reconcile() {
    planToday();
    const s = settings();
    const state = readState();
    if (!s.enabled || !publicState().signedIn) {
      if (state.taskRegistered) await unregisterTask().catch(() => undefined);
      return;
    }
    if (state.taskWindow !== `${s.startTime}-${s.endTime}` || !state.taskRegistered) {
      await registerTask(s).catch(error => writeState({ lastError: errorOf(error) }));
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

  let toolDispose = null;
  let tools;
  try { tools = ctx.get('tools'); } catch { tools = undefined; }
  if (defineTool && tools?.register) {
    const toolDefinition = defineTool({
      name: 'openi_checkin',
      description: 'Manage the OpenI daily check-in: sign in or discover saved credentials, set the automatic execution time window, inspect status/log, and run a dry-run or real check-in.',
      parameters: {
        action: {
          type: 'string', required: true,
          description: 'One of: status, openLoginBrowser, signIn, signOut, saveSettings, installTask, removeTask, dryRun, checkIn, log.',
        },
        mode: { type: 'string', description: 'For signIn: auto/chrome (discover Chrome password), plain, or cookie.' },
        username: { type: 'string', description: 'For plain sign-in only.' },
        password: { type: 'string', description: 'For plain sign-in only; stored in a credential record.' },
        cookie: { type: 'string', description: 'For cookie sign-in only; stored in a credential record.' },
        enabled: { type: 'boolean', description: 'For saveSettings: enable automatic check-in.' },
        startTime: { type: 'string', description: 'For saveSettings: local window start, HH:MM.' },
        endTime: { type: 'string', description: 'For saveSettings: local window end, HH:MM.' },
        limit: { type: 'number', description: 'For log: number of trailing lines (1–300).' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true, properties: {} },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args) {
        const { action, ...payload } = args;
        return execute(action, payload);
      },
    });
    toolDispose = tools.register(toolDefinition);
  }

  void reconcile();
  const poll = ctx.setInterval(() => { planToday(); }, 60000);

  return {
    execute,
    status,
    signIn,
    signOut,
    saveSettings,
    checkIn,
    dispose() {
      timer?.();
      poll?.();
      toolDispose?.();
    },
  };
}

export function apply(ctx, config = {}) {
  const service = createService(ctx, config);
  ctx.provide('openiCheckin', service);
  return () => { try { service.dispose(); } catch { /* cleanup is best effort */ } };
}
