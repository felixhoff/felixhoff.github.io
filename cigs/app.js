/* app.js — Cigs UI and data layer (cigarettes and spliffs, two separate lists). */
(function () {
  'use strict';

  const S = window.CigStats;
  const STORAGE_KEYS = { cig: 'cigs.entries', spliff: 'cigs.spliffs' };
  const MODE_KEY = 'cigs.mode';
  const SOUND_KEY = 'cigs.sound';
  const MODES = ['cig', 'spliff'];
  const NOUN = { cig: 'cigarette', spliff: 'spliff' };
  const NOUNS = { cig: 'cigarettes', spliff: 'spliffs' };
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =====================================================================
  // Data layer: one ISO timestamp per cigarette or spliff, kept sorted,
  // write-through. Cigarettes and spliffs are two separate lists; `entries`
  // and `dates` always point at the list of the current mode.
  // =====================================================================

  const lists = { cig: [], spliff: [] };   // ISO strings, ascending, per mode
  let mode = 'cig';                        // 'cig' | 'spliff'
  let entries = lists.cig;                 // the list of the current mode
  let dates = [];                          // same entries as Date objects

  function loadEntries() {
    MODES.forEach((m) => {
      let list = [];
      try { list = JSON.parse(localStorage.getItem(STORAGE_KEYS[m]) || '[]'); } catch (e) { list = []; }
      lists[m] = Array.isArray(list) ? list.filter(S.isValidISO) : [];
      lists[m].sort((a, b) => Date.parse(a) - Date.parse(b));
    });
    let m = 'cig';
    try { m = localStorage.getItem(MODE_KEY) || 'cig'; } catch (e) { /* default */ }
    activate(MODES.indexOf(m) >= 0 ? m : 'cig');
  }
  function activate(m) {
    mode = m;
    entries = lists[m];
    dates = entries.map((s) => new Date(s));
  }
  function sortEntries() {
    entries.sort((a, b) => Date.parse(a) - Date.parse(b));
    dates = entries.map((s) => new Date(s));
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEYS[mode], JSON.stringify(entries)); }
    catch (e) { toast('Could not save: storage is full'); }
  }
  function addEntry(date) {
    const iso = S.toLocalISO(date);
    entries.push(iso);
    sortEntries();
    persist();
    render();
    return iso;
  }
  function removeEntry(iso) {
    const i = entries.indexOf(iso);
    if (i < 0) return false;
    entries.splice(i, 1);
    sortEntries();
    persist();
    render();
    return true;
  }
  // Adds entries that are not already present (compared by instant) to the
  // list of mode `m` (the current mode by default). Returns the number added.
  function mergeEntries(list, m) {
    m = m || mode;
    const target = lists[m];
    const have = new Set(target.map((s) => Date.parse(s)));
    let added = 0;
    for (const s of list) {
      if (!S.isValidISO(s)) continue;
      const t = Date.parse(s);
      if (have.has(t)) continue;
      have.add(t);
      target.push(s);
      added++;
    }
    if (added) {
      target.sort((a, b) => Date.parse(a) - Date.parse(b));
      try { localStorage.setItem(STORAGE_KEYS[m], JSON.stringify(target)); }
      catch (e) { toast('Could not save: storage is full'); }
      if (m === mode) { activate(mode); render(); }
    }
    return added;
  }
  function replaceEntries(list, m) {
    m = m || mode;
    lists[m] = list.filter(S.isValidISO);
    lists[m].sort((a, b) => Date.parse(a) - Date.parse(b));
    try { localStorage.setItem(STORAGE_KEYS[m], JSON.stringify(lists[m])); }
    catch (e) { toast('Could not save: storage is full'); }
    if (m === mode) { activate(mode); render(); }
  }

  // =====================================================================
  // Mode: cigarettes or spliffs (the toggle at the top right)
  // =====================================================================

  const modeToggles = $$('[data-mode-toggle]');
  const themeLight = $('#theme-light');
  const themeDark = $('#theme-dark');
  const THEME = { cig: ['#CFE3F5', '#13202E'], spliff: ['#D6EFDA', '#122419'] };

  function setMode(m, opts) {
    if (MODES.indexOf(m) < 0) return;
    const changed = m !== mode;
    activate(m);
    try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* remembered only for this visit */ }
    if (m === 'spliff') document.documentElement.setAttribute('data-mode', 'spliff');
    else document.documentElement.removeAttribute('data-mode');
    if (themeLight) themeLight.setAttribute('content', THEME[m][0]);
    if (themeDark) themeDark.setAttribute('content', THEME[m][1]);
    modeToggles.forEach((b) => b.setAttribute('aria-checked', String(m === 'spliff')));
    if (changed && !(opts && opts.silent)) {
      hideUndo();
      hideToast();
      ui.tooltip = null;
      ui.day = null;
      cancelAnimationFrame(burnRaf);
      MODES.forEach((x) => setBurn(0, 0, art[x]));
    }
    render();
  }
  modeToggles.forEach((b) => b.addEventListener('click', () => setMode(mode === 'cig' ? 'spliff' : 'cig')));

  // =====================================================================
  // UI state
  // =====================================================================

  const ui = {
    view: 'main',        // 'main' | 'stats'
    segment: 'today',    // 'today' | 'stats' | 'timeline'  (remembered while open)
    range: 'month',      // timeline range
    day: null,           // day key shown in the Today segment; null = today
    tooltip: null,       // selected timeline bar index
  };

  function render() {
    renderMain();
    if (ui.view === 'stats') renderStatsView();
    updateSettingsInfo();
  }

  // =====================================================================
  // Main screen
  // =====================================================================

  const mainCount = $('#main-count');
  const mainLast = $('#main-last');
  const glyphs = $('#glyphs');
  const disk = $('#btn-log');
  const undoBtn = $('#btn-undo');

  const GLYPH = {
    cig: '<svg class="glyph" viewBox="0 0 18 8" aria-hidden="true">' +
      '<rect class="glyph-filter" x="0" y="1" width="5" height="6" rx="1.5"/>' +
      '<rect class="glyph-body" x="5" y="1" width="10.5" height="6"/>' +
      '<rect class="glyph-tip" x="15" y="1" width="3" height="6" rx="1.5"/></svg>',
    spliff: '<svg class="glyph" viewBox="0 0 18 8" aria-hidden="true">' +
      '<rect class="glyph-roach" x="0" y="2" width="4" height="4" rx="1"/>' +
      '<path class="glyph-cone" d="M4 2 L14 0 L14 8 L4 6 Z"/>' +
      '<path class="glyph-tip" d="M14 0.5 L18 3 L18 5 L14 7.5 Z"/></svg>',
  };

  function renderMain() {
    const now = new Date();
    const todays = S.dayEntries(dates, now);
    setCount(mainCount, todays.length);
    glyphs.innerHTML = GLYPH[mode].repeat(todays.length);
    mainLast.textContent = todays.length
      ? 'last one at ' + S.fmtTime(todays[todays.length - 1].date)
      : 'no ' + NOUN[mode] + ' yet';
    disk.setAttribute('aria-label', 'Log a ' + NOUN[mode]);
    MODES.forEach((m) => {   // SVG elements have no `hidden` property, so use the attribute
      if (m === mode) art[m].svg.removeAttribute('hidden');
      else art[m].svg.setAttribute('hidden', '');
    });
  }

  let countAnim = null;
  function setCount(el, value) {
    const text = String(value);
    if (el.textContent === text) return;
    if (countAnim) countAnim.cancel();
    el.textContent = text;
    if (REDUCED_MOTION || !el.animate) return;
    countAnim = el.animate(
      [{ transform: 'translateY(14px) scale(0.96)', opacity: 0.2 }, { transform: 'none', opacity: 1 }],
      { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
    );
  }

  // --- logging a cigarette ---
  let lastTapAt = 0;
  let undoTimer = 0;
  let undoIso = null;

  disk.addEventListener('pointerdown', () => disk.classList.add('is-pressed'));
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
    disk.addEventListener(ev, () => disk.classList.remove('is-pressed')));
  disk.addEventListener('click', onLogTap);

  function onLogTap() {
    const now = Date.now();
    if (now - lastTapAt < 1500) return;   // double-tap guard
    lastTapAt = now;
    undoIso = addEntry(new Date(now));
    springDisk();
    startBurn();
    playClick();
    showUndo();
  }

  function showUndo() {
    undoBtn.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, 5000);
  }
  function hideUndo() {
    clearTimeout(undoTimer);
    undoBtn.hidden = true;
    undoIso = null;
  }
  undoBtn.addEventListener('click', () => {
    if (undoIso) removeEntry(undoIso);
    hideUndo();
    lastTapAt = 0;
  });

  function springDisk() {
    if (REDUCED_MOTION || !disk.animate) return;
    disk.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(0.92)', offset: 0.3 }, { transform: 'scale(1.04)', offset: 0.7 }, { transform: 'scale(1)' }],
      { duration: 250, easing: 'ease-out' }
    );
  }

  // --- the cigarette (or spliff) burns itself ---
  function parts(prefix) {
    return {
      svg: $('#art-' + prefix),
      clip: $('#' + prefix + '-clip-rect'),
      tip: $('#' + prefix + '-tip'),
      cap: $('#' + prefix + '-cap'),
      ember: $('#' + prefix + '-ember'),
      glow: $('#' + prefix + '-glow'),
      ash: $('#' + prefix + '-ash'),
      ashBits: $$('.' + prefix + '-ashbit'),
      smoke: $('#' + prefix + '-smoke'),
    };
  }
  const art = { cig: parts('cig'), spliff: parts('spliff') };
  const BURN_MS = 1200;
  const BODY_END = 188;    // right edge of the body (unrotated SVG units)
  const TRAVEL = 84;       // how far the tip moves toward the filter
  // the spliff is a cone: its lit end shrinks as it burns toward the roach
  const CONE_WIDE = 20;    // half-height of the cone at the lit end
  const CONE_NARROW = 9;   // half-height at the roach
  let burnRaf = 0;

  function startBurn() {
    cancelAnimationFrame(burnRaf);
    MODES.forEach((m) => { if (m !== mode) setBurn(0, 0, art[m]); });
    if (REDUCED_MOTION) {
      setBurn(0, 0.5);
      setTimeout(() => setBurn(0, 0), 200);
      return;
    }
    const t0 = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / BURN_MS);
      const ease = t * t * (3 - 2 * t);
      setBurn(TRAVEL * ease, t);
      if (t < 1) burnRaf = requestAnimationFrame(frame);
      else setBurn(0, 0);   // snap back to a fresh cigarette
    };
    burnRaf = requestAnimationFrame(frame);
  }

  // d: distance the tip has travelled; t: 0..1 progress (0 = idle)
  function setBurn(d, t, cig) {
    cig = cig || art[mode];
    const glow = Math.sin(Math.PI * t);                // rises then settles
    cig.clip.setAttribute('width', BODY_END - d);
    let tf = 'translate(' + (-d) + ' 0)';
    if (cig === art.spliff) {
      const k = (CONE_WIDE - (CONE_WIDE - CONE_NARROW) * (d / (BODY_END - 96))) / CONE_WIDE;
      tf += ' translate(' + BODY_END + ' 130) scale(' + k.toFixed(4) + ') translate(' + (-BODY_END) + ' -130)';
    }
    cig.tip.setAttribute('transform', tf);
    cig.glow.setAttribute('opacity', (0.9 * glow).toFixed(3));
    cig.ember.setAttribute('r', (5.5 + 3 * glow).toFixed(2));
    cig.ember.setAttribute('fill', glow > 0.35 ? '#FFF2A8' : '#FFD36B');
    cig.cap.style.fill = glow > 0.2 ? '#FF9A6E' : '';
    const ashIn = Math.min(1, t * 4);
    const ashOut = t > 0.85 ? (1 - t) / 0.15 : 1;
    cig.ash.setAttribute('opacity', (t ? ashIn * ashOut : 0).toFixed(3));
    cig.ashBits.forEach((b, i) => {
      const fall = Math.max(0, t - 0.4 - i * 0.15) / 0.45;
      b.setAttribute('transform', 'translate(' + (2 * fall) + ' ' + (22 * fall) + ')');
      b.setAttribute('opacity', (1 - fall).toFixed(3));
    });
    cig.smoke.setAttribute('transform', 'translate(0 ' + (-18 * t) + ')');
    cig.smoke.setAttribute('opacity', (1 - t).toFixed(3));
  }

  // --- a short, quiet click (Web Audio) ---
  let audioCtx = null;
  function soundEnabled() { return localStorage.getItem(SOUND_KEY) !== '0'; }
  function playClick() {
    if (!soundEnabled()) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1900, t);
      osc.frequency.exponentialRampToValueAtTime(700, t + 0.05);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.1, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    } catch (e) { /* sound is optional */ }
  }

  // =====================================================================
  // Toast
  // =====================================================================

  const toastEl = $('#toast');
  const toastText = $('#toast-text');
  const toastAction = $('#toast-action');
  let toastTimer = 0;
  let toastOnAction = null;

  function toast(message, opts) {
    opts = opts || {};
    toastText.textContent = message;
    toastOnAction = opts.onAction || null;
    toastAction.textContent = opts.action || 'Undo';
    toastAction.hidden = !toastOnAction;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opts.duration || 5000);
  }
  function hideToast() { clearTimeout(toastTimer); toastEl.hidden = true; toastOnAction = null; }
  toastAction.addEventListener('click', () => { const fn = toastOnAction; hideToast(); if (fn) fn(); });

  // =====================================================================
  // Statistics view
  // =====================================================================

  const viewMain = $('#view-main');
  const viewStats = $('#view-stats');
  const statsScroll = $('#stats-scroll');
  const segmented = $('#segmented');
  const segThumb = $('.segmented-thumb', segmented);
  const segBtns = $$('.segment', segmented);
  const panels = { today: $('#panel-today'), stats: $('#panel-stats'), timeline: $('#panel-timeline') };
  const SEGMENTS = ['today', 'stats', 'timeline'];

  function showView(name) {
    if (ui.view === name) return;
    ui.view = name;
    hideUndo();
    hideToast();
    ui.tooltip = null;
    const entering = name === 'stats' ? viewStats : viewMain;
    const leaving = name === 'stats' ? viewMain : viewStats;
    leaving.hidden = true;
    entering.hidden = false;
    if (!REDUCED_MOTION && entering.animate) {
      entering.animate(
        [{ transform: 'translateX(' + (name === 'stats' ? 32 : -32) + 'px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 220, easing: 'ease-out' }
      );
    }
    if (name === 'stats') statsScroll.scrollTop = 0;
    render();
  }
  $('#btn-stats').addEventListener('click', () => showView('stats'));
  $('#btn-back').addEventListener('click', () => showView('main'));

  segBtns.forEach((b) => b.addEventListener('click', () => setSegment(b.dataset.seg)));
  function setSegment(seg) {
    ui.segment = seg;
    ui.tooltip = null;
    statsScroll.scrollTop = 0;
    renderStatsView();
  }

  function renderStatsView() {
    const idx = SEGMENTS.indexOf(ui.segment);
    segThumb.style.transform = 'translateX(' + idx * 100 + '%)';
    segBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.seg === ui.segment)));
    SEGMENTS.forEach((s) => { panels[s].hidden = s !== ui.segment; });
    if (ui.segment === 'today') renderToday();
    else if (ui.segment === 'stats') renderStats();
    else renderTimeline();
  }

  const CHEVRON_L = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHEVRON_R = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // ---- Today segment: one day, today by default ----

  function renderToday() {
    const now = new Date();
    const today = S.startOfDay(now);
    const day = ui.day ? S.parseDay(ui.day) : today;
    const isToday = +day === +today;
    const list = S.dayEntries(dates, day);
    const sum = S.summary(dates, now);

    let html =
      '<div class="daynav">' +
        '<button class="nav-btn" id="day-prev" type="button" aria-label="Previous day">' + CHEVRON_L + '</button>' +
        '<button class="daynav-label" id="day-reset" type="button"' + (isToday ? ' disabled' : ' aria-label="Back to today"') + '>' +
          (isToday ? 'Today' : S.fmtDayLong(day)) + '</button>' +
        '<button class="nav-btn" id="day-next" type="button" aria-label="Next day"' + (isToday ? ' disabled' : '') + '>' + CHEVRON_R + '</button>' +
      '</div>' +
      '<div class="big-count">' + list.length + '</div>' +
      '<div class="big-label">' + NOUNS[mode] + (isToday ? ' today' : ' on ' + S.fmtDayShort(day)) + '</div>';

    if (sum.days >= 7 && sum.avgPerDay !== null) {
      const diff = list.length - sum.avgPerDay;
      const word = Math.abs(diff) < 0.5 ? 'right on average' : diff < 0 ? 'below average' : 'above average';
      html += '<div class="pill-note">avg ' + S.fmt1(sum.avgPerDay) + ' · ' + (isToday ? "you're " : '') + word + '</div>';
    }

    if (list.length) {
      html += '<div class="card list">';
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        const time = S.fmtTime(e.date);
        html +=
          '<div class="row" data-iso="' + entries[e.index] + '">' +
            '<div class="row-content">' +
              '<span class="row-n">#' + (i + 1) + '</span>' +
              '<span class="row-time">' + time + '</span>' +
              '<span class="row-gap">' + (e.gapMin === null ? 'first' : S.fmtGap(e.gapMin)) + '</span>' +
            '</div>' +
            '<button class="row-delete" type="button" tabindex="-1" aria-label="Delete the ' + time + ' entry">Delete</button>' +
          '</div>';
      }
      html += '</div><p class="footnote">swipe an entry left to delete</p>';
    } else {
      html += '<div class="card empty">' + (isToday ? 'Nothing logged yet today.' : 'Nothing logged that day.') + '</div>';
    }

    panels.today.innerHTML = html;
    $('#day-prev', panels.today).addEventListener('click', () => { ui.day = S.dayKey(S.addDays(day, -1)); renderToday(); });
    $('#day-next', panels.today).addEventListener('click', () => {
      const next = S.addDays(day, 1);
      ui.day = next >= today ? null : S.dayKey(next);
      renderToday();
    });
    $('#day-reset', panels.today).addEventListener('click', () => { ui.day = null; renderToday(); });
    $$('.row', panels.today).forEach(attachSwipe);
  }

  // Swipe a row left (or long-press it) to reveal Delete.
  const SWIPE_W = 88;
  let openRow = null;
  function attachSwipe(row) {
    const content = $('.row-content', row);
    const del = $('.row-delete', row);
    let startX = 0, startY = 0, base = 0, dx = 0, tracking = false, swiping = false, pressTimer = 0;

    const setX = (x) => {
      content.style.transform = x ? 'translateX(' + x + 'px)' : '';
      del.style.width = Math.max(0, -x) + 'px';
    };
    const open = () => {
      if (openRow && openRow !== row) openRow.closeSwipe();
      row.classList.add('is-open');
      openRow = row;
      setX(-SWIPE_W);
    };
    const close = () => {
      row.classList.remove('is-open');
      if (openRow === row) openRow = null;
      setX(0);
    };
    row.closeSwipe = close;

    row.addEventListener('pointerdown', (e) => {
      if (e.target === del || e.button) return;
      startX = e.clientX;
      startY = e.clientY;
      base = row.classList.contains('is-open') ? -SWIPE_W : 0;
      tracking = true;
      swiping = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => { if (tracking && !swiping) { tracking = false; open(); } }, 450);
    });
    row.addEventListener('pointermove', (e) => {
      if (!tracking) return;
      const mx = e.clientX - startX;
      const my = e.clientY - startY;
      if (!swiping) {
        if (Math.abs(my) > 8) { tracking = false; clearTimeout(pressTimer); return; }
        if (Math.abs(mx) < 8) return;
        swiping = true;
        clearTimeout(pressTimer);
        try { row.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
        if (openRow && openRow !== row) openRow.closeSwipe();
        content.style.transition = 'none';
        del.style.transition = 'none';
      }
      dx = Math.min(0, Math.max(-SWIPE_W - 24, base + mx));
      setX(dx);
    });
    const end = () => {
      clearTimeout(pressTimer);
      if (!tracking) return;
      tracking = false;
      if (!swiping) { if (row.classList.contains('is-open')) close(); return; }
      swiping = false;
      content.style.transition = '';
      del.style.transition = '';
      if (dx < -SWIPE_W / 2) open(); else close();
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
    del.addEventListener('click', () => deleteEntry(row.dataset.iso));
  }

  function deleteEntry(iso) {
    if (!removeEntry(iso)) return;
    openRow = null;
    toast('Deleted ' + S.fmtTime(new Date(iso)), { action: 'Undo', onAction: () => mergeEntries([iso]) });
  }

  // ---- Stats segment ----

  function renderStats() {
    const sum = S.summary(dates, new Date());
    const show = (x, fmt) => (x === null ? '–' : fmt(x));
    const tiles = [
      [show(sum.avgPerDay, S.fmt1), 'avg per day'],
      [show(sum.avgFirst, S.fmtMinutes), 'avg first ' + NOUN[mode]],
      [show(sum.weekdayAvg, S.fmt1), 'weekdays'],
      [show(sum.weekendAvg, S.fmt1), 'weekends'],
    ];
    const max = Math.max.apply(null, sum.hourAvg);
    let bars = '';
    for (let h = 0; h < 24; h++) {
      const v = sum.hourAvg[h];
      const cls = 'hbar' + (v === 0 ? ' is-empty' : '') + (h === sum.peakHour ? ' is-peak' : '');
      const height = v === 0 ? '2px' : Math.max(2, (v / max) * 100) + '%';
      bars += '<div class="' + cls + '" style="height:' + height + '" title="' + h + 'h: ' + S.fmt1(v) + '"></div>';
    }
    let note;
    if (sum.peakHour === null) {
      note = 'Nothing logged yet.';
    } else {
      const q = sum.quietest;
      const quiet = !q ? ''
        : q.before !== undefined ? ' · quietest before ' + q.before + 'h'
        : q.at !== undefined ? ' · quietest at ' + q.at + 'h–' + (q.at + 1) + 'h'
        : ' · quietest ' + q.from + 'h–' + q.to + 'h';
      note = 'Peak at <b class="accent">' + sum.peakHour + 'h–' + (sum.peakHour + 1) + 'h</b>' + quiet;
    }
    panels.stats.innerHTML =
      '<div class="tiles">' +
        tiles.map((t) => '<div class="tile"><div class="tile-value">' + t[0] + '</div><div class="tile-label">' + t[1] + '</div></div>').join('') +
      '</div>' +
      '<div class="card chart-card">' +
        '<div class="card-head"><h2>By hour of day</h2><span class="card-sub">all time · avg per day</span></div>' +
        '<div class="hchart">' + bars + '</div>' +
        '<div class="haxis"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>' +
        '<p class="chart-note">' + note + '</p>' +
      '</div>' +
      (sum.days ? '<p class="footnote">over ' + sum.days + (sum.days === 1 ? ' day' : ' complete days') + '</p>' : '');
  }

  // ---- Timeline segment ----

  const RANGES = [['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['all', 'All time']];

  function renderTimeline() {
    const T = S.timeline(dates, new Date(), ui.range);
    const max = Math.max(1, T.avg || 0, Math.max.apply(null, T.buckets.map((b) => b.count)));
    const dayUnit = T.unit === 'day';

    let html = '<div class="ranges" role="radiogroup" aria-label="Range">' +
      RANGES.map((r) => '<button class="range' + (r[0] === ui.range ? ' is-selected' : '') + '" type="button" role="radio" aria-checked="' +
        (r[0] === ui.range) + '" data-range="' + r[0] + '">' + r[1] + '</button>').join('') +
      '</div>';

    html += '<div class="tl-head"><div><span class="tl-num">' + T.total + '</span><span class="tl-label">' + T.label + '</span></div>';
    if (T.change) {
      const c = T.change;
      const cls = c.pct < 0 ? 'is-lower' : c.pct > 0 ? 'is-higher' : 'is-same';
      const arrow = c.pct < 0 ? '↓ ' : c.pct > 0 ? '↑ ' : '';
      html += '<div class="tl-change ' + cls + '" title="complete days only">' + arrow + Math.abs(c.pct) + '% vs ' + c.label + '</div>';
    }
    html += '</div>';

    const gap = T.buckets.length > 31 ? 1 : T.buckets.length > 12 ? 2 : 6;
    let bars = '';
    T.buckets.forEach((b, i) => {
      let cls = 'tbar';
      if (b.isWeekend) cls += ' is-weekend';
      if (b.isCurrent) cls += ' is-current';
      if (b.isFuture) cls += ' is-future';
      const h = b.count ? Math.max(2, (b.count / max) * 100) + '%' : '2px';
      bars += '<button class="' + cls + '" type="button" style="height:' + h + '" data-i="' + i + '" aria-label="' +
        b.title + ': ' + b.count + '"' + (b.isFuture ? ' disabled' : '') + '></button>';
    });
    const avgLine = T.avg === null ? '' :
      '<div class="avg-line" style="bottom:' + (T.avg / max) * 100 + '%"><span>avg ' + S.fmt1(T.avg) +
      (dayUnit ? '' : T.unit === 'week' ? ' / week' : ' / month') + '</span></div>';
    const axis = T.axis.map((a) => '<span style="left:' + ((a.i + 0.5) / T.buckets.length) * 100 + '%">' + a.text + '</span>').join('');
    html += '<div class="card chart-card">' +
      '<div class="tchart" style="gap:' + gap + 'px">' + bars + avgLine + '<div class="tooltip" id="tl-tooltip" hidden></div></div>' +
      '<div class="taxis">' + axis + '</div>' +
      (dayUnit ? '<div class="legend"><span><i class="sw sw-weekday"></i>weekday</span><span><i class="sw sw-weekend"></i>weekend</span></div>' : '') +
      '</div>';

    const lh = (x) => (x ? x.count + ' · ' + S.fmtDayShort(x.day) : '–');
    const lhBtn = (label, x, cls) => '<button type="button" class="lh ' + cls + '" data-day="' + (x ? S.dayKey(x.day) : '') + '"' +
      (x ? ' aria-label="' + label + ', open ' + S.fmtDayLong(x.day) + '"' : ' disabled') +
      '><span class="lh-label">' + label + '</span><span class="lh-value">' + lh(x) + '</span></button>';
    html += '<div class="card lowhigh">' + lhBtn('Lowest day', T.lowest, '') + '<span class="lh-sep"></span>' + lhBtn('Highest day', T.highest, 'lh-right') + '</div>' +
      '<p class="footnote">tap a bar to see that ' + (dayUnit ? 'day' : T.unit) + '</p>';

    panels.timeline.innerHTML = html;
    $$('.range', panels.timeline).forEach((b) => b.addEventListener('click', () => { ui.range = b.dataset.range; ui.tooltip = null; renderTimeline(); }));
    $$('.tbar', panels.timeline).forEach((b) => b.addEventListener('click', () => showTooltip(T, +b.dataset.i)));
    $$('.lh', panels.timeline).forEach((b) => b.addEventListener('click', () => openDay(b.dataset.day)));
    if (ui.tooltip !== null) showTooltip(T, ui.tooltip);
  }

  function openDay(key) {
    if (!key) return;
    ui.day = key === S.dayKey(new Date()) ? null : key;
    setSegment('today');
  }

  function showTooltip(T, i) {
    const b = T.buckets[i];
    const tip = $('#tl-tooltip');
    if (!b || !tip) return;
    ui.tooltip = i;
    const chart = tip.parentNode;
    $$('.tbar', chart).forEach((el) => el.classList.toggle('is-selected', +el.dataset.i === i));
    tip.innerHTML = '<span>' + b.title + ' · <b>' + b.count + '</b></span>' +
      (b.day ? '<button type="button" class="tooltip-open">Open</button>' : '');
    tip.hidden = false;
    const bar = $('.tbar[data-i="' + i + '"]', chart);
    const x = bar.offsetLeft + bar.offsetWidth / 2;
    tip.style.left = Math.max(0, Math.min(chart.clientWidth - tip.offsetWidth, x - tip.offsetWidth / 2)) + 'px';
    const open = $('.tooltip-open', tip);
    if (open) open.addEventListener('click', () => openDay(S.dayKey(b.day)));
  }
  function hideTooltip() {
    ui.tooltip = null;
    const tip = $('#tl-tooltip');
    if (tip) tip.hidden = true;
    $$('.tbar.is-selected').forEach((el) => el.classList.remove('is-selected'));
  }
  document.addEventListener('click', (e) => {
    if (ui.tooltip === null) return;
    if (e.target.closest('.tbar') || e.target.closest('.tooltip')) return;
    hideTooltip();
  });

  // =====================================================================
  // Settings: export, import, sound, delete all
  // =====================================================================

  const sheet = $('#sheet');
  const backdrop = $('#sheet-backdrop');
  const soundToggle = $('#toggle-sound');
  const deleteConfirm = $('#delete-confirm');
  const deleteInput = $('#delete-input');
  const deleteBtn = $('#btn-delete-confirm');

  function openSheet() {
    updateSettingsInfo();
    soundToggle.checked = soundEnabled();
    hideDeleteConfirm();
    sheet.classList.add('is-open');
    backdrop.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
  }
  function closeSheet() {
    sheet.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
  }
  function updateSettingsInfo() {
    const nc = lists.cig.length;
    const ns = lists.spliff.length;
    const first = [lists.cig[0], lists.spliff[0]].filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
    $('#export-sub').textContent = nc + ns
      ? nc + (nc === 1 ? ' cigarette' : ' cigarettes') + ' · ' + ns + (ns === 1 ? ' spliff' : ' spliffs') + ' since ' + S.fmtDayShort(new Date(first))
      : 'no entries yet';
  }
  $('#btn-settings').addEventListener('click', openSheet);
  $('#btn-sheet-close').addEventListener('click', closeSheet);
  backdrop.addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  soundToggle.addEventListener('change', () => localStorage.setItem(SOUND_KEY, soundToggle.checked ? '1' : '0'));

  $('#btn-export').addEventListener('click', exportBackup);
  function exportBackup() {
    const name = 'cigs-backup-' + S.dayKey(new Date()) + '.json';
    const payload = { app: 'cigs', version: 2, exportedAt: S.toLocalISO(new Date()), entries: lists.cig, spliffs: lists.spliff };
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
    const download = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    };
    // On iPhone the share sheet is the way to save a file (Files, AirDrop, Mail, ...).
    let file = null;
    try { file = new File([blob], name, { type: 'application/json' }); } catch (e) { /* no File constructor */ }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch((err) => { if (err && err.name !== 'AbortError') download(); });
    } else {
      download();
    }
  }

  const fileInput = $('#file-import');
  $('#btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    file.text().then((text) => {
      let data = null;
      try { data = JSON.parse(text); } catch (e) { /* handled below */ }
      // version 1 backups: a list (or {entries}) of cigarettes; version 2 adds {spliffs}
      const cigList = Array.isArray(data) ? data : data && Array.isArray(data.entries) ? data.entries : null;
      const spliffList = data && !Array.isArray(data) && Array.isArray(data.spliffs) ? data.spliffs : [];
      if (!cigList) { toast('That file is not a Cigs backup'); return; }
      const added = mergeEntries(cigList, 'cig') + mergeEntries(spliffList, 'spliff');
      closeSheet();
      toast(added ? 'Imported ' + added + (added === 1 ? ' new entry' : ' new entries') : 'Nothing new in that backup');
    }).catch(() => toast('Could not read that file'));
  });

  $('#btn-delete-all').addEventListener('click', () => {
    const show = deleteConfirm.hidden;
    deleteConfirm.hidden = !show;
    $('#btn-delete-all').setAttribute('aria-expanded', String(show));
    if (show) deleteInput.focus();
  });
  deleteInput.addEventListener('input', () => { deleteBtn.disabled = deleteInput.value.trim() !== 'DELETE'; });
  deleteBtn.addEventListener('click', () => {
    if (deleteInput.value.trim() !== 'DELETE') return;
    MODES.forEach((m) => replaceEntries([], m));
    ui.day = null;
    closeSheet();
    toast('All data deleted');
  });
  function hideDeleteConfirm() {
    deleteConfirm.hidden = true;
    deleteInput.value = '';
    deleteBtn.disabled = true;
    $('#btn-delete-all').setAttribute('aria-expanded', 'false');
  }

  // =====================================================================
  // Keep the screen fresh across midnight and when the app resumes
  // =====================================================================

  let lastDayKey = S.dayKey(new Date());
  function refreshIfDayChanged() {
    const k = S.dayKey(new Date());
    if (k !== lastDayKey) { lastDayKey = k; render(); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshIfDayChanged(); renderMain(); } });
  window.addEventListener('pageshow', refreshIfDayChanged);
  setInterval(refreshIfDayChanged, 30000);

  // =====================================================================
  // Boot
  // =====================================================================

  loadEntries();
  setMode(mode, { silent: true });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => { /* offline support is optional */ });
    });
  }

  // Console helpers for development (never run automatically).
  //   cigs.seedDemoData(60)  replaces all data with 60 days of generated history
  window.cigs = {
    entries: () => entries.slice(),
    mode: () => mode, setMode: setMode,
    add: addEntry, remove: removeEntry, merge: mergeEntries, replace: replaceEntries,
    seedDemoData: (days, seed) => { replaceEntries(S.generateDemoEntries(new Date(), days, seed)); return entries.length; },
  };
})();
