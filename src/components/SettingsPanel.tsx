import type { DisplaySettings } from "../types";

type Props = {
  settings: DisplaySettings;
  onSettingsChange: (next: DisplaySettings) => void;
};

/**
 * Settings panel holds only the per-measurement controls:
 *   1. Subtract initial voltage and Trigger gain stacked in column 1,
 *      Peak search width in column 2 row 1.
 *   2. Time trimming and Wave velocity bordered subsections side by
 *      side so their Enable toggles read as parallel options.
 *
 * The file picker, dropzone, results CSV download, and PNG auto-save
 * toggle have moved to ImportsExportsPanel.
 */
export default function SettingsPanel({ settings, onSettingsChange }: Props) {
  /** Patch a subset of settings and forward the merged value to App. */
  const update = (patch: Partial<DisplaySettings>) =>
    onSettingsChange({ ...settings, ...patch });

  return (
    <aside className="settings-panel">
      <h2 className="settings-title">Settings</h2>

      {/* Measurement controls. Subtract initial voltage and Trigger
          gain stack in column 1; Peak search width sits in column 2
          row 1, leaving row 2 column 2 empty. */}
      <section className="settings-measurement-grid">
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
      </section>

      {/* Time trimming and Wave velocity side by side. */}
      <section className="settings-section-grid-2">
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