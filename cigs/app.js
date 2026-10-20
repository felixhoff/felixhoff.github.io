/* app.js — Cigs UI and data layer. */
(function () {
  'use strict';

  const S = window.CigStats;
  const STORAGE_KEY = 'cigs.entries';
  const SOUND_KEY = 'cigs.sound';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =====================================================================
  // Data layer: one ISO timestamp per cigarette, kept sorted, write-through
  // =====================================================================

  let entries = [];   // ISO strings, ascending
  let dates = [];     // same entries as Date objects

  function loadEntries() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { list = []; }
    entries = Array.isArray(list) ? list.filter(S.isValidISO) : [];
    sortEntries();
  }
  function sortEntries() {
    entries.sort((a, b) => Date.parse(a) - Date.parse(b));
    dates = entries.map((s) => new Date(s));
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
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
  // Adds entries that are not already present (compared by instant). Returns the number added.
  function mergeEntries(list) {
    const have = new Set(entries.map((s) => Date.parse(s)));
    let added = 0;
    for (const s of list) {
      if (!S.isValidISO(s)) continue;
      const t = Date.parse(s);
      if (have.has(t)) continue;
      have.add(t);
      entries.push(s);
      added++;
    }
    if (added) { sortEntries(); persist(); render(); }
    return added;
  }
  function replaceEntries(list) {
    entries = list.filter(S.isValidISO);
    sortEntries();
    persist();
    render();
  }

  // =====================================================================
  // UI state
  // =====================================================================

  const ui = {
    view: 'main',
  };

  function render() {
    renderMain();
  }

  // =====================================================================
  // Main screen
  // =====================================================================

  const mainCount = $('#main-count');
  const mainDate = $('#main-date');
  const mainLast = $('#main-last');
  const glyphs = $('#glyphs');
  const disk = $('#btn-log');
  const undoBtn = $('#btn-undo');

  const GLYPH = '<svg class="glyph" viewBox="0 0 18 8" aria-hidden="true">' +
    '<rect class="glyph-filter" x="0" y="1" width="5" height="6" rx="1.5"/>' +
    '<rect class="glyph-body" x="5" y="1" width="10.5" height="6"/>' +
    '<rect class="glyph-tip" x="15" y="1" width="3" height="6" rx="1.5"/></svg>';

  function renderMain() {
    const now = new Date();
    mainDate.textContent = S.fmtDayLong(now);
    const todays = S.dayEntries(dates, now);
    setCount(mainCount, todays.length);
    glyphs.innerHTML = GLYPH.repeat(todays.length);
    mainLast.textContent = todays.length
      ? 'last one at ' + S.fmtTime(todays[todays.length - 1].date)
      : 'no cigarette yet';
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

  // --- the cigarette burns itself ---
  const cig = {
    clip: $('#cig-clip-rect'),
    tip: $('#cig-tip'),
    cap: $('#cig-cap'),
    ember: $('#cig-ember'),
    glow: $('#cig-glow'),
    ash: $('#cig-ash'),
    ashBits: $$('.cig-ashbit'),
    smoke: $('#cig-smoke'),
  };
  const BURN_MS = 1200;
  const BODY_END = 188;    // right edge of the white body (unrotated SVG units)
  const TRAVEL = 84;       // how far the tip moves toward the filter
  let burnRaf = 0;

  function startBurn() {
    cancelAnimationFrame(burnRaf);
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
  function setBurn(d, t) {
    const glow = Math.sin(Math.PI * t);                // rises then settles
    cig.clip.setAttribute('width', BODY_END - d);
    cig.tip.setAttribute('transform', 'translate(' + (-d) + ' 0)');
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
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => { /* offline support is optional */ });
    });
  }

  // Console helpers for development (never run automatically).
  window.cigs = {
    entries: () => entries.slice(),
    add: addEntry, remove: removeEntry, merge: mergeEntries, replace: replaceEntries,
  };
})();
