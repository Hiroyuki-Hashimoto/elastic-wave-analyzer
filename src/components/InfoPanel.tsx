import { ZOOM_PERCENTAGES } from "../types";
import type { Notice } from "../types";
import NotificationPanel from "./NotificationPanel";

type Props = {
  /** Validation errors from CSV parsing plus the live trim error. */
  errors: string[];
  /** File name of the current queue entry, or null when nothing is loaded. */
  fileName: string | null;
  /** Number of results accumulated (confirmed + canceled) so far. */
  resultCount: number;
  /** Index into ZOOM_PERCENTAGES for the current zoom level. */
  zoomIndex: number;
  /** In-app event log (info / success / warning / error notices). */
  notices: Notice[];
};

/**
 * Read-only status frame that sits below the Settings panel. Holds
 * everything that is not a user-controlled setting: validation errors,
 * the merged-in Notifications log, the currently loaded file name,
 * the running result count, and the current zoom level. Keeping
 * these out of SettingsPanel makes the boundary between "things you
 * change" and "things you read" obvious.
 *
 * The whole panel is fixed-width and scrolls vertically so the merged
 * Errors + Notifications log stays manageable during long sessions.
 */
export default function InfoPanel({
  errors,
  fileName,
  resultCount,
  zoomIndex,
  notices,
}: Props) {
  return (
    <aside className="info-panel">
      <h2 className="info-title">Info</h2>

      <section className="info-section">
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

      <section className="info-section">
        {/* Merged-in Notifications log: reuses NotificationPanel so the
            success / info / warning / error color rules stay consistent
            with the previous stand-alone panel. */}
        <NotificationPanel notices={notices} title="Notifications" />
      </section>

      <section className="info-section">
        <p className="file-name-label">Loaded file</p>
        <p className="file-name">{fileName ?? "None"}</p>
        <p className="file-name-label">Results collected</p>
        <p className="file-name">{resultCount}</p>
      </section>

      <section className="info-section">
        <p className="zoom-label">
          Zoom:{" "}
          {Math.round((ZOOM_PERCENTAGES[zoomIndex] ?? 1) * 100)}% (press Z)
        </p>
      </section>
    </aside>
  );
}