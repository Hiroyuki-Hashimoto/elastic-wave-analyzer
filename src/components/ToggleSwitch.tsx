type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  title?: string;
};

/**
 * iOS-style toggle built on a hidden checkbox wrapped in a styled
 * label. Click, tap, and keyboard (space on focus) all toggle the
 * control through the native checkbox. The label gets .is-on when
 * `checked` is true, which drives the track fill and thumb slide
 * via shared .toggle-switch-* CSS (also used by the Allow-skip
 * toggle in the picker action bar).
 */
export default function ToggleSwitch({ checked, onChange, title }: Props) {
  return (
    <label className={`toggle-switch${checked ? " is-on" : ""}`} title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="toggle-switch-input"
      />
      <span className="toggle-switch-track" aria-hidden="true">
        <span className="toggle-switch-thumb" />
      </span>
    </label>
  );
}
