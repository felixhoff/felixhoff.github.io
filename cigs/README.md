# Cigs

A tiny cigarette counter that lives on your phone. Open it, tap the disk once,
put the phone away. Every cigarette is stored with its exact time; from that the
app shows today's count, a per-day history and simple statistics.

No account, no server, no cloud. Everything stays in the phone's browser
storage. It is a Progressive Web App served from
`https://felixhoff.github.io/cigs/`.

## Install on an iPhone

1. Open **Safari** (it has to be Safari, not Chrome) and go to
   `https://felixhoff.github.io/cigs/`.
2. Tap the **Share** button (the square with an arrow, at the bottom).
3. Scroll the sheet and tap **Add to Home Screen**, then **Add**.
4. Open **Cigs** from the home screen. It runs fullscreen, works offline and
   keeps its own data.

Always use the home-screen icon, not the Safari tab: the icon and the tab
each have their own storage.

## Using it

- **Main screen**: tap the big disk to log a cigarette. The count updates,
  the cigarette burns down, and an **Undo** button stays for five seconds in
  case the tap was a mistake. Taps closer than 1.5 s apart are ignored.
- **Statistics** (bar-chart button, top left):
  - **Today** lists the day's cigarettes, newest first, with the gap since the
    previous one. Swipe a row left (or press and hold) to delete it. The
    arrows step to earlier days.
  - **Stats** shows the all-time average per day, the average time of the
    first cigarette, weekday and weekend averages, and the hour-of-day chart.
  - **Timeline** shows one bar per day (week, month), per week (year) or per
    month (all time), the daily average, the change against the same days of
    the previous period, and the lowest and highest day in the range. Tap a
    bar for its count; **Open** jumps to that day.
- **Settings** (bottom of the Statistics screen): export and import a
  backup, turn the click sound off, delete all data.

### How the numbers are computed

- A day runs from local midnight to local midnight.
- Averages cover every day from the first logged day up to **yesterday**;
  days without a cigarette count as 0. Today is left out until it is over,
  so a quiet morning does not drag the average down. (If today is the only
  day with data, it is used.)
- The timeline's "vs" figure compares the complete days of the current
  period with the same number of days in the previous one, for example
  Oct 1–19 against Sept 1–19. It appears once there is data for the whole
  previous span.
- "Lowest day" never counts today (it is not finished); "Highest day" does.

## Back up your data

The data lives only on the phone. Deleting the app deletes it, so export a
backup now and then:

1. Statistics → **Settings** → **Export backup**.
2. The share sheet opens: choose **Save to Files** (or AirDrop it, or mail it
   to yourself). The file is `cigs-backup-YYYY-MM-DD.json`.

To restore, or to merge two phones: **Settings → Import backup** and pick the
file. Entries already present are skipped, so importing twice is harmless.

The backup is plain JSON, one ISO 8601 timestamp per cigarette:

```json
{ "app": "cigs", "version": 1, "entries": ["2026-10-20T16:42:11+02:00", "..."] }
```

## Files

```
cigs/
  index.html             the single page (main screen + statistics)
  app.css                styles, light and dark
  app.js                 UI and the localStorage data layer
  stats.js               date helpers and statistics (pure functions)
  sw.js                  service worker: offline app shell
  manifest.webmanifest   PWA manifest
  icons/                 icon.svg and the generated 180/192/512 PNGs
  design/                the design references (PNG)
  tools/make-icons.py    regenerates the PNG icons from the same drawing
  tools/test-stats.js    checks for stats.js
```

Data is stored under the localStorage key `cigs.entries` as a sorted JSON
array of timestamps; `cigs.sound` holds the sound setting.

## Development

Vanilla HTML/CSS/JS, no build step, no dependencies. Serve the repository
root and open `/cigs/`:

```sh
python -m http.server 8000      # then http://localhost:8000/cigs/
node cigs/tools/test-stats.js   # statistics checks
python cigs/tools/make-icons.py # regenerate icons (needs Pillow)
```

In the browser console, `cigs.seedDemoData(60)` **replaces** all data with
60 days of generated history, handy for looking at the statistics screens.
`cigs.entries()` returns the current list.

### Releasing a change

Bump `CACHE_VERSION` in `sw.js` (for example `cigs-v2`) whenever you ship.
The new service worker precaches the new files and removes the old cache.
An installed app picks the update up on its next launch after that, so a
change shows on the phone the second time the app is opened.
