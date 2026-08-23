import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ImportsExportsPanel from "./components/ImportsExportsPanel";
import NotificationsErrorsPanel from "./components/NotificationsErrorsPanel";
import ResultsTable from "./components/ResultsTable";
import SettingsPanel from "./components/SettingsPanel";
import WaveformChart, {
  type WaveformChartHandle,
} from "./components/WaveformChart";
import {
  crossCorrelateDeltaUs,
  emptyPickerState,
  findNearestSampleIndex,
  findReceiverPtpIndex,
  findTriggerPtpIndex,
  findTriggerStsByThreshold,
  pickerToAnalysisResult,
} from "./lib/picker";
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
  type PrevOverlay,
  type RawWaveform,
  type VelocityConfig,
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
 * App holds all application state: the loaded waveform queue, display
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
  // One result per Enter-confirm or Escape-cancel; consumed by the
  // results CSV download and the PNG chart export.
  const [results, setResults] = useState<AnalysisResult[]>([]);
  // Monotonic counter so each notice gets a unique key for React.
  const noticeIdRef = useRef(0);
  const [notices, setNotices] = useState<Notice[]>([]);
  // Monotonic counter for stable queue keys.
  const queueIdRef = useRef(0);
  // Imperative handle into the chart for PNG export.
  const chartHandleRef = useRef<WaveformChartHandle | null>(null);
  // When true, Enter-confirm also auto-downloads the current chart as PNG.
  const [autoDownloadPng, setAutoDownloadPng] = useState(false);
  // Active tab in the chart-area: "chart" shows the waveform pick
  // view; "results" shows the accumulated results table mirroring the
  // CSV columns. Reset to "chart" whenever a new file is loaded so
  // the user always sees the picking view first.
  const [activeTab, setActiveTab] = useState<"chart" | "results">("chart");

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
  // Display frozen at the last Enter-confirm, redrawn faded on both
  // charts when the overlay toggle is armed (traces plus dashed pick
  // guides and Δ labels). Cleared when a fresh batch of files loads.
  const [prevOverlay, setPrevOverlay] = useState<PrevOverlay | null>(null);

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

  // Trigger auto-detection: while armed, derive the Trigger STS pick from
  // the first displayed sample at/above the threshold and derive PTP with
  // the same window-peak search a manual left click uses. chartDisplay
  // already rebuilds on gain / offset / trim / file changes, so listing it
  // as a dependency re-runs detection on every relevant settings change.
  useEffect(() => {
    // Disarmed or no drawable data: leave picks untouched so the user
    // can pick the Trigger axis manually instead.
    if (!settings.triggerAutoEnabled || !chartDisplay) return;
    if (chartDisplay.timeUs.length === 0 || dTUs === null) return;

    const time = chartDisplay.timeUs;
    const values = chartDisplay.transmitterV;
    const stsIdx = findTriggerStsByThreshold(
      values,
      settings.triggerThresholdV,
    );
    if (stsIdx === -1) {
      // Armed but never crossed: clear stale trigger picks so the axis
      // stays fully automatic, and say why no marker appeared.
      setPicker((prev) => ({ ...prev, triggerSts: null, triggerPtp: null }));
      addNotice(
        "warning",
        `Trigger auto-detect: threshold ${settings.triggerThresholdV} V not reached.`,
      );
      return;
    }
    // PTP mirrors a manual left click: window-peak search over the trace.
    const ptpIdx = findTriggerPtpIndex(values, settings.peakWidthUs, dTUs);
    setPicker((prev) => ({
      ...prev,
      isConfirmed: false,
      triggerSts: {
        axis: "trigger",
        kind: "sts",
        index: stsIdx,
        timeUs: time[stsIdx],
        voltage: values[stsIdx],
      },
      triggerPtp: {
        axis: "trigger",
        kind: "ptp",
        index: ptpIdx,
        timeUs: time[ptpIdx],
        voltage: values[ptpIdx],
      },
    }));
  }, [
    chartDisplay,
    dTUs,
    settings.triggerAutoEnabled,
    settings.triggerThresholdV,
    settings.peakWidthUs,
    addNotice,
  ]);

  // CC receiver auto-picking: while armed with a reference snapshot,
  // cross-correlate the live Receiver around the previous STS pick to
  // find the time shift, snap an STS pick at (previous STS + delta) and
  // derive PTP from it with the same window-peak search a manual left
  // click uses. Re-runs on every relevant change like the trigger
  // detector, so manual receiver edits are overwritten while armed.
  useEffect(() => {
    // Disarmed / no reference snapshot yet (first file): silently skip.
    if (!settings.ccEnabled || !prevOverlay || !chartDisplay) return;
    if (chartDisplay.timeUs.length === 0 || dTUs === null) return;
    const prevSts = prevOverlay.picks.receiverSts;
    if (!prevSts) return;

    const time = chartDisplay.timeUs;
    const values = chartDisplay.receiverV;
    const deltaUs = crossCorrelateDeltaUs(
      time,
      values,
      prevOverlay.display.timeUs,
      prevOverlay.display.receiverV,
      prevSts.timeUs,
      settings.ccBeforeUs,
      settings.ccAfterUs,
      dTUs,
    );
    if (deltaUs === null || !Number.isFinite(deltaUs)) {
      // Correlation failed: keep the receiver axis fully automatic by
      // clearing stale picks, and say why nothing was placed.
      setPicker((prev) => ({
        ...prev,
        receiverSts: null,
        receiverPtp: null,
      }));
      addNotice(
        "warning",
        "CC receiver pick failed: window has too few samples or a flat signal.",
      );
      return;
    }

    // Estimated arrival: reference STS shifted by the correlation lag.
    const estStsUs = prevSts.timeUs + deltaUs;
    const stsIdx = findNearestSampleIndex(time, estStsUs);
    const ptpIdx = findReceiverPtpIndex(
      values,
      stsIdx,
      settings.peakWidthUs,
      dTUs,
    );
    setPicker((prev) => ({
      ...prev,
      isConfirmed: false,
      receiverSts: {
        axis: "receiver",
        kind: "sts",
        index: stsIdx,
        timeUs: time[stsIdx],
        voltage: values[stsIdx],
      },
      receiverPtp: {
        axis: "receiver",
        kind: "ptp",
        index: ptpIdx,
        timeUs: time[ptpIdx],
        voltage: values[ptpIdx],
      },
    }));
  }, [
    chartDisplay,
    dTUs,
    prevOverlay,
    settings.ccEnabled,
    settings.ccBeforeUs,
    settings.ccAfterUs,
    settings.peakWidthUs,
    addNotice,
  ]);

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
      // New session: drop any previous-file overlay reference.
      setPrevOverlay(null);
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
      // Snap the tab back to Chart so the picking view is the first
      // thing the user sees after a fresh load.
      setActiveTab("chart");
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
   * pick fields only when confirmed. The optional velocityConfig is
   * forwarded so the stored row also carries STS/PTP velocities when
   * wave velocity calculation is enabled.
   */
  const recordResult = useCallback(
    (
      pickerSnapshot: PickerState,
      confirmed: boolean,
      velocityConfig?: VelocityConfig,
    ) => {
      if (!currentRaw) return;
      const stateForResult: PickerState = confirmed
        ? { ...pickerSnapshot, isConfirmed: true, isCanceled: false }
        : { ...pickerSnapshot, isConfirmed: false, isCanceled: true };
      const result = pickerToAnalysisResult(
        stateForResult,
        currentRaw.fileName,
        velocityConfig,
      );
      setResults((prev) => [...prev, result]);
    },
    [currentRaw],
  );

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
   * them as a single PNG. Used by the auto-PNG-on-confirm flow that
   * fires when the toggle is armed at Enter time.
   */
  const capturePng = useCallback(
    (source: "auto" | "manual"): boolean => {
      const handle = chartHandleRef.current;
      const entry = currentEntry;
      if (!handle || !entry) return false;
      const { trigger, receiver } = handle.getCanvases();
      if (!trigger || !receiver) return false;
      try {
        // Force a redraw so the export reflects the latest picker state
        // and any pending uPlot internal rendering.
        handle.redraw();
        exportChartPng(trigger, receiver, entry.fileName);
        addNotice(
          "info",
          `Saved chart as ${entry.fileName.replace(/\.csv$/i, "")}.png (${source}).`,
        );
        return true;
      } catch (e) {
        addNotice(
          "error",
          `PNG export failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        return false;
      }
    },
    [addNotice, currentEntry],
  );

  /**
   * Flip the auto-PNG-on-confirm toggle. The actual PNG capture only
   * happens during Enter-confirm; this button just arms the flag.
   */
  const handleToggleAutoDownloadPng = useCallback(() => {
    setAutoDownloadPng((prev) => {
      addNotice("info", `PNG auto-save: ${prev ? "OFF" : "ON"}`);
      return !prev;
    });
  }, [addNotice]);

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
        // Snapshot of the velocity config consumed by pickerToAnalysisResult.
        const velocityConfig: VelocityConfig = {
          enabled: settings.velocityEnabled,
          distanceMm: settings.distanceMm,
          systemDelayUs: settings.systemDelayUs,
        };
        // Compute the result up front: needed both to validate velocity
        // and to feed the success notice without a second call.
        const result = pickerToAnalysisResult(
          { ...picker, isConfirmed: true, isCanceled: false },
          currentRaw.fileName,
          velocityConfig,
        );
        // Velocity guard: zero or negative effective delta-T (system
        // delay equals or exceeds the measured delta-T, or distance is
        // non-positive) yields an undefined velocity. When velocity
        // calculation is enabled, treat that as a hard block on Enter:
        // emit a warning and do NOT record or advance the queue.
        if (settings.velocityEnabled) {
          const blocked: string[] = [];
          if (result.stsVelocityMps === null) blocked.push("STS");
          if (result.ptpVelocityMps === null) blocked.push("PTP");
          if (blocked.length > 0) {
            addNotice(
              "warning",
              `Cannot confirm: ${blocked.join(" and ")} velocity is undefined ` +
                `(effective delta-T is zero or negative, or distance is non-positive). ` +
                `Enter blocked.`,
            );
            return;
          }
        }
        recordResult(picker, true, velocityConfig);
        // Freeze the just-confirmed display and its picks as the
        // reference overlay for the following files (mirrors the Python
        // analyzer's close()); Escape never touches this snapshot.
        const {
          triggerSts,
          triggerPtp,
          receiverSts,
          receiverPtp,
        } = picker;
        if (
          goodDisplayRef.current &&
          triggerSts &&
          triggerPtp &&
          receiverSts &&
          receiverPtp
        ) {
          setPrevOverlay({
            display: goodDisplayRef.current,
            picks: {
              triggerSts,
              triggerPtp,
              receiverSts,
              receiverPtp,
              isConfirmed: false,
              isCanceled: false,
            },
          });
        }
        const msg = buildConfirmMessage(currentRaw.fileName, result);
        if (msg) addNotice("success", msg);
        // Auto-PNG: snapshot the current chart when the toggle is on.
        if (autoDownloadPng) {
          capturePng("auto");
        }
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
  }, [currentRaw, picker, recordResult, advanceQueue, addNotice, autoDownloadPng, capturePng, settings]);

  // Display label for the current file in the progress header.
  const currentIndex = currentEntry
    ? queue.findIndex((e) => e.id === currentEntry.id) + 1
    : 0;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Elastic Wave Analyzer</h1>
      </header>

      <main className="app-main">
        <div className="settings-column">
          <ImportsExportsPanel
            onSelectFiles={handleFiles}
            onDropFiles={handleFiles}
            canExport={results.length > 0}
            canExportPng={currentRaw !== null}
            autoDownloadPng={autoDownloadPng}
            onDownloadCsv={handleDownloadCsv}
            onToggleAutoDownloadPng={handleToggleAutoDownloadPng}
          />
          <SettingsPanel
            settings={settings}
            onSettingsChange={setSettings}
          />
          <NotificationsErrorsPanel
            errors={effectiveErrors}
            notices={notices}
          />
        </div>

        <section className="chart-area">
          {/* Progress line above the chart. */}
          {queue.length > 0 && currentEntry ? (
            <p className="progress-label">
              File {currentIndex} of {queue.length}: {currentEntry.fileName}
            </p>
          ) : null}

          {/* Tab bar: Chart (waveform + picking) and Results (scannable
              history of every confirmed row). */}
          <div className="results-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "chart"}
              className={`results-tab-button ${activeTab === "chart" ? "active" : ""}`}
              onClick={() => setActiveTab("chart")}
            >
              Chart
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "results"}
              className={`results-tab-button ${activeTab === "results" ? "active" : ""}`}
              onClick={() => setActiveTab("results")}
            >
              Results ({results.length})
            </button>
          </div>

          {/* Only the active tab is mounted so the chart's uPlot
              instances are torn down between sessions and the inactive
              ResultsTable does not waste cycles on hidden rows. */}
          {activeTab === "chart" ? (
            <>
              {currentRaw ? <PickGuidance /> : null}
              {currentRaw && chartDisplay ? (
                <WaveformChart
                  ref={chartHandleRef}
                  display={chartDisplay}
                  picker={picker}
                  onPick={handlePick}
                  peakWidthUs={settings.peakWidthUs}
                  dTUs={dTUs ?? 0}
                  zoomIndex={settings.zoomIndex}
                  prevOverlay={
                    settings.overlayPrevEnabled ? prevOverlay : null
                  }
                />
              ) : (
                <div className="empty-state">
                  No data loaded. Please select a CSV file.
                </div>
              )}
            </>
          ) : (
            <ResultsTable results={results} />
          )}
        </section>
      </main>
    </div>
  );
}

/**
 * Static 3-line guidance that always sits above the chart while a
 * file is loaded. It tells the user the picking goal, the click
 * semantics, and the global keyboard shortcuts. The text never
 * changes between renders because the spec calls for a fixed help
 * block, not a dynamic next-step indicator.
 */
function PickGuidance() {
  return (
    <div className="pick-guidance">
      <p className="pick-guidance-line">
        Pick the start and peak points for both Trigger and Receiver.
      </p>
      <p className="pick-guidance-line">
        Left click: set Start (rise) point (auto-derives Peak point
        on the same axis). Right click: set Peak point manually.
      </p>
      <p className="pick-guidance-line">
        <kbd>Enter</kbd> confirm{" · "}
        <kbd>Esc</kbd> skip this file{" · "}
        <kbd>Z</kbd> zoom (resets pan){" · "}
        drag the bar under a chart to pan while zoomed
      </p>
    </div>
  );
}


/**
 * Build the success message shown in the notice log when Enter confirms
 * a full set of picks. Returns null if any required pick is missing.
 * STS/PTP velocities are appended when at least one is non-null.
 */
function buildConfirmMessage(
  fileName: string,
  result: AnalysisResult,
): string | null {
  if (
    result.stsPropagationTimeUs === null ||
    result.ptpPropagationTimeUs === null
  ) {
    return null;
  }
  let msg =
    `Analysis confirmed for ${fileName}. ` +
    `STS_prop=${result.stsPropagationTimeUs.toFixed(1)} us, ` +
    `PTP_prop=${result.ptpPropagationTimeUs.toFixed(1)} us.`;
  if (result.stsVelocityMps !== null || result.ptpVelocityMps !== null) {
    const sts = result.stsVelocityMps !== null
      ? result.stsVelocityMps.toFixed(1)
      : "-";
    const ptp = result.ptpVelocityMps !== null
      ? result.ptpVelocityMps.toFixed(1)
      : "-";
    msg += ` STS_vel=${sts} m/s, PTP_vel=${ptp} m/s.`;
  }
  return msg;
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