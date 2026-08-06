import { useEffect, useMemo, useRef, useState } from "react";
import SettingsPanel from "./components/SettingsPanel";
import WaveformChart from "./components/WaveformChart";
import {
  buildDisplayWaveform,
  readCsvFile,
  validateTrim,
} from "./lib/waveform";
import {
  DEFAULT_DISPLAY_SETTINGS,
  type DisplaySettings,
  type DisplayWaveform,
  type RawWaveform,
} from "./types";

/**
 * App holds all Phase 0–1 state: the loaded waveform, display settings,
 * and error list. Settings changes are projected into a DisplayWaveform
 * via lib/waveform and forwarded to WaveformChart. No global state.
 */
export default function App() {
  const [raw, setRaw] = useState<RawWaveform | null>(null);
  const [settings, setSettings] = useState<DisplaySettings>(
    DEFAULT_DISPLAY_SETTINGS,
  );
  const [errors, setErrors] = useState<string[]>([]);

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
    } catch (e) {
      // On parse failure, drop the waveform and show the parser error.
      setRaw(null);
      setErrors([e instanceof Error ? e.message : String(e)]);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Elastic Wave Analyzer</h1>
        <p className="app-subtitle">Phase 0–1: single-CSV load &amp; display</p>
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
            <WaveformChart display={chartDisplay} />
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