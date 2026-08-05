# Elastic Wave Analyzer

A lightweight, browser-only static web app for inspecting
oscilloscope CSV waveforms of elastic wave propagation. The interface
renders a Trigger (transmitter) and a Receiver trace on a shared
microsecond time axis, with adjustable amplitude gain, offset
correction, and time trimming.

## Current scope: Phase 0–1

This repository is under private development and is not yet publicly
released. Phase 0–1 supports loading a single CSV file, validating it,
and displaying the two waveforms with the settings described below.
Later phases will add STS/PTP picking, multi-file queue processing, and
full-result CSV/PNG export.

## How to install and run locally

Requirements: Node.js 18+ (tested with Node 20+).

```bash
npm install
npm run dev      # start the Vite dev server
npm run build    # type-check + production build
npm run preview  # serve the production build locally
```

Open the printed local URL (`http://localhost:5173` by default). No
data leaves your machine.

## Input CSV format

The first non-empty line must be a header containing exactly these
three columns in order (a trailing comma is tolerated):

```csv
Time [s], Transmitter [V], Receiver [V]
```

Example data row:

```csv
-4.999999999999999562e-05,4.511718749999893419e-03,5.449218749999963640e-05
```

Processing rules:

- Only `.csv` files are accepted.
- Header rows may carry extra whitespace and a trailing comma.
- Empty lines are ignored; extra columns beyond the first three are
  ignored.
- The first three values per row must be finite numbers.
- At least two data points are required.
- The time column must be strictly monotonically increasing.
- Time is converted from seconds to microseconds (`×1_000_000`).
- Transmitter and Receiver stay in volts.

If validation fails, the app shows an English error message in the
`Errors` list without crashing or clearing a previously loaded valid
chart (invalid trim settings are reported but do not destroy the
existing plot).

## Available controls

- **Select CSV file** — open a file picker.
- **Drop a CSV file here** — drag a `.csv` onto the dropzone.
- **Amplitude gain** — multiplies the Trigger amplitude only
  (default `20`).
- **Subtract initial value (offset correction)** — subtracts each
  series' first value from the whole series (default on).
- **Enable time trimming** — restricts the displayed range
  (default off).
- **Trim start (µs)** / **Trim end (µs)** — inclusive trim window
  (defaults `-50` / `800`).

## Privacy

CSV files are processed locally in the browser and are not uploaded to
external servers. The app performs no network requests and stores
nothing outside the in-memory page state.

## Technology

Built with Vite + React + TypeScript. uPlot is used for waveform
rendering because it is lightweight and performs well with dense
time-series data. The codebase intentionally avoids routing, global
state libraries, UI component frameworks, and CSS frameworks; analysis
logic lives in `src/lib/` and stays React-free.

## Project layout

```
.
├─ reference/                # reference-only Python source + sample CSV
├─ src/
│  ├─ App.tsx                # state + top-level layout
│  ├─ main.tsx               # React root
│  ├─ types.ts               # shared data types
│  ├─ styles.css             # single global stylesheet
│  ├─ components/
│  │  ├─ SettingsPanel.tsx   # file input + settings controls
│  │  └─ WaveformChart.tsx   # two uPlot charts (Trigger, Receiver)
│  └─ lib/
│     ├─ waveform.ts         # CSV parsing + display transforms
│     ├─ picker.ts           # Phase 2 STS/PTP pick types (stub)
│     └─ exporter.ts         # Phase 2 CSV/PNG export (stub)
├─ index.html
├─ package.json
└─ vite.config.ts
```

## Private development note

This repository is under private development and is not yet publicly
released. GitHub Pages deployment and repository publicization are
deferred to a later phase.