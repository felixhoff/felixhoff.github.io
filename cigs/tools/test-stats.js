// Checks for stats.js. Run with:  node tools/test-stats.js
'use strict';
const assert = require('node:assert/strict');
const S = require('../stats.js');

const now = new Date(2026, 9, 20, 16, 50);   // Tuesday, Oct 20 2026
const mk = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi);
let passed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

// ---- helpers ----
check('toLocalISO round-trips', () => {
  const d = mk(2026, 10, 20, 16, 42); d.setSeconds(11);
  const iso = S.toLocalISO(d);
  assert.match(iso, /^2026-10-20T16:42:11[+-]\d{2}:\d{2}$/);
  assert.equal(+new Date(iso), +d);
});
check('isValidISO', () => {
  assert.ok(S.isValidISO('2026-10-20T16:42:11+02:00'));
  assert.ok(!S.isValidISO('nope'));
  assert.ok(!S.isValidISO(42));
});
check('dayKey / parseDay', () => {
  assert.equal(S.dayKey(mk(2026, 1, 5, 23, 59)), '2026-01-05');
  assert.equal(+S.parseDay('2026-01-05'), +mk(2026, 1, 5, 0, 0));
});
check('startOfWeek is Monday', () => assert.equal(S.dayKey(S.startOfWeek(now)), '2026-10-19'));
check('daysBetween across DST changes', () => {
  assert.equal(S.daysBetween(mk(2026, 3, 28, 0, 0), mk(2026, 3, 30, 0, 0)), 2);
  assert.equal(S.daysBetween(mk(2026, 10, 24, 0, 0), mk(2026, 10, 26, 0, 0)), 2);
});
check('formatting', () => {
  assert.equal(S.fmtGap(65), '+1h 05');
  assert.equal(S.fmtGap(48), '+0h 48');
  assert.equal(S.fmtMinutes(8 * 60 + 41), '08:41');
  assert.equal(S.fmtMinutes(521.4), '08:41');
  assert.equal(S.fmtDayLong(now), 'Tuesday, Oct 20');
  assert.equal(S.fmtDayShort(mk(2026, 9, 3, 0, 0)), 'Sept 3');
});

// ---- a small hand-made history: Sat 17, Sun 18, Mon 19 (nothing), today Tue 20 ----
const dates = [
  mk(2026, 10, 17, 9, 0), mk(2026, 10, 17, 20, 0), mk(2026, 10, 17, 20, 30), mk(2026, 10, 17, 21, 30),
  mk(2026, 10, 18, 10, 0),
  mk(2026, 10, 20, 8, 12), mk(2026, 10, 20, 9, 26),
].sort((a, b) => a - b);

check('dayEntries gaps and indexes', () => {
  const l = S.dayEntries(dates, mk(2026, 10, 17, 0, 0));
  assert.equal(l.length, 4);
  assert.equal(l[0].gapMin, null);
  assert.equal(l[1].gapMin, 660);
  assert.equal(l[2].gapMin, 30);
  assert.equal(l[0].index, 0);
  assert.equal(S.dayEntries(dates, mk(2026, 10, 19, 0, 0)).length, 0);
});
check('countedDays runs from the first day to yesterday', () => {
  assert.deepEqual(S.countedDays(dates, now).map(S.dayKey), ['2026-10-17', '2026-10-18', '2026-10-19']);
  assert.deepEqual(S.countedDays([], now), []);
  assert.deepEqual(S.countedDays([mk(2026, 10, 20, 8, 0)], now).map(S.dayKey), ['2026-10-20']);
});
check('summary', () => {
  const s = S.summary(dates, now);
  assert.equal(s.days, 3);
  assert.equal(s.avgPerDay.toFixed(2), '1.67');
  assert.equal(s.weekendAvg, 2.5);
  assert.equal(s.weekdayAvg, 0);
  assert.equal(S.fmtMinutes(s.avgFirst), '09:30');
  assert.equal(s.peakHour, 20);
  assert.equal(s.hourAvg[20].toFixed(2), '0.67');
  assert.deepEqual(s.quietest, { before: 9 });
  assert.equal(S.summary([], now).avgPerDay, null);
});
check('quietestHours variants', () => {
  const h = new Array(24).fill(1);
  assert.deepEqual(S.quietestHours(h), { at: 0 });
  h[13] = h[14] = h[15] = 0;
  assert.deepEqual(S.quietestHours(h), { from: 13, to: 16 });
  h[22] = h[23] = h[0] = h[1] = h[2] = 0;
  assert.deepEqual(S.quietestHours(h), { before: 3 });
  assert.equal(S.quietestHours(new Array(24).fill(0)), null);
});
check('timeline month', () => {
  const T = S.timeline(dates, now, 'month');
  assert.equal(T.buckets.length, 31);
  assert.equal(T.total, 7);
  assert.equal(T.buckets[16].count, 4);
  assert.equal(T.buckets[16].isWeekend, true);
  assert.equal(T.buckets[19].isCurrent, true);
  assert.equal(T.buckets[20].isFuture, true);
  assert.equal(T.avg.toFixed(2), '1.67');
  assert.equal(T.change, null);
  assert.equal(T.lowest.count, 0);
  assert.equal(S.dayKey(T.lowest.day), '2026-10-19');
  assert.equal(T.highest.count, 4);
  assert.deepEqual(T.axis.map((a) => a.text), ['Oct 1', '8', '15', '22', '31']);
});
check('timeline week', () => {
  const T = S.timeline(dates, now, 'week');
  assert.equal(T.buckets.length, 7);
  assert.equal(S.dayKey(T.buckets[0].start), '2026-10-19');
  assert.equal(T.total, 2);
  assert.equal(T.avg, 0);
  assert.deepEqual(T.axis.map((a) => a.text), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
});
check('timeline year and all time', () => {
  const Y = S.timeline(dates, now, 'year');
  assert.ok(Y.buckets.length >= 52 && Y.buckets.length <= 54);
  assert.equal(Y.total, 7);
  assert.equal(Y.axis.length, 12);
  const A = S.timeline(dates, now, 'all');
  assert.equal(A.buckets.length, 1);
  assert.equal(A.buckets[0].title, 'Oct 2026');
  assert.equal(A.total, 7);
  assert.equal(S.timeline([], now, 'all').total, 0);
});

// ---- generated history ----
check('demo data and period comparison', () => {
  const demo = S.generateDemoEntries(now, 90, 7).map((s) => new Date(s));
  assert.ok(demo.length > 400, 'enough entries: ' + demo.length);
  for (let i = 1; i < demo.length; i++) assert.ok(demo[i] >= demo[i - 1], 'sorted');
  const s = S.summary(demo, now);
  assert.equal(s.days, 89);
  assert.ok(s.weekendAvg > s.weekdayAvg, 'weekends heavier');
  assert.ok(s.peakHour >= 17 && s.peakHour <= 22, 'evening peak, got ' + s.peakHour);
  const M = S.timeline(demo, now, 'month');
  assert.equal(M.change.label, 'Sept 1–19');
  assert.equal(M.change.cur, S.countBetween(demo, mk(2026, 10, 1, 0, 0), mk(2026, 10, 20, 0, 0)));
  assert.equal(M.change.prev, S.countBetween(demo, mk(2026, 9, 1, 0, 0), mk(2026, 9, 20, 0, 0)));
  assert.equal(S.timeline(demo, now, 'week').change.label, 'last week');
  assert.equal(S.timeline(demo, now, 'year').change, null);
  assert.equal(S.timeline(demo, now, 'all').buckets.length, 4);   // Jul..Oct
  assert.equal(S.generateDemoEntries(now, 30, 1).join(), S.generateDemoEntries(now, 30, 1).join(), 'deterministic');
});

console.log(passed + ' checks passed' + (process.exitCode ? ', some FAILED' : ''));
