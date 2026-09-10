import { useMemo, useState } from "react";
import { filterFilesByKeywords } from "../lib/importer";

/** Combine filter mode AND/OR with the dialog's controlled state. */
export type FilterMode = "AND" | "OR";

type Props = {
  /** Display name of the folder the user just picked (best-effort). */
  folderName: string;
  /** Every .csv/.tsv/.txt file the OS picker yielded, in OS order. */
  allFiles: File[];
  /** Hand the filtered list back to App for the regular load flow. */
  onLoad: (filteredFiles: File[]) => void;
  /** Drop the selection entirely without loading anything. */
  onCancel: () => void;
};

/**
 * Modal opened right after the user picks a folder with the native
 * `<input type="file" webkitdirectory>` picker. The dialog makes the
 * contents visible (otherwise the user only sees the folder name) and
 * lets them narrow the load down to a subset by typing comma-separated
 * keywords with an AND/OR toggle. Load hands the filtered File[] to
 * the existing queue pipeline; Cancel drops it.
 *
 * The filter is applied live so the user can iterate on keywords
 * before committing. Files excluded by the active filter are dimmed
 * in the list to keep the visible difference obvious.
 */
export default function InputFolderDialog({
  folderName,
  allFiles,
  onLoad,
  onCancel,
}: Props) {
  const [keywordsText, setKeywordsText] = useState("");
  const [mode, setMode] = useState<FilterMode>("AND");

  const filteredFiles = useMemo(
    () => filterFilesByKeywords(allFiles, keywordsText, mode),
    [allFiles, keywordsText, mode],
  );
  // Set of filenames that survive the filter, for the dim styling.
  const keptNames = useMemo(() => {
    const set = new Set<string>();
    for (const f of filteredFiles) set.add(f.name);
    return set;
  }, [filteredFiles]);

  const canLoad = filteredFiles.length > 0;
  const total = allFiles.length;
  const matched = filteredFiles.length;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="input-folder-dialog">
        <h2 className="input-folder-title">Files in {folderName}</h2>

        <p className="input-folder-subtitle">
          {total === 0
            ? "No .csv / .tsv / .txt files were found in this folder."
            : `${total} supported file(s) found. Adjust the filter to narrow the list before loading.`}
        </p>

        <div className="input-folder-filter-row">
          <label className="input-folder-field">
            <span className="field-label">Keywords</span>
            <input
              className="input-folder-keywords"
              type="text"
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder="15kHz, 20kHz"
              // Hint that commas separate multiple keywords.
              title="Comma-separated. Match is case-insensitive against the filename."
            />
          </label>
          <div className="input-folder-mode-toggle" role="radiogroup">
            <button
              type="button"
              className={`input-folder-mode-button${
                mode === "AND" ? " is-on" : ""
              }`}
              onClick={() => setMode("AND")}
              aria-pressed={mode === "AND"}
              title="All keywords must appear in the filename"
            >
              AND
            </button>
            <button
              type="button"
              className={`input-folder-mode-button${
                mode === "OR" ? " is-on" : ""
              }`}
              onClick={() => setMode("OR")}
              aria-pressed={mode === "OR"}
              title="Any one keyword is enough to keep the file"
            >
              OR
            </button>
          </div>
        </div>

        <p className="input-folder-counter">
          {matched} of {total} file{total === 1 ? "" : "s"} match
        </p>

        <ul className="input-folder-file-list">
          {allFiles.map((file, i) => {
            const kept = keptNames.has(file.name);
            return (
              <li
                key={`${file.name}-${i}`}
                className={`input-folder-file-item${
                  kept ? "" : " is-filtered-out"
                }`}
                title={file.name}
              >
                {file.name}
              </li>
            );
          })}
        </ul>

        <div className="input-folder-actions">
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="file-button"
            onClick={() => onLoad(filteredFiles)}
            disabled={!canLoad}
          >
            Load {matched} file{matched === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
