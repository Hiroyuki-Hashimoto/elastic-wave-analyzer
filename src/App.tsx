import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ImportsExportsPanel from "./components/ImportsExportsPanel";
import ImportMappingDialog, {
  type MappingRequest,
} from "./components/ImportMappingDialog";
import NotificationsErrorsPanel from "./components/NotificationsErrorsPanel";
import ResultsTable, { type ResultRow } from "./components/ResultsTable";
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
  estimateSamplingRateHz,
  validateLpf,
} from "./lib/lpf";
import {
  guessImportSpec,
  matchesRememberedSpec,
  parseWithSpec,
  readFileText,
  STANDARD_CSV_SPEC,
} from "./lib/importer";
import {
  buildDisplayWaveform,
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
  type DetectedImport,
  type ImportSpec,
  type VelocityConfig,
} from "./types";

/**
 * localStorage key for persisted display settings. The "v1" suffix
 * lets a future storage-format change start fresh instead of fighting
 * stale blobs from older app versions.
 */
const SETTINGS_STORAGE_KEY = "elastic-wave-analyzer/settings/v1";

/**
 * Outcome of the one-time settings read: values restored verbatim,
 * nothing stored yet (first visit), or a stored blob that failed
 * validation and was discarded in favour of the defaults.
 */
type StoredSettingsOutcome =
  | { status: "loaded"; settings: DisplaySettings }
  | { status: "none" }
  | { status: "discarded" };

/**
 * A single entry in the analysis queue. raw is null when the file failed to parse.
 */
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
  // One-shot localStorage read at mount: restored settings, "nothing
  // saved", or "stored blob discarded as incompatible" (see below).
  const [initialOutcome] = useState(loadStoredSettings);
  const [settings, setSettings] = useState<DisplaySettings>(
    initialOutcome.status === "loaded"
      ? initialOutcome.settings
      : DEFAULT_DISPLAY_SETTINGS,
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
  // True while a file drag is in progress over the window; drives the
  // full-screen "Drop data file(s) here" overlay.
  const [isDragOver, setIsDragOver] = useState(false);
  // Last user-confirmed import mapping, reused silently when a future
  // file has the same shape (same delimiter, same numeric mapped cells).
  // null until the user confirms one in the mapping dialog.
  const [manualSpec, setManualSpec] = useState<ImportSpec | null>(null);
  // Non-null while the mapping dialog is open. pending holds files that
  // could not be auto-parsed; an empty list means "edit saved mapping".
  const [mappingRequest, setMappingRequest] = useState<MappingRequest | null>(
    null,
  );
  // Stash for the partially-built queue and unresolved candidates while
  // the dialog is open; refs keep them off the render path.
  const pendingCandidatesRef = useRef<
    { fileName: string; text: string; detected: DetectedImport | null }[]
  >([]);
  const queuePrefixRef = useRef<QueueEntry[]>([]);

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

  // LPF Nyquist warning: only meaningful with a loaded waveform whose
  // sampling rate is known; validateLpf stays silent when disabled.
  const lpfError = useMemo(() => {
    if (!settings.lpfEnabled || !chartDisplay) return null;
    return validateLpf(
      settings.lpfCutoffKHz,
      estimateSamplingRateHz(chartDisplay.timeUs),
    );
  }, [settings.lpfEnabled, settings.lpfCutoffKHz, chartDisplay]);

  // Merge the LPF warning into the same errors panel list.
  const allErrors = useMemo(
    () => (lpfError ? [...effectiveErrors, lpfError] : effectiveErrors),
    [effectiveErrors, lpfError],
  );

  // Merged Results rows in chronological order: results from older
  // batches (files no longer queued) sit at the TOP so history reads
  // old-to-new downward, followed by the live batch in load order.
  // Pending and current rows show blank value cells until confirmed.
  const resultRows = useMemo<ResultRow[]>(() => {
    const rows: ResultRow[] = [];
    for (const r of results) {
      if (!queue.some((e) => e.fileName === r.fileName)) {
        rows.push({ fileName: r.fileName, status: "confirmed", result: r });
      }
    }
    for (const e of queue) {
      rows.push({
        fileName: e.fileName,
        status: e.status,
        result: results.find((r) => r.fileName === e.fileName) ?? null,
      });
    }
    return rows;
  }, [queue, results]);

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

  // Explain discarded settings once at mount: the user should know why
  // their previous values did not survive an app update. Nothing stored
  // (first visit) stays silent.
  useEffect(() => {
    if (initialOutcome.status === "discarded") {
      addNotice(
        "info",
        "Saved settings were incompatible with this version; using defaults.",
      );
    }
  }, [initialOutcome, addNotice]);

  // Persist display settings after every change so a reload or revisit
  // restores them; loadStoredSettings validates the blob on the way
  // back in, guarding against schema drift between app versions.
  useEffect(() => {
    saveStoredSettings(settings);
  }, [settings]);

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
   * True when a file can be treated as text waveform input. Extension
   * is the primary signal; text MIME types are accepted as fallback
   * for tools that export .dat-style names.
   */
  const isSupportedFile = (file: File): boolean =>
    /\.(csv|tsv|txt)$/i.test(file.name) || file.type.startsWith("text/");

  /** Build a queue entry from a parse attempt, recording id + error. */
  const entryFromParse = useCallback(
    (fileName: string, attempt: () => RawWaveform): QueueEntry => {
      queueIdRef.current += 1;
      const id = queueIdRef.current;
      try {
        const raw = attempt();
        return {
          id,
          fileName,
          raw,
          status: "pending",
          errorMessage: null,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        addNotice("error", `${fileName}: ${msg}`);
        return {
          id,
          fileName,
          raw: null,
          status: "invalid",
          errorMessage: msg,
        };
      }
    },
    [addNotice],
  );

  /**
   * Parse one already-read file under a chosen spec and turn it into a
   * queue entry, posting an info notice with the sample count and the
   * mapping source ("auto-detect", "previous", or "confirmed").
   */
  const loadWithSpec = useCallback(
    (
      fileName: string,
      text: string,
      spec: ImportSpec,
      how: string,
    ): QueueEntry =>
      entryFromParse(fileName, () => {
        const raw = parseWithSpec(text, fileName, spec);
        addNotice(
          "info",
          `Loaded ${fileName} (${raw.timeUs.length} samples) using ${how}.`,
        );
        return raw;
      }),
    [addNotice, entryFromParse],
  );

  /**
   * Commit a freshly built list of queue entries: first becomes current,
   * the rest stay pending, and the picker is reset for the new file.
   * Replacing the queue on every load matches the original single-batch
   * behavior; mixed confirmed/invalid entries keep their statuses.
   */
  const finalizeQueue = useCallback(
    (entries: QueueEntry[]) => {
      if (entries.length === 0) return;
      const [first, ...rest] = entries;
      setQueue([
        { ...first, status: "current" },
        ...rest.map((e) => ({ ...e })),
      ]);
      setPicker(emptyPickerState());
      if (entries.length > 1) {
        addNotice(
          "info",
          `Queued ${entries.length} files. Starting with ${first.fileName}.`,
        );
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
   * Handle user-selected or dropped files. Known formats (standard CSV
   * and legacy scope TXT) parse immediately; anything that fails to
   * auto-detect — or whose generic guess still fails to parse — is a
   * "candidate" that needs the user's mapping confirmation. When the
   * first candidate's shape matches the last confirmed mapping, the
   * whole candidate batch loads silently; otherwise the mapping dialog
   * opens prefilled from the sniffer.
   */
  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      setErrors([]);
      setPrevOverlay(null);
      const entries: QueueEntry[] = [];
      const candidates: {
        fileName: string;
        text: string;
        detected: DetectedImport | null;
      }[] = [];
      for (const f of files) {
        if (!isSupportedFile(f)) {
          addNotice("error", `Unsupported file: ${f.name}`);
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const text = await readFileText(f);
        const detected = guessImportSpec(text);
        // A generic guess that still fails to parse is treated as
        // unresolved: the user must confirm a mapping for it.
        let genericFailed = false;
        if (detected && detected.kind === "generic") {
          try {
            parseWithSpec(text, f.name, detected.spec);
          } catch {
            genericFailed = true;
          }
        }
        if (!detected || genericFailed) {
          candidates.push({ fileName: f.name, text, detected });
          continue;
        }
        const entry = loadWithSpec(
          f.name,
          text,
          detected.spec,
          `${KIND_LABEL[detected.kind]} mapping`,
        );
        entries.push(entry);
      }

      if (candidates.length > 0) {
        const remembered = manualSpec;
        const first = candidates[0];
        // Same-shape fast path: when the remembered mapping still fits
        // the first candidate's rows, reuse it for the whole batch
        // without interrupting the user.
        if (
          remembered &&
          matchesRememberedSpec(first.text, remembered)
        ) {
          for (const c of candidates) {
            entries.push(
              loadWithSpec(
                c.fileName,
                c.text,
                remembered,
                "your previous import mapping",
              ),
            );
          }
          finalizeQueue(entries);
        } else {
          pendingCandidatesRef.current = candidates;
          queuePrefixRef.current = entries;
          const prefill =
            remembered ?? first.detected?.spec ?? STANDARD_CSV_SPEC;
          setMappingRequest({
            pending: candidates.map((c) => ({
              fileName: c.fileName,
              text: c.text,
            })),
            initialSpec: { ...prefill },
            columns: first.detected?.columns ?? null,
          });
        }
        return;
      }
      finalizeQueue(entries);
    },
    [addNotice, finalizeQueue, loadWithSpec, manualSpec],
  );

  /** Open the mapping dialog in edit-only mode (no pending files). */
  const openMappingEditor = useCallback(() => {
    setMappingRequest({
      pending: [],
      initialSpec: { ...(manualSpec ?? STANDARD_CSV_SPEC) },
      columns: null,
    });
  }, [manualSpec]);

  /**
   * Dialog confirm: persist the mapping, close, and — when real files
   * were pending — parse every candidate under it and commit the queue.
   */
  const confirmMapping = useCallback(
    (spec: ImportSpec) => {
      setManualSpec({ ...spec });
      setMappingRequest(null);
      const candidates = pendingCandidatesRef.current;
      const prefix = queuePrefixRef.current;
      pendingCandidatesRef.current = [];
      queuePrefixRef.current = [];
      // Edit-only mode (no pending files): just remember the mapping.
      if (candidates.length === 0) {
        addNotice("info", "Import mapping updated.");
        return;
      }
      const entries = [...prefix];
      for (const c of candidates) {
        entries.push(
          loadWithSpec(
            c.fileName,
            c.text,
            spec,
            "the confirmed import mapping",
          ),
        );
      }
      finalizeQueue(entries);
    },
    [addNotice, finalizeQueue, loadWithSpec],
  );

  /**
   * Dialog cancel: drop the unresolved candidates with a warning and
   * commit any already-parsed entries from the same batch so the user
   * does not lose the files that did load.
   */
  const cancelMapping = useCallback(() => {
    const candidates = pendingCandidatesRef.current;
    const prefix = queuePrefixRef.current;
    pendingCandidatesRef.current = [];
    queuePrefixRef.current = [];
    setMappingRequest(null);
    if (candidates.length > 0) {
      addNotice(
        "warning",
        `Import canceled for ${candidates.length} file(s): ` +
          candidates.map((c) => c.fileName).join(", "),
      );
    }
    if (prefix.length > 0) finalizeQueue(prefix);
  }, [addNotice, finalizeQueue]);

  // Global drag-and-drop: accept CSV drops anywhere on the page.
  // dragover's preventDefault is required for the drop event to fire,
  // and drop's preventDefault stops the browser opening the file.
  // dragenter/dragleave drive a depth counter (dragenter fires before
  // dragleave when moving between children, so the count stays stable)
  // that shows the drop overlay only while files hover over the window.
  useEffect(() => {
    // Nesting depth of in-flight file drags; > 0 means overlay visible.
    let dragDepth = 0;
    /** True only for real file drags, not text or element drags. */
    const isFileDrag = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepth += 1;
      setIsDragOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      // Clamp at zero so stray leave events cannot underflow the count.
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setIsDragOver(false);
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const endDrag = () => {
      dragDepth = 0;
      setIsDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      endDrag();
      const list = e.dataTransfer?.files;
      if (list && list.length > 0) {
        void handleFiles(list);
      }
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    // Safety net: some browsers skip dragleave when the drag ends by
    // other means (e.g. Escape), which would otherwise stick the overlay.
    window.addEventListener("dragend", endDrag);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", endDrag);
    };
  }, [handleFiles]);

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
      // While the mapping dialog is open, picks/zoom stay frozen so
      // the user's keystrokes only affect the dialog's own controls.
      if (mappingRequest) return;

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
  }, [currentRaw, picker, recordResult, advanceQueue, addNotice, autoDownloadPng, capturePng, settings, mappingRequest]);

  // Display label for the current file in the progress header.
  const currentIndex = currentEntry
    ? queue.findIndex((e) => e.id === currentEntry.id) + 1
    : 0;

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="settings-column">
          {/* Title sits in the left column so the chart area can span
              the full viewport height without a header band above it. */}
          <h1 className="app-title">Elastic Wave Analyzer</h1>
          <ImportsExportsPanel
            onSelectFiles={handleFiles}
            canExport={results.length > 0}
            canExportPng={currentRaw !== null}
            autoDownloadPng={autoDownloadPng}
            onDownloadCsv={handleDownloadCsv}
            onToggleAutoDownloadPng={handleToggleAutoDownloadPng}
            importSummary={describeImportSummary(manualSpec)}
            onEditImportMapping={openMappingEditor}
          />
          <SettingsPanel
            settings={settings}
            onSettingsChange={setSettings}
          />
          <NotificationsErrorsPanel
            errors={allErrors}
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

          {/* Charts and Results share one page: the plots absorb the
              leftover height while the results table keeps a fixed
              share below. The chart stack is ALWAYS mounted — with no
              waveform loaded (or after the batch finishes) only its
              content swaps to a placeholder, so the Results table
              never jumps upward. */}
          {currentRaw ? <PickGuidance /> : null}
          <div className="chart-stack">
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
                No data loaded. Please select a data file.
              </div>
            )}
          </div>
          <ResultsTable rows={resultRows} />
        </section>
      </main>
      {/* Full-window drop hint shown while files hover over the page.
          Purely visual (pointer-events: none) so the window-level drop
          handling above is unaffected. */}
      {isDragOver ? (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-inner">Drop data file(s) here</div>
        </div>
      ) : null}
      {mappingRequest ? (
        <ImportMappingDialog
          request={mappingRequest}
          onConfirm={confirmMapping}
          onCancel={cancelMapping}
        />
      ) : null}
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
    result.stsDeltaTUs === null ||
    result.ptpDeltaTUs === null
  ) {
    return null;
  }
  let msg =
    `Analysis confirmed for ${fileName}. ` +
    `STS_deltaT=${result.stsDeltaTUs.toFixed(1)} us, ` +
    `PTP_deltaT=${result.ptpDeltaTUs.toFixed(1)} us.`;
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

/** Sniffer kind → human label shown in load notices. */
const KIND_LABEL: Record<DetectedImport["kind"], string> = {
  "standard-csv": "standard CSV",
  "scope-txt": "legacy scope TXT",
  generic: "detected",
};

/**
 * One-line summary of the current import mapping for the Imports panel.
 * "Auto-detect" while nothing has been confirmed yet; otherwise the
 * saved custom mapping is appended so the user knows what unrecognized
 * files will be parsed with.
 */
function describeImportSummary(spec: ImportSpec | null): string {
  if (!spec) return "Auto-detect";
  const delim =
    spec.delimiter === "\t"
      ? "tab"
      : spec.delimiter === "whitespace"
        ? "spaces"
        : spec.delimiter;
  return `Auto-detect + custom (${delim}, skip ${spec.skipLines}, ` +
    `cols ${spec.timeColumn + 1}/${spec.transmitterColumn + 1}/${spec.receiverColumn + 1}, ` +
    `${spec.timeUnit}/${spec.voltageUnit})`;
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

/**
 * Read and validate persisted display settings from localStorage. The
 * stored object must match DEFAULT_DISPLAY_SETTINGS exactly — same key
 * set, same value types, finite numbers, zoomIndex in range — so a code
 * change that adds, removes, or renames any parameter invalidates old
 * data wholesale and defaults apply instead of half-matching values.
 */
function loadStoredSettings(): StoredSettingsOutcome {
  try {
    const text = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!text) return { status: "none" };
    const raw: unknown = JSON.parse(text);
    // Only plain objects are valid payloads; arrays/null are garbage.
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { status: "discarded" };
    }
    const defs = DEFAULT_DISPLAY_SETTINGS as Record<
      string,
      number | boolean
    >;
    const record = raw as Record<string, unknown>;
    const defKeys = Object.keys(defs);
    // Exact key-set equality: extra keys mean storage newer than the
    // code, missing keys mean storage older than it; both reject.
    if (Object.keys(record).length !== defKeys.length) {
      return { status: "discarded" };
    }
    for (const key of defKeys) {
      const value = record[key];
      if (typeof value !== typeof defs[key]) {
        return { status: "discarded" };
      }
      // Finite check keeps NaN/Infinity from ever reaching an input.
      if (typeof value === "number" && !Number.isFinite(value)) {
        return { status: "discarded" };
      }
    }
    const settings = record as unknown as DisplaySettings;
    // Zoom index must address ZOOM_PERCENTAGES or charts would silently
    // fall back to 100% while the label claims otherwise.
    if (
      settings.zoomIndex < 0 ||
      settings.zoomIndex >= ZOOM_PERCENTAGES.length
    ) {
      return { status: "discarded" };
    }
    return { status: "loaded", settings };
  } catch {
    // Corrupt JSON or unavailable storage behaves like a fresh visit,
    // but still warrants telling the user their values were dropped.
    return { status: "discarded" };
  }
}

/**
 * Persist display settings after each change so the next visit starts
 * where the user left off. Best-effort only: private mode and quota
 * errors are swallowed because saving must never break the app.
 */
function saveStoredSettings(settings: DisplaySettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: persistence is optional */
  }
}