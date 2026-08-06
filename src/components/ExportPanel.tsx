type Props = {
  /** True when at least one confirmed or canceled result is available. */
  canExport: boolean;
  /** True when a file is loaded and a chart is rendered. */
  canExportPng: boolean;
  /** True when auto-PNG-on-confirm is armed. */
  autoDownloadPng: boolean;
  onDownloadCsv: () => void;
  onToggleAutoDownloadPng: () => void;
};

/**
 * Action panel with two exports: a one-click CSV download (always
 * triggered by the button) and a toggle that arms automatic PNG saving
 * on every Enter-confirm. The PNG toggle is disabled until a file is
 * loaded because there is no chart to snapshot.
 */
export default function ExportPanel({
  canExport,
  canExportPng,
  autoDownloadPng,
  onDownloadCsv,
  onToggleAutoDownloadPng,
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
          className={`export-button export-toggle ${
            autoDownloadPng ? "export-toggle-on" : ""
          }`}
          onClick={onToggleAutoDownloadPng}
          disabled={!canExportPng}
          aria-pressed={autoDownloadPng}
        >
          {autoDownloadPng ? "PNG auto-save: ON" : "PNG auto-save: OFF"}
        </button>
      </div>
      <p className="export-hint">
        When PNG auto-save is ON, pressing Enter to confirm a file also
        saves the current chart as a PNG.
      </p>
    </section>
  );
}