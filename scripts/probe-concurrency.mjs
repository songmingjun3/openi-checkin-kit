/**
 * Concurrency probe (diagnostic only, no network): confirm two accounts with
 * their own log directories do NOT share the engine's single-instance lock, and
 * that a same-account second run is still skipped.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const engine = path.join(root, 'lib', 'openi-checkin.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'oci-lock2-'));

function cfg(name, accountId, logDir) {
  fs.mkdirSync(logDir, { recursive: true });
  const file = path.join(temp, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({
    baseUrl: 'http://10.255.255.1', // unroutable: login hangs, holding the lock
    credentialSource: 'plain',
    username: 'probe',
    password: 'probe',
    logFile: path.join(logDir, 'openi-checkin.log'),
    httpTimeoutMs: 5000,
    taskName: `probe-${name}`,
  }, null, 2));
  return file;
}

const accountA = path.join(temp, 'logs', 'acctA');
const accountB = path.join(temp, 'logs', 'acctB');
const a = cfg('acctA', 'acctA', accountA);
const b = cfg('acctB', 'acctB', accountB);
const a2 = cfg('acctA-second', 'acctA', accountA); // same account, same dir

function start(file) {
  const child = spawn(process.execPath, [engine, `--config=${file}`], { cwd: temp });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  return { done: new Promise(resolve => child.on('exit', code => resolve({ code, out }))) };
}

const skip = /已有打卡进程在运行|无法获取锁/;

// 1) Different accounts, different log dirs -> must run concurrently.
const runA = start(a);
await new Promise(r => setTimeout(r, 1200));
const runB = start(b);
const [ra, rb] = await Promise.all([runA.done, runB.done]);
console.log('different accounts: A skipped =', skip.test(ra.out), '| B skipped =', skip.test(rb.out));

// 2) Same account (two invocations sharing its log dir) -> second must skip.
const runA1 = start(a);
await new Promise(r => setTimeout(r, 1200));
const runA2 = start(a2);
const [ra1, ra2] = await Promise.all([runA1.done, runA2.done]);
console.log('same account: second invocation skipped =', skip.test(ra2.out));

const ok = !skip.test(ra.out) && !skip.test(rb.out) && skip.test(ra2.out);
console.log('verdict:', ok ? 'PASS' : 'FAIL');
fs.rmSync(temp, { recursive: true, force: true });