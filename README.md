# Elastic Wave Analyzer

A lightweight, browser-only web app for analyzing elastic wave
measurement data. It was primarily designed for waveforms acquired
with bender elements and similar transducers during geotechnical
testing, and estimates elastic wave velocities in geomaterials by
identifying wave travel times from time-domain signals.

The interface renders Trigger (transmitter) and Receiver traces from
oscilloscope CSV exports on a shared microsecond time axis, with
adjustable amplitude gain, offset correction, time trimming, manual
or automatic Start-to-Start (STS) / Peak-to-Peak (PTP) picking,
previous-waveform overlay, and wave velocity calculation.

## Web app

<https://hiroyuki-hashimoto.github.io/elastic-wave-analyzer/>

CSV files are processed entirely in your browser — nothing is
uploaded to any server.

Every newly loaded file format is confirmed in a mapping dialog that
shows the auto-detected interpretation (delimiter, skipped metadata
lines, column roles, units) next to the raw head of the file with the
mapped Time/Transmitter/Receiver cells colorized, so the guess can be
checked against the actual content and corrected by hand — including
files the detector cannot recognize at all. The confirmed mapping is
saved in your browser's local storage together with the header it was
confirmed for; files with exactly the same header load directly from
then on, even after a reload. The dialog can be reopened at any time
from the Imports panel ("Import mapping…"); edits apply to future
loads.

Display settings are saved automatically in your browser's local
storage and restored on your next visit. If an update changes the
settings parameters, previously saved values are discarded and the
defaults are used instead.

Intended for use on desktop browsers at around Full HD resolution
(1920 × 1080).

## Features

| Feature | Description |
| --- | --- |
| CSV import | Select or drag-and-drop delimited waveform exports (CSV/TSV/TXT); parsing and validation run fully client-side with one generic format detector. |
| Import confirmation | Every new format is confirmed against the raw file head in a mapping popup with colorized Time/Transmitter/Receiver columns; the confirmed mapping is remembered per header. |
| Dual trace view | Trigger (transmitter) and Receiver traces on a shared microsecond time axis. |
| Display settings | Amplitude gain, offset correction, time trimming, zoom with per-chart pan scrollbars. |
| Batch queue | Load multiple CSVs and confirm or skip each file in sequence. |
| Manual picking | Left click sets the STS point (PTP auto-derived); right click overrides the PTP. |
| Trigger auto-detection | Threshold-based automatic Trigger STS pick with derived PTP. |
| CC receiver picking | Receiver STS estimated by cross-correlating against the last confirmed file inside a Before/After window; PTP derived from it. |
| Previous-waveform overlay | Faded reference traces, dashed pick guides, and Δ annotations versus the live picks. |
| Wave velocity | Propagation times with system-delay correction and distance-based wave velocity. |
| Results & export | Per-file results table, results CSV download, PNG chart export with optional auto-save on confirm. |

## Keyboard shortcuts

`Enter` confirm · `Esc` skip file · `Z` cycle zoom · scrollbars pan while zoomed.

## License

Released under the [MIT License](./LICENSE).
