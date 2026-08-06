import type { Notice } from "../types";

type Props = {
  notices: Notice[];
  /** Heading shown above the notification list. */
  title?: string;
  /** Optional class name applied to the panel root. */
  className?: string;
};

/**
 * In-app notification panel that replaces the Python reference's print()
 * statements. Renders a small, color-coded log of all events the user
 * would otherwise see only by watching the dev-tools console.
 */
export default function NotificationPanel({
  notices,
  title = "Notifications",
  className = "notification-panel",
}: Props) {
  // Newest first so the most recent event is immediately visible.
  const ordered = notices.slice().reverse();
  return (
    <section className={className}>
      <h3 className="notification-heading">{title}</h3>
      {ordered.length === 0 ? (
        <p className="notification-empty">No events yet.</p>
      ) : (
        <ul className="notification-list">
          {ordered.map((n) => (
            <li key={n.id} className={`notification-item notification-${n.kind}`}>
              {n.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}