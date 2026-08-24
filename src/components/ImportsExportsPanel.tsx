import React from "react";

type Props = {
  onSelectFiles: (files: File[]) => void;
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
 * Stand-alone frame that owns the file picker and export controls.
 * Pulled out of SettingsPanel so that Imports (file picker) and Exports
 * (results CSV download + PNG auto-save toggle) read as a single
 * import/export surface, with both columns sharing the same vertical
 * stack structure: h3 heading, then a full-width button, then the
 * remaining helper element. This symmetry puts Select or drop CSV
 * file(s) and Download results (CSV) on the same row in their columns
 * and makes the PNG auto-save toggle sit directly below Download
 * results (CSV) at the same width. Drag-and-drop is handled globally
 * on the window in App, so no dropzone lives here anymore.
 */
export default function ImportsExportsPanel({
  onSelectFiles,
  canExport,
  canExportPng,
  autoDownloadPng,
  onDownloadCsv,
  onToggleAutoDownloadPng,
}: Props) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <aside className="imports-exports-panel">
      <h2 className="imports-exports-title">Imports &amp; Exports</h2>
      <section className="imports-exports-grid">
        {/* Imports column: heading + file picker, stacked. */}
        <div className="imports-exports-stack">
          <h3 className="settings-section-heading">Imports</h3>
          {/* Hidden native file input triggered by the button click. */}
          <button
            type="button"
            className="file-button"
            onClick={() => fileInputRef.current?.click()}
          >
            Select or drop CSV file(s)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            multiple
            className="file-input-hidden"
            onChange={(e) => {
              const list = e.target.files;
              if (list && list.length > 0) {
                onSelectFiles(Array.from(list));
              }
              // Reset value so selecting the same file twice still fires.
              e.target.value = "";
            }}
          />
        </div>

        {/* Exports column: same stack shape, inlined so the two
            columns line up vertically and share button styling. */}
        <div className="imports-exports-stack">
          <h3 className="settings-section-heading">Exports</h3>
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
          <p className="export-hint">
            When PNG auto-save is ON, pressing Enter to confirm a file
            also saves the current chart as a PNG.
          </p>
        </div>
      </section>
    </aside>
  );
}