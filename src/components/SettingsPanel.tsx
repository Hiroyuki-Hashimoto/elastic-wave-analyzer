import type { DisplaySettings } from "../types";

type Props = {
  settings: DisplaySettings;
  onSettingsChange: (next: DisplaySettings) => void;
};

/**
 * Settings panel holds only the per-measurement controls:
 *   1. Four bordered cards in a 2x2 grid: Subtract initial voltage,
 *      Overlay previous waveform, Trigger gain and Peak search width,
 *      with numeric inputs placed inline beside their label and the
 *      unit shown to the right of the input.
 *   2. One-line feature cards (Time trimming, Wave velocity, Trigger
 *      auto-detection, Cross-correlation): heading, Enable checkbox
 *      and unit-suffixed inputs share a single bordered row each.
 *   3. LPF for receiver: same one-line card shape at the bottom of the
 *      panel; enables a zero-phase Butterworth low-pass on the Receiver
 *      trace. Room remains below for future HPF controls. The file
 *      picker, results CSV download, and PNG auto-save toggle live in
 *      ImportsExportsPanel.
 */
export default function SettingsPanel({ settings, onSettingsChange }: Props) {
  /** Patch a subset of settings and forward the merged value to App. */
  const update = (patch: Partial<DisplaySettings>) =>
    onSettingsChange({ ...settings, ...patch });

  return (
    <aside className="settings-panel">
      <h2 className="settings-title">Settings</h2>

      {/* Measurement controls as four bordered cards in a 2x2 grid;
          numeric inputs sit inline beside the label with the unit at
          the right edge of the input, toggles show a bold name left
          and an Enable checkbox right. */}
      <section className="settings-measurement-grid">
        {/* Offset correction: two-line name keeps the card compact. */}
        <div
          className="settings-item-card settings-item-toggle grid-c1-r1"
          title="Subtract the pre-trigger baseline from every sample (offset correction)."
        >
          <span className="settings-item-name">
            Subtract initial voltage
            <br />
            (offset correction)
          </span>
          <label className="field field-row settings-inline-enable">
            <input
              type="checkbox"
              checked={settings.offsetEnabled}
              onChange={(e) => update({ offsetEnabled: e.target.checked })}
            />
            <span>Enable</span>
          </label>
        </div>

        {/* Previous-waveform overlay: draws the last confirmed file's
            traces faded behind the live ones on both charts. */}
        <div
          className="settings-item-card settings-item-toggle grid-c2-r1"
          title="Draw the last confirmed file's traces faded behind the current ones."
        >
          <span className="settings-item-name">Overlay previous waveform</span>
          <label className="field field-row settings-inline-enable">
            <input
              type="checkbox"
              checked={settings.overlayPrevEnabled}
              onChange={(e) => update({ overlayPrevEnabled: e.target.checked })}
            />
            <span>Enable</span>
          </label>
        </div>

        {/* Numeric cards share the toggle layout: bold name left,
            input + unit pushed to the right edge of the card. */}
        <div
          className="settings-item-card settings-item-toggle grid-c1-r2"
          title="Scale applied when the transmitter drive voltage is amplified beyond the oscilloscope-recorded trigger voltage."
        >
          <span className="settings-item-name">Trigger gain</span>
          <span className="settings-input-group">
            <input
              aria-label="Trigger gain"
              className="inline-num"
              type="number"
              step="any"
              value={settings.amplitudeGain}
              onChange={(e) => {
                const v = Number(e.target.value);
                // Fall back to 0 when the field is empty/non-numeric.
                update({ amplitudeGain: Number.isFinite(v) ? v : 0 });
              }}
            />
            <span className="field-unit">times</span>
          </span>
        </div>

        <div
          className="settings-item-card settings-item-toggle grid-c2-r2"
          title="Half-window used to auto-locate the PTP peak after an STS click."
        >
          <span className="settings-item-name">Peak search width</span>
          <span className="settings-input-group">
            <input
              aria-label="Peak search width"
              className="inline-num"
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
            <span className="field-unit">µs</span>
          </span>
        </div>
      </section>

      {/* Feature toggles compressed to one bordered line each: heading,
          Enable checkbox and inline inputs on the same row. The LPF card
          ends the stack; space below stays free for future HPF controls. */}
      <section className="settings-feature-stack">
        <div className="settings-inline-card">
          <h3 className="settings-inline-heading">Time trimming</h3>
          <label
            className="field field-row settings-inline-enable"
            title="Show only the range between trim start and end."
          >
            <input
              type="checkbox"
              checked={settings.trimEnabled}
              onChange={(e) => update({ trimEnabled: e.target.checked })}
            />
            <span>Enable</span>
          </label>
          <label
            className="settings-inline-field"
            title="Beginning of the time range kept after trimming."
          >
            <span className="field-label">Start</span>
            <input
              className="inline-num"
              type="number"
              step="any"
              disabled={!settings.trimEnabled}
              value={settings.trimStartUs}
              onChange={(e) => {
                const v = Number(e.target.value);
                update({ trimStartUs: Number.isFinite(v) ? v : 0 });
              }}
            />
            <span className="field-unit">µs</span>
          </label>
          <label
            className="settings-inline-field"
            title="End of the time range kept after trimming."
          >
            <span className="field-label">End</span>
            <input
              className="inline-num"
              type="number"
              step="any"
              disabled={!settings.trimEnabled}
              value={settings.trimEndUs}
              onChange={(e) => {
                const v = Number(e.target.value);
                update({ trimEndUs: Number.isFinite(v) ? v : 0 });
              }}
            />
            <span className="field-unit">µs</span>
          </label>
        </div>

        <div className="settings-inline-card">
          <h3 className="settings-inline-heading">Wave velocity</h3>
          <label
            className="field field-row settings-inline-enable"
            title="Compute STS/PTP wave velocities on Enter-confirm."
          >
            <input
              type="checkbox"
              checked={settings.velocityEnabled}
              onChange={(e) => update({ velocityEnabled: e.target.checked })}
            />
            <span>Enable</span>
          </label>
          <label
            className="settings-inline-field"
            title="Trigger-to-receiver distance used by the velocity calculation."
          >
            <span className="field-label">Distance</span>
            <input
              className="inline-num"
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
            <span className="field-unit">mm</span>
          </label>
          <label
            className="settings-inline-field"
            title="Correction subtracted from the measured delta-T before computing wave velocity."
          >
            {/* Two-line label keeps the aligned label column narrow. */}
            <span className="field-label">
              System
              <br />
              delay
            </span>
            <input
              className="inline-num"
              type="number"
              step="any"
              disabled={!settings.velocityEnabled}
              value={settings.systemDelayUs}
              onChange={(e) => {
                const v = Number(e.target.value);
                update({ systemDelayUs: Number.isFinite(v) ? v : 0 });
              }}
            />
            <span className="field-unit">µs</span>
          </label>
        </div>

        {/* Trigger auto-detection: when armed, App re-derives the Trigger
            STS/PTP picks from the threshold crossing. */}
        <div className="settings-inline-card">
          <h3 className="settings-inline-heading">Trigger auto-detection</h3>
          <label
            className="field field-row settings-inline-enable"
            title="Auto-pick Trigger STS at the first threshold crossing and derive PTP."
          >
            <input
              type="checkbox"
              checked={settings.triggerAutoEnabled}
              onChange={(e) => update({ triggerAutoEnabled: e.target.checked })}
            />
            <span>Enable</span>
          </label>
          <label
            className="settings-inline-field"
            title="Voltage level the trigger waveform must cross to set the automatic STS pick."
          >
            <span className="field-label">Threshold</span>
            <input
              className="inline-num"
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
            <span className="field-unit">V</span>
          </label>
        </div>

        {/* Cross-correlation receiver picking: estimates the Receiver
            STS around the previous confirmed pick inside the
            Before/After window. */}
        <div className="settings-inline-card">
          <h3 className="settings-inline-heading">Cross-correlation</h3>
          <label
            className="field field-row settings-inline-enable"
            title="Estimate Receiver STS by cross-correlation with the last confirmed file, then derive PTP."
          >
            <input
              type="checkbox"
              checked={settings.ccEnabled}
              onChange={(e) => update({ ccEnabled: e.target.checked })}
            />
            <span>Enable</span>
          </label>
          <label
            className="settings-inline-field"
            title="Correlation window reach before the previous Receiver STS."
          >
            <span className="field-label">Before</span>
            <input
              className="inline-num"
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
            <span className="field-unit">µs</span>
          </label>
          <label
            className="settings-inline-field"
            title="Correlation window reach after the previous Receiver STS."
          >
            <span className="field-label">After</span>
            <input
              className="inline-num"
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
            <span className="field-unit">µs</span>
          </label>
        </div>

        {/* Receiver low-pass filter: zero-phase (forward-backward
            Butterworth), smoothing the trace without shifting picks in
            time. Occupies the space reserved below the feature cards. */}
        <div className="settings-inline-card">
          <h3 className="settings-inline-heading">LPF for receiver</h3>
          <label
            className="field field-row settings-inline-enable"
            title="Apply a zero-phase 4th-order Butterworth low-pass to the Receiver trace before picking."
          >
            <input
              type="checkbox"
              checked={settings.lpfEnabled}
              onChange={(e) => update({ lpfEnabled: e.target.checked })}
            />
            <span>Enable</span>
          </label>
          <label
            className="settings-inline-field"
            title="Low-pass cutoff for the Receiver trace. Filtering is skipped when the cutoff reaches the Nyquist frequency."
          >
            <span className="field-label">Cutoff</span>
            <input
              className="inline-num"
              type="number"
              step="any"
              min="0"
              disabled={!settings.lpfEnabled}
              value={settings.lpfCutoffKHz}
              onChange={(e) => {
                const v = Number(e.target.value);
                // Negative or non-finite cutoff collapses to 0, which the
                // filter treats as "off" like the Python reference.
                update({ lpfCutoffKHz: Number.isFinite(v) && v >= 0 ? v : 0 });
              }}
            />
            <span className="field-unit">kHz</span>
          </label>
        </div>
      </section>
    </aside>
  );
}
