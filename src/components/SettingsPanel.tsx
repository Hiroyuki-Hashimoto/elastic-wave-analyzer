import type { DisplaySettings } from "../types";

type Props = {
  settings: DisplaySettings;
  onSettingsChange: (next: DisplaySettings) => void;
};

/**
 * Settings panel holds only the per-measurement controls:
 *   1. Subtract initial voltage and Trigger gain stacked in column 1;
 *      Overlay previous waveform and Peak search width in column 2.
 *   2. Time trimming, Wave velocity, Trigger auto-detection (row 2
 *      left) and Cross-correlation (row 2 right) bordered subsections
 *      in a two-column grid so their Enable toggles read as parallel
 *      options.
 *
 * The file picker, results CSV download, and PNG auto-save toggle
 * have moved to ImportsExportsPanel.
 */
export default function SettingsPanel({ settings, onSettingsChange }: Props) {
  /** Patch a subset of settings and forward the merged value to App. */
  const update = (patch: Partial<DisplaySettings>) =>
    onSettingsChange({ ...settings, ...patch });

  return (
    <aside className="settings-panel">
      <h2 className="settings-title">Settings</h2>

      {/* Measurement controls. Subtract initial voltage and Trigger
          gain stack in column 1; the overlay toggle and Peak search
          width stack in column 2. */}
      <section className="settings-measurement-grid">
        <label
          className="field field-row grid-c1-r1"
          title="Subtract the pre-trigger baseline from every sample (offset correction)."
        >
          <input
            type="checkbox"
            checked={settings.offsetEnabled}
            onChange={(e) => update({ offsetEnabled: e.target.checked })}
          />
          <span>Subtract initial voltage (offset correction)</span>
        </label>

        {/* Previous-waveform overlay: draws the last confirmed file's
            traces faded behind the live ones on both charts. */}
        <label
          className="field field-row grid-c2-r1"
          title="Draw the last confirmed file's traces faded behind the current ones."
        >
          <input
            type="checkbox"
            checked={settings.overlayPrevEnabled}
            onChange={(e) => update({ overlayPrevEnabled: e.target.checked })}
          />
          <span>Overlay previous waveform</span>
        </label>

        <label
          className="field grid-c1-r2"
          title="Scale applied when the transmitter drive voltage is amplified beyond the oscilloscope-recorded trigger voltage."
        >
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

        <label
          className="field grid-c2-r2"
          title="Half-window used to auto-locate the PTP peak after an STS click."
        >
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

      {/* Time trimming and Wave velocity side by side; the Trigger
          auto-detection frame below reuses the left half of row 2. */}
      <section className="settings-section-grid-2">
        <div className="settings-subsection">
          <h3 className="settings-subsection-heading">Time trimming</h3>
          <label
            className="field field-row"
            title="Show only the range between trim start and end."
          >
            <input
              type="checkbox"
              checked={settings.trimEnabled}
              onChange={(e) => update({ trimEnabled: e.target.checked })}
            />
            <span>Enable time trimming</span>
          </label>

          <label
            className="field"
            title="Beginning of the time range kept after trimming."
          >
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

          <label
            className="field"
            title="End of the time range kept after trimming."
          >
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
          <label
            className="field field-row"
            title="Compute STS/PTP wave velocities on Enter-confirm."
          >
            <input
              type="checkbox"
              checked={settings.velocityEnabled}
              onChange={(e) => update({ velocityEnabled: e.target.checked })}
            />
            <span>Enable wave velocity calculation</span>
          </label>

          <label
            className="field"
            title="Trigger-to-receiver distance used by the velocity calculation."
          >
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

          <label
            className="field"
            title="Correction subtracted from the measured delta-T before computing wave velocity."
          >
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

        {/* Trigger auto-detection: when armed, App re-derives the Trigger
            STS/PTP picks from the threshold crossing. As the third grid
            child it flows to row 2 column 1 (left half), keeping all
            trigger-related controls grouped on the panel's left side. */}
        <div className="settings-subsection">
          <h3 className="settings-subsection-heading">Trigger auto-detection</h3>

          <label
            className="field field-row"
            title="Auto-pick Trigger STS at the first threshold crossing and derive PTP."
          >
            <input
              type="checkbox"
              checked={settings.triggerAutoEnabled}
              onChange={(e) => update({ triggerAutoEnabled: e.target.checked })}
            />
            <span>Enable trigger auto-detection</span>
          </label>

          <label
            className="field"
            title="Voltage level the trigger waveform must cross to set the automatic STS pick."
          >
            <span className="field-label">Threshold (V)</span>
            <input
              type="number"
              step="any"
              disabled={!settings.triggerAutoEnabled}
              value={settings.triggerThresholdV}
              onChange={(e) => {
                const v = Number(e.target.value);
                // Non-finite input falls back to 0; negative levels stay
                // allowed so bipolar traces can be detected on the rise.
                update({ triggerThresholdV: Number.isFinite(v) ? v : 0 });
              }}
            />
          </label>
        </div>

        {/* Cross-correlation receiver picking: as the fourth grid child
            it flows to row 2 column 2, mirroring the trigger box size.
            The window spans Before µs before / After µs after the
            previous confirmed Receiver STS pick. */}
        <div className="settings-subsection">
          <h3 className="settings-subsection-heading">Cross-correlation</h3>

          <label
            className="field field-row"
            title="Estimate Receiver STS by cross-correlation with the last confirmed file, then derive PTP."
          >
            <input
              type="checkbox"
              checked={settings.ccEnabled}
              onChange={(e) => update({ ccEnabled: e.target.checked })}
            />
            <span>Enable CC receiver picking</span>
          </label>

          <div className="field-row-split">
            <label
              className="field"
              title="Correlation window reach before the previous Receiver STS."
            >
              <span className="field-label">Before (µs)</span>
              <input
                type="number"
                step="any"
                min="0"
                disabled={!settings.ccEnabled}
                value={settings.ccBeforeUs}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  // Negative or non-finite reach collapses to 0 so the
                  // window stays well-defined around the previous STS.
                  update({ ccBeforeUs: Number.isFinite(v) && v >= 0 ? v : 0 });
                }}
              />
            </label>

            <label
              className="field"
              title="Correlation window reach after the previous Receiver STS."
            >
              <span className="field-label">After (µs)</span>
              <input
                type="number"
                step="any"
                min="0"
                disabled={!settings.ccEnabled}
                value={settings.ccAfterUs}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  update({ ccAfterUs: Number.isFinite(v) && v >= 0 ? v : 0 });
                }}
              />
            </label>
          </div>
        </div>
      </section>
    </aside>
  );
}