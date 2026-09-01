import React from "react";
import ToggleSwitch from "./ToggleSwitch";

type Props = {
  onSelectFiles: (files: File[]) => void;
  /** True when at least one confirmed or canceled result is available. */
  canExport: boolean;
  /** True when a file is loaded and a chart is rendered. */
  canExportPng: boolean;
  /** True when auto-PNG-on-confirm is armed. */
  autoDownloadPng: boolean;
  onDownloadCsv: () => void;
  /**
   * Set the auto-PNG flag. Takes a boolean (matching ToggleSwitch's
   * controlled onChange) rather than a toggle, so the disabled state
   * can never accidentally arm the flag before a chart exists.
   */
  onSetAutoDownloadPng: (next: boolean) => void;
  /** One-line summary of the active import mapping (Auto-detect + ...). */
  importSummary: string;
  /** Open the import mapping editor for the saved/custom mapping. */
  onEditImportMapping: () => void;
};

/**
 * Stand-alone frame that owns the file picker and export controls.
 * Pulled out of SettingsPanel so that Imports (file picker) and Exports
 * (results CSV download + PNG auto-save toggle) read as a single
 * import/export surface, with both columns sharing the same vertical
 * stack structure: h3 heading, then a full-width button, then the
 * remaining helper element. This symmetry puts Select or drop CSV
 * file(s) and Download results (CSV) on the same row in their columns
 * and makes the PNG auto-save toggle row sit directly below Download
 * results (CSV) at the same width. Drag-and-drop is handled globally
 * on the window in App, so no dropzone lives here anymore.
 */
export default function ImportsExportsPanel({
  onSelectFiles,
  canExport,
  canExportPng,
  autoDownloadPng,
  onDownloadCsv,
  onSetAutoDownloadPng,
  importSummary,
  onEditImportMapping,
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
            Select or drop data file(s)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
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
          {/* Mapping summary + editor: shows the confirmed mapping and
              opens the mapping dialog at any time so a wrong choice can
              be fixed — edits apply to future loads (re-drop to reload
              already processed files). */}
          <div className="import-mapping-row">
            <span className="import-mapping-label">Mapping</span>
            <span className="import-mapping-text">{importSummary}</span>
            <button
              type="button"
              className="link-button"
              onClick={onEditImportMapping}
            >
              Import mapping…
            </button>
          </div>
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
          {/* PNG auto-save: matches the Settings Enable row shape
              (label + iOS-style toggle) so the same control surfaces
              across the panels. Disabled until a chart is loaded so
              the flag cannot arm ahead of the chart it would snapshot. */}
          <div className="export-toggle-row">
            <span className="export-toggle-label">PNG auto-save</span>
            <ToggleSwitch
              checked={autoDownloadPng}
              onChange={onSetAutoDownloadPng}
              disabled={!canExportPng}
              title="When ON, pressing Enter to confirm a file also saves the current chart as a PNG"
            />
          </div>
          <p className="export-hint">
            When PNG auto-save is ON, pressing Enter to confirm a file
            also saves the current chart as a PNG.
          </p>
        </div>
      </section>
    </aside>
  );
}
