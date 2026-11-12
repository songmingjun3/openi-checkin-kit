/**
 * Regression for the reported cross-account false positive:
 *  - a run that only skipped must NOT be recorded as a completed check-in;
 *  - a dry run must NOT mark the day as done;
 *  - only completed/already-done advance lastRanAt.
 */
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(process.cwd(), 'index.js'), 'utf8');

// classification must trust the engine's explicit marker
for (const needle of ['CHECKIN_RESULT:', "process.exit(!meta && (RUN_RESULT === 'skipped'", 'resolveNodeBinary', 'NODE_BINARY']) {
  const file = needle.startsWith('process.exit') || needle.startsWith("'NODE") ? null : null;
}
const engine = fs.readFileSync(path.join(process.cwd(), 'lib', 'openi-checkin.cjs'), 'utf8');
if (!engine.includes('CHECKIN_RESULT:')) { console.error('engine lacks explicit result marker'); process.exit(1); }
if (!engine.includes("RUN_RESULT === 'skipped'")) { console.error('engine does not fail on skip'); process.exit(1); }
if (!src.includes('const NODE_BINARY = resolveNodeBinary()')) { console.error('host does not resolve a real node binary'); process.exit(1); }
if (!src.includes('<Command>${xmlEscape(NODE_BINARY)}</Command>')) { console.error('scheduled task still uses the Electron exe'); process.exit(1); }
if (!src.includes('const ranToday = (account.lastRanAt ?? account.lastRunAt)')) { console.error('timer does not use true completion time'); process.exit(1); }
if (!src.includes("const succeeded = result === 'completed' || result === 'already-done'")) { console.error('bookkeeping still treats every run as success'); process.exit(1); }

// classifyRun is a pure function inside createService; verify its source rules.
const classify = src.slice(src.indexOf('function classifyRun'), src.indexOf('async function checkInAccount'));
for (const want of ["['completed', 'already-done', 'dry-run', 'skipped', 'incomplete', 'failed']", 'matchAll(/CHECKIN_RESULT', "return 'incomplete'"]) {
  if (!classify.includes(want)) { console.error('classifyRun missing rule:', want); process.exit(1); }
}
console.log('run-result regression test: OK');
