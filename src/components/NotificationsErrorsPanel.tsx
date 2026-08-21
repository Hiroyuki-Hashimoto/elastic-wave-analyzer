import type { Notice, NoticeKind } from "../types";

type Props = {
  /** Validation errors from CSV parsing plus the live trim error. */
  errors: string[];
  /** In-app event log (info / success / warning / error notices). */
  notices: Notice[];
};

type EventRow = {
  id: number;
  kind: NoticeKind;
  text: string;
};

/**
 * Single read-only status frame that merges the validation error list
 * and the in-app notification log into one color-coded, reverse-
 * chronological list. Sits below the Settings panel; loaded file,
 * result count, and zoom info were deliberately removed because
 * they were display-only metadata that did not need a dedicated
 * section anymore.
 *
 * The panel is fixed-width (560px) and scrolls vertically so the
 * merged log stays manageable during long sessions.
 */
export default function NotificationsErrorsPanel({ errors, notices }: Props) {
  // Build a unified event list. Validation errors get a synthetic
  // negative id so they always sort to the bottom of the newest-first
  // ordering (notices have a monotonic positive counter from App).
  const errorRows: EventRow[] = errors.map((text, i) => ({
    id: -i,
    kind: "error",
    text,
  }));
  const merged: EventRow[] = [...notices, ...errorRows]
    .slice()
    .sort((a, b) => b.id - a.id);

  return (
    <aside className="notifications-errors-panel">
      <h2 className="notifications-errors-title">Notifications &amp; Errors</h2>
      <section className="notifications-errors-section">
        {merged.length === 0 ? (
          <p className="notifications-errors-empty">No events yet.</p>
        ) : (
          <ul className="notifications-errors-list">
            {merged.map((row) => (
              <li
                key={row.id}
                className={`notification-item notification-${row.kind}`}
              >
                {row.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}