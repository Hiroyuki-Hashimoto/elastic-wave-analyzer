import { useEffect, useMemo, useRef, useState } from "react";
import SettingsPanel from "./components/SettingsPanel";
import WaveformChart from "./components/WaveformChart";
import { emptyPickerState } from "./lib/picker";
import {
  buildDisplayWaveform,
  readCsvFile,
  validateTrim,
} from "./lib/waveform";
import {
  DEFAULT_DISPLAY_SETTINGS,
  type DisplaySettings,
  type DisplayWaveform,
  type PickAxis,
  type PickKind,
  type PickPoint,
  type PickerState,
  type RawWaveform,
} from "./types";

/**
 * App holds all Phase 0–2 state: the loaded waveform, display settings,
 * the active picker state, and error list. Settings changes are projected
 * into a DisplayWaveform via lib/waveform and forwarded to WaveformChart.
 * No global state library is used.
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

  const trimError = useMemo(() => validateTrim(settings), [settings]);

  // Keep the last GOOD display around so an invalid trim range surfaces an
  // English error but never destroys an already-rendered chart (per spec).
  const goodDisplayRef = useRef<DisplayWaveform | null>(null);
  const [chartDisplay, setChartDisplay] = useState<DisplayWaveform | null>(
    null,
  );

  // Re-derive the display waveform whenever the file or settings change.
  useEffect(() => {
    // No file loaded: clear any cached good display and hide the chart.
    if (!raw) {
      goodDisplayRef.current = null;
      setChartDisplay(null);
      return;
    }
    // Invalid trim range: keep the existing chart; surface error in panel.
    if (trimError) {
      return;
    }
    const next = buildDisplayWaveform(raw, settings);
    goodDisplayRef.current = next;
    setChartDisplay(next);
  }, [raw, settings, trimError]);

  // Combine parse errors with the current trim error (if any) for display.
  const effectiveErrors = useMemo(() => {
    const list = [...errors];
    if (trimError) list.push(trimError);
    return list;
  }, [errors, trimError]);

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
      return;
    }
    try {
      const parsed = await readCsvFile(file);
      setRaw(parsed);
      // Reset picker state for a brand-new file: no inherited picks.
      setPicker(emptyPickerState());
    } catch (e) {
      // On parse failure, drop the waveform and show the parser error.
      setRaw(null);
      setErrors([e instanceof Error ? e.message : String(e)]);
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
        />

        <section className="chart-area">
          {/* Show chart only when a file is loaded and a valid display exists. */}
          {raw && chartDisplay ? (
            // Placeholders (0) are filled in with real values in the
            // upcoming wiring commit; the picker functions are tolerant
            // of zero dT and zero peakWidthUs (window clamps to 1 sample).
            <WaveformChart
              display={chartDisplay}
              picker={picker}
              onPick={handlePick}
              peakWidthUs={0}
              dTUs={0}
            />
          ) : (
            <div className="empty-state">
              No data loaded. Please select a CSV file.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}