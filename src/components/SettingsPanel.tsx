import type { DisplaySettings } from "../types";
import ToggleSwitch from "./ToggleSwitch";

type Props = {
  settings: DisplaySettings;
  onSettingsChange: (next: DisplaySettings) => void;
};

/**
 * Settings panel holds only the per-measurement controls:
 *   1. Four bordered cards in a 2x2 grid: the two numeric-only cards
 *      (Trigger gain, Peak search width) sit on row 1 so the always-
 *      active framing reads first; the two Boolean-toggle cards
 *      (Subtract initial voltage, Overlay previous waveform) follow
 *      on row 2.
 *   2. One-line feature cards (Time trimming, Wave velocity, Trigger
 *      auto-detection, Receiver cross-correlation, Receiver LPF): heading, iOS-style
 *      toggle and unit-suffixed inputs share a single bordered row.
 *      Room remains below for future HPF controls. The file picker,
 *      results CSV download, and PNG auto-save toggle live in
 *      ImportsExportsPanel.
 */
export default function SettingsPanel({ settings, onSettingsChange }: Props) {
  /** Patch a subset of settings and forward the merged value to App. */
  const update = (patch: Partial<DisplaySettings>) =>
    onSettingsChange({ ...settings, ...patch });

  return (
    <aside className="settings-panel">
      <h2 className="settings-title">Settings</h2>

      {/* Measurement controls as four bordered cards in a 2x2 grid.
          Row 1 holds the numeric-only cards (no toggle, always blue);
          row 2 holds the Boolean-toggle cards (blue only when armed). */}
      <section className="settings-measurement-grid">
        {/* Trigger gain: numeric-only, no Boolean. */}
        <div
          className="settings-item-card settings-item-toggle grid-c1-r1 no-toggle"
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

        {/* Peak search width: numeric-only, no Boolean. */}
        <div
          className="settings-item-card settings-item-toggle grid-c2-r1 no-toggle"
          title="Half-window used to auto-locate the peak point."
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

        {/* Offset correction: Boolean-toggle card, light blue only when on. */}
        <div
          className={`settings-item-card settings-item-toggle grid-c1-r2${
            settings.offsetEnabled ? " is-on" : ""
          }`}
          title="Subtract the pre-trigger baseline from every sample (offset correction)."
        >
          <span className="settings-item-name">
            Subtract initial voltage
            <br />
            (offset correction)
          </span>
          <ToggleSwitch
            checked={settings.offsetEnabled}
            onChange={(v) => update({ offsetEnabled: v })}
            title="Subtract the pre-trigger baseline from every sample"
          />
        </div>

        {/* Previous-waveform overlay: Boolean-toggle card. */}
        <div
          className={`settings-item-card settings-item-toggle grid-c2-r2${
            settings.overlayPrevEnabled ? " is-on" : ""
          }`}
          title="Draw the last confirmed file's traces faded behind the current ones."
        >
          <span className="settings-item-name">Overlay previous waveform</span>
          <ToggleSwitch
            checked={settings.overlayPrevEnabled}
            onChange={(v) => update({ overlayPrevEnabled: v })}
            title="Draw the last confirmed file's traces faded behind the current ones"
          />
        </div>
      </section>

      {/* Feature toggles: one bordered line each with heading, toggle,
          and unit-suffixed inputs. The LPF card ends the stack; space
          below stays free for future HPF controls. */}
      <section className="settings-feature-stack">
        <div
          className={`settings-inline-card${
            settings.trimEnabled ? " is-on" : ""
          }`}
        >
          <h3 className="settings-inline-heading">Time trimming</h3>
          <ToggleSwitch
            checked={settings.trimEnabled}
            onChange={(v) => update({ trimEnabled: v })}
            title="Show only the range between trim start and end"
          />
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

        <div
          className={`settings-inline-card${
            settings.velocityEnabled ? " is-on" : ""
          }`}
        >
          <h3 className="settings-inline-heading">Wave velocity</h3>
          <ToggleSwitch
            checked={settings.velocityEnabled}
            onChange={(v) => update({ velocityEnabled: v })}
            title="Compute Start-to-Start (STS) / Peak-to-Peak (PTP) wave velocities"
          />
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
            title="Correction subtracted from the measured wave travel time before computing wave velocity."
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
        <div
          className={`settings-inline-card${
            settings.triggerAutoEnabled ? " is-on" : ""
          }`}
        >
          <h3 className="settings-inline-heading">Trigger auto-detection</h3>
          <ToggleSwitch
            checked={settings.triggerAutoEnabled}
            onChange={(v) => update({ triggerAutoEnabled: v })}
            title="Auto-pick Trigger Start point at the first threshold crossing and derive Peak point"
          />
          <label
            className="settings-inline-field"
            title="Voltage level the trigger waveform must cross to set the automatic Start point."
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
        <div
          className={`settings-inline-card${
            settings.ccEnabled ? " is-on" : ""
          }`}
        >
          <h3 className="settings-inline-heading">Receiver cross-correlation</h3>
          <ToggleSwitch
            checked={settings.ccEnabled}
            onChange={(v) => update({ ccEnabled: v })}
            title="Estimate Receiver Start point by cross-correlation with the last confirmed file, then derive Peak point"
          />
          <label
            className="settings-inline-field"
            title="Correlation window reach before the previous Receiver Start point."
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
            title="Correlation window reach after the previous Receiver Start point."
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
        <div
          className={`settings-inline-card${
            settings.lpfEnabled ? " is-on" : ""
          }`}
        >
          <h3 className="settings-inline-heading">Receiver LPF</h3>
          <ToggleSwitch
            checked={settings.lpfEnabled}
            onChange={(v) => update({ lpfEnabled: v })}
            title="Apply a zero-phase 4th-order Butterworth low-pass to the Receiver trace before picking"
          />
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
