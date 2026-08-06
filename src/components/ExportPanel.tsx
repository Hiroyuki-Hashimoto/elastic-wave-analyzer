type Props = {
  /** True when at least one confirmed or canceled result is available. */
  canExport: boolean;
  /** True when a file is loaded and a chart is rendered. */
  canExportPng: boolean;
  onDownloadCsv: () => void;
  onDownloadPng: () => void;
};

/**
 * Action panel that holds the export buttons. Buttons are disabled when
 * the action is not currently available, so the user is never offered
 * a non-functional control.
 */
export default function ExportPanel({
  canExport,
  canExportPng,
  onDownloadCsv,
  onDownloadPng,
}: Props) {
  return (
    <section className="export-panel">
      <h3 className="export-heading">Exports</h3>
      <div className="export-buttons">
        <button
          type="button"
          className="export-button"
          onClick={onDownloadCsv}
          disabled={!canExport}
        >
          Download results (CSV)
        </button>
        <button
          type="button"
          className="export-button"
          onClick={onDownloadPng}
          disabled={!canExportPng}
        >
          Save chart (PNG)
        </button>
      </div>
    </section>
  );
}