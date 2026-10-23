/* stats.js — date helpers and statistics for Cigs.
   Pure functions, no DOM. Loaded by index.html (as window.CigStats)
   and by tools/test-stats.js (as a CommonJS module). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CigStats = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_MS = 86400000;

  // The hour at which a day starts (default 06:00): a cigarette at 02:00 on
  // the 21st counts for the 20th. Timestamps are never changed, only grouped,
  // so changing this re-sorts all existing data into the new days.
  let DAY_START = 6;
  function setDayStart(h) {
    h = Number(h);
    if (!Number.isInteger(h) || h < 0 || h > 23) return DAY_START;
    DAY_START = h;
    return DAY_START;
  }
  function dayStart() { return DAY_START; }
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

  // Day objects are local midnights of a calendar day; these helpers take those.
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  // Timestamps go through these: the same instant moved back by DAY_START
  // hours (wall clock, so DST changes do not shift it), the midnight of the
  // day it belongs to, and that day's key.
  function logicalTime(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() - DAY_START, d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  }
  function dayOf(d) { return startOfDay(logicalTime(d)); }
  function dayKeyOf(d) { return dayKey(dayOf(d)); }
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
  // minutes since the start of the (logical) day, 0..1439
  function minutesSinceDayStart(d) { return (minutesOfDay(d) - DAY_START * 60 + 1440) % 1440; }

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
    for (const d of dates) { const k = dayKeyOf(d); m.set(k, (m.get(k) || 0) + 1); }
    return m;
  }

  // Entries of one day (a day object), ascending, each with the gap (minutes)
  // since the previous one that day and its index in the full list.
  function dayEntries(dates, day) {
    const k = dayKey(day);
    const out = [];
    let prev = null;
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      if (dayKeyOf(d) !== k) continue;
      out.push({ date: d, index: i, gapMin: prev ? Math.round((d - prev) / 60000) : null });
      prev = d;
    }
    return out;
  }

  function countBetween(dates, from, to) { // from <= d < to, in day boundaries
    let n = 0;
    for (const d of dates) { const t = logicalTime(d); if (t >= from && t < to) n++; }
    return n;
  }

  // ---------- all-time statistics ----------

  // Days that count for averages: from the first logged day up to yesterday
  // (today is still in progress). If today is the only day with data, it counts.
  function countedDays(dates, now) {
    if (!dates.length) return [];
    const today = dayOf(now);
    const first = dayOf(dates[0]);
    if (first > today) return [];
    let last = addDays(today, -1);
    if (first > last) last = today;
    const out = [];
    for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
    return out;
  }

  function summary(dates, now) {
    const days = countedDays(dates, now);
    const res = {
      days: days.length, avgPerDay: null, avgFirst: null, weekdayAvg: null, weekendAvg: null,
      hourAvg: new Array(24).fill(0), peakHour: null, quietest: null,
    };
    if (!days.length) return res;

    const counts = countsByDay(dates);
    const keys = new Set();
    let total = 0, wk = 0, wkN = 0, we = 0, weN = 0;
    for (const d of days) {
      const k = dayKey(d);
      keys.add(k);
      const c = counts.get(k) || 0;
      total += c;
      if (isWeekend(d)) { we += c; weN++; } else { wk += c; wkN++; }
    }
    res.avgPerDay = total / days.length;
    res.weekdayAvg = wkN ? wk / wkN : null;
    res.weekendAvg = weN ? we / weN : null;

    const firstOfDay = new Map();
    const hours = new Array(24).fill(0);
    for (const d of dates) {
      const k = dayKeyOf(d);
      if (!keys.has(k)) continue;
      hours[d.getHours()]++;
      const m = minutesSinceDayStart(d);
      if (!firstOfDay.has(k) || m < firstOfDay.get(k)) firstOfDay.set(k, m);
    }
    if (firstOfDay.size) {
      let s = 0;
      firstOfDay.forEach((m) => { s += m; });
      res.avgFirst = (s / firstOfDay.size + DAY_START * 60) % 1440;   // back to clock time
    }
    res.hourAvg = hours.map((h) => h / days.length);
    let peak = 0;
    for (let h = 1; h < 24; h++) if (hours[h] > hours[peak]) peak = h;
    if (hours[peak] > 0) res.peakHour = peak;
    res.quietest = quietestHours(hours);
    return res;
  }

  // The longest run of empty hours (it may wrap past midnight):
  // {before: h} when it ends in the morning, {from, to} otherwise,
  // or {at: h} (the lightest hour) when no hour is empty.
  function quietestHours(hours) {
    if (!hours.some((h) => h > 0)) return null;
    let bestStart = -1, bestLen = 0, start = -1, len = 0;
    for (let i = 0; i < 48; i++) {
      if (hours[i % 24] === 0) {
        if (start < 0) start = i;
        len++;
        if (len > bestLen) { bestLen = len; bestStart = start; }
      } else { start = -1; len = 0; }
    }
    if (bestLen === 0) {
      let min = 0;
      for (let h = 1; h < 24; h++) if (hours[h] < hours[min]) min = h;
      return { at: min };
    }
    bestLen = Math.min(bestLen, 24);
    const from = bestStart % 24;
    const to = (bestStart + bestLen) % 24;
    if (from === 0 || from > to) return { before: to };
    return { from, to };
  }

  // ---------- timeline ----------

  // range: 'week' | 'month' | 'year' | 'all'
  function timeline(dates, now, range) {
    const today = dayOf(now);
    const firstDay = dates.length ? dayOf(dates[0]) : null;
    const counts = countsByDay(dates);
    let unit, start, end, label;
    if (range === 'week') { unit = 'day'; start = startOfWeek(today); end = addDays(start, 7); label = 'this week'; }
    else if (range === 'month') { unit = 'day'; start = startOfMonth(today); end = addMonths(start, 1); label = 'this month'; }
    else if (range === 'year') { unit = 'week'; start = new Date(today.getFullYear(), 0, 1); end = new Date(today.getFullYear() + 1, 0, 1); label = 'this year'; }
    else { unit = 'month'; start = startOfMonth(firstDay && firstDay < today ? firstDay : today); end = addMonths(startOfMonth(today), 1); label = 'all time'; }

    const buckets = [];
    if (unit === 'day') {
      for (let d = start; d < end; d = addDays(d, 1)) {
        buckets.push({ start: d, end: addDays(d, 1), count: 0, isWeekend: isWeekend(d),
          isCurrent: +d === +today, isFuture: d > today, day: d, title: fmtDayLong(d) });
      }
    } else if (unit === 'week') {
      for (let d = startOfWeek(start); d < end; d = addDays(d, 7)) {
        const e = addDays(d, 7);
        buckets.push({ start: d, end: e, count: 0, isWeekend: false,
          isCurrent: d <= today && today < e, isFuture: d > today, title: 'Week of ' + fmtDayShort(d) });
      }
    } else {
      for (let d = start; d < end; d = addMonths(d, 1)) {
        const e = addMonths(d, 1);
        buckets.push({ start: d, end: e, count: 0, isWeekend: false,
          isCurrent: d <= today && today < e, isFuture: d > today, title: MONTHS[d.getMonth()] + ' ' + d.getFullYear() });
      }
    }

    const b0 = buckets[0].start;
    let total = 0;
    for (const raw of dates) {
      const d = logicalTime(raw);
      if (d < start || d >= end) continue;
      let i;
      if (unit === 'day') i = daysBetween(b0, d);
      else if (unit === 'week') i = Math.floor(daysBetween(b0, d) / 7);
      else i = (d.getFullYear() - b0.getFullYear()) * 12 + d.getMonth() - b0.getMonth();
      if (i >= 0 && i < buckets.length) { buckets[i].count++; total++; }
    }

    // average per complete bucket (the current one is still in progress)
    let n = 0, sum = 0;
    for (const b of buckets) {
      if (b.isCurrent || b.isFuture || (firstDay && b.end <= firstDay)) continue;
      n++;
      sum += b.count;
    }
    const avg = n ? sum / n : null;

    // change versus the same number of complete days in the previous period
    let change = null;
    const elapsed = daysBetween(start, today);
    if (range !== 'all' && firstDay && elapsed > 0) {
      let pStart, prevLabel;
      if (range === 'week') { pStart = addDays(start, -7); prevLabel = 'last week'; }
      else if (range === 'month') {
        pStart = addMonths(start, -1);
        prevLabel = MONTHS[pStart.getMonth()] + ' 1–' + Math.min(elapsed, daysInMonth(pStart));
      } else { pStart = new Date(start.getFullYear() - 1, 0, 1); prevLabel = String(pStart.getFullYear()); }
      let pEnd = addDays(pStart, elapsed);
      if (pEnd > start) pEnd = start;
      if (firstDay <= pStart) {
        const cur = countBetween(dates, start, today);
        const prev = countBetween(dates, pStart, pEnd);
        if (prev > 0) change = { pct: Math.round(((cur - prev) / prev) * 100), cur, prev, label: prevLabel };
      }
    }

    // lowest / highest day in the range (today only counts for "highest")
    let lowest = null, highest = null;
    if (firstDay) {
      const from = start > firstDay ? start : firstDay;
      const to = end < today ? end : today;
      for (let d = from; d < to; d = addDays(d, 1)) {
        const c = counts.get(dayKey(d)) || 0;
        if (!lowest || c <= lowest.count) lowest = { count: c, day: d };
        if (!highest || c >= highest.count) highest = { count: c, day: d };
      }
      if (start <= today && today < end) {
        const c = counts.get(dayKey(today)) || 0;
        if (c > 0 && (!highest || c > highest.count)) highest = { count: c, day: today };
      }
    }

    // x-axis labels: {i: bucket index, text}
    let axis = [];
    if (range === 'week') axis = buckets.map((b, i) => ({ i, text: WEEKDAYS_SHORT[i] }));
    else if (range === 'month') {
      const last = buckets.length - 1;
      axis = [0, 7, 14, 21, last].map((i) => ({ i, text: i === 0 ? fmtDayShort(buckets[0].start) : String(i + 1) }));
    } else if (range === 'year') {
      for (let m = 0; m < 12; m++) {
        const f = new Date(start.getFullYear(), m, 1);
        const i = buckets.findIndex((b) => b.start <= f && f < b.end);
        if (i >= 0) axis.push({ i, text: MONTHS[m][0] });
      }
    } else {
      const count = buckets.length;
      buckets.forEach((b, i) => {
        const m = b.start.getMonth();
        if (count <= 8) axis.push({ i, text: MONTHS[m] });
        else if (count <= 24) { if (m % 3 === 0) axis.push({ i, text: MONTHS[m] }); }
        else if (m === 0) axis.push({ i, text: String(b.start.getFullYear()) });
      });
    }

    return { range, unit, label, start, end, total, buckets, avg, change, lowest, highest, axis };
  }

  // ---------- demo data (development only) ----------

  // Deterministic, realistic-looking history: evening peak, heavier weekends,
  // a slow downward trend. Never called by the app itself.
  function generateDemoEntries(now, days, seed) {
    days = days || 60;
    let s = (seed || 42) >>> 0;
    const rnd = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const W = [0.5, 0.3, 0.1, 0, 0, 0, 0.3, 1, 1.5, 1.2, 1.3, 1.5, 2, 1.6, 1.3, 1.5, 1.8, 2.2, 2.4, 2.6, 3, 2.6, 1.8, 1];
    const pickHour = (maxHour) => {
      let tot = 0;
      for (let h = 0; h <= maxHour; h++) tot += W[h];
      let r = rnd() * tot;
      for (let h = 0; h <= maxHour; h++) { r -= W[h]; if (r <= 0) return h; }
      return maxHour;
    };
    const today = startOfDay(now);
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = addDays(today, -i);
      const trend = 1.15 - 0.3 * (1 - i / days);
      const base = isWeekend(day) ? 13 : 8;
      let n = Math.max(0, Math.round(base * trend + (rnd() - 0.5) * 5));
      if (i === 0) n = Math.round((n * now.getHours()) / 24);
      const seen = new Set();
      for (let k = 0; k < n; k++) {
        const h = pickHour(i === 0 ? Math.max(0, now.getHours() - 1) : 23);
        const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, Math.floor(rnd() * 60), Math.floor(rnd() * 60));
        if (seen.has(+d)) continue;
        seen.add(+d);
        out.push(toLocalISO(d));
      }
    }
    return out.sort((a, b) => Date.parse(a) - Date.parse(b));
  }

  return {
    MONTHS, WEEKDAYS, WEEKDAYS_SHORT,
    setDayStart, dayStart, logicalTime, dayOf, dayKeyOf,
    toLocalISO, isValidISO, dayKey, parseDay, startOfDay, addDays, daysBetween,
    startOfMonth, addMonths, daysInMonth, startOfWeek, isWeekend, minutesOfDay, minutesSinceDayStart,
    fmtTime, fmtMinutes, fmtGap, fmtDayLong, fmtDayShort, fmt1,
    countsByDay, dayEntries, countBetween, countedDays, summary, quietestHours, timeline,
    generateDemoEntries,
  };
}));
