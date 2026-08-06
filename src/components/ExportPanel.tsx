type Props = {
  /** True when at least one confirmed or canceled result is available. */
  canExport: boolean;
  onDownloadCsv: () => void;
};

/**
 * Action panel that holds the export buttons. Buttons are disabled when
 * the action is not currently available, so the user is never offered
 * a non-functional control.
 */
export default function ExportPanel({ canExport, onDownloadCsv }: Props) {
  return (
    <section className="export-panel">
      <h3 className="export-heading">Exports</h3>
      <button
        type="button"
        className="export-button"
        onClick={onDownloadCsv}
        disabled={!canExport}
      >
        Download results (CSV)
      </button>
    </section>
  );
}