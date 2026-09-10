import React from "react";
import ToggleSwitch from "./ToggleSwitch";

type Props = {
  onSelectFiles: (files: File[]) => void;
  /**
   * Hand the FileList from the webkitdirectory picker to App. The
   * filtering to .csv/.tsv/.txt and the confirmation dialog live in
   * App so the panel stays free of picker-specific state.
   */
  onSelectInputFolder: (files: File[], folderName: string) => void;
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
  onSelectInputFolder,
  canExport,
  canExportPng,
  autoDownloadPng,
  onDownloadCsv,
  onSetAutoDownloadPng,
  onEditImportMapping,
}: Props) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const folderInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <aside className="imports-exports-panel">
      <h2 className="imports-exports-title">Imports &amp; Exports</h2>
      <section className="imports-exports-grid">
        {/* Imports column: heading + two pickers + mapping editor link. */}
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
          {/* Folder picker: the hidden input has webkitdirectory so the
              OS file dialog selects a folder rather than individual
              files. Unlike the File System Access API path, this does
              not produce a per-origin "Allow this site to view and
              copy files?" prompt; the user just re-picks the folder
              every load. */}
          <button
            type="button"
            className="file-button"
            onClick={() => folderInputRef.current?.click()}
          >
            Select input folder
          </button>
          <input
            ref={folderInputRef}
            type="file"
            // webkitdirectory is the cross-browser attribute name;
            // modern Chrome also accepts `directory` but webkitdirectory
            // covers Firefox/Safari too. React's InputHTMLAttributes
            // does not declare them, so cast through `any` to keep the
            // runtime behavior while staying strict everywhere else.
            {...({
              webkitdirectory: "",
              directory: "",
            } as React.InputHTMLAttributes<HTMLInputElement>)}
            // accept is omitted so the OS dialog shows folders; some
            // platforms still filter by extension if accept is set.
            className="file-input-hidden"
            onChange={(e) => {
              const list = e.target.files;
              if (list && list.length > 0) {
                // webkitRelativePath has the form "<folder>/<file>";
                // the leading segment is the folder name the user picked.
                const folderName =
                  list[0].webkitRelativePath.split("/")[0] ||
                  "selected folder";
                onSelectInputFolder(Array.from(list), folderName);
              }
              // Reset value so picking the same folder twice still fires.
              e.target.value = "";
            }}
          />
          {/* Mapping editor: link only, since the saved-mapping
              summary was dropped to make room for the folder button.
              Clicking it still opens the full mapping dialog. */}
          <div className="import-mapping-row">
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
