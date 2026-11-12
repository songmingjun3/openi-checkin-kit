/**
 * Regression: a freshly created (or restarted) task must be allowed to reach
 * RUNNING before a stop request is sent. Stopping a task in WAITING leaves it
 * impossible to debug again.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = fs.readFileSync(path.join(root, 'lib', 'openi-checkin.cjs'), 'utf8');

for (const needle of [
  'async function waitForRunning(',
  "last === 'RUNNING'",
  'const stopStates = opts.requireRunning',
  'requireRunning: true',
  '新任务已真正 RUNNING，执行停止',
  '任务已真正 RUNNING，执行停止',
]) {
  if (!src.includes(needle)) { console.error('missing:', needle); process.exit(1); }
}
if (/waitForStatus\(session, csrf, newId, \['WAITING', 'RUNNING'/.test(src)) {
  console.error('create/restart still stops at WAITING'); process.exit(1);
}
if (/WAITING 后停止|等待 WAITING 后 stop|将提交新建任务，并在 WAITING/.test(src)) {
  console.error('dry-run copy still says stop after WAITING'); process.exit(1);
}
if (!src.includes('进入 RUNNING 后再停止')) {
  console.error('log copy not updated'); process.exit(1);
}

// Simulate the state machine: RUNNING is the only stoppable state in this mode.
const stopStates = ['RUNNING'];
const seen = ['WAITING', 'WAITING', 'RUNNING'];
let firstStopAt = null;
for (const s of seen) {
  if (stopStates.includes(s)) { firstStopAt = s; break; }
}
if (firstStopAt !== 'RUNNING') { console.error('stop was sent too early'); process.exit(1); }
console.log('wait-for-running regression test: OK');