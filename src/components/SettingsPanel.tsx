import React from "react";
import { ZOOM_PERCENTAGES } from "../types";
import type { DisplaySettings } from "../types";

type Props = {
  settings: DisplaySettings;
  onSettingsChange: (next: DisplaySettings) => void;
  onSelectFiles: (files: File[]) => void;
  onDropFiles: (files: File[]) => void;
  errors: string[];
  fileName: string | null;
  /** Number of results accumulated (confirmed + canceled) so far. */
  resultCount: number;
};

/**
 * Presentational settings panel: file picker + dropzone, gain/offset/trim
 * inputs, and the error list. All state lives in App; this component
 * only formats DOM events into settings-change callbacks.
 */
export default function SettingsPanel({
  settings,
  onSettingsChange,
  onSelectFiles,
  onDropFiles,
  errors,
  fileName,
  resultCount,
}: Props) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  /** Patch a subset of settings and forward the merged value to App. */
  const update = (patch: Partial<DisplaySettings>) =>
    onSettingsChange({ ...settings, ...patch });

  return (
    <aside className="settings-panel">
      <h2 className="settings-title">Settings</h2>

      <section className="settings-section">
        {/* Hidden native file input triggered by the button click. */}
        <button
          type="button"
          className="file-button"
          onClick={() => fileInputRef.current?.click()}
        >
          Select CSV file(s)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="file-input-hidden"
          onChange={(e) => {
            const list = e.target.files;
            if (list && list.length > 0) {
              onSelectFiles(Array.from(list));
            }
            // Reset value so selecting the same file twice still fires.
            e.target.value = "";
          }}
        />
        {/* Dropzone: accept drag-and-drop of one or more CSV files. */}
        <div
          className="dropzone"
          onDragOver={(e) => {
            // preventDefault is required to allow subsequent drop.
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const list = e.dataTransfer.files;
            if (list && list.length > 0) {
              onDropFiles(Array.from(list));
            }
          }}
        >
          Drop CSV file(s) here
        </div>
      </section>

      <section className="settings-section">
        <label className="field">
          <span className="field-label">Amplitude gain</span>
          <input
            type="number"
            step="any"
            value={settings.amplitudeGain}
            onChange={(e) => {
              const v = Number(e.target.value);
              // Fall back to 0 when the field is empty/non-numeric.
              update({ amplitudeGain: Number.isFinite(v) ? v : 0 });
            }}
          />
        </label>

        <label className="field field-row">
          <input
            type="checkbox"
            checked={settings.offsetEnabled}
            onChange={(e) => update({ offsetEnabled: e.target.checked })}
          />
          <span>Subtract initial voltage (offset correction)</span>
        </label>

        <label className="field field-row">
          <input
            type="checkbox"
            checked={settings.trimEnabled}
            onChange={(e) => update({ trimEnabled: e.target.checked })}
          />
          <span>Enable time trimming</span>
        </label>

        <label className="field">
          <span className="field-label">Trim start (µs)</span>
          <input
            type="number"
            step="any"
            disabled={!settings.trimEnabled}
            value={settings.trimStartUs}
            onChange={(e) => {
              const v = Number(e.target.value);
              update({ trimStartUs: Number.isFinite(v) ? v : 0 });
            }}
          />
        </label>

        <label className="field">
          <span className="field-label">Trim end (µs)</span>
          <input
            type="number"
            step="any"
            disabled={!settings.trimEnabled}
            value={settings.trimEndUs}
            onChange={(e) => {
              const v = Number(e.target.value);
              update({ trimEndUs: Number.isFinite(v) ? v : 0 });
            }}
          />
        </label>

        <label className="field field-row">
          <input
            type="checkbox"
            checked={settings.velocityEnabled}
            onChange={(e) => update({ velocityEnabled: e.target.checked })}
          />
          <span>Enable wave velocity calculation</span>
        </label>

        <label className="field">
          <span className="field-label">Distance (mm)</span>
          <input
            type="number"
            step="any"
            min="0"
            disabled={!settings.velocityEnabled}
            value={settings.distanceMm}
            onChange={(e) => {
              const v = Number(e.target.value);
              update({ distanceMm: Number.isFinite(v) && v >= 0 ? v : 0 });
            }}
          />
        </label>

        <label className="field">
          <span className="field-label">System delay correction (us)</span>
          <input
            type="number"
            step="any"
            disabled={!settings.velocityEnabled}
            value={settings.systemDelayUs}
            onChange={(e) => {
              const v = Number(e.target.value);
              update({ systemDelayUs: Number.isFinite(v) ? v : 0 });
            }}
          />
        </label>

        <label className="field">
          <span className="field-label">Peak search width (µs)</span>
          <input
            type="number"
            step="any"
            min="0"
            value={settings.peakWidthUs}
            onChange={(e) => {
              const v = Number(e.target.value);
              // Negative or non-finite input is clamped to 0 to keep peak
              // search well-defined in the picker helpers.
              update({ peakWidthUs: Number.isFinite(v) && v >= 0 ? v : 0 });
            }}
          />
        </label>
      </section>

      <section className="settings-section">
        <h3 className="errors-heading">Errors</h3>
        {/* Empty error list shows a friendly placeholder. */}
        {errors.length === 0 ? (
          <p className="errors-empty">No errors.</p>
        ) : (
          <ul className="errors-list">
            {errors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="settings-section">
        <p className="file-name-label">Loaded file</p>
        <p className="file-name">{fileName ?? "None"}</p>
        <p className="file-name-label">Results collected</p>
        <p className="file-name">{resultCount}</p>
      </section>

      <section className="settings-section">
        <p className="zoom-label">
          Zoom:{" "}
          {Math.round(
            (ZOOM_PERCENTAGES[settings.zoomIndex] ?? 1) * 100,
          )}
          % (press Z)
        </p>
      </section>
    </aside>
  );
}