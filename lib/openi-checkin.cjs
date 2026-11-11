#!/usr/bin/env node
/**
 * OpenI 每日计算任务打卡脚本（可分发版）
 * ---------------------------------------------------------------
 * 直接调用站点自身 HTTP 接口完成每日调试任务打卡，约 10 秒，无需浏览器界面操作。
 *
 * 打卡逻辑：
 *   1. 有 WAITING/RUNNING 调试任务 → 先停止。
 *   2. 有 30 天内 STOPPED（或 FAILED 等终态）调试任务 →
 *      「再次调试」(/api/v1/ai_task/restart)，进入 WAITING 后「停止」。
 *   3. 否则先删除超过 30 天的历史调试任务，再「新建任务」，进入 WAITING 后「停止」。
 *   4. 幂等：当天已创建过调试任务则跳过；「再次调试」失败会自动回退到新建分支。
 *
 * 凭据方式（config.json 的 credentialSource，或命令行 --cred=）：
 *   chrome  : 读取 Chrome 已保存的 OpenI 账号密码（Windows + DPAPI，自动扫描所有 profile）
 *   plain   : 使用 config.json 里的 username/password（或环境变量 OPENI_USER / OPENI_PASS）
 *   cookie  : 使用 config.json 里的 cookie 字符串，跳过登录（跨平台）
 *   auto    : 默认，按 chrome → plain → cookie 顺序尝试
 *
 * 用法：
 *   node openi-checkin.js                     # 正常执行
 *   node openi-checkin.js --dry-run           # 只分析，不修改任何数据
 *   node openi-checkin.js --status            # 只读查看任务状态
 *   node openi-checkin.js --check             # 自检：Node 版本、配置、凭据、站点连通性
 *   node openi-checkin.js --config=my.json    # 指定配置文件
 *   node openi-checkin.js --cred=plain        # 指定凭据方式
 *   node openi-checkin.js --profile="Profile 1"  # 指定 Chrome profile
 *   node openi-checkin.js --branch=create|restart
 *   node openi-checkin.js --stop-id=12345    # 只停止指定任务
 *   node openi-checkin.js --cleanup          # 只停止所有活跃任务
 *   node openi-checkin.js --help
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const APP_DIR = __dirname;
const ARGV = process.argv.slice(2);

function argValue(name) {
  const prefix = `--${name}=`;
  const a = ARGV.find(x => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : undefined;
}

// ----------------------------- 配置 -----------------------------
function defaultChromeUserData() {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'Google', 'Chrome', 'User Data');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  }
  return path.join(os.homedir(), '.config', 'google-chrome');
}

const DEFAULTS = {
  baseUrl: 'https://openi.pcl.ac.cn',
  chromeUserData: defaultChromeUserData(),
  chromeProfile: null,             // null = 自动扫描所有 profile
  credentialSource: 'auto',        // auto | chrome | plain | cookie
  username: '',
  password: '',
  cookie: '',
  loginOrigin: null,               // null = baseUrl + '/user/login'

  specMatcher: { compute_resource: 'GPU', acc_card_type: 'V100', acc_cards_num: 0, cpu_cores: 4, mem_gi_b: 32 },
  specId: null,                    // 直接指定 spec_id（跳过匹配）
  clusterType: 'C2Net',
  computeSource: 'GPU',
  jobType: 'DEBUG',
  imageUrl: 'liuzx/ubuntu22.04-cuda11.8.0-py310-torch2.1.0-tf2.14.0',
  timeLimitHours: 4,
  maxTaskAgeDays: 30,
  httpTimeoutMs: 30000,
  logFile: path.join(APP_DIR, 'openi-checkin.log'),
  taskName: 'OpenI-Daily-Checkin',
  randomDelay: 'PT1H',             // 9:00 起 1 小时内随机触发
  startTime: '09:00',
};

function loadConfig() {
  const cfgPath = argValue('config') || path.join(APP_DIR, 'config.json');
  let user = {};
  if (fs.existsSync(cfgPath)) {
    try {
      // 去掉 UTF-8 BOM：Windows 记事本 / PowerShell Out-File 常会写入
      user = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) {
      console.error(`配置文件解析失败: ${cfgPath} — ${e.message}`);
      process.exit(2);
    }
  }
  const cfg = { ...DEFAULTS, ...user };
  if (!cfg.loginOrigin) cfg.loginOrigin = cfg.baseUrl.replace(/\/$/, '') + '/user/login';
  // 环境变量优先级最高（便于 CI / 不落盘）
  if (process.env.OPENI_USER) cfg.username = process.env.OPENI_USER;
  if (process.env.OPENI_PASS) cfg.password = process.env.OPENI_PASS;
  if (process.env.OPENI_COOKIE) cfg.cookie = process.env.OPENI_COOKIE;
  if (process.env.OPENI_BASE_URL) {
    cfg.baseUrl = process.env.OPENI_BASE_URL;
    cfg.loginOrigin = cfg.baseUrl.replace(/\/$/, '') + '/user/login';
  }
  const cred = argValue('cred');
  if (cred) cfg.credentialSource = cred;
  const prof = argValue('profile');
  if (prof) cfg.chromeProfile = prof;
  return cfg;
}

const CONFIG = loadConfig();

// 登录页固定 RSA 公钥（作为兜底；运行时优先从登录页动态提取，避免站点换 key 后失效）
const FALLBACK_RSA_B64 =
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC8qOB41dNhDZyhdgiIxvCYv8fS' +
  'kfWZOCWUZ3qhl//nMDz5RjemCxCQ2C3o63kbzWW6fEKRIWydhrVIWBu8eCEe7MfT' +
  'YFe7IeOlwDH9mLqbMDzcLjFHphXNb2rRUii+PFJovdL9ys8utCDkWTSnP2G2x1RZ' +
  'xUfxfQqoYkMaAEio0QIDAQAB';

function rsaPem(b64) {
  return '-----BEGIN PUBLIC KEY-----\n' + b64.match(/.{1,64}/g).join('\n') + '\n-----END PUBLIC KEY-----\n';
}

function extractRsaPublicKey(loginHtml) {
  const m = loginHtml.match(/publicKey\s*=\s*["']([A-Za-z0-9+/=\\\s]+)["']/);
  if (m) {
    // 页面里是带 \n 换行的 PEM base64；只保留 base64 字符
    const b64 = m[1].replace(/[^A-Za-z0-9+/=]/g, '');
    if (b64.length > 100) {
      try {
        crypto.createPublicKey(rsaPem(b64));   // 验证 key 真的可用
        return rsaPem(b64);
      } catch (_) { /* 落到兜底 key */ }
    }
  }
  return rsaPem(FALLBACK_RSA_B64);
}

// --------------------------- 日志 ---------------------------
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(CONFIG.logFile, line + '\n', 'utf8'); } catch (_) {}
}

const DRY_RUN = ARGV.includes('--dry-run');
const FORCE_BRANCH = argValue('branch') || '';

// ----------------------- 凭据：Chrome 保存密码 -----------------------
function chromeAesKey() {
  const localStatePath = path.join(CONFIG.chromeUserData, 'Local State');
  if (!fs.existsSync(localStatePath)) throw new Error(`找不到 Chrome Local State: ${localStatePath}`);
  const ps = [
    'Add-Type -AssemblyName System.Security;',
    `$ls = Get-Content '${localStatePath.replace(/'/g, "''")}' -Raw | ConvertFrom-Json;`,
    '$k = [Convert]::FromBase64String($ls.os_crypt.encrypted_key);',
    '$e = $k[5..($k.Length-1)];',
    '$p = [System.Security.Cryptography.ProtectedData]::Unprotect($e, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);',
    '[Convert]::ToBase64String($p)',
  ].join(' ');
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
  if (!out) throw new Error('DPAPI 解密 Chrome 密钥失败');
  return Buffer.from(out, 'base64');
}

function decryptChromePassword(blob, key) {
  if (blob.subarray(0, 3).toString() === 'v10' || blob.subarray(0, 3).toString() === 'v11') {
    const nonce = blob.subarray(3, 15);
    const tag = blob.subarray(blob.length - 16);
    const body = blob.subarray(15, blob.length - 16);
    const dec = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    dec.setAuthTag(tag);
    return Buffer.concat([dec.update(body), dec.final()]).toString('utf8');
  }
  const ps = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String('${blob.toString('base64')}'); $p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Text.Encoding]::UTF8.GetString($p)`;
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true }).trim();
}

// node:sqlite 仅在需要读 Chrome 时才加载，让 plain/cookie 模式可在 Node 18+ 运行
function openSqlite(file) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(file);
  } catch (e) {
    throw new Error('读取 Chrome 保存密码需要 Node.js 22+（node:sqlite）。请升级 Node，或改用 plain / cookie 凭据方式。');
  }
}

function chromeProfileDirs() {
  const root = CONFIG.chromeUserData;
  if (!fs.existsSync(root)) throw new Error(`找不到 Chrome 用户数据目录: ${root}`);
  if (CONFIG.chromeProfile) return [path.join(root, CONFIG.chromeProfile)];
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory() && (d.name === 'Default' || /^Profile \d+$/.test(d.name)))
    .map(d => path.join(root, d.name));
  return dirs;
}

function readChromeCredential() {
  if (process.platform !== 'win32') {
    throw new Error('chrome 凭据方式仅支持 Windows（DPAPI）。请使用 plain 或 cookie 方式。');
  }
  let key = null;
  const tried = [];
  for (const dir of chromeProfileDirs()) {
    const loginDb = path.join(dir, 'Login Data');
    if (!fs.existsSync(loginDb)) continue;
    const tmp = path.join(os.tmpdir(), `openi_logindata_${process.pid}_${path.basename(dir).replace(/\W/g, '')}.db`);
    let row = null;
    try {
      fs.copyFileSync(loginDb, tmp);
      const db = openSqlite(tmp);
      row = db.prepare(
        'select username_value, password_value from logins where origin_url = ? or signon_realm = ?'
      ).get(CONFIG.loginOrigin, CONFIG.baseUrl.replace(/\/$/, '')) ||
        db.prepare(
          "select username_value, password_value from logins where origin_url like ?"
        ).get('%' + new URL(CONFIG.baseUrl).hostname + '%');
      db.close();
    } catch (e) {
      tried.push(`${path.basename(dir)}: ${e.message}`);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    if (row && row.password_value) {
      if (!key) key = chromeAesKey();
      const password = decryptChromePassword(Buffer.from(row.password_value), key);
      return { username: String(row.username_value), password, source: `chrome:${path.basename(dir)}` };
    }
    tried.push(`${path.basename(dir)}: 未找到该站点的已保存密码`);
  }
  throw new Error(`Chrome 中未找到 OpenI 已保存密码。${tried.length ? '探测: ' + tried.join('; ') : ''}`
    + ' 请先在 Chrome 登录一次并保存密码，或改用 plain / cookie 方式。');
}

// ----------------------- 凭据：统一入口 -----------------------
function resolveCredential() {
  const src = CONFIG.credentialSource;
  const order = src === 'auto' ? ['chrome', 'plain', 'cookie'] : [src];
  const errors = [];
  for (const s of order) {
    try {
      if (s === 'chrome') return readChromeCredential();
      if (s === 'plain') {
        if (!CONFIG.username || !CONFIG.password) throw new Error('config.json 缺少 username/password');
        return { username: CONFIG.username, password: CONFIG.password, source: 'plain' };
      }
      if (s === 'cookie') {
        if (!CONFIG.cookie) throw new Error('config.json 缺少 cookie');
        return { cookie: CONFIG.cookie, source: 'cookie' };
      }
      throw new Error(`未知凭据方式: ${s}`);
    } catch (e) {
      errors.push(`${s}: ${e.message}`);
    }
  }
  throw new Error('无法获取登录凭据。\n  - ' + errors.join('\n  - '));
}

// ------------------------- HTTP 会话 -------------------------
class Session {
  constructor() {
    this.jar = new Map();
  }
  cookieHeader() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  absorb(res) {
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(';')[0];
      const i = pair.indexOf('=');
      if (i > 0) this.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  async request(url, opts = {}) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      ...(opts.headers || {}),
    };
    if (this.jar.size) headers.Cookie = this.cookieHeader();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), CONFIG.httpTimeoutMs);
    try {
      const res = await fetch(url, {
        ...opts, headers, signal: ac.signal,
        redirect: opts.redirect === undefined ? 'manual' : opts.redirect,
      });
      this.absorb(res);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
  async getText(url, headers) {
    const r = await this.request(url, { headers });
    return { status: r.status, text: await r.text() };
  }
  async getJson(url) {
    const r = await this.request(url, { headers: { Accept: 'application/json' } });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: r.status, json, text };
  }
  async postForm(url, data, headers) {
    const body = new URLSearchParams(data).toString();
    const r = await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(headers || {}) },
      body,
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: r.status, json, text };
  }
  async postJson(url, data) {
    const r = await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: r.status, json, text };
  }
}

function extractCsrf(html) {
  const m = html.match(/<meta name="_csrf" content="([^"]+)"/);
  return m ? m[1] : '';
}

// --------------------------- 登录 ---------------------------
async function login(session) {
  const cred = resolveCredential();
  log(`凭据来源: ${cred.source}`);

  if (cred.cookie) {
    // 直接用 cookie 建立会话，跳过登录
    for (const pair of cred.cookie.split(';')) {
      const i = pair.indexOf('=');
      if (i > 0) session.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    const page = await session.getText(`${CONFIG.baseUrl}/cloudbrains`);
    verifyLoggedIn(page, 'cookie');
    log('已用 cookie 建立会话');
    return extractCsrf(page.text);
  }

  log(`账号: ${cred.username}（密码长度 ${cred.password.length}）`);
  const loginPage = await session.getText(`${CONFIG.baseUrl}/user/login`);
  const csrf = extractCsrf(loginPage.text);
  if (!csrf) throw new Error('登录页未找到 _csrf token');
  const pem = extractRsaPublicKey(loginPage.text);

  const encrypted = crypto.publicEncrypt(
    { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(cred.password, 'utf8')
  ).toString('base64');

  const res = await session.postForm(`${CONFIG.baseUrl}/user/login`, {
    _csrf: csrf,
    user_name: cred.username,
    password: encrypted,
    remember: 'on',
  });
  const page = await session.getText(`${CONFIG.baseUrl}/cloudbrains`);
  verifyLoggedIn(page, `POST ${res.status}`);
  log('登录成功');
  return extractCsrf(page.text);
}

function verifyLoggedIn(page, hint) {
  const ok = page.status === 200 && page.text.includes('_csrf') &&
             !page.text.includes('name="user_name"');
  if (!ok) {
    throw new Error(`登录失败（${hint}）。请确认账号密码正确；若站点启用了短信/微信二次验证，请改用 cookie 方式。`);
  }
}

// ------------------------ 任务列表 ------------------------
async function fetchDebugTasks(session, csrf) {
  const all = [];
  const pageSize = 50;
  for (let page = 1; page <= 20; page++) {
    const url = `${CONFIG.baseUrl}/api/v1/ai_task/my_list?_csrf=${encodeURIComponent(csrf)}` +
      `&job_type=${CONFIG.jobType}&page=${page}&pageSize=${pageSize}&type=all`;
    const { status, json, text } = await session.getJson(url);
    if (status !== 200 || !json || json.code !== 0) {
      throw new Error(`获取任务列表失败: HTTP ${status} ${text.slice(0, 200)}`);
    }
    const tasks = (json.data && json.data.tasks) || [];
    all.push(...tasks);
    const total = json.data.total || 0;
    if (all.length >= total || tasks.length === 0) break;
  }
  return all;
}

function ageDays(createdUnix) {
  return (Date.now() / 1000 - Number(createdUnix || 0)) / 86400;
}

// ------------------------ 操作封装 ------------------------
function apiUrl(csrf, pathAndQuery) {
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  return `${CONFIG.baseUrl}${pathAndQuery}${sep}_csrf=${encodeURIComponent(csrf)}`;
}
async function apiPost(session, csrf, pathAndQuery, payload = null) {
  const url = apiUrl(csrf, pathAndQuery);
  // 站点 axios 实例会把 _csrf 加进 data；普通操作用表单，创建接口用 JSON
  if (payload) {
    // 创建接口由站点 axios 实例发送 JSON；绝不重试，避免重复创建任务
    return session.postJson(url, { ...payload, _csrf: csrf });
  }
  return session.postForm(url, { _csrf: csrf });
}

async function waitForStatus(session, csrf, taskId, wanted, timeoutMs = 300000, intervalMs = 5000) {
  const wantedSet = new Set(wanted);
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const tasks = await fetchDebugTasks(session, csrf);
    const hit = tasks.find(t => Number(t.task.id) === Number(taskId));
    last = hit ? hit.task.status : '(未找到)';
    if (hit && wantedSet.has(hit.task.status)) return hit.task;
    await sleep(intervalMs);
  }
  throw new Error(`等待任务 ${taskId} 进入 ${[...wantedSet].join('/')} 超时，最后状态: ${last}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 终态：任务已不再消耗算力。打卡积分在任务创建时发放，进入任意终态都算完成。
const TERMINAL_STATES = [
  'STOPPED', 'FAILED', 'START_FAILED', 'CREATE_FAILED', 'CREATED_FAILED',
  'KILLED', 'COMPLETED', 'SUCCEEDED', 'CANCELED', 'LOST',
  'SUBMIT_MODEL_FAILED', 'DEPLOY_SERVICE_FAILED', 'CHECK_FAILED',
];
const STOPPABLE_STATES = ['WAITING', 'RUNNING', 'INIT', 'STARTING', 'CREATING', 'PREPARING', 'CONNECTING'];

/**
 * 反复尝试停止任务，直到进入终态。
 * 站点在 WAITING（中心排队）阶段会拒绝 stop（code=99），任务随后可能进入 RUNNING 或 FAILED，
 * 因此每隔一段时间重发 stop，并接受任意终态作为完成。
 */
async function stopUntilStopped(session, csrf, taskId, opts = {}) {
  const timeoutMs = opts.timeoutMs || 900000;
  const intervalMs = opts.intervalMs || 5000;
  const retryEveryMs = opts.retryEveryMs || 15000;
  const maxStopAttempts = opts.maxStopAttempts || 40;
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let lastStatus = '';
  let lastStopAt = 0;
  let stoppingSeenAt = 0;
  while (Date.now() < deadline) {
    let tasks;
    try { tasks = await fetchDebugTasks(session, csrf); }
    catch (e) { log(`  查询状态失败(将重试): ${e.message}`); await sleep(intervalMs); continue; }
    const hit = tasks.find(t => Number(t.task.id) === Number(taskId));
    if (!hit) { await sleep(intervalMs); continue; }
    lastStatus = hit.task.status;
    if (TERMINAL_STATES.includes(lastStatus)) {
      if (attempts > 0 || lastStatus !== 'STOPPED') log(`  任务进入终态 ${lastStatus}`);
      return hit.task;
    }
    // STOPPING 是过渡态：停止请求已被受理，给它一段时间变成 STOPPED
    if (lastStatus === 'STOPPING') {
      if (!stoppingSeenAt) { stoppingSeenAt = Date.now(); log('  状态 STOPPING，等待收敛为 STOPPED'); }
      if (Date.now() - stoppingSeenAt > (opts.stoppingGraceMs || 90000)) {
        log('  STOPPING 超过宽限期，按「停止请求已受理」视为完成');
        return hit.task;
      }
      await sleep(intervalMs);
      continue;
    }
    if (STOPPABLE_STATES.includes(lastStatus) && attempts < maxStopAttempts && Date.now() - lastStopAt > retryEveryMs) {
      attempts += 1;
      lastStopAt = Date.now();
      try {
        const r = await apiPost(session, csrf, `/api/v1/ai_task/stop?id=${taskId}`);
        const code = r.json ? r.json.code : '?';
        const msg = r.json && r.json.msg ? r.json.msg : '';
        log(`  [stop #${attempts}] 状态=${lastStatus} -> HTTP ${r.status} code=${code} ${msg}`);
        if (code === 99) log('    （排队中暂不可停，稍后重试）');
      } catch (e) { log(`  [stop #${attempts}] 请求异常: ${e.message}`); }
    }
    await sleep(intervalMs);
  }
  throw new Error(`任务 ${taskId} 在超时前未停止，最后状态: ${lastStatus}`);
}

// --------------------- 单实例锁 ---------------------
const LOCK_FILE = path.join(path.dirname(CONFIG.logFile), '.openi-checkin.lock');
function acquireLock() {
  try {
    const st = fs.statSync(LOCK_FILE);
    // 超过 30 分钟的锁视为残留（上次异常退出）
    if (Date.now() - st.mtimeMs < 30 * 60 * 1000) {
      log(`⏭ 已有打卡进程在运行（${LOCK_FILE}），本次跳过`);
      return false;
    }
    fs.rmSync(LOCK_FILE, { force: true });
  } catch (_) { /* 不存在，正常 */ }
  try {
    fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
    return true;
  } catch (_) {
    log('⏭ 无法获取锁（并发），本次跳过');
    return false;
  }
}
function releaseLock() {
  try { fs.rmSync(LOCK_FILE, { force: true }); } catch (_) {}
}

// ------------------------ 帮助 / 自检 ------------------------
const HELP = `OpenI 每日调试任务打卡脚本（可分发版）

用法: node openi-checkin.js [选项]

  --check              环境自检：Node 版本、配置文件、凭据、站点连通性
  --verify-login        仅验证登录（成功退出码 0，失败非 0）
  --dry-run            只分析并打印计划，不修改任何数据
  --status             只读查看当前调试任务状态
  --cleanup            只停止所有活跃的调试任务
  --stop-id=<ID>       只停止指定任务
  --branch=create      强制走「新建任务」分支
  --branch=restart     强制走「再次调试」分支
  --cred=<方式>         auto | chrome | plain | cookie
  --profile=<名称>     指定 Chrome profile（默认自动扫描全部）
  --config=<路径>      指定配置文件（默认 ./config.json）
  --help               显示本帮助

配置优先级: 命令行 > 环境变量 > config.json > 内置默认值
环境变量: OPENI_USER, OPENI_PASS, OPENI_COOKIE, OPENI_BASE_URL

示例:
  node openi-checkin.js --check
  node openi-checkin.js --dry-run
  install-task.cmd
  uninstall-task.cmd
`;

async function selfCheck() {
  console.log('=== OpenI 打卡脚本环境自检 ===');
  const major = Number(process.versions.node.split('.')[0]);
  console.log(`Node.js      : ${process.version}  ${major >= 20 ? 'OK' : '需要 20+（chrome 方式需要 22+）'}`);
  console.log(`平台         : ${process.platform}`);
  const cfgPath = argValue('config') || path.join(APP_DIR, 'config.json');
  console.log(`配置文件     : ${cfgPath} ${fs.existsSync(cfgPath) ? '(存在)' : '(不存在，使用内置默认值)'}`);
  console.log(`站点         : ${CONFIG.baseUrl}`);
  console.log(`Chrome 目录  : ${CONFIG.chromeUserData} ${fs.existsSync(CONFIG.chromeUserData) ? '(存在)' : '(不存在)'}`);
  console.log(`凭据方式     : ${CONFIG.credentialSource}`);
  console.log(`日志文件     : ${CONFIG.logFile}`);
  console.log(`规格匹配     : ${JSON.stringify(CONFIG.specMatcher)}`);
  console.log(`镜像         : ${CONFIG.imageUrl}`);

  // 凭据
  try {
    const c = resolveCredential();
    console.log(`凭据         : OK (${c.source})`);
    if (c.username) console.log(`账号         : ${c.username}`);
  } catch (e) {
    console.log(`凭据         : 失败 → ${e.message}`);
  }

  // 站点连通性 + 登录页 RSA key
  try {
    const r = await fetch(`${CONFIG.baseUrl}/user/login`, { signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    const hasCsrf = /<meta name="_csrf" content="/.test(t);
    const hasKey = /publicKey\s*=\s*["']/.test(t);
    console.log(`站点连通性   : HTTP ${r.status}，_csrf=${hasCsrf ? 'OK' : '缺失'}，RSA 公钥=${hasKey ? '动态可提取' : '将用内置兜底 key'}`);
  } catch (e) {
    console.log(`站点连通性   : 失败 → ${e.message}`);
  }

  // 登录 + 读取任务（验证凭据真的可用）
  try {
    const s = new Session();
    const csrf = await login(s);
    const tasks = await fetchDebugTasks(s, csrf);
    console.log(`登录与接口   : OK，当前调试任务 ${tasks.length} 条`);
    tasks.slice(0, 5).forEach(t => console.log(`  id=${t.task.id} ${t.task.status} ${t.task.display_job_name}`));
  } catch (e) {
    console.log(`登录与接口   : 失败 → ${e.message}`);
  }
  console.log('=== 自检结束 ===');
}

// ------------------------ 主流程 ------------------------
/**
 * 仅验证登录与任务列表接口。成功打印 OK 行并以 0 退出；
 * 失败把原因打到 stderr 并以非 0 退出，供宿主判断凭据是否可用。
 */
async function verifyLoginOnly() {
  try {
    const s = new Session();
    const csrf = await login(s);
    const tasks = await fetchDebugTasks(s, csrf);
    console.log(`登录与接口   : OK，当前调试任务 ${tasks.length} 条`);
    process.exit(0);
  } catch (e) {
    console.error(`登录与接口   : 失败 → ${e && e.message ? e.message : e}`);
    process.exit(1);
  }
}

async function main() {
  if (ARGV.includes('--help') || ARGV.includes('-h')) { console.log(HELP); return; }
  if (ARGV.includes('--verify-login')) { await verifyLoginOnly(); return; }
  if (ARGV.includes('--check')) { await selfCheck(); return; }
  if (DRY_RUN || ARGV.includes('--status') || ARGV.includes('--cleanup') ||
      ARGV.some(a => a.startsWith('--stop-id='))) {
    // 只读/维护模式不占用锁
  } else if (!acquireLock()) {
    return;
  }
  try {
    await runMain();
  } finally {
    if (!DRY_RUN && !ARGV.includes('--status')) releaseLock();
  }
}

async function runMain() {
  log('===== OpenI 每日打卡开始' + (DRY_RUN ? '（DRY-RUN 不修改）' : '') + ' =====');
  const session = new Session();
  const csrf = await login(session);

  // 只读状态查询
  if (ARGV.includes('--status')) {
    const list = await fetchDebugTasks(session, csrf);
    log(`调试任务共 ${list.length} 条`);
    for (const t of list) {
      log(`  id=${t.task.id} status=${t.task.status} name=${t.task.display_job_name} 创建=${new Date(t.task.created_unix * 1000).toISOString()} 年龄=${ageDays(t.task.created_unix).toFixed(1)}天`);
    }
    return;
  }

  // 维护模式：只停止指定/全部活跃任务，不做打卡
  const stopIdArg = (ARGV.find(a => a.startsWith('--stop-id=')) || '').split('=')[1];
  const cleanup = ARGV.includes('--cleanup');
  if (stopIdArg || cleanup) {
    const list = await fetchDebugTasks(session, csrf);
    const activeStates = ['WAITING', 'RUNNING', 'INIT', 'STARTING', 'CREATING', 'PREPARING', 'CONNECTING'];
    const targets = stopIdArg
      ? list.filter(t => Number(t.task.id) === Number(stopIdArg))
      : list.filter(t => activeStates.includes(t.task.status));
    log(`维护模式：待停止 ${targets.length} 个任务`);
    for (const t of targets) {
      log(`停止 id=${t.task.id} status=${t.task.status}`);
      const f = await stopUntilStopped(session, csrf, t.task.id, { timeoutMs: 300000 });
      log(`  完成: ${f.status}`);
    }
    log('===== 维护结束 =====\n');
    return;
  }

  const tasks = await fetchDebugTasks(session, csrf);
  log(`调试任务共 ${tasks.length} 条`);
  for (const t of tasks) {
    log(`  - id=${t.task.id} status=${t.task.status} name=${t.task.display_job_name} 创建=${new Date(t.task.created_unix * 1000).toISOString()} 年龄=${ageDays(t.task.created_unix).toFixed(1)}天 can_delete=${t.can_delete}`);
  }

  // 先处理非终态任务（WAITING/RUNNING/INIT 等）：按用户规则，WAITING 即可点停止
  const active = tasks.filter(t => STOPPABLE_STATES.includes(t.task.status) || t.task.status === 'STOPPING');
  for (const t of active) {
    if (DRY_RUN) { log(`[dry] 将停止活跃任务 id=${t.task.id} status=${t.task.status}`); continue; }
    if (t.task.status === 'STOPPING') { log(`任务 ${t.task.id} 正在停止中（过渡态），跳过`); continue; }
    log(`停止活跃任务 id=${t.task.id} status=${t.task.status}`);
    try {
      const finalTask = await stopUntilStopped(session, csrf, t.task.id, { timeoutMs: 300000, stoppingGraceMs: 30000 });
      log(`  已完成 (${finalTask.status})`);
    } catch (e) { log(`  ⚠ ${e.message}`); }
  }

  // 清理活跃任务后重新拉取，避免用过期的快照做判断
  let current = active.length ? await fetchDebugTasks(session, csrf) : tasks;
  for (const t of current) {
    log(`  [当前] id=${t.task.id} status=${t.task.status} name=${t.task.display_job_name}`);
  }

  // 自动清理：长期卡在 STOPPING 的任务，服务端会一直拒绝删除（"task not stopped"）。
  // 每天探测一次；等平台把状态收敛成可删除终态后，立即删掉。
  // 只处理「创建超过 1 小时」的任务，避免误删刚点停止、正在正常收敛的新任务。
  const pendingDelete = current.filter(t =>
    t.task.status === 'STOPPING' && ageDays(t.task.created_unix) * 24 > 1);
  if (pendingDelete.length) {
    for (const t of pendingDelete) {
      log(`探测卡住任务 id=${t.task.id}（${t.task.display_job_name}，STOPPING）是否可删除`);
      if (DRY_RUN) { log('  [dry] 将调用 del'); continue; }
      const r = await apiPost(session, csrf, `/api/v1/ai_task/del?id=${t.task.id}`);
      const code = r.json ? r.json.code : '?';
      if (r.json && r.json.code === 0) {
        log(`  ✅ 已删除 id=${t.task.id}`);
      } else {
        log(`  仍不可删除 (code=${code} ${r.json && r.json.msg ? r.json.msg : ''})，等平台侧收敛`);
      }
    }
    current = await fetchDebugTasks(session, csrf);
  }

  // 站点允许再次调试的状态（与前端 checkOperation 一致）
  const REDEBUG_STATES = TERMINAL_STATES.filter(s => s !== 'SUCCEEDED' && s !== 'COMPLETED');
  const terminal = current.filter(t => REDEBUG_STATES.includes(t.task.status));
  const fresh = terminal.filter(t => ageDays(t.task.created_unix) <= CONFIG.maxTaskAgeDays);
  const stale = current.filter(t => REDEBUG_STATES.includes(t.task.status) && ageDays(t.task.created_unix) > CONFIG.maxTaskAgeDays);
  const stillActive = current.filter(t => STOPPABLE_STATES.includes(t.task.status) || t.task.status === 'STOPPING');
  log(`可再次调试: 30天内 ${fresh.length} 个，超过30天 ${stale.length} 个；仍活跃 ${stillActive.length} 个`);

  // 幂等保护：今天已经创建过调试任务 → 当日打卡积分已发放，不重复创建
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const todayCreated = current.filter(t => Number(t.task.created_unix) * 1000 >= startOfToday.getTime());
  if (todayCreated.length && !FORCE_BRANCH) {
    log(`⏭ 今天已创建过调试任务（${todayCreated.map(t => t.task.id).join(',')}），当日打卡已完成，跳过重复创建`);
    return;
  }

  let branch = FORCE_BRANCH;
  if (!branch) branch = fresh.length > 0 ? 'restart' : 'create';
  log(`选择分支: ${branch}`);

  // 超过 30 天的历史调试任务不能再次调试：从「更多 → 删除」清理后按新建分支执行
  if (stale.length) {
    for (const t of stale) {
      if (DRY_RUN) { log(`[dry] 将删除过期任务 id=${t.task.id}（${ageDays(t.task.created_unix).toFixed(0)}天）`); continue; }
      log(`删除超过30天的任务 id=${t.task.id} name=${t.task.display_job_name}`);
      const r = await apiPost(session, csrf, `/api/v1/ai_task/del?id=${t.task.id}`);
      log(`  del 响应: HTTP ${r.status} ${JSON.stringify(r.json)}`);
    }
    current = current.filter(t => !stale.includes(t));
    for (let i = fresh.length - 1; i >= 0; i--) {
      if (stale.includes(fresh[i])) fresh.splice(i, 1);
    }
    // 删除后没有可再次调试的任务，强制走新建
    if (branch === 'restart' && fresh.length === 0) branch = 'create';
  }

  // 任务总数上限保护：历史任务过多时先删最旧的，避免新建被「数量已达上限」拒绝
  const MAX_HISTORY = 4;
  if (branch === 'create' && terminal.length >= MAX_HISTORY) {
    const deletable = [...terminal].sort((a, b) => Number(a.task.created_unix) - Number(b.task.created_unix));
    const toDelete = deletable.slice(0, terminal.length - MAX_HISTORY + 1);
    for (const t of toDelete) {
      if (DRY_RUN) { log(`[dry] 将删除最旧历史任务 id=${t.task.id}`); continue; }
      log(`清理历史任务（数量上限保护）id=${t.task.id}`);
      const r = await apiPost(session, csrf, `/api/v1/ai_task/del?id=${t.task.id}`);
      log(`  del 响应: HTTP ${r.status} ${JSON.stringify(r.json)}`);
    }
  }

  let restartSucceeded = false;
  if (branch === 'restart' && fresh.length > 0) {
    // 选最新的一个
    fresh.sort((a, b) => Number(b.task.created_unix) - Number(a.task.created_unix));
    const target = fresh[0].task;
    log(`再次调试目标: id=${target.id} name=${target.display_job_name}`);
    if (DRY_RUN) { log('[dry] 将调用 restart 并等待 WAITING 后 stop'); return; }

    const beforeIds = new Set((await fetchDebugTasks(session, csrf)).map(t => Number(t.task.id)));
    // 后端偶发 code=99「Restart computing task failed」：重试，仍失败则回退新建分支
    let r = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      r = await apiPost(session, csrf, `/api/v1/ai_task/restart?id=${target.id}`);
      log(`  restart #${attempt}: HTTP ${r.status} ${JSON.stringify(r.json)}`);
      if (r.json && r.json.code === 0) break;
      if (attempt < 3) await sleep(5000);
    }
    if (r && r.json && r.json.code === 0) {
      restartSucceeded = true;
      // 找出新任务 id：优先用响应里的 id，否则列表里新增的
      let newId = r.json.data && r.json.data.id ? Number(r.json.data.id) : null;
      if (!newId || newId === Number(target.id)) {
        const after = await fetchDebugTasks(session, csrf);
        const added = after.filter(t => !beforeIds.has(Number(t.task.id)));
        if (added.length) newId = Number(added[0].task.id);
      }
      if (!newId) throw new Error('无法确定再次调试生成的新任务 ID');
      log(`  新任务 id=${newId}，等待进入 WAITING/RUNNING`);
      try {
        const st = await waitForStatus(session, csrf, newId, ['WAITING', 'RUNNING', ...TERMINAL_STATES], 300000);
        log(`  新任务状态=${st.status}`);
        if (!TERMINAL_STATES.includes(st.status)) {
          log('  执行停止');
          const finalTask = await stopUntilStopped(session, csrf, newId, { timeoutMs: 900000 });
          log(`✅ 再次调试分支完成：任务 ${newId} 最终状态 ${finalTask.status}`);
        } else {
          log(`✅ 再次调试分支：新任务直接进入终态 ${st.status}（打卡已完成）`);
        }
      } catch (e) {
        log(`⚠ 再次调试分支停止阶段异常: ${e.message}`);
      }
      return;
    }
    log('⚠ 再次调试接口连续失败，回退到「新建任务」分支');
  }
  if (restartSucceeded) return;

  // 新建分支（超过 30 天的历史任务已在上面删除）

  const cfgRes = await session.getJson(
    `${CONFIG.baseUrl}/api/v1/ai_task/creation/required?_csrf=${encodeURIComponent(csrf)}` +
    `&job_type=${CONFIG.jobType}&compute_source=${CONFIG.computeSource}&cluster_type=${CONFIG.clusterType}`
  );
  if (cfgRes.status !== 200 || !cfgRes.json || cfgRes.json.code !== 0) {
    throw new Error(`获取创建配置失败: HTTP ${cfgRes.status} ${cfgRes.text.slice(0, 200)}`);
  }
  const cfg = cfgRes.json.data;
  const specs = (cfg.specs && (cfg.specs.has_internet || cfg.specs.all)) || [];
  const m = CONFIG.specMatcher;
  let spec = null;
  if (CONFIG.specId) {
    spec = specs.find(s => Number(s.id) === Number(CONFIG.specId));
    if (!spec) throw new Error(`指定的 specId=${CONFIG.specId} 不在可用规格列表中: ${specs.map(s => s.id).join(',')}`);
  } else {
    spec = specs.find(s =>
      s.compute_resource === m.compute_resource &&
      s.acc_card_type === m.acc_card_type &&
      Number(s.acc_cards_num) === m.acc_cards_num &&
      Number(s.cpu_cores) === m.cpu_cores &&
      Number(s.mem_gi_b) === m.mem_gi_b
    );
  }
  if (!spec) {
    throw new Error(`未找到目标资源规格 ${JSON.stringify(m)}。可用规格: `
      + specs.map(s => `id=${s.id} ${s.acc_cards_num}*${s.acc_card_type}/cpu${s.cpu_cores}/mem${s.mem_gi_b}`).join('; ')
      + ' —— 可在 config.json 里用 specId 直接指定');
  }
  log(`选中资源规格 id=${spec.id} (${spec.acc_cards_num}*${spec.acc_card_type}, CPU ${spec.cpu_cores}, 内存 ${spec.mem_gi_b}GB, ${spec.unit_price}积分/时)`);

  const payload = {
    repoOwnerName: '-',
    repoName: '-',
    job_type: CONFIG.jobType,
    cluster: CONFIG.clusterType,
    compute_source: CONFIG.computeSource,
    display_job_name: cfg.display_job_name,
    description: '',
    has_internet: 2,
    visualize_required: false,
    spec_id: Number(spec.id),
    image_url: CONFIG.imageUrl,
    work_server_number: 1,
    time_limit: CONFIG.timeLimitHours,
    params: JSON.stringify({ parameter: [] }),
  };
  log(`新建任务参数: ${JSON.stringify(payload)}`);
  if (DRY_RUN) { log('[dry] 将提交新建任务，并在 WAITING 后停止'); return; }

  const beforeCreate = await fetchDebugTasks(session, csrf);
  const beforeIds = new Set(beforeCreate.map(t => Number(t.task.id)));

  const createRes = await apiPost(session, csrf, `/api/v1/-/-/ai_task/create`, payload);
  log(`新建响应: HTTP ${createRes.status} ${(createRes.text || '').slice(0, 400)}`);
  if (!createRes.json || createRes.json.code !== 0) {
    throw new Error(`新建任务失败: ${(createRes.json && createRes.json.msg) || createRes.text.slice(0, 300)}`);
  }

  // 找到新任务：优先用响应 id，否则用创建前快照对比
  let newId = createRes.json && createRes.json.data && createRes.json.data.id
    ? Number(createRes.json.data.id) : null;
  if (!newId) {
    await sleep(3000);
    const after = await fetchDebugTasks(session, csrf);
    const added = after.filter(t => !beforeIds.has(Number(t.task.id)));
    added.sort((a, b) => Number(b.task.created_unix) - Number(a.task.created_unix));
    if (added.length) newId = Number(added[0].task.id);
  }
  if (!newId) throw new Error('新建后未能确定新任务 ID');
  log(`新任务 id=${newId}`);

  try {
    const st = await waitForStatus(session, csrf, newId, ['WAITING', 'RUNNING', ...TERMINAL_STATES], 300000);
    log(`新任务状态=${st.status}`);
    if (TERMINAL_STATES.includes(st.status)) {
      log(`✅ 新建分支：任务已进入终态 ${st.status}（打卡已完成）`);
      return;
    }
    log('新任务已进入可停止状态，执行停止');
    const finalTask = await stopUntilStopped(session, csrf, newId, { timeoutMs: 900000 });
    log(`✅ 新建分支完成：任务 ${newId} 最终状态 ${finalTask.status}`);
  } catch (e) {
    log(`⚠ 新建分支停止阶段异常: ${e.message}`);
  }
}

main()
  .then(() => { if (!ARGV.includes('--help') && !ARGV.includes('-h') && !ARGV.includes('--check')) log('===== 结束 =====\n'); process.exit(0); })
  .catch((e) => { log('❌ 失败: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
