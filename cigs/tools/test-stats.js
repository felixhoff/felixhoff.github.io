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

// ---- the day starts at 06:00 by default: late nights count for the day before ----
check('day start: grouping, keys and times', () => {
  assert.equal(S.dayStart(), 6);
  assert.equal(S.dayKeyOf(mk(2026, 10, 18, 1, 30)), '2026-10-17');      // 01:30 on the 18th -> the 17th
  assert.equal(S.dayKeyOf(mk(2026, 10, 18, 5, 59)), '2026-10-17');
  assert.equal(S.dayKeyOf(mk(2026, 10, 18, 6, 0)), '2026-10-18');
  assert.equal(S.dayKeyOf(mk(2026, 10, 18, 23, 59)), '2026-10-18');
  assert.equal(+S.dayOf(mk(2026, 10, 18, 1, 30)), +mk(2026, 10, 17, 0, 0));
  assert.equal(+S.logicalTime(mk(2026, 10, 18, 1, 30)), +mk(2026, 10, 17, 19, 30));
  assert.equal(S.minutesSinceDayStart(mk(2026, 10, 18, 6, 0)), 0);
  assert.equal(S.minutesSinceDayStart(mk(2026, 10, 18, 1, 30)), 19 * 60 + 30);
  // the first of the month: 1 March 02:00 belongs to 28 February
  assert.equal(S.dayKeyOf(mk(2026, 3, 1, 2, 0)), '2026-02-28');
  // across the autumn DST change (Oct 25 2026 in Europe) the boundary stays at 06:00 wall clock
  assert.equal(S.dayKeyOf(mk(2026, 10, 25, 5, 30)), '2026-10-24');
  assert.equal(S.dayKeyOf(mk(2026, 10, 25, 6, 30)), '2026-10-25');
  // setDayStart validates and reports the value in force
  assert.equal(S.setDayStart('4'), 4);
  assert.equal(S.dayKeyOf(mk(2026, 10, 18, 3, 59)), '2026-10-17');
  assert.equal(S.dayKeyOf(mk(2026, 10, 18, 4, 0)), '2026-10-18');
  assert.equal(S.setDayStart(25), 4);
  assert.equal(S.setDayStart('x'), 4);
  assert.equal(S.setDayStart(0), 0);
  assert.equal(S.dayKeyOf(mk(2026, 10, 18, 0, 0)), '2026-10-18');      // midnight: the classic calendar day
  assert.equal(S.setDayStart(6), 6);
});
check('day start: statistics regroup existing data', () => {
  // the Oct 17 evening runs late: 00:40 and 01:30 on the 18th belong to the 17th
  const late = dates.concat([mk(2026, 10, 18, 0, 40), mk(2026, 10, 18, 1, 30)]).sort((a, b) => a - b);
  const l17 = S.dayEntries(late, mk(2026, 10, 17, 0, 0));
  assert.equal(l17.length, 6);
  assert.equal(S.fmtTime(l17[5].date), '01:30');
  assert.equal(l17[4].gapMin, 190);                                      // 21:30 -> 00:40
  assert.equal(S.dayEntries(late, mk(2026, 10, 18, 0, 0)).length, 1);   // only the 10:00
  assert.equal(S.countsByDay(late).get('2026-10-17'), 6);
  const s = S.summary(late, now);
  assert.equal(s.days, 3);
  assert.equal(s.avgPerDay.toFixed(2), '2.33');                        // 6 + 1 + 0 over three days
  assert.equal(S.fmtMinutes(s.avgFirst), '09:30');                       // 01:30 is not a "first cigarette"
  const T = S.timeline(late, now, 'month');
  assert.equal(T.buckets[16].count, 6);
  assert.equal(T.buckets[17].count, 1);
  assert.equal(T.highest.count, 6);
  assert.equal(S.countBetween(late, mk(2026, 10, 17, 0, 0), mk(2026, 10, 18, 0, 0)), 6);
  // "today" at 02:00 on the 21st is still the 20th
  const small = S.timeline(late, mk(2026, 10, 21, 2, 0), 'week');
  assert.equal(S.dayKey(small.buckets[1].start), '2026-10-20');
  assert.equal(small.buckets[1].isCurrent, true);
  assert.deepEqual(S.countedDays(late, mk(2026, 10, 21, 2, 0)).map(S.dayKey), ['2026-10-17', '2026-10-18', '2026-10-19']);
  // with the day starting at midnight the same data falls back to calendar days
  S.setDayStart(0);
  assert.equal(S.dayEntries(late, mk(2026, 10, 17, 0, 0)).length, 4);
  assert.equal(S.dayEntries(late, mk(2026, 10, 18, 0, 0)).length, 3);
  assert.equal(S.fmtMinutes(S.summary(late, now).avgFirst), '04:50');   // first of the 17th 09:00, of the 18th 00:40
  S.setDayStart(6);
});

console.log(passed + ' checks passed' + (process.exitCode ? ', some FAILED' : ''));
