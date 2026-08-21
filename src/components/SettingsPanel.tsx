import React from "react";
import ExportPanel from "./ExportPanel";
import type { DisplaySettings } from "../types";

type Props = {
  settings: DisplaySettings;
  onSettingsChange: (next: DisplaySettings) => void;
  onSelectFiles: (files: File[]) => void;
  onDropFiles: (files: File[]) => void;
  /** True when at least one confirmed or canceled result is available. */
  canExport: boolean;
  /** True when a file is loaded and a chart is rendered. */
  canExportPng: boolean;
  /** True when auto-PNG-on-confirm is armed. */
  autoDownloadPng: boolean;
  onDownloadCsv: () => void;
  onToggleAutoDownloadPng: () => void;
};

/**
 * Presentational settings panel: file Imports, Exports, and the
 * measurement controls (Trigger gain, offset, time trim, wave
 * velocity, peak search width). All state lives in App; this
 * component only formats DOM events into settings-change callbacks.
 *
 * The time-trim and wave-velocity controls are wrapped in bordered
 * subsections so the checkbox + dependent inputs read as one
 * activation toggle rather than three independent fields.
 */
export default function SettingsPanel({
  settings,
  onSettingsChange,
  onSelectFiles,
  onDropFiles,
  canExport,
  canExportPng,
  autoDownloadPng,
  onDownloadCsv,
  onToggleAutoDownloadPng,
}: Props) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  /** Patch a subset of settings and forward the merged value to App. */
  const update = (patch: Partial<DisplaySettings>) =>
    onSettingsChange({ ...settings, ...patch });

  return (
    <aside className="settings-panel">
      <h2 className="settings-title">Settings</h2>

      {/* Imports: file picker + dropzone. */}
      <section className="settings-section">
        <h3 className="settings-section-heading">Imports</h3>
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

      {/* Exports: results CSV download + PNG auto-save toggle, moved
          out of the chart area so all I/O controls sit together. */}
      <section className="settings-section">
        <ExportPanel
          canExport={canExport}
          canExportPng={canExportPng}
          autoDownloadPng={autoDownloadPng}
          onDownloadCsv={onDownloadCsv}
          onToggleAutoDownloadPng={onToggleAutoDownloadPng}
        />
      </section>

      {/* Top-level measurement controls that don't activate dependent
          inputs: Trigger gain, offset correction, peak search width. */}
      <section className="settings-section">
        <label className="field">
          <span className="field-label">Trigger gain</span>
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

      {/* Time trimming: checkbox + start/end inputs sit in one bordered
          group so the activation toggle and its dependent fields are
          visually tied together. */}
      <section className="settings-section">
        <div className="settings-subsection">
          <h3 className="settings-subsection-heading">Time trimming</h3>
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
        </div>

        {/* Wave velocity: same bordered-group treatment for the
            checkbox + distance + system-delay fields. */}
        <div className="settings-subsection">
          <h3 className="settings-subsection-heading">Wave velocity</h3>
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
        </div>
      </section>
    </aside>
  );
}