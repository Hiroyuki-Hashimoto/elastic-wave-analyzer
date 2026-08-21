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
 * Presentational settings panel laid out in two columns (560px wide
 * overall). All sections use a 2-column grid:
 *   - Imports: file button + dropzone side by side
 *   - Exports: results CSV + PNG auto-save side by side
 *   - Measurement controls: Subtract initial voltage and Trigger gain
 *     stacked in column 1; Peak search width and the two bordered
 *     subsections in column 2; Wave velocity spans both columns at
 *     the bottom so the Distance / System-delay inputs have room.
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

      {/* Imports: file button and dropzone side by side. */}
      <section className="settings-section-grid-2">
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

      {/* Exports: results CSV download and PNG auto-save side by side. */}
      <section className="settings-section-grid-2">
        <ExportPanel
          canExport={canExport}
          canExportPng={canExportPng}
          autoDownloadPng={autoDownloadPng}
          onDownloadCsv={onDownloadCsv}
          onToggleAutoDownloadPng={onToggleAutoDownloadPng}
        />
      </section>

      {/* Measurement controls in a 2-column grid. Column 1 stacks
          Subtract initial voltage on top of Trigger gain; column 2
          holds Peak search width above the Time trimming subsection;
          Wave velocity spans both columns at the bottom. */}
      <section className="settings-section-grid-2 settings-measurement-grid">
        <label className="field field-row grid-c1-r1">
          <input
            type="checkbox"
            checked={settings.offsetEnabled}
            onChange={(e) => update({ offsetEnabled: e.target.checked })}
          />
          <span>Subtract initial voltage (offset correction)</span>
        </label>

        <label className="field grid-c1-r2">
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

        <label className="field grid-c2-r1">
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

        <div className="settings-subsection grid-c2-r2">
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

        <div className="settings-subsection grid-span2-r3">
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