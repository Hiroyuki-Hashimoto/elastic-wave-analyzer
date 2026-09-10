/// <reference types="vite/client" />

/**
 * TypeScript 5.6's lib.dom.d.ts does not expose `showSaveFilePicker`
 * on `Window`, which the CSV "Save As" flow uses to let the user pick
 * a filename + folder at download time without invoking the "Allow
 * this site" directory grant. Adding the missing ambient declaration
 * here keeps the rest of the code strictly typed; the runtime still
 * requires a Chromium-based browser.
 */
interface Window {
  showSaveFilePicker(options?: {
    suggestedName?: string;
    startIn?: FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
    excludeAcceptAllOption?: boolean;
  }): Promise<FileSystemFileHandle>;
}

/**
 * The legacy `webkitdirectory` / `directory` attributes on
 * `<input type="file">` are the only way to ask the OS for a folder
 * without triggering the FSA "Allow this site" prompt. They are not
 * in lib.dom.d.ts, so add the boolean attribute here. Setting them to
 * any truthy value (we use the empty string) is enough to flip the
 * file dialog into folder mode.
 */
interface HTMLInputElement {
  webkitdirectory: boolean;
  directory: boolean;
  webkitRelativePath: string;
}