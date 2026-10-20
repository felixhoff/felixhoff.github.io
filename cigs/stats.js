/* stats.js — date helpers and statistics for Cigs.
   Pure functions, no DOM. Loaded by index.html (as window.CigStats)
   and by tools/test-stats.js (as a CommonJS module). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CigStats = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_MS = 86400000;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // ---------- dates ----------

  const pad2 = (n) => (n < 10 ? '0' : '') + n;

  // ISO 8601 with the local UTC offset, e.g. 2026-10-20T16:42:11+02:00
  function toLocalISO(d) {
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const abs = Math.abs(off);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) +
      sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60);
  }

  function isValidISO(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !isNaN(Date.parse(s));
  }

  // "YYYY-MM-DD" in local time; the key used for day grouping.
  function dayKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseDay(key) {
    const p = key.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS); }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
  function startOfWeek(d) { // Monday
    const s = startOfDay(d);
    return addDays(s, -((s.getDay() + 6) % 7));
  }
  function isWeekend(d) { const w = d.getDay(); return w === 0 || w === 6; }
  function minutesOfDay(d) { return d.getHours() * 60 + d.getMinutes(); }

  // ---------- formatting ----------

  function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function fmtMinutes(m) { m = Math.round(m) % 1440; return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }
  function fmtGap(min) { return '+' + Math.floor(min / 60) + 'h ' + pad2(min % 60); }
  function fmtDayLong(d) { return WEEKDAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function fmtDayShort(d) { return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function fmt1(x) { return x.toFixed(1); }

  // ---------- grouping ----------

  // dates: ascending array of Date objects.
  function countsByDay(dates) {
    const m = new Map();
    for (const d of dates) { const k = dayKey(d); m.set(k, (m.get(k) || 0) + 1); }
    return m;
  }

  // Entries of one local day, ascending, each with the gap (minutes) since the previous one that day.
  function dayEntries(dates, day) {
    const k = dayKey(day);
    const out = [];
    let prev = null;
    for (const d of dates) {
      if (dayKey(d) !== k) continue;
      out.push({ date: d, gapMin: prev ? Math.round((d - prev) / 60000) : null });
      prev = d;
    }
    return out;
  }

  return {
    MONTHS, WEEKDAYS, WEEKDAYS_SHORT,
    toLocalISO, isValidISO, dayKey, parseDay, startOfDay, addDays, daysBetween,
    startOfMonth, addMonths, daysInMonth, startOfWeek, isWeekend, minutesOfDay,
    fmtTime, fmtMinutes, fmtGap, fmtDayLong, fmtDayShort, fmt1,
    countsByDay, dayEntries,
  };
}));
