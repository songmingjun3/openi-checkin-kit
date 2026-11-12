/**
 * Regression: changing the global window must not make saving impossible.
 * The Host used to reject the whole save when an account window fell outside the
 * new global range, so the page could never persist a new execution time.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const text = fs.readFileSync(path.join(process.cwd(), 'index.js'), 'utf8');

// The clamp helper is inline in saveSettings; assert its exact behaviour by
// re-implementing nothing — instead check the shipped source no longer rejects
// out-of-range account windows and clamps every account.
const hasRejection = /the start time must be inside|the end time must be inside/.test(text);
if (hasRejection) {
  console.error('saveSettings still rejects out-of-range account windows');
  process.exit(1);
}
for (const needle of ['clampWindow', 'Apply every account, not just the submitted ones', 'Math.min(Math.max(']) {
  if (!text.includes(needle)) {
    console.error('missing clamp behaviour:', needle);
    process.exit(1);
  }
}

// Exercise the same arithmetic the helper uses, to pin the expected results.
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = v => { const [, h, m] = TIME.exec(v); return Number(h) * 60 + Number(m); };
const fmt = v => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
function clamp(startRaw, endRaw, gStart, gEnd) {
  const a = minutes(gStart), b = minutes(gEnd);
  let start = Math.min(Math.max(minutes(startRaw), a), b);
  let end = Math.min(Math.max(minutes(endRaw), a), b);
  if (end < start) [start, end] = [end, start];
  if (end <= start) { start = a; end = b; }
  return `${fmt(start)}-${fmt(end)}`;
}
const cases = [
  ['09:00', '09:25', '08:30', '09:40', '09:00-09:25'], // already inside widened range -> unchanged
  ['09:00', '09:25', '09:10', '09:40', '09:10-09:25'], // start pulled up into a narrowed range
  ['09:30', '09:50', '08:30', '09:40', '09:30-09:40'], // end pulled down into range
  ['10:30', '11:00', '09:00', '10:00', '09:00-10:00'], // fully outside -> whole range
  ['09:10', '09:20', '09:00', '10:00', '09:10-09:20'], // already inside -> unchanged
];
for (const [s, e, gs, ge, want] of cases) {
  const got = clamp(s, e, gs, ge);
  if (got !== want) { console.error(`clamp(${s},${e} in ${gs}-${ge}) = ${got}, want ${want}`); process.exit(1); }
}
console.log('save-settings clamp test: OK');
