# Elastic Wave Analyzer

A lightweight, browser-only static web app for inspecting
oscilloscope CSV waveforms of elastic wave propagation. The interface
renders a Trigger (transmitter) and a Receiver trace on a shared
microsecond time axis, with adjustable amplitude gain, offset
correction, time trimming, automatic STS/PTP picking, previous-
waveform overlay, and wave velocity calculation.

## Live demo

<https://hiroyuki-hashimoto.github.io/elastic-wave-analyzer/>

CSV files are processed entirely in your browser — nothing is
uploaded to any server.

## Features

| Feature | Description |
| --- | --- |
| CSV import | Select or drag-and-drop oscilloscope CSV exports; parsing and validation run fully client-side. |
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
