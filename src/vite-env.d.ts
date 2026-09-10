/// <reference types="vite/client" />

/**
 * TypeScript 5.6's lib.dom.d.ts does not expose the File System
 * Access API surface used by the export features. The output-folder
 * flow calls `showDirectoryPicker` and writes through the directory
 * handle; the CSV Save-As flow calls `showSaveFilePicker`. The
 * async `values()` iterator on `FileSystemDirectoryHandle` is also
 * missing. Adding the missing ambient declarations here keeps the
 * rest of the code strictly typed; the runtime still requires a
 * Chromium-based browser for any of these to be available.
 */
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
}

/**
 * `FileSystemHandle` in lib.dom.d.ts only carries `kind`, `name`,
 * and `isSameEntry()`. The permission helpers used by persistence
 * live on the same interface in the browser; adding them here keeps
 * the code strictly typed without pulling in a separate type lib.
 */
type FileSystemHandlePermissionDescriptor = {
  mode?: "read" | "readwrite";
};
type FileSystemPermissionState = "granted" | "prompt" | "denied";

interface FileSystemHandle {
  queryPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<FileSystemPermissionState>;
  requestPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<FileSystemPermissionState>;
}

interface Window {
  showDirectoryPicker(options?: {
    mode?: "read" | "readwrite";
    startIn?: FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
  }): Promise<FileSystemDirectoryHandle>;

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