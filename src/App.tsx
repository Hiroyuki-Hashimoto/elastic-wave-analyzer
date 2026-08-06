import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NotificationPanel from "./components/NotificationPanel";
import SettingsPanel from "./components/SettingsPanel";
import WaveformChart from "./components/WaveformChart";
import { emptyPickerState, pickerToAnalysisResult } from "./lib/picker";
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

/**
 * App holds all Phase 0–2 state: the loaded waveform, display settings,
 * the active picker state, processed results, and the notification log.
 * No global state library is used; everything lives in this component.
 */
export default function App() {
  const [raw, setRaw] = useState<RawWaveform | null>(null);
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

  // Re-derive the display waveform whenever the file or settings change.
  useEffect(() => {
    // No file loaded: clear any cached good display and hide the chart.
    if (!raw) {
      goodDisplayRef.current = null;
      setChartDisplay(null);
      setDrtUs(null);
      return;
    }
    // Invalid trim range: keep the existing chart; surface error in panel.
    if (trimError) {
      return;
    }
    const next = buildDisplayWaveform(raw, settings);
    goodDisplayRef.current = next;
    setChartDisplay(next);
    setDrtUs(estimateSampleIntervalUs(next.timeUs));
  }, [raw, settings, trimError]);

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
   * Handle a user-selected or dropped file: validate extension, read,
   * parse, and either store the RawWaveform or surface an English error.
   */
  const handleFile = async (file: File) => {
    // Clear previous file-level errors when starting a new load.
    setErrors([]);
    // Reject anything that is not a .csv file (by name or MIME).
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setErrors([
        "Unsupported CSV format. Expected: Time [s], Transmitter [V], Receiver [V].",
      ]);
      setRaw(null);
      addNotice("error", `Unsupported file: ${file.name}`);
      return;
    }
    try {
      const parsed = await readCsvFile(file);
      setRaw(parsed);
      // Reset picker state for a brand-new file: no inherited picks.
      setPicker(emptyPickerState());
      addNotice("info", `Loaded ${file.name} (${parsed.timeUs.length} samples).`);
    } catch (e) {
      // On parse failure, drop the waveform and show the parser error.
      setRaw(null);
      const msg = e instanceof Error ? e.message : String(e);
      setErrors([msg]);
      addNotice("error", `${file.name}: ${msg}`);
    }
  };

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
   * collection. For a confirmed result the picker must have all four
   * picks; for canceled we synthesize an AnalysisResult whose pick
   * fields are all null but the file name is preserved.
   */
  const recordResult = useCallback(
    (pickerSnapshot: PickerState, confirmed: boolean) => {
      if (!raw) return;
      const stateForResult: PickerState = confirmed
        ? { ...pickerSnapshot, isConfirmed: true, isCanceled: false }
        : { ...pickerSnapshot, isConfirmed: false, isCanceled: true };
      const result = pickerToAnalysisResult(stateForResult, raw.fileName);
      setResults((prev) => [...prev, result]);
    },
    [raw],
  );

  /**
   * Build the success message shown in the notice log when Enter confirms
   * a full set of picks. Returns null if any required pick is missing.
   */
  const buildConfirmMessage = (
    fileName: string,
    result: AnalysisResult,
  ): string | null => {
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
  };

  // Global keyboard handler: Enter / Escape / Z.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Skip when the user is typing into a form field.
      if (isEditableTarget(e.target)) return;
      // Modifier-key combos are reserved for browser shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter") {
        if (!raw) return;
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
          raw.fileName,
        );
        const msg = buildConfirmMessage(raw.fileName, result);
        if (msg) addNotice("success", msg);
        setPicker(emptyPickerState());
      } else if (e.key === "Escape") {
        if (!raw) return;
        recordResult(picker, false);
        addNotice("cancel", `Analysis canceled for ${raw.fileName}.`);
        setPicker(emptyPickerState());
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
  }, [raw, picker, recordResult, addNotice]);

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
          onSelectFile={handleFile}
          onDropFile={handleFile}
          errors={effectiveErrors}
          fileName={raw?.fileName ?? null}
          resultCount={results.length}
        />

        <section className="chart-area">
          {/* Show chart only when a file is loaded and a valid display exists. */}
          {raw && chartDisplay ? (
            <WaveformChart
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

          <NotificationPanel notices={notices} />
        </section>
      </main>
    </div>
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