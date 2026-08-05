import React from "react";
import type { DisplaySettings } from "../types";

type Props = {
  settings: DisplaySettings;
  onSettingsChange: (next: DisplaySettings) => void;
  onSelectFile: (file: File) => void;
  onDropFile: (file: File) => void;
  errors: string[];
  fileName: string | null;
};

/**
 * Settings + file input panel. All state lives in App; this component
 * is presentational except for formatting input events into settings
 * changes. Drag-and-drop is wired onto the dropzone wrapper.
 */
export default function SettingsPanel({
  settings,
  onSettingsChange,
  onSelectFile,
  onDropFile,
  errors,
  fileName,
}: Props) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const update = (patch: Partial<DisplaySettings>) =>
    onSettingsChange({ ...settings, ...patch });

  return (
    <aside className="settings-panel">
      <h2 className="settings-title">Settings</h2>

      <section className="settings-section">
        <button
          type="button"
          className="file-button"
          onClick={() => fileInputRef.current?.click()}
        >
          Select CSV file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="file-input-hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onSelectFile(f);
            e.target.value = "";
          }}
        />
        <div
          className="dropzone"
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onDropFile(f);
          }}
        >
          Drop a CSV file here
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
          <span>Subtract initial value (offset correction)</span>
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
            value={settings.trimEndUs}
            onChange={(e) => {
              const v = Number(e.target.value);
              update({ trimEndUs: Number.isFinite(v) ? v : 0 });
            }}
          />
        </label>
      </section>

      <section className="settings-section">
        <h3 className="errors-heading">Errors</h3>
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
      </section>
    </aside>
  );
}