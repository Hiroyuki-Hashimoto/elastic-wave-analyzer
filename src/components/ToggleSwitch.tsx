type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  title?: string;
  /**
   * When true, the switch is rendered as inert: the hidden checkbox
   * becomes :disabled, click/keyboard toggles are swallowed by the
   * label, and the track fades to a muted gray. Used by PNG auto-save
   * before any file is loaded so the toggle cannot arm ahead of the
   * chart it would snapshot.
   */
  disabled?: boolean;
};

/**
 * iOS-style toggle built on a hidden checkbox wrapped in a styled
 * label. Click, tap, and keyboard (space on focus) all toggle the
 * control through the native checkbox. The label gets .is-on when
 * `checked` is true, which drives the track fill and thumb slide
 * via shared .toggle-switch-* CSS (also used by the Allow-skip
 * toggle in the picker action bar).
 */
export default function ToggleSwitch({
  checked,
  onChange,
  title,
  disabled,
}: Props) {
  // The :disabled pseudo-class on the native checkbox stops keyboard
  // toggles, but some browsers still fire the wrapping label's click.
  // Swallow that here so the inert state is total.
  const stopIfDisabled = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (disabled) e.preventDefault();
  };
  return (
    <label
      className={`toggle-switch${checked ? " is-on" : ""}${
        disabled ? " is-disabled" : ""
      }`}
      title={title}
      onClick={stopIfDisabled}
      onKeyDown={stopIfDisabled}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="toggle-switch-input"
      />
      <span className="toggle-switch-track" aria-hidden="true">
        <span className="toggle-switch-thumb" />
      </span>
    </label>
  );
}
