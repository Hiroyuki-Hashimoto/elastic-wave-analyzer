import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExportPanel from "./components/ExportPanel";
import NotificationPanel from "./components/NotificationPanel";
import SettingsPanel from "./components/SettingsPanel";
import WaveformChart, {
  type WaveformChartHandle,
} from "./components/WaveformChart";
import { emptyPickerState, pickerToAnalysisResult } from "./lib/picker";
import { downloadResultsCsv, exportChartPng } from "./lib/exporter";
import {
  buildDisplayWaveform,
  readCsvFile,
  validateTrim,
} from "./lib/waveform";
import {
  DEFAULT_DISPLAY_SETTINGS,
  ZOOM_PERCENTAGES,
  type AnalysisResult,
  type DisplaySettings,
  type DisplayWaveform,
  type Notice,
  type NoticeKind,
  type PickAxis,
  type PickKind,
  type PickPoint,
  type PickerState,
  type RawWaveform,
} from "./types";

/** A single entry in the analysis queue. raw is null when the file failed to parse. */
type QueueEntry = {
  /** Monotonic id so React keys stay stable across edits. */
  id: number;
  fileName: string;
  raw: RawWaveform | null;
  status: "current" | "pending" | "confirmed" | "canceled" | "invalid";
  errorMessage: string | null;
};

/**
 * App holds all Phase 0–2 state: the loaded waveform queue, display
 * settings, the active picker state, processed results, and the
 * notification log. No global state library is used.
 */
export default function App() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [settings, setSettings] = useState<DisplaySettings>(
    DEFAULT_DISPLAY_SETTINGS,
  );
  const [errors, setErrors] = useState<string[]>([]);
  // Picker state holds the four STS/PTP picks for the current file;
  // replacing a pick on an axis only overwrites that axis/kind slot.
  const [picker, setPicker] = useState<PickerState>(emptyPickerState());
  // One result per Enter-confirm or Escape-cancel; consumed by Step 2-5
  // CSV export and Step 2-6 PNG export.
  const [results, setResults] = useState<AnalysisResult[]>([]);
  // Monotonic counter so each notice gets a unique key for React.
  const noticeIdRef = useRef(0);
  const [notices, setNotices] = useState<Notice[]>([]);
  // Monotonic counter for stable queue keys.
  const queueIdRef = useRef(0);
  // Imperative handle into the chart for PNG export.
  const chartHandleRef = useRef<WaveformChartHandle | null>(null);

  // The current entry is the single 'current' row in the queue, or null.
  const currentEntry = useMemo(
    () => queue.find((e) => e.status === "current") ?? null,
    [queue],
  );
  const currentRaw = currentEntry?.raw ?? null;

  const trimError = useMemo(() => validateTrim(settings), [settings]);

  // Keep the last GOOD display around so an invalid trim range surfaces an
  // English error but never destroys an already-rendered chart (per spec).
  const goodDisplayRef = useRef<DisplayWaveform | null>(null);
  const [chartDisplay, setChartDisplay] = useState<DisplayWaveform | null>(
    null,
  );
  // Per-file sample interval in µs, derived from chartDisplay.timeUs.
  // Held alongside the display so future modules (e.g. LPF) can reuse
  // the same precomputed value without re-scanning the array.
  const [dTUs, setDrtUs] = useState<number | null>(null);

  // Re-derive the display waveform whenever the current file or settings change.
  useEffect(() => {
    // No file loaded: clear any cached good display and hide the chart.
    if (!currentRaw) {
      goodDisplayRef.current = null;
      setChartDisplay(null);
      setDrtUs(null);
      return;
    }
    // Invalid trim range: keep the existing chart; surface error in panel.
    if (trimError) {
      return;
    }
    const next = buildDisplayWaveform(currentRaw, settings);
    goodDisplayRef.current = next;
    setChartDisplay(next);
    setDrtUs(estimateSampleIntervalUs(next.timeUs));
  }, [currentRaw, settings, trimError]);

  // Combine parse errors with the current trim error (if any) for display.
  const effectiveErrors = useMemo(() => {
    const list = [...errors];
    if (trimError) list.push(trimError);
    return list;
  }, [errors, trimError]);

  /**
   * Append a new notice to the in-app log. Mirrors the Python reference's
   * print() statements (file paths, results, completion messages, etc.).
   */
  const addNotice = useCallback((kind: NoticeKind, text: string) => {
    noticeIdRef.current += 1;
    setNotices((prev) => [
      ...prev,
      { id: noticeIdRef.current, kind, text },
    ]);
  }, []);

  /**
   * Parse one file into a queue entry, recording either a parsed raw
   * waveform or a parse error. The file is NOT added to the queue when
   * it is unsupported (wrong extension / MIME).
   */
  const parseFileToEntry = useCallback(
    async (file: File): Promise<QueueEntry | null> => {
      if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
        addNotice("error", `Unsupported file: ${file.name}`);
        return null;
      }
      queueIdRef.current += 1;
      const id = queueIdRef.current;
      try {
        const parsed = await readCsvFile(file);
        addNotice(
          "info",
          `Loaded ${file.name} (${parsed.timeUs.length} samples).`,
        );
        return {
          id,
          fileName: file.name,
          raw: parsed,
          status: "pending",
          errorMessage: null,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        addNotice("error", `${file.name}: ${msg}`);
        return {
          id,
          fileName: file.name,
          raw: null,
          status: "invalid",
          errorMessage: msg,
        };
      }
    },
    [addNotice],
  );

  /**
   * Advance the queue after Enter or Escape: mark the current entry as
   * confirmed/canceled, then promote the first remaining pending entry
   * to current. When no more entries remain, post an "All files
   * processed" notice. The picker is reset for the next file.
   */
  const advanceQueue = useCallback(
    (lastStatus: "confirmed" | "canceled") => {
      // Compute the new queue synchronously so the notice text can read
      // the new current file's name without relying on setState callback
      // return values to flow outside the callback.
      const current = queue.find((e) => e.status === "current");
      if (!current) return;
      let nextQueue = queue.map<QueueEntry>((e) =>
        e.status === "current" ? { ...e, status: lastStatus } : e,
      );
      const nextIdx = nextQueue.findIndex(
        (e) => e.status === "pending" || e.status === "invalid",
      );
      let nextCurrent: QueueEntry | null = null;
      if (nextIdx !== -1) {
        const promoted: QueueEntry = {
          ...nextQueue[nextIdx],
          status: "current",
        };
        nextCurrent = promoted;
        nextQueue = nextQueue.slice();
        nextQueue[nextIdx] = promoted;
      }
      setQueue(nextQueue);
      // Reset picker for the next file.
      setPicker(emptyPickerState());
      if (nextCurrent) {
        addNotice("info", `Now processing: ${nextCurrent.fileName}`);
      } else {
        addNotice(
          "success",
          "All files processed. You can download the results CSV.",
        );
      }
    },
    [addNotice, queue],
  );

  /**
   * Handle user-selected or dropped files. Replaces the current queue
   * (single file behavior) or appends to it (multi-file behavior). The
   * first valid file becomes the current entry immediately.
   */
  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      // Clear previous file-level errors when starting a new load.
      setErrors([]);
      const entries: QueueEntry[] = [];
      for (const f of files) {
        // eslint-disable-next-line no-await-in-loop
        const entry = await parseFileToEntry(f);
        if (entry) entries.push(entry);
      }
      if (entries.length === 0) return;
      // First valid entry becomes current; the rest stay pending.
      // Loading a fresh batch replaces any previous queue.
      const [first, ...rest] = entries;
      setQueue([
        { ...first, status: "current" },
        ...rest.map((e) => ({ ...e })),
      ]);
      // Reset picker for the new file (settings are kept across files).
      setPicker(emptyPickerState());
      if (entries.length > 1) {
        addNotice(
          "info",
          `Queued ${entries.length} files. Starting with ${first.fileName}.`,
        );
      }
    },
    [addNotice, parseFileToEntry],
  );

  /**
   * Receive a STS/PTP click from the chart. Replacing a pick on an axis
   * only overwrites that axis/kind slot; the other three picks persist.
   */
  const handlePick = (
    _axis: PickAxis,
    _kind: PickKind,
    point: PickPoint,
  ) => {
    setPicker((prev) => {
      const next: PickerState = { ...prev, isConfirmed: false };
      if (point.axis === "trigger" && point.kind === "sts") {
        next.triggerSts = point;
      } else if (point.axis === "trigger" && point.kind === "ptp") {
        next.triggerPtp = point;
      } else if (point.axis === "receiver" && point.kind === "sts") {
        next.receiverSts = point;
      } else if (point.axis === "receiver" && point.kind === "ptp") {
        next.receiverPtp = point;
      }
      return next;
    });
  };

  /**
   * Append a confirmed (Enter) or canceled (Escape) result to the results
   * collection. The picker flags are set so pickerToAnalysisResult fills
   * pick fields only when confirmed.
   */
  const recordResult = useCallback(
    (pickerSnapshot: PickerState, confirmed: boolean) => {
      if (!currentRaw) return;
      const stateForResult: PickerState = confirmed
        ? { ...pickerSnapshot, isConfirmed: true, isCanceled: false }
        : { ...pickerSnapshot, isConfirmed: false, isCanceled: true };
      const result = pickerToAnalysisResult(stateForResult, currentRaw.fileName);
      setResults((prev) => [...prev, result]);
    },
    [currentRaw],
  );

  // Global keyboard handler: Enter / Escape / Z.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Skip when the user is typing into a form field.
      if (isEditableTarget(e.target)) return;
      // Modifier-key combos are reserved for browser shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter") {
        if (!currentRaw) return;
        const allPicks =
          picker.triggerSts &&
          picker.triggerPtp &&
          picker.receiverSts &&
          picker.receiverPtp;
        if (!allPicks) {
          addNotice(
            "warning",
            "Cannot confirm: all four picks are required.",
          );
          return;
        }
        recordResult(picker, true);
        const result = pickerToAnalysisResult(
          { ...picker, isConfirmed: true, isCanceled: false },
          currentRaw.fileName,
        );
        const msg = buildConfirmMessage(currentRaw.fileName, result);
        if (msg) addNotice("success", msg);
        advanceQueue("confirmed");
      } else if (e.key === "Escape") {
        if (!currentRaw) return;
        recordResult(picker, false);
        addNotice("cancel", `Analysis canceled for ${currentRaw.fileName}.`);
        advanceQueue("canceled");
      } else if (e.key === "z" || e.key === "Z") {
        // Cycle through the seven zoom levels, wrapping back to 100%.
        setSettings((prev) => {
          const next = (prev.zoomIndex + 1) % ZOOM_PERCENTAGES.length;
          addNotice("info", `Zoom: ${Math.round(ZOOM_PERCENTAGES[next] * 100)}%`);
          return { ...prev, zoomIndex: next };
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentRaw, picker, recordResult, advanceQueue, addNotice]);

  // Display label for the current file in the progress header.
  const currentIndex = currentEntry
    ? queue.findIndex((e) => e.id === currentEntry.id) + 1
    : 0;

  /**
   * Trigger the all-results CSV download. Disabled when there is nothing
   * to export, so the user never gets an empty file.
   */
  const handleDownloadCsv = useCallback(() => {
    if (results.length === 0) return;
    try {
      downloadResultsCsv(results);
      addNotice("info", `Downloaded ${results.length} result(s) as CSV.`);
    } catch (e) {
      addNotice(
        "error",
        `CSV export failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }, [results, addNotice]);

  /**
   * Capture the current chart canvases (Trigger + Receiver) and save
   * them as a single PNG. The chart is redrawn first so the export
   * reflects the latest visible state including any STS/PTP markers.
   */
  const handleDownloadPng = useCallback(() => {
    const handle = chartHandleRef.current;
    if (!handle) {
      addNotice("warning", "PNG export is unavailable: no chart to capture.");
      return;
    }
    const { trigger, receiver } = handle.getCanvases();
    if (!trigger || !receiver) {
      addNotice("warning", "PNG export is unavailable: no chart to capture.");
      return;
    }
    if (!currentEntry) return;
    try {
      // Force a redraw so the export reflects the latest picker state
      // and any pending uPlot internal rendering.
      handle.redraw();
      exportChartPng(trigger, receiver, currentEntry.fileName);
      addNotice(
        "info",
        `Saved chart as ${currentEntry.fileName.replace(/\.csv$/i, "")}.png.`,
      );
    } catch (e) {
      addNotice(
        "error",
        `PNG export failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }, [addNotice, currentEntry]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Elastic Wave Analyzer</h1>
        <p className="app-subtitle">Phase 2: manual STS/PTP picking</p>
      </header>

      <main className="app-main">
        <SettingsPanel
          settings={settings}
          onSettingsChange={setSettings}
          onSelectFiles={handleFiles}
          onDropFiles={handleFiles}
          errors={effectiveErrors}
          fileName={currentEntry?.fileName ?? null}
          resultCount={results.length}
        />

        <section className="chart-area">
          {/* Progress line above the chart. */}
          {queue.length > 0 && currentEntry ? (
            <p className="progress-label">
              File {currentIndex} of {queue.length}: {currentEntry.fileName}
            </p>
          ) : null}

          {/* Show chart only when a file is loaded and a valid display exists. */}
          {currentRaw && chartDisplay ? (
            <WaveformChart
              ref={chartHandleRef}
              display={chartDisplay}
              picker={picker}
              onPick={handlePick}
              peakWidthUs={settings.peakWidthUs}
              dTUs={dTUs ?? 0}
              zoomIndex={settings.zoomIndex}
            />
          ) : (
            <div className="empty-state">
              No data loaded. Please select a CSV file.
            </div>
          )}

          <QueueList queue={queue} />

          <ExportPanel
            canExport={results.length > 0}
            canExportPng={currentRaw !== null}
            onDownloadCsv={handleDownloadCsv}
            onDownloadPng={handleDownloadPng}
          />

          <NotificationPanel notices={notices} />
        </section>
      </main>
    </div>
  );
}

/**
 * Small list that shows the file queue with per-row status, matching
 * the spec's "current / confirmed / canceled / pending" terminology.
 */
function QueueList({ queue }: { queue: QueueEntry[] }) {
  if (queue.length === 0) return null;
  return (
    <section className="queue-list">
      <h3 className="queue-heading">File queue</h3>
      <ul className="queue-items">
        {queue.map((e) => {
          const statusText = statusLabel(e.status);
          return (
            <li
              key={e.id}
              className={`queue-item queue-${e.status}`}
              title={e.errorMessage ?? undefined}
            >
              <span className="queue-name">{e.fileName}</span>
              <span className="queue-status">{statusText}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function statusLabel(s: QueueEntry["status"]): string {
  switch (s) {
    case "current":
      return "Current";
    case "confirmed":
      return "Confirmed";
    case "canceled":
      return "Canceled";
    case "invalid":
      return "Invalid";
    case "pending":
    default:
      return "Pending";
  }
}

/**
 * Build the success message shown in the notice log when Enter confirms
 * a full set of picks. Returns null if any required pick is missing.
 */
function buildConfirmMessage(
  fileName: string,
  result: AnalysisResult,
): string | null {
  if (
    result.stsDeltaTUs === null ||
    result.ptpDeltaTUs === null
  ) {
    return null;
  }
  return (
    `Analysis confirmed for ${fileName}. ` +
    `STS_deltaT=${result.stsDeltaTUs.toFixed(1)} us, ` +
    `PTP_deltaT=${result.ptpDeltaTUs.toFixed(1)} us.`
  );
}

/**
 * True when the event target is a form field where the user is typing
 * or otherwise editing text. Used to skip Enter / Escape / Z shortcuts
 * so they never interfere with normal form input.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Estimate the per-sample time interval of a sorted microsecond array
 * as the median of its adjacent differences. Median is robust to a few
 * out-of-order or irregular samples that the mean would skew. Returns
 * null when the array has fewer than two points or no positive diff.
 */
function estimateSampleIntervalUs(timeUs: number[]): number | null {
  if (timeUs.length < 2) return null;
  const diffs: number[] = [];
  for (let i = 1; i < timeUs.length; i++) {
    const d = timeUs[i] - timeUs[i - 1];
    if (Number.isFinite(d) && d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return null;
  diffs.sort((a, b) => a - b);
  const mid = diffs.length >> 1;
  // Length-odd picks the exact middle; length-even averages the two
  // middle values for a smoother estimate across even sample counts.
  return diffs.length % 2 === 1
    ? diffs[mid]
    : (diffs[mid - 1] + diffs[mid]) / 2;
}